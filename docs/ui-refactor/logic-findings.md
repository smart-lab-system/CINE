# Lỗi logic / dữ liệu phát hiện trong đợt audit UI

Nguồn: chụp 160 ảnh (80 route × 2 viewport) trên DB seed `examcollect_ui`, base `main` @ 8f43e370.
Điểm từng màn: xem [screen-grades.csv](screen-grades.csv).

Quy tắc đợt refactor: KHÔNG sửa logic trong PR giao diện. Mỗi mục là một việc riêng để chủ dự án quyết định.

**Trạng thái kiểm chứng**
- **Đã xác nhận**: có bằng chứng runtime (HTTP status, console) hoặc đọc code có dẫn file:dòng.
- **Đã thấy trên ảnh**: thấy trên ảnh chụp, chưa đọc code.
- **Nghi ngờ**: có thể do seed hoặc do cách đọc ảnh; cần kiểm trước khi báo là lỗi sản phẩm.

**Mức độ**: Cao = sai quyền, sai dữ liệu người dùng thấy, hoặc chặn việc; TB = gây hiểu nhầm hoặc hỏng trải nghiệm; Thấp = lệch nhỏ.

---

## A. Đã xác nhận

### L-01 · Giảng viên gọi endpoint chỉ dành cho admin (403) · Cao
- Trang: `teacher/classes/[id]/roster`. Console 403 trên `GET /master-data/nominal-classes` (ảnh 47, 48).
- Nguyên nhân: `NominalClassesController` có `@Roles('admin')` (`apps/api/src/master-data/master-data.controllers.ts:229`). `ManualAddStudentForm` gọi `useNominalClasses()` vô điều kiện (`apps/web/src/components/roster/manual-add-student-form.tsx:100`) và form này hiện cho giảng viên khi `canEdit` (`roster-screen.tsx:287-301`).
- Hướng sửa: nới quyền đọc cho giảng viên, hoặc chỉ gọi hook khi có `catalogAssist`.

### L-02 · Trang "Tạo đề nháp" là ngõ cụt khi thiếu môn · Cao
- `teacher/exam-bank/new` (ảnh 117, 118) chỉ hiện "Thiếu môn học." và nút quay lại, không có bộ chọn môn.
- Nguồn: `apps/web/src/app/teacher/exam-bank/new/page.tsx:54`. Nút dẫn tới đây là `/teacher/exam-bank/new?courseId=${effectiveCourseId}` (`exam-bank/page.tsx:51,109`). Khi `effectiveCourseId` rỗng, người dùng không có đường nào tiếp tục.
- Chưa kiểm: `effectiveCourseId` lấy từ đâu khi giảng viên chưa có lớp.

### L-03 · Dashboard hiển thị số liệu giữ chỗ và ghi chú phát triển · Cao
- Thẻ "Bài chờ chấm" của giảng viên là `value="-"` cố định (`apps/web/src/app/teacher/dashboard/page.tsx:47`).
- Dashboard admin có hai thẻ `value="-"` (`admin/dashboard/page.tsx`, dòng ~50 và ~57).
- Chuỗi người dùng thấy: "Cần API thống kê phiên thi toàn hệ thống", "Có khi module thu bài và chấm điểm hoàn thiện" (ảnh 9, 10, 113, 114, 135, 147, 148).
- Hướng sửa: nối dữ liệu thật, hoặc ẩn thẻ. Không để chữ "có khi" ra người dùng.

### L-04 · Trang chấm điểm lộ ghi chú spec nội bộ · TB
- Khối "Độ phủ điều tra" nói "Cần công cụ đo độ phức tạp (bước 4 của spec chấm điểm) - chưa xây" (ảnh 59, 65, 66).
- Nguồn: `apps/web/src/app/teacher/grading/[resultId]/_components/investigator/CoverageSection.tsx:33`.
- Hướng sửa: trạng thái trung lập ("Chưa đo độ phức tạp cho bài này") hoặc ẩn khối khi chưa có tính năng.

### L-05 · Nhãn "Thời điểm tạo" hiện học kỳ · TB
- Trang đề thi trong master data: `dd` của "Thời điểm tạo" là `exam.resolvedSemesterName ?? formatCreatedAt(exam.createdAt)` (`apps/web/src/app/admin/master-data/courses/[id]/exams/[examId]/page.tsx:81`). Khi có học kỳ, nhãn hiện tên học kỳ thay vì thời điểm.
- Trang rubric và danh sách rubric dùng cùng nhãn cho học kỳ (`rubrics/[id]/page.tsx:126`, `teacher/rubrics/page.tsx:267`; ảnh 25, 27, 137, 79).
- Hướng sửa: đổi nhãn thành "Học kỳ" hoặc hiện đúng thời điểm.

