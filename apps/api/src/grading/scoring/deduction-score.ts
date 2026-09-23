export interface ScoringCriterion {
  key: string;
  maxHundredths: number;
}
export interface ScoringRule {
  ruleKey: string;
  criterionKey: string;
  deductionHundredths: number | null;
}
export interface DeductionScore {
  scoreHundredths: number;
  maxHundredths: number;
  perCriterion: { key: string; maxHundredths: number; deductedHundredths: number; capped: boolean }[];
  unpricedRuleKeys: string[];
}

/**
 * Số học chấm trừ (spec 2026-09-20 §2.1), toàn bằng số nguyên phần trăm
 * điểm (§13.2):
 *
 *   điểm = clamp(0, tối_đa, tối_đa − Σ_C min(C.max, Σ mức_trừ quy về C))
 *
 * Luật chưa có giá không trừ gì, và được trả ra để người gọi nói ra — một
 * bài dính luật chưa có giá không được tự quyết (§2.1).
 */
export function computeDeductionScore(
  criteria: ScoringCriterion[],
  rules: ScoringRule[],
  diagnosedRuleKeys: string[],
): DeductionScore {
  const byRule = new Map(rules.map((r) => [r.ruleKey, r]));
  const byCriterion = new Map(criteria.map((c) => [c.key, c]));
  const deducted = new Map(criteria.map((c) => [c.key, 0]));
  const unpriced: string[] = [];

  for (const key of new Set(diagnosedRuleKeys)) {
    const rule = byRule.get(key);
    if (!rule) {
      throw new Error(`luật "${key}" không có trong bảng lỗi`);
    }
    if (!byCriterion.has(rule.criterionKey)) {
      throw new Error(`luật "${key}" trỏ tới tiêu chí "${rule.criterionKey}" không có trong rubric`);
    }
    if (rule.deductionHundredths === null) {
      unpriced.push(key);
      continue;
    }
    deducted.set(rule.criterionKey, (deducted.get(rule.criterionKey) ?? 0) + rule.deductionHundredths);
  }

  const maxHundredths = criteria.reduce((sum, c) => sum + c.maxHundredths, 0);
  const perCriterion = criteria.map((c) => {
    const raw = deducted.get(c.key) ?? 0;
    return {
      key: c.key,
      maxHundredths: c.maxHundredths,
      deductedHundredths: Math.min(raw, c.maxHundredths),
      capped: raw > c.maxHundredths,
    };
  });
  const total = perCriterion.reduce((sum, c) => sum + c.deductedHundredths, 0);
  return {
    scoreHundredths: Math.max(0, maxHundredths - total),
    maxHundredths,
    perCriterion,
    unpricedRuleKeys: unpriced,
  };
}
