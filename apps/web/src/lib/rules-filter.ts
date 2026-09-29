import type { Rule } from '@/lib/api/rules';
import { matchKindOf } from '@/lib/rules-vocab';

export type RuleFilter = 'all' | 'unpriced' | 'machine' | 'words';

/** Bỏ dấu tiếng Việt + hạ chữ thường — để "ten bien" tìm được "Tên biến". */
function fold(text: string): string {
  return text
    .replace(/[đĐ]/g, 'd')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

function matchesFilter(rule: Rule, filter: RuleFilter): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'unpriced':
      return rule.deduction === null;
    case 'machine':
      // Theo `checkedBy` của API, không theo việc luật có `predicate` (spec §3.1): luật dùng mẫu
      // máy chưa đo được không phải "máy kiểm được", nên chỉ hiện ở "Tất cả".
      return rule.checkedBy === 'machine';
    case 'words':
      return matchKindOf(rule) === 'words';
  }
}

export function filterRules(rules: Rule[], filter: RuleFilter, query: string): Rule[] {
  const q = fold(query.trim());
  return rules.filter((rule) => {
    if (!matchesFilter(rule, filter)) return false;
    if (q === '') return true;
    return [rule.ruleKey, rule.revision.name, rule.revision.criterionKey].some((field) => fold(field).includes(q));
  });
}

export function countByFilter(rules: Rule[]): Record<RuleFilter, number> {
  return {
    all: rules.length,
    unpriced: filterRules(rules, 'unpriced', '').length,
    machine: filterRules(rules, 'machine', '').length,
    words: filterRules(rules, 'words', '').length,
  };
}
