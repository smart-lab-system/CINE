/**
 * Anchor — few-shot học TỪ CHÍNH GIẢNG VIÊN, không phải RAG.
 *
 * File LEAF, không import gì.
 *
 * Một anchor là MỘT CẶP NHÃN có sẵn trong hệ thống (§10.1):
 * `grading_result.criterion_results` giữ phán đoán của AI (bất biến —
 * Security rule 6), `teacher_review.edited_criteria` giữ thứ giảng viên
 * sửa thành. Rule 6 tồn tại chính xác vì lý do này. Việc cần làm không
 * phải xây bộ nhớ mà là ĐƯA NÓ NGƯỢC VÀO PROMPT.
 *
 * MỨC TIÊU CHÍ, không phải cả bài (A5): cả bài làm phình tiền tố lên hàng
 * nghìn token cho một tín hiệu mà phần lớn không liên quan tới tiêu chí
 * đang xét; một đoạn trích kèm hai verdict thì vừa nhỏ vừa đúng đích.
 *
 * `studentExcerpt` chính là `evidence` mà AI đã trích — nên nó CÓ SẴN
 * trong DB. Không cần đọc lại bài làm từ kho lưu trữ, và cũng không nên:
 * bài làm đầy đủ là thứ A5 vừa loại bỏ.
 */
export interface Anchor {
  criterionId: string;
  /** Đoạn AI đã trích cho tiêu chí này. Có thể rỗng (AI không trích nổi). */
  studentExcerpt: string;
  /** AI đã phán thế nào. */
  aiVerdict: string;
  /** Giảng viên sửa thành gì. Đây là phần "nhãn đúng". */
  teacherVerdict: string;
  /**
   * Dùng để SẮP THỨ TỰ TẤT ĐỊNH (A4), không để hiển thị.
   *
   * Thứ tự đổi = byte đổi = cache chết. Sắp theo `(reviewedAt, reviewId)`
   * chứ không chỉ theo thời gian: hai lần duyệt trong cùng một mili giây
   * là chuyện có thật khi giảng viên bấm duyệt hàng loạt.
   */
  reviewedAt: string;
  reviewId: string;
}
