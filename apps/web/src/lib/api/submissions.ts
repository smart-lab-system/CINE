import { apiClient } from '@/lib/api-client';

/**
 * "Quản lý bài thu" — QA-reported gap: there was no way to see a
 * submission without first knowing which exam session it belonged to.
 * Mirrors TeacherSubmissionView (apps/api/src/submission/
 * submission.service.ts) — a different shape from SubmissionStatusItem
 * (lib/api/exam-session.ts), which is scoped to one already-known
 * session and so doesn't need to carry the session's own id/name.
 */
export interface TeacherSubmission {
  id: string;
  examSessionId: string;
  examSessionName: string;
  requiredFilename: string;
  studentMssv: string;
  studentNameInput: string;
  status: 'received' | 'validated' | 'collected' | 'invalid';
  submittedAt: string;
  fileSize: string | null;
  downloadUrl: string | null;
}

export interface SearchSubmissionsParams {
  page: number;
  pageSize: number;
  /** Matches student MSSV OR the name they typed, case-insensitive. */
  search?: string;
  status?: TeacherSubmission['status'];
  examSessionId?: string;
}

async function throwIfFailed(error: unknown, response: Response) {
  if (error || !response.ok) {
    throw error ?? new Error(`Yêu cầu thất bại (HTTP ${response.status})`);
  }
}

export async function listTeacherSubmissions(
  params: SearchSubmissionsParams,
): Promise<{ items: TeacherSubmission[]; total: number }> {
  const { data, error, response } = await apiClient.GET('/submissions', {
    params: { query: params },
  });
  await throwIfFailed(error, response);
  // Cast needed: SubmissionEntity.status is a custom string union with no
  // `@ApiProperty({ enum: ... })`, the same DTO-decoration gap
  // lib/api/exam-session.ts's own casts document.
  return data as unknown as { items: TeacherSubmission[]; total: number };
}
