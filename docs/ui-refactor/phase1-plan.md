# Plan Giai đoạn 1: nền tảng UI CINE (ExamCollect)

Trạng thái: **BẢN NHÁP, chờ chủ dự án duyệt các quyết định ở mục 7 trước khi làm WP có dấu (*).**
Cơ sở: kiểm kê [inventory.md](inventory.md), 160 ảnh baseline, chấm 24 màn chấm điểm + 12 màn phiên sắp xếp (xem [screen-grades.csv](screen-grades.csv), [grading-regrade.csv](grading-regrade.csv), [logic-findings.md](logic-findings.md)).
Hiến chương áp dụng: [constitution](../../.specify/memory/constitution.md).

## 1. Mục tiêu và phạm vi

**Mục tiêu:** nâng nền giao diện (bảng, token, ngôn ngữ, trạng thái trống, tiêu đề, thứ bậc nút) để các màn Giai đoạn 2 không phải tự sửa lại những thứ dùng chung.

**Trong phạm vi:** lớp trình bày của `apps/web`, và copy hiển thị. Không đổi hook, query, API, route, quyền, validation.

**Ngoài phạm vi (không làm trong Giai đoạn 1):**
- Các lỗi logic L-01 đến L-25 trong [logic-findings.md](logic-findings.md). Mỗi lỗi cần một quyết định riêng của chủ dự án.
- Dữ liệu seed (fixture trùng code, trích dẫn ngẫu nhiên, điểm tiêu chí ngẫu nhiên). Đây không phải việc UI.
- Dark mode, ứng dụng Electron `apps/agent` (token riêng, đồng bộ sau).
- Thiết kế lại từng màn theo phong cách mới. Việc đó là Giai đoạn 2.

## 2. Điều kiện xuất phát (đã đo, không ước lượng)

| Hạng mục | Số liệu | Ghi chú |
|---|---|---|
| Bảng dùng primitive `ui/table` | 29 file | `table.tsx:38` đã có `overflow-x-auto` |
| Bảng `<table>` thô | 18 file | Bỏ qua wrapper, không có hành vi cuộn chung |
| Màu thô Tailwind (`bg-red-500`...) | 64 class trên 5 file | `admin/ide-utilities` (2 file), `admin/master-data/computers`, `teacher/playground`, `components/jplag` |
| Màn không có `PageHeader` | 14 trang | Gồm export, finalize, chi tiết kết quả, IDE, luật |
| Trạng thái trống dùng `EmptyState` | 13 file | Một số trang trống chỉ có một dòng chữ |
| Chuỗi kỹ thuật lộ cho người dùng | 20 mẫu, 9–105 file (xem mục 4.3) | Đã đo bằng grep |
| Thẻ KPI giữ chỗ `value="-"` | 3 chỗ | 2 ở admin dashboard, 1 ở teacher dashboard |

**Sửa một nhận định trước:** báo cáo trước nói bảng 390px "không có cuộn". Đúng hơn: bảng dùng primitive **có** cuộn ngang nhưng không có dấu hiệu cuộn (không có mép gợi ý, không có cột ghim). 18 bảng thô thì không có cuộn chung. Vì vậy WP1 sửa hai việc khác nhau.

## 3. Nguyên tắc thực thi

- Mỗi WP là một PR, theo Hiến chương VIII. Nền dùng chung đi trước và được duyệt riêng.
- Mỗi WP có ảnh TRƯỚC và SAU ở 390px và 1280px, 0 lỗi console, và đủ `lint`, `tsc`, `vitest`, `next build`.
- Chỉ thay chuỗi hiển thị. Test chỉ đổi khi chuỗi đổi, và phải liệt kê từng chỗ trong mô tả PR.
- Trước khi báo xong: gọi `code-reviewer` và chờ VERDICT (quy tắc chung của chủ dự án trong `CLAUDE.md`).
- Nhánh: làm trên `chore/ui-refactor-speckit`, tách nhánh con cho từng WP. Cần đối chiếu với 15 nhánh/worktree đang mở trước mỗi PR vì chúng cùng chạm `apps/web`.

## 4. Các work package

