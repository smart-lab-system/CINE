'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  assignError,
  copyErrors,
  getRubricOverview,
  listRubricErrors,
  moveError,
  previewErrorPrice,
  removeError,
  setErrorPrice,
  type AssignInput,
  type AssignResult,
  type CopyResult,
} from '@/lib/api/rubric-errors';
import type { PricePreview, RecomputeSummary } from '@/lib/api/rules';
import { invalidateBoard } from './board-cache';

export const OVERVIEW_KEY = ['rubric-errors', 'overview'] as const;
export const errorsKey = (rubricName: string) => ['rubric-errors', 'list', rubricName] as const;

/** Một phần tử cho mỗi rubric: nuôi ô chọn, trạng thái và dải việc cần làm. */
export function useRubricOverview() {
  return useQuery({ queryKey: OVERVIEW_KEY, queryFn: getRubricOverview });
}

export function useRubricErrors(rubricName: string | undefined) {
  return useQuery({
    queryKey: errorsKey(rubricName ?? ''),
    queryFn: () => listRubricErrors(rubricName!),
    enabled: Boolean(rubricName),
  });
}

export function useAssignError() {
  const queryClient = useQueryClient();
  return useMutation<AssignResult, Error, AssignInput>({
    mutationFn: (input) => assignError(input),
    onSuccess: () => invalidateBoard(queryClient),
  });
}

export function useMoveError() {
  const queryClient = useQueryClient();
  return useMutation<{ recompute: RecomputeSummary }, Error, { rubricErrorId: string; criterionKey: string }>({
    mutationFn: ({ rubricErrorId, criterionKey }) => moveError(rubricErrorId, criterionKey),
    onSuccess: () => invalidateBoard(queryClient),
  });
}

export function useRemoveError() {
  const queryClient = useQueryClient();
  return useMutation<{ recompute: RecomputeSummary }, Error, string>({
    mutationFn: (rubricErrorId) => removeError(rubricErrorId),
    onSuccess: () => invalidateBoard(queryClient),
  });
}

export function useCopyErrors() {
  const queryClient = useQueryClient();
  return useMutation<CopyResult, Error, { from: string; to: string }>({
    mutationFn: ({ from, to }) => copyErrors(from, to),
    onSuccess: () => invalidateBoard(queryClient),
  });
}

/** Không cache, không làm mới: xem trước không ghi gì (T-POL-5). */
export function usePreviewErrorPrice() {
  return useMutation<PricePreview, Error, { rubricErrorId: string; deduction: string | null }>({
    mutationFn: ({ rubricErrorId, deduction }) => previewErrorPrice(rubricErrorId, deduction),
  });
}

export function useSetErrorPrice() {
  const queryClient = useQueryClient();
  return useMutation<{ versionId: string; recompute: RecomputeSummary }, Error, { rubricErrorId: string; deduction: string | null }>({
    mutationFn: ({ rubricErrorId, deduction }) => setErrorPrice(rubricErrorId, deduction),
    onSuccess: () => invalidateBoard(queryClient),
  });
}
