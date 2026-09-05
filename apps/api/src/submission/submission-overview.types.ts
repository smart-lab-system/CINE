import type { ExamSessionStatus, ExamType } from '../exam-session/entities/exam-session.entity';

/**
 * Một dòng của "Quản lý bài thu" — xem
 * docs/superpowers/specs/2026-09-03-submissions-rollup-page-design.md §3.1.
 *
 * Năm field định danh đầu (course/class/examType/startTime/room) tồn tại vì
 * GV phải nhận ra "à, kỳ này" sau nhiều tháng — §1.2.
 */
export interface SessionOverviewItem {
  id: string;
  name: string;
  code: string;
  courseId: string;
  courseName: string;
  classId: string | null;
  className: string | null;
  roomName: string;
  examType: ExamType;
  startTime: string;
  endTime: string;
  status: ExamSessionStatus;

  requiredDeliverableCount: number;
  /** |roster ∪ người đã nộp| — §3.2. KHÔNG phải rosterSize. */
  expectedCount: number;
  /** false khi phiên không gắn lớp, hoặc lớp chưa có roster. */
  rosterKnown: boolean;
  fullySubmittedCount: number;
  partialCount: number;

  /**
   * Có ít nhất 1 agent_connection_event cho phiên này, và 0 bài nộp.
   * Mức 🔴: sinh viên có ngồi thi mà không gì về tới — bài có thể đã mất.
   * Đây là ca duy nhất mà lỗi có thể thuộc về hệ thống, không phải sinh viên.
   */
  attendedNoSubmissionCount: number;
  /** Không có event nào và 0 bài nộp. Mức 🟡: vắng thi, việc hành chính. */
  neverAttendedCount: number;

  /** Đếm theo FILE, không theo sinh viên. */
  invalidFileCount: number;

  /** Học kỳ của môn — nguồn cho bộ lọc phạm vi (spec §4.3). */
  semesterId: string;
  semesterName: string;

  /** ISO, hoặc null. Xem SessionLifecycleService. */
  archivedAt: string | null;
  attentionClosedAt: string | null;
}
