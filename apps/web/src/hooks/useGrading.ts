'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  listGradingResults,
  listRubrics,
  saveRubric,
  startGrading,
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
