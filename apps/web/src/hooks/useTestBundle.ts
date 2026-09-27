'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  approveTestBundle,
  createTestBundle,
  listTestBundles,
  pinTestBundle,
  type TestBundleCaseInput,
} from '@/lib/api/test-bundle';

function testBundlesKey(examSessionId: string | undefined) {
  return ['exam-sessions', examSessionId, 'test-bundles'] as const;
}

export function useTestBundles(examSessionId: string | undefined) {
  return useQuery({
    queryKey: testBundlesKey(examSessionId),
    queryFn: () => listTestBundles(examSessionId!),
    enabled: Boolean(examSessionId),
  });
}

export function useCreateTestBundle(examSessionId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (cases: TestBundleCaseInput[]) => createTestBundle(examSessionId!, cases),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: testBundlesKey(examSessionId) }),
  });
}

export function useApproveTestBundle(examSessionId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (bundleId: string) => approveTestBundle(examSessionId!, bundleId),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: testBundlesKey(examSessionId) }),
  });
}

/**
 * Ghim gói — đổi `test_bundle_id` của PHIÊN, không phải của riêng gói này.
 * Làm mới cả chi tiết phiên (§14.3: start-grading đọc `testBundleId` từ đó
 * để quyết có chặn hay không) lẫn danh sách gói (huy hiệu "Đang dùng").
 */
export function usePinTestBundle(examSessionId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (bundleId: string) => pinTestBundle(examSessionId!, bundleId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: testBundlesKey(examSessionId) });
      void queryClient.invalidateQueries({ queryKey: ['exam-session', examSessionId] });
    },
  });
}
