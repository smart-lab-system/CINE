import { decide } from '../decision/decide';
import { isMachineChecked } from '../decision/predicates';
import type { CaseFlag, Decision, ErrorFlag, ErrorRule, RulePredicate, VerdictSource } from '../decision/types';
import { computeDeductionScore } from './deduction-score';
import type { StoredInvestigation } from './stored-investigation';

/** Một luật ĐANG DÙNG của giảng viên: bản sửa hiện hành, giá ở phiên bản bảng giá của lượt tính. */
export interface RuleSnapshot {
  ruleId: string;
  revisionId: string;
  ruleKey: string;
  criterionKey: string;
  predicate: RulePredicate | null;
  deductionHundredths: number | null;
}

export interface ScoreCoreInput {
  stored: StoredInvestigation;
  bundleCases: { name: string; group: string }[];
  rubric: { key: string; maxHundredths: number }[];
  rules: RuleSnapshot[];
  /** `rule_key` mà MỌI lượt chấm hiện hành của phiên đã thấy dưới dạng `model` (§2.2 *"tất cả hoặc không"*). */
  sessionModelRules: ReadonlySet<string>;
  waivedCriteria: string[];
  /** ruleId → ngoại lệ cấp lỗi MỚI NHẤT của bài này (§2.2). */
  exceptions: ReadonlyMap<string, 'exclude' | 'include'>;
  theta: number;
}

export interface BreakdownError {
  ruleId: string;
  revisionId: string;
  ruleKey: string;
  criterionKey: string;
  source: VerdictSource;
  toolCallIds: string[];
  deductionHundredths: number | null;
  /** `excluded`: giảng viên bỏ lỗi này cho riêng bài này; `unpriced`: luật chưa có giá;
   *  `refuted`: phản biện bác bỏ (§6.2) — KHÔNG xoá khỏi hồ sơ, chỉ loại khỏi điểm. */
  counted: 'counted' | 'excluded' | 'unpriced' | 'refuted';
}

export interface ScoreBreakdown {
  errors: BreakdownError[];
  perCriterion: { key: string; maxHundredths: number; deductedHundredths: number; capped: boolean }[];
  caseFlags: CaseFlag[];
  errorFlags: ErrorFlag[];
  confidence: number | null;
  /** Luật trỏ tiêu chí không có trong rubric của bài — bị loại, nêu ở trang kiến thức (§14.1). */
  mismatchedRules: { ruleId: string; ruleKey: string; criterionKey: string }[];
  /** Luật model phải phán mà không phải mọi bài của phiên đều đã thấy — không xét (§2.2, T-FAIR-1). */
  notConsidered: { ruleId: string; ruleKey: string }[];
  /** Khác null = lượt tính ra DƯỚI SÀN (§4.4): dòng tính lại không mang điểm, lý do nằm ở đây. */
  ungradable: Decision['ungradable'];
}

export interface ScoreCoreOutput {
  outcome: Decision['outcome'];
  ungradable: Decision['ungradable'];
  scoreHundredths: number | null;
  breakdown: ScoreBreakdown;
}

/**
 * Điểm là HÀM của chẩn đoán, bảng giá, rubric (§2.2) — không đọc DB, không gọi model hay sandbox.
 * Gọi lại được trên hồ sơ đã lưu mỗi khi giá, luật máy kiểm, đánh dấu tiêu chí hay ngoại lệ đổi.
 *
 * Ngoại lệ `exclude` áp SAU `decide()`: `decide()` vẫn chạy trên đủ luật, vì bỏ luật khỏi bảng thì
 * lỗi máy quyết của nó biến mất khỏi hồ sơ và tiêu chí của nó có thể trông như *"không có luật
 * nào"*. Bài có ngoại lệ đã `teacher_reviewed` (§14.3), nên `outcome` của nó không quyết trạng thái.
 */
