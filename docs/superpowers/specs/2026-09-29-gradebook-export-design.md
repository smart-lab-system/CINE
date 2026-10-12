# G5 — Ghi điểm vào sổ điểm của giảng viên

**Ngày:** 2026-09-29 · **Trạng thái:** chờ duyệt ở PLAN · **Nhánh:** `feat/grading-g5-gradebook` (worktree `grading-g5-gradebook`) · **Migration:** `1789530000000`

Đầu ra của hệ thống là điểm từng bài thi. Thứ giảng viên thật sự cần là **file sổ điểm của chính họ** (`.xlsx` do trường phát) được điền điểm, mọi ô khác giữ nguyên. Người dùng nói tính năng này **cần cho buổi demo với giảng viên**. Hôm nay chỉ có nút *Xuất CSV* dựng ở trình duyệt (`ExportCsvButton`, chỉ hiện sau khi chốt) và một khối viền đứt *"Ghi điểm vào sổ điểm — tính năng dự kiến"* mang nhãn *cần backend* trong `FinalizePanel.tsx`. Entity `GradeExportEntity` đã có từ migration đầu tiên nhưng **không có service, controller hay module**.

Luật ràng buộc: parent spec `2026-09-20-grading-agent-investigator-design.md` §13 (bảy luật + số học số nguyên) và §14.1 (`grade_export_row`); UI spec `2026-09-23-grading-ui-rebuild-design.md` §3.6 và §3.10; `CLAUDE.md` Security rule 5 (upload không qua NestJS) và rule 9 (không bao giờ đoán ánh xạ cột).

---

## 1. Vì sao phải làm ngay, và hai điều tôi phát hiện khi đọc code

**1.1 — Thư viện bảng tính KHÔNG có ở phía API.** `exceljs@4.4.0` chỉ được khai ở `apps/web` (đọc roster trong trình duyệt). `apps/api` có `yauzl` (đọc zip, `dependencies`) và `jszip@3.10.1` — nhưng `jszip` nằm ở **`devDependencies`** (dùng cho test docx), nên mã production không được import nó. Mọi phương án ghi `.xlsx` ở server đều cần đổi khai báo phụ thuộc; xem D1.

**1.2 — Cả bảy luật §13.1 đều phụ thuộc vào một điều mà spec chưa nói: bài của MỘT sinh viên có thể có nhiều dòng `grading_result`** (mỗi yêu cầu nộp một dòng: `uq_submission_identity` là `(phiên, yêu cầu nộp, MSSV)`). Sổ điểm có một ô cho một sinh viên. Cộng điểm các yêu cầu là quyết định nghiệp vụ mà hệ thống không được tự đưa ra — nên phiên có nhiều yêu cầu nộp thì giảng viên phải chỉ rõ ghi điểm của yêu cầu nào (D7).

---

## 2. Bảng Quyết định