### L-06 · Hai trang chi tiết luật và trang tạo luật luôn chuyển hướng · TB
- `teacher/rules/[ruleId]` luôn `redirect('/teacher/rules')` (`apps/web/src/app/teacher/rules/[ruleId]/page.tsx:7`). `teacher/rules/new` cũng vậy (`rules/new/page.tsx:8`). Trang `teacher/rubrics/qa` redirect về dashboard (`rubrics/qa/page.tsx:5`).
- Không tìm thấy liên kết nào tới `/teacher/rules/<id>` trong code, nên route chi tiết luật là code chết. Tên file ghi rõ đây là chủ ý để dấu trang cũ không 404.
- Hướng sửa: nếu chắc không còn dấu trang cũ, xoá route. Nếu giữ, ghi rõ trong tài liệu.

### L-07 · Nút "Tiếp tục" của phiên thi không xét trạng thái phiên · Cao
- `SetupFooter.tsx` chỉ disable "Tiếp tục" theo `index` và `pending` (`apps/web/src/app/teacher/exam-sessions/[id]/_components/SetupFooter.tsx:55-70`). Footer không nhận trạng thái phiên.
- Ảnh cho thấy "Tiếp tục" vẫn là CTA chính ở phiên đã huỷ, bỏ lỡ, đã kết thúc (ảnh 91, 92, 95, 99, 100).
- Chưa kiểm: component cha có truyền `disabled` theo trạng thái hay không. Nếu không, đây là lỗi thật.

### L-08 · Lọc "Đang chấm" của phiên thi trong danh sách chấm không khớp tab · TB
- Tab "Đang chấm 0" trong khi thẻ phiên ghi "8 đang chấm" và "16 đang chấm" (ảnh 129).
- Chưa kiểm: có thể hai số đếm theo định nghĩa khác (phiên và bài). Cần đọc hàm đếm.

### L-09 · Số "N/M bài nộp" trên đầu trang không khớp số dòng hiển thị · TB · Nghi ngờ
- Các thẻ "N/M bài nộp" không khớp số dòng hiển thị: 42/44 nhưng 40 dòng (ảnh 76), 40/44 nhưng 36 dòng (ảnh 73, 74), 35/38 nhưng 33 dòng (ảnh 71, 72).
- Có thể do bộ lọc hoặc phân trang. Cần kiểm với hàm đếm.

---

## B. Đã thấy trên ảnh (kết luận sau kiểm chứng xem mục E)

### L-10 · Điểm tổng 94% không khớp các con số phía dưới · Cao
- Ảnh 69, 70 (bài [MSSV]): hero "94%", "Trung bình có trọng số theo điểm bị trừ: 80%", ghi "giới hạn khác kéo xuống 94%". Một ràng buộc chỉ kéo xuống, không thể đưa 80% lên 94%.
- Cần đọc công thức độ chắc chắn tổng hợp.

### L-11 · Bài tự chốt khi chưa đo được độ chắc chắn · Cao
- Ảnh 65, 66 (bài [MSSV]): trạng thái "Đã chốt" 10,0, nhưng "Mức chắc chắn: Chưa đo được" và "Cần từ 85% mới tự chốt".
- Đây là điều kiện tự chốt, nên cần đọc hàm quyết định tự chốt.

### L-12 · Trạng thái "AI đang chấm" hiện cho bài đã có điểm · Cao
- Ảnh 57, 58: banner "AI đang chấm bài này - đã 172 giờ". Bài đã ở `ai_graded`.
- Đã đọc hàm: `gradingInProgressMessage` (`apps/web/src/lib/grading-elapsed.ts`) chỉ dựa vào `gradingTriggeredAt`, không dựa vào trạng thái. Lỗi nằm ở điều kiện hiển thị banner. Cần kiểm chỗ gọi hàm.

### L-13 · Hai bài có cùng đoạn code nhưng điểm khác nhau · Cao · Nghi ngờ
- Ảnh 59, 60 (bài [SV]) và 67, 68 (bài [SV]): code giống hệt nhau, nhưng điểm 5/5 với độ tin cậy 0,66 và 2,5/5 với 0,88.
- Có thể do seed trùng nội dung, hoặc do chấm không xác định. Cần kiểm dữ liệu đầu vào.

