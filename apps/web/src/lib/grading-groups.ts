/**
 * Nhóm hiển thị của một kết quả chấm trên rail trái của trang Chấm điểm.
 *
 * Hàm thuần, tách khỏi component để test được đủ bảy trạng thái mà không phải
 * render gì. Ánh xạ phải TOÀN PHẦN: một status không có nhóm nghĩa là một bài
 * biến mất khỏi rail, và trong bài đó là bài thi thật của sinh viên.
 */
export type ReviewGroup =
  | 'needsReview'
  | 'reviewed'
  | 'autoApproved'
  | 'finalised'
  | 'grading';

/** Thứ tự hiển thị: việc cần làm trước, việc đã xong sau. */
export const GROUP_ORDER: ReviewGroup[] = [
  'needsReview',
  'autoApproved',
  'reviewed',
  'finalised',
  'grading',
];

export const GROUP_LABELS: Record<ReviewGroup, string> = {
  needsReview: 'Cần xem',
  autoApproved: 'Tự duyệt',
  reviewed: 'Đã duyệt',
  finalised: 'Đã chốt',
  grading: 'Đang chấm',
};

export function groupOf(status: string): ReviewGroup {
  switch (status) {
    case 'flagged_for_review':
      return 'needsReview';
    case 'auto_approved':
      return 'autoApproved';
    case 'teacher_reviewed':
      return 'reviewed';
    case 'finalized':
    case 'exported':
      return 'finalised';
    default:
      // ai_grading, ai_graded, và bất cứ giá trị nào thêm về sau. Rơi vào
      // nhóm chỉ-đọc chứ KHÔNG biến mất — mặc định an toàn ở đây là "vẫn
      // hiện ra", vì cái giá của việc giấu một bài lớn hơn hẳn cái giá của
      // việc xếp nó nhầm nhóm.
      return 'grading';
  }
}
