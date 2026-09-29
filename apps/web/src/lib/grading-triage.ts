/**
 * Những hàm thuần còn được dùng của màn chấm theo TIÊU CHÍ (đường `one_shot`) và của màn bài nộp.
 *
 * Phân loại bài trong PHIÊN (cần bạn xem / tự quyết / đang chấm …) đã chuyển sang `session-triage.ts`; phần
 * ma trận điều hành, bất thường cả lớp và độ lệch phản biện đi cùng màn Ma trận khi nó bị xoá.
 */

/** Từ đây trở lên mới coi là tin cậy cao. */
export const HIGH_CONFIDENCE = 0.7;

/**
 * Điểm một mức đánh giá đáng được, theo đúng `pointsFor()` của server.
 *
 * Chép lại ba nhánh chứ không đoán: `partially_met` là ĐÚNG MỘT NỬA, và con
 * số đó cố tình chưa cấu hình được — trọng số từng phần là câu hỏi thiết kế
 * rubric, không phải một hằng số nằm trong helper.
 */
export function pointsForVerdict(
  verdict: 'met' | 'partially_met' | 'not_met',
  maxPoints: number,
): number {
  if (verdict === 'met') return maxPoints;
  if (verdict === 'partially_met') return Math.round(maxPoints * 50) / 100;
  return 0;
}

/**
 * Bài này có phải của một sinh viên THI BÙ không?
 *
 * Phép so sánh, không phải một cột mới: `submission.home_class_id` là lớp
 * GỐC của sinh viên, còn `exam_session.class_id` là lớp của phiên. Khác
 * nhau nghĩa là em ngồi ở phiên của lớp khác — đúng định nghĩa thi bù, và
 * cùng phép so sánh mà sảnh thi đã dùng để tách nhóm (`attendance.service.ts`).
 *
 * `exam_session.class_id` thành NOT NULL ở `ExpandMasterDataToText` làm phép
 * so sánh này ĐÁNG TIN HƠN trước: không còn vế rỗng để phải đoán.
 *
 * **Đừng suy ra "thi bù" từ `joined_late`.** Vào muộn và thi bù là hai
 * chuyện khác nhau: một sinh viên của đúng lớp vào muộn mười phút không
 * phải thi bù, và một em thi bù có thể vào đúng giờ.
 */
export function isMakeupSubmission(
  submissionHomeClassId: string | null,
  sessionClassId: string | null,
): boolean {
  if (!submissionHomeClassId || !sessionClassId) return false;
  return submissionHomeClassId !== sessionClassId;
}
