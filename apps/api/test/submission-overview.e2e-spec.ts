import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';
import { createTestAccount } from './helpers/create-account';

/**
 * GET /submissions/overview — §3.3. Chạy trên Postgres thật vì bug cần bắt
 * (join fan-out) chỉ tồn tại ở tầng SQL: repository mock không thể tái hiện.
 */
describe('Submission overview (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let schema: string;

  const stamp = Date.now();
  let teacherToken: string;
  let teacherId: string;
  let courseId: string;
  let classId: string;
  let roomId: string;

  /** Roster 40 SV cho lớp đang xét — mẫu số của mọi assertion bên dưới. */
  const ROSTER: string[] = Array.from({ length: 40 }, (_, i) =>
    `OV${stamp}${String(i).padStart(2, '0')}`.slice(0, 20),
  );

  /**
   * Luôn tạo qua API với classId thật và >= 1 filename: CreateExamSessionDto
   * bắt buộc `@IsUUID() classId` (courseId được suy ra từ class ở server) và
   * `@ArrayMinSize(1) requiredFilenames`. Hai kịch bản biên (không gắn lớp /
   * không có file bắt buộc) được dựng bằng cách gỡ bớt SAU khi tạo — xem
   * `detachClass` và `dropDeliverables` bên dưới. Đừng thử gửi null/[] vào
   * API: đó là 400, không phải kịch bản test.
   */
  /**
   * Mỗi phiên tạo ra chiếm một khung giờ riêng, không đè lên phiên nào
   * khác — cả spec dùng chung một phòng và một lớp, mà hai phiên chưa kết
   * thúc thì không được trùng (ex_exam_session_room_overlap /
   * ex_exam_session_class_overlap).
   */
  let windowCursor = 0;
  function freshFutureWindow() {
    windowCursor += 1;
    const start = new Date();
    start.setUTCDate(start.getUTCDate() + windowCursor);
    start.setUTCHours(8, 0, 0, 0);
    const end = new Date(start);
    end.setUTCHours(10);
    return { startTime: start.toISOString(), endTime: end.toISOString() };
  }

  async function createSession(
    name: string,
    filenames: string[],
    opts: { startOffsetMs: number; endOffsetMs: number },
  ): Promise<{ id: string; deliverableIds: string[] }> {
    const response = await request(app.getHttpServer())
      .post('/exam-sessions')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        name,
        classId,
        roomId,
        examType: 'TK',
        // Tạo ở khung hợp lệ rồi mới dời — cùng kiểu với detachClass/
        // dropDeliverables bên dưới. DTO chặn khai giờ bắt đầu lùi quá
        // MAX_BACKDATE_MINUTES (lùi hai tiếng là mô tả một kỳ thi mà agent
        // không thể nào thu bài được), nhưng fixture ở đây đúng là những
        // phiên đã thi xong và đã có bài.
        ...freshFutureWindow(),
        requiredFilenames: filenames,
      });
    expect(response.status).toBe(201);
    const id = response.body.id as string;

    const startTime = new Date(Date.now() + opts.startOffsetMs);
    const endTime = new Date(Date.now() + opts.endOffsetMs);
    // Khung giờ đã khép lại nghĩa là phiên đã xong — cũng chính là điều
    // khiến nó nhả phòng và lớp cho phiên của test kế tiếp.
    const status = endTime.getTime() <= Date.now() ? 'completed' : 'active';
    await dataSource.query(
      `UPDATE ${schema}.exam_session
         SET start_time = $2, end_time = $3, status = $4
       WHERE id = $1`,
      [id, startTime, endTime, status],
    );

    return {
      id,
      deliverableIds: (response.body.requiredDeliverables as { id: string }[]).map((d) => d.id),
    };
  }

  /** class_id là nullable ở entity nhưng bắt buộc ở DTO — gỡ sau khi tạo. */
  async function detachClass(sessionId: string): Promise<void> {
    await dataSource.query(
      `UPDATE ${schema}.exam_session SET class_id = NULL WHERE id = $1`,
      [sessionId],
    );
  }

  /** Dựng phiên requiredDeliverableCount = 0 mà không phải chống @ArrayMinSize(1). */
  async function dropDeliverables(sessionId: string): Promise<void> {
    await dataSource.query(
      `DELETE FROM ${schema}.required_deliverable WHERE exam_session_id = $1`,
      [sessionId],
    );
  }

  /**
   * Ghi thẳng một dòng submission — bỏ qua socket/storage, chỉ cần con số.
   *
   * home_class_id / home_teacher_id là NOT NULL (migration
   * RestoreSubmissionHomeRoutingNotNull) — bỏ trống là 23502, không phải
   * insert im lặng.
   *
   * DEFECT #4 (không có trong brief, phát hiện khi chạy RED): trigger
   * `validate_submission_lifecycle` (migration InitialSchema) chặn
   * `INSERT ... status = 'collected'` thẳng — INSERT chỉ được phép tạo dòng
   * ở 'received' hoặc 'invalid'; muốn tới 'collected' phải đi qua UPDATE
   * received -> validated -> collected, y hệt cách submission.service.ts
   * (dòng ~423-430) làm ở luồng thật. 'invalid' vẫn insert thẳng được vì
   * trigger cho phép cả hai giá trị đó ở bước INSERT.
   */
  async function insertSubmission(
    sessionId: string,
    deliverableId: string,
    mssv: string,
    status: 'collected' | 'invalid',
    homeClassId: string = classId,
  ): Promise<void> {
    const insertStatus = status === 'collected' ? 'received' : 'invalid';
    const [row] = await dataSource.query(
      `INSERT INTO ${schema}.submission
         (exam_session_id, required_deliverable_id, student_mssv, student_name_input,
          home_class_id, home_teacher_id, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [sessionId, deliverableId, mssv, `SV ${mssv}`, homeClassId, teacherId, insertStatus],
    );
    if (status === 'collected') {
      await dataSource.query(
        `UPDATE ${schema}.submission SET status = 'validated' WHERE id = $1`,
        [row.id],
      );
      await dataSource.query(
        `UPDATE ${schema}.submission SET status = 'collected' WHERE id = $1`,
        [row.id],
      );
    }
  }

  async function fetchOverview(): Promise<Record<string, any>[]> {
    const response = await request(app.getHttpServer())
      .get('/submissions/overview')
      .set('Authorization', `Bearer ${teacherToken}`);
    expect(response.status).toBe(200);
    return response.body.items;
  }

  const bySessionId = (items: Record<string, any>[], id: string) => {
    const found = items.find((item) => item.id === id);
    if (!found) throw new Error(`session ${id} missing from overview`);
    return found;
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new PostgresExceptionFilter());
    await app.listen(0);
    dataSource = app.get(DataSource);
    schema = (dataSource.options as { schema?: string }).schema ?? 'examcollect';

    const email = `overview_${stamp}@example.com`;
    teacherId = await createTestAccount(dataSource, {
      email,
      password: 'correct-horse-battery',
      role: 'teacher',
    });
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'correct-horse-battery' });
    teacherToken = login.body.accessToken;

    const [semester] = await dataSource.query(
      `INSERT INTO ${schema}.semester (name, start_date, end_date)
       VALUES ($1, '2026-01-01', '2026-06-01') RETURNING id`,
      [`Overview Semester ${stamp}`],
    );
    const [course] = await dataSource.query(
      `INSERT INTO ${schema}.course (code, name, semester_id)
       VALUES ($1, 'Overview Course', $2) RETURNING id`,
      [`OVC${stamp}`.slice(0, 20), semester.id],
    );
    courseId = course.id;
    const [room] = await dataSource.query(
      `INSERT INTO ${schema}.room (name, capacity) VALUES ($1, 50) RETURNING id`,
      [`Overview Room ${stamp}`],
    );
    roomId = room.id;
    const [klass] = await dataSource.query(
      `INSERT INTO ${schema}.class (course_id, name, teacher_id)
       VALUES ($1, 'N01', $2) RETURNING id`,
      [courseId, teacherId],
    );
    classId = klass.id;

    // Roster 40 người, đúng định nghĩa (course_id + home_class_id).
    for (const mssv of ROSTER) {
      await dataSource.query(
        `INSERT INTO ${schema}.enrollment
           (student_mssv, student_name, course_id, home_class_id, home_teacher_id)
         VALUES ($1, $2, $3, $4, $5)`,
        [mssv, `SV ${mssv}`, courseId, classId, teacherId],
      );
    }
  }, 60_000);

  afterAll(async () => {
    await app.close();
  });

  it('fan-out ba chiều: 1 SV nộp đủ 3 file trên roster 40 không bị nhân lên', async () => {
    const session = await createSession(
      `Fanout ${stamp}`,
      ['Cau1.docx', 'Cau2.docx', 'Cau3.docx'],
      { startOffsetMs: -7_200_000, endOffsetMs: -3_600_000 },
    );
    for (const deliverableId of session.deliverableIds) {
      await insertSubmission(session.id, deliverableId, ROSTER[0], 'collected');
    }

    const item = bySessionId(await fetchOverview(), session.id);

    // Nếu SQL join thô rồi GROUP BY, con số này sẽ là 3, 40 hoặc 120.
    expect(item.fullySubmittedCount).toBe(1);
    expect(item.partialCount).toBe(0);
    expect(item.neverAttendedCount).toBe(39);
    expect(item.expectedCount).toBe(40);
    expect(item.requiredDeliverableCount).toBe(3);
    expect(item.rosterKnown).toBe(true);
  }, 30_000);

  it('invalidFileCount đếm FILE và không nhân theo roster', async () => {
    const session = await createSession(
      `Invalid ${stamp}`,
      ['Cau1.docx', 'Cau2.docx', 'Cau3.docx'],
      { startOffsetMs: -7_200_000, endOffsetMs: -3_600_000 },
    );
    await insertSubmission(session.id, session.deliverableIds[0], ROSTER[1], 'invalid');
    await insertSubmission(session.id, session.deliverableIds[1], ROSTER[1], 'invalid');

    const item = bySessionId(await fetchOverview(), session.id);

    // Nhân chéo sẽ cho 80 (× roster) hoặc 240 (× roster × deliverable).
    expect(item.invalidFileCount).toBe(2);
  }, 30_000);

  it('SV chỉ có file invalid được tính là "nộp thiếu", KHÔNG phải "chưa nộp"', async () => {
    const session = await createSession(
      `OnlyInvalid ${stamp}`,
      ['Cau1.docx', 'Cau2.docx'],
      { startOffsetMs: -7_200_000, endOffsetMs: -3_600_000 },
    );
    await insertSubmission(session.id, session.deliverableIds[0], ROSTER[2], 'invalid');

    const item = bySessionId(await fetchOverview(), session.id);

    expect(item.partialCount).toBe(1);
    expect(item.neverAttendedCount).toBe(39);
    expect(item.fullySubmittedCount).toBe(0);
    expect(item.invalidFileCount).toBe(1);
  }, 30_000);

  it('requiredDeliverableCount = 0: không ai nộp đủ, API vẫn trả bình thường', async () => {
    // Tạo với 1 file rồi xoá — API từ chối mảng rỗng (@ArrayMinSize(1)).
    const session = await createSession(`NoDeliv ${stamp}`, ['Cau1.docx'], {
      startOffsetMs: -7_200_000,
      endOffsetMs: -3_600_000,
    });
    await dropDeliverables(session.id);

    const item = bySessionId(await fetchOverview(), session.id);

    expect(item.requiredDeliverableCount).toBe(0);
    expect(item.fullySubmittedCount).toBe(0);
    expect(item.expectedCount).toBe(40);
  }, 30_000);

  it('bất biến: fully + partial + neverAttended === expectedCount, kể cả khi có SV thi ghép', async () => {
    // SV thi ghép: enrolled cùng course nhưng home_class_id là lớp KHÁC ->
    // không thuộc roster, nhưng có bài nộp -> phải nằm trong expectedCount.
    const [otherClass] = await dataSource.query(
      `INSERT INTO ${schema}.class (course_id, name, teacher_id)
       VALUES ($1, 'N02', $2) RETURNING id`,
      [courseId, teacherId],
    );
    const makeupMssv = `OVM${stamp}`.slice(0, 20);
    await dataSource.query(
      `INSERT INTO ${schema}.enrollment
         (student_mssv, student_name, course_id, home_class_id, home_teacher_id)
       VALUES ($1, 'SV thi ghép', $2, $3, $4)`,
      [makeupMssv, courseId, otherClass.id, teacherId],
    );

    const session = await createSession(
      `Union ${stamp}`,
      ['Cau1.docx', 'Cau2.docx'],
      { startOffsetMs: -7_200_000, endOffsetMs: -3_600_000 },
    );
    await insertSubmission(session.id, session.deliverableIds[0], ROSTER[3], 'collected');
    await insertSubmission(session.id, session.deliverableIds[1], ROSTER[3], 'collected');
    await insertSubmission(session.id, session.deliverableIds[0], ROSTER[4], 'collected');
    // home_class_id của SV thi ghép là lớp GỐC của họ, không phải lớp đang thi.
    await insertSubmission(
      session.id,
      session.deliverableIds[0],
      makeupMssv,
      'collected',
      otherClass.id,
    );

    const item = bySessionId(await fetchOverview(), session.id);

    expect(item.expectedCount).toBe(41); // 40 roster + 1 thi ghép
    expect(item.fullySubmittedCount).toBe(1); // ROSTER[3]
    expect(item.partialCount).toBe(2); // ROSTER[4] + SV thi ghép
    expect(item.neverAttendedCount).toBe(38);
    expect(
      item.fullySubmittedCount + item.partialCount + item.neverAttendedCount,
    ).toBe(item.expectedCount);
  }, 30_000);

  it('phiên không gắn lớp: rosterKnown false, neverAttendedCount 0', async () => {
    const session = await createSession(`NoClass ${stamp}`, ['Cau1.docx'], {
      startOffsetMs: -7_200_000,
      endOffsetMs: -3_600_000,
    });
    // Submission phải ghi TRƯỚC khi gỡ lớp: home_class_id là NOT NULL và
    // phải trỏ tới một class có thật.
    await insertSubmission(session.id, session.deliverableIds[0], ROSTER[5], 'collected');
    await detachClass(session.id);

    const item = bySessionId(await fetchOverview(), session.id);

    expect(item.rosterKnown).toBe(false);
    expect(item.neverAttendedCount).toBe(0);
    expect(item.expectedCount).toBe(1);
    expect(item.fullySubmittedCount).toBe(1);
  }, 30_000);

  it('không rò rỉ phiên của giảng viên khác', async () => {
    const otherEmail = `overview_other_${stamp}@example.com`;
    const otherTeacherId = await createTestAccount(dataSource, {
      email: otherEmail,
      password: 'correct-horse-battery',
      role: 'teacher',
    });
    const [foreignCourse] = await dataSource.query(
      `INSERT INTO ${schema}.course (code, name, semester_id)
       SELECT $1, 'Foreign', semester_id FROM ${schema}.course WHERE id = $2 RETURNING id`,
      [`OVF${stamp}`.slice(0, 20), courseId],
    );
    const [foreignClass] = await dataSource.query(
      `INSERT INTO ${schema}.class (course_id, name, teacher_id)
       VALUES ($1, 'N01', $2) RETURNING id`,
      [foreignCourse.id, otherTeacherId],
    );
    const otherLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: otherEmail, password: 'correct-horse-battery' });
    const foreign = await request(app.getHttpServer())
      .post('/exam-sessions')
      .set('Authorization', `Bearer ${otherLogin.body.accessToken}`)
      .send({
        name: `Phiên lạ ${stamp}`,
        classId: foreignClass.id,
        roomId,
        examType: 'TK',
        // Khung riêng, vì phòng dùng chung với các phiên khác của spec.
        // Test này chỉ hỏi "phiên của giảng viên khác có lọt vào danh sách
        // của mình không", giờ giấc không liên quan.
        ...freshFutureWindow(),
        requiredFilenames: ['Cau1.docx'],
      });
    expect(foreign.status).toBe(201);

    const items = await fetchOverview();

    expect(items.some((item) => item.id === foreign.body.id)).toBe(false);
  }, 30_000);
});
