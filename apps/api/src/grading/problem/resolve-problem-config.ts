import { EntityManager } from 'typeorm';
import { lockTeacherScoring } from '../scoring/teacher-lock';

/** Cấu hình chấm của MỘT câu (P1a). Mọi đường đọc rubric / gói test / đáp án đi qua hàm này. */
export interface ProblemConfig {
  problemId: string;
  ordinal: number;
  teacherId: string;
  rubricId: string | null;
  testBundleId: string | null;
  pointsHundredths: number;
  requiredDeliverableId: string | null;
  language: string | null;
}

/**
 * Ngôn ngữ dùng để chạy bài của câu `p`.
 *
 * Ô "Ngôn ngữ bài code" và bước thiết lập chỉ ghi `required_deliverable.language`. Cột
 * `exam_problem.language` được chép một lần lúc tạo câu, thường là lúc phiên còn chưa có file,
 * nên để trống. Phiên một câu mà mọi file code khai cùng một ngôn ngữ thì lấy ngôn ngữ đó —
 * đúng thứ giảng viên vừa chọn — trước khi rơi về cột câu rồi tới file mà câu đang trỏ.
 */
export const EFFECTIVE_PROBLEM_LANGUAGE = `
  COALESCE(
    (
      SELECT MIN(rd.language::text)
        FROM examcollect.required_deliverable rd
       WHERE rd.exam_session_id = p.exam_session_id
         AND rd.deliverable_type = 'code_project'
      HAVING COUNT(*) > 0
         AND COUNT(rd.language) = COUNT(*)
         AND COUNT(DISTINCT rd.language) = 1
         AND NOT EXISTS (
           SELECT 1 FROM examcollect.exam_problem later
            WHERE later.exam_session_id = p.exam_session_id AND later.ordinal > 1
         )
    ),
    NULLIF(p.language, ''),
    (SELECT rd.language::text FROM examcollect.required_deliverable rd WHERE rd.id = p.required_deliverable_id)
  )`;

/**
 * Câu mặc định (ordinal = 1) của phiên. Không có phiên, hoặc phiên chưa có câu → null. Không ném vì thiếu cấu
 * hình: rubric / gói test rỗng là trạng thái hợp lệ của phiên mới (Review Focus 2).
 */