### L-14 · Trích dẫn bằng chứng không có trong code bài làm · Cao · Nghi ngờ
- Các "Trích dẫn từ bài làm" (ảnh 59-68) không xuất hiện trong đoạn code hiển thị. Bài chấm bằng đọc mã nhưng không chạy lại nói "ở mọi bộ test được kiểm", không có căn cứ.
- Rất có thể do dữ liệu seed tự bịa. Nếu pipeline thật tạo ra, đây là lỗi nghiêm trọng.

### L-15 · Đếm trong phiên "sortsearch" mâu thuẫn · Cao · Nghi ngờ
- Bộ lọc "Đang chấm · 16" nhưng thẻ tóm tắt ghi "Đang chấm 2", banner ghi "2 bài không còn ai chấm". "Đã có kết quả 36" nhưng "38 trên 40 đã có kết quả".
- Cần kiểm hàm tổng hợp phiên. Có thể là dữ liệu seed chứa bài treo.

### L-16 · Nút "Chốt điểm phiên" bật khi còn bài treo · TB · Nghi ngờ
- Ảnh 75 (sortsearch): cạnh nút "Chốt điểm phiên" là "Chấm tiếp 2 bài treo", cả hai đều là CTA mạnh.

### L-17 · Dòng audit hiển thị mã kỹ thuật và tên trường thô · Cao
- Cột hành động: `grading_result.score_reapplied_after_finalize`, `exam_session.reassign_teacher`. Cột "Trường đã đổi": `finalScore`, `grantedTo`, `until`. Placeholder lọc: "vd: grading.override" (ảnh 3, 4).
- Hướng sửa: bảng nhãn tiếng Việt cho từng mã hành động và từng trường.

### L-18 · Phiên bản IDE "đã duyệt" nhưng không có tệp · Cao · Nghi ngờ
- Ảnh 13 (C/C++ 1.22.11, 1.21.6): trạng thái "Đã duyệt", cột File "-", và trang browse báo "Phiên bản chưa có file .vsix". Cùng giây duyệt và thêm.
- Có thể do seed không tạo tệp. Nhưng nếu quy trình cho phép duyệt phiên bản không có tệp thì đó là lỗi dữ liệu.

### L-19 · Lỗi và "Đang tải" hiện cùng lúc · TB
- `admin/ide-utilities/.../browse` (ảnh 11, 12): thông báo lỗi và chữ "Đang tải..." cùng hiện.

### L-20 · Trạng thái "Sẵn sàng" của đề khi câu hỏi chưa gắn rubric · TB · Nghi ngờ
- Ảnh 51, 52: đề "Sẵn sàng" nhưng cả hai câu "Chưa gắn" rubric. Cần kiểm điều kiện đánh dấu sẵn sàng.

### L-21 · Mô tả trang kho đề hứa xoá bản nháp nhưng không có nút xoá · TB · Nghi ngờ
- Ảnh 119: mô tả ghi "Đề chưa gắn phiên thi có thể xóa", nhưng dòng không có nút xoá.

### L-22 · Nút "Chấm điểm" bật khi phiên đang thu bài · TB · Nghi ngờ
- Ảnh 105, 107, 109: nút đậm khi phiên đang thi hoặc đang thu bài.

### L-23 · Lượt chấm có trường "price" và tên người sửa trong nhật ký · TB · Nghi ngờ
- Ảnh 3 và dữ liệu audit: dòng `grading_result.score_reapplied_after_finalize` có trường `price`. Có thể do seed hoặc do ghi nhật ký sai.

### L-24 · Tiêu đề cột bài nộp hiện nguyên mẫu `{MSSV}_ERD.PNG` · TB · Nghi ngờ
- Ảnh 43, 105, 107, 109. Trong schema, `{MSSV}` là token hợp lệ của mẫu tên tệp. Chưa tìm được nơi render ra tiêu đề này; cần kiểm tiếp.

---

## C. Vấn đề hiển thị lặp lại (không phải logic, ghi để nhớ)

- Bảng 390px cắt ngang không có dấu cuộn ở hầu hết trang có bảng. Nên sửa ở wrapper bảng chung.
- Jargon nội bộ hiện cho giảng viên: "hàng đợi", "lượt phản biện", "snake_case" (sai_ca_bien, dung_dan), "#tc1", "Teacher Hub", "registry", "QS", "exact / *".
- "−0,0" hiện khi không bị trừ điểm (ảnh 59, 65, 66). Lỗi định dạng số.
- Trang "Xuất bảng điểm" và "Chốt điểm" không có tiêu đề riêng và nội dung giống nhau (ảnh 125-128).

