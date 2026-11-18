import { describe, expect, it } from 'vitest';
import { criterionSelectLabel, isQsOverview } from './qs-errors-ui';
import type { RubricOverview } from './api/rubric-errors';

const qs: RubricOverview = {
  rubricName: 'dsa:01',
  rubricId: 'r1',
  kind: 'qs',
  totalPoints: 5,
  criteria: [
    { key: 'a_s1', description: 'Bước A1', maxPoints: 2, errorCount: 0, waiverId: null },
    { key: 'b_s1', description: 'Bước B1', maxPoints: 3, errorCount: 0, waiverId: null },
  ],
  approaches: [
    {
      key: 'a',
      name: 'Hướng A',
      maxPoints: 2,
      steps: [{ key: 'a_s1', description: 'Bước A1', maxPoints: 2, errorCount: 0, waiverId: null }],
    },
    {
      key: 'b',
      name: 'Hướng B',
      maxPoints: 3,
      steps: [{ key: 'b_s1', description: 'Bước B1', maxPoints: 3, errorCount: 0, waiverId: null }],
    },
  ],
  errorCount: 0,
  unpricedCount: 0,
  danglingCount: 0,
  proposalCount: 0,
  sessions: [],
  semesters: [],
};

describe('qs-errors-ui', () => {
  it('isQsOverview', () => {
    expect(isQsOverview(qs)).toBe(true);
    expect(isQsOverview({ ...qs, kind: 'qa', approaches: null })).toBe(false);
  });

  it('criterionSelectLabel có tiền tố hướng', () => {
    expect(criterionSelectLabel(qs, qs.criteria[0])).toContain('Hướng A ›');
    expect(criterionSelectLabel(qs, qs.criteria[0])).toContain('Bước A1');
  });
});
