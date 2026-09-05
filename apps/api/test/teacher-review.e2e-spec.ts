import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';
import { createTestAccount } from './helpers/create-account';

/**
 * Duyệt và chốt điểm — spec docs/superpowers/specs/2026-09-05-teacher-review-design.md.
 *
 * Ca quan trọng nhất ở đây là cổng trạng thái (§6.1.1): duyệt khi AI còn đang
 * chấm phải bị từ chối VÀ không được ghi dòng nào. Bản nháp đầu của spec ghi
 * dòng đó ra rồi im lặng bỏ qua.
 */
describe('TeacherReview (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  const stamp = Date.now();
  let tokenA: string;
  let idA: string;
  let tokenB: string;
  let courseId: string;
  let classId: string;
  let roomId: string;
  let rubricId: string;
  let criterionIds: string[];

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

  /** Một phiên có đúng một bài đã thu, CHƯA chấm. */
  async function sessionWithCollectedSubmission(): Promise<{
    sessionId: string;
    submissionId: string;
  }> {
    const created = await request(app.getHttpServer())
      .post('/exam-sessions')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        name: `Phiên duyệt ${stamp}-${dayCursor}`,
        classId,
        roomId,
        examType: 'TK',
        rubricId,
        requiredFilenames: ['Cau1.txt'],
        ...freshWindow(),
      });
    expect(created.status).toBe(201);

    const mssv = `SVR${stamp}${dayCursor}`.slice(0, 20);
    const [submission] = await dataSource.query(
      `INSERT INTO examcollect.submission
         (exam_session_id, required_deliverable_id, student_mssv,
          student_name_input, home_class_id, home_teacher_id, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'received') RETURNING id`,
      [
        created.body.id,
        created.body.requiredDeliverables[0].id,
        mssv,
        'SV Duyệt',
        classId,
        idA,
      ],
    );
    // Trigger validate_submission_lifecycle chỉ cho INSERT ở received/invalid.
    await dataSource.query(
      `UPDATE examcollect.submission SET status = 'validated' WHERE id = $1`,
      [submission.id],
    );
    await dataSource.query(
      `UPDATE examcollect.submission SET status = 'collected' WHERE id = $1`,
      [submission.id],
    );

    return { sessionId: created.body.id, submissionId: submission.id };
  }

  /** Một phiên đã chấm xong, trả về id kết quả chấm của một bài. */
  async function sessionWithOneGradedSubmission(): Promise<{
    sessionId: string;
    resultId: string;
  }> {
    const { sessionId, submissionId } = await sessionWithCollectedSubmission();

    const started = await request(app.getHttpServer())
      .post(`/exam-sessions/${sessionId}/start-grading`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(started.status).toBe(200);

    const [result] = await dataSource.query(
      `SELECT id FROM examcollect.grading_result WHERE submission_id = $1`,
      [submissionId],
    );
    return { sessionId, resultId: result.id };
  }

  /**
   * Một kết quả chấm ở đúng trạng thái muốn có, dựng bằng đường HỢP PHÁP.
   *
   * `validate_grading_result_lifecycle` từ chối MỌI transition đi ngược
   * ("Invalid grading result status transition: flagged_for_review ->
   * ai_grading"), nên không thể lùi một kết quả đã chấm về trạng thái sớm hơn.
   * Cách đúng là INSERT mới — trigger cho phép đúng một giá trị lúc INSERT là
   * `ai_grading` — rồi đi tiến từng bước theo đúng bản đồ:
   *
   *   ai_grading → ai_graded → auto_approved
   *
   * `aiTotalScore`/`criterionResults` để NULL: những ca dùng helper này không
   * quan tâm tới nội dung AI, chỉ quan tâm tới trạng thái.
   */
  const LEGAL_PATH = ['ai_grading', 'ai_graded', 'auto_approved'] as const;

  async function resultAtStatus(
    target: (typeof LEGAL_PATH)[number],
  ): Promise<{ sessionId: string; resultId: string }> {
    const { sessionId, submissionId } = await sessionWithCollectedSubmission();

    const [result] = await dataSource.query(
      `INSERT INTO examcollect.grading_result
         (submission_id, rubric_id_version, grading_triggered_by, status)
       VALUES ($1, $2, $3, 'ai_grading') RETURNING id`,
      [submissionId, rubricId, idA],
    );

    for (const step of LEGAL_PATH.slice(1, LEGAL_PATH.indexOf(target) + 1)) {
      await dataSource.query(
        `UPDATE examcollect.grading_result SET status = $2 WHERE id = $1`,
        [result.id, step],
      );
    }
    return { sessionId, resultId: result.id };
  }

  function fullMarks() {
    return {
      criteria: criterionIds.map((criterionId) => ({
        criterionId,
        verdict: 'met' as const,
        points: 5,
      })),
    };
  }

  function submitReview(token: string, resultId: string, body: object) {
    return request(app.getHttpServer())
      .post(`/grading-results/${resultId}/review`)
      .set('Authorization', `Bearer ${token}`)
      .send(body);
  }

  async function countReviews(resultId: string): Promise<number> {
    const [row] = await dataSource.query(
      `SELECT count(*)::int AS n FROM examcollect.teacher_review
       WHERE grading_result_id = $1`,
      [resultId],
    );
    return row.n;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new PostgresExceptionFilter());
    await app.init();
    dataSource = app.get(DataSource);

    async function teacher(tag: string) {
      const email = `review_${tag}_${stamp}@example.com`;
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

    const [semester] = await dataSource.query(
      `INSERT INTO examcollect.semester (name, start_date, end_date)
       VALUES ($1, '2026-01-01', '2026-06-01') RETURNING id`,
      [`Review Semester ${stamp}`],
    );
    const [course] = await dataSource.query(
      `INSERT INTO examcollect.course (code, name, semester_id)
       VALUES ($1, 'Môn duyệt điểm', $2) RETURNING id`,
      [`REV${stamp}`.slice(0, 20), semester.id],
    );
    courseId = course.id;
    const [room] = await dataSource.query(
      `INSERT INTO examcollect.room (name, capacity) VALUES ($1, 30) RETURNING id`,
      [`Phòng duyệt ${stamp}`],
    );
    roomId = room.id;
    const [klass] = await dataSource.query(
      `INSERT INTO examcollect.class (course_id, name, teacher_id)
       VALUES ($1, $2, $3) RETURNING id`,
      [courseId, `Nhóm duyệt ${stamp}`, idA],
    );
    classId = klass.id;
    await dataSource.query(
      `INSERT INTO examcollect.enrollment
         (student_mssv, student_name, course_id, home_class_id, home_teacher_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [`SVR${stamp}`.slice(0, 20), 'SV Duyệt', courseId, classId, idA],
    );

    const rubric = await request(app.getHttpServer())
      .post(`/courses/${courseId}/rubrics`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        criteria: [
          { description: 'Trình bày thuật toán rõ ràng', maxPoints: 5 },
          { description: 'Có kiểm thử cho trường hợp biên', maxPoints: 5 },
        ],
      });
    expect(rubric.status).toBe(201);
    rubricId = rubric.body.id;
    criterionIds = rubric.body.criteria.map((c: { id: string }) => c.id);
  });

  afterAll(async () => {
    const sessions = await dataSource.query(
      `SELECT id FROM examcollect.exam_session WHERE room_id = $1`,
      [roomId],
    );
    const ids = sessions.map((row: { id: string }) => row.id);
    if (ids.length > 0) {
      await dataSource.query(
        `DELETE FROM examcollect.teacher_review WHERE grading_result_id IN
           (SELECT g.id FROM examcollect.grading_result g
            JOIN examcollect.submission s ON s.id = g.submission_id
            WHERE s.exam_session_id = ANY($1))`,
        [ids],
      );
      await dataSource.query(
        `DELETE FROM examcollect.grading_result WHERE submission_id IN
           (SELECT id FROM examcollect.submission WHERE exam_session_id = ANY($1))`,
        [ids],
      );
      for (const table of [
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

  it('tạo một dòng review và chuyển sang teacher_reviewed', async () => {
    const { resultId } = await sessionWithOneGradedSubmission();

    const response = await submitReview(tokenA, resultId, fullMarks());

    expect(response.status).toBe(201);
    expect(response.body.finalScore).toBe(10);
    expect(await countReviews(resultId)).toBe(1);

    const [row] = await dataSource.query(
      `SELECT status FROM examcollect.grading_result WHERE id = $1`,
      [resultId],
    );
    expect(row.status).toBe('teacher_reviewed');
  });

  it('duyệt lần hai tạo dòng THỨ HAI, status giữ nguyên, không lỗi', async () => {
    const { resultId } = await sessionWithOneGradedSubmission();
    expect((await submitReview(tokenA, resultId, fullMarks())).status).toBe(201);

    const second = await submitReview(tokenA, resultId, {
      criteria: criterionIds.map((criterionId) => ({
        criterionId,
        verdict: 'partially_met' as const,
        points: 2.5,
      })),
    });

    expect(second.status).toBe(201);
    expect(second.body.finalScore).toBe(5);
    expect(await countReviews(resultId)).toBe(2);
    const [row] = await dataSource.query(
      `SELECT status FROM examcollect.grading_result WHERE id = $1`,
      [resultId],
    );
    expect(row.status).toBe('teacher_reviewed');
  });

  it('server tính finalScore bằng TỔNG, bỏ qua tổng client gửi lên', async () => {
    const { resultId } = await sessionWithOneGradedSubmission();

    const response = await submitReview(tokenA, resultId, {
      ...fullMarks(),
      finalScore: 999,
    });

    expect(response.status).toBe(201);
    expect(response.body.finalScore).toBe(10);
  });

  it('CỔNG TRẠNG THÁI: duyệt khi ai_grading → 409 và KHÔNG ghi dòng nào (§6.1.1)', async () => {
    const { resultId } = await resultAtStatus('ai_grading');

    const response = await submitReview(tokenA, resultId, fullMarks());

    expect(response.status).toBe(409);
    // Cả hai vế: chỉ kiểm mã lỗi thì một hiện thực "ghi dòng rồi mới ném" vẫn pass.
    expect(await countReviews(resultId)).toBe(0);
  });

  it('CỔNG TRẠNG THÁI: duyệt khi ai_graded → 409 và không ghi dòng nào', async () => {
    const { resultId } = await resultAtStatus('ai_graded');

    const response = await submitReview(tokenA, resultId, fullMarks());

    expect(response.status).toBe(409);
    expect(await countReviews(resultId)).toBe(0);
  });

  it('từ chối giảng viên không sở hữu phiên với 403', async () => {
    const { resultId } = await sessionWithOneGradedSubmission();

    const response = await submitReview(tokenB, resultId, fullMarks());

    expect(response.status).toBe(403);
    expect(await countReviews(resultId)).toBe(0);
  });

  it('từ chối khi thiếu một tiêu chí với 400', async () => {
    const { resultId } = await sessionWithOneGradedSubmission();

    const response = await submitReview(tokenA, resultId, {
      criteria: [{ criterionId: criterionIds[0], verdict: 'met', points: 5 }],
    });

    expect(response.status).toBe(400);
    expect(await countReviews(resultId)).toBe(0);
  });

  it('từ chối points vượt maxPoints với 400', async () => {
    const { resultId } = await sessionWithOneGradedSubmission();

    const response = await submitReview(tokenA, resultId, {
      criteria: criterionIds.map((criterionId) => ({
        criterionId,
        verdict: 'met' as const,
        points: 99,
      })),
    });

    expect(response.status).toBe(400);
    expect(await countReviews(resultId)).toBe(0);
  });

  it('từ chối criterionId không thuộc rubric của kết quả này với 400', async () => {
    const { resultId } = await sessionWithOneGradedSubmission();

    const response = await submitReview(tokenA, resultId, {
      criteria: [
        { criterionId: '00000000-0000-4000-8000-000000000000', verdict: 'met', points: 5 },
        { criterionId: criterionIds[1], verdict: 'met', points: 5 },
      ],
    });

    expect(response.status).toBe(400);
    expect(await countReviews(resultId)).toBe(0);
  });

  describe('POST /exam-sessions/:id/finalize-grades', () => {
    function finalize(token: string, sessionId: string) {
      return request(app.getHttpServer())
        .post(`/exam-sessions/${sessionId}/finalize-grades`)
        .set('Authorization', `Bearer ${token}`);
    }

    async function statusesOf(sessionId: string): Promise<string[]> {
      const rows = await dataSource.query(
        `SELECT g.status FROM examcollect.grading_result g
         JOIN examcollect.submission s ON s.id = g.submission_id
         WHERE s.exam_session_id = $1`,
        [sessionId],
      );
      return rows.map((r: { status: string }) => r.status);
    }

    it('từ chối 409 khi còn bài chưa duyệt xong', async () => {
      const { sessionId } = await resultAtStatus('ai_grading');

      const response = await finalize(tokenA, sessionId);

      expect(response.status).toBe(409);
      expect(await statusesOf(sessionId)).toEqual(['ai_grading']);
    });

    it('từ chối 400 khi phiên chưa chấm bài nào', async () => {
      const { sessionId } = await sessionWithCollectedSubmission();

      const response = await finalize(tokenA, sessionId);

      expect(response.status).toBe(400);
    });

    it('từ chối giảng viên không sở hữu phiên với 403', async () => {
      const { sessionId } = await sessionWithOneGradedSubmission();

      const response = await finalize(tokenB, sessionId);

      expect(response.status).toBe(403);
    });

    it('sinh TeacherReview THẬT cho bài auto_approved, mang id người bấm nút', async () => {
      // Provider keyword-match luôn cho confidence thấp nên start-grading
      // đưa bài về flagged_for_review — không lùi ngược được. Dựng thẳng một
      // kết quả ở auto_approved qua đường tiến hợp lệ.
      const { sessionId, resultId } = await resultAtStatus('auto_approved');

      const response = await finalize(tokenA, sessionId);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ reviewedByHand: 0, acceptedAsProposed: 1 });
      expect(await statusesOf(sessionId)).toEqual(['finalized']);

      const [row] = await dataSource.query(
        `SELECT teacher_id, final_score FROM examcollect.teacher_review
         WHERE grading_result_id = $1`,
        [resultId],
      );
      // Không bài nào nhảy thẳng sang finalized: bảng điểm cuối cùng không được
      // có dòng nào không ai đứng tên.
      expect(row.teacher_id).toBe(idA);
      expect(Number(row.final_score)).toBeGreaterThanOrEqual(0);
    });

    it('đếm riêng bài đã duyệt tay và bài chấp nhận theo đề xuất AI', async () => {
      const { sessionId, resultId } = await sessionWithOneGradedSubmission();
      expect((await submitReview(tokenA, resultId, fullMarks())).status).toBe(201);

      const response = await finalize(tokenA, sessionId);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ reviewedByHand: 1, acceptedAsProposed: 0 });
      expect(await statusesOf(sessionId)).toEqual(['finalized']);
    });

    it('gọi lần hai là vô hại: {0,0}, không lỗi, không dòng review mới', async () => {
      const { sessionId, resultId } = await sessionWithOneGradedSubmission();
      expect((await submitReview(tokenA, resultId, fullMarks())).status).toBe(201);
      expect((await finalize(tokenA, sessionId)).status).toBe(200);
      const before = await countReviews(resultId);

      const second = await finalize(tokenA, sessionId);

      expect(second.status).toBe(200);
      expect(second.body).toEqual({ reviewedByHand: 0, acceptedAsProposed: 0 });
      expect(await countReviews(resultId)).toBe(before);
    });
  });
});
