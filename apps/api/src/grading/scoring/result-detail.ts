import { DataSource } from 'typeorm';
import { GradingResultEntity } from '../entities/grading-result.entity';
import { GradingPipeline, TestBundleOrigin } from '../grading-model.types';
import { blindResultDetail } from '../audit-blind';
import { countNoErrorLabelsSinceReset, countRuleLabelsSinceReset, isNoErrorBreakerOpen, isRuleBreakerOpen } from '../auto-breaker/breaker-queries';
import { confidenceTerms, ConfidenceTerm } from '../decision/confidence';
import type { RulePredicate } from '../decision/types';
import { CurrentScore, currentScore } from './current-score';
import { buildTestBundleView, TestBundleView } from './test-bundle-view';
import { latestComputationRow, loadRuleSnapshots, teacherOfResult } from './score-inputs';
import type { ScoreBreakdown } from './score-core';
import type { StoredInvestigation } from './stored-investigation';
import type { CaseLensNote, ChallengeStatus } from '../investigator/challenge';
import type { TestCaseResult } from '../investigator/types';

/** Một kết luận của MỘT lăng kính per-error (Tính đúng, Quá tay) về MỘT lỗi. */
export interface ChallengeVerdictDetail {
  lens: string;
  ruleKey: string;
  status: ChallengeStatus;
  reason: string | null;
  /** Các lời gọi làm căn cứ, lấy từ `perError` của lăng kính (E1, §5.8). */
  toolCallIds: string[];
}

/** Độ khớp với giảng viên (§5.8b): đếm nhãn kiểm mẫu từ lần bật lại gần nhất. `paused`: cầu dao đang mở. */
export interface Agreement {
  n: number;
  disagreements: number;
  paused: boolean;
}

export interface ResultDetailError {
  ruleId: string;
  ruleKey: string;
  ruleName: string;
  /** Mô tả của luật ở bản sửa hiện hành (E1, §5.8). */
  ruleDescription: string | null;
  /** Điều kiện máy đo của luật; `null` nghĩa là luật bằng lời. */
  predicate: RulePredicate | null;
  criterionKey: string;
  source: ScoreBreakdown['errors'][number]['source'];
  toolCallIds: string[];
  deductionHundredths: number | null;
  counted: ScoreBreakdown['errors'][number]['counted'];
  agreement: Agreement;
}

export interface ResultDetail {
  pipeline: GradingPipeline;
  currentScore: number | null;
  currentScoreSource: CurrentScore['source'];
  status: string;
  ungradableClass: string | null;
  ungradableReason: string | null;
  breakdown: (Omit<ScoreBreakdown, 'errors'> & { errors: ResultDetailError[] }) | null;
  investigation: StoredInvestigation['result'] | null;
  /** Bước 6 — ghi chú của Bỏ sót/Gian lận. Rỗng khi chưa bật phản biện hay hồ sơ cũ. */
  challengeNotes: CaseLensNote[];
  /** Bước 6 — kết luận từng lăng kính per-error, kể cả khi xác nhận (khi đó không cờ nào hiện). */
  challengeVerdicts: ChallengeVerdictDetail[];
  /** Bảng đóng góp vào confidence (E1, §5.8b). Rỗng khi hồ sơ không có `modelCeiling` đã lưu. */
  confidenceTerms: ConfidenceTerm[];
  /** Độ khớp với giảng viên trên bài KHÔNG có lỗi nào (§5.8b). */
  noErrorAgreement: Agreement;
  /** Gói test và quy tắc trừ điểm của bài (E1, §5.8c). `null` khi bài không ghim gói test. */
  testBundle: TestBundleView | null;
}

interface ScoreSourceRow {
  latestComputationScore: string | null;
  finalizedComputationScore: string | null;
  latestManualScore: string | null;
}

interface LatestReviewRow {
  finalScore: string;
}

const NO_AGREEMENT: Agreement = { n: 0, disagreements: 0, paused: false };

/**
 * Chi tiết MỘT lượt tính điểm + đường điều tra của nó (Hồ sơ một bài, §5). Không route nào trả
 * cái này trước plan `2026-09-27-grading-knowledge-and-result-ui.md` — `listForSession` (danh
 * sách) chỉ trả `currentScore`, không trả `breakdown`/`investigation`. Chỉ đọc, không tính lại gì:
 * `computeScore`/`ScoreService` đã tính và lưu từ trước.
 */
