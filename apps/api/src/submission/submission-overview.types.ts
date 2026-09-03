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
  notSubmittedCount: number;
  /** Đếm theo FILE, không theo sinh viên. */
  invalidFileCount: number;
}
