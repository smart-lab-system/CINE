/**
 * Môn DUY NHẤT hệ thống này phục vụ.
 *
 * Đây là ràng buộc của hệ thống, không phải phạm vi của một bản demo: cả
 * hướng chấm điểm sâu — bảng lỗi kèm mức trừ, đáp án mẫu đem chạy thật, đo
 * độ phức tạp — đều dựng quanh đúng môn này.
 *
 * Hệ quả: `class.course_name` và `exam_session.course_name` mang CÙNG MỘT
 * chuỗi ở mọi dòng. Chúng không còn phân biệt được gì, nhưng vẫn là vị từ ở
 * bốn phép tra — lớp gốc của sinh viên thi bù, các lớp anh em khi nhập danh
 * sách, "đã thi ở phiên khác", và khoá duy nhất của lớp. Để chúng đúng một
 * cách hiển nhiên rẻ hơn nhiều so với sửa logic định tuyến thi bù, nên cột
 * ở lại cho tới đợt dựng lại chấm điểm; xem mục "Nợ mang sang từ đợt chốt
 * MỘT MÔN" trong spec agent điều tra.
 *
 * KHÔNG có ô nhập nào hỏi lại giá trị này nữa. Một câu hỏi chỉ có đúng một
 * đáp án thì mỗi lần hỏi chỉ thêm một cơ hội gõ lệch — mà gõ lệch ở đây
 * không báo lỗi, nó lặng lẽ tách hệ thống làm hai nửa không thấy nhau.
 *
 * Trường khác viết tên môn theo cách khác thì sửa đúng dòng dưới đây, rồi
 * thêm MỘT migration nữa để kéo dữ liệu cũ theo — lấy
 * `NormalizeCourseNameToSingleSubject` làm mẫu. Migration đã chạy thì không
 * chạy lại được, và nó cố tình viết thẳng chuỗi thay vì đọc hằng số này.
 */
export const COURSE_NAME = 'CTDL&GT';
