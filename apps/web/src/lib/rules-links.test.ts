import { describe, expect, it } from 'vitest';
import { RULES_PATH, rulesHref } from './rules-links';

describe('rulesHref (T-RBE-UI-9)', () => {
  it('không biết rubric thì về trang gốc', () => {
    expect(rulesHref()).toBe(RULES_PATH);
    expect(rulesHref(null)).toBe(RULES_PATH);
    expect(rulesHref('')).toBe(RULES_PATH);
  });

  it('tên rubric đi vòng qua URL không mất ký tự nào (Review Focus 1)', () => {
    for (const name of ['Giữa kỳ CTDL', 'A&B #1 — Giữa kỳ?', 'a/b%c+d', ' có khoảng trắng ', 'Đề B (lần 2)']) {
      const href = rulesHref(name);
      expect(href.startsWith(`${RULES_PATH}?rubric=`)).toBe(true);
      expect(new URLSearchParams(href.split('?')[1]).get('rubric')).toBe(name);
    }
  });
});
