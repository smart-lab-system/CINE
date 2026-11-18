import type { QsApproach } from './qs.types';
import { approachKeyByCriterionId, resolveAndScoreQs } from './resolve-and-score-qs';

const approaches: QsApproach[] = [
  {
    key: 'brute',
    name: 'Brute',
    steps: [
      { key: 'brute_s1', description: 'Vòng', maxPoints: 2 },
      { key: 'brute_s2', description: 'Max', maxPoints: 3 },
    ],
  },
  {
    key: 'sliding',
    name: 'Sliding',
    steps: [{ key: 'sliding_s1', description: 'Cửa sổ', maxPoints: 7 }],
  },
];

const criteria = [
  { id: 'c1', key: 'brute_s1', approachKey: 'brute' },
  { id: 'c2', key: 'brute_s2', approachKey: 'brute' },
  { id: 'c3', key: 'sliding_s1', approachKey: 'sliding' },
];

describe('resolveAndScoreQs', () => {
  it('dùng approachKey AI khi hợp lệ', () => {
    const out = resolveAndScoreQs({
      approaches,
      criteria,
      aiSelectedApproachKey: 'sliding',
      criterionResults: [
        { criterionId: 'c1', verdict: 'met', evidence: 'x' },
        { criterionId: 'c2', verdict: 'met', evidence: 'y' },
        { criterionId: 'c3', verdict: 'met', evidence: 'z' },
      ],
    });
    expect(out.selectionSource).toBe('ai');
    expect(out.selectedApproachKey).toBe('sliding');
    // M = 7; earned sliding full 7 → full thang 7
    expect(out.totalScore).toBe(7);
    expect(out.criterionResults.find((r) => r.criterionId === 'c3')?.points).toBe(7);
    expect(out.criterionResults.find((r) => r.criterionId === 'c1')?.points).toBe(0);
  });

  it('fallback max earned khi AI key sai', () => {
    const out = resolveAndScoreQs({
      approaches,
      criteria,
      aiSelectedApproachKey: 'nope',
      criterionResults: [
        { criterionId: 'c1', verdict: 'not_met', evidence: '' },
        { criterionId: 'c2', verdict: 'not_met', evidence: '' },
        { criterionId: 'c3', verdict: 'met', evidence: 'ok' },
      ],
    });
    expect(out.selectionSource).toBe('fallback_max_earned');
    expect(out.selectedApproachKey).toBe('sliding');
  });

  it('fallback khi AI không trả key', () => {
    const out = resolveAndScoreQs({
      approaches,
      criteria,
      aiSelectedApproachKey: null,
      criterionResults: [
        { criterionId: 'c1', verdict: 'met', evidence: 'a' },
        { criterionId: 'c2', verdict: 'met', evidence: 'b' },
        { criterionId: 'c3', verdict: 'not_met', evidence: '' },
      ],
    });
    expect(out.selectionSource).toBe('fallback_max_earned');
    expect(out.selectedApproachKey).toBe('brute');
    // earned 5, M = 7 → 5/7 * 7 = 5
    expect(out.totalScore).toBe(5);
  });
});

describe('approachKeyByCriterionId', () => {
  it('map id bước → approachKey', () => {
    const map = approachKeyByCriterionId(
      [
        { id: 'c1', key: 'brute_s1' },
        { id: 'c3', key: 'sliding_s1' },
      ],
      approaches,
    );
    expect(map.get('c1')).toBe('brute');
    expect(map.get('c3')).toBe('sliding');
  });
});
