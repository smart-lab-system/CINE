import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { BackfillBlockedError, runBackfill } from '../src/database/master-data/backfill.runner';
import { seedTeacher } from './helpers/grading-seed';
import { freshTestYear, randomTag } from './helpers/master-data';
import { seedClass, seedEnrollment, seedExamSession } from './helpers/seed';

/**
 * Backfill trên dữ liệu ở HÌNH DẠNG CŨ (T-MIG-2, T-MIG-3 thu nhỏ). DB e2e dùng chung và không bao giờ được dọn, nên MỌI lần gọi đều có
 * `onlyClassIds` — backfill thật không có phạm vi, nhưng ở đây nó không được chạm lớp của suite khác.
 */
describe('master data backfill (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  const tag = randomTag(8);
  let year: number;
  let teacherId: string;
  const S = (i: number) => `BF${tag}${i}`; // MSSV: 2 + 8 + 1 = 11 ký tự

  const ids: Record<string, string> = {};
  const sessionIds: Record<string, string> = {};
  let options: Parameters<typeof runBackfill>[1];
  // Lớp/phiên CỐ Ý ở hình dạng cũ mà backfill không được xử lý (ngoài phạm vi, hoặc dừng) — phải dọn khi xong: một lớp còn `semester_id` NULL trong DB
  // e2e sẽ làm migration thu hẹp (Task 5) dừng ở tiền điều kiện khi áp nó lên DB test.
  const leftover = { sessions: [] as string[], classes: [] as string[] };

  async function count(sql: string, params: unknown[]): Promise<number> {
    const [row] = await ds.query(sql, params);
    return Number(row.n);
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    ds = app.get(DataSource);

    year = await freshTestYear(ds);
    teacherId = await seedTeacher(ds, `bf-${tag}`);

    // Ba lớp ở HÌNH DẠNG CŨ: có `name`, chưa có học kỳ, chưa có lớp danh nghĩa.
    const legacy = { teacherId, semesterId: null, administrativeClassId: null } as const;
    ids.A = (await seedClass(ds, { ...legacy, legacyName: `BF${tag}A` })).id;
    ids.M = (await seedClass(ds, { ...legacy, legacyName: `Hệ Quản Trị ${tag}` })).id; // lớp đặt theo tên môn — sẽ gộp vào A
    ids.N = (await seedClass(ds, { ...legacy, legacyName: `BF${tag}N` })).id; // không có phiên nào
    ids.V = (await seedClass(ds, { ...legacy, legacyName: `ZZ${tag}` })).id; // NGOÀI phạm vi: backfill không được chạm
    leftover.classes.push(ids.V);

    const enroll = (classId: string, i: number) =>
      seedEnrollment(ds, { classId, teacherId, mssv: S(i), legacyName: `Sinh viên ${S(i)}` });
    for (const i of [1, 2, 3]) await enroll(ids.A, i);
    for (const i of [2, 3]) await enroll(ids.M, i); // đã ở lớp A: bản trùng
    await enroll(ids.N, 4);

    const at = (day: number, hour: number) => new Date(2026, 8, day, hour);
    const session = (key: string, classId: string, over: { semesterName: string; roomName: string; day: number }) =>
      seedExamSession(ds, {
        classId, teacherId, status: 'completed', startTime: at(over.day, 8), endTime: at(over.day, 10),
        semesterName: over.semesterName, roomName: over.roomName, withoutRoom: true,
      }).then((s) => { sessionIds[key] = s.id; });
    await session('a1', ids.A, { semesterName: `HK1 ${year}-${year + 1}`, roomName: `Phòng ${tag} A1`, day: 1 });
    await session('a2', ids.A, { semesterName: `Học kỳ 1 ${year}-${year + 1}`, roomName: `Phòng  ${tag}  B1`, day: 2 }); // hai khoảng trắng
    await session('m1', ids.M, { semesterName: `Học kỳ 1 ${year}-${year + 1}`, roomName: `Phòng ${tag} A1`, day: 3 });
    await session('m2', ids.M, { semesterName: `TEST dien tap ${tag}`, roomName: `TEST-${tag}`, day: 4 });

    // Danh sách dự thi và bài nộp của các phiên lớp M — những thứ gộp lớp phải ghi lại (spec §8.3: 45 + 45 thu nhỏ thành 2 + 2).
    for (const i of [2, 3]) {
      await ds.query(
        `INSERT INTO examcollect.session_roster (exam_session_id, student_mssv, student_name, home_class_id, home_teacher_id)
         VALUES ($1, $2, $3, $4, $5)`,
        [sessionIds.m1, S(i), `Sinh viên ${S(i)}`, ids.M, teacherId],
      );
    }
    const [deliverable] = await ds.query(
      `INSERT INTO examcollect.required_deliverable (exam_session_id, required_filename, deliverable_type)
       VALUES ($1, 'Cau1.docx', 'document') RETURNING id`,
      [sessionIds.m1],
    );
    for (const i of [2, 3]) {
      await ds.query(
        `INSERT INTO examcollect.submission
           (exam_session_id, required_deliverable_id, student_mssv, student_name_input, home_class_id, home_teacher_id,
            storage_key, checksum, file_size, submitted_via, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 1, 'normal', 'received')`,
        [sessionIds.m1, deliverable.id, S(i), S(i), ids.M, teacherId, `k/${S(i)}`, 'a'.repeat(64)],
      );
    }

    options = {
      defaultSemester: { year, term: 1 },
      merges: [{ from: `Hệ Quản Trị ${tag}`, into: `BF${tag}A` }],
      inactiveRooms: [`TEST-${tag}`],
      onlyClassIds: [ids.A, ids.M, ids.N],
    };
  });

  afterAll(async () => {
    await ds.query(`DELETE FROM examcollect.exam_session WHERE id = ANY($1::uuid[])`, [leftover.sessions]);
    await ds.query(`DELETE FROM examcollect.class WHERE id = ANY($1::uuid[])`, [leftover.classes]);
    await app.close();
  });

  it('--dry-run làm hết rồi LÙI LẠI: báo cáo đầy đủ, DB nguyên vẹn', async () => {
    const report = await runBackfill(ds, options, { dryRun: true });
    expect(report.dryRun).toBe(true);
    expect(report.created.semesters).toBe(1);
    expect(report.merged).toHaveLength(1);
    expect(await count(`SELECT count(*) AS n FROM examcollect.class WHERE id = $1`, [ids.M])).toBe(1); // lớp M còn đó
    expect(await count(`SELECT count(*) AS n FROM examcollect.class WHERE id = $1 AND semester_id IS NULL`, [ids.A])).toBe(1);
    expect(await count(`SELECT count(*) AS n FROM examcollect.exam_session WHERE id = $1 AND room_id IS NULL`, [sessionIds.a1])).toBe(1);
  });

  it('T-MIG-3: gộp lớp ghi lại MỌI tham chiếu, xoá enrollment trùng, xoá lớp nguồn — và báo số dòng từng bảng', async () => {
    const report = await runBackfill(ds, options);

    expect(report.merged).toHaveLength(1);
    expect(report.merged[0]).toMatchObject({
      from: `Hệ Quản Trị ${tag}`,
      into: `BF${tag}A`,
      enrollmentsRemoved: 2,
      moved: { 'exam_session.class_id': 2, 'session_roster.home_class_id': 2, 'submission.home_class_id': 2 },
    });
    expect(await count(`SELECT count(*) AS n FROM examcollect.class WHERE id = $1`, [ids.M])).toBe(0);
    expect(await count(`SELECT count(*) AS n FROM examcollect.exam_session WHERE class_id = $1`, [ids.A])).toBe(4);
    expect(await count(`SELECT count(*) AS n FROM examcollect.session_roster WHERE home_class_id = $1`, [ids.A])).toBe(2);
    expect(await count(`SELECT count(*) AS n FROM examcollect.submission WHERE home_class_id = $1`, [ids.A])).toBe(2);
    expect(await count(`SELECT count(*) AS n FROM examcollect.enrollment WHERE home_class_id = $1`, [ids.A])).toBe(3); // S1..S3, không mất ai
  });

  it('ánh xạ đúng spec §8.2: học kỳ, mã danh nghĩa, phòng, chuỗi học kỳ, sinh viên', async () => {
    const [semester] = await ds.query(
      `SELECT start_date::text AS s, end_date::text AS e FROM examcollect.semester WHERE academic_year_start = $1 AND term = 1`,
      [year],
    );
    expect(semester).toEqual({ s: `${year}-09-01`, e: `${year + 1}-01-31` }); // ngày TẠM

    const classes = await ds.query(
      `SELECT c.id, ac.code::text AS code, sem.academic_year_start AS year
         FROM examcollect.class c
         JOIN examcollect.administrative_class ac ON ac.id = c.administrative_class_id
         JOIN examcollect.semester sem ON sem.id = c.semester_id
        WHERE c.id = ANY($1)`,
      [[ids.A, ids.N]],
    );
    expect(Object.fromEntries(classes.map((c: { id: string; code: string }) => [c.id, c.code]))).toEqual({
      [ids.A]: `BF${tag}A`,
      [ids.N]: `BF${tag}N`,
    });
    expect(classes.every((c: { year: number }) => c.year === year)).toBe(true); // N dùng kỳ mặc định

    const rooms = await ds.query(
      `SELECT r.name::text AS name, r.is_active AS active
         FROM examcollect.exam_session es JOIN examcollect.room r ON r.id = es.room_id
        WHERE es.id = ANY($1) ORDER BY es.id`,
      [Object.values(sessionIds)],
    );
    const byName = new Map<string, boolean>(rooms.map((r: { name: string; active: boolean }) => [r.name, r.active]));
    expect(byName.get(`Phòng ${tag} A1`)).toBe(true);
    expect(byName.get(`Phòng ${tag} B1`)).toBe(true); // hai khoảng trắng đã gộp
    expect(byName.get(`TEST-${tag}`)).toBe(false); // tạo ra NGỪNG hoạt động
    expect(rooms).toHaveLength(4); // m1 và a1 dùng chung một phòng, nhưng mỗi phiên một dòng

    const names = await ds.query(`SELECT id, semester_name FROM examcollect.exam_session WHERE id = ANY($1)`, [Object.values(sessionIds)]);
    const nameOf = Object.fromEntries(names.map((r: { id: string; semester_name: string }) => [r.id, r.semester_name]));
    expect(nameOf[sessionIds.a1]).toBe(`HK1 ${year}-${year + 1}`);
    expect(nameOf[sessionIds.a2]).toBe(`HK1 ${year}-${year + 1}`); // "Học kỳ 1 …" đã viết lại
    expect(nameOf[sessionIds.m2]).toBe(`TEST dien tap ${tag}`); // chuỗi TEST giữ nguyên

    const students = await ds.query(`SELECT mssv::text AS mssv, full_name FROM examcollect.student WHERE mssv::text = ANY($1) ORDER BY mssv`, [[1, 2, 3, 4].map(S)]);
    expect(students).toEqual([1, 2, 3, 4].map((i) => ({ mssv: S(i), full_name: `Sinh viên ${S(i)}` })));
  });

  it('Review Focus 2: phạm vi — lớp ngoài `onlyClassIds` không bị chạm', async () => {
    expect(await count(`SELECT count(*) AS n FROM examcollect.class WHERE id = $1 AND semester_id IS NULL AND administrative_class_id IS NULL`, [ids.V])).toBe(1);
  });

  it('T-MIG-2: chạy lại KHÔNG đổi gì (kể cả khi lệnh gộp vẫn còn trong tham số) và báo hoàn tất', async () => {
    const report = await runBackfill(ds, options);
    expect(report.created).toEqual({ semesters: 0, administrativeClasses: 0, rooms: 0, students: 0 });
    expect(report.merged).toEqual([]);
    expect(report.assigned).toEqual({ classSemester: 0, classAdministrativeClass: 0, sessionRoom: 0, sessionSemesterName: 0 });
    expect(report.remaining).toEqual({ classesWithoutSemester: 0, classesWithoutAdministrativeClass: 0, sessionsWithoutRoom: 0, enrollmentsWithoutStudent: 0 });
    expect(report.complete).toBe(true);
  });

  it('Review Focus 1: dữ liệu không ánh xạ được → DỪNG với danh sách vấn đề, và DB nguyên vẹn', async () => {
    const odd = (await seedClass(ds, { teacherId, semesterId: null, administrativeClassId: null, legacyName: `Không hợp lệ ${tag}` })).id;
    const stray = await seedExamSession(ds, {
      classId: odd, teacherId, status: 'completed', startTime: new Date(2026, 8, 10, 8), endTime: new Date(2026, 8, 10, 10), withoutRoom: true,
    });

    leftover.classes.push(odd);
    leftover.sessions.push(stray.id);

    const failure = await runBackfill(ds, { onlyClassIds: [odd] }).then(
      () => null,
      (error: unknown) => error,
    );

    expect(failure).toBeInstanceOf(BackfillBlockedError);
    const codes = (failure as BackfillBlockedError).problems.map((p) => p.code).sort();
    expect(codes).toEqual(['CLASS_CODE_UNMAPPABLE', 'CLASS_SEMESTER_UNKNOWN']);
    expect(await count(`SELECT count(*) AS n FROM examcollect.class WHERE id = $1 AND semester_id IS NULL`, [odd])).toBe(1);
    expect(await count(`SELECT count(*) AS n FROM examcollect.exam_session WHERE id = $1 AND room_id IS NULL`, [stray.id])).toBe(1);
  });
});