| # | Quyết định | Chọn gì | Đã cân | Vì sao | Giá nếu sai |
|---|---|---|---|---|---|
| D1 | Thư viện ghi `.xlsx` | **`jszip` chuyển từ `devDependencies` sang `dependencies`** (cùng phiên bản `^3.10.1`, không gói mới) + **tự vá XML đúng các ô cần ghi**; đọc bằng bộ đọc XML nhỏ tự viết. **Không dùng `exceljs`** | (a) `exceljs` thêm vào `apps/api` — đọc rồi ghi lại TOÀN workbook; (b) tự viết trình ghi zip | Yêu cầu của spec là *"preserve all other data/formatting"*. Vá từng ô cho phép **chứng minh bằng test** rằng mọi phần khác của file (mọi entry zip khác — trừ `xl/workbook.xml`, xem D25 — và mọi ô khác) giống hệt từng byte. `exceljs` dựng lại toàn bộ workbook từ mô hình của nó; tôi **không chắc** liệt kê đủ được thứ nó làm rơi (README của nó tự nhận không hỗ trợ một số thứ như biểu đồ và pivot), và không có cách kiểm chứng "không rơi gì" trên file lạ của trường. (b) là rủi ro không cần thiết | ~300 dòng thao tác XML do mình chịu; file lạ (tiền tố namespace, ô không có địa chỉ) bị **từ chối kèm câu rõ** thay vì xử lý. Lockfile đổi đúng một chỗ: `jszip` chuyển section trong importer `apps/api` |
| D2 | Định dạng nhận | **Chỉ `.xlsx`** (không `.csv`, `.xls`, `.xlsm`) | Nhận cả `.csv` như UI spec §3.6 | CSV phải đoán dấu phân cách và bảng mã (Excel Việt Nam hay xuất Windows-1258 hoặc UTF-16) — hai việc đoán mà rule 9 tinh thần cấm; sổ điểm trường phát là `.xlsx`; ai có `.csv` mở bằng Excel lưu thành `.xlsx` mất vài giây. Câu lỗi nói đúng điều đó. `.xls` là BIFF/CFB, không phải zip; `.xlsm` mang macro | Giảng viên chỉ có `.csv` phải chuyển tay một lần. **Lệch khỏi UI spec §3.6 — đây là chỗ để phủ quyết** |
| D3 | Byte đi đường nào | Upload file mẫu bằng **URL ký sẵn** (rule 5). Server ĐỌC nó bằng `StorageService.getObject` (đã có; cùng lý do chấm điểm đọc bài nộp). File đầu ra do **server sinh** và được đưa lên storage bằng `PUT` tới URL ký sẵn do chính `generateUploadUrl` tạo — như helper test `putObject` | Thêm `StorageService.putObject` | Rule 5 cấm byte của **client** đi qua NestJS; file này do server dựng. Không thêm `putObject` vì G2 đang khôi phục chính hàm đó trong `storage.service.ts` — hai gói cùng thêm một hàm vào một file là xung đột chắc chắn | Một vòng HTTP nội bộ thừa; khi G2 đã vào, đổi sang `putObject` là một dòng |
| D4 | Chống zip bomb | File ≤ **5 MiB** (đo bằng `HeadObject`, không tin số client khai); mở bằng **`yauzl`** (mục lục trước, ≤ 500 entry, tổng kích thước giải nén khai ≤ 60 MiB, mỗi entry ≤ 20 MiB, stream có kiểm số byte); `jszip` **chỉ TẠO** zip đầu ra từ các buffer đã kiểm | Dùng `jszip.loadAsync` để đọc | `jszip.loadAsync` tin mục lục và phồng bộ nhớ trước khi có chỗ nào để đếm (chính lý do `archive-reader.ts` dùng `yauzl`). Ở đây file do giảng viên tự tải lên — nhưng tài khoản giảng viên là tài khoản, không phải chân lý | 5 MiB nén / 60 MiB giải nén từ chối một file thật quá lớn; câu lỗi nói con số |
| D5 | Ánh xạ cột | Mọi thứ là trường request **tường minh, không mặc định**: `sheetName`, `firstDataRow`, `mssvColumn`, `scoreColumn`, `reasonColumn` (tuỳ chọn, mặc định *không dùng*). Web không chọn sẵn cái nào, kể cả khi tiêu đề ghi "MSSV" | Tự nhận cột "MSSV"; tự nhận dòng tiêu đề | Rule 9 và §13.1 luật 1. `firstDataRow` là thêm so với spec: không có nó thì dòng tiêu đề và dòng tựa đề ("BẢNG ĐIỂM LỚP…") bị đếm vào *không khớp* | Thêm một lần bấm ở bước 2 |
| D6 | Khi nào được ghi | API: phiên có **ít nhất một bài đã chốt** (`finalized`/`exported`) trong phạm vi yêu cầu nộp chọn, nếu không → 409. **Từng sinh viên**: chỉ ghi nếu bài của họ `finalized`/`exported`; còn lại để trống kèm lý do. Web chỉ mở lối vào khi `allFinal` (đúng điều kiện `FinalizePanel` đang dùng) | API đòi `allFinal` | §3.10: *"ghi file trước khi chốt là đưa ra ngoài một con số chưa công bố"* — luật theo TỪNG SINH VIÊN bảo đảm điều đó dù phiên thế nào. Và §13.1 luật 5 nói tới bốn nghĩa của ô trống (vắng / chưa xong / không chấm được / đang gắn cờ): ba nghĩa sau chỉ có thể xảy ra nếu xuất không đòi `allFinal` (bài nộp muộn, bài chưa từng chấm). API lỏng hơn UI là chủ ý | Một bài nộp muộn sau chốt cho ra ô trống có lý do, không phải lỗi |
| D7 | Nhiều yêu cầu nộp | `deliverableId` **bắt buộc khi phiên có > 1 yêu cầu nộp**, phải thuộc phiên; cột điểm là của yêu cầu đó. Nền so sánh của lần xuất lại tách theo yêu cầu | Cộng điểm các yêu cầu; chặn hẳn | Cộng điểm là quyết định nghiệp vụ (rule 9 tinh thần). Sổ điểm nhiều cột (Câu 1, Câu 2) thành hai lượt xuất tự nhiên | Giảng viên muốn cột Tổng phải tự cộng trong Excel |
| D8 | Đọc điểm | `currentScore()` **quyết nguồn** (§14.2, một chỗ), rồi lấy **chuỗi `numeric` thô của đúng nguồn đó** → `parseHundredths` → số nguyên phần trăm. Không `parseFloat`, không `Number()` | Dùng `currentScore().value` (số thực) rồi nhân 100; dựng lại thứ tự ưu tiên riêng | Brief và §13.2: điểm là chuỗi, không bao giờ qua số thực. Dựng lại thứ tự ưu tiên là tự suy §14.2 — cấm. Chọn nguồn bằng chính hàm gốc thì đổi luật ưu tiên ở đó tự chảy sang đây | Câu SQL nạp đầu vào lặp `loadCurrentScore` (chỉ SQL, không lặp logic); một e2e khẳng định hai bên ra cùng điểm từng bài |
| D9 | Làm tròn | Bước **0,01 (không làm tròn) / 0,1 / 0,25 / 0,5**, nửa lên, số nguyên `⌊(2v + s) / 2s⌋ × s`; **không chọn sẵn**; ghi vào bản ghi lượt xuất (§13.1 luật 7) | Ba bước như spec, mặc định 0,1 | Thiếu "không làm tròn" thì giảng viên không làm tròn bị ép đổi điểm. Không chọn sẵn vì đây là chính sách của trường, và nó được ghi lại | Không chặn kết quả làm tròn vượt thang khi điểm tối đa không là bội của bước (vd. tối đa 3,3 với bước 0,5) — ghi ở §9 |
| D10 | Khớp MSSV | (1) `trim` + bỏ NBSP/zero-width, so **không phân biệt hoa/thường** (`citext` như cả hệ thống); (2) **ô SỐ** không khớp đúng thì thử bỏ số 0 đầu phía phiên — chỉ nhận khi **đúng một** MSSV khớp, và dòng đó mang ghi chú *"khớp sau khi bỏ số 0 đầu"*; nhiều hơn một → *không khớp, mơ hồ*; (3) ô chữ chỉ khớp đúng | Không xử lý số 0 đầu; luôn tự pad | Excel không giữ số 0 đầu ở ô số; bỏ qua thì một sinh viên có số 0 đầu không bao giờ khớp. Chỉ nhận khi duy nhất và luôn hiện ghi chú — không âm thầm đoán | Một MSSV thật bị báo *mơ hồ* thì giảng viên sửa ô thành chữ |
| D11 | MSSV trùng trong file | Preview hiện, **ghi bị chặn** (409): mọi dòng của MSSV trùng đều không ghi | Ghi dòng đầu; ghi tất cả | Ghi vào một trong hai là đoán | Giảng viên phải sửa file rồi tải lại |
| D12 | Ô công thức, ô gộp, trang tính bảo vệ | Ô điểm/lý do có **công thức** → bỏ qua dòng đó, báo *"ô có công thức"*. Ô là **ô gộp không phải ô chủ** → bỏ qua, báo. Trang tính **bảo vệ** (`sheetProtection sheet="1"`) → chặn cả lượt | Ghi đè công thức; bỏ qua bảo vệ | Ghi đè công thức phá dữ liệu của giảng viên và làm `calcChain` lệch (Excel đòi sửa file). Bảo vệ là ý chí của chủ file | Giảng viên bỏ bảo vệ / đổi cột rồi tải lại |
| D13 | Ô đã có giá trị | Đếm **số ô sẽ bị ghi đè** (điểm và lý do riêng); có ô nào thì write đòi `overwriteExisting: true` (409 nếu thiếu). **Chữ trùng đúng một trong bốn nhãn lý do do chính hệ thống ghi** không tính là giá trị | Luôn hỏi; không bao giờ hỏi | UI §3.6: *"chọn cột điểm đã có giá trị thì cảnh báo số ô sẽ bị ghi đè"*. Xuất lại lên file lần trước sẽ có đầy ô đã ghi — bốn nhãn của ta thì không cần hỏi | Nếu giảng viên tình cờ gõ đúng nhãn của ta vào ô đó, nó bị coi là của ta |
| D14 | Ô trống | Không ghi 0, không ghi chữ vào cột điểm (§13.1 luật 5). Cột lý do (nếu chọn) nhận một trong bốn nhãn tiếng Việt. **Bảng kê ô trống** tải xuống ở trình duyệt (CSV, chống công thức) từ dữ liệu xem trước | Route riêng trả bảng kê | Dữ liệu đã có trong phản hồi xem trước/ghi; thêm route là thêm việc phải giữ | Không tải lại được bảng kê của lượt cũ (chỉ số đếm) — ghi ở §8 |
| D15 | Xuất lại | Nền so sánh = **giá trị đã ghi cuối cùng** cho sinh viên đó trong các lượt trước của cùng phiên **và cùng yêu cầu nộp**, so **hai giá trị đã làm tròn** (luật 3). Tách **giảm** khỏi **tăng** (luật 4). Nguyên nhân từng dòng: luật (so hai `score_computation.breakdown` theo luật) · chấm tay · chỉ do đổi bước làm tròn · không rõ | So theo file; so số lẻ | Ta không có "file trước" đáng tin (nó nằm ngoài hệ thống); bản chụp `grade_export_row` mới là sự thật ta giữ. "Chỉ do đổi bước làm tròn" nhận ra bằng **bước làm tròn của lượt trước** (điểm thô hiện tại, làm tròn theo bước cũ, vẫn ra đúng giá trị đã ghi) — không bằng id lượt tính, vì bài chấm tay và tự luận không có lượt tính | Nguyên nhân *không rõ* khi hai lượt tính cùng luật nhưng khác rubric/trần; một thay đổi nhỏ có thật bị gọi là "làm tròn" khi bước mới mịn hơn và điểm cũ rơi cùng giá trị — chính là điều giảng viên nhìn thấy |
| D16 | Xác nhận điểm giảm | Có bài giảm → write đòi `confirmDecreases: true` (409 nếu thiếu). Người xác nhận ghi vào **cột** `decrease_confirmed_by` của lượt xuất (bất biến) **và** một dòng `audit_log` (`grade_export.score_decreased_confirmed`, mỗi bài giảm: MSSV, trước, sau, nguyên nhân) | Chỉ audit_log; chỉ cột | Cột trả lời "ai xác nhận lượt này" bằng một truy vấn; `audit_log` là cuốn sổ chung nơi người ghi đè một chốt chặn máy để lại dấu (khuôn `manual_score_after_finalize`) | Hai chỗ ghi cùng một sự thật; chấp nhận, vì ghi trong CÙNG transaction |
| D17 | Không bao giờ xoá ô điểm | Sinh viên từng được ghi điểm mà nay chưa xong → **giữ nguyên ô** (không ghi gì), báo riêng *"giữ N ô đã ghi lần trước"*. **Không có nút xoá.** Ngoại lệ duy nhất: xoá chữ lý do do chính hệ thống ghi trước đó khi sinh viên nay đã có điểm | Hỏi rồi xoá | §13.1 luật 6 nói *"giữ nguyên và hỏi riêng"*; không có đường xoá thì luật được giữ chặt nhất, giảng viên tự xoá trong file của họ. Chữ lý do cũ nằm cạnh điểm mới là mâu thuẫn — và nó chắc chắn là của ta | **Nhánh này hôm nay chỉ chạm tới nếu dữ liệu bị đưa ra ngoài máy trạng thái** (`finalized` không đi ngược) — giữ để không phụ thuộc vào điều đó; test dựng bằng `forceStatus`. Ghi ở §9 |
| D18 | Ghi có đổi trạng thái bài không | **Không.** Bài giữ `finalized`; `exported` không dùng | `finalized → exported` cho từng bài | Xuất lặp lại được và file nằm ngoài hệ thống; mọi nơi đọc coi `finalized` và `exported` như nhau (đã grep); N câu UPDATE cho mỗi lượt xuất là ghi thêm không đem gì | Trạng thái `exported` tiếp tục là giá trị chết trong enum |
| D19 | Tính nguyên tử | Một transaction có `lockTeacherScoring`: tính kế hoạch → so `expectedDigest` → dựng file → upload → INSERT `grade_export` + `grade_export_row` + `audit_log`. Upload xong mà INSERT hỏng → **xoá object** rồi ném lại | INSERT trước rồi upload | Không có dòng nào trỏ vào object không tồn tại; không có object mồ côi ngoài trường hợp `deleteObject` cũng hỏng (log) | Giữ khoá cố vấn vài trăm ms trong lúc upload |
| D20 | Xem trước và ghi phải cùng một kế hoạch | Preview trả `digest` (SHA-256 của kế hoạch chuẩn hoá); write **đòi** `expectedDigest`, khác → 409 *"Kết quả đổi kể từ lúc xem trước"* | Tin client | Nếu không, việc giảng viên *"đã xem N bài giảm và đồng ý"* không còn nghĩa: điểm có thể đã đổi giữa hai lần gọi (áp giá mới cho phiên đã chốt) | Ghi hai lần bấm nếu điểm đổi giữa chừng |
| D21 | Sinh viên có trong phiên mà không có dòng trong file | Báo trong xem trước (`notInFile`), **không thêm dòng** vào file của giảng viên | Tự thêm | Thêm dòng vào bảng của trường là ghi ngoài phạm vi ô đã chọn | Giảng viên tự thêm dòng rồi xuất lại |
| D22 | File lạ | `namespace` có tiền tố, ô/dòng không có địa chỉ `r`, cột vượt 60 (BH), dòng vượt 5000, `.xlsx` mã hoá hay hỏng → **từ chối kèm câu nói đúng lý do** | Cố xử lý | Ghi sai vào một file ta không hiểu tệ hơn không ghi | Một số file hiếm bị từ chối |
| D23 | Bất biến | `grade_export` và `grade_export_row` **chỉ-thêm** (`guard_append_only`). Sai thì xuất lượt mới | Cho sửa | Lượt xuất là hồ sơ: *"một con số đã xuất phải giải thích lại được"* (§13.1 luật 7) | — |
| D24 | Tái dùng `csvField` | Thêm `export` cho `csvField` trong `lib/grading-export.ts` (một từ) và dùng lại | Sao chép hàm chống công thức | Hàm bảo mật không nên có hai bản; `S` không sửa file này | — |
| D25 | Công thức phụ thuộc ô ta ghi | Ghi `fullCalcOnLoad="1"` vào `<calcPr>` của `xl/workbook.xml` (tạo nếu chưa có, đúng thứ tự phần tử schema) khi có ô được sửa. Đây là **thay đổi duy nhất** ngoài trang tính đích | Không làm gì; xoá giá trị đệm `<v>` của mọi ô công thức | Sổ điểm thật hay có cột *Tổng kết* = công thức trên cột ta vừa ghi. Ta chỉ vá ô điểm nên giá trị đệm của công thức đó cũ cho tới khi ai đó tính lại — giảng viên sẽ thấy Tổng kết sai. `fullCalcOnLoad` bảo Excel tính lại khi mở. Xoá `<v>` của mọi công thức là sửa nhiều hơn nhiều | Excel sẽ hỏi *"Lưu thay đổi?"* khi đóng file (nó coi file là đã đổi khi tính lại). Tôi **không chắc** LibreOffice tôn trọng cờ này (mặc định của nó là không tính lại file Excel) — ghi ở §9 |

