import { apiClient } from '@/lib/api-client';

/** Mirrors `RegradeOutcome` (apps/api/src/grading/regrade.service.ts). */
export interface RegradeOutcome {
  requeued: number;
  /** `reason` là câu tiếng Việt của server — hiện nguyên văn. */
  skipped: { resultId: string; reason: string }[];
}

function fail(error: unknown, response: Response): Error {
  const body = error as { message?: string | string[] } | undefined;
  const message = Array.isArray(body?.message) ? body!.message.join('; ') : body?.message;
  return new Error(message ?? `Yêu cầu thất bại (HTTP ${response.status})`);
}

/** Chấm lại MỘT bài không chấm được do lỗi hệ thống. 400/409 kèm câu tiếng Việt nói vì sao không được. */
export async function regradeResult(resultId: string): Promise<RegradeOutcome> {
  const { data, error, response } = await apiClient.POST('/grading-results/{id}/regrade', {
    params: { path: { id: resultId } },
  });
  if (error || !response.ok) throw fail(error, response);
  return data as unknown as RegradeOutcome;
}

/** Chấm lại mọi bài lớp system của phiên; `reason` (nguyên văn) giới hạn vào các bài cùng lý do. */
export async function regradeUngradable(examSessionId: string, reason: string | null): Promise<RegradeOutcome> {
  const { data, error, response } = await apiClient.POST('/exam-sessions/{id}/regrade-ungradable', {
    params: { path: { id: examSessionId } },
    body: { reason },
  });
  if (error || !response.ok) throw fail(error, response);
  return data as unknown as RegradeOutcome;
}
