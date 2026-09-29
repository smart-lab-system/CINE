import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useOnlineStatus } from './useOnlineStatus';

const setOnline = (value: boolean) => vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(value);

afterEach(() => vi.restoreAllMocks());

describe('useOnlineStatus (T-UI-12: the page must know when THIS machine lost the network)', () => {
  it('starts from navigator.onLine', () => {
    setOnline(false);
    expect(renderHook(() => useOnlineStatus()).result.current).toBe(false);
    setOnline(true);
    expect(renderHook(() => useOnlineStatus()).result.current).toBe(true);
  });

  it('follows the offline and online events', () => {
    setOnline(true);
    const { result } = renderHook(() => useOnlineStatus());
    act(() => {
      setOnline(false);
      window.dispatchEvent(new Event('offline'));
    });
    expect(result.current).toBe(false);
    act(() => {
      setOnline(true);
      window.dispatchEvent(new Event('online'));
    });
    expect(result.current).toBe(true);
  });

  it('stops listening on unmount', () => {
    setOnline(true);
    const remove = vi.spyOn(window, 'removeEventListener');
    renderHook(() => useOnlineStatus()).unmount();
    expect(remove).toHaveBeenCalledWith('online', expect.any(Function));
    expect(remove).toHaveBeenCalledWith('offline', expect.any(Function));
  });
});