---

## 3. Đã kiểm trên code

| Cần biết | Ở đâu | Kết luận |
|---|---|---|
| Entity có sẵn | `grading/entities/grade-export.entity.ts` | `exam_session_id`, `exported_by`, `template_storage_key`, `output_storage_key` (null), `mssv_column`, `score_column` (`varchar(20)`), `unmatched_mssv_count` (mặc định 0), `exported_at` (null); kế thừa `BaseEntity` (id, created_at, updated_at) |
| Bảng thật | `1787766223206-InitialSchema.ts:52` | cột đúng như entity; FK `RESTRICT` tới phiên và tài khoản; trigger `set_updated_at` (`:274`) |
| Không ai dùng | `grep grade_export apps/api/src` | chỉ migration, `verify-schema.ts:17`, entity — **không service/controller/module** |
| `guard_append_only` | `1789440000000-ErrorRulesAndPrices.ts:17-23` | hàm dùng chung; gắn bằng `CREATE TRIGGER … BEFORE UPDATE OR DELETE … EXECUTE FUNCTION examcollect.guard_append_only()` |
| `finalized → exported` hợp lệ nhưng không ai đi | `grading-transitions.ts:31`; `grep "'exported'"` | mọi nơi đọc coi `finalized`/`exported` như nhau (`score-inputs.ts:172`, `result-detail.ts:118`, `price.service.ts:85`, `score.service.ts:396`) |
| Chốt điểm | `teacher-review.service.ts:222-335` | atomic cả phiên; `finalized_by`, `finalized_at`; bài đường điều tra ghi `finalized_computation_id`; `pinned_price_version_id` ghim lúc chốt |
| Áp giá mới đổi điểm đã chốt | `score.service.ts:352-383` | chèn `score_computation` `finalized_reapply`, **cập nhật `finalized_computation_id`**, ghi `audit_log` — nên điểm đã chốt đổi được sau xuất, và đó là ca xuất lại |
| Nguồn điểm hiện tại | `scoring/current-score.ts:24-34`; `score-inputs.ts:147-176` | `currentScore()` trả `{ value: number, source }`; `loadCurrentScore` là câu SQL nạp đầu vào |
| Số học phần trăm | `scoring/hundredths.ts` | `parseHundredths` (regex `^\d{1,4}(\.\d{1,2})?$`), `formatHundredths` — không `parseFloat` |
| Diff luật giữa hai lượt tính | `score.service.ts:60-77` (`changedRules`, **private**, không export) | dùng làm khuôn; G5 viết `diffRules` riêng (không sửa file của G4) |
| Danh sách sinh viên phải có mặt | `exam-session/entities/session-roster.entity.ts` | `session_roster` chụp cứng lúc mở phiên; comment nói thẳng nó có để **"xuất bảng điểm"**; `student_mssv citext`, `ck_session_roster_mssv ~ '^[A-Za-z0-9]{4,20}$'` |
| Bài nộp | `SubmissionEntity`, `uq_submission_identity` | `(exam_session_id, required_deliverable_id, student_mssv)` — mỗi yêu cầu nộp một bài (§1.2) |
| Khuôn upload ký sẵn | `exam-material.service.ts:60-113`; `storage.service.ts:220-231, 243-257, 271-287` | mint id + khoá ở server, rebuild khoá từ id chứ không tin body, `objectExists`, `getObjectSize` (HEAD) |
| Rule 5 và `putObject` | `storage.service.ts:21-31` | comment nói không có phương thức đọc/ghi byte — nhưng `getObject` đã có (`:116`); `putObject` bị gỡ ở `4e06f00` và G2 khôi phục |
| Presigned PUT từ server | `test/helpers/code-session-seed.ts:8-13` | `generateUploadUrl` + `fetch(uploadUrl, { method: 'PUT', body })` đã chạy trong e2e |
| Khoá khoá cố vấn | `scoring/score-inputs.ts:17-19` | `lockTeacherScoring(m, teacherId)` |
| Ghi `audit_log` trong transaction | `admin/audit-log.service.ts`; `review/error-exception.service.ts:108-119` | `recordUserAction({...}, manager)`; hành động dạng `grading_result.manual_score_after_finalize` |
| Chủ sở hữu phiên | `exam-session.service.ts:676-693` | `findEntityForOwner` → 404 / 403 |
| Đăng ký module/entity | `app.module.ts:75-83`; `data-source.ts` (mảng `entities`); `exam-session.module.ts:91`, `admin.module.ts:14`, `storage.module.ts:11` | ba module đều `exports` đúng thứ cần |
| Phụ thuộc | `apps/api/package.json` | `yauzl ^3.4.0` (`dependencies`), `jszip ^3.10.1` (**`devDependencies`**), `@types/yauzl`; không có parser XML/bảng tính; `apps/web`: `exceljs ^4.4.0` |
| Mẫu yauzl an toàn | `submission/archive-check/archive-reader.ts:88-125` | `fromBuffer(buf, { lazyEntries: true })`, trần số entry, `readEntry()` từng mục |
| Web đọc workbook | `apps/web/src/lib/read-workbook.ts` | trần 5 MB / 2000 dòng / 40 cột — cùng con số ta dùng phía server (5 MiB) |
| CSV chống công thức | `apps/web/src/lib/grading-export.ts:14-25` | `FORMULA_LEADING = /^[=+\-@\t\r]/` + tiền tố `'`; `csvField` **chưa export** |
| Khối viền đứt | `FinalizePanel.tsx:100-112` | `<section aria-label="Ghi điểm vào sổ điểm">` mang `NeedsBackend`; `FinalizePanel.test.tsx:149-155` khẳng định chính nó |
| Format số VN | `apps/web/src/lib/format.ts` | `formatVnHundredths(hundredths)` đã có |
| Trang chốt điểm | `app/teacher/grading/finalize/page.tsx` | khuôn trang: `Suspense` + `useSearchParams` + `useSessionOverview` |

