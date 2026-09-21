import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';
import { createTestAccount } from './helpers/create-account';

/**
 * Rubric được ghim vào phiên thi lúc ra đề, không tra lại lúc chấm.
 *
 * Xem docs/superpowers/specs/2026-09-05-session-pinned-rubric-design.md.
 * Test chốt của cả spec nằm ở "CHẤM THEO RUBRIC ĐÃ GHIM" bên dưới: nếu nó
 * đỏ thì vẫn còn một đường resolve động ở đâu đó.
 */
describe('Session-pinned rubric (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  const stamp = Date.now();
  let tokenA: string;
  let idA: string;
  let tokenB: string;
  let courseName: string;
  let classAId: string;
  let otherCourseName: string;
  let roomName: string;

  // Mỗi phiên một ngày riêng: hai phiên chưa kết thúc không được trùng phòng
  // (ex_exam_session_room_overlap). Ngày thay vì giờ, để ExamSessionScheduler
  // không chốt phiên giữa chừng test.
  let dayCursor = 0;
  function freshWindow() {
    dayCursor += 1;
    const start = new Date();
    start.setUTCDate(start.getUTCDate() + dayCursor);
    start.setUTCHours(8, 0, 0, 0);
    const end = new Date(start);
    end.setUTCHours(10);
    return { startTime: start.toISOString(), endTime: end.toISOString() };
  }

  function createSession(token: string, body: Record<string, unknown>) {
    return request(app.getHttpServer())
      .post('/exam-sessions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: `Phiên ${stamp}`,
        roomName,
        semesterName: 'HK kiểm thử',
        examType: 'TK',
        requiredFilenames: ['Cau1.docx'],
        ...freshWindow(),
        ...body,
      });
  }

  async function saveRubric(token: string, label: string) {
    const response = await request(app.getHttpServer())
      .post('/rubrics')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: label, criteria: [{ description: label, maxPoints: 10 }] });
    expect(response.status).toBe(201);
    return response.body as { id: string; version: number };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new PostgresExceptionFilter());
    await app.init();
    dataSource = app.get(DataSource);

    async function teacher(tag: string) {
      const email = `pinned_${tag}_${stamp}@example.com`;
      const id = await createTestAccount(dataSource, {
        email,
        password: 'correct-horse-battery',
        role: 'teacher',
      });
      const login = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password: 'correct-horse-battery' });
      return { id, token: login.body.accessToken as string };
    }

    const a = await teacher('a');
    const b = await teacher('b');
    idA = a.id;
    tokenA = a.token;
    tokenB = b.token;

    const course = { name: 'Môn ghim rubric' };
    courseName = course.name;
    const otherCourse = { name: 'Môn khác' };
    otherCourseName = otherCourse.name;

    const room = { name: `Phòng ghim ${stamp}` };
    roomName = room.name;

    // A và B cùng dạy `courseName` (hai lớp khác nhau) — nền cho §3.2.1.
    const [classA] = await dataSource.query(
      `INSERT INTO examcollect.class (course_name, name, teacher_id)
       VALUES ($1, $2, $3) RETURNING id`,
      [courseName, `Nhóm A ${stamp}`, a.id],
    );
    classAId = classA.id;
    await dataSource.query(
      `INSERT INTO examcollect.class (course_name, name, teacher_id) VALUES ($1, $2, $3)`,
      [courseName, `Nhóm B ${stamp}`, b.id],
    );
    // A cũng dạy môn khác, để dựng case "rubric khác môn".
    await dataSource.query(
      `INSERT INTO examcollect.class (course_name, name, teacher_id) VALUES ($1, $2, $3)`,
      [otherCourseName, `Nhóm môn khác ${stamp}`, a.id],
    );
  });

  afterAll(async () => {
    // Spec này cố tình tạo nhiều phiên trong cùng một phòng; để lại thì
    // constraint trùng lịch sẽ chặn lần chạy sau và migration dựng lại
    // constraint sẽ fail.
    const sessions = await dataSource.query(
      `SELECT id FROM examcollect.exam_session WHERE room_name = $1`,
      [roomName],
    );
    const ids = sessions.map((row: { id: string }) => row.id);
    if (ids.length > 0) {
      await dataSource.query(
        `DELETE FROM examcollect.grading_result WHERE submission_id IN
           (SELECT id FROM examcollect.submission WHERE exam_session_id = ANY($1))`,
        [ids],
      );
      for (const table of [
        'grade_export',
        'submission',
        'agent_connection_event',
        'exam_material',
        'required_deliverable',
      ]) {
        await dataSource.query(
          `DELETE FROM examcollect.${table} WHERE exam_session_id = ANY($1)`,
          [ids],
        );
      }
      await dataSource.query(`DELETE FROM examcollect.exam_session WHERE id = ANY($1)`, [
        ids,
      ]);
    }
    await app.close();
  });

  it('ghim rubric vào phiên và trả lại đúng phiên bản đã ghim', async () => {
    const rubric = await saveRubric(tokenA, 'Tiêu chí v1');

    const created = await createSession(tokenA, { classId: classAId, rubricId: rubric.id });

    expect(created.status).toBe(201);
    expect(created.body.rubricId).toBe(rubric.id);
    expect(created.body.rubricVersion).toBe(rubric.version);
  });

  it('tạo phiên không gắn rubric vẫn được — rubric là tuỳ chọn (§3.1)', async () => {
    const created = await createSession(tokenA, { classId: classAId });

    expect(created.status).toBe(201);
    expect(created.body.rubricId).toBeNull();
    expect(created.body.rubricVersion).toBeNull();
  });

  it('từ chối rubric của giảng viên khác với 400', async () => {
    const foreign = await saveRubric(tokenB, 'Rubric của B');

    const created = await createSession(tokenA, {
      classId: classAId,
      rubricId: foreign.id,
    });

    expect(created.status).toBe(400);
  });

  it('TỪ CHỐI rubric do đồng nghiệp soạn — rubric giờ CÓ CHỦ', async () => {
    // Ca này từng khẳng định điều NGƯỢC LẠI, và cố ý: rubric thuộc MÔN, A và
    // B cùng dạy môn đó nên A dùng được bản của B. Đợt thu hẹp master data
    // gỡ môn ra khỏi quyền sở hữu, nên câu trả lời đổi chiều. Giữ lại ca test
    // thay vì xoá, vì nó là chỗ ghi lại rằng chiều cũ là một lựa chọn chứ
    // không phải một thiếu sót.
    const byB = await saveRubric(tokenB, 'Do B soạn');

    const created = await createSession(tokenA, { classId: classAId, rubricId: byB.id });

    expect(created.status).toBe(400);
  });

  it('CHỐT: chấm theo rubric ĐÃ GHIM, không theo bản active mới nhất (§8.1)', async () => {
    const v1 = await saveRubric(tokenA, 'Rubric hai bản');
    const created = await createSession(tokenA, {
      classId: classAId,
      rubricId: v1.id,
    });
    expect(created.status).toBe(201);

    // Bản 2 ra đời SAU khi phiên đã ghim v1, và trở thành bản active của môn.
    // Dưới findActive() cũ, lượt chấm dưới đây sẽ dùng v2 — đó là bug.
    const v2 = await saveRubric(tokenA, 'Rubric hai bản');
    expect(v2.version).toBeGreaterThan(v1.version);

    // Một bài đã thu, để có cái mà chấm. Trigger validate_submission_lifecycle
    // chỉ cho INSERT ở 'received'/'invalid'; tới 'collected' phải đi qua
    // UPDATE từng bước, y như submission.service.ts làm ở luồng thật.
    const [submission] = await dataSource.query(
      `INSERT INTO examcollect.submission
         (exam_session_id, required_deliverable_id, student_mssv,
          student_name_input, home_class_id, home_teacher_id, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'received') RETURNING id`,
      [
        created.body.id,
        created.body.requiredDeliverables[0].id,
        `SVP${stamp}`.slice(0, 20),
        'SV Ghim',
        classAId,
        idA,
      ],
    );
    await dataSource.query(
      `UPDATE examcollect.submission SET status = 'validated' WHERE id = $1`,
      [submission.id],
    );
    await dataSource.query(
      `UPDATE examcollect.submission SET status = 'collected' WHERE id = $1`,
      [submission.id],
    );

    const started = await request(app.getHttpServer())
      .post(`/exam-sessions/${created.body.id}/start-grading`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(started.status).toBe(200);
    // ĐÂY là khẳng định của cả spec.
    expect(started.body.rubricId).toBe(v1.id);
    expect(started.body.rubricVersion).toBe(v1.version);

    const [result] = await dataSource.query(
      `SELECT g.rubric_id_version FROM examcollect.grading_result g
       WHERE g.submission_id = $1`,
      [submission.id],
    );
    expect(result.rubric_id_version).toBe(v1.id);
  });

  it('từ chối chấm khi phiên chưa gắn rubric, và nói về PHIÊN THI', async () => {
    const created = await createSession(tokenA, { classId: classAId });

    const started = await request(app.getHttpServer())
      .post(`/exam-sessions/${created.body.id}/start-grading`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(started.status).toBe(400);
    // Thông báo cũ nói "Môn học này chưa có rubric" — sai chỗ: môn có thể
    // đủ rubric mà phiên vẫn chưa gắn.
    expect(started.body.message).toContain('Phiên thi');
  });

  describe('PATCH /exam-sessions/:id/rubric', () => {
    function setRubric(token: string, sessionId: string, rubricId: string | null) {
      return request(app.getHttpServer())
        .patch(`/exam-sessions/${sessionId}/rubric`)
        .set('Authorization', `Bearer ${token}`)
        .send({ rubricId });
    }

    /**
     * Một GradingResult là đủ để khoá — không cần bài nộp hợp lệ. Trigger
     * validate_submission_lifecycle cho INSERT thẳng ở 'invalid'.
     */
    async function attachOneGradingResult(sessionId: string, deliverableId: string, rubricId: string) {
      const [submission] = await dataSource.query(
        `INSERT INTO examcollect.submission
           (exam_session_id, required_deliverable_id, student_mssv,
            student_name_input, home_class_id, home_teacher_id, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'invalid') RETURNING id`,
        [
          sessionId,
          deliverableId,
          `SVL${stamp}`.slice(0, 20),
          'SV Khoá',
          classAId,
          idA,
        ],
      );
      await dataSource.query(
        `INSERT INTO examcollect.grading_result
           (submission_id, rubric_id_version, grading_triggered_by, status)
         VALUES ($1, $2, $3, 'ai_grading')`,
        [submission.id, rubricId, idA],
      );
    }

    it('gắn rubric cho phiên chưa chấm', async () => {
      const created = await createSession(tokenA, { classId: classAId });
      const rubric = await saveRubric(tokenA, 'Gắn sau');

      const patched = await setRubric(tokenA, created.body.id, rubric.id);

      expect(patched.status).toBe(200);
      expect(patched.body.rubricId).toBe(rubric.id);
      expect(patched.body.rubricVersion).toBe(rubric.version);
    });

    it('gỡ rubric bằng null', async () => {
      const rubric = await saveRubric(tokenA, 'Sẽ gỡ');
      const created = await createSession(tokenA, {
        classId: classAId,
        rubricId: rubric.id,
      });

      const patched = await setRubric(tokenA, created.body.id, null);

      expect(patched.status).toBe(200);
      expect(patched.body.rubricId).toBeNull();
      expect(patched.body.rubricVersion).toBeNull();
    });

    it('từ chối rubric của giảng viên khác với 400', async () => {
      const created = await createSession(tokenA, { classId: classAId });
      const foreign = await saveRubric(tokenB, 'Khác chủ');

      const patched = await setRubric(tokenA, created.body.id, foreign.id);

      expect(patched.status).toBe(400);
    });

    it('từ chối người không sở hữu phiên với 403', async () => {
      const created = await createSession(tokenA, { classId: classAId });
      const rubric = await saveRubric(tokenA, 'Của A');

      const patched = await setRubric(tokenB, created.body.id, rubric.id);

      expect(patched.status).toBe(403);
    });

    it('từ chối với 409 khi phiên đã có kết quả chấm', async () => {
      const rubric = await saveRubric(tokenA, 'Đã chấm');
      const created = await createSession(tokenA, {
        classId: classAId,
        rubricId: rubric.id,
      });
      await attachOneGradingResult(
        created.body.id,
        created.body.requiredDeliverables[0].id,
        rubric.id,
      );

      const other = await saveRubric(tokenA, 'Đổi sau khi chấm');
      const patched = await setRubric(tokenA, created.body.id, other.id);

      expect(patched.status).toBe(409);
    });
  });
});
