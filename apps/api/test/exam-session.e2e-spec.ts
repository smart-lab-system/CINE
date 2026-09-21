import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';
import { createTestAccount } from './helpers/create-account';

// Pins Task 2's own stated acceptance criteria as real, automated tests —
// they were only manually verified when Task 2 shipped (see
// .superpowers/sdd/2026-08-27-exam-live-demo/task-2-report.md), which means
// nothing would have caught a regression to either the path-traversal-
// adjacent filename validation or the ownership check on GET/:id. Final
// whole-branch review, Important #3.
describe('ExamSession (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let ownerToken: string;
  let otherToken: string;
  let adminToken: string;
  let ownerId: string;
  let otherId: string;
  let courseName: string;
  let classId: string;
  let foreignClassId: string;
  let roomName: string;
  const FIRST_SEMESTER = `HK Một ${Date.now().toString(36)}`;
  const OTHER_SEMESTER = `HK Hai ${Date.now().toString(36)}`;
  let otherSemesterClassId: string;

  /**
   * A window no other call to this helper overlaps.
   *
   * It used to return the same `now + 1min .. now + 1h` for every call,
   * which was fine while nothing checked room availability. It is not fine
   * now: one room and one class are shared by the whole spec, so the second
   * session in any test would collide with the first
   * (ex_exam_session_room_overlap). None of these tests is about
   * scheduling — the shared window was incidental — so each call simply
   * gets its own day.
   *
   * Days rather than hours also keeps every session clear of
   * ExamSessionScheduler's sweep, which would otherwise finalize a session
   * mid-test once its end_time passed.
   */
  let windowCursor = 0;
  function futureWindow() {
    windowCursor += 1;
    const start = new Date();
    start.setUTCDate(start.getUTCDate() + windowCursor);
    start.setUTCHours(8, 0, 0, 0);
    const end = new Date(start);
    end.setUTCHours(10);
    return { startTime: start.toISOString(), endTime: end.toISOString() };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    // Mirrors main.ts exactly (see accounts.e2e-spec.ts) — without both of
    // these, a 400 from bad DTO input or a 409 from the DB's unique index
    // would surface differently than what a real client sees.
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new PostgresExceptionFilter());
    await app.init();

    dataSource = app.get(DataSource);

    const ownerEmail = `exam_session_owner_${Date.now()}@example.com`;
    ownerId = await createTestAccount(dataSource, {
      email: ownerEmail,
      password: 'correct-horse-battery',
      role: 'teacher',
    });
    const ownerLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: ownerEmail, password: 'correct-horse-battery' });
    ownerToken = ownerLogin.body.accessToken;

    const otherEmail = `exam_session_other_${Date.now()}@example.com`;
    otherId = await createTestAccount(dataSource, {
      email: otherEmail,
      password: 'correct-horse-battery',
      role: 'teacher',
    });
    const otherLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: otherEmail, password: 'correct-horse-battery' });
    otherToken = otherLogin.body.accessToken;

    // Role fixture for the RolesGuard test below. An admin is a fully
    // valid, fully authenticated account, so a 403 on POST can only come
    // from the role check — never from a missing/expired token.
    const adminEmail = `exam_session_admin_${Date.now()}@example.com`;
    await createTestAccount(dataSource, {
      email: adminEmail,
      password: 'correct-horse-battery',
      role: 'admin',
    });
    const adminLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: adminEmail, password: 'correct-horse-battery' });
    adminToken = adminLogin.body.accessToken;

    // A session is created for a CLASS as of Phase 3; its course is derived
    // server-side. Every POST /exam-sessions below therefore needs a real
    // class the owner teaches, plus a room.
    const course = { name: 'Exam Session Test Course' };
    courseName = course.name;
    roomName = `Exam Session Test Room ${Date.now()}`;

    const [klass] = await dataSource.query(
      `INSERT INTO examcollect.class (course_name, name, teacher_id)
       VALUES ($1, $2, $3) RETURNING id`,
      [courseName, `Nhóm của tôi ${Date.now()}`, ownerId],
    );
    classId = klass.id;

    // A class of the SAME course taught by someone else — the scope check
    // has to be about who teaches the class, not about the course existing.
    const [foreign] = await dataSource.query(
      `INSERT INTO examcollect.class (course_name, name, teacher_id)
       VALUES ($1, $2, $3) RETURNING id`,
      [courseName, `Nhóm của người khác ${Date.now()}`, otherId],
    );
    foreignClassId = foreign.id;

    // Một học kỳ THỨ HAI mà CHÍNH owner cũng dạy. Bộ lọc kỳ không chứng
    // minh được gì nếu mọi phiên trong spec đều thuộc một kỳ: kết quả
    // "đúng" khi đó cũng là kết quả của việc không lọc gì cả.
    const otherCourse = { name: 'Exam Session Test Course II' };
    const [otherKlass] = await dataSource.query(
      `INSERT INTO examcollect.class (course_name, name, teacher_id)
       VALUES ($1, $2, $3) RETURNING id`,
      [otherCourse.name, `Nhóm kỳ sau ${Date.now()}`, ownerId],
    );
    otherSemesterClassId = otherKlass.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates an exam session with a unique code (happy path)', async () => {
    const { startTime, endTime } = futureWindow();

    const response = await request(app.getHttpServer())
      .post('/exam-sessions')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        name: 'Happy Path Session',
        classId,
        roomName,
        semesterName: 'HK kiểm thử',
        examType: 'TK',
        startTime,
        endTime,
        requiredFilenames: ['Cau1.docx', 'Cau2.docx'],
      });

    expect(response.status).toBe(201);
    expect(response.body.id).toBeDefined();
    expect(response.body.code).toMatch(/^[A-Z0-9]{6}$/);
    expect(response.body.requiredDeliverables).toHaveLength(2);

    // A second session's code must never collide with the first — cheap
    // extra assurance the generator/retry loop actually produces distinct
    // codes, not just "a code". Its own window: this assertion is about
    // code generation, and reusing the first session's slot would only
    // mean testing the room-overlap rule a second time.
    const second = await request(app.getHttpServer())
      .post('/exam-sessions')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        name: 'Happy Path Session 2',
        classId,
        roomName,
        semesterName: 'HK kiểm thử',
        examType: 'TK',
        ...futureWindow(),
        requiredFilenames: ['Cau1.docx'],
      });
    expect(second.status).toBe(201);
    expect(second.body.code).not.toBe(response.body.code);
  });

  it('derives the course from the class instead of taking it from the body', async () => {
    const { startTime, endTime } = futureWindow();

    const response = await request(app.getHttpServer())
      .post('/exam-sessions')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        name: 'Derived Course Session',
        classId,
        // Sent and ignored: a lecturer picks the class they teach, and the
        // course follows from it. Accepting a course from the body would let
        // a session name a course its class does not belong to, and every
        // enrollment check afterwards would be asking about the wrong one.
        courseName: '00000000-0000-4000-8000-000000000000',
        roomName,
        semesterName: 'HK kiểm thử',
        examType: 'TK',
        startTime,
        endTime,
        requiredFilenames: ['Cau1.docx'],
      });

    expect(response.status).toBe(201);
    expect(response.body.classId).toBe(classId);
    expect(response.body.courseName).toBe(courseName);
  });

  it('refuses a class the lecturer does not teach', async () => {
    const { startTime, endTime } = futureWindow();

    const response = await request(app.getHttpServer())
      .post('/exam-sessions')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        name: 'Foreign Class Session',
        classId: foreignClassId,
        roomName,
        semesterName: 'HK kiểm thử',
        examType: 'TK',
        startTime,
        endTime,
        requiredFilenames: ['Cau1.docx'],
      });

    // Same course, different lecturer. class.teacher_id is what scopes a
    // lecturer, so this is the only thing standing between them and running
    // an exam for a colleague's class.
    expect(response.status).toBe(403);
  });

  it('returns 404 for a class that does not exist', async () => {
    const { startTime, endTime } = futureWindow();

    const response = await request(app.getHttpServer())
      .post('/exam-sessions')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        name: 'Missing Class Session',
        classId: '00000000-0000-4000-8000-000000000000',
        roomName,
        semesterName: 'HK kiểm thử',
        examType: 'TK',
        startTime,
        endTime,
        requiredFilenames: ['Cau1.docx'],
      });

    expect(response.status).toBe(404);
  });

  it('lists only the classes this lecturer teaches, with their roster size', async () => {
    const student = `T${Date.now().toString(36)}`.slice(0, 20);
    await dataSource.query(
      `INSERT INTO examcollect.enrollment
         (student_mssv, student_name, home_class_id, home_teacher_id)
       VALUES ($1, $2, $3, $4)`,
      [student, 'Sinh viên đếm được', classId, ownerId],
    );

    const response = await request(app.getHttpServer())
      .get('/classes/teaching')
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(response.status).toBe(200);
    const mine = response.body.find((c: { id: string }) => c.id === classId);
    expect(mine).toMatchObject({ courseName, studentCount: 1 });
    // The create-session form is built from this list, so a class the caller
    // does not teach appearing here would put it one click from an exam.
    expect(response.body.map((c: { id: string }) => c.id)).not.toContain(
      foreignClassId,
    );
  });

  it('rejects an unsafe (path-traversal-adjacent) required filename with 400', async () => {
    const { startTime, endTime } = futureWindow();

    const response = await request(app.getHttpServer())
      .post('/exam-sessions')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        name: 'Unsafe Filename Session',
        classId,
        roomName,
        semesterName: 'HK kiểm thử',
        examType: 'TK',
        startTime,
        endTime,
        requiredFilenames: ['../etc/passwd'],
      });

    expect(response.status).toBe(400);

    // Nothing should have been persisted for a request the DTO rejected.
    const rows = await dataSource.query(
      `SELECT id FROM examcollect.exam_session WHERE name = $1`,
      ['Unsafe Filename Session'],
    );
    expect(rows).toHaveLength(0);
  });

  it('rejects a session shorter than 15 minutes with 400 — QA-reported gap', async () => {
    const startTime = new Date(Date.now() + 60_000).toISOString();
    // 5 minutes — long enough to look plausible, still under the 15-minute
    // floor, so this can't accidentally pass for the wrong reason (e.g.
    // colliding with the separate "end must be after start" rule).
    const endTime = new Date(Date.now() + 60_000 + 5 * 60_000).toISOString();

    const response = await request(app.getHttpServer())
      .post('/exam-sessions')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        name: 'Too Short Session',
        classId,
        roomName,
        semesterName: 'HK kiểm thử',
        examType: 'TK',
        startTime,
        endTime,
        requiredFilenames: ['Cau1.docx'],
      });

    expect(response.status).toBe(400);

    const rows = await dataSource.query(
      `SELECT id FROM examcollect.exam_session WHERE name = $1`,
      ['Too Short Session'],
    );
    expect(rows).toHaveLength(0);
  });

  it('accepts a session exactly 15 minutes long — the floor is inclusive', async () => {
    const startTime = new Date(Date.now() + 60_000).toISOString();
    const endTime = new Date(Date.now() + 60_000 + 15 * 60_000).toISOString();

    const response = await request(app.getHttpServer())
      .post('/exam-sessions')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        name: 'Exactly Fifteen Minutes Session',
        classId,
        roomName,
        semesterName: 'HK kiểm thử',
        examType: 'TK',
        startTime,
        endTime,
        requiredFilenames: ['Cau1.docx'],
      });

    expect(response.status).toBe(201);
  });

  it('rejects a duplicate required filename with 400, not 409 (Important #2 fix)', async () => {
    const { startTime, endTime } = futureWindow();

    const response = await request(app.getHttpServer())
      .post('/exam-sessions')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        name: 'Duplicate Filename Session',
        classId,
        roomName,
        semesterName: 'HK kiểm thử',
        examType: 'TK',
        startTime,
        endTime,
        requiredFilenames: ['Cau1.docx', 'Cau1.docx'],
      });

    // Before @ArrayUnique() this reached the DB's unique index and came
    // back as a 409 — asserting 400 here pins the DTO-level fix, not just
    // "some 4xx".
    expect(response.status).toBe(400);
  });

  it('rejects exam session creation without a token (401)', async () => {
    const { startTime, endTime } = futureWindow();

    const response = await request(app.getHttpServer())
      .post('/exam-sessions')
      .send({
        name: 'No Token Session',
        startTime,
        endTime,
        requiredFilenames: ['Cau1.docx'],
      });

    expect(response.status).toBe(401);
  });

  it('returns 403 when a non-owner requests GET /exam-sessions/:id', async () => {
    const { startTime, endTime } = futureWindow();

    const created = await request(app.getHttpServer())
      .post('/exam-sessions')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        name: 'Ownership Check Session',
        classId,
        roomName,
        semesterName: 'HK kiểm thử',
        examType: 'TK',
        startTime,
        endTime,
        requiredFilenames: ['Cau1.docx'],
      });
    expect(created.status).toBe(201);
    const sessionId: string = created.body.id;

    const ownerView = await request(app.getHttpServer())
      .get(`/exam-sessions/${sessionId}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(ownerView.status).toBe(200);
    expect(ownerView.body.id).toBe(sessionId);

    const otherView = await request(app.getHttpServer())
      .get(`/exam-sessions/${sessionId}`)
      .set('Authorization', `Bearer ${otherToken}`);
    expect(otherView.status).toBe(403);
  });

  it('rejects exam session creation by a non-teacher role with 403', async () => {
    const { startTime, endTime } = futureWindow();
    // Unique per run: the "nothing was persisted" assertion below queries by
    // name, so a row left behind by an earlier (pre-guard) run must not be
    // able to fail a later, correct one.
    const sessionName = `Admin Role Rejected Session ${Date.now()}`;

    // Before @Roles('teacher') landed on the handler, this returned 201:
    // ExamSessionController only had JwtAuthGuard, so ANY authenticated
    // account could create a session it would then own via `teacher_id`.
    const response = await request(app.getHttpServer())
      .post('/exam-sessions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: sessionName,
        classId,
        roomName,
        semesterName: 'HK kiểm thử',
        examType: 'TK',
        startTime,
        endTime,
        requiredFilenames: ['Cau1.docx'],
      });

    expect(response.status).toBe(403);

    // Rejected at the guard, so nothing may have been persisted.
    const rows = await dataSource.query(
      `SELECT id FROM examcollect.exam_session WHERE name = $1`,
      [sessionName],
    );
    expect(rows).toHaveLength(0);
  });

  it('still lets a teacher read their own sessions after the role guard (no regression)', async () => {
    const response = await request(app.getHttpServer())
      .get('/exam-sessions')
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body.items)).toBe(true);
  });
  describe('GET /exam-sessions — filters (QA-reported gap)', () => {
    // A unique prefix per test run so "search" assertions can't accidentally
    // match a session some OTHER test in this file created.
    const stamp = Date.now().toString(36);

    async function createFilterSession(
      nameSuffix: string,
      examType: 'TK' | 'GK' | 'CK' = 'TK',
    ): Promise<string> {
      const { startTime, endTime } = futureWindow();
      const response = await request(app.getHttpServer())
        .post('/exam-sessions')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          name: `Filter${stamp} ${nameSuffix}`,
          classId,
          roomName,
          semesterName: FIRST_SEMESTER,
          examType,
          startTime,
          endTime,
          requiredFilenames: ['Cau1.docx'],
        });
      expect(response.status).toBe(201);
      return response.body.id;
    }

    it('search matches the name, case-insensitively, and excludes a session that does not match', async () => {
      const matchingId = await createFilterSession('Giữa kỳ Toán');
      // A control WITHOUT "Giữa" in its name (it still has the stamp, so
      // it's still one of "this teacher's sessions from this test run" —
      // the point is proving the search TERM narrows the result, not just
      // proving scoping-by-teacher already works, which the earlier
      // "still lets a teacher read their own sessions" test covers).
      const unrelated = await request(app.getHttpServer())
        .post('/exam-sessions')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          name: `Không liên quan gì cả ${stamp}`,
          classId,
          roomName,
          semesterName: 'HK kiểm thử',
          examType: 'TK',
          ...futureWindow(),
          requiredFilenames: ['Cau1.docx'],
        });
      const unrelatedId = unrelated.body.id;

      const response = await request(app.getHttpServer())
        .get('/exam-sessions')
        .query({ search: `filter${stamp} Giữa` })
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(response.status).toBe(200);
      const ids = response.body.items.map((item: { id: string }) => item.id);
      expect(ids).toContain(matchingId);
      expect(ids).not.toContain(unrelatedId);
    });

    it('search also matches the session code, and excludes a session with a different one', async () => {
      const sessionId = await createFilterSession('Cuối kỳ Lý');
      const otherId = await createFilterSession('Một phiên khác');
      const created = await request(app.getHttpServer())
        .get(`/exam-sessions/${sessionId}`)
        .set('Authorization', `Bearer ${ownerToken}`);
      const code: string = created.body.code;

      const response = await request(app.getHttpServer())
        .get('/exam-sessions')
        .query({ search: code })
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(response.status).toBe(200);
      const ids = response.body.items.map((item: { id: string }) => item.id);
      expect(ids).toContain(sessionId);
      // A DIFFERENT session's own unique code cannot be a substring of
      // this one's — proves the code narrowed the result rather than the
      // response just being "everything on page 1" regardless.
      expect(ids).not.toContain(otherId);
    });

    it('examType filters out every other type', async () => {
      await createFilterSession('Loại GK', 'GK');
      await createFilterSession('Loại CK', 'CK');

      const response = await request(app.getHttpServer())
        .get('/exam-sessions')
        .query({ search: `filter${stamp}`, examType: 'GK' })
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(response.status).toBe(200);
      expect(
        response.body.items.every((item: { examType: string }) => item.examType === 'GK'),
      ).toBe(true);
      expect(response.body.items.length).toBeGreaterThanOrEqual(1);
    });

    it('status filters out a finalized session from the active list, and vice versa', async () => {
      const activeId = await createFilterSession('Vẫn đang mở');
      const completedId = await createFilterSession('Đã chốt');
      const finalize = await request(app.getHttpServer())
        .post(`/exam-sessions/${completedId}/finalize`)
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(finalize.status).toBe(200);

      const active = await request(app.getHttpServer())
        .get('/exam-sessions')
        .query({ search: `filter${stamp}`, status: 'active' })
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(active.body.items.map((item: { id: string }) => item.id)).toContain(activeId);
      expect(active.body.items.map((item: { id: string }) => item.id)).not.toContain(completedId);

      const completed = await request(app.getHttpServer())
        .get('/exam-sessions')
        // `collecting`, không phải `completed`: finalize giờ dừng ở
        // giai đoạn thu bài (spec §3). Lọc theo trạng thái mà luồng
        // thật sự tạo ra mới là kiểm bộ lọc; đổi sang một trạng thái
        // không ai đang ở sẽ cho một test xanh vô nghĩa.
        .query({ search: `filter${stamp}`, status: 'collecting' })
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(completed.body.items.map((item: { id: string }) => item.id)).toContain(completedId);
      expect(completed.body.items.map((item: { id: string }) => item.id)).not.toContain(activeId);
    });

    it('rejects an unrecognized status value with 400, rather than silently ignoring it', async () => {
      const response = await request(app.getHttpServer())
        .get('/exam-sessions')
        .query({ status: 'not-a-real-status' })
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(response.status).toBe(400);
    });

    it('combined with pagination, still reports the right total for the filtered set', async () => {
      await createFilterSession('Trang 1', 'CK');
      await createFilterSession('Trang 2', 'CK');

      const response = await request(app.getHttpServer())
        .get('/exam-sessions')
        .query({ search: `filter${stamp} Trang`, examType: 'CK', page: 1, pageSize: 1 })
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(response.status).toBe(200);
      expect(response.body.items).toHaveLength(1);
      // Exactly 2 (the two sessions this test itself created), not "at
      // least 2" — a total that also counted every OTHER session this
      // owner has (dozens, from the rest of this file) would still be
      // "greater than or equal to 2" without the filter doing anything.
      expect(response.body.total).toBe(2);
    });
  });

  /**
   * Học kỳ — bộ lọc thứ tư, thêm 2026-09-15.
   *
   * Ba bộ lọc trên chỉ đọc cột của chính `exam_session`. Cái này đi qua
   * `course.semester_id`, tức qua một JOIN — nên nó là cái duy nhất trong
   * nhóm có thể bị viết nhầm thành `orWhere` và mở phiên của giảng viên
   * khác ra. Test thứ hai ghim đúng chuyện đó, theo cùng khuôn mà bộ lọc
   * kỳ của "Lớp của tôi" đã ghim khi nó ra mắt.
   *
   * Lọc theo `course.semester_id`, KHÔNG phải `exam_session.semester_name`
   * (bản chụp lúc tạo): dropdown trên UI mang id của bảng `semester`, và
   * `/submissions/overview` lọc trên CÙNG cột `exam_session.semester_name` —
   * hai trang phải trả lời giống nhau câu "phiên này thuộc kỳ nào".
   */
  describe('GET /exam-sessions — semester filter', () => {
    const stamp = Date.now().toString(36);

    async function createIn(
      classIdForSession: string,
      nameSuffix: string,
      token: string,
      examType: 'TK' | 'GK' | 'CK' = 'TK',
      semesterName: string = FIRST_SEMESTER,
    ): Promise<string> {
      const { startTime, endTime } = futureWindow();
      const response = await request(app.getHttpServer())
        .post('/exam-sessions')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: `Sem${stamp} ${nameSuffix}`,
          classId: classIdForSession,
          roomName,
          semesterName,
          examType,
          startTime,
          endTime,
          requiredFilenames: ['Cau1.docx'],
        });
      expect(response.status).toBe(201);
      return response.body.id as string;
    }

    it('narrows to one semester — the same teacher own sessions in the other semester drop out', async () => {
      const inFirst = await createIn(classId, 'Kỳ một', ownerToken);
      const inSecond = await createIn(
        otherSemesterClassId,
        'Kỳ hai',
        ownerToken,
        'TK',
        OTHER_SEMESTER,
      );

      const response = await request(app.getHttpServer())
        .get('/exam-sessions')
        .query({ search: `Sem${stamp} Kỳ`, semesterName: OTHER_SEMESTER })
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(response.status).toBe(200);
      const ids = response.body.items.map((item: { id: string }) => item.id);
      expect(ids).toContain(inSecond);
      expect(ids).not.toContain(inFirst);
      // Cả hai phiên đều khớp `search`, nên total = 1 chứng minh chính bộ
      // lọc kỳ đã cắt — không phải search làm hộ nó.
      expect(response.body.total).toBe(1);
    });

    it('ANDs onto the owner scope — another teacher session in the SAME semester stays invisible', async () => {
      const mine = await createIn(classId, 'Của tôi', ownerToken);
      const theirs = await createIn(foreignClassId, 'Của người khác', otherToken);

      const response = await request(app.getHttpServer())
        .get('/exam-sessions')
        .query({ search: `Sem${stamp} Của`, semesterName: FIRST_SEMESTER })
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(response.status).toBe(200);
      const ids = response.body.items.map((item: { id: string }) => item.id);
      expect(ids).toContain(mine);
      // `theirs` nằm ĐÚNG học kỳ đang lọc và vẫn phải vắng mặt: một
      // `orWhere` đặt nhầm ở đây biến một tiện ích thành lỗ hổng phân
      // quyền, và kết quả vẫn trông "có dữ liệu" nên không ai nghi ngờ.
      expect(ids).not.toContain(theirs);
      expect(response.body.total).toBe(1);
    });

    it('một học kỳ không khớp phiên nào trả về danh sách rỗng, không phải 404', async () => {
      // Kỳ "không tồn tại" là một câu trả lời hợp lệ (0 phiên), không phải
      // một sự cố. Ghim lại để một lần refactor sau không biến nó thành
      // 404 và làm trang danh sách nổ thay vì hiện bảng rỗng.
      const response = await request(app.getHttpServer())
        .get('/exam-sessions')
        .query({ semesterName: 'HK không tồn tại' })
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(response.status).toBe(200);
      expect(response.body.items).toHaveLength(0);
      expect(response.body.total).toBe(0);
    });

    it('chains onto the other three filters instead of widening them', async () => {
      // Mỗi phiên "sai" dưới đây lệch khỏi phiên đúng ĐÚNG MỘT chiều. Nếu
      // một `andWhere` nào đó bị viết nhầm thành `orWhere`, chính phiên
      // lệch theo chiều đó sẽ lọt vào kết quả — và chỉ luôn ra chiều hỏng.
      const wanted = await createIn(
        otherSemesterClassId,
        'Gộp đúng',
        ownerToken,
        'CK',
        OTHER_SEMESTER,
      );
      const wrongType = await createIn(
        otherSemesterClassId,
        'Gộp sai loại',
        ownerToken,
        'GK',
        OTHER_SEMESTER,
      );
      const wrongSemester = await createIn(classId, 'Gộp sai kỳ', ownerToken, 'CK');

      const response = await request(app.getHttpServer())
        .get('/exam-sessions')
        .query({
          search: `Sem${stamp} Gộp`,
          examType: 'CK',
          status: 'active',
          semesterName: OTHER_SEMESTER,
        })
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(response.status).toBe(200);
      const ids = response.body.items.map((item: { id: string }) => item.id);
      // toEqual, không phải toContain: bốn bộ lọc AND với nhau thì kết quả
      // là đúng MỘT phiên, và đó mới là điều cần chứng minh.
      expect(ids).toEqual([wanted]);
      expect(ids).not.toContain(wrongType);
      expect(ids).not.toContain(wrongSemester);
      expect(response.body.total).toBe(1);
    });

    it('treats an absent semester as all semesters, not as an error', async () => {
      const inFirst = await createIn(classId, 'Không lọc một', ownerToken);
      const inSecond = await createIn(otherSemesterClassId, 'Không lọc hai', ownerToken);

      const response = await request(app.getHttpServer())
        .get('/exam-sessions')
        .query({ search: `Sem${stamp} Không lọc` })
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(response.status).toBe(200);
      const ids = response.body.items.map((item: { id: string }) => item.id);
      expect(ids).toEqual(expect.arrayContaining([inFirst, inSecond]));
    });
  });

  /**
   * Bộ lọc theo LỚP, thêm 2026-09-21.
   *
   * Khác ba bộ lọc trên ở một điểm quyết định: lớp là KHOÁ NGOẠI, không
   * phải chuỗi giảng viên gõ. Sau khi môn học trở thành hằng số, đây là
   * trục học vụ có cấu trúc duy nhất còn lại — nên nó phải chịu đúng hai
   * phép thử mà bộ lọc kỳ đã chịu: nó có thật sự cắt không, và nó có AND
   * vào phạm vi chủ sở hữu thay vì nới nó ra không.
   */
  describe('GET /exam-sessions — class filter', () => {
    const stamp = Date.now().toString(36);

    // Một kỳ CHỈ giảng viên kia dùng. Không có nó thì phép thử cách ly ở
    // ca cuối là vô nghĩa: hai người cùng một tên kỳ thì assert vẫn xanh
    // dù truy vấn có rò hay không.
    const FOREIGN_SEMESTER = `HK Người khác ${stamp}`;

    async function createForClass(
      classIdForSession: string,
      nameSuffix: string,
      token: string,
      semesterName: string = FIRST_SEMESTER,
    ): Promise<string> {
      const { startTime, endTime } = futureWindow();
      const response = await request(app.getHttpServer())
        .post('/exam-sessions')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: `Cls${stamp} ${nameSuffix}`,
          classId: classIdForSession,
          roomName,
          semesterName,
          examType: 'TK',
          startTime,
          endTime,
          requiredFilenames: ['Cau1.docx'],
        });
      expect(response.status).toBe(201);
      return response.body.id as string;
    }

    it('thu hẹp về đúng một lớp — phiên lớp khác của CHÍNH giảng viên đó rơi ra', async () => {
      const inA = await createForClass(classId, 'Lớp A', ownerToken);
      const inB = await createForClass(otherSemesterClassId, 'Lớp B', ownerToken);

      const response = await request(app.getHttpServer())
        .get('/exam-sessions')
        .query({ search: `Cls${stamp} Lớp`, classId })
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(response.status).toBe(200);
      const ids = response.body.items.map((item: { id: string }) => item.id);
      expect(ids).toContain(inA);
      expect(ids).not.toContain(inB);
      // Cả hai đều khớp `search`, nên total = 1 chứng minh chính bộ lọc lớp
      // đã cắt — không phải search làm hộ nó.
      expect(response.body.total).toBe(1);
    });

    it('AND vào phạm vi chủ sở hữu — lọc theo lớp của người khác trả về rỗng, không phải phiên của họ', async () => {
      const theirs = await createForClass(foreignClassId, 'Của người khác', otherToken);

      const response = await request(app.getHttpServer())
        .get('/exam-sessions')
        .query({ classId: foreignClassId })
        .set('Authorization', `Bearer ${ownerToken}`);

      // Đây là ca quan trọng nhất của bộ này: `classId` đến thẳng từ URL,
      // nên một `orWhere` đặt nhầm biến bộ lọc tiện lợi thành đường đọc
      // trộm phiên của giảng viên khác — và kết quả vẫn trông "có dữ liệu"
      // nên không ai nghi ngờ.
      expect(response.status).toBe(200);
      const ids = response.body.items.map((item: { id: string }) => item.id);
      expect(ids).not.toContain(theirs);
      expect(response.body.total).toBe(0);
    });

    it('classId không phải uuid bị từ chối 400, không bị lặng lẽ bỏ qua', async () => {
      // Cùng lý do với ca status không hợp lệ: lặng lẽ bỏ qua một bộ lọc
      // hỏng sẽ trả về NHIỀU HƠN thứ người dùng xin, và họ tin đó là đã lọc.
      const response = await request(app.getHttpServer())
        .get('/exam-sessions')
        .query({ classId: 'khong-phai-uuid' })
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(response.status).toBe(400);
    });

    it('semesterNames liệt kê MỌI kỳ của giảng viên, không chỉ kỳ có trên trang đang xem', async () => {
      // Dropdown học kỳ đọc trường này. Trước đây giao diện tự gom danh
      // sách từ các trang đã tải, nên một kỳ chỉ có ở trang sau thì không
      // chọn được — trong khi phép lọc lại chạy trên toàn bộ dữ liệu.
      // pageSize: 1 là cách chứng minh nó KHÔNG suy ra từ trang.
      const response = await request(app.getHttpServer())
        .get('/exam-sessions')
        .query({ page: 1, pageSize: 1 })
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(response.status).toBe(200);
      expect(response.body.items).toHaveLength(1);
      expect(response.body.semesterNames).toEqual(
        expect.arrayContaining([FIRST_SEMESTER, OTHER_SEMESTER]),
      );
    });

    it('semesterNames KHÔNG rò học kỳ của giảng viên khác', async () => {
      // Kỳ này chỉ tồn tại trên phiên của người kia. Bản đầu của test trên
      // khẳng định điều này trong chú thích nhưng không chứng minh được:
      // cả hai giảng viên khi ấy dùng chung FIRST_SEMESTER, nên assert vẫn
      // xanh kể cả khi truy vấn quên mất vế `teacherId`.
      await createForClass(foreignClassId, 'Kỳ riêng', otherToken, FOREIGN_SEMESTER);

      const response = await request(app.getHttpServer())
        .get('/exam-sessions')
        .query({ page: 1, pageSize: 1 })
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(response.status).toBe(200);
      expect(response.body.semesterNames).not.toContain(FOREIGN_SEMESTER);

      // Và người kia thì PHẢI thấy kỳ của chính họ — nếu không, test trên
      // sẽ xanh cả khi `semesterNames` luôn trả về mảng rỗng.
      const theirs = await request(app.getHttpServer())
        .get('/exam-sessions')
        .query({ page: 1, pageSize: 1 })
        .set('Authorization', `Bearer ${otherToken}`);

      expect(theirs.status).toBe(200);
      expect(theirs.body.semesterNames).toContain(FOREIGN_SEMESTER);
    });
  });

  describe('POST /exam-sessions/:id/finalize', () => {
    // Every session here uses a FUTURE window on purpose: the scheduled
    // sweep (ExamSessionScheduler, running for real inside this app
    // instance) only touches sessions whose end_time has passed, so it
    // can never race these assertions.
    async function createSession(name: string): Promise<string> {
      const { startTime, endTime } = futureWindow();
      const created = await request(app.getHttpServer())
        .post('/exam-sessions')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          name: `${name} ${Date.now()}`,
          classId,
          roomName,
          semesterName: 'HK kiểm thử',
          examType: 'TK',
          startTime,
          endTime,
          requiredFilenames: ['Cau1.docx'],
        });
      expect(created.status).toBe(201);
      expect(created.body.status).toBe('active');
      return created.body.id as string;
    }

    it('flips an active session owned by the caller to collecting', async () => {
      // Đổi từ `completed` sang `collecting` ngày 2026-09-11 — CÓ CHỦ
      // ĐÍCH, không phải nới lỏng test. "Chốt bài ngay" nghĩa là "hết
      // giờ, nộp đi", và giai đoạn thu bài bắt đầu từ đó; `completed`
      // từ nay nghĩa là "đã có người xác nhận" và chỉ tới được qua
      // POST /confirm-end. Xem spec §3.
      const sessionId = await createSession('Manual Finalize');

      const response = await request(app.getHttpServer())
        .post(`/exam-sessions/${sessionId}/finalize`)
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('collecting');

      // The response is not the only thing that must be right — the
      // column is now the source of truth the UI reads back.
      const [row] = await dataSource.query(
        `SELECT status, completed_at FROM examcollect.exam_session WHERE id = $1`,
        [sessionId],
      );
      expect(row.status).toBe('collecting');
      // Chưa ai xác nhận, nên chưa có dấu vết chốt nào.
      expect(row.completed_at).toBeNull();
    });

    it('is idempotent — a second finalize still returns 200/collecting', async () => {
      const sessionId = await createSession('Double Finalize');

      const first = await request(app.getHttpServer())
        .post(`/exam-sessions/${sessionId}/finalize`)
        .set('Authorization', `Bearer ${ownerToken}`);
      const second = await request(app.getHttpServer())
        .post(`/exam-sessions/${sessionId}/finalize`)
        .set('Authorization', `Bearer ${ownerToken}`);

      // Finalizing twice (teacher clicks, or a tick lands at the same
      // moment) must not error — finalizeExamSession's WHERE clause makes
      // the second one a no-op rather than a second transition.
      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      expect(second.body.status).toBe('collecting');
    });

    it('rejects a teacher who does not own the session with 403', async () => {
      const sessionId = await createSession('Non Owner Finalize');

      const response = await request(app.getHttpServer())
        .post(`/exam-sessions/${sessionId}/finalize`)
        .set('Authorization', `Bearer ${otherToken}`);

      expect(response.status).toBe(403);

      const [row] = await dataSource.query(
        `SELECT status FROM examcollect.exam_session WHERE id = $1`,
        [sessionId],
      );
      expect(row.status).toBe('active');
    });

    it('rejects a non-teacher role with 403', async () => {
      const sessionId = await createSession('Admin Finalize');

      const response = await request(app.getHttpServer())
        .post(`/exam-sessions/${sessionId}/finalize`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(403);
    });

    it('rejects an unknown session with 404', async () => {
      const response = await request(app.getHttpServer())
        .post('/exam-sessions/00000000-0000-4000-8000-000000000000/finalize')
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(response.status).toBe(404);
    });
  });
  /**
   * Khoảng ngày `from`/`to` — nguồn của chế độ xem LỊCH.
   *
   * Khác mọi bộ lọc khác ở một điểm: khi cặp này có mặt, phân trang bị BỎ QUA.
   * Đó là chỗ dễ hỏng nhất và cũng là chỗ hỏng im lặng nhất — một lưới tuần
   * thiếu phiên trông y hệt một tuần rảnh.
   */
  describe('GET /exam-sessions — khoảng ngày cho chế độ lịch', () => {
    const stamp = Date.now().toString(36);

    async function createAt(nameSuffix: string, start: Date, end: Date): Promise<string> {
      const response = await request(app.getHttpServer())
        .post('/exam-sessions')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          name: `Range${stamp} ${nameSuffix}`,
          classId,
          roomName,
          semesterName: FIRST_SEMESTER,
          examType: 'TK',
          startTime: start.toISOString(),
          endTime: end.toISOString(),
          requiredFilenames: ['Cau1.docx'],
        });
      expect(response.status).toBe(201);
      return response.body.id as string;
    }

    function list(query: Record<string, string | number>) {
      return request(app.getHttpServer())
        .get('/exam-sessions')
        .set('Authorization', `Bearer ${ownerToken}`)
        .query(query);
    }

    it('trả về MỌI phiên trong khoảng, bỏ qua phân trang', async () => {
      // Ba phiên, ba ngày liên tiếp — đủ xa nhau để không chạm luật 30 phút.
      const d1 = futureWindow();
      const d2 = futureWindow();
      const d3 = futureWindow();
      await createAt('A', new Date(d1.startTime), new Date(d1.endTime));
      await createAt('B', new Date(d2.startTime), new Date(d2.endTime));
      await createAt('C', new Date(d3.startTime), new Date(d3.endTime));

      const from = new Date(d1.startTime);
      from.setUTCHours(0, 0, 0, 0);
      const to = new Date(d3.endTime);
      to.setUTCDate(to.getUTCDate() + 1);

      // pageSize=1 CỐ Ý: nếu phân trang còn hiệu lực thì chỉ về 1 dòng, và
      // cái lịch sẽ vẽ ra một tuần thiếu hai phiên mà không báo gì.
      const response = await list({
        page: 1,
        pageSize: 1,
        from: from.toISOString(),
        to: to.toISOString(),
      });

      expect(response.status).toBe(200);
      const names = response.body.items.map((i: { name: string }) => i.name);
      expect(names).toContain(`Range${stamp} A`);
      expect(names).toContain(`Range${stamp} B`);
      expect(names).toContain(`Range${stamp} C`);
    });

    it('nửa mở: phiên bắt đầu ĐÚNG lúc `to` bị loại', async () => {
      const win = futureWindow();
      await createAt('Biên', new Date(win.startTime), new Date(win.endTime));

      const response = await list({
        page: 1,
        pageSize: 50,
        from: new Date(Date.parse(win.startTime) - 3_600_000).toISOString(),
        to: win.startTime,
      });

      expect(response.status).toBe(200);
      const names = response.body.items.map((i: { name: string }) => i.name);
      expect(names).not.toContain(`Range${stamp} Biên`);
    });

    it('thiếu một nửa của cặp là 400, KHÔNG phải im lặng trả về trang đầu', async () => {
      const response = await list({ page: 1, pageSize: 20, from: new Date().toISOString() });
      expect(response.status).toBe(400);
    });

    it('khoảng quá 45 ngày bị từ chối', async () => {
      const from = new Date();
      const to = new Date(from);
      to.setUTCDate(to.getUTCDate() + 60);

      const response = await list({
        page: 1,
        pageSize: 20,
        from: from.toISOString(),
        to: to.toISOString(),
      });

      expect(response.status).toBe(400);
    });
  });
});