**Test có sẵn bị ảnh hưởng — đã đọc, plan xử lý từng cái:**

| Test | Vì sao | Xử lý |
|---|---|---|
| `FinalizePanel.test.tsx:149-155` | khẳng định khối sổ điểm là placeholder *cần backend* không có nút | **thay** bằng "có liên kết thật tới `/teacher/grading/export?sessionId=s1`, không nhãn"; giữ nguyên `Xuất CSV` |
| `FinalizePanel.test.tsx:128-132` — *"does not offer the score export or the reapply panel before the session is finalised"* | khẳng định hai thứ vắng mặt trước khi chốt | **giữ**, thêm một khẳng định: khối sổ điểm cũng vắng (§3.10: lối vào chỉ mở sau khi chốt) |
| `FinalizePanel.test.tsx:9` (mock `@/hooks/useGrading`) | không đổi | — |

---

## 4. Thiết kế backend

### 4.1 Dữ liệu — migration `1789530000000-GradeExportRows`

`grade_export` (đã có, chưa từng có dòng) **thêm cột**:

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `sheet_name` | `varchar(31)` null | Excel giới hạn tên trang tính 31 ký tự |
| `first_data_row` | `int` null | |
| `reason_column` | `varchar(20)` null | |
| `required_deliverable_id` | `uuid` null → `required_deliverable` `RESTRICT` | null khi phiên chỉ có một yêu cầu nộp |
| `rounding_step_hundredths` | `int` NOT NULL default `1` | `CHECK IN (1, 10, 25, 50)` |
| `rounding_mode` | `text` NOT NULL default `'half_up'` | §13.1 luật 7 |
| `written_count`, `blank_count`, `overwrite_count`, `decrease_count` | `int` NOT NULL default `0` | |
| `decrease_confirmed_by` | `uuid` null → `account` `RESTRICT` | người xác nhận (luật 4) |
| `template_file_name`, `output_file_name` | `varchar(255)` null | tên hiển thị/tải về |

