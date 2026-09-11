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
 * Theo dõi một lượt chấm cho tới khi xong.
 *
 * Hỏi lại mỗi 2 giây CHỈ KHI còn bài đang chấm, rồi tự dừng: một trang
 * mở suốt buổi không được phép gọi mãi một endpoint không còn gì để nói.
 *
 * Khi lượt chấm kết thúc, nó làm mới danh sách kết quả đúng một lần —
 * đó là chỗ duy nhất biết được "vừa xong", vì response của
 * `startGrading` trả về từ nhiều phút trước.
 */
export function useGradingProgress(examSessionId: string | undefined) {
  const queryClient = useQueryClient();
  const settled = useRef(true);

  const query = useQuery({
    queryKey: ['exam-sessions', examSessionId, 'grading-progress'],
    queryFn: () => getGradingProgress(examSessionId!),
    enabled: Boolean(examSessionId),
    refetchInterval: (query) => ((query.state.data?.pending ?? 0) > 0 ? 2_000 : false),
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
