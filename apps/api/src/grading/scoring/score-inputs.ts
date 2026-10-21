import { ensureDefaultProblem, resolveProblemConfig } from '../problem/resolve-problem-config';
import { EntityManager } from 'typeorm';
import type { RulePredicate } from '../decision/types';
import { currentScore, CurrentScore } from './current-score';
import { parseHundredths } from './hundredths';
import type { RuleSnapshot, ScoreBreakdown } from './score-core';
import { readStoredInvestigation, StoredInvestigation } from './stored-investigation';

export { lockTeacherScoring } from './teacher-lock';

export async function teacherOfResult(m: EntityManager, resultId: string): Promise<string> {
  const [row] = await m.query(
    `SELECT es.teacher_id FROM examcollect.grading_result g
       JOIN examcollect.submission s ON s.id = g.submission_id
       JOIN examcollect.exam_session es ON es.id = s.exam_session_id
      WHERE g.id = $1`,
    [resultId],
  );
  if (!row) throw new Error(`không có kết quả chấm ${resultId}`);
  return row.teacher_id;
}

export async function currentPriceVersion(
  m: EntityManager,
  teacherId: string,
): Promise<{ id: string; version: number } | null> {
  const [row] = await m.query(
    `SELECT id, version FROM examcollect.price_table_version WHERE teacher_id = $1 ORDER BY version DESC LIMIT 1`,
    [teacherId],
  );
  return row ? { id: row.id, version: row.version } : null;
}

export async function latestComputationRow(
  m: EntityManager,
  resultId: string,
): Promise<{
  id: string;
  score: string | null;
  priceTableVersionId: string | null;
  testBundleId: string | null;
  breakdown: ScoreBreakdown;
} | null> {
  const [row] = await m.query(
    `SELECT id, score, price_table_version_id, test_bundle_id, breakdown FROM examcollect.score_computation
      WHERE grading_result_id = $1 ORDER BY created_at DESC, id DESC LIMIT 1`,
    [resultId],
  );
  return row
    ? {
        id: row.id,
        score: row.score,
        priceTableVersionId: row.price_table_version_id,
        testBundleId: row.test_bundle_id ?? null,
        breakdown: row.breakdown,
      }
    : null;
}

/**
 * Lỗi ĐANG DÙNG trong MỘT rubric (theo tên, mọi phiên bản), giá ở `priceVersionId` (null = chưa có bảng giá:
 * mọi lỗi chưa giá). Kiểu trả về giữ nguyên `RuleSnapshot` — lõi tính điểm không biết lỗi đến từ đâu.
 */
export async function loadRuleSnapshots(
  m: EntityManager,
  teacherId: string,
  rubricName: string,
  priceVersionId: string | null,
): Promise<RuleSnapshot[]> {
  const rows: {
    rule_id: string;
    revision_id: string;
    rule_key: string;
    criterion_key: string;
    predicate: RulePredicate | null;
    deduction: string | null;
  }[] = await m.query(
    `SELECT r.id AS rule_id, v.id AS revision_id, r.rule_key, re.criterion_key, v.predicate, p.deduction
       FROM examcollect.rubric_error re
       JOIN examcollect.error_rule r ON r.id = re.error_rule_id
       JOIN examcollect.error_rule_revision v ON v.id = r.current_revision_id
       LEFT JOIN examcollect.rubric_error_price p ON p.rubric_error_id = re.id AND p.price_table_version_id = $3
      WHERE re.teacher_id = $1 AND re.rubric_name = $2 AND re.removed_at IS NULL AND r.state = 'active'
      ORDER BY r.rule_key`,
    [teacherId, rubricName, priceVersionId],
  );
  return rows.map((r) => ({
    ruleId: r.rule_id,
    revisionId: r.revision_id,
    ruleKey: r.rule_key,
    criterionKey: r.criterion_key,
    predicate: r.predicate,
    deductionHundredths: r.deduction === null ? null : parseHundredths(r.deduction),
  }));
}

