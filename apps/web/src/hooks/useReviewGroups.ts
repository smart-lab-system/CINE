'use client';

import { useEffect, useRef, useSyncExternalStore } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { SESSION_SUMMARIES_KEY } from '@/hooks/useGrading';
import {
  confirmReviewGroup,
  listAutoBreakers,
  listReviewGroups,
  markResultOpened,
  resetAutoBreaker,
} from '@/lib/api/review-groups';
import {
  openedResultsServerSnapshot,
  openedResultsSnapshot,
  rememberOpened,
  subscribeOpenedResults,
} from '@/lib/opened-results';

/**
 * Khoá cache của nhóm bài — NẰM DƯỚI khoá danh sách kết quả của phiên (`['exam-sessions', id, 'grading-results']`).
 * Cố ý: mọi chỗ làm mới danh sách kết quả (duyệt từng bài, chấm tay, chốt điểm, lượt chấm vừa xong) đều làm mới
 * theo tiền tố đó, nên nhóm bài được làm mới cùng lúc mà không chỗ nào phải nhớ thêm một khoá.
 */
export function reviewGroupsQueryKey(examSessionId: string | undefined) {
  return ['exam-sessions', examSessionId, 'grading-results', 'review-groups'] as const;
}

export const AUTO_BREAKERS_KEY = ['auto-breakers'] as const;

/** Bài cần xem của phiên, gom theo lỗi (spec duyệt nhanh §5.4). */
export function useReviewGroups(examSessionId: string | undefined) {
  return useQuery({
    queryKey: reviewGroupsQueryKey(examSessionId),
    queryFn: () => listReviewGroups(examSessionId!),
    enabled: Boolean(examSessionId),
  });
}

/** Các phạm vi đang tạm dừng tự chốt của giảng viên (§5.3). Không theo phiên. */
export function useAutoBreakers() {
  return useQuery({ queryKey: AUTO_BREAKERS_KEY, queryFn: listAutoBreakers });
}

/**
 * Duyệt một nhóm. Thành công thì làm mới danh sách kết quả (kéo theo nhóm bài, xem `reviewGroupsQueryKey`), tiến độ,
 * tóm tắt các phiên và mọi hồ sơ bài đang mở. Lỗi KHÔNG làm mới ở đây: panel tự tải lại nhóm khi nhận lỗi, vì chỉ nó
 * biết lỗi nào là "đã xong" (404) và lỗi nào phải giữ trong hộp thoại.
 */
export function useConfirmReviewGroup(examSessionId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { key: string; resultIds?: string[] }) => confirmReviewGroup(examSessionId!, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['exam-sessions', examSessionId, 'grading-results'] });
      void queryClient.invalidateQueries({ queryKey: ['exam-sessions', examSessionId, 'grading-progress'] });
      void queryClient.invalidateQueries({ queryKey: SESSION_SUMMARIES_KEY });
      void queryClient.invalidateQueries({ queryKey: ['grading-results'] });
    },
  });
}

/** Bật lại tự chốt cho một phạm vi. Không tính lại bài nào (§5.3), nên chỉ danh sách tạm dừng đổi. */
export function useResetAutoBreaker() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (breakerId: string) => resetAutoBreaker(breakerId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: AUTO_BREAKERS_KEY });
    },
  });
}

/** Bài đã mở trên trình duyệt này — xem giới hạn ở `lib/opened-results.ts`. */
export function useOpenedResults(): ReadonlySet<string> {
  return useSyncExternalStore(subscribeOpenedResults, openedResultsSnapshot, openedResultsServerSnapshot);
}

/**
 * Ghi mốc mở bài MỘT lần cho mỗi bài khi trang chi tiết mở (spec §5.5). Không dùng React Query: không có gì để cache,
 * và mốc đo thời gian không được làm phiền giảng viên — lỗi bị nuốt. Ref chặn lần gọi thứ hai khi effect chạy lại
 * (StrictMode, render lại); server vẫn tự chặn bằng `WHERE opened_at IS NULL`.
 */
export function useMarkResultOpened(resultId: string | undefined) {
  const marked = useRef<string | null>(null);
  useEffect(() => {
    if (!resultId || marked.current === resultId) return;
    marked.current = resultId;
    markResultOpened(resultId).then(
      () => rememberOpened(resultId),
      () => {
        // Bài không thuộc bạn (403/404) hay mất mạng: không ghi gì, không báo gì.
      },
    );
  }, [resultId]);
}