## D. Dữ liệu seed, không phải lỗi sản phẩm

- Tệp "DeThi_CK_CSDL.pdf" dung lượng 72 B (ảnh 43).
- Nhiều dòng có cùng giây cập nhật (14:31:03 hoặc 14:31:02 ngày 26/11/2026).
- 79 tài khoản cùng ngày tạo.
- Mã lớp và Khóa có thể lệch (ảnh 31): nghi ngờ nguồn seed.
- Phiên "completed" có tên trạng thái nhưng màn còn "Đang chấm" (ảnh 71-72): có thể do tên fixture.
- Các phiên ở trạng thái "draft" là dữ liệu tổng hợp để xem giao diện.

---

## E. Kết quả kiểm chứng L-10 đến L-24 (đọc code và dữ liệu seed)

Phân loại: **Lỗi sản phẩm** = code thật sai; **Dữ liệu seed** = do cách seed ghi dữ liệu, pipeline thật không tạo ra; **Thiết kế** = hoạt động đúng code nhưng gây hiểu nhầm; **Không xác nhận** = chưa đủ bằng chứng.

| Mục | Kết luận | Bằng chứng | Mức |
|---|---|---|---|
| L-10 | Dữ liệu seed. Pipeline không thể cho confidence cao hơn trung bình có trọng số | Seed ghi `confidence` ngẫu nhiên, không tính từ lỗi (`C:/tmp/ui-seed/05-grading.mjs:91,202`). Pipeline chỉ hạ confidence xuống (`apps/api/src/grading/decision/decide.ts:206-209`). Lỗi nhỏ phía UI: `ConfidenceBreakdown.tsx:73` hiện "giới hạn khác kéo xuống" cho mọi chênh lệch, không kiểm tra chiều | Thấp (UI) |
| L-11 | Dữ liệu seed. Seed đặt `auto_approved` trực tiếp, không qua `decide()` | `05-grading.mjs:140,209`. Pipeline thật: không có lỗi có giá thì `caseConfidence` trả 1 khi đủ độ phủ (`confidence.ts:52`), nên không rơi vào "Chưa đo được" | Không áp dụng cho sản phẩm |
| L-12 | **Lỗi sản phẩm (xác nhận)** | `IN_PROGRESS = ['ai_grading','ai_graded']` (`apps/web/src/app/teacher/grading/[resultId]/page.tsx:35`). `ai_graded` nghĩa là AI đã chấm xong. Banner gọi `gradingInProgressMessage` (`apps/web/src/lib/grading-elapsed.ts`), luôn nói "AI đang chấm bài này - đã X", X tính từ `gradingTriggeredAt` đến hiện tại nên đồng hồ chạy mãi | Cao |
| L-13 | Dữ liệu seed. Điểm sinh ngẫu nhiên, không chấm theo code | `05-grading.mjs:90` lấy điểm từ `perCriterion` do `rand()` sinh ra. Đoạn code được tái dùng | Không áp dụng cho sản phẩm |
| L-14 | Dữ liệu seed. Trích dẫn bằng chứng là chuỗi cố định | `05-grading.mjs:162` danh sách `met` có sẵn "Cài đặt đầy đủ và cho kết quả đúng ở mọi bộ test được kiểm", gắn `verified: true`. UI hiển thị nguyên văn, không kiểm tra trích dẫn có trong bài | Không áp dụng cho sản phẩm; ghi nhận UI không tự kiểm |
| L-15 | **Thiết kế (nhãn mơ hồ)** | Cùng nhãn "Đang chấm" nhưng hai đại lượng khác nhau: bộ lọc đếm phiên theo trạng thái (`apps/web/src/lib/session-list.ts:224`), panel đếm bài `ai_grading` (`RunningPanel.tsx:83`). Con số "38 trên 40" chưa kiểm | TB |
| L-16 | **Không xác nhận lỗi** | Trang Chốt điểm chặn đúng: nút bị `disabled` khi còn bài chưa xong, kèm tooltip "Còn N bài chưa xong" (`apps/web/src/app/teacher/grading/_components/FinalizePanel.tsx:128`). Chưa đọc `SessionHeader` để xem nút ở đầu trang có bật hay không | Cần xem thêm |
| L-17 | **Lỗi sản phẩm (xác nhận)** | Trang audit hiển thị nguyên `item.action` (`apps/web/src/app/admin/audit-log/page.tsx:99`). Web không có bảng nhãn cho mã hành động hay tên trường | TB |
| L-18 | **Lỗi sản phẩm (xác nhận)** | `approveVersion` đặt `approved` mà không kiểm tra có tệp `.vsix` (`apps/api/src/ide-extensions/ide-extensions.service.ts`, hàm `approveVersion`). Các lệnh khác có kiểm tra "Phiên bản chưa có file .vsix" nhưng lệnh duyệt thì không | Cao |
| L-19 | **Lỗi sản phẩm (xác nhận)** | Trang browse hiển thị "Đang tải…" khi `browse` còn `undefined` (`apps/web/src/app/admin/ide-utilities/[id]/versions/[versionId]/browse/page.tsx:330`). Khi tải lỗi, `browse` không bao giờ được gán, nên chữ "Đang tải…" đứng cạnh thông báo lỗi mãi | TB |
| L-20 | **Thiết kế (thiếu kiểm tra)** | Trạng thái "Sẵn sàng" là lựa chọn tự do của người soạn (`ExamBankForm.tsx:308`), DTO chỉ kiểm `draft|ready` (`apps/api/src/exam-bank/dto/exam-bank.dto.ts:101`). Không có kiểm tra câu hỏi đã gắn rubric | TB |
| L-21 | **Không phải lỗi, mô tả đặt sai chỗ** | Nút xoá nằm ở trang chi tiết đề (`apps/web/src/app/teacher/exam-bank/[id]/page.tsx`), không nằm ở danh sách. Mô tả danh sách nói "có thể xóa" nhưng không có nút xoá ở dòng. Chưa xem điều kiện "chưa gắn phiên thi" | Thấp |
| L-22 | **Không phải lỗi chắc chắn** | Nút "Chấm điểm" luôn bật (`SessionTable.tsx:176`), đích là `/teacher/grading?sessionId=…` và trang đó có trạng thái "chuẩn bị chấm" (`grading/page.tsx:33`). Hành vi có chủ ý, chỉ đáng xem lại trải nghiệm | Thấp |
| L-23 | **Dữ liệu seed** | Seed ghi `{price:'v3'}` vào audit (`07-extras.mjs:52`, `07b-audit-topup.mjs:23-24`). Code thật ghi `{score, priceTableVersionId, computationId, changedRules}` (`apps/api/src/grading/scoring/score.service.ts:440-441`) | Không áp dụng cho sản phẩm |
| L-24 | **Thiết kế (token thô)** | Tiêu đề cột là `deliverable.requiredFilename` (`SubmissionStatusTable.tsx:332`, `LobbyRosterTable.tsx:378`). Đây là mẫu tên tệp do giảng viên đặt, chứa token `{MSSV}` và được hiện nguyên văn | TB (UI) |

