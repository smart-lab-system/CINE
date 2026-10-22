import { EntityManager } from 'typeorm';
import { EFFECTIVE_PROBLEM_LANGUAGE, type ProblemConfig } from './resolve-problem-config';

/**
 * Cấu hình chấm của đúng MỘT câu theo id (5.2). Đường chấm dùng câu của chính kết quả — rubric, gói test, yêu cầu
 * nộp — chứ không dùng câu mặc định. Trả null khi không có câu.
 */
export async function resolveProblemConfigByProblem(m: EntityManager, problemId: string): Promise<ProblemConfig | null> {
  const [row] = await m.query(
    `SELECT p.id, p.ordinal, es.teacher_id, p.rubric_id, p.test_bundle_id, p.points_hundredths,
            p.required_deliverable_id, ${EFFECTIVE_PROBLEM_LANGUAGE} AS language
       FROM examcollect.exam_problem p
       JOIN examcollect.exam_session es ON es.id = p.exam_session_id
      WHERE p.id = $1`,
    [problemId],
  );
  if (!row) return null;
  return {
    problemId: row.id,
    ordinal: row.ordinal,
    teacherId: row.teacher_id,
    rubricId: row.rubric_id,
    testBundleId: row.test_bundle_id,
    pointsHundredths: row.points_hundredths,
    requiredDeliverableId: row.required_deliverable_id,
    language: row.language,
  };
}
