'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { ListFilters, ListView } from '@/lib/session-list';
import { parseListState, serializeListState, type ListState } from '@/lib/session-list-url';
import { rememberListQuery } from '@/lib/session-list-memory';

const SEARCH_DEBOUNCE_MS = 250;

/**
 * Trạng thái danh sách nằm trên URL (dán được) và được nhớ trong tab cho "Đổi phiên".
 *
 * Riêng ô tìm giữ bản nháp cục bộ: mỗi phím một `router.replace` làm con trỏ giật; danh sách lọc theo bản
 * nháp NGAY, còn URL đuổi theo sau một nhịp ngắn. Dùng `replace`, không `push`, nên Back rời hẳn trang thay
 * vì lùi qua từng phím.
 */
export function useSessionListState() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const state = useMemo(() => parseListState(new URLSearchParams(params.toString())), [params]);

  const [q, setQ] = useState(state.filters.q);
  // Đang gõ = bản nháp đi trước URL. `router.replace` cập nhật `useSearchParams` bất đồng bộ; một URL cũ đến
  // muộn không được ghi đè chữ vừa gõ thêm.
  const typing = useRef(false);

  // URL → ô tìm, khi URL đổi từ bên ngoài (bấm "Chấm điểm" ở thanh bên lúc đang ở danh sách, chẳng hạn).
  useEffect(() => {
    if (!typing.current) setQ(state.filters.q);
  }, [state.filters.q]);

  const commit = useCallback(
    (next: ListState) => {
      typing.current = false;
      const query = serializeListState(next).toString();
      rememberListQuery(query);
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [router, pathname],
  );

  // Ô tìm → URL, sau một nhịp.
  useEffect(() => {
    if (q === state.filters.q) return;
    const timer = setTimeout(() => commit({ ...state, filters: { ...state.filters, q } }), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [q, state, commit]);

  const filters: ListFilters = useMemo(() => ({ ...state.filters, q }), [state.filters, q]);

  const setFilters = useCallback(
    (next: ListFilters) => {
      // Tiếng gõ = chỉ `q` đổi và không rỗng: bản nháp + debounce lo phần URL. Mọi thay đổi khác (một bộ lọc,
      // một tab, "Xoá bộ lọc" — gửi `q: ''`) ghi URL ngay, kèm `q` hiện có của bản nháp.
      const typed = next.q !== q && next.q !== '';
      setQ(next.q);
      if (typed) {
        typing.current = true;
        return;
      }
      commit({ ...state, filters: next });
    },
    [commit, state, q],
  );
  const setView = useCallback((view: ListView) => commit({ ...state, view }), [commit, state]);

  return { filters, view: state.view, setFilters, setView };
}
