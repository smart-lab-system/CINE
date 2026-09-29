'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { ListFilters, ListView } from '@/lib/session-list';
import { parseListState, serializeListState, type ListState } from '@/lib/session-list-url';
import { rememberListQuery } from '@/lib/session-list-memory';

const SEARCH_DEBOUNCE_MS = 250;
const MAX_IN_FLIGHT = 20;

/**
 * Trạng thái danh sách: STATE CỤC BỘ là nguồn sự thật, URL là bản sao ghi ra (dán được, và "Đổi phiên" nhớ được).
 *
 * Vì sao không đọc lại từ `useSearchParams`: `router.replace` là một chuyển trang — trên Vercel, với middleware,
 * là một vòng mạng — và `useSearchParams` chỉ đổi SAU đó. Dựng trạng thái mới từ URL cũ trong lúc chờ thì hai
 * cú bấm nhanh làm rơi cú thứ nhất, và một tiếng vọng đến muộn ghi đè chữ vừa gõ. Ở đây mọi thay đổi áp ngay
 * vào state (giao diện đổi tức thì), rồi mới ghi URL; tiếng vọng của CHÍNH những gì đã ghi thì bị bỏ qua, còn
 * một URL lạ (bấm "Chấm điểm" ở thanh bên khi đang ở danh sách) được nhận vào như thay đổi từ bên ngoài.
 *
 * Ô tìm: chữ gõ vào áp ngay, URL đuổi theo sau một nhịp ngắn (mỗi phím một `replace` làm con trỏ giật). Dùng
 * `replace`, không `push`, nên Back rời hẳn trang thay vì lùi qua từng phím.
 */
export function useSessionListState() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const urlQuery = params.toString();

  const [state, setState] = useState<ListState>(() => parseListState(new URLSearchParams(urlQuery)));
  const latest = useRef(state); // trạng thái mới nhất, đọc đồng bộ (state của React chỉ đổi sau lần render sau)
  const inFlight = useRef<string[]>([]); // query đã ghi mà tiếng vọng chưa về, cũ nhất trước
  const lastSeen = useRef(urlQuery);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const apply = useCallback((next: ListState) => {
    latest.current = next;
    setState(next);
  }, []);

  const cancelPendingWrite = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const write = useCallback(
    (next: ListState) => {
      const query = serializeListState(next).toString();
      rememberListQuery(query);
      inFlight.current = [...inFlight.current, query].slice(-MAX_IN_FLIGHT);
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [router, pathname],
  );

  // URL → state, chỉ cho thay đổi TỪ BÊN NGOÀI.
  useEffect(() => {
    if (urlQuery === lastSeen.current) return;
    lastSeen.current = urlQuery;
    const echoOf = inFlight.current.indexOf(urlQuery);
    if (echoOf >= 0) {
      // Tiếng vọng của một lần ghi của chính mình (có thể là của lần CŨ hơn): bỏ qua, kể cả những lần cũ hơn nó.
      inFlight.current = inFlight.current.slice(echoOf + 1);
      return;
    }
    cancelPendingWrite();
    inFlight.current = [];
    apply(parseListState(new URLSearchParams(urlQuery)));
  }, [urlQuery, apply, cancelPendingWrite]);

  // Rời trang khi còn bản nháp tìm kiếm chưa ghi: chỉ NHỚ nó cho "Đổi phiên". Không `replace` ở đây — lúc này
  // trang đang chuyển đi chỗ khác, và ghi URL của danh sách sẽ tranh với chính cú chuyển trang đó.
  useEffect(
    () => () => {
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
        rememberListQuery(serializeListState(latest.current).toString());
      }
    },
    [],
  );

  const setFilters = useCallback(
    (next: ListFilters) => {
      // Tiếng gõ = `q` đổi và không rỗng: URL đuổi theo sau một nhịp. Mọi thay đổi khác (một bộ lọc, một tab,
      // "Xoá bộ lọc" — gửi `q: ''`) ghi URL ngay, kèm `q` hiện có.
      const typed = next.q !== latest.current.filters.q && next.q !== '';
      const nextState: ListState = { ...latest.current, filters: next };
      apply(nextState);
      cancelPendingWrite();
      if (typed) {
        timer.current = setTimeout(() => {
          timer.current = null;
          write(latest.current);
        }, SEARCH_DEBOUNCE_MS);
      } else {
        write(nextState);
      }
    },
    [apply, cancelPendingWrite, write],
  );

  const setView = useCallback(
    (view: ListView) => {
      const nextState: ListState = { ...latest.current, view };
      apply(nextState);
      // Ghi ngay và huỷ hẹn giờ: bản nháp tìm kiếm nằm sẵn trong state, nên lần ghi này đã mang nó — để hẹn giờ
      // bắn sau bằng một bản cũ sẽ hoàn tác đúng thay đổi vừa làm.
      cancelPendingWrite();
      write(nextState);
    },
    [apply, cancelPendingWrite, write],
  );

  return { filters: state.filters, view: state.view, setFilters, setView };
}
