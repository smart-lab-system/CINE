import { EntityManager } from 'typeorm';
import type { RulePredicate } from '../decision/types';
import { currentScore, CurrentScore } from './current-score';
import { parseHundredths } from './hundredths';
import type { RuleSnapshot, ScoreBreakdown } from './score-core';
import { readStoredInvestigation, StoredInvestigation } from './stored-investigation';

/**
 * Mọi lượt tính của MỘT giảng viên xếp hàng qua khoá này, tới hết transaction. Không có nó, một
 * lượt tính đầu đọc bảng giá cũ trong lúc một lượt sửa giá chưa commit và bị lượt đó bỏ qua (bài
 * còn `ai_grading`) — bài giữ điểm theo giá cũ mãi.
 *
 * THỨ TỰ KHOÁ là luật: khoá này TRƯỚC mọi khoá hàng. Người ghi nào của 3d/3e đụng dòng
 * `grading_result` đường điều tra (ghi lượt chấm, rút mẫu, chấm lại) phải xin khoá này trước khi
 * `FOR UPDATE` một dòng, không thì ôm chết với một lượt tính lại đang giữ khoá này và chờ dòng đó.
 */
export async function lockTeacherScoring(m: EntityManager, teacherId: string): Promise<void> {
  await m.query(`SELECT pg_advisory_xact_lock(hashtextextended('score_computation:' || $1::text, 0))`, [teacherId]);
}

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
): Promise<{ id: string; score: string | null; priceTableVersionId: string | null; breakdown: ScoreBreakdown } | null> {
  const [row] = await m.query(
    `SELECT id, score, price_table_version_id, breakdown FROM examcollect.score_computation
      WHERE grading_result_id = $1 ORDER BY created_at DESC, id DESC LIMIT 1`,
    [resultId],
  );
  return row
    ? { id: row.id, score: row.score, priceTableVersionId: row.price_table_version_id, breakdown: row.breakdown }
    : null;
}