### WP0 · Đóng băng baseline và công cụ đo (S)
- **Việc:** giữ bộ ảnh baseline (`out/baseline`, `out/after-fix2`) làm mốc so sánh. Chuẩn hoá script `shoot.mjs` để ghi các chỉ số: `hOverflow`, số khung cuộn bị ẩn, số vùng bấm dưới 32px. Ghi bảng glossary rỗng.
- **File:** không đổi `apps/web`. Ảnh để ngoài repo; chỉ commit `docs/ui-refactor/*.md`.
- **Xong khi:** có bảng chỉ số baseline cho 80 route × 2 viewport để so sánh từng WP.

### WP1 · Bảng: dấu hiệu cuộn và cột ưu tiên (M)
- **4.1.1 Dấu hiệu cuộn trong primitive:** thêm mép mờ bên phải khi còn nội dung ẩn, và chữ gợi ý "Vuốt để xem thêm" ở 390px. Sửa tại `components/ui/table.tsx` một lần, áp cho 29 file.
- **4.1.2 Cột tối thiểu:** cột tên và cột trạng thái có `min-width`; cột ít quan trọng ẩn ở `md` và hiện ở `lg`. Quyết định ở mục 7.1 quyết định có chuyển sang thẻ hay không.
- **4.1.3 Chuyển 18 bảng thô sang primitive:** ưu tiên các bảng trên màn chính (`SessionTable`, `SubmissionStatusTable`, `CriteriaTable`, `TestBundleList`). Bảng nào không chuyển được thì ghi lý do.
- **Xong khi:** mọi bảng trên 390px có mép gợi ý cuộn; `scrollers` trong baseline không còn cột "Trạng thái" hay "Thao tác" bị ẩn mà không có dấu hiệu; 0 bảng `<table>` ngoài primitive trừ khi có lý do ghi trong PR.

### WP2 · Token: bỏ màu thô (S)
- **Việc:** thay 64 class màu thô trên 5 file bằng token trong `globals.css`. Thêm token nếu thiếu, kèm cặp tương phản đã đo.
- **Xong khi:** `grep` màu thô và hex trong `.tsx` ra 0 kết quả (ngoài test). Ảnh so sánh không có màu nào lệch ngoài ý định.

### WP3 · Ngôn ngữ giao diện (M)
- **Việc:** viết `docs/ui-refactor/glossary.md`, mỗi khái niệm một cách gọi. Áp dụng cho các mẫu chuỗi trong bảng 4.3.
- **Xong khi:** grep các mẫu trong bảng 4.3 ra 0 kết quả trong chuỗi hiển thị. Test chỉ đổi đúng chuỗi, có danh sách trong PR.
- **Phụ thuộc:** duyệt glossary (mục 7.4).

### WP4 · Trạng thái trống và số liệu giữ chỗ (S)
- **Việc:** chuẩn hoá `EmptyState`: tiêu đề, một câu giải thích, một hành động. Áp cho các trang trống hiện chỉ có một dòng: export, finalize, rubric trống, phiên trống, bài nộp trống. Xử lý 3 thẻ `value="-"` theo quyết định 7.2.
- **Xong khi:** mọi trang trống có đủ ba phần trên; không còn `value="-"`; không còn câu "có khi module… hoàn thiện".
- **Phụ thuộc:** quyết định 7.2.

### WP5 · Tiêu đề trang (S)
- **Việc:** thêm `PageHeader` cho 14 trang còn thiếu, hoặc ghi lý do không cần (ví dụ trang đăng nhập).
- **Xong khi:** mỗi route có một `h1` mô tả ngữ cảnh; trang export và finalize nói rõ việc của chúng.

### WP6 · Thứ bậc nút theo trạng thái (M, có quyết định)
- **Việc:** mỗi màn một CTA chính. Nút không áp dụng được thì ẩn hoặc vô hiệu hoá kèm lý do trong `title` và chữ hiển thị.
- **Ví dụ đã thấy:** "Tiếp tục" là CTA chính ở phiên đã huỷ; "Chốt điểm phiên" vẫn bật khi còn bài đang chấm; "Chấm điểm" luôn bật.
- **Phụ thuộc:** quyết định 7.3. Đây là đổi điều kiện hiển thị, nên chỉ làm khi quy tắc trạng thái được chốt bằng văn bản. Không tự suy ra quy tắc.

