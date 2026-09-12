'use client';

import { useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  finalizeGrades,
  getGradingProgress,
  listGradingResults,
  listRubrics,
  saveRubric,
  setSessionRubric,
  startGrading,
  submitReview,
  type ReviewCriterion,
} from '@/lib/api/grading';

export function useRubrics(courseId: string | undefined) {
  return useQuery({
    queryKey: ['courses', courseId, 'rubrics'],
    queryFn: () => listRubrics(courseId!),
    enabled: Boolean(courseId),
  });
}

export function useSaveRubric(courseId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (criteria: { description: string; maxPoints: number }[]) =>
      saveRubric(courseId!, criteria),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['courses', courseId, 'rubrics'] });
    },
  });
}

export function useGradingResults(examSessionId: string | undefined) {
  return useQuery({
    queryKey: ['exam-sessions', examSessionId, 'grading-results'],
    queryFn: () => listGradingResults(examSessionId!),
    enabled: Boolean(examSessionId),
  });
}

/**
 * Ghim rubric cho một phiên thi.
 *
 * Invalidate overview chứ không phải danh sách rubric: danh sách phiên của
 * trang Chấm điểm lấy từ overview, và `rubricId` của phiên vừa đổi nằm
 * trong chính payload ấy — không invalidate thì thẻ chặn vẫn còn nguyên
 * sau khi người dùng vừa gắn xong.
 */
export function useSetSessionRubric(examSessionId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (rubricId: string | null) => setSessionRubric(examSessionId!, rubricId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['submissions', 'overview'] });
    },
  });
}

/**
 * Một lần duyệt bài. Invalidate danh sách kết quả vì điểm và trạng thái của
 * bài vừa duyệt đều nằm trong đó.
 */
export function useSubmitReview(examSessionId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      gradingResultId,
      criteria,
    }: {
      gradingResultId: string;
      criteria: ReviewCriterion[];
    }) => submitReview(gradingResultId, criteria),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['exam-sessions', examSessionId, 'grading-results'],
      });
    },
  });
}

/**
 * Chốt điểm cả phiên — mốc công bố, không phải một lần lưu. Sau đó mọi lần sửa
 * đều để lại dấu vết trong nhật ký.
 */
export function useFinalizeGrades(examSessionId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => finalizeGrades(examSessionId!),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['exam-sessions', examSessionId, 'grading-results'],
      });
    },
  });
}

/**
 * The explicit action, and the only thing that starts grading. Nothing in
 * the collection flow calls this — that separation is the point.
 *
 * Từ 2026-09-11 nó chỉ XẾP HÀNG rồi trả về. `onSuccess` vì thế làm mới
 * TIẾN ĐỘ, không làm mới kết quả: lúc này chưa bài nào được chấm, và
 * refetch danh sách kết quả ở đây sẽ lấy về đúng một danh sách rỗng rồi
 * không bao giờ hỏi lại — giảng viên bấm nút và nhìn màn hình đứng yên
 * cho tới khi tự F5. `useGradingProgress` bên dưới mới là thứ theo dõi
 * đến khi xong, và nó làm mới kết quả khi xong.
 */
export function useStartGrading(examSessionId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => startGrading(examSessionId!),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['exam-sessions', examSessionId, 'grading-progress'],
      });
    },
  });
}

/**
 * Nhịp hỏi lại: nhanh lúc đầu, chậm dần.
 *
 * 2 giây là đúng cho phút đầu — giảng viên vừa bấm nút và đang nhìn.
 * Nhưng một lượt 40 bài mất nhiều phút, và không ai theo dõi từng giây
 * suốt ngần ấy. Giữ nguyên 2 giây tới cuối là 2.5 request/giây khi năm
 * giảng viên chấm cùng lúc cuối kỳ, mỗi request một GROUP BY join hai
 * bảng — trên đúng process đang chạy năm worker chấm.
 */
export const PROGRESS_POLL_FAST_MS = 2_000;
export const PROGRESS_POLL_SLOW_MS = 5_000;
export const PROGRESS_FAST_WINDOW_MS = 60_000;

/**
 * Quyết định nhịp — tách ra vì nó là toàn bộ luật, và luật thì nên ghim
 * được bằng test mà không phải dựng một QueryClient.
 */
export function progressPollIntervalMs(pending: number, elapsedMs: number): number | false {
  if (pending <= 0) {
    return false;
  }
  return elapsedMs < PROGRESS_FAST_WINDOW_MS ? PROGRESS_POLL_FAST_MS : PROGRESS_POLL_SLOW_MS;
}

/**
 * Theo dõi một lượt chấm cho tới khi xong.
 *
 * Hỏi lại CHỈ KHI còn bài đang chấm, rồi tự dừng: một trang mở suốt
 * buổi không được phép gọi mãi một endpoint không còn gì để nói.
 *
 * `refetchIntervalInBackground` để mặc định (false), nên TanStack Query
 * tự dừng hỏi khi cửa sổ mất focus và hỏi lại khi quay về. Bấm "Bắt đầu
 * chấm" rồi chuyển tab là hành vi mặc định của một lượt chấm dài, và
 * một tab nền không ai nhìn thì mỗi request là chi phí thuần.
 *
 * Khi lượt chấm kết thúc, nó làm mới danh sách kết quả đúng một lần —
 * đó là chỗ duy nhất biết được "vừa xong", vì response của
 * `startGrading` trả về từ nhiều phút trước.
 */
export function useGradingProgress(examSessionId: string | undefined) {
  const queryClient = useQueryClient();
  const settled = useRef(true);
  /** Lượt chấm HIỆN TẠI bắt đầu lúc nào — mốc để giãn nhịp. */
  const startedAt = useRef<number | null>(null);

  const query = useQuery({
    queryKey: ['exam-sessions', examSessionId, 'grading-progress'],
    queryFn: () => getGradingProgress(examSessionId!),
    enabled: Boolean(examSessionId),
    refetchInterval: (query) => {
      const pending = query.state.data?.pending ?? 0;
      if (pending <= 0) {
        // Đặt lại mốc: lượt chấm sau phải được một phút nhanh của
        // riêng nó, không kế thừa đồng hồ của lượt trước.
        startedAt.current = null;
        return false;
      }
      if (startedAt.current === null) {
        startedAt.current = Date.now();
      }
      return progressPollIntervalMs(pending, Date.now() - startedAt.current);
    },
  });

  const pending = query.data?.pending ?? 0;
  useEffect(() => {
    if (pending > 0) {
      settled.current = false;
      return;
    }
    if (settled.current) {
      return;
    }
    // Chuyển từ "đang chấm" sang "xong" — một lần, không phải mỗi lần
    // component render lại.
    settled.current = true;
    void queryClient.invalidateQueries({
      queryKey: ['exam-sessions', examSessionId, 'grading-results'],
    });
  }, [pending, examSessionId, queryClient]);

  return query;
}
