/**
 * Above this, the AI's answer stands on its own; below it, a teacher looks.
 *
 * Set high on purpose. The cost of the two mistakes is not symmetric: a
 * flagged submission that did not need a human costs a minute of reading,
 * and an auto-approved one that did costs a wrong mark on a transcript. The
 * local keyword provider never reaches this, which is correct — word
 * overlap is evidence a topic was mentioned, never that it was answered.
 *
 * A per-course threshold belongs on GradingPipelineConfig, whose table
 * already exists and is deliberately not wired up in this slice.
 */
export const AUTO_APPROVE_CONFIDENCE = 0.85;

/**
 * Giới hạn đầu vào cho một lượt chấm (CLAUDE.md §7.1.4).
 *
 * Một bài `.zip` 30MB chứa `node_modules` vừa làm nghẽn cả lượt chấm vừa
 * đốt chi phí vô ích — và tệ hơn: nó KHÔNG phải bài làm, nên điểm chấm
 * ra từ nó là vô nghĩa. Chặn ở `extractText`, không phải ở chỗ gọi
 * model, để mọi provider — kể cả provider thêm về sau — đều đi qua cùng
 * một cửa và không có đường vòng.
 *
 * 10MB: một bài docx/txt thật của sinh viên gần như không bao giờ vượt
 * 2MB; 10MB đã rất rộng tay mà vẫn chặn được ca bệnh lý.
 */
export const MAX_GRADING_INPUT_BYTES = 10 * 1024 * 1024;

/**
 * Cắt theo KÝ TỰ sau khi extract, độc lập với giới hạn byte.
 *
 * Một file docx 2MB toàn chữ vẫn có thể ra hàng triệu ký tự — quá dài
 * cho context window và tốn tiền vô ích, trong khi phần vượt gần như
 * chắc chắn không phải nội dung cần chấm. 200k ký tự ≈ 50k token, thừa
 * sức cho một bài tự luận dài nhất.
 *
 * Đây là giới hạn của thứ THẬT SỰ được gửi đi, nên `TRUNCATION_NOTICE`
 * nằm TRONG nó, không cộng thêm ra ngoài.
 */
export const MAX_GRADING_INPUT_CHARS = 200_000;

/**
 * Dán vào cuối phần đã cắt. Cắt im lặng sẽ khiến người đọc kết quả tin
 * rằng model đã nhìn thấy cả bài.
 */
export const TRUNCATION_NOTICE = '\n\n[...nội dung bị cắt do vượt giới hạn chấm tự động]';