Bảng mới `grade_export_row`:

| Cột | Kiểu | Ràng buộc |
|---|---|---|
| `id` | `uuid` PK | `uuid_generate_v4()` |
| `grade_export_id` | `uuid` NOT NULL → `grade_export` `RESTRICT` | |
| `file_row` | `int` NOT NULL | `CHECK (file_row >= 1)` |
| `mssv` | `citext` NOT NULL | MSSV **của phiên** (không phải chữ trong file) |
| `written_hundredths` | `int` null | `CHECK (written_hundredths IS NULL OR written_hundredths >= 0)` |
| `blank_reason` | enum `grade_export_blank_reason` (`absent`, `not_finished`, `ungradable`, `flagged`) null | |
| `score_computation_id` | `uuid` null → `score_computation` `RESTRICT` | lượt tính nguồn của điểm đã ghi |
| | | `CONSTRAINT ck_grade_export_row_one_of CHECK ((written_hundredths IS NULL) <> (blank_reason IS NULL))` — một dòng hoặc ghi điểm hoặc trống có lý do |
| | | `UNIQUE (grade_export_id, mssv)` |

Cả hai bảng gắn `trg_*_append_only` (D23). `verify-schema.ts` thêm `'grade_export_row'`. Entity mới `GradeExportRowEntity`; `GradeExportEntity` thêm các cột trên.

### 4.2 Lớp `.xlsx` — `apps/api/src/grade-export/xlsx/`

* **`zip-io.ts`** — `readZipEntries(buffer, limits) → Promise<ZipEntry[]>` (yauzl, `lazyEntries`, kiểm mục lục và từng stream, giữ **thứ tự**, tên, ngày sửa, thư mục); `writeZip(entries) → Promise<Buffer>` (jszip, `DEFLATE`, giữ thứ tự và ngày). Lỗi tiếng Việt có kiểu: `NotZipError`, `EncryptedOrLegacyError` (magic `D0 CF 11 E0`), `ZipLimitError`, `CorruptZipError`.
* **`xml-text.ts`** — `decodeXml`/`encodeXml` (5 thực thể + `&#N;`/`&#xH;` + `_xHHHH_`), `colToIndex`/`indexToCol`, `parseRef`.
* **`workbook-reader.ts`** — `openWorkbook(entries)` kiểm `[Content_Types].xml` (đúng loại `sheet.main+xml`, không `macroEnabled`), đọc `xl/workbook.xml` + `xl/_rels/workbook.xml.rels` + `xl/sharedStrings.xml`; `readSheet(wb, name) → SheetRead = { name, path, protected, rowCount, columnCount, cells: Map<ref, CellRead>, merges: MergeRange[] }` (đọc cả trang tính một lần, có trần số ô; phân trang lưới xem trước làm ở `inspect-grid.ts`, không ở bộ đọc). `CellRead = { ref, text, kind: 'empty'|'text'|'number'|'other', hasFormula }`. Chỉ nhận SpreadsheetML **không tiền tố** (D22).
* **`sheet-patch.ts`** — `patchSheet(sheetXml, edits) → string`. `edit = { ref, kind: 'number', hundredths } | { ref, kind: 'text', text } | { ref, kind: 'clear' }`. Ô có sẵn: giữ mọi thuộc tính trừ `t`, thay ruột. Ô/dòng thiếu: chèn **đúng thứ tự cột/dòng**. Dòng tự đóng `<row …/>` được mở ra. `<dimension>` được nới nếu cần. **Ném lỗi** khi đích là ô có `<f>` hoặc dòng nào đó không có `r`. Số ghi bằng số nguyên → chuỗi (`7`, `7.5`, `7.25`), chữ ghi `t="inlineStr"` với `xml:space="preserve"` — không đụng `sharedStrings.xml`.