### Tóm tắt sau kiểm chứng

- **Lỗi sản phẩm xác nhận bằng code: L-12, L-17, L-18, L-19.** Ba mục đầu có tác động thật: banner sai trạng thái, duyệt phiên bản IDE không có tệp, và trang browse kẹt ở trạng thái tải.
- **Thiết kế cần sửa về nhãn hoặc kiểm tra: L-15, L-20, L-24.**
- **Không phải lỗi sản phẩm (dữ liệu seed): L-10, L-11, L-13, L-14, L-23.** Các số liệu "đáng ngờ" trong báo cáo ảnh phần lớn đến từ seed. Nên sửa seed trước khi dùng ảnh làm căn cứ thiết kế.
- **Không xác nhận hoặc không phải lỗi: L-16, L-21, L-22.**

---

## F. Sau khi sửa seed và chụp lại

Đã sửa seed (`C:/tmp/ui-seed/05-grading.mjs`, `07-extras.mjs`, `07b-audit-topup.mjs`; bản gốc có đuôi `.bak`), seed lại từ đầu và chụp lại 276 ảnh (`out/after-fix2`, `out/after-fix3`).

| Mục | Trước | Sau | Kết luận |
|---|---|---|---|
| L-10 | Điểm 94% trong khi trung bình 80% | Seed tính confidence theo đúng công thức backend (`min(0,97, Σ cap·mức trừ / Σ mức trừ)`). Bài [MSSV]: 50% = trung bình 50%. Mọi kết quả điều tra khớp công thức sau khi trừ trần 0,97 | **Đã khắc phục ở seed.** Không còn mâu thuẫn |
| L-11 | "Đã chốt" 10,0 với "Chưa đo được" | Seed không còn tự chốt bài có confidence thấp. Bài không lỗi có confidence 0,97 | **Dữ liệu đã sửa.** Xem L-25 bên dưới: vẫn còn lỗi UI thật |
| L-13 | Hai bài cùng code khác điểm AI | Điểm AI chỉ phụ thuộc nội dung bài (băm nội dung làm seed, bỏ phần trừ theo trạng thái) | **Đã khắc phục ở seed.** Chênh lệch còn lại chỉ đến từ giảng viên chấm lại |
| L-14 | Trích dẫn là câu cố định, không có trong bài | Trích dẫn là một dòng thật của bài làm; tiêu chí không đạt không có trích dẫn | **Đã khắc phục ở seed** |
| L-23 | Audit có trường `price` không tồn tại trong code | Payload đúng shape `{score, priceTableVersionId, computationId, changedRules}` | **Đã khắc phục ở seed** |

