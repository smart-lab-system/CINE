import { beforeEach, describe, expect, it, vi } from 'vitest';

const redirect = vi.fn();
vi.mock('next/navigation', () => ({ redirect: (...args: unknown[]) => redirect(...args) }));

import QsAgnosticRedirect from './page';

describe('/teacher/rubrics/qa', () => {
  beforeEach(() => redirect.mockClear());

  it('tạm thời chuyển về dashboard', () => {
    QsAgnosticRedirect();
    expect(redirect).toHaveBeenCalledWith('/teacher/dashboard');
  });
});
