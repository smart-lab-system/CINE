/**
 * Khoá truy vấn của dữ liệu nền — MỘT nơi, dùng chung giữa hook import (làm mới sau khi ghi) và các hook đọc của trang admin
 * (plan G1) và giảng viên (plan G2). Hai bên gõ tay cùng một chuỗi là hai chỗ để lệch nhau, và lệch ở đây thì danh sách không
 * làm mới sau khi nhập xong mà không có lỗi nào báo.
 */
export const MASTER_DATA_KEYS = {
  semesters: 'semesters',
  rooms: 'rooms',
  administrativeClasses: 'administrative-classes',
  /**
   * GỐC của mọi truy vấn lớp: `['classes', 'teaching', …]` ("Lớp của tôi", đã có từ trước) và `['classes', 'admin', …]` (trang
   * quản trị, plan G2). Khoá RỘNG có chủ ý — cùng lý do `useTeaching.ts` đã nêu: sĩ số lớp hiện ở nhiều chỗ, và một chỗ hiện
   * con số cũ là cách người dùng mất niềm tin vào tất cả.
   */
  classes: 'classes',
} as const;
