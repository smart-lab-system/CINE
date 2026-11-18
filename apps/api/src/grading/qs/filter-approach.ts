/**
 * Lọc tiêu chí thuộc hướng thắng trước khi đưa vào computeDeductionScore / AI.
 * Rubric QA không gọi: mọi approachKey đều null.
 */
export function criteriaForSelectedApproach<T extends { key: string; approachKey: string | null }>(
  criteria: T[],
  selectedApproachKey: string,
): T[] {
  return criteria.filter((c) => c.approachKey === selectedApproachKey);
}

export function rulesForSelectedApproach<T extends { criterionKey: string }>(
  rules: T[],
  allowedCriterionKeys: Set<string>,
): T[] {
  return rules.filter((r) => allowedCriterionKeys.has(r.criterionKey));
}
