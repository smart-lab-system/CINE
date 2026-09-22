import { apiClient } from '@/lib/api-client';

/** Mirror SessionOverviewItem (apps/api/src/submission/submission-overview.types.ts). */
export interface SessionOverviewItem {
  id: string;
  name: string;
  code: string;
  /**
   * HẰNG SỐ ở mọi phiên — hệ thống phục vụ đúng một môn. ĐỪNG đưa trường
   * này vào khoá gộp nhóm hay vào một bộ lọc: nó không tách được gì, và
   * `detectRoomFailure` từng chết âm thầm vì đúng lỗi đó (nó đòi ">=2 môn
   * khác nhau" nên không bao giờ kêu). Muốn phân biệt thì dùng `classId`.
   */
  courseName: string;
  classId: string;
  className: string | null;
  roomName: string;
  examType: 'TK' | 'GK' | 'CK';
  startTime: string;
  endTime: string;
  /**  = hết giờ làm bài, file đang bay về, chưa ai chốt.
   *  Thêm 2026-09-11 — xem exam_session.entity.ts. */
  status: 'draft' | 'scheduled' | 'active' | 'collecting' | 'completed' | 'cancelled';
  /**
   * Rubric đã ghim cho phiên — `null` nghĩa là chưa chấm được.
   *
   * `null` KHÔNG phải lý do để ẩn phiên khỏi trang Chấm điểm: bài thi thật
   * của SV đang nằm trong đó, và giảng viên chưa từng được hỏi field này.
   */
  rubricId: string | null;
  rubricVersion: number | null;
  requiredDeliverableCount: number;
  expectedCount: number;
  rosterKnown: boolean;
  fullySubmittedCount: number;
  partialCount: number;
  /** Có event kết nối, 0 bài nộp — nghi mất bài. Xem spec §1.2. */
  attendedNoSubmissionCount: number;
  /** Không event nào, 0 bài nộp — vắng thi. */
  neverAttendedCount: number;

  /**
   * Trong roster phiên này, vắng ở đây, nhưng CÓ mặt ở một phiên khác cùng
   * môn + cùng loại kỳ thi — thi bù. Backend ĐÃ trừ khỏi neverAttendedCount,
   * nên cộng cả hai mới ra "tổng số người không có gì ở phiên này".
   */
  satElsewhereCount: number;

  /** Chỉ khác null khi request mang `student`. Ai khớp, trong phiên này. */
  matchedStudents: { mssv: string; name: string }[] | null;

  invalidFileCount: number;
  /**
   * Số bài mà file nén đã về tới nơi nhưng kiểm nội dung bên trong ra
   * failed/unreadable — spec
   * 2026-09-21-archive-content-validation-design.md §8.3. KHÔNG gộp vào
   * `invalidFileCount`: hai khái niệm khác nhau (xem ghi chú "nghỉ hưu"
   * ở submission-attention.ts).
   */
  archiveIssueCount: number;
  semesterName: string;
  archivedAt: string | null;
  attentionClosedAt: string | null;
}

/**
 * Một bài nộp lẻ — chỉ còn dùng cho luồng search theo MSSV (spec §3.4).
 * Bảng phẳng cũ đã bị xoá; endpoint thì không.
 */

function throwIfFailed(error: unknown, response: Response): void {
  if (error || !response.ok) {
    throw error ?? new Error(`Yêu cầu thất bại (HTTP ${response.status})`);
  }
}

/**
 * Mọi phiên của giảng viên này.
 *
 * `student` giữ lại những phiên có sinh viên khớp MSSV/tên — kể cả sinh viên
 * CHƯA NỘP GÌ. Đó là điểm khác biệt với GET /submissions, thứ chỉ đọc bảng
 * submission và vì vậy không bao giờ thấy được đúng nhóm mà giảng viên đi tra.
 */
export async function listSessionOverview(student?: string): Promise<SessionOverviewItem[]> {
  const { data, error, response } = await apiClient.GET('/submissions/overview', {
    params: { query: student ? { student } : {} },
  });
  throwIfFailed(error, response);
  // Cast: ExamSessionStatus/ExamType là string union không có
  // @ApiProperty({ enum }), cùng khoảng trống DTO mà lib/api/exam-session.ts
  // đã ghi lại cho chính nó.
  return (data as unknown as { items: SessionOverviewItem[] }).items;
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
