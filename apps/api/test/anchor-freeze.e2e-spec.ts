import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { AnchorService } from '../src/grading/anchor.service';

/**
 * T-ANCHOR-1 — tập anchor ĐÓNG BĂNG một lần cho cả lượt chấm (spec A3).
 *
 * Vì sao đây là yêu cầu ĐÚNG ĐẮN chứ không phải hiệu năng: giảng viên
 * duyệt bài số 5 trong khi bài 6-40 còn nằm trong hàng đợi. Không đóng
 * băng thì lần duyệt đó lập tức thành anchor, và bài 6-40 được chấm theo
 * một chuẩn KHÁC bài 1-5 — cùng một lượt chấm, cùng một lớp, cùng một đề.
 * Cache chết chỉ là triệu chứng; cái hỏng là sự công bằng giữa các em.
 */
describe('Đóng băng anchor (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let anchors: AnchorService;

  let teacherId: string;
  let courseName: string;
  let classId: string;
  let sessionId: string;
  let rubricId: string;
  let criterionId: string;
  const stamp = `${Date.now()}`;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    dataSource = app.get(DataSource);
    anchors = app.get(AnchorService);

    const [teacher] = await dataSource.query(
      `INSERT INTO examcollect.account (email, password_hash, name, role)
       VALUES ($1, $2, 'GV Anchor', 'teacher') RETURNING id`,
      [`anchor_${stamp}@example.com`, 'a'.repeat(60)],
    );
    teacherId = teacher.id;

    const course = { name: 'Môn anchor' };
    courseName = course.name;
    const [klass] = await dataSource.query(
      `INSERT INTO examcollect.class (course_name, name, teacher_id)
       VALUES ($1, 'N01', $2) RETURNING id`,
      [courseName, teacherId],
    );
    classId = klass.id;
    const room = { name: `P Anchor ${stamp}` };
    const [session] = await dataSource.query(
      `INSERT INTO examcollect.exam_session
         (name, code, class_id, teacher_id, exam_type,
          start_time, end_time, status, semester_name,
          course_name, room_name)
       VALUES ('Phiên anchor', $1, $2, $4, 'CK',
               now() - interval '1 hour', now() + interval '1 hour', 'active', $6,
               $3, $5)
       RETURNING id`,
      [`ANC${stamp}`.slice(0, 20), classId, courseName, teacherId, room.name, `HK Anchor ${stamp}`],
    );
    sessionId = session.id;

    const [rubric] = await dataSource.query(
      `INSERT INTO examcollect.rubric (version, teacher_id, name)
       VALUES (1, $2, $1) RETURNING id`,
      [`${courseName} ${stamp}`, teacherId],
    );
    rubricId = rubric.id;
    const [criterion] = await dataSource.query(
      `INSERT INTO examcollect.rubric_criterion (rubric_id, description, max_points, key)
       VALUES ($1, 'Trình bày thuật toán', 10, 'trinh_bay_thuat_toan') RETURNING id`,
      [rubricId],
    );
    criterionId = criterion.id;
  });

  afterAll(async () => {
    await app.close();
  });

  let seedCursor = 0;

  /**
   * Một bài đã chấm xong VÀ đã được giảng viên duyệt, với verdict do ta
   * chỉ định cho cả hai phía.
   *
   * `aiVerdict === teacherVerdict` nghĩa là "thầy bấm đồng ý" — A2 phải
   * loại nó ra.
   */
  async function seedReviewed(aiVerdict: string, teacherVerdict: string): Promise<void> {
    seedCursor += 1;
    const mssv = `AN${seedCursor}x${Date.now() % 100000}`.slice(0, 20);
    const [deliverable] = await dataSource.query(
      `INSERT INTO examcollect.required_deliverable
         (exam_session_id, required_filename, deliverable_type)
       VALUES ($1, $2, 'document') RETURNING id`,
      [sessionId, `Cau${seedCursor}.docx`],
    );
    const [submission] = await dataSource.query(
      `INSERT INTO examcollect.submission
         (exam_session_id, required_deliverable_id, student_mssv, student_name_input,
          home_class_id, home_teacher_id, status)
       VALUES ($1, $2, $3, 'SV', $4, $5, 'received') RETURNING id`,
      [sessionId, deliverable.id, mssv, classId, teacherId],
    );
    for (const next of ['validated', 'collected']) {
      await dataSource.query(`UPDATE examcollect.submission SET status = $1 WHERE id = $2`, [
        next,
        submission.id,
      ]);
    }

    const criterionResults = JSON.stringify([
      { criterionId, verdict: aiVerdict, points: 0, evidence: `dẫn chứng ${seedCursor}` },
    ]);
    const [result] = await dataSource.query(
      `INSERT INTO examcollect.grading_result
         (submission_id, rubric_id_version, grading_triggered_by, status)
       VALUES ($1, $2, $3, 'ai_grading') RETURNING id`,
      [submission.id, rubricId, teacherId],
    );
    await dataSource.query(
      `UPDATE examcollect.grading_result
          SET status = 'ai_graded', ai_total_score = 5, confidence = 0.4,
              model_used = 'test', criterion_results = $1::jsonb
        WHERE id = $2`,
      [criterionResults, result.id],
    );
    await dataSource.query(
      `UPDATE examcollect.grading_result SET status = 'flagged_for_review' WHERE id = $1`,
      [result.id],
    );
    await dataSource.query(
      `UPDATE examcollect.grading_result SET status = 'teacher_reviewed' WHERE id = $1`,
      [result.id],
    );
    await dataSource.query(
      `INSERT INTO examcollect.teacher_review
         (grading_result_id, teacher_id, final_score, edited_criteria)
       VALUES ($1, $2, 5, $3::jsonb)`,
      [
        result.id,
        teacherId,
        JSON.stringify([{ criterionId, verdict: teacherVerdict, points: 5 }]),
      ],
    );
  }

  it('A2: "thầy bấm đồng ý" KHÔNG thành anchor', async () => {
    // Ràng buộc đắt nhất nếu bỏ qua, và nó hỏng trong im lặng.
    // `TeacherReviewService` luôn ghi TOÀN BỘ mảng tiêu chí, kể cả đường
    // tự-duyệt-hàng-loạt — nên "có dòng review" không đồng nghĩa với "đã
    // sửa gì". Học từ lần đồng ý là dạy AI rằng nó đã đúng: vòng lặp tự
    // khen, siết dần mà không ai thấy.
    await seedReviewed('met', 'met');

    expect(await anchors.buildFor(rubricId)).toEqual([]);
  });

  it('lần SỬA THẬT thì thành anchor, mang cả hai phán đoán', async () => {
    await seedReviewed('not_met', 'met');

    const built = await anchors.buildFor(rubricId);

    expect(built).toHaveLength(1);
    expect(built[0]).toMatchObject({
      criterionId,
      aiVerdict: 'not_met',
      teacherVerdict: 'met',
    });
  });

  it('A1: anchor của rubric khác KHÔNG lọt vào', async () => {
    // Anchor của v1 áp cho v3 là dạy một chuẩn đã lỗi thời — Security
    // rule 7 (rubric versioning) nối dài sang tầng prompt.
    const [other] = await dataSource.query(
      `INSERT INTO examcollect.rubric (version, teacher_id, name)
       VALUES (2, $2, $1) RETURNING id`,
      [`${courseName} ${stamp}`, teacherId],
    );

    expect(await anchors.buildFor(other.id)).toEqual([]);
  });

  it('T-ANCHOR-1: ảnh chụp KHÔNG đổi dù có lần duyệt mới chen vào giữa', async () => {
    // Đúng ca mà A3 sinh ra để chặn.
    const atStart = await anchors.freezeFor(sessionId, rubricId);
    expect(atStart.length).toBeGreaterThan(0);

    // Giảng viên duyệt thêm một bài GIỮA LƯỢT CHẤM — một lần sửa thật,
    // tức nó ĐỦ ĐIỀU KIỆN làm anchor.
    await seedReviewed('met', 'not_met');
    const rebuiltNow = await anchors.buildFor(rubricId);
    expect(rebuiltNow.length).toBeGreaterThan(atStart.length);

    // Nhưng bài thứ 40 vẫn phải đọc ĐÚNG tập của bài thứ nhất.
    const atEnd = await anchors.loadFor(sessionId);
    expect(atEnd).toEqual(atStart);
  });

  it('bấm "Bắt đầu chấm" lần hai KHÔNG chụp đè', async () => {
    // Bấm lần hai là thao tác chấm tiếp phần còn lại. Chụp đè ở đó chính
    // là thao tác resume tự phá cái mà A3 giữ.
    const before = await anchors.loadFor(sessionId);

    await seedReviewed('not_met', 'partially_met');
    const again = await anchors.freezeFor(sessionId, rubricId);

    expect(again).toEqual(before);
  });
});
