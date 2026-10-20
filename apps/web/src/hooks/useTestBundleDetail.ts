'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getTestBundle, type TestBundleDetail } from '@/lib/api/test-bundle';
import { dropTestBundleCase } from '@/lib/api/test-bundle-review';

/**
 * Khoá chi tiết nằm DƯỚI khoá danh sách (`['exam-sessions', id, 'test-bundles']`)
 * một cấp — TanStack Query khớp theo tiền tố, nên mọi `invalidateQueries` của
 * danh sách (duyệt, ghim, tạo) làm mới luôn chi tiết.
 */
export function useTestBundleDetail(examSessionId: string | undefined, bundleId: string | null) {
  return useQuery({
    queryKey: ['exam-sessions', examSessionId, 'test-bundles', bundleId],
    queryFn: () => getTestBundle(examSessionId!, bundleId!),
    enabled: Boolean(examSessionId) && Boolean(bundleId),
  });
}

export function useDropTestBundleCase(examSessionId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ bundleId, caseKey }: { bundleId: string; caseKey: string }) =>
      dropTestBundleCase(examSessionId!, bundleId, caseKey),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ['exam-sessions', examSessionId, 'test-bundles'] }),
  });
}

/**
 * Lấy chi tiết một phiên bản gói theo yêu cầu (không cần đang mở nó) — để dựng bản nháp từ một phiên bản. Dùng chung khoá và
 * bộ nhớ đệm với `useTestBundleDetail`, nên phiên bản đã mở rồi không tải lại.
 */
export function useFetchTestBundle(examSessionId: string | undefined) {
  const queryClient = useQueryClient();
  return (bundleId: string): Promise<TestBundleDetail> =>
    queryClient.fetchQuery({
      queryKey: ['exam-sessions', examSessionId, 'test-bundles', bundleId],
      queryFn: () => getTestBundle(examSessionId!, bundleId),
      staleTime: 5_000,
    });
}
