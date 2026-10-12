import { compareAudit } from './audit-compare';

const cmp = (over: Partial<Parameters<typeof compareAudit>[0]> = {}) =>
  compareAudit({ picked: [], systemRuleIds: [], extraCount: 0, activeRuleCount: 3, ...over });

describe('compareAudit (parent spec §8.1 rule 3)', () => {
  it('both saw nothing: full agreement, every rule is "neither"', () => {
    expect(cmp()).toEqual({
      perRule: [],
      summary: { both: 0, teacherOnly: 0, systemOnly: 0, neither: 3, extra: 0, agreement: 'full' },
    });
  });

  it('the same set: full agreement', () => {
    const out = cmp({ picked: ['a', 'b'], systemRuleIds: ['b', 'a'] });
    expect(out.perRule).toEqual([
      { ruleId: 'a', verdict: 'both' },
      { ruleId: 'b', verdict: 'both' },
    ]);
    expect(out.summary).toMatchObject({ both: 2, neither: 1, agreement: 'full' });
  });

  it('the teacher saw a rule the system missed, and the system saw one the teacher did not', () => {
    const out = cmp({ picked: ['a', 'c'], systemRuleIds: ['a', 'b'] });
    expect(Object.fromEntries(out.perRule.map((r) => [r.ruleId, r.verdict]))).toEqual({
      a: 'both', c: 'teacher_only', b: 'system_only',
    });
    expect(out.summary).toMatchObject({ both: 1, teacherOnly: 1, systemOnly: 1, agreement: 'partial' });
  });

  it('nothing shared but something disagrees: none', () => {
    expect(cmp({ picked: ['a'], systemRuleIds: ['b'] }).summary.agreement).toBe('none');
    expect(cmp({ picked: ['a'] }).summary.agreement).toBe('none');
    expect(cmp({ systemRuleIds: ['b'] }).summary.agreement).toBe('none');
  });

  it('an extra error alone is disagreement — the system cannot name a rule the teacher does not have', () => {
    expect(cmp({ extraCount: 1 }).summary).toMatchObject({ extra: 1, agreement: 'none' });
    expect(cmp({ picked: ['a'], systemRuleIds: ['a'], extraCount: 2 }).summary).toMatchObject({ both: 1, extra: 2, agreement: 'partial' });
  });

  it('duplicates in either list do not double-count', () => {
    const out = cmp({ picked: ['a', 'a'], systemRuleIds: ['a', 'a', 'a'] });
    expect(out.perRule).toEqual([{ ruleId: 'a', verdict: 'both' }]);
    expect(out.summary.both).toBe(1);
  });

  it('"neither" never goes negative when the system found a rule that is no longer active', () => {
    const out = cmp({ picked: ['a'], systemRuleIds: ['retired_1', 'retired_2'], activeRuleCount: 1 });
    expect(out.summary.neither).toBe(0);
  });
});
