import { createElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { act, render, renderHook } from '@testing-library/react';
import { mockMatchMedia, type MatchMediaMock } from '@/test-utils/match-media';
import { NARROW_LIST_QUERY, useMediaQuery } from './useMediaQuery';

let mock: MatchMediaMock | null = null;
const originalMatchMedia = window.matchMedia;

afterEach(() => {
  mock?.restore();
  mock = null;
  window.matchMedia = originalMatchMedia;
});

describe('useMediaQuery', () => {
  it('reports the current match after mount', () => {
    mock = mockMatchMedia(true);
    const { result } = renderHook(() => useMediaQuery(NARROW_LIST_QUERY));
    expect(result.current).toBe(true);
  });

  it('follows later changes', () => {
    mock = mockMatchMedia(true);
    const { result } = renderHook(() => useMediaQuery(NARROW_LIST_QUERY));
    act(() => mock!.setMatches(false));
    expect(result.current).toBe(false);
    act(() => mock!.setMatches(true));
    expect(result.current).toBe(true);
  });

  it('removes its listener on unmount', () => {
    mock = mockMatchMedia(false);
    const { unmount } = renderHook(() => useMediaQuery(NARROW_LIST_QUERY));
    expect(mock.listenerCount()).toBe(1);
    unmount();
    expect(mock.listenerCount()).toBe(0);
  });

  it('is false when matchMedia does not exist', () => {
    delete (window as { matchMedia?: unknown }).matchMedia;
    const { result } = renderHook(() => useMediaQuery(NARROW_LIST_QUERY));
    expect(result.current).toBe(false);
  });

  it('is already right on the first render - no frame with the wrong layout', () => {
    mock = mockMatchMedia(true);
    const seen: boolean[] = [];
    function Probe() {
      seen.push(useMediaQuery(NARROW_LIST_QUERY));
      return null;
    }
    render(createElement(Probe));
    expect(seen[0]).toBe(true);
  });

  it('works on browsers that only have the legacy addListener API (Safari before 14)', () => {
    let current = true;
    const listeners = new Set<() => void>();
    window.matchMedia = ((query: string) => ({
      media: query,
      get matches() {
        return current;
      },
      addListener: (l: () => void) => listeners.add(l),
      removeListener: (l: () => void) => listeners.delete(l),
    })) as unknown as typeof window.matchMedia;
    const { result, unmount } = renderHook(() => useMediaQuery(NARROW_LIST_QUERY));
    expect(result.current).toBe(true);
    act(() => {
      current = false;
      listeners.forEach((l) => l());
    });
    expect(result.current).toBe(false);
    unmount();
    expect(listeners.size).toBe(0);
  });

  it('NARROW_LIST_QUERY is the 819px breakpoint', () => {
    expect(NARROW_LIST_QUERY).toBe('(max-width: 819px)');
  });
});
