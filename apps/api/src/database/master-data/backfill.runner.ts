import { DataSource, QueryRunner } from 'typeorm';
import { planBackfill } from './backfill.plan';
import type { BackfillOptions, BackfillPlan, BackfillProblem, LegacySnapshot } from './backfill.types';
import { countContractBlockers, type ContractCounts } from './contract-preconditions';
import { defaultSemesterDates } from './semester-name';

export class BackfillBlockedError extends Error {
  constructor(readonly problems: BackfillProblem[]) {
    super(
      `Backfill DỪNG: ${problems.length} điều không ánh xạ được, KHÔNG đoán và KHÔNG ghi gì.\n` +
        problems.map((p) => `  - [${p.code}] ${p.message}`).join('\n'),
    );
    this.name = 'BackfillBlockedError';
  }
}

export interface BackfillReport {
  dryRun: boolean;
  created: { semesters: number; administrativeClasses: number; rooms: number; students: number };
  merged: Array<{ from: string; into: string; moved: Record<string, number>; enrollmentsRemoved: number }>;
  assigned: { classSemester: number; classAdministrativeClass: number; sessionRoom: number; sessionSemesterName: number };
  remaining: ContractCounts;
  /** `remaining` toàn 0: migration thu hẹp được phép chạy. */
  complete: boolean;
}

const IDENTIFIER = /^[a-z_][a-z0-9_]*$/;
/** Tên bảng/cột đến từ catalog Postgres, không phải từ người dùng — vẫn kiểm trước khi nối vào câu lệnh. */
function ident(name: string): string {
  if (!IDENTIFIER.test(name)) throw new Error(`Tên định danh lạ: "${name}"`);
  return `"${name}"`;
}

/** Số dòng bị ảnh hưởng: `affected` cho UPDATE/DELETE, số dòng RETURNING cho INSERT (kết quả có cấu trúc của TypeORM). */
async function affected(qr: QueryRunner, sql: string, params: unknown[] = []): Promise<number> {
  const result = await qr.query(sql, params, true);
  return result.affected ?? result.records.length;
}

async function readSnapshot(qr: QueryRunner): Promise<LegacySnapshot> {
  // TUẦN TỰ: một QueryRunner là MỘT kết nối; chạy bảy truy vấn song song trên nó làm `pg` báo "Calling client.query() when the client is already
  // executing a query" (deprecated, sẽ bị bỏ ở pg@9) — thấy khi diễn tập cutover trên bản sao.
  const read = (sql: string) => qr.query(sql);
  const classes = await read(
    `SELECT id, teacher_id AS "teacherId", name, semester_id AS "semesterId",
            administrative_class_id AS "administrativeClassId", group_name AS "groupName"
       FROM examcollect.class`,
  );
  const sessions = await read(
    `SELECT id, class_id AS "classId", semester_name AS "semesterName", room_name AS "roomName", room_id AS "roomId"
       FROM examcollect.exam_session`,
  );
  const enrollments = await read(
    `SELECT home_class_id AS "homeClassId", student_mssv::text AS "studentMssv", student_name AS "studentName"
       FROM examcollect.enrollment`,
  );
  const semesters = await read(`SELECT id, academic_year_start AS "academicYearStart", term FROM examcollect.semester`);
  const rooms = await read(`SELECT id, name::text AS name FROM examcollect.room`);
  const administrativeClasses = await read(`SELECT id, code::text AS code FROM examcollect.administrative_class`);
  const students = await read(`SELECT mssv::text AS mssv FROM examcollect.student`);
  return { classes, sessions, enrollments, semesters, rooms, administrativeClasses, students };
}

/**
 * Mọi cột đang trỏ tới `class(id)`: từ catalog (khoá ngoại), cộng ba cột đã biết mà spec §8.3 nêu — nếu một môi trường nào đó có chúng mà không phải khoá
 * ngoại thì vẫn phải được ghi lại. `enrollment` đi riêng (xoá bản trùng, không ghi lại). Khoá ngoại GHÉP thì dừng: backfill không biết cách gộp.
 */
