import { currentScore, CurrentScoreInput } from './current-score';

const base: CurrentScoreInput = {
  pipeline: 'investigator',
  aiTotalScore: '8.50',
  latestScoredReview: null,
  latestManualScore: null,
  finalized: false,
  finalizedComputationScore: null,
  latestComputationScore: null,
};

describe('currentScore §14.2', () => {
  it('one_shot: review mang điểm mới nhất, không thì ai_total_score', () => {
    expect(currentScore({ ...base, pipeline: 'one_shot', latestScoredReview: { kind: 'review', finalScore: '6.00' } })).toEqual({
      value: 6,
      source: 'review',
    });
    expect(currentScore({ ...base, pipeline: 'one_shot' })).toEqual({ value: 8.5, source: 'ai' });
  });

  it('investigator: chấm tay thắng cả phiên đã chốt', () => {
    expect(
      currentScore({ ...base, latestManualScore: '5.00', finalized: true, finalizedComputationScore: '9.00', latestComputationScore: '9.50' }),
    ).toEqual({ value: 5, source: 'manual' });
  });

  it('investigator đã chốt: lượt tính ĐÃ CHỐT, không phải lượt mới nhất', () => {
    expect(currentScore({ ...base, finalized: true, finalizedComputationScore: '9.00', latestComputationScore: '9.50' })).toEqual({
      value: 9,
      source: 'finalized',
    });
  });

  it('investigator chưa chốt: lượt tính mới nhất', () => {
    expect(currentScore({ ...base, latestComputationScore: '7.25' })).toEqual({ value: 7.25, source: 'computation' });
  });

  it('investigator chưa có lượt tính: null, KHÔNG ai_total_score', () => {
    expect(currentScore(base)).toEqual({ value: null, source: 'none' });
  });

  it('investigator: dòng review / bulk_accept không phải điểm hiện tại', () => {
    expect(
      currentScore({ ...base, latestScoredReview: { kind: 'bulk_accept', finalScore: '1.00' }, latestComputationScore: '7.00' }),
    ).toEqual({ value: 7, source: 'computation' });
  });
});