/** Điểm hiện tại §14.2 của MỘT bài — cùng hàm `currentScore()` mà danh sách kết quả dùng. */
export async function loadCurrentScore(m: EntityManager, resultId: string): Promise<CurrentScore> {
  const [r] = await m.query(
    `SELECT g.pipeline, g.status, g.ai_total_score,
            rv.kind AS review_kind, rv.final_score AS review_score,
            (SELECT t.final_score FROM examcollect.teacher_review t
              WHERE t.grading_result_id = g.id AND t.kind = 'manual_score'
              ORDER BY t.reviewed_at DESC, t.id DESC LIMIT 1) AS manual_score,
            fc.score AS finalized_score,
            (SELECT c.score FROM examcollect.score_computation c
              WHERE c.grading_result_id = g.id ORDER BY c.created_at DESC, c.id DESC LIMIT 1) AS latest_score
       FROM examcollect.grading_result g
       LEFT JOIN examcollect.score_computation fc ON fc.id = g.finalized_computation_id
       LEFT JOIN LATERAL (
         SELECT t.kind, t.final_score FROM examcollect.teacher_review t
          WHERE t.grading_result_id = g.id AND t.final_score IS NOT NULL
          ORDER BY t.reviewed_at DESC, t.id DESC LIMIT 1) rv ON true
      WHERE g.id = $1`,
    [resultId],
  );
  if (!r) throw new Error(`không có kết quả chấm ${resultId}`);
  return currentScore({
    pipeline: r.pipeline,
    aiTotalScore: r.ai_total_score,
    latestScoredReview: r.review_kind ? { kind: r.review_kind, finalScore: r.review_score } : null,
    latestManualScore: r.manual_score,
    finalized: r.status === 'finalized' || r.status === 'exported',
    finalizedComputationScore: r.finalized_score,
    latestComputationScore: r.latest_score,
  });
}

export interface ScoreContext {
  resultId: string;
  teacherId: string;
  sessionId: string;
  /** Câu của kết quả (P1a): NULL của dòng cũ đã quy về câu mặc định. */
  problemId: string;
  pipeline: 'one_shot' | 'investigator';
  status: string;
  ungradableClass: 'system' | 'submission' | null;
  rubricId: string;
  /** Tên rubric (ổn định qua phiên bản) — nạp lỗi theo dòng áp dụng, không theo id phiên bản. */
  rubricName: string;
  attemptId: string | null;
  stored: StoredInvestigation | null;
  bundleId: string | null;
  bundleCases: { name: string; group: string }[];
  rubric: { key: string; maxHundredths: number }[];
  waivedCriteria: string[];
  exceptions: Map<string, 'exclude' | 'include'>;
  hasManualScore: boolean;
  /** Độ tin cậy của thước của phiên (`grading_reference.ruler_trust`, P1b §6.3b); `null` = chưa có đáp án mẫu. */
  rulerTrust?: 'teacher' | 'verified' | 'unverified' | null;
}

/**
 * `storedOverride`: hồ sơ của lượt chấm ĐANG CHẠY (chưa có kết cục trong DB) — lượt tính đầu quyết
 * kết cục trên hồ sơ này TRƯỚC khi ghi nó, vì lượt chấm bất biến từ lúc có kết cục (§14.4).
 */
/** `ruler_trust` của thước phiên. Không có dòng đáp án mẫu thì `null`: phiên chưa có thước, giữ hành vi cũ. */
async function rulerTrustOf(m: EntityManager, sessionId: string): Promise<'teacher' | 'verified' | 'unverified' | null> {
  const [row] = await m.query(`SELECT ruler_trust FROM examcollect.grading_reference WHERE exam_session_id = $1`, [sessionId]);
  return (row?.ruler_trust as 'teacher' | 'verified' | 'unverified' | null | undefined) ?? null;
}

