import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

let search = '';
const replace = vi.fn();
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(search),
  useRouter: () => ({ replace }),
  usePathname: () => '/teacher/grading',
}));

import { useSessionListState } from './useSessionListState';

beforeEach(() => {
  search = '';
  replace.mockReset();
  sessionStorage.clear();
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

const lastUrl = () => replace.mock.calls.at(-1)?.[0] as string;

/**
 * `router.replace` của Next là một chuyển trang (có thể là một vòng mạng): `useSearchParams` chỉ đổi SAU
 * đó. Ở đây `search` cố định cho tới khi test tự "gửi tiếng vọng" về — đó chính là độ trễ cần chịu được.
 */
describe('useSessionListState — while the URL has not come back yet', () => {
  it('two quick changes both survive: the second is built on the first, not on the stale URL', () => {
    const { result } = renderHook(() => useSessionListState());
    act(() => result.current.setFilters({ ...result.current.filters, classIds: ['c1'] }));
    act(() => result.current.setFilters({ ...result.current.filters, classIds: [...result.current.filters.classIds, 'c2'] }));
    expect(result.current.filters.classIds).toEqual(['c1', 'c2']);
    expect(lastUrl()).toBe('/teacher/grading?cls=c1&cls=c2');
  });

  it('a sort change during a pending search draft is not undone when the search timer fires', () => {
    const { result } = renderHook(() => useSessionListState());
    act(() => result.current.setFilters({ ...result.current.filters, q: 'giua' }));
    act(() => result.current.setView({ ...result.current.view, sortKey: 'date', sortDir: 'desc' }));
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(lastUrl()).toContain('sort=date%3Adesc');
    expect(lastUrl()).toContain('q=giua');
  });

  it('the echo of an OLDER URL does not overwrite what has been typed since', () => {
    const { result, rerender } = renderHook(() => useSessionListState());
    act(() => result.current.setFilters({ ...result.current.filters, q: 'gi' }));
    act(() => {
      vi.advanceTimersByTime(400);
    });
    act(() => result.current.setFilters({ ...result.current.filters, q: 'giu' }));
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(replace.mock.calls.map((c) => c[0])).toEqual(['/teacher/grading?q=gi', '/teacher/grading?q=giu']);

    search = 'q=gi'; // tiếng vọng của lần ghi ĐẦU đến muộn
    rerender();
    expect(result.current.filters.q).toBe('giu');
    search = 'q=giu';
    rerender();
    expect(result.current.filters.q).toBe('giu');
  });

  it('"Xoá bộ lọc" with a search draft pending writes the bare URL at once', () => {
    const { result } = renderHook(() => useSessionListState());
    act(() => result.current.setFilters({ ...result.current.filters, q: 'abc' }));
    act(() => result.current.setFilters({ ...result.current.filters, q: '', status: 'all' }));
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(lastUrl()).toBe('/teacher/grading');
    expect(result.current.filters.q).toBe('');
  });
});

describe('useSessionListState — changes that come from outside', () => {
  it('starts from the URL, and adopts a URL it did not write (e.g. the sidebar link to the bare list)', () => {
    search = 'status=done';
    const { result, rerender } = renderHook(() => useSessionListState());
    expect(result.current.filters.status).toBe('done');
    search = '';
    rerender();
    expect(result.current.filters.status).toBe('all');
  });

  it('remembers what it wrote for "Đổi phiên"', () => {
    const { result } = renderHook(() => useSessionListState());
    act(() => result.current.setFilters({ ...result.current.filters, status: 'ready' }));
    expect(sessionStorage.getItem('grading.list.query')).toBe('status=ready');
  });
});