Các mục **không** phải lỗi seed vẫn còn nguyên, cần sửa ở sản phẩm: **L-12** (banner "AI đang chấm" trên bài `ai_graded`), **L-17** (nhật ký kiểm toán hiện mã thô), **L-18** (duyệt phiên bản IDE khi không có tệp), **L-19** (trang browse kẹt ở "Đang tải…").

### L-25 · Bài không có lỗi hiện "Chưa đo được" dù đã lưu confidence 0,97 · TB · Lỗi sản phẩm (xác nhận từ ảnh và code)
- Ảnh `2bf521a6` (`out/after-fix3`, bài [MSSV]): hero hiện "Chưa đo được", badge "Bài không có lỗi nào", và mục "Mức chắc chắn tính từ đâu" nói không có lỗi nên không có mức chắc chắn. Trong khi đó bảng `grading_result.confidence` lưu 0,97 và backend tính confidence = 1 rồi chặn 0,97 khi không có lỗi có giá (`apps/api/src/grading/decision/confidence.ts:52`, `decide.ts:207`).
- Nguồn của trạng thái hiển thị: `CertaintyHero.tsx:27`: `if (!input.hasPricedErrors || input.confidence === null) return 'unmeasured'`. Điều kiện `!hasPricedErrors` làm mọi bài không lỗi thành "chưa đo" dù backend đã có giá trị.
- Hệ quả: giảng viên thấy bài không lỗi như chưa được đo, nhưng bài vẫn được tự chốt. Hai thông điệp mâu thuẫn nhau.
- Hướng sửa (để chủ dự án quyết định): hiển thị confidence đã lưu khi không null, và chỉ dùng "Chưa đo được" khi backend thật sự không có giá trị.

---

## G. Chấm lại các màn chấm điểm sau khi seed lại

Chấm lại 48 ảnh (24 màn × 2 viewport) trên dữ liệu đã sửa. Điểm trung bình **6,06/10** (390px 5,83; desktop 6,29). Chi tiết: [grading-regrade.csv](grading-regrade.csv).

### Lỗi sản phẩm (xác nhận hoặc tái hiện trên dữ liệu mới)
- **L-12 · Banner "AI đang chấm" hiện cho bài đã có điểm.** Tái hiện: "đã 174 giờ" và "đã 384 giờ" trên bài đã có điểm và độ tin cậy (ảnh 14, 18, 38, 42).
- **L-25 · Bài không có lỗi hiện "Chưa đo được" dù confidence 0,97.** Tái hiện trên ảnh 33 (bài [MSSV]).
- **Lộ mã nội bộ cho giảng viên.** snake_case (`ten_bien_vo_nghia`, `dung_dan`, `sai_ca_bien`), `#tc1/#tc2`, "lời gọi công cụ", "bước 4 của spec chấm điểm", "chưa xây", "hàng đợi", "nạp đề", "lượt phản biện", "Mức 1 - chỉ có thang chấm". Xuất hiện ở hầu hết màn chi tiết.
- **Nút "Chốt điểm phiên" vẫn là CTA chính khi không còn gì để chốt** (ảnh 23, 45, 47), và vẫn bật khi còn 16 bài đang chấm (ảnh 24). Đã thấy trên ảnh, chưa đọc code của `SessionHeader`.
- **Bảng 390px cắt ngang không có cuộn** ở danh sách chấm điểm (ảnh 1, 22, 24).
- **Trạng thái rỗng của Xuất bảng điểm và Chốt điểm** chỉ có một dòng chữ, không tiêu đề (ảnh 2, 3, 26, 27).
- **Khối "Thang chấm & giải trình" trống khi AI đang chấm**, không có skeleton hay lời giải thích (ảnh 5, 29).

