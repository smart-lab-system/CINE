import { computeDeductionScore, ScoringCriterion, ScoringRule } from './deduction-score';

const criteria: ScoringCriterion[] = [
  { key: 'tinh_dung', maxHundredths: 600 },
  { key: 'hieu_nang', maxHundredths: 300 },
  { key: 'trinh_bay', maxHundredths: 100 },
];
const rules: ScoringRule[] = [
  { ruleKey: 'a', criterionKey: 'tinh_dung', deductionHundredths: 400 },
  { ruleKey: 'b', criterionKey: 'tinh_dung', deductionHundredths: 300 },
  { ruleKey: 'c', criterionKey: 'hieu_nang', deductionHundredths: 300 },
  { ruleKey: 'd', criterionKey: 'trinh_bay', deductionHundredths: 50 },
  { ruleKey: 'e', criterionKey: 'trinh_bay', deductionHundredths: null },
];

describe('computeDeductionScore', () => {
  it('không lỗi → điểm tối đa', () => {
    expect(computeDeductionScore(criteria, rules, []).scoreHundredths).toBe(1000);
  });

  it('trừ đúng mức của từng lỗi', () => {
    expect(computeDeductionScore(criteria, rules, ['c', 'd']).scoreHundredths).toBe(650);
  });

  it('T-MATH-2: mức trừ vượt trần tiêu chí → cắt ở trần, không tràn sang tiêu chí khác', () => {
    const r = computeDeductionScore(criteria, rules, ['a', 'b']);
    expect(r.scoreHundredths).toBe(400); // 1000 − min(700, 600)
    expect(r.perCriterion.find((c) => c.key === 'tinh_dung')).toMatchObject({
      deductedHundredths: 600,
      capped: true,
    });
  });

  it('T-MATH-1: Σ mức trừ vượt điểm tối đa → 0, không âm', () => {
    const tight: ScoringCriterion[] = [{ key: 'x', maxHundredths: 1000 }];
    const heavy: ScoringRule[] = [
      { ruleKey: 'p', criterionKey: 'x', deductionHundredths: 700 },
      { ruleKey: 'q', criterionKey: 'x', deductionHundredths: 700 },
    ];
    expect(computeDeductionScore(tight, heavy, ['p', 'q']).scoreHundredths).toBe(0);
  });

  it('luật chưa có giá → không trừ, nhưng được nêu ra', () => {
    const r = computeDeductionScore(criteria, rules, ['e']);
    expect(r.scoreHundredths).toBe(1000);
    expect(r.unpricedRuleKeys).toEqual(['e']);
  });

  it('10 − 0,1 − 0,2 ra đúng 9,70 — không có số thực nào ở giữa (§13.2)', () => {
    const one: ScoringCriterion[] = [{ key: 'x', maxHundredths: 1000 }];
    const small: ScoringRule[] = [
      { ruleKey: 'p', criterionKey: 'x', deductionHundredths: 10 },
      { ruleKey: 'q', criterionKey: 'x', deductionHundredths: 20 },
    ];
    expect(computeDeductionScore(one, small, ['p', 'q']).scoreHundredths).toBe(970);
  });

  it('ruleKey lạ, hay luật trỏ tới tiêu chí không có → ném lỗi, không lặng lẽ bỏ qua', () => {
    expect(() => computeDeductionScore(criteria, rules, ['khong-co'])).toThrow(/khong-co/);
    const orphan: ScoringRule[] = [{ ruleKey: 'z', criterionKey: 'khong-co', deductionHundredths: 10 }];
    expect(() => computeDeductionScore(criteria, orphan, ['z'])).toThrow(/khong-co/);
  });

  it('một lỗi chẩn đoán hai lần chỉ trừ một lần', () => {
    expect(computeDeductionScore(criteria, rules, ['c', 'c']).scoreHundredths).toBe(700);
  });
});