export async function loadResultDetail(ds: DataSource, result: GradingResultEntity): Promise<ResultDetail> {
  // Bài kiểm mẫu chưa kiểm: trả bản mù NGAY, trước khi đọc bất kỳ dòng tính điểm hay lượt chấm nào (§8.1 luật 2).
  if (result.status === 'audit_pending') return blindResultDetail(result);

  const computation = await latestComputationRow(ds.manager, result.id);
  const [attempt] = result.currentAttemptId
    ? await ds.query(`SELECT investigation FROM examcollect.grading_attempt WHERE id = $1`, [result.currentAttemptId])
    : [null];
  const stored = attempt?.investigation as StoredInvestigation | undefined;
  const challengeNotes = stored?.challenge?.caseNotes ?? [];
  const challengeVerdicts: ChallengeVerdictDetail[] = (stored?.challenge?.perError ?? []).flatMap((c) =>
    c.perError.map((e) => ({
      lens: c.challenger,
      ruleKey: e.ruleKey,
      status: e.status,
      reason: e.reason ?? null,
      toolCallIds: e.toolCallIds,
    })),
  );

  let breakdown: ResultDetail['breakdown'] = null;
  let confidence: ConfidenceTerm[] = [];
  let noErrorAgreement: Agreement = NO_AGREEMENT;
  let testBundle: TestBundleView | null = null;
  if (computation) {
    const ruleIds = computation.breakdown.errors.map((e) => e.ruleId);
    const rules = new Map<string, { name: string; description: string; predicate: RulePredicate | null }>();
    if (ruleIds.length > 0) {
      const rows: { id: string; name: string; description: string; predicate: RulePredicate | null }[] = await ds.query(
        `SELECT r.id, v.name, v.description, v.predicate FROM examcollect.error_rule r
           JOIN examcollect.error_rule_revision v ON v.id = r.current_revision_id
          WHERE r.id = ANY($1::uuid[])`,
        [ruleIds],
      );
      for (const row of rows) rules.set(row.id, { name: row.name, description: row.description, predicate: row.predicate });
    }
    const teacherId = await teacherOfResult(ds.manager, result.id);
    const agreementByRule = new Map<string, Agreement>();
    for (const ruleId of new Set(ruleIds)) {
      const counts = await countRuleLabelsSinceReset(ds.manager, ruleId);
      agreementByRule.set(ruleId, { ...counts, paused: await isRuleBreakerOpen(ds.manager, teacherId, ruleId) });
    }
    breakdown = {
      ...computation.breakdown,
      errors: computation.breakdown.errors.map((e) => ({
        ...e,
        ruleName: rules.get(e.ruleId)?.name ?? e.ruleKey,
        ruleDescription: rules.get(e.ruleId)?.description ?? null,
        predicate: rules.get(e.ruleId)?.predicate ?? null,
        agreement: agreementByRule.get(e.ruleId) ?? NO_AGREEMENT,
      })),
    };
    // Bảng đóng góp chỉ có khi hồ sơ lưu `modelCeiling` (hồ sơ cũ và one_shot thì không): không có trần thì không tính được cap.
    confidence = typeof stored?.modelCeiling === 'number' ? confidenceTerms(computation.breakdown.errors, stored.modelCeiling) : [];
    noErrorAgreement = {
      ...(await countNoErrorLabelsSinceReset(ds.manager, teacherId)),
      paused: await isNoErrorBreakerOpen(ds.manager, teacherId),
    };
    if (computation.testBundleId) {
      testBundle = await loadTestBundle(ds, {
        resultId: result.id,
        teacherId,
        testBundleId: computation.testBundleId,
        priceTableVersionId: computation.priceTableVersionId,
        breakdownErrors: computation.breakdown.errors,
        stored,
      });
    }
  }

  const [scoreSource]: ScoreSourceRow[] = await ds.query(
    `SELECT
        (SELECT c.score FROM examcollect.score_computation c
          WHERE c.grading_result_id = g.id ORDER BY c.created_at DESC, c.id DESC LIMIT 1) AS "latestComputationScore",
        fc.score AS "finalizedComputationScore",
        (SELECT t.final_score FROM examcollect.teacher_review t
          WHERE t.grading_result_id = g.id AND t.kind = 'manual_score'
          ORDER BY t.reviewed_at DESC, t.id DESC LIMIT 1) AS "latestManualScore"
       FROM examcollect.grading_result g
       LEFT JOIN examcollect.score_computation fc ON fc.id = g.finalized_computation_id
      WHERE g.id = $1`,
    [result.id],
  );
  const [latestReview]: (LatestReviewRow & { kind: string })[] = await ds.query(
    `SELECT tr.final_score AS "finalScore", tr.kind AS "kind"
       FROM examcollect.teacher_review tr
      WHERE tr.grading_result_id = $1 AND tr.final_score IS NOT NULL
      ORDER BY tr.reviewed_at DESC, tr.id DESC LIMIT 1`,
    [result.id],
  );

  const current = currentScore({
    pipeline: result.pipeline,
    aiTotalScore: result.aiTotalScore,
    latestScoredReview: latestReview
      ? { kind: latestReview.kind as never, finalScore: latestReview.finalScore }
      : null,
    latestManualScore: scoreSource?.latestManualScore ?? null,
    finalized: result.status === 'finalized' || result.status === 'exported',
    finalizedComputationScore: scoreSource?.finalizedComputationScore ?? null,
    latestComputationScore: scoreSource?.latestComputationScore ?? null,
  });

  return {
    pipeline: result.pipeline,
    currentScore: current.value,
    currentScoreSource: current.source,
    status: result.status,
    ungradableClass: result.ungradableClass,
    ungradableReason: result.ungradableReason,
    breakdown,
    investigation: stored?.result ?? null,
    challengeNotes,
    challengeVerdicts,
    confidenceTerms: confidence,
    noErrorAgreement,
    testBundle,
  };
}

