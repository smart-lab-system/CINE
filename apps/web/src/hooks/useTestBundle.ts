'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { uploadAnswerSource } from '@/lib/api/grading';
import {
  approveTestBundle,
  createTestBundle,
  generateTestBundle,
  getTestBundle,
  listTestBundles,
  pinTestBundle,
  runTestBundle,
  type GenerateMode,
  type TestBundleCaseInput,
} from '@/lib/api/test-bundle';

function testBundlesKey(examSessionId: string | undefined) {
  return ['exam-sessions', examSessionId, 'test-bundles'] as const;
}

function testBundleKey(examSessionId: string | undefined, bundleId: string | undefined) {
  return ['exam-sessions', examSessionId, 'test-bundles', bundleId] as const;
}

export function useTestBundles(examSessionId: string | undefined) {
  return useQuery({
    queryKey: testBundlesKey(examSessionId),
    queryFn: () => listTestBundles(examSessionId!),
    enabled: Boolean(examSessionId),
  });
}

/** Chi tiết một gói — chỉ tải khi có `bundleId` (dialog Xem). */
export function useTestBundle(examSessionId: string | undefined, bundleId: string | null) {
  return useQuery({
    queryKey: testBundleKey(examSessionId, bundleId ?? undefined),
    queryFn: () => getTestBundle(examSessionId!, bundleId!),
    enabled: Boolean(examSessionId && bundleId),
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

/**
 * Chạy thử đáp án mẫu trên một phiên bản gói (cả gói hay một ca). KHÔNG làm mới gì: chạy thử không đổi gói, ghim hay thước,
 * nên không có truy vấn nào cũ đi. Kết quả do người gọi giữ (`useBundleRuns`).
 */
export function useRunTestBundle(examSessionId: string | undefined) {
  return useMutation({
    mutationFn: ({ bundleId, caseKey }: { bundleId: string; caseKey?: string }) => runTestBundle(examSessionId!, bundleId, caseKey),
  });
}

/**
 * Sinh một phiên bản gói. Làm mới danh sách gói và mức sẵn sàng chấm: sinh từ đề còn GHI đáp án mẫu của phiên (mã nguồn,
 * nguồn gốc `generated`, độ tin cậy), mà băng "đáp án chưa kiểm chứng" đọc từ `readiness`.
 */
export function useGenerateTestBundle(examSessionId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (mode: GenerateMode) => generateTestBundle(examSessionId!, mode),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: testBundlesKey(examSessionId) });
      void queryClient.invalidateQueries({ queryKey: ['exam-sessions', examSessionId, 'grading-readiness'] });
    },
  });
}

/** Tải mã nguồn đáp án mẫu (.cpp/.py) lên kho rồi xác nhận. Mã thành đáp án mẫu của phiên nên làm mới cả `readiness`. */
export function useUploadAnswerSource(examSessionId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => uploadAnswerSource(examSessionId!, file),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['exam-sessions', examSessionId, 'grading-readiness'] }),
  });
}
