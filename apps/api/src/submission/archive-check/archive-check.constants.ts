/**
 * Hằng số của phép kiểm nội dung file nén — spec
 * `docs/superpowers/specs/2026-09-21-archive-content-validation-design.md` §6.2.1.
 */

/**
 * Trần kích thước một file nén chịu mở ra kiểm.
 *
 * ĐỌC CÙNG `ARCHIVE_CHECK_CONCURRENCY` bên dưới. Ràng buộc ở đây là RAM của
 * container, KHÔNG phải rate limit của một API bên ngoài (đó là chuyện của
 * `GRADING_QUEUE`, nơi nhịp bị ngân sách token quyết định).
 *
 *     concurrency × MAX_BYTES × 2  =  2 × 200MB × 2  =  800MB
 *
 * Nhân 2 vì đường RAR giữ thêm một bản trong heap của WASM, ngoài buffer
 * phía JS. Đổi một trong hai số mà không tính lại cái kia là mở lại đúng lỗ
 * vừa bịt — container Railway mặc định không chịu nổi 5 × 200MB × 2 = 2GB.
 */
export const ARCHIVE_CHECK_MAX_BYTES = 200 * 1024 * 1024;

/** Xem `ARCHIVE_CHECK_MAX_BYTES` — hai số này là một cặp. */
export const ARCHIVE_CHECK_CONCURRENCY = 2;

/**
 * Trần số mục ĐỌC RA TỪ FILE NÉN.
 *
 * Khác hẳn trần 20 mục KHAI BÁO ở DTO: cái này chặn cạn bộ nhớ, cái kia
 * chặn một biểu mẫu không dùng nổi.
 *
 * "Không giải nén" làm zip bomb vô hại, nhưng nó KHÔNG che được một archive
 * khai hàng triệu mục — bảng mục lục vẫn phải dựng. Trần này chỉ có tác dụng
 * VÌ cả hai trình đọc dừng được giữa chừng (`yauzl` với `lazyEntries`,
 * `node-unrar-js` với generator). Một trần đặt sau khi thư viện đã nạp xong
 * toàn bộ bảng mục lục là một trần không tồn tại.
 *
 * Một bài thi CTDL&GT không có 20.000 file; chạm ngưỡng nghĩa là có gì đó
 * sai, và nói ra vẫn tốt hơn là chết lặng.
 */
export const ARCHIVE_MAX_ENTRIES = 20_000;

export const ARCHIVE_CHECK_QUEUE = 'archive-check';
