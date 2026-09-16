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

/**
 * ANCHOR MẶC ĐỊNH TẮT — và đây là quyết định, không phải giá trị khởi tạo.
 *
 * §10.0: anchor LÀ nhánh D của calibration, tức một THÍ NGHIỆM. Một thứ
 * đang được thí nghiệm không được phép là mặc định của hệ thống chấm điểm
 * thật. Bật nó kích hoạt cùng lúc ba rủi ro chưa ai đo:
 *
 *   1. Vòng lặp neo — thầy nhìn đề xuất AI, sửa nhẹ, ta học cái sửa nhẹ,
 *      AI tự tin hơn, thầy sửa ít hơn, và hệ hội tụ về đúng thiên lệch
 *      ban đầu của AI. Nó siết dần TRONG IM LẶNG.
 *   2. Anchor mâu thuẫn — thầy nới tay với em A, siết với em B; nạp cả
 *      hai là đưa model tín hiệu ngược nhau. Cắt bớt một cái GIẤU mâu
 *      thuẫn chứ không giải quyết nó.
 *   3. Loãng chú ý — chưa ai chứng minh ở cửa sổ 1M, cũng chưa ai loại trừ.
 *
 * Tắt mặc định hoá giải cả ba mà không cần biết cái nào có thật.
 *
 * `=== 'true'` chứ KHÔNG `Boolean(...)`: `Boolean('false')` là `true`, và
 * repo này đã mất một buổi vì đúng họ lỗi đó (`GRADE_CONCURRENCY` rỗng →
 * `Number('')` → 0 → hàng đợi lặng lẽ ngừng nhận job).
 */
export const GRADING_ANCHORS_ENABLED = process.env.GRADING_ANCHORS_ENABLED === 'true';

/**
 * K — tối đa bao nhiêu anchor cho MỖI tiêu chí (§10.0).
 *
 * Trần này đủ nhỏ để rủi ro "loãng chú ý" không thành vấn đề dù nó có
 * thật, nên ta không phải chờ ai chứng minh điều đó trước khi bật.
 */
export const ANCHOR_MAX_PER_CRITERION = 3;

/**
 * Trần TỔNG cho cả khối anchor, tính bằng token ước lượng (§10.0).
 *
 * Ước lượng chứ không đếm thật: đếm token đúng cần gọi API, mà đây là một
 * quyết định phải ra được lúc ghép prompt, offline, tất định. Ước lượng
 * thấp hơn thực tế sẽ cắt hơi nhiều — chấp nhận được; ước lượng cao hơn
 * thực tế sẽ vượt trần — không chấp nhận được. Nên hệ số chọn theo hướng
 * thận trọng ở `estimateTokens`.
 */
export const ANCHOR_MAX_TOKENS = 4000;
