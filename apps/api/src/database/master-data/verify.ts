import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { contractProblems, countContractBlockers } from './contract-preconditions';

export interface DbSnapshot {
  takenAt: string;
  /** Số dòng mọi bảng cơ sở trong schema `examcollect`. */
  tables: Record<string, number>;
  checksums: Record<string, string>;
}

const IDENTIFIER = /^[a-z_][a-z0-9_]*$/;
/** Đổi theo bản chất của việc chạy migration, không phải dữ liệu nghiệp vụ. */
const IGNORED_TABLES = new Set(['migrations']);
/** Bảng điểm: mở rộng, backfill và thu hẹp KHÔNG được đụng một byte (spec §8.5 mục 2, T-GR-2). */
const CHECKSUM_TABLES = ['grading_result', 'score_computation'];

export async function takeSnapshot(ds: DataSource): Promise<DbSnapshot> {
  const tables: Record<string, number> = {};
  const rows: Array<{ table_name: string }> = await ds.query(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'examcollect' AND table_type = 'BASE TABLE' ORDER BY table_name`,
  );
  for (const { table_name: name } of rows) {
    if (!IDENTIFIER.test(name)) throw new Error(`Tên bảng lạ: "${name}"`);
    const [row] = await ds.query(`SELECT count(*)::int AS n FROM examcollect."${name}"`);
    tables[name] = row.n;
  }
  const checksums: Record<string, string> = {};
  for (const name of CHECKSUM_TABLES) {
    if (!(name in tables)) continue;
    // `t::text` là chuỗi của CẢ hàng (mọi cột, theo thứ tự cột): bất kỳ byte nào của bất kỳ hàng nào đổi thì md5 đổi.
    const [row] = await ds.query(`SELECT md5(coalesce(string_agg(t::text, '|' ORDER BY t.id), '')) AS sum FROM examcollect."${name}" t`);
    checksums[name] = row.sum;
  }
  return { takenAt: new Date().toISOString(), tables, checksums };
}

export interface SnapshotComparison {
  ok: boolean;
  /** Các dòng đáng đọc (bảng đổi hoặc được mong đợi đổi). */
  lines: string[];
  problems: string[];
}

/**
 * So hai bản chụp. Mọi bảng phải đổi ĐÚNG mức mong đợi (mặc định 0 — một bảng không được khai là không được đổi), bảng mới coi như 0 dòng ở bản "trước",
 * và checksum điểm phải GIỐNG HỆT. Một bảng đổi ngoài mong đợi là lỗi, kể cả khi nó "nhỏ".
 */
export function compareSnapshots(before: DbSnapshot, after: DbSnapshot, expectedDelta: Record<string, number> = {}): SnapshotComparison {
  const lines: string[] = [];
  const problems: string[] = [];
  const names = [...new Set([...Object.keys(before.tables), ...Object.keys(after.tables), ...Object.keys(expectedDelta)])]
    .filter((name) => !IGNORED_TABLES.has(name))
    .sort();
  for (const name of names) {
    const was = before.tables[name] ?? 0;
    const now = after.tables[name] ?? 0;
    const delta = now - was;
    const expected = expectedDelta[name] ?? 0;
    if (delta !== 0 || expected !== 0) {
      const signed = (n: number) => (n > 0 ? `+${n}` : String(n));
      lines.push(`${name}: ${was} → ${now} (${signed(delta)}, mong đợi ${signed(expected)}) ${delta === expected ? 'ok' : 'LỆCH'}`);
    }
    if (delta !== expected) problems.push(`${name}: đổi ${delta}, mong đợi ${expected}`);
  }
  for (const [name, sum] of Object.entries(before.checksums)) {
    const other = after.checksums[name];
    if (other !== sum) problems.push(`checksum ${name} KHÁC: ${sum} → ${other ?? '(không có)'}`);
  }
  return { ok: problems.length === 0, lines, problems };
}

/** Những thứ phải đúng khi dữ liệu đã ở hình dạng đích: bốn con số của tiền điều kiện thu hẹp, và mọi lớp đều có nhãn. */
export async function checkInvariants(ds: DataSource): Promise<string[]> {
  const problems = contractProblems(await countContractBlockers(ds));
  const [missingLabel] = await ds.query(
    `SELECT count(*)::int AS n FROM examcollect.class c
       LEFT JOIN examcollect.class_label l ON l.class_id = c.id WHERE l.label IS NULL`,
  );
  if (missingLabel.n > 0) problems.push(`${missingLabel.n} lớp không có nhãn trong view class_label.`);
  return problems;
}

/**
 * Spec §8.5 mục 4: "chèn thử hai phiên chưa kết thúc trùng phòng thì bị chặn theo `room_id`". Làm trong một transaction LUÔN lùi lại, nên không để lại gì.
 * Cần hai lớp của hai giảng viên KHÁC NHAU — nếu cùng lớp hay cùng giảng viên thì ràng buộc chống trùng lớp / giãn cách 30 phút có thể nổ trước và phép thử không
 * nói gì về phòng; chỉ chấp nhận khi chính ràng buộc `ex_exam_session_room_overlap` từ chối (23P01).
 */
export async function proveRoomExclusion(ds: DataSource): Promise<{ status: 'blocked' | 'skipped' | 'FAILED'; detail: string }> {
  const qr = ds.createQueryRunner();
  await qr.connect();
  await qr.startTransaction();
  try {
    const classes: Array<{ id: string; teacher_id: string }> = await qr.query(
      `SELECT id, teacher_id FROM examcollect.class ORDER BY id`,
    );
    const first = classes[0];
    const second = classes.find((c) => c.teacher_id !== first?.teacher_id);
    const [room] = await qr.query(`SELECT id, name::text AS name FROM examcollect.room ORDER BY name LIMIT 1`);
    if (!first || !second || !room) {
      return { status: 'skipped', detail: 'Cần ít nhất hai lớp của hai giảng viên khác nhau và một phòng để chứng minh.' };
    }
    const insert = (classId: string, teacherId: string, start: string, end: string) =>
      qr.query(
        `INSERT INTO examcollect.exam_session
           (name, code, class_id, teacher_id, exam_type, start_time, end_time, status, semester_name, course_name, room_name, room_id)
         VALUES ($1, $2, $3, $4, 'TK', $5, $6, 'active', 'HK kiểm thử', 'CTDL&GT', $7, $8)`,
        [`Chứng minh ${randomUUID().slice(0, 8)}`, `P${randomUUID().slice(0, 8)}`, classId, teacherId, start, end, room.name, room.id],
      );
    await insert(first.id, first.teacher_id, '2999-01-01T08:00:00Z', '2999-01-01T10:00:00Z');
    try {
      await insert(second.id, second.teacher_id, '2999-01-01T09:00:00Z', '2999-01-01T11:00:00Z');
    } catch (error) {
      // TypeORM bọc lỗi của driver; lấy `driverError` nếu có để đọc đúng `code`/`constraint` của Postgres.
      const failure = ((error as { driverError?: unknown }).driverError ?? error) as { code?: string; constraint?: string; message?: string };
      return failure.code === '23P01' && failure.constraint === 'ex_exam_session_room_overlap'
        ? { status: 'blocked', detail: `Phòng ${room.name}: phiên thứ hai bị chặn theo room_id (ex_exam_session_room_overlap).` }
        : { status: 'FAILED', detail: `Bị từ chối nhưng không phải vì phòng: ${failure.code} ${failure.constraint ?? ''} ${failure.message ?? ''}` };
    }
    return { status: 'FAILED', detail: 'Hai phiên chưa kết thúc cùng phòng, giờ chồng nhau mà KHÔNG bị chặn.' };
  } finally {
    await qr.rollbackTransaction();
    await qr.release();
  }
}
