import type { Rule } from '@/lib/api/rules';

/** Luật mẫu cho test — mặc định là một luật máy kiểm đã có giá. */
export function rule(over: Partial<Omit<Rule, 'revision'>> & { revision?: Partial<Rule['revision']> } = {}): Rule {
  const { revision, ...rest } = over;
  return {
    id: 'r1',
    ruleKey: 'sai_bien',
    state: 'active',
    origin: 'teacher',
    checkedBy: 'machine',
    deduction: '1.50',
    appliedTo: { results: 5, sessions: 2 },
    mismatchedIn: 0,
    ...rest,
    revision: {
      id: 'v1',
      revision: 1,
      name: 'Sai ca biên',
      description: 'Nhóm biên không đạt',
      criterionKey: 'tinh_dung',
      predicate: { kind: 'test_group_failed', group: 'bien' },
      ...revision,
    },
  };
}
