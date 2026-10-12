import { describe, expect, it } from 'vitest';
import type { GradingResult } from '@/lib/api/grading';
import { countSystemUngradable, groupByUngradableReason } from './regrade-triage';

const result = (over: Partial<GradingResult> = {}): GradingResult => ({
  id: 'r', submissionId: 's', studentMssv: '1', studentName: 'An', homeClassId: 'c', homeClassName: 'N01',
  status: 'flagged_for_review', modelUsed: null, aiTotalScore: null, confidence: null, flagForReview: true,
  ungradableReason: 'Dịch vụ AI không phản hồi.', criterionResults: [], advocateOpinion: null,
  contextUsedQuestion: null, contextUsedModelAnswer: null, finalScore: null, reviewedAt: null,
  reviewedByName: null, editedCriteria: null, pipeline: 'one_shot', currentScore: null,
  currentScoreSource: 'computation', ungradableClass: 'system', ...over,
});

describe('countSystemUngradable (G3 §4.4)', () => {
  it('counts stopped results of class system', () => {
    expect(countSystemUngradable([result(), result({ id: 'b' })])).toBe(2);
  });

  it('does not count the submission class — regrading it would only reproduce the same failure', () => {
    expect(countSystemUngradable([result(), result({ id: 'b', ungradableClass: 'submission' })])).toBe(1);
  });

  // Review Focus #5: an old API sends no class. Counting those would show a number that may be wrong.
  it('does not count a result whose class the API did not send', () => {
    expect(countSystemUngradable([result({ ungradableClass: undefined }), result({ id: 'b', ungradableClass: null })])).toBe(0);
  });

  it('does not count a result that is no longer stopped, even if it still carries a class', () => {
    expect(countSystemUngradable([result({ status: 'ai_grading', ungradableReason: null })])).toBe(0);
    expect(countSystemUngradable([result({ status: 'finalized', ungradableReason: null })])).toBe(0);
  });
});

describe('groupByUngradableReason', () => {
  it('groups by the reason text, largest group first', () => {
    const groups = groupByUngradableReason([
      result({ id: 'a', ungradableReason: 'Hết giờ' }),
      result({ id: 'b', ungradableReason: 'AI lỗi' }),
      result({ id: 'c', ungradableReason: 'AI lỗi' }),
    ]);
    expect(groups).toEqual([
      { reason: 'AI lỗi', count: 2 },
      { reason: 'Hết giờ', count: 1 },
    ]);
  });

  it('leaves out the submission class and results with no class, even with the same text', () => {
    const groups = groupByUngradableReason([
      result({ id: 'a', ungradableReason: 'AI lỗi' }),
      result({ id: 'b', ungradableReason: 'AI lỗi', ungradableClass: 'submission' }),
      result({ id: 'c', ungradableReason: 'AI lỗi', ungradableClass: undefined }),
    ]);
    expect(groups).toEqual([{ reason: 'AI lỗi', count: 1 }]);
  });

  it('is empty when nothing stopped', () => {
    expect(groupByUngradableReason([])).toEqual([]);
  });
});