/**
 * Gói test của bài (§5.8c): đọc gói, ca và luật của rubric, rồi ghép với kết quả chạy gần nhất trong hồ sơ điều
 * tra. Chỉ đọc. Ca không có kết quả chạy là `not_run` trong `buildTestBundleView`.
 */
async function loadTestBundle(
  ds: DataSource,
  ctx: {
    resultId: string;
    teacherId: string;
    testBundleId: string;
    priceTableVersionId: string | null;
    breakdownErrors: ScoreBreakdown['errors'];
    stored: StoredInvestigation | undefined;
  },
): Promise<TestBundleView | null> {
  const [bundle]: {
    id: string;
    version: number;
    origin: TestBundleOrigin;
    filename: string | null;
    approved_at: Date | null;
  }[] = await ds.query(
    `SELECT id, version, origin, filename, approved_at FROM examcollect.grading_test_bundle WHERE id = $1`,
    [ctx.testBundleId],
  );
  if (!bundle) return null;
  const cases: {
    caseKey: string;
    group: string;
    input: string;
    expectedOutput: string;
    constraintQuote: string | null;
    autoDroppedReason: string | null;
  }[] = await ds.query(
    `SELECT case_key AS "caseKey", "group" AS "group", input, expected_output AS "expectedOutput",
            constraint_quote AS "constraintQuote", auto_dropped_reason AS "autoDroppedReason"
       FROM examcollect.grading_test_case WHERE bundle_id = $1 ORDER BY case_key`,
    [bundle.id],
  );
  const [rubric]: { name: string }[] = await ds.query(
    `SELECT rb.name FROM examcollect.grading_result g
       JOIN examcollect.rubric rb ON rb.id = g.rubric_id_version
      WHERE g.id = $1`,
    [ctx.resultId],
  );
  const rules = rubric
    ? await loadRuleSnapshots(ds.manager, ctx.teacherId, rubric.name, ctx.priceTableVersionId)
    : [];
  const triggered = new Set(ctx.breakdownErrors.filter((e) => e.counted === 'counted').map((e) => e.ruleId));
  return buildTestBundleView({
    id: bundle.id,
    version: bundle.version,
    origin: bundle.origin,
    filename: bundle.filename,
    approvedAt: bundle.approved_at,
    cases,
    runs: latestRunCases(ctx.stored),
    rules: rules.map((r) => ({
      ruleId: r.ruleId,
      ruleKey: r.ruleKey,
      predicate: r.predicate,
      deductionHundredths: r.deductionHundredths,
      triggered: triggered.has(r.ruleId),
    })),
  });
}

/**
 * Kết quả của lần chạy gần nhất cho từng ca, lấy từ các lời gọi `run_tests` thành công trong hồ sơ điều tra. Hồ sơ
 * cũ không có phần có cấu trúc thì trả rỗng, và mọi ca hiện là chưa chạy.
 */
function latestRunCases(stored: StoredInvestigation | undefined): TestCaseResult[] {
  const investigation = stored?.result?.investigation;
  if (!investigation) return [];
  const byName = new Map<string, TestCaseResult>();
  for (const call of investigation.toolCalls) {
    if (call.tool !== 'run_tests' || call.status !== 'ok' || !call.structuredRef) continue;
    const structured = investigation.structuredResults[call.structuredRef];
    if (structured?.kind !== 'run_tests') continue;
    for (const c of structured.cases) byName.set(c.name, c);
  }
  return [...byName.values()];
}