export async function loadScoreContext(
  m: EntityManager,
  resultId: string,
  storedOverride?: StoredInvestigation,
): Promise<ScoreContext> {
  const [row] = await m.query(
    `SELECT g.pipeline, g.status, g.ungradable_class, g.rubric_id_version, g.current_attempt_id,
            s.exam_session_id, es.teacher_id, COALESCE(g.problem_id, dp.id) AS problem_id,
            rb.name AS rubric_name, a.outcome AS attempt_outcome, a.investigation
       FROM examcollect.grading_result g
       JOIN examcollect.submission s ON s.id = g.submission_id
       JOIN examcollect.exam_session es ON es.id = s.exam_session_id
       JOIN examcollect.rubric rb ON rb.id = g.rubric_id_version
       LEFT JOIN examcollect.exam_problem dp ON dp.exam_session_id = s.exam_session_id AND dp.ordinal = 1
       LEFT JOIN examcollect.grading_attempt a ON a.id = g.current_attempt_id
      WHERE g.id = $1`,
    [resultId],
  );
  if (!row) throw new Error(`không có kết quả chấm ${resultId}`);
  const rubric: { key: string; max_points: string }[] = await m.query(
    `SELECT key, max_points FROM examcollect.rubric_criterion WHERE rubric_id = $1 ORDER BY sort_order, created_at, key`,
    [row.rubric_id_version],
  );
  const testBundleId: string | null = (await resolveProblemConfig(m, row.exam_session_id))?.testBundleId ?? null;
  const cases: { case_key: string; group: string }[] = testBundleId
    ? await m.query(
        `SELECT case_key, "group" FROM examcollect.grading_test_case
          WHERE bundle_id = $1 AND auto_dropped_reason IS NULL ORDER BY case_key`,
        [testBundleId],
      )
    : [];
  const waivers: { criterion_key: string }[] = await m.query(
    `SELECT criterion_key FROM examcollect.criterion_waiver WHERE rubric_id = $1 AND revoked_at IS NULL ORDER BY criterion_key`,
    [row.rubric_id_version],
  );
  // Ngoại lệ cấp lỗi MỚI NHẤT cho từng luật của bài này thắng (§2.2).
  const exceptionRows: { error_rule_id: string; direction: 'exclude' | 'include' }[] = await m.query(
    `SELECT DISTINCT ON (error_rule_id) error_rule_id, direction
       FROM examcollect.teacher_review
      WHERE grading_result_id = $1 AND kind = 'error_exception'
      ORDER BY error_rule_id, reviewed_at DESC, created_at DESC, id DESC`,
    [resultId],
  );
  const [manual] = await m.query(
    `SELECT 1 FROM examcollect.teacher_review WHERE grading_result_id = $1 AND kind = 'manual_score' LIMIT 1`,
    [resultId],
  );
  return {
    resultId,
    teacherId: row.teacher_id,
    sessionId: row.exam_session_id,
    problemId: (row.problem_id as string | null) ?? (await ensureDefaultProblem(m, row.exam_session_id)),
    pipeline: row.pipeline,
    status: row.status,
    ungradableClass: row.ungradable_class,
    rubricId: row.rubric_id_version,
    rubricName: row.rubric_name,
    attemptId: row.current_attempt_id,
    stored: storedOverride ?? (row.attempt_outcome === 'graded' ? readStoredInvestigation(row.investigation) : null),
    bundleId: testBundleId,
    bundleCases: cases.map((c) => ({ name: c.case_key, group: c.group })),
    rubric: rubric.map((c) => ({ key: c.key, maxHundredths: parseHundredths(c.max_points) })),
    waivedCriteria: waivers.map((w) => w.criterion_key),
    exceptions: new Map(exceptionRows.map((e) => [e.error_rule_id, e.direction])),
    hasManualScore: Boolean(manual),
    rulerTrust: await rulerTrustOf(m, row.exam_session_id as string),
  };
}
