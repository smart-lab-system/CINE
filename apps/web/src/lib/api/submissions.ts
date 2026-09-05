import { apiClient } from '@/lib/api-client';

/** Mirror SessionOverviewItem (apps/api/src/submission/submission-overview.types.ts). */
export interface SessionOverviewItem {
  id: string;
  name: string;
  code: string;
  courseId: string;
  courseName: string;
  classId: string | null;
  className: string | null;
  roomName: string;
  examType: 'TK' | 'GK' | 'CK';
  startTime: string;
  endTime: string;
  status: 'draft' | 'scheduled' | 'active' | 'completed' | 'cancelled';
  requiredDeliverableCount: number;
  expectedCount: number;
  rosterKnown: boolean;
  fullySubmittedCount: number;
  partialCount: number;
  /** Có event kết nối, 0 bài nộp — nghi mất bài. Xem spec §1.2. */
  attendedNoSubmissionCount: number;
  /** Không event nào, 0 bài nộp — vắng thi. */
  neverAttendedCount: number;
  invalidFileCount: number;
  semesterId: string;
  semesterName: string;
  archivedAt: string | null;
  attentionClosedAt: string | null;
}

/**
 * Một bài nộp lẻ — chỉ còn dùng cho luồng search theo MSSV (spec §3.4).
 * Bảng phẳng cũ đã bị xoá; endpoint thì không.
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
  /** Khớp MSSV HOẶC tên SV đã gõ, case-insensitive. */
  search?: string;
}

function throwIfFailed(error: unknown, response: Response): void {
  if (error || !response.ok) {
    throw error ?? new Error(`Yêu cầu thất bại (HTTP ${response.status})`);
  }
}

export async function listSessionOverview(): Promise<SessionOverviewItem[]> {
  const { data, error, response } = await apiClient.GET('/submissions/overview');
  throwIfFailed(error, response);
  // Cast: ExamSessionStatus/ExamType là string union không có
  // @ApiProperty({ enum }), cùng khoảng trống DTO mà lib/api/exam-session.ts
  // đã ghi lại cho chính nó.
  return (data as unknown as { items: SessionOverviewItem[] }).items;
}

export async function listTeacherSubmissions(
  params: SearchSubmissionsParams,
): Promise<{ items: TeacherSubmission[]; total: number }> {
  const { data, error, response } = await apiClient.GET('/submissions', {
    params: { query: params },
  });
  throwIfFailed(error, response);
  return data as unknown as { items: TeacherSubmission[]; total: number };
}

/**
 * Bốn thao tác vòng đời. Không hàm nào trả dữ liệu — trang gọi xong thì
 * invalidate query overview, vì mọi con số roll-up có thể đổi theo.
 */
async function lifecycle(
  path: 'archive' | 'attention-close',
  method: 'POST' | 'DELETE',
  id: string,
): Promise<void> {
  const call = method === 'POST' ? apiClient.POST : apiClient.DELETE;
  const { error, response } = await call(`/exam-sessions/{id}/${path}` as never, {
    params: { path: { id } },
  } as never);
  throwIfFailed(error, response);
}

export const archiveSession = (id: string) => lifecycle('archive', 'POST', id);
export const unarchiveSession = (id: string) => lifecycle('archive', 'DELETE', id);
export const closeAttention = (id: string) => lifecycle('attention-close', 'POST', id);
export const reopenAttention = (id: string) => lifecycle('attention-close', 'DELETE', id);
