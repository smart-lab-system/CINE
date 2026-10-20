# Thăm dò structured outputs trên gateway, route ruler (2026-10-20)

Mục đích: biết gateway có thực thi `output_config.format` cho `occ/claude-sonnet-5` hay không, trước khi dựa vào nó để
xử lý lỗi "JSON hỏng" của lượt sinh thước.

Route: `ANTHROPIC_BASE_URL` trong `apps/api/.env`, model `occ/claude-sonnet-5` (mặc định của `CLAUDE_AUTHORING_MODEL`).
Gọi `messages.create` của SDK 0.125.0, không stream, không tool, `effort: 'low'` trong các lượt thăm dò.

## Kết quả

| Lượt | Prompt | Tham số | Đầu ra | Đọc được gì |
|---|---|---|---|---|
| P1 | Lời chào tiếng Việt, "trả về JSON {greeting}" | json_schema nhỏ | JSON thuần đúng schema | Không phân biệt được: prompt này vốn đã đòi JSON |
| P2 | Yêu cầu gọi tool `submit` | tool strict, `tool_choice: auto` | `tool_use` với input đúng schema | `auto` không bảo đảm model luôn gọi tool |
| Đối chứng | Prompt thử: viết văn xuôi 3 câu về thời tiết Hà Nội, cấm JSON | không có | Văn xuôi (59 token ra) | Prompt thử có hiệu lực |
| Thử | Cùng prompt thử | `RULER_OUTPUT_SCHEMA` | JSON đúng khuôn ruler (86 token ra) | Gateway ép khuôn ở lượt này |
| Lượt thật | Đề có dấu nháy, có "EVEN"/"ODD", qua `ClaudeRulerProvider` | `RULER_OUTPUT_SCHEMA` | 21 ca, 1 ví dụ, token vào 12.510, ra 1.297, 24 giây | Không lỗi JSON |

Prompt thử, nguyên văn: `Viết văn xuôi tiếng Việt, đúng 3 câu, kể về thời tiết hôm nay ở Hà Nội. TUYỆT ĐỐI KHÔNG viết JSON, không dùng dấu ngoặc nhọn, không dùng khối code.`

## Giới hạn của bản ghi

- Mỗi bên đối chứng chỉ có một lượt. Đây là bằng chứng có khả năng phân biệt, không phải tỉ lệ thành công.
- Lượt thật thành công không chứng minh tỉ lệ lỗi bằng 0: lỗi "JSON hỏng" cũ xảy ra theo đợt.
- Số đo cũ ngày 2026-09-17 trên route chấm điểm (nêu trong commit `919a45c`) ghi gateway không thực thi tham số này.
  Route chấm điểm không được đo lại trong bản ghi này.

## Chi phí

Khoảng vài cent. Các lượt thăm dò nhỏ; lượt thật khoảng 12,5k token vào và 1,3k token ra.

## Cách lặp lại

Gửi hai request cùng prompt thử ở trên, `effort: 'low'`: một không có tham số, một có
`output_config: { format: { type: 'json_schema', schema: RULER_OUTPUT_SCHEMA } }`. Kiểm đầu ra có bắt đầu bằng `{` và có
khớp khuôn không. Script thăm dò nằm ngoài repo, trong thư mục scratchpad của phiên.