async function classReferences(qr: QueryRunner): Promise<Array<{ table: string; column: string }>> {
  const foreignKeys: Array<{ table: string; column: string; width: number }> = await qr.query(
    `SELECT t.relname AS "table", a.attname AS "column", array_length(c.conkey, 1) AS width
       FROM pg_constraint c
       JOIN pg_class t ON t.oid = c.conrelid
       JOIN pg_namespace n ON n.oid = t.relnamespace AND n.nspname = 'examcollect'
       JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
      WHERE c.contype = 'f' AND c.confrelid = 'examcollect.class'::regclass`,
  );
  const composite = foreignKeys.filter((fk) => fk.width > 1);
  if (composite.length > 0) {
    throw new Error(`Khoá ngoại ghép trỏ tới class (${composite.map((fk) => fk.table).join(', ')}) — backfill không biết cách gộp.`);
  }
  const found = new Map(foreignKeys.map((fk) => [`${fk.table}.${fk.column}`, { table: fk.table, column: fk.column }]));
  for (const [table, column] of [['exam_session', 'class_id'], ['session_roster', 'home_class_id'], ['submission', 'home_class_id']]) {
    const [exists] = await qr.query(
      `SELECT 1 FROM information_schema.columns WHERE table_schema = 'examcollect' AND table_name = $1 AND column_name = $2`,
      [table, column],
    );
    if (exists) found.set(`${table}.${column}`, { table, column });
  }
  return [...found.values()].filter((ref) => ref.table !== 'enrollment').sort((a, b) => `${a.table}.${a.column}`.localeCompare(`${b.table}.${b.column}`));
}

async function applyMerge(qr: QueryRunner, merge: BackfillPlan['merges'][number]): Promise<BackfillReport['merged'][number]> {
  const moved: Record<string, number> = {};
  for (const { table, column } of await classReferences(qr)) {
    moved[`${table}.${column}`] = await affected(
      qr,
      `UPDATE examcollect.${ident(table)} SET ${ident(column)} = $1 WHERE ${ident(column)} = $2`,
      [merge.intoId, merge.fromId],
    );
  }
  // Mọi MSSV của lớp nguồn đã có ở lớp đích (planBackfill kiểm), nên xoá là xoá BẢN TRÙNG, không mất ai.
  const enrollmentsRemoved = await affected(qr, `DELETE FROM examcollect.enrollment WHERE home_class_id = $1`, [merge.fromId]);
  // Khoá ngoại RESTRICT là chốt cuối: còn một tham chiếu sót thì câu này nổ và cả transaction lùi lại.
  await affected(qr, `DELETE FROM examcollect.class WHERE id = $1`, [merge.fromId]);
  return { from: merge.fromName, into: merge.intoName, moved, enrollmentsRemoved };
}

