import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useNow } from './useNow';

describe('useNow', () => {
  afterEach(() => vi.useRealTimers());

  it('trả mốc hiện tại và làm mới sau mỗi chu kỳ — để trang mở lâu vẫn biết phiên đã tới giờ', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 6, 9, 0, 0));
    const { result } = renderHook(() => useNow(1000));
    const first = result.current;
    expect(first).toBe(new Date(2026, 9, 6, 9, 0, 0).getTime());
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(result.current - first).toBe(3000);
  });

  it('dọn bộ hẹn giờ khi gỡ', () => {
    vi.useFakeTimers();
    const clear = vi.spyOn(globalThis, 'clearInterval');
    const { unmount } = renderHook(() => useNow(1000));
    unmount();
    expect(clear).toHaveBeenCalled();
  });
});
