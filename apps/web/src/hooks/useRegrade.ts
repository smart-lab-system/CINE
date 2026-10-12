'use client';

import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { investigationQueryKey } from '@/hooks/useGrading';
import { regradeResult, regradeUngradable } from '@/lib/api/regrade';

/**
 * Làm mới cả khi LỖI (`onSettled`): một 409 "đang được chấm" nghĩa là trạng thái vừa đổi, và danh sách đang
 * hiển thị nó sai.
 */
function refresh(queryClient: QueryClient, examSessionId: string | undefined): void {
  void queryClient.invalidateQueries({ queryKey: ['exam-sessions', examSessionId, 'grading-results'] });
  void queryClient.invalidateQueries({ queryKey: ['exam-sessions', examSessionId, 'grading-progress'] });
}

export function useRegradeResult(examSessionId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (resultId: string) => regradeResult(resultId),
    onSettled: (_outcome, _error, resultId) => {
      refresh(queryClient, examSessionId);
      void queryClient.invalidateQueries({ queryKey: investigationQueryKey(resultId) });
    },
  });
}

export function useRegradeUngradable(examSessionId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (reason: string | null) => regradeUngradable(examSessionId!, reason),
    onSettled: () => refresh(queryClient, examSessionId),
  });
}