export async function resolveProblemConfig(m: EntityManager, sessionId: string): Promise<ProblemConfig | null> {
  const [row] = await m.query(
    `SELECT p.id, p.ordinal, es.teacher_id, p.rubric_id, p.test_bundle_id, p.points_hundredths,
            p.required_deliverable_id, ${EFFECTIVE_PROBLEM_LANGUAGE} AS language
       FROM examcollect.exam_session es
       JOIN examcollect.exam_problem p ON p.exam_session_id = es.id AND p.ordinal = 1
      WHERE es.id = $1`,
    [sessionId],
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

/**
 * Ghi ngôn ngữ thống nhất của các file code lên câu 1, khi phiên chỉ có một câu.
 * Gọi sau khi khai ngôn ngữ hoặc thay danh sách file, để cột câu không nằm lại ở giá trị lúc tạo phiên.
 */
export async function syncSingleProblemLanguageFromDeliverables(m: EntityManager, sessionId: string): Promise<void> {
  await m.query(
    `UPDATE examcollect.exam_problem p
        SET language = src.language
       FROM (
         SELECT MIN(rd.language::text) AS language
           FROM examcollect.required_deliverable rd
          WHERE rd.exam_session_id = $1
            AND rd.deliverable_type = 'code_project'
         HAVING COUNT(*) > 0
            AND COUNT(rd.language) = COUNT(*)
            AND COUNT(DISTINCT rd.language) = 1
       ) src
      WHERE p.exam_session_id = $1
        AND p.ordinal = 1
        AND NOT EXISTS (
          SELECT 1 FROM examcollect.exam_problem later
           WHERE later.exam_session_id = p.exam_session_id AND later.ordinal > 1
        )
        AND p.language IS DISTINCT FROM src.language`,
    [sessionId],
  );
}

/**
 * Đảm bảo phiên có câu mặc định và trả id của nó. Câu mới sao chép rubric, gói test, yêu cầu nộp đầu tiên và
 * điểm từ phiên (cùng cách backfill M2). Phiên không tồn tại → ném, vì không có gì để tạo câu.
 */
export async function ensureDefaultProblem(m: EntityManager, sessionId: string): Promise<string> {
  const [existing] = await m.query(
    `SELECT id FROM examcollect.exam_problem WHERE exam_session_id = $1 AND ordinal = 1`,
    [sessionId],
  );
  if (existing) return existing.id as string;
  const [created] = await m.query(
    `INSERT INTO examcollect.exam_problem
       (exam_session_id, ordinal, title, points_hundredths, required_deliverable_id, language, rubric_id, test_bundle_id)
     SELECT es.id, 1, 'Câu 1',
            coalesce((SELECT round(sum(rc.max_points) * 100)::int
                        FROM examcollect.rubric_criterion rc WHERE rc.rubric_id = es.rubric_id), 0),
            (SELECT rd.id FROM examcollect.required_deliverable rd WHERE rd.exam_session_id = es.id ORDER BY rd.id LIMIT 1),
            (SELECT rd.language::text FROM examcollect.required_deliverable rd WHERE rd.exam_session_id = es.id ORDER BY rd.id LIMIT 1),
            es.rubric_id,
            es.test_bundle_id
       FROM examcollect.exam_session es
      WHERE es.id = $1
     RETURNING id`,
    [sessionId],
  );
  if (!created) throw new Error(`không tìm thấy phiên ${sessionId} để tạo câu mặc định`);
  return created.id as string;
}

/** Tính lại điểm của câu 1 theo rubric đang gắn (tổng tiêu chí × 100). */
async function refreshDefaultProblemPoints(m: EntityManager, sessionId: string): Promise<void> {
  await m.query(
    `UPDATE examcollect.exam_problem p
        SET points_hundredths = coalesce((SELECT round(sum(rc.max_points) * 100)::int
                                            FROM examcollect.rubric_criterion rc WHERE rc.rubric_id = p.rubric_id), 0)
      WHERE p.exam_session_id = $1 AND p.ordinal = 1`,
    [sessionId],
  );
}

async function teacherOfSession(m: EntityManager, sessionId: string): Promise<string> {
  const [row] = await m.query(`SELECT teacher_id FROM examcollect.exam_session WHERE id = $1`, [sessionId]);
  if (!row) throw new Error(`không tìm thấy phiên ${sessionId}`);
  return row.teacher_id as string;
}

/**
 * Ghi kép rubric (§3.3): đặt rubric lên phiên (cột bí danh, còn đến P2) VÀ lên câu 1, cùng transaction, dưới
 * khoá giảng viên (đổi rubric của câu là đường ghi mới, theo §3.5).
 */
export async function setSessionRubricAndProblem(
  m: EntityManager,
  sessionId: string,
  rubricId: string | null,
): Promise<void> {
  await lockTeacherScoring(m, await teacherOfSession(m, sessionId));
  await m.query(`UPDATE examcollect.exam_session SET rubric_id = $2 WHERE id = $1`, [sessionId, rubricId]);
  const problemId = await ensureDefaultProblem(m, sessionId);
  await m.query(`UPDATE examcollect.exam_problem SET rubric_id = $2 WHERE id = $1`, [problemId, rubricId]);
  await refreshDefaultProblemPoints(m, sessionId);
}

/** Ghi kép gói test đã ghim (cột bí danh + câu 1), dưới khoá giảng viên. */
export async function setSessionTestBundleAndProblem(
  m: EntityManager,
  sessionId: string,
  bundleId: string | null,
): Promise<void> {
  await lockTeacherScoring(m, await teacherOfSession(m, sessionId));
  await m.query(`UPDATE examcollect.exam_session SET test_bundle_id = $2 WHERE id = $1`, [sessionId, bundleId]);
  const problemId = await ensureDefaultProblem(m, sessionId);
  await m.query(`UPDATE examcollect.exam_problem SET test_bundle_id = $2 WHERE id = $1`, [problemId, bundleId]);
}

/**
 * Ghim gói test cho MỘT câu cụ thể (P1b). Câu 1 còn ghi bí danh của phiên (§3.3); câu khác thì chỉ ghi câu đó.
 * Dưới khoá giảng viên. FK ghép `(test_bundle_id, exam_session_id)` bảo đảm gói thuộc đúng phiên này.
 */
export async function setProblemTestBundle(
  m: EntityManager,
  sessionId: string,
  problemId: string,
  bundleId: string,
): Promise<void> {
  await lockTeacherScoring(m, await teacherOfSession(m, sessionId));
  const [problem] = await m.query(
    `SELECT ordinal FROM examcollect.exam_problem WHERE id = $1 AND exam_session_id = $2`,
    [problemId, sessionId],
  );
  if (!problem) throw new Error(`câu ${problemId} không thuộc phiên ${sessionId}`);
  await m.query(`UPDATE examcollect.exam_problem SET test_bundle_id = $2 WHERE id = $1`, [problemId, bundleId]);
  if (problem.ordinal === 1) {
    await m.query(`UPDATE examcollect.exam_session SET test_bundle_id = $2 WHERE id = $1`, [sessionId, bundleId]);
  }
}
