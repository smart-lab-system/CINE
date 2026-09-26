import { DataSource } from 'typeorm';

/**
 * Dựng dữ liệu chấm bằng SQL thô cho e2e tầng DB (trigger, ràng buộc).
 *
 * Cùng khuôn với `grading-lifecycle.e2e-spec.ts`: submission đi đúng vòng đời
 * received → validated → collected, mỗi kết quả một bài nộp mới
 * (`uq_grading_result_submission`), và mỗi phiên một giảng viên, một lớp, một phòng mới —
 * ba ràng buộc chồng lịch của `exam_session` không bao giờ bắn giữa hai lần gọi.
 * Không dọn: mọi tên mang dấu thời gian.
 */
export interface SeedSession {
  teacherId: string;
  classId: string;
  sessionId: string;
  deliverableId: string;
  rubricId: string;
}

let cursor = 0;
const stamp = (): string => `${Date.now().toString(36)}${(cursor++).toString(36)}`;

export async function seedTeacher(ds: DataSource, label: string): Promise<string> {
  const [row] = await ds.query(
    `INSERT INTO examcollect.account (email, password_hash, name, role)
     VALUES ($1, $2, $3, 'teacher') RETURNING id`,
    [`${label}_${stamp()}@example.com`, 'a'.repeat(60), `GV ${label}`],
  );
  return row.id;
}

export async function seedSession(
  ds: DataSource,
  label: string,
  opts: { deliverableType?: 'document' | 'code_project'; language?: string | null } = {},
): Promise<SeedSession> {
  const s = stamp();
  const teacherId = await seedTeacher(ds, label);
  const [klass] = await ds.query(
    `INSERT INTO examcollect.class (course_name, name, teacher_id) VALUES ($1, 'N01', $2) RETURNING id`,
    [`Môn ${label}`, teacherId],
  );
  const [session] = await ds.query(
    `INSERT INTO examcollect.exam_session
       (name, code, class_id, teacher_id, exam_type, start_time, end_time, status,
        semester_name, course_name, room_name)
     VALUES ($1, $2, $3, $4, 'CK', now() - interval '1 hour', now() + interval '1 hour', 'active',
             $5, $6, $7)
     RETURNING id`,
    [`Phiên ${label}`, `S${s}`.slice(0, 20), klass.id, teacherId, `HK ${label} ${s}`, `Môn ${label}`, `P ${label} ${s}`],
  );
  const [deliverable] = await ds.query(
    `INSERT INTO examcollect.required_deliverable (exam_session_id, required_filename, deliverable_type, language)
     VALUES ($1, 'Cau1.docx', $2, $3) RETURNING id`,
    [session.id, opts.deliverableType ?? 'document', opts.language ?? null],
  );
  const [rubric] = await ds.query(
    `INSERT INTO examcollect.rubric (version, teacher_id, name) VALUES (1, $1, $2) RETURNING id`,
    [teacherId, `Rubric ${label} ${s}`],
  );
  return { teacherId, classId: klass.id, sessionId: session.id, deliverableId: deliverable.id, rubricId: rubric.id };
}

export async function seedResult(
  ds: DataSource,
  ctx: SeedSession,
): Promise<{ resultId: string; submissionId: string }> {
  const [sub] = await ds.query(
    `INSERT INTO examcollect.submission
       (exam_session_id, required_deliverable_id, student_mssv, student_name_input,
        home_class_id, home_teacher_id, status)
     VALUES ($1, $2, $3, 'Sinh viên seed', $4, $5, 'received') RETURNING id`,
    [ctx.sessionId, ctx.deliverableId, `M${stamp()}`.slice(0, 20), ctx.classId, ctx.teacherId],
  );
  for (const next of ['validated', 'collected']) {
    await ds.query(`UPDATE examcollect.submission SET status = $1 WHERE id = $2`, [next, sub.id]);
  }
  const [res] = await ds.query(
    `INSERT INTO examcollect.grading_result (submission_id, rubric_id_version, grading_triggered_by, status)
     VALUES ($1, $2, $3, 'ai_grading') RETURNING id`,
    [sub.id, ctx.rubricId, ctx.teacherId],
  );
  return { resultId: res.id, submissionId: sub.id };
}

export async function seedCriterion(ds: DataSource, rubricId: string, key: string, maxPoints = 10): Promise<string> {
  const [row] = await ds.query(
    `INSERT INTO examcollect.rubric_criterion (rubric_id, description, max_points, key)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [rubricId, `Tiêu chí ${key}`, maxPoints, key],
  );
  return row.id;
}

/** Ghi output AI và sang `ai_graded` trong MỘT UPDATE — như `gradeOne`. */
export async function scoreResult(ds: DataSource, resultId: string, score = '7.00'): Promise<void> {
  await ds.query(
    `UPDATE examcollect.grading_result
        SET status = 'ai_graded', ai_total_score = $2, confidence = 0.9, model_used = 'seed',
            criterion_results = '[]'
      WHERE id = $1`,
    [resultId, score],
  );
}

/**
 * Đặt thẳng trạng thái NGUỒN, bỏ qua mọi trigger (`session_replication_role = replica`) — chỉ để
 * dựng trạng thái bắt đầu cho test bảng chuyển trạng thái. Cần superuser: Postgres local của
 * docker-compose chạy bằng POSTGRES_USER nên có. Tên cột trong `extra` là của test, không phải
 * dữ liệu ngoài.
 */
export async function forceStatus(
  ds: DataSource,
  resultId: string,
  status: string,
  extra: Record<string, unknown> = {},
): Promise<void> {
  const runner = ds.createQueryRunner();
  await runner.connect();
  try {
    await runner.startTransaction();
    await runner.query(`SET LOCAL session_replication_role = replica`);
    const cols = Object.keys(extra);
    const sets = ['status = $2', ...cols.map((c, i) => `${c} = $${i + 3}`)].join(', ');
    await runner.query(`UPDATE examcollect.grading_result SET ${sets} WHERE id = $1`, [
      resultId,
      status,
      ...cols.map((c) => extra[c]),
    ]);
    await runner.commitTransaction();
  } catch (error) {
    await runner.rollbackTransaction();
    throw error;
  } finally {
    await runner.release();
  }
}
