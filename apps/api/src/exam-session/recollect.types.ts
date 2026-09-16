/**
 * Ack agent trả lời cho `exam:recollect`. Chỉ cần biết nó CÒN SỐNG và đã
 * nhận lệnh — không chờ upload xong, vì upload mất bao lâu là chuyện của
 * kích thước bài làm, còn giảng viên đang đứng trong phòng cần biết ngay
 * máy nào không trả lời.
 */
export interface RecollectAck {
  ok: boolean;
}

export interface RecollectResult {
  /** Số sinh viên đã dự thi mà chưa nộp đủ file bắt buộc. */
  missing: number;
  /**
   * Số agent ĐÃ TRẢ LỜI trong thời hạn — không phải số lệnh đã gửi.
   * `emit` là bắn-và-quên: socket còn kết nối nhưng tiến trình agent treo
   * vẫn được tính, và giảng viên hành động dựa trên con số này.
   */
  acknowledged: number;
  unreachable: number;
  /**
   * Tên các em không với tới được, lấy từ `enrollment.student_name`
   * (cột `NOT NULL`) — em unreachable theo định nghĩa là em không có
   * socket để đọc tên ra. Đây là phần giảng viên hành động dựa vào, quan
   * trọng hơn con số.
   */
  unreachableNames: string[];
}

/** 3 giây: agent chỉ cần báo đã nhận, chưa cần upload xong. */
export const RECOLLECT_ACK_TIMEOUT_MS = 3_000;
