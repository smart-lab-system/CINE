import { beforeEach, describe, expect, it, vi } from 'vitest';

const redirect = vi.fn();
vi.mock('next/navigation', () => ({ redirect: (...args: unknown[]) => redirect(...args) }));

import RubricsRedirect from './page';

describe('/teacher/rubrics', () => {
  beforeEach(() => redirect.mockClear());

  // Review Focus 6: the Rubric page was deleted; bookmarks, the old nav entry and SessionRubricCard's links
  // (until Plan C removes that card) must still land somewhere useful — Bảng lỗi holds the ceilings now.
  it('sends anyone who still arrives here to Bảng lỗi', () => {
    RubricsRedirect();
    expect(redirect).toHaveBeenCalledWith('/teacher/rules');
  });
});