async function applyPlan(qr: QueryRunner, plan: BackfillPlan): Promise<Omit<BackfillReport, 'dryRun' | 'remaining' | 'complete'>> {
  const merged: BackfillReport['merged'] = [];
  for (const merge of plan.merges) merged.push(await applyMerge(qr, merge));

  let semesters = 0;
  for (const { year, term } of plan.semesters) {
    const { startDate, endDate } = defaultSemesterDates(year, term);
    semesters += await affected(
      qr,
      `INSERT INTO examcollect.semester (academic_year_start, term, start_date, end_date)
       VALUES ($1, $2, $3, $4) ON CONFLICT (academic_year_start, term) DO NOTHING RETURNING id`,
      [year, term, startDate, endDate],
    );
  }
  let administrativeClasses = 0;
  for (const code of plan.administrativeClasses) {
    administrativeClasses += await affected(
      qr,
      `INSERT INTO examcollect.administrative_class (code) VALUES ($1) ON CONFLICT (code) DO NOTHING RETURNING id`,
      [code],
    );
  }
  let rooms = 0;
  for (const room of plan.rooms) {
    rooms += await affected(
      qr,
      `INSERT INTO examcollect.room (name, is_active) VALUES ($1, $2) ON CONFLICT (name) DO NOTHING RETURNING id`,
      [room.name, room.isActive],
    );
  }
  const students = plan.students.length === 0
    ? 0
    : await affected(
        qr,
        `INSERT INTO examcollect.student (mssv, full_name)
         SELECT m, n FROM unnest($1::text[], $2::text[]) AS t(m, n)
         ON CONFLICT (mssv) DO NOTHING RETURNING id`,
        [plan.students.map((s) => s.mssv), plan.students.map((s) => s.fullName)],
      );

  // `IS NULL` ở mọi câu: gán lần đầu (NULL → giá trị) là việc trigger `trg_class_semester_guard` cho phép; chạy lại không đổi gì.
  let classSemester = 0;
  let classAdministrativeClass = 0;
  for (const assignment of plan.classAssignments) {
    if (assignment.semester) {
      classSemester += await affected(
        qr,
        `UPDATE examcollect.class c SET semester_id = s.id
           FROM examcollect.semester s
          WHERE c.id = $1 AND c.semester_id IS NULL AND s.academic_year_start = $2 AND s.term = $3`,
        [assignment.classId, assignment.semester.year, assignment.semester.term],
      );
    }
    if (assignment.code) {
      classAdministrativeClass += await affected(
        qr,
        `UPDATE examcollect.class c SET administrative_class_id = a.id
           FROM examcollect.administrative_class a
          WHERE c.id = $1 AND c.administrative_class_id IS NULL AND a.code = $2`,
        [assignment.classId, assignment.code],
      );
    }
  }
  let sessionRoom = 0;
  for (const assignment of plan.roomAssignments) {
    sessionRoom += await affected(
      qr,
      `UPDATE examcollect.exam_session es SET room_id = r.id
         FROM examcollect.room r
        WHERE es.id = ANY($1::uuid[]) AND es.room_id IS NULL AND r.name = $2`,
      [assignment.sessionIds, assignment.name],
    );
  }
  const sessionSemesterName = plan.semesterNameRewrites.length === 0
    ? 0
    : await affected(
        qr,
        `UPDATE examcollect.exam_session es SET semester_name = v.label
           FROM (SELECT unnest($1::uuid[]) AS id, unnest($2::text[]) AS label) v
          WHERE es.id = v.id AND es.semester_name <> v.label`,
        [plan.semesterNameRewrites.map((r) => r.sessionId), plan.semesterNameRewrites.map((r) => r.label)],
      );

  return {
    created: { semesters, administrativeClasses, rooms, students },
    merged,
    assigned: { classSemester, classAdministrativeClass, sessionRoom, sessionSemesterName },
  };
}

/**
 * Backfill (spec §8.2–8.4 bước 2 và 4): đọc ảnh chụp dữ liệu cũ, lập kế hoạch, và — chỉ khi không có điều gì không ánh xạ được — áp nó trong MỘT
 * transaction. Ném `BackfillBlockedError` TRƯỚC khi ghi bất cứ gì khi có vấn đề; ném lỗi DB (và lùi cả transaction) khi một ràng buộc từ chối.
 *
 * Hai khoá: `pg_advisory_xact_lock` (hai lần chạy cùng lúc không đạp nhau) và `LOCK TABLE … SHARE ROW EXCLUSIVE` trên ba bảng nguồn (không có phiên mới chen
 * vào giữa lúc đọc ảnh chụp và lúc ghi; đọc vẫn chạy). Chạy vài giây.
 */
export async function runBackfill(
  ds: DataSource,
  options: BackfillOptions = {},
  run: { dryRun?: boolean } = {},
): Promise<BackfillReport> {
  const dryRun = run.dryRun === true;
  const qr = ds.createQueryRunner();
  await qr.connect();
  await qr.startTransaction();
  try {
    await qr.query(`SELECT pg_advisory_xact_lock(hashtext('master-data-backfill'))`);
    await qr.query(`LOCK TABLE examcollect.class, examcollect.exam_session, examcollect.enrollment IN SHARE ROW EXCLUSIVE MODE`);

    const { plan, problems } = planBackfill(await readSnapshot(qr), options);
    if (problems.length > 0) throw new BackfillBlockedError(problems);

    const applied = await applyPlan(qr, plan);
    const remaining = await countContractBlockers(qr, options.onlyClassIds);
    const report: BackfillReport = {
      dryRun,
      ...applied,
      remaining,
      complete: Object.values(remaining).every((n) => n === 0),
    };

    if (dryRun) await qr.rollbackTransaction();
    else await qr.commitTransaction();
    return report;
  } catch (error) {
    if (qr.isTransactionActive) await qr.rollbackTransaction();
    throw error;
  } finally {
    await qr.release();
  }
}
