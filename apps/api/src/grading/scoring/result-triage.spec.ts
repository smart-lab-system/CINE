import type { BreakdownError, ScoreBreakdown } from './score-core';
import { triageOf } from './result-triage';

const err = (ruleKey: string, counted: BreakdownError['counted']): BreakdownError => ({
  ruleId: `id-${ruleKey}`, revisionId: `rev-${ruleKey}`, ruleKey, criterionKey: 'tinh_dung',
  source: 'deterministic', toolCallIds: [], deductionHundredths: 100, counted,
});

const breakdown = (over: Partial<ScoreBreakdown> = {}): ScoreBreakdown => ({
  errors: [], perCriterion: [], caseFlags: [], errorFlags: [], confidence: 1,
  mismatchedRules: [], notConsidered: [], ungradable: null, ...over,
});

const investigator = (b: ScoreBreakdown | null, ungradableClass: string | null = null) =>
  triageOf({ pipeline: 'investigator', ungradableClass, breakdown: b });

describe('triageOf (G1 §2)', () => {
  it('bài tự luận không có bảng lỗi → null', () => {
    expect(triageOf({ pipeline: 'one_shot', ungradableClass: null, breakdown: breakdown() })).toBeNull();
  });

  it('chưa có lượt tính nào → null', () => {
    expect(investigator(null)).toBeNull();
  });

  it('bài không chấm được → null, dù lượt tính cuối có breakdown (Review Focus 3)', () => {
    expect(investigator(breakdown(), 'system')).toBeNull();
    expect(investigator(breakdown({ ungradable: { class: 'submission', reason: 'x' } }))).toBeNull();
  });

  it('đếm lỗi theo nhãn counted, kể cả không lỗi nào (0 chứ không null)', () => {
    expect(investigator(breakdown())?.counts).toEqual({ counted: 0, unpriced: 0, refuted: 0, excluded: 0 });
    const b = breakdown({ errors: [err('a', 'counted'), err('b', 'counted'), err('c', 'unpriced'), err('d', 'refuted'), err('e', 'excluded')] });
    expect(investigator(b)?.counts).toEqual({ counted: 2, unpriced: 1, refuted: 1, excluded: 1 });
  });

  it('chép cờ cấp bài và cờ cấp lỗi nguyên vẹn', () => {
    const b = breakdown({
      caseFlags: [{ code: 'criterion_without_rules', detail: 'tiêu chí "x" không có luật nào trỏ vào' }],
      errorFlags: [{ ruleKey: 'a', code: 'unpriced' }, { ruleKey: 'b', code: 'unverified' }],
    });
    expect(investigator(b)).toMatchObject({
      caseFlags: [{ code: 'criterion_without_rules', detail: 'tiêu chí "x" không có luật nào trỏ vào' }],
      errorFlags: [{ ruleKey: 'a', code: 'unpriced' }, { ruleKey: 'b', code: 'unverified' }],
    });
  });

  it('trả bản sao — sửa kết quả không làm hỏng breakdown gốc', () => {
    const b = breakdown({ errorFlags: [{ ruleKey: 'a', code: 'unpriced' }] });
    const out = investigator(b)!;
    out.errorFlags.push({ ruleKey: 'z', code: 'refuted' });
    expect(b.errorFlags).toHaveLength(1);
  });
});