Bất biến được test: **mọi entry zip khác trang tính đích và `xl/workbook.xml` giống hệt byte; `xl/workbook.xml` chỉ khác ở thuộc tính `fullCalcOnLoad` (D25); trang tính đích khác bản gốc CHỈ ở các ô đã sửa** (so sau khi cắt các ô đó ra).

### 4.3 Miền — thuần, không DB

* **`rounding.ts`** — `roundHalfUp(hundredths, step)`; `ROUNDING_STEPS = [1, 10, 25, 50]`.
* **`blank-reason.ts`** — `BLANK_LABELS` (bốn nhãn tiếng Việt), `blankReasonOf({ hasSubmission, resultStatus, ungradableClass })`, `isOwnLabel(text)`.
* **`mssv-match.ts`** — `normalizeMssv`, `buildMssvIndex(students)`, `matchMssv(cell, index) → { student, note } | { unmatched: 'not_found' | 'ambiguous' }` theo D10.
* **`diff-rules.ts`** — `diffRules(before, after)` (mức trừ hiệu lực = `counted` ? `deductionHundredths` : 0), `attribute({ direction, currentSource, previousWritten, previousStep, currentRaw, previousBreakdown, currentBreakdown, ruleNames }) → Cause[]` — `rounding` khi điểm thô hiện tại làm tròn theo **bước của lượt trước** vẫn ra đúng giá trị đã ghi; rồi `manual_score` / `review` theo nguồn; rồi các luật đổi mức trừ; không so được thì `unknown` (D15). `summarizeChanges(rows, previousExports)` gộp thành `ChangesSummary`.
* **`plan.ts`** — `buildPlan(input) → ExportPlan` (hàng, tóm tắt, ghi đè, thay đổi so với lần trước, `blockers`, `digest`).

### 4.4 Nạp dữ liệu — `grade-export.data.ts`

Ba câu SQL, đều theo phiên: (a) **sinh viên** = `session_roster` ∪ `submission` trong phạm vi (tên ưu tiên roster); (b) **điểm và trạng thái từng bài** — mọi cột `CurrentScoreInput` như `loadCurrentScore` + `status`, `ungradable_class`, `finalized_computation_id`; (c) **nền so sánh** (`DISTINCT ON (mssv)` các dòng `written_hundredths IS NOT NULL` của các lượt trước cùng phiên và cùng `required_deliverable_id IS NOT DISTINCT FROM`). Điểm của một bài: `pickScoreString(input)` = `currentScore(input)` quyết `source`, trả chuỗi thô tương ứng.

### 4.5 Route — controller mới `grade-export.controller.ts`, mọi route `@Roles('teacher')`, chủ sở hữu qua `findEntityForOwner`

| Route | Body | Thành công | Lỗi chính |
|---|---|---|---|
| `POST /exam-sessions/:id/grade-exports/template-upload` | `{ fileName, fileSize }` | 201 `{ templateId, storageKey, uploadUrl, expiresIn }` | 400 sai đuôi / quá lớn |
| `POST /exam-sessions/:id/grade-exports/inspect` | `{ templateId, sheetName?, fromRow? }` | 200 `{ templateId, fileSizeBytes, sheets[], deliverables[], sheet }` | 400 chưa thấy file / không đọc được / quá lớn; 404 khi `templateId` không thuộc phiên (khoá dựng từ id nên trỏ vào object khác → *chưa thấy file*) |
| `POST /exam-sessions/:id/grade-exports/preview` | `PlanDto` | 200 kế hoạch (§4.6) | 400 cột trùng / thiếu `deliverableId` / MSSV cột sai; 409 phiên chưa chốt |
| `POST /exam-sessions/:id/grade-exports` | `PlanDto + { expectedDigest, templateFileName, overwriteExisting?, confirmDecreases? }` | 201 `{ exportId, downloadUrl, fileName, summary, blank[] }` | 409 các trường hợp D11/D12/D13/D16/D20 |
| `GET /exam-sessions/:id/grade-exports` | — | 200 danh sách lượt (mới nhất trước) | |
| `GET /grade-exports/:id/download` | — | 200 `{ downloadUrl, fileName }` | 404, 403 khi không phải chủ phiên |

`PlanDto = { templateId: uuid, sheetName (1..31), firstDataRow (1..5000), mssvColumn, scoreColumn, reasonColumn?, deliverableId?: uuid, roundingStepHundredths: 1|10|25|50 }`, cột khớp `^[A-Z]{1,3}$` và ≤ `BH`.

### 4.6 Kế hoạch (`preview`)

`{ digest, deliverableId, summary { write, blank, kept, unmatched, duplicates, skipped, ignoredEmpty, notInFile }, overwrite { score, reason }, changes: null | ChangesSummary, blockers: string[], canWrite, rows: PlanRowView[], notInFile: [...] }`. `ChangesSummary = { previousExports, up, down, same, new, downByCause[], upByCause[] }` với `CauseTally = { kind: 'rule'|'manual_score'|'review'|'rounding'|'unknown', ruleKey, ruleName, students }` — một sinh viên có thể góp vào nhiều nguyên nhân; "thủ công", "phúc khảo", "làm tròn", "không rõ" là nhóm riêng, không rải vào luật. `PlanRowView = { row, mssvInFile, studentMssv, studentName, action, systemScore, writtenScore, blankReason, previousScore, direction, causes, note }` với `action ∈ write | blank | kept | unmatched | duplicate | skipped_formula | skipped_merged`. Điểm hiển thị là **chuỗi** (`"7.25"`), web định dạng bằng `formatVnHundredths`.

Thứ tự kiểm ở write: quyền → cổng D6 → `blockers` → `expectedDigest` → `overwriteExisting` → `confirmDecreases`. Mỗi 409 mang câu tiếng Việt nói đúng điều cần làm.

### 4.7 Câu lỗi tiếng Việt (chốt ở đây để test khẳng định nguyên văn)