### Dữ liệu seed, không phải lỗi sản phẩm (đã ghi nhận, chưa sửa)
- **Phiên "Sắp xếp và tìm kiếm" chứa mã ngăn xếp.** Các bài trong phiên này đều là `stack.h` với `Node` và không có từ khoá sắp xếp (đã kiểm). Seed gán cùng một bộ fixture cho cả hai bài tập, nên AI "chấm 4/4 tiêu chí sắp xếp" là kết quả sai do dữ liệu, không phải do sản phẩm. Ảnh 24, 36, 41, 42, 43, 48. **Sửa được bằng cách thêm fixture mã sắp xếp cho phiên này.**
- **Bốn bài trong phiên Ngăn xếp có cùng điểm và cùng số đo (129/142/155 ms, 1840 ms).** Seed điều tra sinh lỗi theo từ khoá trong code, còn thời gian chạy test là hằng số (ảnh 6, 7, 10, 16, 33, 34, 40).
- **Bài "Đã chốt 9,0" với confidence 50%.** Seed chốt mọi kết quả điều tra bằng `system_confirm`, kể cả bài dưới ngưỡng (ảnh 29, 34). Trong sản phẩm, chỉ bài đạt ngưỡng mới tự chốt.
- **Phản biện "Đạt một phần" nhưng tiêu chí hiện Đạt 4/4** (ảnh 19, 43). Gợi ý của phản biện được seed ngẫu nhiên, không liên quan đến điểm.
- **Trích dẫn là dòng comment** ("// Bài 1: đảo chuỗi", "using namespace std;"). Seed chọn dòng ngẫu nhiên từ mã nguồn, không chọn dòng chứng minh tiêu chí.
- **Ảnh 8 và 9 trùng URL** (lỗi cấu hình chụp, không phải lỗi dữ liệu).

### Đã bác bỏ
- **"Rubric gắn nhầm đề"** trong các báo cáo lô A và B: phiên "Sắp xếp" dùng đúng rubric "Sắp xếp và tìm kiếm trên mảng" (40 kết quả). Lỗi nằm ở fixture như mô tả trên, không phải ở rubric.
- **"Số bài nộp mâu thuẫn"** (35/38, 40/44, 42/44): tử số = đã thu + không hợp lệ (ví dụ 33 + 2 = 35). Đây là cách đếm có chủ ý; câu hỏi còn lại là 4 bài không hợp lệ không có dòng nào trong danh sách, cần chủ dự án xác nhận có phải là thiết kế.
- **"Trùng code giữa 4 sinh viên Ngăn xếp"**: kiểm tra nội dung cho thấy 34/36 bài khác nhau. Trùng điểm là do seed điều tra (xem trên).

---

## H. Phiên "Sắp xếp và tìm kiếm" sau khi thêm fixture mã sắp xếp

**Đã làm:** seed bài nộp của phiên này bằng mã thật về sắp xếp chọn, bubble sort, tìm kiếm tuyến tính và nhị phân, kèm `sort.h`. Lượt đầu tiên cho phiên này dùng mã ngăn xếp (lỗi fixture, đã ghi ở mục G). Đã seed lại toàn bộ và chấm lại 12 ảnh (danh sách + 5 trạng thái kết quả, 2 viewport). Điểm trung bình **6,6/10** (390px 6,25; desktop 6,92).

**Đã khắc phục:** trích dẫn giờ là dòng thật của mã sắp xếp (ví dụ `binarySearch`, `// --- sort.h ---`). Trước đó trích dẫn là dòng của mã ngăn xếp.

