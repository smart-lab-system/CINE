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
  /** `excluded`: giảng viên bỏ lỗi này cho riêng bài này; `unpriced`: luật chưa có giá. */
  counted: 'counted' | 'excluded' | 'unpriced';
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
  });

  const excludedKeys = new Set(used.filter((r) => input.exceptions.get(r.ruleId) === 'exclude').map((r) => r.ruleKey));
  const common = {
    caseFlags: decision.caseFlags,
    errorFlags: decision.errorFlags.filter((f) => !excludedKeys.has(f.ruleKey)),
    confidence: decision.confidence,
    mismatchedRules: mismatched.map((r) => ({ ruleId: r.ruleId, ruleKey: r.ruleKey, criterionKey: r.criterionKey })),
    notConsidered: notConsidered.map((r) => ({ ruleId: r.ruleId, ruleKey: r.ruleKey })),
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
    return {
      ruleId: r.ruleId,
      revisionId: r.revisionId,
      ruleKey: r.ruleKey,
      criterionKey: r.criterionKey,
      source: e.source,
      toolCallIds: e.toolCallIds,
      deductionHundredths: r.deductionHundredths,
      counted: excludedKeys.has(r.ruleKey) ? 'excluded' : r.deductionHundredths === null ? 'unpriced' : 'counted',
    };
  });
  const score = computeDeductionScore(
    input.rubric,
    used.map((r) => ({ ruleKey: r.ruleKey, criterionKey: r.criterionKey, deductionHundredths: r.deductionHundredths })),
    errors.filter((e) => e.counted !== 'excluded').map((e) => e.ruleKey),
  );
  return {
    outcome: decision.outcome,
    ungradable: null,
    scoreHundredths: score.scoreHundredths,
    breakdown: { errors, perCriterion: score.perCriterion, ...common },
  };
}

function toErrorRule(r: RuleSnapshot): ErrorRule {
  return { ruleKey: r.ruleKey, criterionKey: r.criterionKey, deductionHundredths: r.deductionHundredths, predicate: r.predicate };
}
