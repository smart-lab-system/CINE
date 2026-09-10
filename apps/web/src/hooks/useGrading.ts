'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  finalizeGrades,
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
 */
export function useStartGrading(examSessionId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => startGrading(examSessionId!),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['exam-sessions', examSessionId, 'grading-results'],
      });
    },
  });
}
