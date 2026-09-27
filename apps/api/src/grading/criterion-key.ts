/**
 * `rubric_criterion.key` (§14.1): đặt lúc tạo tiêu chí, không bao giờ sửa. Luật lỗi trỏ tiêu chí
 * bằng key chứ không bằng id của một dòng tiêu chí, vì luật dùng lại qua nhiều đề và nhiều phiên
 * bản rubric. Nên key phải ỔN ĐỊNH: cùng mô tả qua hai lần lưu rubric thì ra cùng key.
 */
export const CRITERION_KEY = /^[a-z0-9_]{1,64}$/;
const MAX_DERIVED = 48;

export class DuplicateCriterionKeyError extends Error {
  constructor(readonly key: string) {
    super(`Hai tiêu chí cùng khai key "${key}"`);
  }
}

function slug(description: string): string {
  return description
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, MAX_DERIVED)
    .replace(/_+$/g, '');
}

export function assignCriterionKeys(criteria: { description: string; key?: string }[]): string[] {
  const explicit = criteria.map((c) => c.key).filter((k): k is string => Boolean(k));
  const taken = new Set<string>();
  for (const key of explicit) {
    if (taken.has(key)) throw new DuplicateCriterionKeyError(key);
    taken.add(key);
  }
  return criteria.map((c, index) => {
    if (c.key) return c.key;
    const base = slug(c.description) || `tieu_chi_${index + 1}`;
    let key = base;
    for (let n = 2; taken.has(key); n++) key = `${base}_${n}`;
    taken.add(key);
    return key;
  });
}