## 5. Thứ tự và phụ thuộc

```
WP0 ──┬── WP2 (token)        ──┐
      ├── WP1 (bảng)          ──┼── WP5 (tiêu đề) ── WP4 (trống, số liệu)
      └── WP3 (ngôn ngữ) ◄── duyệt glossary ──┘
                                            └── WP6 (nút) ◄── quyết định 7.3
```

Làm song song được WP1 và WP2 (khác file). WP3 chờ glossary được duyệt. WP6 chờ quy tắc trạng thái.

## 6. Ước lượng quy mô

| WP | Kích thước | File chính | PR |
|---|---|---|---|
| WP0 | S | docs | 1 |
| WP1 | M | ~30 (primitive + 18 bảng thô) | 2–3 |
| WP2 | S | 5 | 1 |
| WP3 | M | ~25 | 1–2 |
| WP4 | S | ~10 | 1 |
| WP5 | S | 14 | 1 |
| WP6 | M | ~8 | 1 |

Không ước lượng ngày. Kích thước đo theo số file và số PR, vì thời gian làm phụ thuộc vào thời gian chụp và chấm lại.

## 7. Quyết định cần chủ dự án chốt

1. **Bảng trên 390px:** (a) giữ cuộn ngang, thêm mép gợi ý và cột ghim cho cột tên (**đề xuất**, sửa một chỗ, áp cho toàn bộ); hay (b) chuyển sang danh sách thẻ dưới `md` (làm riêng cho từng bảng, tốn hơn nhiều).
2. **Thẻ KPI khi chưa có API** ("Bài chờ chấm", "Phiên thi đang diễn ra", "Chi phí AI"): (a) **ẩn**; (b) giữ với nhãn "Sắp có" (**đề xuất** nếu muốn giữ chỗ cho đợt sau).
3. **Quy tắc nút theo trạng thái:** cần danh sách trạng thái → hành động được phép. Ví dụ đề xuất: phiên đã huỷ không có "Tiếp tục"; "Chốt điểm phiên" chỉ bật khi không còn bài đang chấm. Hai quy tắc này phải được chốt trước khi làm WP6.
4. **Glossary:** duyệt bảng thuật ngữ. Ví dụ đề xuất: "lượt phản biện" → "Phản biện AI"; "hàng đợi" → "Chờ xử lý"; "Question Specific" → "Theo câu hỏi"; "Tự quyết" → "AI đã chốt"; "Áp giá mới" → "Cập nhật mức trừ". Chủ dự án có thể đổi.
5. **Thứ tự:** bắt đầu WP0 + WP1 + WP2 (nền) trước, hay chọn một màn làm mẫu trước khi làm hàng loạt?

## 8. Ngoài Giai đoạn 1: danh sách lỗi cần quyết định riêng

Lấy từ [logic-findings.md](logic-findings.md), cần chủ dự án quyết định trước khi sửa:
- L-12 banner "AI đang chấm" trên bài đã chấm xong.
- L-25 bài không có lỗi hiện "Chưa đo được" dù đã lưu confidence.
- L-17 nhật ký kiểm toán hiện mã thô (phần copy đưa vào WP3, phần thiếu bảng nhãn cần bổ sung dữ liệu).
- L-18 duyệt phiên bản IDE khi không có tệp (lỗi dữ liệu nghiêm trọng).
- L-19 trang browse kẹt "Đang tải…" khi tải lỗi.
- L-01 giảng viên gọi endpoint chỉ dành cho admin (403).
- Số đếm không khớp dòng trên danh sách chấm điểm (mục G và H).

## 9. Rủi ro

- **Primitive dùng chung:** đổi `table.tsx` ảnh hưởng 29 file. Giảm rủi ro bằng cách chụp baseline trước (WP0) và so sánh chỉ số sau mỗi PR.
- **Nhánh song song:** 15 worktree/nhánh cùng chạm `apps/web`. Rủi ro xung đột cao nhất ở `grading/` và `exam-sessions/`.
- **Seed không khớp đề:** một số màn vẫn hiển thị dữ liệu fixture. Đừng kết luận lỗi UI từ những màn này cho đến khi seed được sửa.
