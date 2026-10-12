import { beforeEach, describe, expect, it, vi } from 'vitest';

const redirect = vi.fn();
vi.mock('next/navigation', () => ({ redirect: (...args: unknown[]) => redirect(...args) }));

import EditRulePage from './page';

describe('/teacher/rules/[ruleId] (T-RBE-UI-9, D11)', () => {
  beforeEach(() => redirect.mockClear());

  it('trang sửa luật riêng đã bỏ: dấu trang cũ về Bảng lỗi', () => {
    EditRulePage();
    expect(redirect).toHaveBeenCalledWith('/teacher/rules');
  });
});