/** Luật ĐANG DÙNG của giảng viên, giá ở `priceVersionId` (null = chưa có bảng giá: mọi luật chưa giá). */
export async function loadRuleSnapshots(
  m: EntityManager,
  teacherId: string,
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
    `SELECT r.id AS rule_id, v.id AS revision_id, r.rule_key, v.criterion_key, v.predicate, p.deduction
       FROM examcollect.error_rule r
       JOIN examcollect.error_rule_revision v ON v.id = r.current_revision_id
       LEFT JOIN examcollect.rule_price p ON p.error_rule_id = r.id AND p.price_table_version_id = $2
      WHERE r.teacher_id = $1 AND r.state = 'active'
      ORDER BY r.rule_key`,
    [teacherId, priceVersionId],
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

/**
 * `rule_key` là luật `model` trong BẢNG LỖI (`ruleTable`) của MỌI lượt chấm hiện hành (`graded`)
 * của phiên — §2.2 *"tất cả hoặc không"*: một luật lời thêm giữa lô thì bài bắt đầu trước không có
 * nó trong bảng, nên không bài nào của phiên xét nó. Đọc bảng lỗi, KHÔNG đọc `rulesSeen`: phép truy
 * hồi §2.1 cho mỗi bài xem một phần khác nhau của cùng một bảng (review 3c I1).
 * `exceptResultId`: tập của phiên khi CHƯA có bài đó — để phát hiện một bài vừa làm tập thu hẹp.
 */
export async function loadSessionModelRules(
  m: EntityManager,
  sessionId: string,
  exceptResultId: string | null = null,
): Promise<Set<string>> {
  const rows: { rule_key: string }[] = await m.query(
    `WITH att AS (
       SELECT a.id, a.investigation
         FROM examcollect.grading_result g
         JOIN examcollect.submission s ON s.id = g.submission_id
         JOIN examcollect.grading_attempt a ON a.id = g.current_attempt_id AND a.outcome = 'graded'
        WHERE s.exam_session_id = $1 AND g.pipeline = 'investigator'
          AND ($2::uuid IS NULL OR g.id <> $2))
     SELECT r ->> 'ruleKey' AS rule_key
       FROM att CROSS JOIN LATERAL jsonb_array_elements(att.investigation -> 'ruleTable') r
      WHERE r ->> 'checkedBy' = 'model'
      GROUP BY 1
     HAVING count(DISTINCT att.id) = (SELECT count(*) FROM att)
      ORDER BY 1`,
    [sessionId, exceptResultId],
  );
  return new Set(rows.map((r) => r.rule_key));
}

/**
 * Tập luật lời của phiên KHI thêm bài đang chấm: tập của các bài khác (`graded`) giao với luật
 * `model` trong bảng lỗi của bài này. Phiên chưa có bài `graded` nào khác → chính bảng của bài này.
 * Cho lượt tính đầu, khi lượt chấm chưa ghi kết cục nên `loadSessionModelRules` chưa thấy nó.
 */
export async function sessionModelRulesWith(
  m: EntityManager,
  sessionId: string,
  resultId: string,
  ruleTable: StoredInvestigation['ruleTable'],
): Promise<Set<string>> {
  const own = new Set(ruleTable.filter((r) => r.checkedBy === 'model').map((r) => r.ruleKey));
  const [{ n }] = await m.query(
    `SELECT count(*)::int AS n
       FROM examcollect.grading_result g
       JOIN examcollect.submission s ON s.id = g.submission_id
       JOIN examcollect.grading_attempt a ON a.id = g.current_attempt_id AND a.outcome = 'graded'
      WHERE s.exam_session_id = $1 AND g.pipeline = 'investigator' AND g.id <> $2`,
    [sessionId, resultId],
  );
  if (n === 0) return own;
  const others = await loadSessionModelRules(m, sessionId, resultId);
  return new Set([...own].filter((k) => others.has(k)));
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
  pipeline: 'one_shot' | 'investigator';
  status: string;
  ungradableClass: 'system' | 'submission' | null;
  rubricId: string;
  attemptId: string | null;
  stored: StoredInvestigation | null;
  bundleId: string | null;
  bundleCases: { name: string; group: string }[];
  rubric: { key: string; maxHundredths: number }[];
  waivedCriteria: string[];
  exceptions: Map<string, 'exclude' | 'include'>;
  hasManualScore: boolean;
}

/**
 * `storedOverride`: hồ sơ của lượt chấm ĐANG CHẠY (chưa có kết cục trong DB) — lượt tính đầu quyết
 * kết cục trên hồ sơ này TRƯỚC khi ghi nó, vì lượt chấm bất biến từ lúc có kết cục (§14.4).
 */
export async function loadScoreContext(
  m: EntityManager,
  resultId: string,
  storedOverride?: StoredInvestigation,
): Promise<ScoreContext> {
  const [row] = await m.query(
    `SELECT g.pipeline, g.status, g.ungradable_class, g.rubric_id_version, g.current_attempt_id,
            s.exam_session_id, es.teacher_id, es.test_bundle_id,
            a.outcome AS attempt_outcome, a.investigation
       FROM examcollect.grading_result g
       JOIN examcollect.submission s ON s.id = g.submission_id
       JOIN examcollect.exam_session es ON es.id = s.exam_session_id
       LEFT JOIN examcollect.grading_attempt a ON a.id = g.current_attempt_id
      WHERE g.id = $1`,
    [resultId],
  );
  if (!row) throw new Error(`không có kết quả chấm ${resultId}`);
  const rubric: { key: string; max_points: string }[] = await m.query(
    `SELECT key, max_points FROM examcollect.rubric_criterion WHERE rubric_id = $1 ORDER BY sort_order, created_at, key`,
    [row.rubric_id_version],
  );
  const cases: { case_key: string; group: string }[] = row.test_bundle_id
    ? await m.query(
        `SELECT case_key, "group" FROM examcollect.grading_test_case
          WHERE bundle_id = $1 AND auto_dropped_reason IS NULL ORDER BY case_key`,
        [row.test_bundle_id],
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
    pipeline: row.pipeline,
    status: row.status,
    ungradableClass: row.ungradable_class,
    rubricId: row.rubric_id_version,
    attemptId: row.current_attempt_id,
    stored: storedOverride ?? (row.attempt_outcome === 'graded' ? readStoredInvestigation(row.investigation) : null),
    bundleId: row.test_bundle_id,
    bundleCases: cases.map((c) => ({ name: c.case_key, group: c.group })),
    rubric: rubric.map((c) => ({ key: c.key, maxHundredths: parseHundredths(c.max_points) })),
    waivedCriteria: waivers.map((w) => w.criterion_key),
    exceptions: new Map(exceptionRows.map((e) => [e.error_rule_id, e.direction])),
    hasManualScore: Boolean(manual),
  };
}
