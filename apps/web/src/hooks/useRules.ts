'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  listLibrary,
  listProposals,
  reviseRule,
  revokeWaiver,
  setRuleState,
  setWaiver,
  splitRule,
  type ErrorChanges,
  type RecomputeSummary,
} from '@/lib/api/rules';
import { invalidateBoard } from './board-cache';

export const LIBRARY_KEY = ['rules', 'library'] as const;
export const proposalsKey = (rubricName: string | undefined) => ['rules', 'proposals', rubricName ?? null] as const;

/** Thư viện lỗi của giảng viên, kèm nơi dùng (rubric · tiêu chí · điểm trừ). */
export function useLibrary() {
  return useQuery({ queryKey: LIBRARY_KEY, queryFn: listLibrary });
}

/** Lỗi AI đề xuất; có `rubricName` thì chỉ lỗi thấy ở rubric đó. */
export function useProposals(rubricName?: string) {
  return useQuery({ queryKey: proposalsKey(rubricName), queryFn: () => listProposals(rubricName) });
}

/** Sửa cả các rubric đang dùng lỗi này. */
export function useReviseRule() {
  const queryClient = useQueryClient();
  return useMutation<{ revisionId: string; recompute: RecomputeSummary | null }, Error, { ruleId: string; changes: ErrorChanges }>({
    mutationFn: ({ ruleId, changes }) => reviseRule(ruleId, changes),
    onSuccess: () => invalidateBoard(queryClient),
  });
}

/** Sửa CHỈ rubric đang mở (tách bản riêng). */
export function useSplitRule() {
  const queryClient = useQueryClient();
  return useMutation<
    { ruleId: string; rubricErrorId: string; recompute: RecomputeSummary },
    Error,
    { ruleId: string; rubricName: string; changes: ErrorChanges }
  >({
    mutationFn: ({ ruleId, rubricName, changes }) => splitRule(ruleId, rubricName, changes),
    onSuccess: () => invalidateBoard(queryClient),
  });
}

/** "Không phải lỗi". */
export function useDismissRule() {
  const queryClient = useQueryClient();
  return useMutation<{ recompute: RecomputeSummary }, Error, { ruleId: string }>({
    mutationFn: ({ ruleId }) => setRuleState(ruleId, 'dismissed'),
    onSuccess: () => invalidateBoard(queryClient),
  });
}

/** Đánh dấu tiêu chí "không trừ điểm" — trạng thái đánh dấu nằm trong tổng quan nên làm mới cả bảng. */
export function useSetWaiver(rubricId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation<{ waiverId: string; recompute: RecomputeSummary | null }, Error, string>({
    mutationFn: (criterionKey) => setWaiver(rubricId!, criterionKey),
    onSuccess: () => invalidateBoard(queryClient),
  });
}

export function useRevokeWaiver() {
  const queryClient = useQueryClient();
  return useMutation<{ recompute: RecomputeSummary }, Error, string>({
    mutationFn: (waiverId) => revokeWaiver(waiverId),
    onSuccess: () => invalidateBoard(queryClient),
  });
}
