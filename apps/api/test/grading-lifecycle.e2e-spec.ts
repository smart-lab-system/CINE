import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { GradingService } from '../src/grading/grading.service';

/**
 * Vòng đời `grading_result` ở tầng DB.
 *
 * Bộ test này tồn tại vì một lượt chấm hỏng trước đây KHÔNG CÓ ĐƯỜNG RA.
 * Trigger chỉ cho `ai_grading → ai_graded`, nên một job hết retry để dòng
 * nằm lại ở `ai_grading` vĩnh viễn — và `GradingRunService.progress()` đếm
 * nó là `pending`. Thứ giảng viên nhìn thấy: thanh tiến độ đứng ở 38/40,
 * poll mỗi 2 giây, mãi mãi, không thông báo lỗi, và "Chốt điểm" bị chặn vì
 * "còn bài đang chấm".
 */
describe('Vòng đời grading_result (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let teacherId: string;
  let classId: string;
  let courseId: string;
  let sessionId: string;
  let deliverableId: string;
  let rubricVersionCursor = 0;
  let seedCursor = 0;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    dataSource = app.get(DataSource);

    const suffix = `${Date.now()}`;
    const [teacher] = await dataSource.query(
      `INSERT INTO examcollect.account (email, password_hash, name, role)
       VALUES ($1, $2, 'GV Vòng đời', 'teacher') RETURNING id`,
      [`lifecycle_${suffix}@example.com`, 'a'.repeat(60)],
    );
    teacherId = teacher.id;

    const [semester] = await dataSource.query(
      `INSERT INTO examcollect.semester (name, start_date, end_date)
       VALUES ($1, '2026-01-01', '2026-06-01') RETURNING id`,
      [`HK Lifecycle ${suffix}`],
    );
    const [course] = await dataSource.query(
      `INSERT INTO examcollect.course (code, name, semester_id)
       VALUES ($1, 'Môn vòng đời', $2) RETURNING id`,
      [`LC${suffix}`.slice(0, 20), semester.id],
    );
    courseId = course.id;
    const [klass] = await dataSource.query(
      `INSERT INTO examcollect.class (course_id, name, teacher_id)
       VALUES ($1, 'N01', $2) RETURNING id`,
      [courseId, teacherId],
    );
    classId = klass.id;
    const [room] = await dataSource.query(
      `INSERT INTO examcollect.room (name, capacity) VALUES ($1, 40) RETURNING id`,
      [`P Lifecycle ${suffix}`],
    );
    const [session] = await dataSource.query(
      `INSERT INTO examcollect.exam_session
         (name, code, class_id, course_id, teacher_id, room_id, exam_type,
          start_time, end_time, status, semester_name)
       VALUES ('Phiên vòng đời', $1, $2, $3, $4, $5, 'CK',
               now() - interval '1 hour', now() + interval '1 hour', 'active', $6)
       RETURNING id`,
      [`LCC${suffix}`.slice(0, 20), classId, courseId, teacherId, room.id, `HK Lifecycle ${suffix}`],
    );
    sessionId = session.id;
    const [deliverable] = await dataSource.query(
      `INSERT INTO examcollect.required_deliverable
         (exam_session_id, required_filename, deliverable_type)
       VALUES ($1, 'Cau1.docx', 'document') RETURNING id`,
      [sessionId],
    );
    deliverableId = deliverable.id;
  });

  afterAll(async () => {
    await app.close();
  });

  /**
   * Một `grading_result` ở `ai_grading`, gắn với một bài nộp thật.
   *
   * Mỗi lần gọi tạo một submission MỚI: `uq_grading_result_submission` chỉ
   * cho một dòng chấm cho mỗi bài nộp.
   */
  async function seedGradingResultAtAiGrading(): Promise<string> {
    seedCursor += 1;
    const mssv = `LC${seedCursor}N${Date.now() % 100000}`.slice(0, 20);

    // `validate_submission_lifecycle` từ chối INSERT ở bất cứ trạng thái nào
    // ngoài `received`/`invalid`, rồi chỉ cho `received → validated →
    // collected`. Đi từng bước, không nhảy thẳng.
    const [submission] = await dataSource.query(
      `INSERT INTO examcollect.submission
         (exam_session_id, required_deliverable_id, student_mssv, student_name_input,
          home_class_id, home_teacher_id, status)
       VALUES ($1, $2, $3, 'Sinh viên vòng đời', $4, $5, 'received') RETURNING id`,
      [sessionId, deliverableId, mssv, classId, teacherId],
    );
    for (const next of ['validated', 'collected']) {
      await dataSource.query(
        `UPDATE examcollect.submission SET status = $1 WHERE id = $2`,
        [next, submission.id],
      );
    }

    rubricVersionCursor += 1;
    const [rubric] = await dataSource.query(
      `INSERT INTO examcollect.rubric (course_id, version) VALUES ($1, $2) RETURNING id`,
      [courseId, rubricVersionCursor],
    );

    const [result] = await dataSource.query(
      `INSERT INTO examcollect.grading_result
         (submission_id, rubric_id_version, grading_triggered_by, status)
       VALUES ($1, $2, $3, 'ai_grading') RETURNING id`,
      [submission.id, rubric.id, teacherId],
    );
    return result.id;
  }

  it('ai_grading chuyển thẳng sang flagged_for_review được', async () => {
    // Một lượt chấm hỏng phải có ĐƯỜNG RA — một kết cục người xử lý được
    // ("AI không chấm được, mời thầy xem"), thay vì một con số treo trên
    // thanh tiến độ mà không ai gỡ được.
    const id = await seedGradingResultAtAiGrading();

    await expect(
      dataSource.query(
        `UPDATE examcollect.grading_result SET status = 'flagged_for_review' WHERE id = $1`,
        [id],
      ),
    ).resolves.not.toThrow();

    const [row] = await dataSource.query(
      `SELECT status FROM examcollect.grading_result WHERE id = $1`,
      [id],
    );
    expect(row.status).toBe('flagged_for_review');
  });

  it('VẪN chặn ai_grading nhảy thẳng sang finalized', async () => {
    // Mở một đường không được phép mở tất cả. `finalized` phải đi qua
    // `teacher_reviewed` — đó là chỗ con người ký tên, và không lỗi kỹ
    // thuật nào được phép đi vòng qua nó.
    const id = await seedGradingResultAtAiGrading();

    await expect(
      dataSource.query(
        `UPDATE examcollect.grading_result SET status = 'finalized' WHERE id = $1`,
        [id],
      ),
    ).rejects.toThrow(/Invalid grading result status transition/);
  });

  it('VẪN chặn ai_grading nhảy thẳng sang auto_approved', async () => {
    // `auto_approved` nghĩa là "AI đã chấm và đủ tin cậy". Đi thẳng từ
    // `ai_grading` là công bố một điểm số chưa từng được chấm.
    const id = await seedGradingResultAtAiGrading();

    await expect(
      dataSource.query(
        `UPDATE examcollect.grading_result SET status = 'auto_approved' WHERE id = $1`,
        [id],
      ),
    ).rejects.toThrow(/Invalid grading result status transition/);
  });

  it('T-B3: markUngradable đưa bài hỏng ra khỏi ai_grading', async () => {
    // Migration mở cửa là chưa đủ — phải có ai ĐI QUA nó. Trước hàm này,
    // một job hết retry chỉ để lại một dòng log, còn dòng chấm nằm mãi ở
    // `ai_grading` và `progress()` đếm nó là `pending` vĩnh viễn.
    const id = await seedGradingResultAtAiGrading();
    const [row0] = await dataSource.query(
      `SELECT submission_id FROM examcollect.grading_result WHERE id = $1`,
      [id],
    );

    await app.get(GradingService).markUngradable(row0.submission_id, 'HTTP 503 overloaded_error');

    const [row] = await dataSource.query(
      `SELECT status, flag_for_review, confidence FROM examcollect.grading_result WHERE id = $1`,
      [id],
    );
    expect(row.status).toBe('flagged_for_review');
    expect(row.flag_for_review).toBe(true);
    // 0 điểm tin cậy, KHÔNG phải 0 điểm bài: không chấm được là sự thật về
    // hệ thống, không phải phán xét về bài làm.
    expect(Number(row.confidence)).toBe(0);
    const [scored] = await dataSource.query(
      `SELECT ai_total_score FROM examcollect.grading_result WHERE id = $1`,
      [id],
    );
    expect(scored.ai_total_score).toBeNull();
  });

  it('markUngradable gọi hai lần là vô hại', async () => {
    // Nó được gọi từ một event handler của BullMQ, thứ có thể bắn nhiều
    // lần cho cùng một job.
    const id = await seedGradingResultAtAiGrading();
    const [row0] = await dataSource.query(
      `SELECT submission_id FROM examcollect.grading_result WHERE id = $1`,
      [id],
    );
    const grading = app.get(GradingService);

    await grading.markUngradable(row0.submission_id, 'lần một');
    await expect(grading.markUngradable(row0.submission_id, 'lần hai')).resolves.not.toThrow();

    const [row] = await dataSource.query(
      `SELECT status FROM examcollect.grading_result WHERE id = $1`,
      [id],
    );
    expect(row.status).toBe('flagged_for_review');
  });

  /**
   * `advocate_opinion` bất biến cùng luật với output của Grader.
   *
   * Ba test này khoá lại ràng buộc quyết định cả hình dạng của Task 3:
   * Advocate PHẢI ghi trong cùng một UPDATE với `ai_total_score`. Không
   * có chúng thì người viết Task 3 sẽ tự nhiên viết hai lần ghi — chấm
   * xong ghi điểm, chạy Advocate xong ghi ý kiến — và phát hiện ra sai
   * ở tầng production, nơi triệu chứng là một job chết với một lỗi
   * Postgres không nói gì về Advocate.
   */
  it('advocate_opinion ghi CÙNG LÚC với ai_total_score thì được', async () => {
    const id = await seedGradingResultAtAiGrading();

    await expect(
      dataSource.query(
        `UPDATE examcollect.grading_result
            SET status = 'ai_graded', ai_total_score = 7.5, model_used = 'claude-sonnet-4-6',
                confidence = 0.3, advocate_opinion = $1
          WHERE id = $2`,
        [JSON.stringify({ isCorrect: 'partially', reasoning: 'em đi hướng khác' }), id],
      ),
    ).resolves.not.toThrow();

    const [row] = await dataSource.query(
      `SELECT advocate_opinion FROM examcollect.grading_result WHERE id = $1`,
      [id],
    );
    expect(row.advocate_opinion.isCorrect).toBe('partially');
  });

  it('advocate_opinion ghi SAU khi đã chốt điểm thì bị TỪ CHỐI', async () => {
    // Ý kiến phản biện sửa được sau khi giảng viên đã đọc thì nó không
    // còn là bằng chứng. Security rule 6 áp cho cả hai lượt, không riêng
    // Grader.
    const id = await seedGradingResultAtAiGrading();
    // `model_used` cố ý bỏ trống: test này kiểm TRIGGER, không kiểm một
    // lượt chấm hoàn chỉnh. Thứ duy nhất trigger đọc để quyết định có khoá
    // hay không là `OLD.ai_total_score`.
    await dataSource.query(
      `UPDATE examcollect.grading_result
          SET status = 'ai_graded', ai_total_score = 7.5, confidence = 0.3
        WHERE id = $1`,
      [id],
    );

    await expect(
      dataSource.query(
        `UPDATE examcollect.grading_result SET advocate_opinion = $1 WHERE id = $2`,
        [JSON.stringify({ isCorrect: 'yes' }), id],
      ),
    ).rejects.toThrow(/immutable/i);
  });

  it('dòng chưa từng chấm vẫn ghi advocate_opinion được', async () => {
    // Trigger chỉ khoá khi `ai_total_score IS NOT NULL`. Không có test
    // này thì một lần siết tay trigger sẽ chặn luôn cả đường ghi hợp lệ
    // mà không ai biết cho tới khi Task 3 đỏ vì một lý do khác.
    const id = await seedGradingResultAtAiGrading();

    await expect(
      dataSource.query(
        `UPDATE examcollect.grading_result SET advocate_opinion = $1 WHERE id = $2`,
        [JSON.stringify({ isCorrect: 'no' }), id],
      ),
    ).resolves.not.toThrow();
  });

  it('context_used_* cũng bất biến sau khi đã chốt điểm', async () => {
    // Hai cột này là một phần output của AI: chúng nói lượt chấm THỰC SỰ
    // đọc được đề bài hay không. Sửa được sau khi chốt nghĩa là làm đẹp
    // được số liệu calibration §11.2 mà không ai thấy — nhánh A biến
    // thành nhánh B bằng một câu UPDATE.
    const id = await seedGradingResultAtAiGrading();
    await dataSource.query(
      `UPDATE examcollect.grading_result
          SET status = 'ai_graded', ai_total_score = 7.5, confidence = 0.3,
              context_used_question = false, context_used_model_answer = false
        WHERE id = $1`,
      [id],
    );

    await expect(
      dataSource.query(
        `UPDATE examcollect.grading_result SET context_used_question = true WHERE id = $1`,
        [id],
      ),
    ).rejects.toThrow(/immutable/i);
  });

  it('đường cũ ai_grading → ai_graded vẫn đi được', async () => {
    const id = await seedGradingResultAtAiGrading();

    await dataSource.query(
      `UPDATE examcollect.grading_result SET status = 'ai_graded' WHERE id = $1`,
      [id],
    );

    const [row] = await dataSource.query(
      `SELECT status FROM examcollect.grading_result WHERE id = $1`,
      [id],
    );
    expect(row.status).toBe('ai_graded');
  });
});
