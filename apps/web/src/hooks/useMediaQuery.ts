'use client';

import { useEffect, useState } from 'react';

/** Dưới ngưỡng này hai danh sách chấm điểm (phiên, bài) vẽ mỗi hàng thành một thẻ thay vì bảng. */
export const NARROW_LIST_QUERY = '(max-width: 819px)';

/**
 * Truy vấn media của trình duyệt có khớp không - để chọn VẼ bảng hay thẻ (mỗi lần chỉ một cách có trong DOM).
 *
 * Khởi đầu `false` ở cả server lẫn lần render đầu, rồi đồng bộ ngay khi vào trình duyệt: giá trị đầu khớp với HTML
 * server nên không lệch hydrate. Môi trường không có `matchMedia` thì giữ `false`.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia(query);
    const onChange = (event: MediaQueryListEvent) => setMatches(event.matches);
    setMatches(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}
