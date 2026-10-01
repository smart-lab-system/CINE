import { apiClient } from '@/lib/api-client';

/** Mirrors `AuditReveal` (apps/api/src/grading/audit/audit-review.service.ts). */
export interface AuditReveal {
  status: 'teacher_reviewed';
  currentScore: number | null;
  currentScoreSource: string;
  systemErrors: { ruleId: string; ruleKey: string; ruleName: string; counted: 'counted' | 'unpriced' }[];
  perRule: { ruleId: string; ruleKey: string; ruleName: string; verdict: 'both' | 'teacher_only' | 'system_only' }[];
  extraErrors: string[];
  summary: {
    both: number;
    teacherOnly: number;
    systemOnly: number;
    neither: number;
    extra: number;
    agreement: 'full' | 'partial' | 'none';
  };
}

function fail(error: unknown, response: Response): Error {
  const body = error as { message?: string | string[] } | undefined;
  const message = Array.isArray(body?.message) ? body!.message.join('; ') : body?.message;
  return new Error(message ?? `Yêu cầu thất bại (HTTP ${response.status})`);
}

/** Ghi nhận xét kiểm mẫu rồi nhận bản tiết lộ. Ghi rồi thì khoá: lần hai server trả 409. */
export async function recordAuditReview(
  resultId: string,
  body: { pickedRuleIds: string[]; extraErrors: string[] },
): Promise<AuditReveal> {
  const { data, error, response } = await apiClient.POST('/grading-results/{id}/audit-review', {
    params: { path: { id: resultId } },
    body,
  });
  if (error || !response.ok) throw fail(error, response);
  return data as unknown as AuditReveal;
}

/** URL tải bài nộp của ĐÚNG bài này (không phán đoán của hệ thống nào đi kèm). */
export async function getSubmissionDownload(resultId: string): Promise<{ downloadUrl: string; fileName: string }> {
  const { data, error, response } = await apiClient.GET('/grading-results/{id}/submission-download', {
    params: { path: { id: resultId } },
  });
  if (error || !response.ok) throw fail(error, response);
  return data as unknown as { downloadUrl: string; fileName: string };
}
