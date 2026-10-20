'use client';

import { useState } from 'react';
import { applyRun, type RunsState } from '@/lib/bundle-runs';
import { useRunTestBundle } from './useTestBundle';

/**
 * Giữ kết quả chạy thử trên màn hình theo phiên bản gói và gọi chạy. Một lượt tại một thời điểm: server cũng từ chối lượt
 * thứ hai khi lượt đầu còn chạy (409), nên giao diện khoá nút từ đầu thay vì để giảng viên đọc một lời từ chối.
 *
 * `pendingKey` là `bundleId` (cả gói) hoặc `bundleId:caseKey` (một ca) để đúng nút đó hiện "đang chạy".
 */
export function useBundleRuns(examSessionId: string | undefined) {
  const mutation = useRunTestBundle(examSessionId);
  const [runs, setRuns] = useState<RunsState>({});
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [error, setError] = useState<Error | null>(null);

  function run(bundleId: string, caseKey?: string) {
    if (pendingKey !== null) return;
    setPendingKey(caseKey === undefined ? bundleId : `${bundleId}:${caseKey}`);
    setError(null);
    mutation.mutate(
      { bundleId, caseKey },
      {
        onSuccess: (result) => setRuns((current) => applyRun(current, bundleId, caseKey ?? null, result)),
        onError: (e) => setError(e),
        onSettled: () => setPendingKey(null),
      },
    );
  }

  /** Bỏ lỗi của lượt chạy trước: màn hình chỉ hiện MỘT lỗi tại một thời điểm (lỗi "sinh" cũng cần bỏ khi bắt đầu chạy). */
  const clearError = () => setError(null);

  return { runs, run, pendingKey, error, clearError };
}
