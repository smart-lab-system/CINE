import { compareRuns, modelConfound, pairedBootstrap, perCaseValues } from './compare';
import { CaseRecord } from './runner-core';

function rec(caseId: string, attempt: number, over: Partial<CaseRecord>): CaseRecord {
  return {
    de: 'd', caseId, group: 1, attempt, pipeline: 'investigator', status: 'ok', error: null, outcome: 'graded',
    scoreHundredths: 900, expectedOutcome: 'graded', expectedScoreHundredths: 900, expectedRuleIds: [], foundRuleIds: [],
    violation: null, modelUsed: 'm', tokensIn: 0, tokensOut: 0, wallMs: 0, toolCalls: 0, stopReason: 'verdict', flags: [],
    investigation: null, summaryText: null, ...over,
  };
}
const cases = (n: number, over: (i: number) => Partial<CaseRecord>) => Array.from({ length: n }, (_, i) => rec(`c${i}`, 1, over(i)));

describe('so ghép cặp — §12.4 mục 4', () => {
  it('T-EVAL-4 — một ca đổi kết quả trên 60 ca → Δ KHÔNG được tô là thoái lui; khoảng tin cậy còn chứa 0', () => {
    const base = cases(60, () => ({ outcome: 'graded' }));
    const cand = cases(60, (i) => ({ outcome: i === 7 ? 'flagged' : 'graded' }));
    const r = compareRuns(base, cand, 'outcome_agreement')!;
    expect(r.cases).toBe(60);
    expect(r.delta).toBeCloseTo(-1 / 60);
    expect(r.lo).toBeLessThanOrEqual(0);
    expect(r.hi).toBeGreaterThanOrEqual(0);
    expect(r.verdict).toBe('no_change');
  });

  it('20/60 ca tệ đi → thoái lui (khoảng tin cậy nằm hẳn một phía)', () => {
    const r = compareRuns(cases(60, () => ({})), cases(60, (i) => ({ outcome: i < 20 ? 'flagged' : 'graded' })), 'outcome_agreement')!;
    expect(r.verdict).toBe('regression');
  });

  it('sai số điểm: thấp hơn là tốt hơn', () => {
    const base = cases(40, () => ({ scoreHundredths: 600 }));
    const cand = cases(40, () => ({ scoreHundredths: 900 }));
    expect(compareRuns(base, cand, 'abs_score_error')!.verdict).toBe('improvement');
  });

  it('k lượt của MỘT ca gộp thành một giá trị trước (đơn vị thống kê là ca)', () => {
    const v = perCaseValues(
      [rec('a', 1, { scoreHundredths: 800 }), rec('a', 2, { scoreHundredths: 1000 }), rec('a', 3, { status: 'error' })],
      'abs_score_error',
    );
    expect(v).toEqual(new Map([['d/a', 100]]));
  });

  it('bootstrap có seed — cùng dữ liệu, cùng khoảng', () => {
    expect(pairedBootstrap([1, 0, 0, -1, 2])).toEqual(pairedBootstrap([1, 0, 0, -1, 2]));
  });

  it('duyệt Q10 — hai lượt khác bộ model → báo Δ trộn hiệu ứng model; lượt lỗi không tính', () => {
    const base = [rec('a', 1, { modelUsed: 'glm' }), rec('b', 1, { status: 'error', modelUsed: 'claude' })];
    const rotated = [rec('a', 1, { modelUsed: 'glm+deepseek' })]; // investigator xoay bậc giữa chừng
    expect(modelConfound(base, rotated)).toEqual({ base: ['glm'], candidate: ['deepseek', 'glm'], same: false });
    expect(modelConfound(base, [rec('a', 1, { modelUsed: 'glm' })]).same).toBe(true);
  });
});
