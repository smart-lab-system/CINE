# Lượt chạy thật trên worker sandbox — G2b (2026-10-20)

Ngày: 2026-10-20. Mã: `main` tại `f0c756e` (merge #88). Hai lượt, cùng một worker.

## Máy và đường đi

- Worker: EC2 `ap-south-1`, Debian 13 (kernel 6.12), 2 vCPU, 31 GB RAM. Docker 29.9.0, runc 1.5.2, **runsc không cài**.
  Dịch vụ systemd `cine-sandbox` (active, enabled). Log khi khởi động: `nguồn real · runtime runc · 1 khe đo · 4 lượt kiểm
  song song`.
- Đường đi: client sandbox của API (user Redis `cine-sbx-api`) → hàng đợi BullMQ trên Valkey → worker (user
  `cine-sbx-worker`) → kết quả qua hàng đợi.
- Cảnh báo lặp lại trong log cả worker lẫn client: `Skipping the ready check because INFO command fails: NOPERM`. Các
  user ACL không có quyền `INFO`. Hàng đợi vẫn hoạt động; chỉ là log nhiễu. Chưa sửa.

## Lượt 1 — sandbox trực tiếp (không qua API)

Gọi client sandbox với đúng cách dựng job của API (`buildExecRequest`) và đối chiếu bằng `interpretRuns`.

| Biến thể mã | Biên dịch | Kết quả | Ghi chú |
|---|---|---|---|
| C++, LF | ok | ✓ `3 2 1\n`, `7\n` | 2 lượt: stdout giống nhau |
| C++, CRLF | ok | ✓ | |
| C++, BOM UTF-8 | ok | ✓ | |
| C++, chú thích tiếng Việt | ok | ✓ | |
| Python | ok | ✓ | |
| C++, lỗi biên dịch | `compile_error` | log biên dịch đầy đủ | |
| C++, chia cho 0 | — | `runtime_crash` | ánh xạ đúng |
| C++, output ~140 KB, **không** có đáp án mong đợi | ok | stdout **cắt đúng 65 536 byte**, trạng thái ca `ran`, không có `output_limit` | phát hiện được bằng độ dài trong `interpretRuns` |

Lưu ý: báo cáo ghi `fail` ở các lượt có ca không có đáp án mong đợi. Đó là kết quả của `summarizeExec` (chỉ `pass` là đạt),
không phải lỗi worker.

## Lượt 2 — đường đầy đủ qua API (`test/rehearsal-real-sandbox.e2e-spec.ts`)

HTTP thật → DB e2e cục bộ → storage cục bộ (MinIO) → hàng đợi Redis thật → worker thật. Chỉ có **model** là giả (đề xuất cố
định), vì gọi model tốn tiền và đầu ra của model không phải điều đang kiểm. Đáp án mong đợi được đối chiếu với oracle tính
trong JS, không lấy từ sandbox.

Kết quả: **8/8 pass**, khoảng 3,5 phút.

| Kịch bản | Kết quả |
|---|---|
| Chạy thử cả gói (c1 đúng, c2 đúng, c3 sai đáp án) | HTTP 201, `fail`; c1 `pass`, c2 `pass`, c3 `fail` với diff `mong đợi "4 5", nhận "5 4"` |
| Chạy thử một ca (c1) | 201, `pass` |
| Ca in 70 000 ký tự, đáp án **đúng** | 201, `pass` |
| Ca in 70 000 ký tự, đáp án **sai ở ký tự cuối** (đối chứng âm) | 201, `fail` với diff |
| Gói tay có ca 140 KB | **413** (xem phát hiện 1) |
| Sinh từ đề, model đúng | 201, `verified`, `examplesChecked: 1`, 4 ca, run `pass`; mọi `expected_output` khớp oracle |
| Sinh từ đề, model viết sai | 422 "không tái tạo đúng ví dụ", không ghi gói |
| Sinh từ đề, model biên dịch lỗi | 422 kèm log biên dịch thật, không ghi gói |
| Sinh từ đáp án giảng viên | 201, `origin = from_model_answer`; mọi `expected_output` khớp oracle |
| Sinh từ đáp án, có ca đầu ra 80 KB | 201, `droppedCount: 1`, ca bị bỏ với lý do `output vượt 64 KiB`, `expected_output` rỗng; các ca khác vào gói |

## Phát hiện

1. **Gói tạo tay không nhận được ca lớn: 413.** Nest dùng trần body JSON mặc định (100 KB). Body của `POST test-bundles`
   chứa **cả** đầu vào **lẫn** đáp án mong đợi, nên một ca có đầu ra trên 64 KiB (đáp án đúng cần ≥ 64 KiB) không thể lưu
   qua route này. Hệ quả thực tế: giảng viên không nhập được ca lớn bằng tay. Chưa sửa: tăng trần body là thay đổi cho cả
   API, cần cân nhắc tấn công từ chối dịch vụ.

2. **Giới hạn 64 KiB chỉ ảnh hưởng đường cần stdout trả về (sinh thước), không ảnh hưởng chạy thử.** Khi có đáp án mong
   đợi, worker so sánh trên đầu ra đầy đủ (ca 70 000 ký tự: đúng → pass, sai ở ký tự cuối → fail). Khi không có đáp án
   mong đợi, stdout bị cắt ở 64 KiB và ca bị bỏ với lý do rõ ràng. Cả hai đường đều đã kiểm.

3. **Câu chữ cảnh báo độ phủ gây hiểu nhầm.** Khi chỉ có 4 ca (dưới ngưỡng 5), cảnh báo nói `Chỉ còn 4/4 ca sau khi lọc`,
   trong khi không ca nào bị bỏ. Lý do thật là ngưỡng số ca. Chưa sửa; sửa câu chữ trong `coverageWarnings`.

4. Trạng thái trả về của worker không phân biệt được "đầu ra bị cắt" với "đầu ra đúng bằng 64 KiB". Đường sinh phát hiện
   bằng độ dài (`length >= 65536`). Đúng với hiện tại; nếu worker đổi cách cắt thì phải xem lại.

## Chưa làm / giới hạn

- Model là giả trong lượt 2: không kiểm chất lượng đề xuất của model thật, không đo chi phí.
- Không đo tải nhiều người cùng lúc.
- Lượt 2 chạy trên DB e2e cục bộ, không trên Supabase.
- Cảnh báo `NOPERM ... INFO` (phát hiện ở lượt 1) chưa sửa.

## Lệnh tái lập

Lượt 2 (chỉ chạy khi có worker): từ `apps/api`, đặt `SANDBOX_REDIS_URL` (lấy từ `.env`, không in ra) và
`REAL_SANDBOX_REHEARSAL=1`, rồi `node node_modules/jest/bin/jest.js --config ./test/jest-e2e.json
test/rehearsal-real-sandbox.e2e-spec.ts`. Spec bị bỏ qua (`describe.skip`) khi không đặt biến `REAL_SANDBOX_REHEARSAL=1`.
Báo cáo JSON và log của lượt 1 nằm ngoài repo.