| Tình huống | Câu |
|---|---|
| Sai đuôi | `Chỉ nhận file .xlsx. Nếu sổ điểm của bạn là .csv hoặc .xls, hãy mở bằng Excel rồi lưu lại thành .xlsx.` |
| Quá 5 MiB | `File quá lớn (giới hạn 5 MB).` |
| Chưa thấy file | `Chưa thấy file trên kho lưu trữ — hãy tải lên trước.` |
| Có mật khẩu / .xls | `File có mật khẩu hoặc là định dạng .xls cũ. Hãy bỏ mật khẩu, mở bằng Excel và lưu lại thành .xlsx.` |
| Không phải zip | `Đây không phải file .xlsx.` |
| Hỏng | `File .xlsx bị hỏng hoặc không đọc được.` |
| Macro | `File có macro (.xlsm) — hãy lưu lại thành .xlsx thường.` |
| Namespace lạ / ô không địa chỉ | `Cấu trúc file không được hỗ trợ ({chi tiết}). Hãy mở bằng Excel và lưu lại thành .xlsx.` |
| Trang tính bảo vệ | `Trang tính đang được bảo vệ. Hãy bỏ bảo vệ trong Excel rồi tải lại.` |
| Phiên chưa chốt | `Phiên chưa chốt điểm — chốt điểm trước rồi mới ghi vào sổ điểm.` |
| Nhiều yêu cầu nộp | `Phiên có {n} yêu cầu nộp — hãy chọn ghi điểm của yêu cầu nào.` |
| Cột trùng | `Cột MSSV, cột điểm và cột lý do phải là ba cột khác nhau.` |
| MSSV trùng | `{n} MSSV xuất hiện nhiều lần trong file ({vd}). Hãy sửa file rồi tải lại — hệ thống không đoán ghi vào dòng nào.` |
| Ghi đè | `{n} ô đã có giá trị và sẽ bị ghi đè — hãy xác nhận ghi đè.` |
| Điểm giảm | `{n} bài bị giảm điểm so với lần ghi trước — hãy xem và xác nhận trước khi ghi.` |
| Digest lệch | `Kết quả chấm đã đổi kể từ lúc xem trước — hãy xem trước lại.` |

---

## 5. Thiết kế web

Route mới `apps/web/src/app/teacher/grading/export/page.tsx` (`/teacher/grading/export?sessionId=`), khuôn `finalize/page.tsx`. Component ở `export/_components/`; API và hook ở file **mới** `lib/api/grade-export.ts`, `hooks/useGradeExport.ts`; hàm thuần ở `lib/grade-export-view.ts`.

**Ba bước (trạng thái giữ ở `ExportWizard`):**

1. **`StepUpload`** — chọn file `.xlsx` (kiểm đuôi và 5 MB ở client để báo sớm; server vẫn kiểm), `template-upload` → `PUT` thẳng lên storage → `inspect`. Lỗi máy chủ nguyên văn trong `Alert` destructive.
2. **`StepColumns`** — chọn trang tính (nếu > 1), lưới 40 dòng × cột với **tiêu đề cột A, B, C…**, ba ô chọn (**Cột MSSV**, **Cột điểm**, **Cột lý do ô trống — không dùng**), ô *Dữ liệu bắt đầu từ dòng số*, và (khi phiên > 1 yêu cầu nộp) *Ghi điểm của yêu cầu*. **Không cái nào chọn sẵn.** Cột đã chọn được tô màu **và** gắn nhãn chữ trên tiêu đề cột (*MSSV* / *Điểm* / *Lý do*). Cảnh báo ghi đè ở bước này chỉ từ phần lưới đang hiện và nói rõ *"trong phần xem trước"*; số thật ở bước 3. Nút *Xem trước* chỉ mở khi đủ trường bắt buộc.
3. **`StepPreview`** — gọi `preview`, hiện: ba con số lớn (**Sẽ ghi · Để trống · Không khớp**) + các con số phụ (trùng, bỏ qua, giữ, chưa có dòng trong file); chọn **làm tròn** (bốn lựa chọn, không chọn sẵn, nhãn *"nửa lên — được ghi vào bản ghi lượt xuất"*); khối **xuất lại** khi `changes` khác null (dải *"↓ N bài giảm · ↑ M bài tăng"* kèm luật, mỗi dòng đổi ghi mũi tên **và** chữ); hộp *"Tôi đã xem N bài bị giảm điểm và đồng ý ghi"* (chỉ hiện khi có giảm) và *"Tôi đồng ý ghi đè N ô đã có giá trị"* (chỉ hiện khi có); nút **Tải bảng kê ô trống** (CSV); bảng từng dòng lọc được; nút **Ghi vào file** khoá tới khi mọi điều kiện thoả. Thành công → thẻ kết quả có **Tải file** và tóm tắt.

`PreviousExports` (dưới cùng, cả ba bước): danh sách lượt xuất của phiên — giờ, người, trang tính, cột, làm tròn, số ghi/trống/không khớp, người xác nhận giảm, nút *Tải file*.

`FinalizePanel.tsx`: thay **chỉ** khối viền đứt bằng một khối thật có liên kết *Ghi điểm vào sổ điểm* tới route mới; giữ nút *Xuất CSV*. G4 sửa nhóm kiểm mẫu của cùng file — hai vùng khác nhau.

---

## 6. Tương tác với các gói khác

| Gói | Chạm chung | Quan hệ |
|---|---|---|
| G4 | `FinalizePanel.tsx` | G4 sửa `groups` và một dòng `needsBackend`; G5 thay khối sổ điểm (`:100-112`). **Cả hai đều giữ import `NeedsBackend`** (trên nhánh của mỗi bên nó còn được dùng); **sau khi cả hai vào, người ghép gỡ import** — eslint sẽ báo |
| G2 | `storage.service.ts` | G2 khôi phục `putObject`; G5 **không** sửa file này (D3) |
| G2, G3, G4 | `packages/shared/src/api/schema.d.ts` | mỗi gói sinh lại; xung đột thì sinh lại |
| G3 | — | không chung file |
| S | `data-source.ts`, `app.module.ts` | thêm entity và một dòng module — cộng thêm |

File của riêng G5: `apps/api/src/grade-export/**`, migration `1789530000000`, `test/grade-export*.e2e-spec.ts`, `test/helpers/xlsx-fixture.ts`, `lib/api/grade-export.ts`, `hooks/useGradeExport.ts`, `lib/grade-export-view.ts`, `app/teacher/grading/export/**`.

---

## 7. Các test sẽ viết

