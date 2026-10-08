import { beforeEach, describe, expect, it, vi } from 'vitest';

const redirect = vi.fn();
vi.mock('next/navigation', () => ({ redirect: (...args: unknown[]) => redirect(...args) }));

import NewRulePage from './page';

describe('/teacher/rules/new (T-RBE-UI-9, D11)', () => {
  beforeEach(() => redirect.mockClear());

  it('trang tạo luật riêng đã bỏ: dấu trang cũ về Bảng lỗi', () => {
    NewRulePage();
    expect(redirect).toHaveBeenCalledWith('/teacher/rules');
  });
});
