/**
 * Luật đối chiếu tên file bên trong file nén — spec
 * `docs/superpowers/specs/2026-09-21-archive-content-validation-design.md` §6.3.
 *
 * THUẦN, không I/O, cố ý. Đây là chỗ duy nhất luật "đủ hay thiếu" tồn tại,
 * nên nó test trực tiếp được, và nếu sau này muốn cảnh báo sớm ngay trên
 * agent thì dùng lại nguyên vẹn (spec §2, hiện ngoài phạm vi).
 */

/**
 * Những tên trong `expected` không tìm thấy trong `actual`.
 *
 * Trả về theo đúng thứ tự giảng viên khai, không sắp xếp lại: danh sách này
 * hiện thẳng lên màn bài nộp, và thứ tự khai là thứ tự giảng viên nghĩ về đề
 * của mình.
 *
 * ## Khớp theo TÊN FILE, không theo đường dẫn
 *
 * Lỗi phổ biến nhất của sinh viên là nén CẢ THƯ MỤC CHỨA thay vì nén nội
 * dung bên trong. Khớp theo đường dẫn đầy đủ sẽ làm mọi mục lệch đi một cấp
 * và đánh trượt TOÀN BỘ deliverable dù bài không thiếu gì — một kết luận sai
 * kiểu đó tệ hơn hẳn việc không kiểm, vì giảng viên tin nó.
 *
 * ## KHÔNG phân biệt hoa thường
 *
 * Và đây không phải thiếu nhất quán với phép khớp tên file BÊN NGOÀI vốn so
 * chính xác từng ký tự. Hai bên khác nhau ở chỗ AI tạo ra cái tên:
 *
 * - tên ngoài do **agent** tạo từ chuỗi server gửi xuống, nên nó luôn đúng
 *   từng ký tự — so chính xác không bao giờ oan;
 * - tên trong do **sinh viên** gõ trên Windows, nơi `Main.java` và
 *   `main.java` là cùng một file và hệ điều hành không cho em biết là có
 *   khác. So chính xác ở đây chỉ sinh ra kết luận sai.
 *
 * Hai luật khác nhau vì hai tình huống tin cậy khác nhau.
 */
export function matchEntries(expected: string[], actual: string[]): string[] {
  const present = new Set<string>();

  for (const raw of actual) {
    // Mục thư mục: bỏ. Một thư mục không phải một file em nộp, và để nó lọt
    // vào sẽ làm `expected: ['src']` khớp với `src/` — tức là báo đủ cho một
    // thứ rỗng.
    if (raw.endsWith('/') || raw.endsWith('\\')) {
      continue;
    }

    const basename = raw.split(/[/\\]/).pop();
    if (basename) {
      present.add(basename.toLowerCase());
    }
  }

  return expected.filter((name) => !present.has(name.toLowerCase()));
}