export function computeScore(input: ScoreCoreInput): ScoreCoreOutput {
  const rubricKeys = new Set(input.rubric.map((c) => c.key));

  // §14.1: luật trỏ tiêu chí không khớp rubric thì không áp được trần — loại, nêu ra. `decide()`
  // ném với luật như vậy (M7 của 3a); một lượt tính không được chết vì giảng viên sửa một luật.
  const mismatched = input.rules.filter((r) => !rubricKeys.has(r.criterionKey));
  const matching = input.rules.filter((r) => rubricKeys.has(r.criterionKey));
  // T-FAIR-1: luật model phải PHÁN (bằng lời, hay có predicate mà máy chưa đo — Q1) chỉ xét khi
  // mọi bài của phiên đều đã thấy nó. Luật máy kiểm thì đo lại trên kết quả đã lưu (bậc 2).
  const considered = (r: RuleSnapshot) => isMachineChecked(r.predicate) || input.sessionModelRules.has(r.ruleKey);
  const notConsidered = matching.filter((r) => !considered(r));
  const used = matching.filter(considered);
  const byKey = new Map(used.map((r) => [r.ruleKey, r]));

  const decision = decide({
    pipeline: 'investigator',
    result: input.stored.result,
    bundle: { cases: input.bundleCases },
    rubric: input.rubric,
    rules: used.map(toErrorRule),
    rulesSeen: input.stored.rulesSeen,
    waivedCriteria: input.waivedCriteria,
    modelCeiling: input.stored.modelCeiling,
    theta: input.theta,
    challenge: input.stored.challenge ?? null,
  });

  const excludedKeys = new Set(used.filter((r) => input.exceptions.get(r.ruleId) === 'exclude').map((r) => r.ruleKey));
  const refutedKeys = new Set(decision.errorFlags.filter((f) => f.code === 'refuted').map((f) => f.ruleKey));
  const common = {
    caseFlags: decision.caseFlags,
    errorFlags: decision.errorFlags.filter((f) => !excludedKeys.has(f.ruleKey)),
    confidence: decision.confidence,
    mismatchedRules: mismatched.map((r) => ({ ruleId: r.ruleId, ruleKey: r.ruleKey, criterionKey: r.criterionKey })),
    notConsidered: notConsidered.map((r) => ({ ruleId: r.ruleId, ruleKey: r.ruleKey })),
    ungradable: decision.outcome === 'ungradable' ? decision.ungradable : null,
  };
  if (decision.outcome === 'ungradable') {
    return {
      outcome: 'ungradable',
      ungradable: decision.ungradable,
      scoreHundredths: null,
      breakdown: { errors: [], perCriterion: [], ...common },
    };
  }

  const errors: BreakdownError[] = decision.errors.map((e) => {
    const r = byKey.get(e.ruleKey)!;
    const counted: BreakdownError['counted'] = refutedKeys.has(r.ruleKey)
      ? 'refuted'
      : excludedKeys.has(r.ruleKey)
        ? 'excluded'
        : r.deductionHundredths === null
          ? 'unpriced'
          : 'counted';
    return {
      ruleId: r.ruleId,
      revisionId: r.revisionId,
      ruleKey: r.ruleKey,
      criterionKey: r.criterionKey,
      source: e.source,
      toolCallIds: e.toolCallIds,
      deductionHundredths: r.deductionHundredths,
      counted,
    };
  });
  const score = computeDeductionScore(
    input.rubric,
    used.map((r) => ({ ruleKey: r.ruleKey, criterionKey: r.criterionKey, deductionHundredths: r.deductionHundredths })),
    errors.filter((e) => e.counted !== 'excluded' && e.counted !== 'refuted').map((e) => e.ruleKey),
  );
  return {
    outcome: decision.outcome,
    ungradable: null,
    scoreHundredths: score.scoreHundredths,
    breakdown: { errors, perCriterion: score.perCriterion, ...common },
  };
}

/**
 * *"Áp giá mới cho phiên đã chốt"* (§2.2) đổi GIÁ, không đổi gì khác (review I3): cùng tập lỗi của
 * lượt tính đã chốt, cùng tính / bỏ, chỉ mức trừ theo bảng giá hiện hành. Luật mới, bản sửa luật,
 * đánh dấu tiêu chí có sau lúc chốt không lọt vào phiên đã đóng — đó là việc của luật ghim.
 * `newlyUnpriced`: luật lúc chốt có giá mà nay không — người gọi KHÔNG được công bố bài đó như một
 * lỗi miễn phí (§2.1: lỗi chưa giá không được quyết điểm).
 */
export function repriceBreakdown(
  before: ScoreBreakdown,
  rubric: { key: string; maxHundredths: number }[],
  prices: ReadonlyMap<string, number | null>,
): { scoreHundredths: number; breakdown: ScoreBreakdown; newlyUnpriced: { ruleId: string; ruleKey: string }[] } {
  const errors: BreakdownError[] = before.errors.map((e) => {
    // 'refuted' và 'excluded' đứng TRƯỚC giá mới: áp giá không phục hồi một lỗi phản biện đã
    // bác, cũng như không phục hồi một lỗi giảng viên đã loại — cả hai đều là quyết định của
    // một LƯỢT KHÁC (phản biện lúc chấm, hay giảng viên lúc duyệt), không phải của bảng giá.
    if (e.counted === 'excluded' || e.counted === 'refuted') return e;
    const deductionHundredths = prices.get(e.ruleId) ?? null;
    const counted: BreakdownError['counted'] = deductionHundredths === null ? 'unpriced' : 'counted';
    return { ...e, deductionHundredths, counted };
  });
  const newlyUnpriced = errors
    .filter((e, i) => e.counted === 'unpriced' && before.errors[i].counted !== 'unpriced')
    .map((e) => ({ ruleId: e.ruleId, ruleKey: e.ruleKey }));
  const score = computeDeductionScore(
    rubric,
    errors.map((e) => ({ ruleKey: e.ruleKey, criterionKey: e.criterionKey, deductionHundredths: e.deductionHundredths })),
    errors.filter((e) => e.counted !== 'excluded' && e.counted !== 'refuted').map((e) => e.ruleKey),
  );
  return {
    scoreHundredths: score.scoreHundredths,
    breakdown: {
      ...before,
      errors,
      perCriterion: score.perCriterion,
      // 'unpriced' tính lại từ giá mới; 'refuted'/'unverified' KHÔNG tính lại được ở đây (không có
      // kết luận phản biện trong tay), nên giữ nguyên cờ đã có từ lượt tính trước — mất chúng ở
      // đây là một lượt áp giá làm biến mất bằng chứng phản biện đã ghi.
      errorFlags: [
        ...errors.filter((e) => e.counted === 'unpriced').map((e) => ({ ruleKey: e.ruleKey, code: 'unpriced' as const })),
        ...before.errorFlags.filter((f) => f.code === 'refuted' || f.code === 'unverified'),
      ],
    },
    newlyUnpriced,
  };
}

function toErrorRule(r: RuleSnapshot): ErrorRule {
  return { ruleKey: r.ruleKey, criterionKey: r.criterionKey, deductionHundredths: r.deductionHundredths, predicate: r.predicate };
}
