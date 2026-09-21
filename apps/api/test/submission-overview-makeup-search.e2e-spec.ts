import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';
import { createTestAccount } from './helpers/create-account';

/**
 * Hai lỗ của "Quản lý bài thu", cùng một nguồn dữ liệu (universe = roster ∪
 * người đã nộp), nên cùng một spec.
 *
 * 1. Sinh viên thi bù ở phiên khác bị đếm là "vắng thi" ở phiên gốc. Họ vẫn
 *    nằm trong roster phiên gốc, không có event, không có bài — rơi thẳng vào
 *    never_attended. Báo động giả, và sai cả bản chất.
 *
 * 2. Search sinh viên chỉ tìm được người ĐÃ NỘP ít nhất một file, vì nó query
 *    bảng submission. Sinh viên chưa nộp gì thì vô hình — mà đó đúng là nhóm
 *    giảng viên đi tra. Điểm mù này từng được thừa nhận thẳng trong empty
 *    state của trang.
 */
describe('Submission overview — thi bù ở phiên khác + search theo sinh viên (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let schema: string;

  const stamp = Date.now();
  let token: string;
  let teacherId: string;
  let courseName: string;
  let otherCourseName: string;
  let classN01: string;
  let classN02: string;
  let roomName: string;

  // N01 là lớp "gốc" đang xét; N02 là lớp mà sinh viên thi bù ngồi nhờ.
  const HOME = `MK${stamp}H`.slice(0, 20);
  const STAYER = `MK${stamp}S`.slice(0, 20);
  const GUEST = `MK${stamp}G`.slice(0, 20);

  let sessionIndex = 0;
  /** Xem submission-overview-attendance.e2e-spec.ts: ba luật cùng bó khung giờ. */
  function nextWindow() {
    // Bước 50 phút, không phải 20: phiên dài 15 phút nên bước 20 để lại khe
    // 5 phút, và `ex_exam_session_teacher_gap` (migration 1789350000000) đòi
    // >= 30 phút giữa hai phiên của CÙNG giảng viên. Mọi phiên ở đây do một
    // giảng viên tạo, nên bước cũ làm cả file này đỏ.
    const offsetMs = (5 + 50 * sessionIndex) * 60_000;
    sessionIndex += 1;
    const start = Date.now() + offsetMs;
    return {
      startTime: new Date(start).toISOString(),
      endTime: new Date(start + 15 * 60_000).toISOString(),
    };
  }

  async function createSession(opts: {
    name: string;
    classId: string;
    examType?: 'TK' | 'GK' | 'CK';
  }) {
    const res = await request(app.getHttpServer())
      .post('/exam-sessions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: opts.name,
        classId: opts.classId,
        roomName,
        semesterName: 'HK kiểm thử',
        examType: opts.examType ?? 'TK',
        ...nextWindow(),
        requiredFilenames: ['Cau1.docx'],
      });
    expect(res.status).toBe(201);
    return {
      id: res.body.id as string,
      deliverableIds: (res.body.requiredDeliverables as { id: string }[]).map((d) => d.id),
    };
  }

  async function connect(sessionId: string, mssv: string) {
    await dataSource.query(
      `INSERT INTO ${schema}.agent_connection_event (exam_session_id, student_mssv, event_type)
       VALUES ($1, $2, 'connected')`,
      [sessionId, mssv],
    );
  }

  /** Trigger validate_submission_lifecycle cấm INSERT thẳng 'collected'. */
  async function collect(
    sessionId: string,
    deliverableId: string,
    mssv: string,
    homeClassId: string,
  ) {
    const [row] = await dataSource.query(
      `INSERT INTO ${schema}.submission
         (exam_session_id, required_deliverable_id, student_mssv, student_name_input,
          home_class_id, home_teacher_id, status)
       VALUES ($1,$2,$3,$4,$5,$6,'received') RETURNING id`,
      [sessionId, deliverableId, mssv, `SV ${mssv}`, homeClassId, teacherId],
    );
    await dataSource.query(`UPDATE ${schema}.submission SET status='validated' WHERE id=$1`, [
      row.id,
    ]);
    await dataSource.query(`UPDATE ${schema}.submission SET status='collected' WHERE id=$1`, [
      row.id,
    ]);
  }

  async function overview(student?: string) {
    const req = request(app.getHttpServer())
      .get('/submissions/overview')
      .set('Authorization', `Bearer ${token}`);
    const res = await (student === undefined ? req : req.query({ student }));
    expect(res.status).toBe(200);
    return res.body.items as Record<string, unknown>[];
  }

  async function one(sessionId: string, student?: string) {
    const found = (await overview(student)).find((i) => i.id === sessionId);
    if (!found) throw new Error(`session ${sessionId} missing from overview`);
    return found as Record<string, number | string | null>;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new PostgresExceptionFilter());
    await app.init();
    dataSource = app.get(DataSource);
    schema = (dataSource.options as { schema?: string }).schema ?? 'examcollect';

    const email = `makeup_${stamp}@example.com`;
    teacherId = await createTestAccount(dataSource, {
      email,
      password: 'correct-horse-battery',
      role: 'teacher',
    });
    token = (
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password: 'correct-horse-battery' })
    ).body.accessToken;

    const course = { name: 'Makeup Course' };
    courseName = course.name;
    const otherCourse = { name: 'Unrelated Course' };
    otherCourseName = otherCourse.name;
    const room = { name: `Makeup Room ${stamp}` };
    roomName = room.name;

    const [n01] = await dataSource.query(
      `INSERT INTO ${schema}.class (course_name, name, teacher_id) VALUES ($1, 'N01', $2) RETURNING id`,
      [courseName, teacherId],
    );
    classN01 = n01.id;
    const [n02] = await dataSource.query(
      `INSERT INTO ${schema}.class (course_name, name, teacher_id) VALUES ($1, 'N02', $2) RETURNING id`,
      [courseName, teacherId],
    );
    classN02 = n02.id;

    // HOME + STAYER thuộc N01; GUEST thuộc N02 (không liên quan tới roster N01).
    for (const [mssv, klass, name] of [
      [HOME, classN01, 'Trần Thi Bù'],
      [STAYER, classN01, 'Lê Ở Lại'],
      [GUEST, classN02, 'Phạm Khách'],
    ] as const) {
      await dataSource.query(
        `INSERT INTO ${schema}.enrollment
           (student_mssv, student_name, home_class_id, home_teacher_id)
         VALUES ($1,$2,$3,$4)`,
        [mssv, name, klass, teacherId],
      );
    }
  }, 60_000);

  afterAll(async () => {
    await app.close();
  });

  describe('thi bù ở phiên khác', () => {
    it('tách khỏi "vắng thi" khi sinh viên có mặt ở phiên khác cùng môn cùng loại', async () => {
      const home = await createSession({ name: `Home ${stamp}`, classId: classN01 });
      const elsewhere = await createSession({ name: `Elsewhere ${stamp}`, classId: classN02 });

      // HOME ngồi nhờ phiên của N02 và nộp bài ở đó.
      await connect(elsewhere.id, HOME);
      await collect(elsewhere.id, elsewhere.deliverableIds[0], HOME, classN01);

      const item = await one(home.id);
      expect(item.satElsewhereCount).toBe(1);
      // STAYER vẫn là vắng thi thật — không bị gộp chung.
      expect(item.neverAttendedCount).toBe(1);
      expect(item.expectedCount).toBe(2);
    }, 30_000);

    it('bất biến: năm nhóm cộng lại vẫn bằng expectedCount', async () => {
      const home = await createSession({ name: `Invariant ${stamp}`, classId: classN01 });
      const elsewhere = await createSession({ name: `InvElsewhere ${stamp}`, classId: classN02 });
      await connect(elsewhere.id, HOME);

      const item = await one(home.id);
      expect(
        (item.fullySubmittedCount as number) +
          (item.partialCount as number) +
          (item.attendedNoSubmissionCount as number) +
          (item.satElsewhereCount as number) +
          (item.neverAttendedCount as number),
      ).toBe(item.expectedCount);
    }, 30_000);

    it('KHÔNG gắn cờ khi phiên kia là loại kỳ thi khác', async () => {
      // Dự giữa kỳ rồi bỏ cuối kỳ là bỏ thi, không phải thi bù. Nếu luật chỉ
      // so course_id thì ca này bị gắn nhầm và giảng viên thôi truy đúng
      // người đáng truy.
      const midterm = await createSession({
        name: `GK ${stamp}`,
        classId: classN02,
        examType: 'GK',
      });
      await connect(midterm.id, HOME);

      const final = await createSession({
        name: `CK ${stamp}`,
        classId: classN01,
        examType: 'CK',
      });

      const item = await one(final.id);
      expect(item.satElsewhereCount).toBe(0);
      expect(item.neverAttendedCount).toBe(2);
    }, 30_000);

    it('KHÔNG gắn cờ vì có mặt ở một MÔN khác', async () => {
      const [otherClass] = await dataSource.query(
        `INSERT INTO ${schema}.class (course_name, name, teacher_id) VALUES ($1, 'X01', $2) RETURNING id`,
        [otherCourseName, teacherId],
      );
      await dataSource.query(
        `INSERT INTO ${schema}.enrollment
           (student_mssv, student_name, home_class_id, home_teacher_id)
         VALUES ($1,$2,$3,$4)`,
        [STAYER, 'Lê Ở Lại', otherClass.id, teacherId],
      );
      const foreign = await createSession({ name: `Foreign ${stamp}`, classId: otherClass.id });
      await connect(foreign.id, STAYER);

      const home = await createSession({ name: `HomeB ${stamp}`, classId: classN01 });
      const item = await one(home.id);

      // STAYER có mặt ở môn khác — hoàn toàn không liên quan tới môn này.
      expect(item.neverAttendedCount).toBeGreaterThanOrEqual(1);
    }, 30_000);
  });

  describe('search theo sinh viên', () => {
    it('tìm được sinh viên CHƯA NỘP GÌ — chính là lỗ của search cũ', async () => {
      const s = await createSession({ name: `SearchAbsent ${stamp}`, classId: classN01 });

      // STAYER nằm trong roster, không event, không bài. Search cũ (query bảng
      // submission) không thể thấy người này.
      const items = await overview(STAYER);
      expect(items.map((i) => i.id)).toContain(s.id);
    }, 30_000);

    it('tìm được theo TÊN, không chỉ MSSV', async () => {
      const s = await createSession({ name: `SearchName ${stamp}`, classId: classN01 });
      const items = await overview('Ở Lại');
      expect(items.map((i) => i.id)).toContain(s.id);
    }, 30_000);

    it('loại phiên không có sinh viên khớp', async () => {
      const mine = await createSession({ name: `SearchMine ${stamp}`, classId: classN01 });
      const theirs = await createSession({ name: `SearchTheirs ${stamp}`, classId: classN02 });

      const ids = (await overview(STAYER)).map((i) => i.id);
      expect(ids).toContain(mine.id);
      // STAYER thuộc N01, không có mặt ở phiên của N02.
      expect(ids).not.toContain(theirs.id);
    }, 30_000);

    it('nói rõ sinh viên nào khớp, để GV biết mình gõ đúng người', async () => {
      const s = await createSession({ name: `SearchWho ${stamp}`, classId: classN01 });
      const item = await one(s.id, STAYER);
      expect(item.matchedStudents).toEqual([{ mssv: STAYER, name: 'Lê Ở Lại' }]);
    }, 30_000);

    it('GIỮ NGUYÊN số liệu roll-up của cả phiên khi đang search', async () => {
      const s = await createSession({ name: `SearchCounts ${stamp}`, classId: classN01 });
      await collect(s.id, s.deliverableIds[0], HOME, classN01);

      const unfiltered = await one(s.id);
      const filtered = await one(s.id, STAYER);

      // Search là bộ lọc chọn PHIÊN, không phải bộ lọc thu hẹp con số bên
      // trong phiên. Nếu nó bóp universe thì "1/2 đã nộp" sẽ thành "0/1" và
      // giảng viên đọc ra một sự thật khác hẳn.
      expect(filtered.expectedCount).toBe(unfiltered.expectedCount);
      expect(filtered.fullySubmittedCount).toBe(unfiltered.fullySubmittedCount);
    }, 30_000);

    it('không có từ khoá thì trả về mọi phiên, không kèm matchedStudents', async () => {
      const s = await createSession({ name: `SearchNone ${stamp}`, classId: classN01 });
      const item = await one(s.id);
      expect(item.matchedStudents).toBeNull();
    }, 30_000);
  });
});
