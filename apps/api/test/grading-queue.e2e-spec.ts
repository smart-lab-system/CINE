import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';
import { createTestAccount } from './helpers/create-account';

/**
 * Chấm điểm trên hàng đợi (CLAUDE.md §7.1.3).
 *
 * Điều quan trọng nhất ở đây KHÔNG phải là "job có chạy không" — mà là
 * trạng thái MỚI mà việc chuyển sang bất đồng bộ tạo ra: một phiên đang
 * chấm dở. Trước Task 4 trạng thái đó không tồn tại, nên mọi đường code
 * giả định "chấm xong hoặc chưa chấm" đều chưa biết về nó.
 */
describe('Chấm điểm trên hàng đợi (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  let token: string;
  let teacherId: string;
  let courseId: string;

  const PASSWORD = 'correct-horse-battery';
  let seedCursor = 0;

  async function seedSessionWithSubmissions(count: number): Promise<string> {
    seedCursor += 1;
    const suffix = `${seedCursor}_${Date.now()}`;
    const [room] = await dataSource.query(
      `INSERT INTO examcollect.room (name, capacity) VALUES ($1, 40) RETURNING id`,
      [`Queue Room ${suffix}`],
    );
    const [klass] = await dataSource.query(
      `INSERT INTO examcollect.class (course_id, name, teacher_id)
       VALUES ($1, $2, $3) RETURNING id`,
      [courseId, `Nhóm ${suffix}`, teacherId],
    );

    const rubric = await request(app.getHttpServer())
      .post(`/courses/${courseId}/rubrics`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: `Rubric ${suffix}`,
        criteria: [{ description: 'Trình bày thuật toán', maxPoints: 10 }],
      });
    expect(rubric.status).toBe(201);

    const created = await request(app.getHttpServer())
      .post('/exam-sessions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: `Phiên chấm ${suffix}`,
        classId: klass.id,
        roomId: room.id,
        examType: 'CK',
        rubricId: rubric.body.id,
        startTime: new Date(Date.now() - 60_000).toISOString(),
        endTime: new Date(Date.now() + 3_600_000).toISOString(),
        requiredFilenames: ['Cau1.docx'],
      });
    expect(created.status).toBe(201);
    const sessionId = created.body.id as string;
    const deliverableId = created.body.requiredDeliverables[0].id as string;

    for (let i = 1; i <= count; i++) {
      const mssv = `QB${seedCursor}N${i}${Date.now() % 10000}`.slice(0, 20);
      await dataSource.query(
        `INSERT INTO examcollect.enrollment
           (student_mssv, student_name, course_id, home_class_id, home_teacher_id)
         VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING`,
        [mssv, `Sinh viên ${i}`, courseId, klass.id, teacherId],
      );
      // Bài nộp ghi thẳng: bộ test này về HÀNG ĐỢI, không về đường
      // upload — đường đó đã có bộ riêng.
      const [row] = await dataSource.query(
        `INSERT INTO examcollect.submission
           (exam_session_id, required_deliverable_id, student_mssv, student_name_input,
            home_class_id, home_teacher_id, storage_key, checksum, file_size,
            submitted_via, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 10, 'normal', 'received') RETURNING id`,
        [
          sessionId,
          deliverableId,
          mssv,
          `Sinh viên ${i}`,
          klass.id,
          teacherId,
          `submissions/${sessionId}/${mssv}/${deliverableId}`,
          'a'.repeat(64),
        ],
      );
      await dataSource.query(
        `UPDATE examcollect.submission SET status = 'validated' WHERE id = $1`,
        [row.id],
      );
      await dataSource.query(
        `UPDATE examcollect.submission SET status = 'collected' WHERE id = $1`,
        [row.id],
      );
    }

    return sessionId;
  }

  function startGrading(sessionId: string) {
    return request(app.getHttpServer())
      .post(`/exam-sessions/${sessionId}/start-grading`)
      .set('Authorization', `Bearer ${token}`);
  }

  function progress(sessionId: string) {
    return request(app.getHttpServer())
      .get(`/exam-sessions/${sessionId}/grading-progress`)
      .set('Authorization', `Bearer ${token}`);
  }

  async function waitForGrading(sessionId: string, timeoutMs = 20_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const res = await progress(sessionId);
      if (res.body.total > 0 && res.body.pending === 0) return;
      if (Date.now() > deadline) {
        throw new Error(`chưa chấm xong sau ${timeoutMs}ms: ${JSON.stringify(res.body)}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new PostgresExceptionFilter());
    await app.init();

    dataSource = app.get(DataSource);
    const email = `queue_gv_${Date.now()}@example.com`;
    teacherId = await createTestAccount(dataSource, { email, password: PASSWORD, role: 'teacher' });
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: PASSWORD });
    token = login.body.accessToken;

    const [semester] = await dataSource.query(
      `INSERT INTO examcollect.semester (name, start_date, end_date)
       VALUES ($1, '2026-01-01', '2026-06-01') RETURNING id`,
      [`HK Queue ${Date.now()}`],
    );
    const [course] = await dataSource.query(
      `INSERT INTO examcollect.course (code, name, semester_id)
       VALUES ($1, 'Queue Course', $2) RETURNING id`,
      [`QC${Date.now()}`.slice(0, 20), semester.id],
    );
    courseId = course.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('trả về NGAY với số đã xếp hàng, rồi chấm ở nền', async () => {
    const sessionId = await seedSessionWithSubmissions(3);

    const started = Date.now();
    const res = await startGrading(sessionId);

    expect(res.status).toBe(200);
    expect(res.body.queued).toBe(3);
    // Trả về ngay là toàn bộ điểm của việc chuyển sang hàng đợi: với model
    // thật, 3-15s/bài × 40 bài vượt mọi HTTP timeout.
    expect(Date.now() - started).toBeLessThan(3_000);

    await waitForGrading(sessionId);
    const done = await progress(sessionId);
    expect(done.body).toMatchObject({ total: 3, pending: 0, done: 3 });
  });

  it('MỌI dòng chấm tồn tại NGAY khi xếp hàng, trước khi job nào chạy', async () => {
    // Đây là điều kiện làm cho ca chặn bên dưới hoạt động. Nếu dòng chỉ
    // được tạo bên trong worker, một job chưa được nhặt sẽ không có dòng
    // nào — và `finalizeGrades`, vốn truy theo exam_session_id, sẽ không
    // nhìn thấy nó để mà chặn.
    const sessionId = await seedSessionWithSubmissions(3);

    await startGrading(sessionId);

    const rows = await dataSource.query(
      `SELECT count(*)::int AS n FROM examcollect.grading_result g
         JOIN examcollect.submission s ON s.id = g.submission_id
        WHERE s.exam_session_id = $1`,
      [sessionId],
    );
    expect(rows[0].n).toBe(3);
    await waitForGrading(sessionId);
  });

  it('KHÔNG chốt điểm được khi còn bài đang chấm', async () => {
    // Trạng thái mới mà Task 4 tạo ra. Chốt lúc 20/48 đã xong sẽ cho một
    // bảng điểm thiếu 28 người — và chúng không bị bỏ qua hay chốt 0 điểm,
    // chúng đơn giản là không có mặt, rồi nằm lại ở `auto_approved` vĩnh
    // viễn trên một phiên giảng viên tin là đã đóng.
    const sessionId = await seedSessionWithSubmissions(3);
    await startGrading(sessionId);

    const finalize = await request(app.getHttpServer())
      .post(`/exam-sessions/${sessionId}/finalize-grades`)
      .set('Authorization', `Bearer ${token}`);

    expect(finalize.status).toBe(409);
    expect(finalize.body.message).toMatch(/chưa duyệt xong/i);
    await waitForGrading(sessionId);
  });

  it('bấm hai lần không tạo hai lượt chấm cho một bài', async () => {
    const sessionId = await seedSessionWithSubmissions(2);

    await startGrading(sessionId);
    const second = await startGrading(sessionId);

    expect(second.body.queued + second.body.alreadyGraded).toBe(2);
    await waitForGrading(sessionId);

    const rows = await dataSource.query(
      `SELECT g.submission_id, count(*)::int AS n
         FROM examcollect.grading_result g
         JOIN examcollect.submission s ON s.id = g.submission_id
        WHERE s.exam_session_id = $1
        GROUP BY g.submission_id`,
      [sessionId],
    );
    expect(rows.every((row: { n: number }) => row.n === 1)).toBe(true);
  });

  it('tiến độ tính theo PHIÊN, không lẫn phiên khác', async () => {
    // `queue.getJobCounts()` đếm toàn hàng đợi, nên nếu tiến độ đọc từ đó
    // thì hai giảng viên chấm cùng lúc sẽ thấy con số của nhau. Nguồn
    // đúng là đếm `grading_result` theo exam_session_id.
    const a = await seedSessionWithSubmissions(2);
    const b = await seedSessionWithSubmissions(3);

    await startGrading(a);
    await startGrading(b);
    await waitForGrading(a);
    await waitForGrading(b);

    expect((await progress(a)).body.total).toBe(2);
    expect((await progress(b)).body.total).toBe(3);
  });

  it('tiến độ tách con số của phiên khỏi sức khoẻ hàng đợi', async () => {
    const sessionId = await seedSessionWithSubmissions(1);
    await startGrading(sessionId);
    await waitForGrading(sessionId);

    const res = await progress(sessionId);

    expect(res.body).toMatchObject({ total: 1, pending: 0, done: 1 });
    // `queue` là câu hỏi KHÁC — "hàng đợi có kẹt không" — và nó tồn tại
    // riêng chứ không trộn vào con số tiến độ.
    expect(res.body.queue).toEqual(
      expect.objectContaining({
        waiting: expect.any(Number),
        active: expect.any(Number),
        failed: expect.any(Number),
      }),
    );
  });

  it('đối soát: bài treo ở ai_grading mà queue mất job → xếp hàng lại', async () => {
    // Redis mất sạch trong khi grading_result vẫn nằm nguyên ở Postgres:
    // dòng ở `ai_grading` không còn job nào để chấm, và thanh tiến độ của
    // giảng viên đứng yên mãi mãi. Sự thật ở DB, không ở queue.
    const sessionId = await seedSessionWithSubmissions(2);

    // Dựng ĐÚNG tình huống thật: dòng chấm tồn tại ở `ai_grading` nhưng
    // CHƯA TỪNG được chấm và không có job nào — đó chính là trạng thái sau
    // khi Redis mất sạch giữa lúc `startGrading` vừa tạo xong các dòng.
    //
    // KHÔNG tua ngược một dòng đã chấm: `trg_grading_result_guard_ai_immutable`
    // từ chối, và nó từ chối ĐÚNG (Security rule 6). Việc test phải lách
    // một ràng buộc an toàn là dấu hiệu test đang dựng sai tình huống.
    const [rubric] = await dataSource.query(
      `INSERT INTO examcollect.rubric (course_id, version)
       SELECT course_id, 9000 + $2 FROM examcollect.exam_session WHERE id = $1
       RETURNING id`,
      [sessionId, seedCursor],
    );
    const subs = await dataSource.query(
      `SELECT id FROM examcollect.submission WHERE exam_session_id = $1`,
      [sessionId],
    );
    for (const sub of subs) {
      await dataSource.query(
        `INSERT INTO examcollect.grading_result
           (submission_id, rubric_id_version, grading_triggered_by, status)
         VALUES ($1, $2, $3, 'ai_grading')`,
        [sub.id, rubric.id, teacherId],
      );
    }
    expect((await progress(sessionId)).body.pending).toBe(2);

    const res = await request(app.getHttpServer())
      .post(`/exam-sessions/${sessionId}/regrade-stuck`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.stuck).toBe(2);
    expect(res.body.requeued).toBeGreaterThan(0);
    await waitForGrading(sessionId);
  });

  it('đối soát khi KHÔNG có bài nào treo → không tạo job nào', async () => {
    // Bấm nhiều lần phải vô hại: đây là nút mà giảng viên sẽ bấm khi lo
    // lắng, tức bấm nhiều lần liên tiếp.
    const sessionId = await seedSessionWithSubmissions(1);
    await startGrading(sessionId);
    await waitForGrading(sessionId);

    const res = await request(app.getHttpServer())
      .post(`/exam-sessions/${sessionId}/regrade-stuck`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ stuck: 0, requeued: 0 });
  });

  it('giảng viên không phải chủ phiên không đối soát được', async () => {
    const sessionId = await seedSessionWithSubmissions(1);
    const otherEmail = `queue_regrade_${Date.now()}@example.com`;
    await createTestAccount(dataSource, {
      email: otherEmail,
      password: PASSWORD,
      role: 'teacher',
    });
    const otherLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: otherEmail, password: PASSWORD });

    const res = await request(app.getHttpServer())
      .post(`/exam-sessions/${sessionId}/regrade-stuck`)
      .set('Authorization', `Bearer ${otherLogin.body.accessToken}`);

    expect(res.status).toBe(403);
  });

  it('giảng viên không phải chủ phiên không xem được tiến độ', async () => {
    const sessionId = await seedSessionWithSubmissions(1);
    const otherEmail = `queue_other_${Date.now()}@example.com`;
    await createTestAccount(dataSource, {
      email: otherEmail,
      password: PASSWORD,
      role: 'teacher',
    });
    const otherLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: otherEmail, password: PASSWORD });

    const res = await request(app.getHttpServer())
      .get(`/exam-sessions/${sessionId}/grading-progress`)
      .set('Authorization', `Bearer ${otherLogin.body.accessToken}`);

    expect(res.status).toBe(403);
  });
});