**Chưa khắc phục ở seed (phát hiện khi chấm lại):**
- **Phân loại Đạt/Chưa đạt từng tiêu chí vẫn ngẫu nhiên, không đọc nội dung bài.** Bài dùng selectionSort + binarySearch đúng bị chấm "Đạt một phần" 2/4 với trích dẫn `#include <iostream>`. Bài tìm kiếm tuyến tính (không sắp xếp) được 0/4 với lý do rỗng. Chỉ 1/3 bài có kết quả có tiêu chí "Đạt" khớp bằng chứng. **Muốn kết quả đúng phải có bộ kiểm tra theo tiêu chí, việc này nằm ngoài phạm vi seed.**
- **Banner "Tệp nộp không chứa mã nguồn đọc được (tệp trống)" hiện trên bài [MSSV], dù khối Bài làm có đầy đủ mã.** Nguyên nhân: nhánh `ungradable` trong `05-grading.mjs` vẫn gán lý do "tệp trống" cho kết quả `flagged_for_review` mà không kiểm tra mã. Đây là lỗi seed, sửa bằng cách chỉ dùng lý do "tệp trống" khi zip thật sự không có mã. Chưa sửa.

**Lỗi sản phẩm xác nhận lại trên màn này:**
- **L-12 (banner "AI đang chấm" trên bài đã có điểm):** [MSSV] hiện "đã 384 giờ 42 phút" và đồng hồ vẫn chạy giữa hai ảnh.
- **Mâu thuẫn trạng thái trên danh sách:** "không còn ai chấm", "đang chạy ngay lúc này: 2 bài đang chấm", "tiến độ đứng yên 0 giây" hiện cùng lúc.
- **Số đếm không khớp dòng:** "42/44 bài nộp" nhưng 40 dòng; "Đã có kết quả 36" nhưng "38 trên 40"; "Đang chấm 2" trong tóm tắt và "Đang chấm · 16" trong chip.
- **Lộ mã nội bộ:** "lời gọi công cụ", "nạp đề", "lượt phản biện", "chưa đối chiếu", "hàng đợi", "Mức 1 - chỉ có thang chấm". Xuất hiện trên mọi trang chi tiết.
- **Bảng 390px cắt cột "Vì sao cần bạn" không có cuộn.**

---

## I. Sau khi sửa lỗi "tệp trống" của seed

**Đã sửa seed:** nhánh `ungradable` chỉ ghi lý do "tệp trống" khi zip thật sự không có mã nguồn. Kiểm tra DB: không còn lý do "tệp trống" nào sai. Hai kết quả bị gắn cờ có lý do lỗi của máy chấm.

**Chấm lại 12 ảnh** (danh sách + 5 trạng thái kết quả, 2 viewport). Điểm trung bình **6,2/10** (390px 6,0; desktop 6,3). Banner "tệp trống" đã biến mất ở mọi ảnh.

**Lỗi sản phẩm xác nhận lại:**
- **L-12:** banner "AI đang chấm" trên bài đã có điểm: 384 giờ 50 phút ([MSSV], cả hai viewport).
- **Số đếm và trạng thái mâu thuẫn trên danh sách:** "42/44 bài nộp" nhưng "Tất cả · 40"; "Đang chấm 2" trong thanh tiến độ, "Đang chấm · 16" trong tab, và ít nhất 13 dòng hiện "Đang chấm"; "2 bài không còn ai chấm" ngay trên "Đang chạy ngay lúc này: 2 bài".
- **Độ tin cậy hiển thị mà banner nói không có căn cứ:** "độ tin cậy 0,94" đi với "không có độ phủ hay bằng chứng lời gọi công cụ".
- **Trạng thái "Tự quyết" không hiện trên trang chi tiết**, nên giảng viên không biết bài đã tự chốt hay chưa.
- **Nút "0" được tô đậm mặc định ở mọi tiêu chí** của bài flagged, dễ lưu nhầm điểm 0.
- **Jargon** vẫn lộ ra: "hàng đợi", "bài treo", "lượt phản biện", "nạp đề", "lời gọi công cụ", "độ phủ", "chưa đối chiếu", "Mức 1 - chỉ có thang chấm".

**Lỗi seed còn lại:**
- **Trích dẫn không liên quan tiêu chí:** tiêu chí "Độ phức tạp" trích dòng comment (`// --- sort.h ---`, `// khai báo hàm sắp xếp...`), tiêu chí "đúng mọi bộ test" trích `#include <iostream>`. Seed chọn dòng ngẫu nhiên.
- **Phân loại Đạt/Chưa đạt vẫn ngẫu nhiên**, không đọc nội dung bài (đã ghi ở mục H).
- **Bài flagged có lý do "máy chấm không phản hồi" nhưng vẫn có điểm tạm và không có nút "Chấm lại bằng AI".** Có thể là đúng hoặc không; cần chủ dự án xác nhận.
