'use client';

import { useCallback, useSyncExternalStore } from 'react';

/** Dưới ngưỡng này hai danh sách chấm điểm (phiên, bài) vẽ mỗi hàng thành một thẻ thay vì bảng. */
export const NARROW_LIST_QUERY = '(max-width: 819px)';

const hasMatchMedia = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function';

/**
 * Truy vấn media của trình duyệt có khớp không - để chọn VẼ bảng hay thẻ (mỗi lần chỉ một cách có trong DOM).
 *
 * Dùng `useSyncExternalStore`: ở trình duyệt, lần render đầu đã đọc đúng giá trị (không có khung hình vẽ sai bố cục
 * rồi mới đổi); ở server trả `false`, và React tự đồng bộ lại khi hydrate. Môi trường không có `matchMedia` thì là
 * `false`. Safari trước 14 chỉ có `addListener`/`removeListener`, nên có đường lùi sang chúng.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!hasMatchMedia()) return () => {};
      const mql = window.matchMedia(query);
      if (typeof mql.addEventListener === 'function') {
        mql.addEventListener('change', onChange);
        return () => mql.removeEventListener('change', onChange);
      }
      mql.addListener(onChange);
      return () => mql.removeListener(onChange);
    },
    [query],
  );
  const getSnapshot = useCallback(() => (hasMatchMedia() ? window.matchMedia(query).matches : false), [query]);
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
