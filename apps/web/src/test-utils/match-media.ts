/**
 * Giả `window.matchMedia` cho test: một giá trị `matches` đổi được, và các listener `'change'` được gọi khi đổi.
 * Không import vitest hay Testing Library: file này nằm trong `src/` nên `tsc` và build cũng quét nó.
 */
export interface MatchMediaMock {
  /** Đổi kết quả của mọi truy vấn và báo cho các listener đã đăng ký. Bọc trong `act` khi gọi từ test. */
  setMatches(next: boolean): void;
  /** Số listener `'change'` đang đăng ký (để kiểm tra việc gỡ khi unmount). */
  listenerCount(): number;
  /** Trả lại hàm `matchMedia` ban đầu (stub của `vitest.setup.ts`). */
  restore(): void;
}

type ChangeListener = (event: MediaQueryListEvent) => void;

export function mockMatchMedia(initial: boolean): MatchMediaMock {
  const original = window.matchMedia;
  let current = initial;
  const listeners = new Set<ChangeListener>();

  window.matchMedia = ((query: string) => ({
    media: query,
    get matches() {
      return current;
    },
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: (type: string, listener: ChangeListener) => {
      if (type === 'change') listeners.add(listener);
    },
    removeEventListener: (type: string, listener: ChangeListener) => {
      if (type === 'change') listeners.delete(listener);
    },
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;

  return {
    setMatches(next) {
      current = next;
      listeners.forEach((listener) => listener({ matches: next } as MediaQueryListEvent));
    },
    listenerCount: () => listeners.size,
    restore() {
      window.matchMedia = original;
    },
  };
}
