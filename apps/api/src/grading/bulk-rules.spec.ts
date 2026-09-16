import { applyRule, type RuleCriterion, type RuleInput } from './bulk-rules';
import type { AdvocateOpinion } from './ai-provider/advocate.types';

const RUBRIC = [
  { id: 'c1', maxPoints: 4 },
  { id: 'c2', maxPoints: 3 },
];

function input(over: Partial<RuleInput> = {}): RuleInput {
  return {
    rubricCriteria: RUBRIC,
    criterionResults: [
      { criterionId: 'c1', verdict: 'not_met', points: 0, evidence: 'a' },
      { criterionId: 'c2', verdict: 'partially_met', points: 1.5, evidence: 'b' },
    ],
    advocateOpinion: null,
    ...over,
  };
}

function opinion(over: Partial<AdvocateOpinion> = {}): AdvocateOpinion {
  return {
    isCorrect: 'yes',
    reasoning: 'Em ấy mô tả đúng cơ chế bù trừ.',
    evidence: [],
    suggestedVerdicts: [],
    unverifiedEvidence: [],
    usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 },
    ...over,
  };
}

/** Bóc `criteria` ra, và nổ ngay nếu luật trả `no_advocate` ngoài dự kiến. */
function criteriaOf(outcome: ReturnType<typeof applyRule>): RuleCriterion[] {
  if (!outcome.ok) {
    throw new Error(`mong đợi luật chạy được, nhận: ${outcome.reason}`);
  }
  return outcome.criteria;
}

describe('applyRule — keep_ai', () => {
  it('chép nguyên mức đánh giá và điểm của AI', () => {
    expect(applyRule({ kind: 'keep_ai' }, input())).toEqual({
      ok: true,
      criteria: [
        { criterionId: 'c1', verdict: 'not_met', points: 0 },
        { criterionId: 'c2', verdict: 'partially_met', points: 1.5 },
      ],
    });
  });

  it('AI trả THIẾU một tiêu chí → output vẫn phủ ĐỦ rubric', () => {
    // `validateAndTotal` ném 400 nếu payload không phủ đủ. Duyệt theo đầu ra
    // AI thay vì theo rubric sẽ làm hỏng CẢ LÔ vì một bài.
    const criteria = criteriaOf(
      applyRule(
        { kind: 'keep_ai' },
        input({ criterionResults: [{ criterionId: 'c1', verdict: 'met', points: 4, evidence: '' }] }),
      ),
    );

    expect(criteria).toHaveLength(2);
    expect(criteria[1]).toEqual({ criterionId: 'c2', verdict: 'not_met', points: 0 });
  });
});

describe('applyRule — apply_advocate', () => {
  it('KHÔNG BAO GIỜ làm tụt điểm — khẳng định trên MỌI tiêu chí', () => {
    // Kiến nghị c1 lên met (0 → 4) và c2 xuống not_met (1.5 → 0).
    // Vế thứ hai phải bị chặn: max từng tiêu chí, không ghi đè mù.
    const criteria = criteriaOf(
      applyRule(
        { kind: 'apply_advocate' },
        input({
          advocateOpinion: opinion({
            suggestedVerdicts: [
              { criterionId: 'c1', suggestedVerdict: 'met', why: '' },
              { criterionId: 'c2', suggestedVerdict: 'not_met', why: '' },
            ],
          }),
        }),
      ),
    );

    const ai = input().criterionResults;
    for (const row of criteria) {
      const before = ai.find((c) => c.criterionId === row.criterionId)!;
      expect(row.points).toBeGreaterThanOrEqual(before.points);
    }
    expect(criteria[0].points).toBe(4);
    expect(criteria[1].points).toBe(1.5);
  });

  it('tiêu chí phản biện không nhắc tới thì giữ nguyên của AI', () => {
    const criteria = criteriaOf(
      applyRule(
        { kind: 'apply_advocate' },
        input({
          advocateOpinion: opinion({
            suggestedVerdicts: [{ criterionId: 'c1', suggestedVerdict: 'met', why: '' }],
          }),
        }),
      ),
    );

    expect(criteria[1]).toEqual({ criterionId: 'c2', verdict: 'partially_met', points: 1.5 });
  });

  it('không có ý kiến phản biện → no_advocate', () => {
    expect(applyRule({ kind: 'apply_advocate' }, input())).toEqual({
      ok: false,
      reason: 'no_advocate',
    });
  });
});

describe('applyRule — criterion_full_marks', () => {
  it('chỉ động vào tiêu chí đã nêu', () => {
    const criteria = criteriaOf(
      applyRule({ kind: 'criterion_full_marks', criterionId: 'c1' }, input()),
    );

    expect(criteria[0]).toEqual({ criterionId: 'c1', verdict: 'met', points: 4 });
    expect(criteria[1]).toEqual({ criterionId: 'c2', verdict: 'partially_met', points: 1.5 });
  });
});

describe('applyRule — criterion_bonus', () => {
  it('chặn TRẦN — không chặn là 400 cả lô', () => {
    const criteria = criteriaOf(
      applyRule({ kind: 'criterion_bonus', criterionId: 'c2', points: 5 }, input()),
    );

    expect(criteria[1]).toEqual({ criterionId: 'c2', verdict: 'met', points: 3 });
  });

  it('suy nhãn TỪ điểm: giữa trần và 0 là partially_met', () => {
    const criteria = criteriaOf(
      applyRule({ kind: 'criterion_bonus', criterionId: 'c1', points: 1 }, input()),
    );

    expect(criteria[0]).toEqual({ criterionId: 'c1', verdict: 'partially_met', points: 1 });
  });

  it('cộng 0 vào tiêu chí đang 0 thì vẫn là not_met', () => {
    const criteria = criteriaOf(
      applyRule({ kind: 'criterion_bonus', criterionId: 'c1', points: 0 }, input()),
    );

    expect(criteria[0].verdict).toBe('not_met');
  });

  it('tiêu chí không có trong rubric → không đổi gì', () => {
    expect(applyRule({ kind: 'criterion_bonus', criterionId: 'c-la', points: 2 }, input())).toEqual(
      applyRule({ kind: 'keep_ai' }, input()),
    );
  });
});
