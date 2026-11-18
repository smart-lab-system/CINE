import { criteriaForSelectedApproach, rulesForSelectedApproach } from './filter-approach';

describe('filter-approach', () => {
  const criteria = [
    { key: 'sw_a', approachKey: 'sliding_window' as string | null },
    { key: 'sw_b', approachKey: 'sliding_window' as string | null },
    { key: 'bf_a', approachKey: 'brute_force' as string | null },
  ];

  it('chỉ giữ tiêu chí của hướng thắng', () => {
    expect(criteriaForSelectedApproach(criteria, 'sliding_window').map((c) => c.key)).toEqual([
      'sw_a',
      'sw_b',
    ]);
  });

  it('lọc luật theo tập criterion key đã chọn', () => {
    const allowed = new Set(['sw_a', 'sw_b']);
    const rules = [
      { ruleKey: 'r1', criterionKey: 'sw_a' },
      { ruleKey: 'r2', criterionKey: 'bf_a' },
    ];
    expect(rulesForSelectedApproach(rules, allowed).map((r) => r.ruleKey)).toEqual(['r1']);
  });
});
