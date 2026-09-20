import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';
import { createTestAccount } from './helpers/create-account';

/**
 * `GET /exam-sessions/:id/grading-results` phải trả ra ĐẦU RA CỦA LƯỢT PHẢN
 * BIỆN — spec 2026-09-16-grading-ui-design.md §1.2①.
 *
 * Trước bộ test này, `gradeOne()` ghi `advocate_opinion` và `context_used_*`
 * xuống DB còn `listForSession()` không map chúng ra. Nghĩa là kể cả khi
 * lượt phản biện chạy, không màn hình nào đọc được kết quả của nó — một
 * tính năng hoàn chỉnh ở tầng ghi và vô hình ở tầng đọc.
 */
describe('GradingResultView — advocate và ngữ cảnh (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  const stamp = Date.now();
  let tokenA: string;
  let idA: string;
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

  /** Một phiên có đúng một bài đã thu, chưa chấm. */
  async function sessionWithCollectedSubmission(): Promise<{
    sessionId: string;
    submissionId: string;
  }> {
    const created = await request(app.getHttpServer())
      .post('/exam-sessions')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        name: `Phiên view ${stamp}-${dayCursor}`,
        classId,
        roomId,
        examType: 'TK',
        rubricId,
        requiredFilenames: ['Cau1.txt'],
        ...freshWindow(),
      });
    expect(created.status).toBe(201);

    const mssv = `SVV${stamp}${dayCursor}`.slice(0, 20);
    const [submission] = await dataSource.query(
      `INSERT INTO examcollect.submission
         (exam_session_id, required_deliverable_id, student_mssv,
          student_name_input, home_class_id, home_teacher_id, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'received') RETURNING id`,
      [created.body.id, created.body.requiredDeliverables[0].id, mssv, 'SV View', classId, idA],
    );
    // Trigger vòng đời chỉ nhận `received`/`invalid` lúc INSERT.
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

  /**
   * Một kết quả chấm đã hoàn tất, có hoặc không có ý kiến phản biện.
   *
   * `ai_total_score` và mọi trường AI phải ghi trong CÙNG MỘT update:
   * `guard_grading_result_ai_immutable` đóng băng tất cả ngay khi
   * `ai_total_score` có giá trị, nên tách làm hai lượt ghi thì lượt thứ hai
   * bị DB từ chối.
   */
  async function gradedResult(opts: {
    advocate: object | null;
    contextQuestion: boolean | null;
    contextModelAnswer: boolean | null;
  }): Promise<{ sessionId: string; resultId: string }> {
    const { sessionId, submissionId } = await sessionWithCollectedSubmission();

    const [result] = await dataSource.query(
      `INSERT INTO examcollect.grading_result
         (submission_id, rubric_id_version, grading_triggered_by, status)
       VALUES ($1, $2, $3, 'ai_grading') RETURNING id`,
      [submissionId, rubricId, idA],
    );

    const criterionResults = criterionIds.map((criterionId) => ({
      criterionId,
      verdict: 'not_met',
      points: 0,
      evidence: '',
      check: 'empty',
    }));

    await dataSource.query(
      `UPDATE examcollect.grading_result
          SET status = 'ai_graded',
              ai_total_score = 0,
              confidence = 0.2,
              criterion_results = $2::jsonb,
              advocate_opinion = $3::jsonb,
              context_used_question = $4,
              context_used_model_answer = $5
        WHERE id = $1`,
      [
        result.id,
        JSON.stringify(criterionResults),
        opts.advocate === null ? null : JSON.stringify(opts.advocate),
        opts.contextQuestion,
        opts.contextModelAnswer,
      ],
    );
    await dataSource.query(
      `UPDATE examcollect.grading_result SET status = 'flagged_for_review' WHERE id = $1`,
      [result.id],
    );

    return { sessionId, resultId: result.id };
  }

  function listResults(sessionId: string) {
    return request(app.getHttpServer())
      .get(`/exam-sessions/${sessionId}/grading-results`)
      .set('Authorization', `Bearer ${tokenA}`);
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new PostgresExceptionFilter());
    await app.init();
    dataSource = app.get(DataSource);

    const email = `view_a_${stamp}@example.com`;
    idA = await createTestAccount(dataSource, {
      email,
      password: 'correct-horse-battery',
      role: 'teacher',
    });
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'correct-horse-battery' });
    tokenA = login.body.accessToken as string;

    const [semester] = await dataSource.query(
      `INSERT INTO examcollect.semester (name, start_date, end_date)
       VALUES ($1, '2026-01-01', '2026-06-01') RETURNING id`,
      [`View Semester ${stamp}`],
    );
    const [course] = await dataSource.query(
      `INSERT INTO examcollect.course (code, name, semester_id)
       VALUES ($1, 'Môn xem kết quả', $2) RETURNING id`,
      [`VIEW${stamp}`.slice(0, 20), semester.id],
    );
    courseId = course.id;
    const [room] = await dataSource.query(
      `INSERT INTO examcollect.room (name, capacity) VALUES ($1, 30) RETURNING id`,
      [`Phòng view ${stamp}`],
    );
    roomId = room.id;
    const [klass] = await dataSource.query(
      `INSERT INTO examcollect.class (course_id, course_name, name, teacher_id)
       VALUES ($1, (SELECT name FROM examcollect.course WHERE id = $1), $2, $3) RETURNING id`,
      [courseId, `Nhóm view ${stamp}`, idA],
    );
    classId = klass.id;

    for (let i = 1; i <= 6; i += 1) {
      await dataSource.query(
        `INSERT INTO examcollect.enrollment
           (student_mssv, student_name, course_id, home_class_id, home_teacher_id)
         VALUES ($1, $2, $3, $4, $5)`,
        [`SVV${stamp}${i}`.slice(0, 20), 'SV View', courseId, classId, idA],
      );
    }

    const rubric = await request(app.getHttpServer())
      .post('/rubrics')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        name: `Rubric kết quả ${stamp}`,
        criteria: [{ description: 'Nêu được ưu và nhược điểm', maxPoints: 4 }],
      });
    expect(rubric.status).toBe(201);
    rubricId = rubric.body.id;
    criterionIds = rubric.body.criteria.map((c: { id: string }) => c.id);
  }, 60_000);

  afterAll(async () => {
    await app?.close();
  });

  it('trả ý kiến lượt phản biện và cờ ngữ cảnh', async () => {
    const opinion = {
      isCorrect: 'yes',
      reasoning: 'Em ấy mô tả đúng cơ chế bù trừ, chỉ thiếu tên gọi của mẫu thiết kế.',
      evidence: ['ghi một bản ghi trạng thái trung gian'],
      suggestedVerdicts: [
        { criterionId: criterionIds[0], suggestedVerdict: 'met', why: 'Đúng nguyên lý.' },
      ],
      unverifiedEvidence: [],
      usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheCreationTokens: 0 },
    };
    const { sessionId } = await gradedResult({
      advocate: opinion,
      contextQuestion: true,
      contextModelAnswer: false,
    });

    const res = await listResults(sessionId).expect(200);
    const row = res.body[0];

    expect(row.contextUsedQuestion).toBe(true);
    expect(row.contextUsedModelAnswer).toBe(false);
    expect(row.advocateOpinion).toMatchObject({
      isCorrect: 'yes',
      suggestedVerdicts: [{ criterionId: criterionIds[0], suggestedVerdict: 'met' }],
    });
  });

  it('phân biệt "chưa đối chiếu" với "đã đối chiếu và sạch"', async () => {
    // `null` và `[]` phải đi qua nguyên vẹn. Gộp chúng ở tầng nào cũng
    // khiến màn hình đọc "chưa ai kiểm" thành "đã kiểm, sạch".
    const { sessionId } = await gradedResult({
      advocate: {
        isCorrect: 'partially',
        reasoning: 'Có phần đúng.',
        evidence: [],
        suggestedVerdicts: [],
        unverifiedEvidence: null,
        usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheCreationTokens: 0 },
      },
      contextQuestion: true,
      contextModelAnswer: null,
    });

    const res = await listResults(sessionId).expect(200);
    expect(res.body[0].advocateOpinion.unverifiedEvidence).toBeNull();
  });

  it('cổng phản biện không kích hoạt thì trả null, không phải object rỗng', async () => {
    const { sessionId } = await gradedResult({
      advocate: null,
      contextQuestion: null,
      contextModelAnswer: null,
    });

    const res = await listResults(sessionId).expect(200);
    // null nghĩa là "không chạy"; `{}` sẽ đọc thành "chạy rồi, không bênh
    // được gì". Hai câu đó khác nhau trên màn hình của giảng viên.
    expect(res.body[0].advocateOpinion).toBeNull();
    expect(res.body[0].contextUsedQuestion).toBeNull();
  });

  it('không chấm được thì trả lý do, không phải để trống', async () => {
    // `gradedResult()` seed một dòng chấm THÀNH CÔNG — ca hỏng cần seed
    // riêng vì nó đi qua `markUngradable`, không qua `gradeOne`.
    const { sessionId, submissionId } = await sessionWithCollectedSubmission();
    const [result] = await dataSource.query(
      `INSERT INTO examcollect.grading_result
         (submission_id, rubric_id_version, grading_triggered_by, status)
       VALUES ($1, $2, $3, 'ai_grading') RETURNING id`,
      [submissionId, rubricId, idA],
    );
    await dataSource.query(
      `UPDATE examcollect.grading_result
          SET status = 'flagged_for_review', flag_for_review = true, confidence = 0,
              ungradable_reason = $2
        WHERE id = $1`,
      [
        result.id,
        'HTTP 400 invalid_request_error (nội dung lỗi bị cắt — có thể chứa bài làm)',
      ],
    );

    const res = await listResults(sessionId).expect(200);
    expect(res.body[0].ungradableReason).toBe(
      'HTTP 400 invalid_request_error (nội dung lỗi bị cắt — có thể chứa bài làm)',
    );
  });

  it('dòng chấm bình thường trả ungradableReason là null, không phải undefined', async () => {
    // Một trường bị BỎ QUÊN trong mapping của `listForSession` sẽ khiến
    // JSON không có key này — `undefined` ở client — khác `null` ở mọi
    // chỗ khác đọc "chưa chấm hỏng". Khẳng định rõ ràng đây LÀ `null`.
    const { sessionId } = await gradedResult({
      advocate: null,
      contextQuestion: null,
      contextModelAnswer: null,
    });

    const res = await listResults(sessionId).expect(200);
    expect(res.body[0].ungradableReason).toBeNull();
  });
});