| Mã | Loại | Tệp | Nội dung |
|---|---|---|---|
| — | unit | `xlsx/zip-io.spec.ts` | đọc/ghi giữ thứ tự và byte; magic `.xls`; không phải zip; hỏng; quá nhiều entry; quá kích thước khai; thư mục |
| — | unit | `xlsx/workbook-reader.spec.ts` | chuỗi chia sẻ, chuỗi nội tuyến, số, công thức (đọc kết quả), ô gộp, trang tính ẩn, bảo vệ, rich text, `rPh`, thực thể, `xml:space`; từ chối tiền tố/ô không địa chỉ/macro |
| — | unit | `xlsx/sheet-patch.spec.ts` | ghi vào ô có sẵn (giữ `s`), ô thiếu, dòng thiếu, dòng tự đóng, thứ tự cột và dòng, `dimension`; từ chối ô công thức; **mọi entry khác giống byte, trang tính chỉ khác ở ô đã sửa**; ghi chữ có `<`, `&`, `=`, dấu tiếng Việt |
| — | unit | `score-string.spec.ts`, `rounding.spec.ts`, `blank-reason.spec.ts`, `mssv-match.spec.ts`, `diff-rules.spec.ts`, `plan.spec.ts` | mọi nhánh D9–D17, gồm `10 − 0,1 − 0,2`, `2,675`, 7,10 và 7,20 ở bước 0,5, 7,24 → 7,26; nguyên nhân `rounding` cho cả bài chấm tay (không có lượt tính) |
| — | unit | `grade-export.errors.spec.ts`, `grade-export.names.spec.ts`, `inspect-grid.spec.ts` | câu lỗi nguyên văn §4.7 cho từng lớp lỗi; tên file đầu ra; lưới xem trước (cắt dòng/cột, ô gộp, cột có nhãn) |
| — | e2e | `grade-export-schema.e2e-spec.ts` | bảng `grade_export_row` (append-only, CHECK, khoá ngoại), cột `decrease_confirmed_by` |
| — | e2e | `grade-export-data.e2e-spec.ts` | `deliverables`, `loadStudents` (roster ∪ bài nộp), `previousWrites` (kèm bước làm tròn), điểm từng bài khớp `loadCurrentScore` |
| — | e2e | `grade-export-inspect.e2e-spec.ts` | template-upload → PUT → inspect qua HTTP thật (MinIO); 403 phiên người khác; template phiên khác → *chưa thấy file*; quá lớn; sai đuôi; hỏng; `.xls` |
| — | e2e | `grade-export-preview.e2e-spec.ts` | phiên chưa chốt 409; ba con số; blank ở cả bốn nghĩa; MSSV trùng; ô công thức; ghi đè; nhiều yêu cầu nộp; điểm khớp `loadCurrentScore` từng bài |
| — | e2e | `grade-export.e2e-spec.ts` | ghi đầy đủ, đọc lại file đầu ra; mọi phần khác giống byte; digest; ghi đè; xuất lại giảm/tăng/xác nhận; giữ ô; xoá nhãn cũ; `audit_log`; dọn object khi INSERT hỏng |
| — | e2e | `grade-export-list.e2e-spec.ts` | danh sách lượt (mới nhất trước, chỉ của chủ phiên); tải về (403 người khác, 404) |
| — | vitest | `grade-export-view.test.ts`, `StepUpload/StepColumns/StepPreview/PreviousExports/ExportWizard.test.tsx`, `FinalizePanel.test.tsx`, `export/page.test.tsx` | xem plan |

---

## 8. Ngoài phạm vi

Gộp nhiều file hay nhiều trang tính; `.csv`/`.xls`/`.xlsm` (D2); tích hợp LMS của trường; xuất PDF; sửa điểm từ màn xuất; gửi file qua email; xuất điểm theo từng tiêu chí; **tải lại bảng kê ô trống của lượt cũ** (chỉ có ở lúc xem trước và lúc ghi); cộng điểm nhiều yêu cầu nộp (D7); nút xoá ô (D17); việc của G2/G3/G4.

---

## 9. Giới hạn đã biết và chỗ chưa kiểm chứng

**Giới hạn chấp nhận:**
1. Làm tròn có thể vượt điểm tối đa khi tối đa không là bội của bước (D9).
2. Nhánh *giữ ô đã ghi* (D17) hôm nay chỉ chạm tới nếu trạng thái bài bị ép ngoài máy trạng thái.
3. Bộ đọc XML tự viết **không hỗ trợ** SpreadsheetML có tiền tố namespace, ô không có `r`, hoặc trang tính rộng hơn 60 cột / dài hơn 5000 dòng (D22) — từ chối có câu rõ.
4. Khớp MSSV chỉ biết văn bản **đã lưu** trong ô: định dạng hiển thị (ví dụ `0000000`) không được tính, nên ô số mất số 0 đầu mới cần luật D10.
5. Ngày ghi nhận của entry zip đầu ra giữ theo file gốc; `jszip` nén lại mọi entry (nội dung giống, kích thước nén có thể khác).

**Chưa kiểm chứng (nói thẳng):**
* **Chưa mở file đầu ra bằng Excel thật.** Mọi bảo đảm về "không hỏng" đến từ việc đọc lại bằng chính bộ đọc của ta và so từng phần; một lượt mở tay bằng Excel và LibreOffice trên file mẫu của trường là bước đầu tiên của lượt review chung.
* **`fullCalcOnLoad` (D25):** chưa thử Excel hay LibreOffice thật có tính lại cột *Tổng kết* khi mở hay không. Excel: tôi tin là có nhưng chưa kiểm. LibreOffice: tôi **không chắc**.
* Chưa chạy bất cứ test nào (Docker Desktop tắt); chưa quan sát MinIO chấp nhận `PUT` tới URL ký kèm header `Content-Length` do `fetch` tự đặt — helper test hiện có làm y như vậy nên khả năng cao ổn.
* `pnpm install --lockfile-only` sau khi chuyển `jszip` sang `dependencies`: chưa chạy; plan yêu cầu kiểm `git diff pnpm-lock.yaml` chỉ thay đổi đúng một chỗ.
* Chưa xác nhận chữ ký `JSZip.file(name, data, { date })` và kiểu `Entry.getLastModDate()` của `@types/yauzl@3.4.0` bằng trình biên dịch — plan có bước `tsc` ngay sau bước tạo file.
