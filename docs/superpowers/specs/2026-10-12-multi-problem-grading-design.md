# Chấm điểm nhiều câu — thiết kế

**Ngày:** 2026-10-12 · **Trạng thái:** bản nháp chờ chủ đồ án duyệt · **Nhánh:** `feat/multi-problem-grading` (rẽ từ `main` @ `dc2d022`)

**Liên quan:** `2026-09-20-grading-agent-investigator-design.md` (spec lõi — §2.1 dựng thước, §8.1 kiểm mẫu, §14 mô hình dữ liệu) · `2026-09-21-archive-content-validation-design.md` (kiểm nội dung file nén) · `2026-09-29-gradebook-export-design.md` (ghi sổ điểm, D7) · `2026-09-29-ruler-from-authoring-design.md` · `2026-10-07-rules-by-rubric-design.md` (Bảng lỗi theo rubric) · `docs/update-grading-system-guide.md` (rev 3, đã cũ — §11 của nó không còn đúng).

**Cách đọc các nhãn nguồn:** *[đọc code]* là đã đọc trực tiếp trên `main`; *[bản đồ ảnh hưởng]* là kết quả của một lượt rà soát chỉ-đọc ngày 2026-10-12 mà người viết đã kiểm lại ba điểm quan trọng nhất bằng code (§9); *[ngành]* là nguồn ngoài ở Phụ lục B.

---

## 0. Tóm tắt

Hôm nay chấm điểm có một mô hình duy nhất: **một bài nộp = một chương trình**, chạy với **một gói test, một đề, một rubric của cả phiên**. Đề thi thật của môn CTDL&GT có 1 đến N câu, sinh viên tạo N file (`bai1`…`baiN`), mỗi câu có điểm riêng và điểm tổng là phép cộng. Hệ thống hiện chấm sai hoặc không chấm được loại đề đó.

Thiết kế này đưa **"câu"** (`exam_problem`) thành đơn vị chấm. Đơn vị chấm là **(bài nộp, câu)**; mỗi câu có file, điểm, đề, đáp án mẫu, gói test và rubric riêng; điểm tổng của sinh viên là một hàm cộng các câu. Nguyên tắc xuyên suốt: **công sức của giảng viên không tăng theo số câu hay số file** — hệ thống tự dựng đề cương chấm, giảng viên xác nhận một lần và chỉ xử lý ngoại lệ.

Phạm vi spec là đề **viết code**. Đề **viết tay chụp ảnh** là dạng đề thứ hai của môn, **ngoài phạm vi** và cần spec riêng (§1.4).

---

## 1. Mục tiêu, ràng buộc, ngoài phạm vi

### 1.1 Mục tiêu

Một giảng viên chạy trọn một bài thi 1–N câu, 30–40 bài nộp, từ tạo phiên đến nhận file sổ điểm có tổng, không gặp ngõ cụt, không phải gọi API hay sửa DB bằng tay, và công sức của họ không tăng khi đề có thêm câu.

### 1.2 Ràng buộc do chủ đồ án đặt

| # | Ràng buộc |
|---|---|
| R1 | Công sức giảng viên **không tăng theo số câu / số file**. |
| R2 | Hai cách nộp cùng tồn tại và dùng chung một mô hình: **file riêng** (mỗi file một yêu cầu nộp) và **file nén** `.zip`/`.rar` chứa nhiều file. |
| R3 | Số file bằng số câu. Mỗi câu có điểm riêng. Tổng điểm = cộng các câu. |
| R4 | Hệ thống tự động hoá mọi quy trình, **trừ xác nhận của giảng viên**. Hai điểm xác nhận: **đề cương chấm** (trước khi chấm) và **kết quả** (sau khi chấm: bài bị gắn cờ, kiểm mù). |
| R5 | Phiên 1 câu chạy **y như cũ**, giảng viên không khai thêm gì. |
| R6 | **Không đoán.** Mọi ghép nối (file ↔ câu) là tất định. Mơ hồ thì thành ngoại lệ, không tự chọn. |
| R7 | Đề có thể đến từ ba nguồn: Soạn đề của hệ thống, đề tự soạn kèm đáp án mẫu, đề tự soạn không có đáp án. Phải hỗ trợ cả ba. |

### 1.3 Hai dạng đề của môn

1. **Viết file code rồi nộp** (có thể nhiều file, có thể trong file nén) — phạm vi spec này.
2. **Viết thuật toán ra giấy rồi chụp ảnh** — ngoài phạm vi, §1.4.

### 1.4 Ngoài phạm vi (ghi rõ để không ai tưởng đã làm)

- **Nhánh ảnh / bài viết tay.** Hôm nay không có bộ đọc ảnh: `ContentResolverRegistry` chỉ có resolver `document` và `for('image')` ném lỗi *[đọc code: `grading/content-resolver/content-resolver.registry.ts:30`]*, bài ảnh ra nội dung rỗng rồi về giảng viên. Cần model đọc được ảnh (chưa xác minh gateway có) và spec riêng.
- **Đọc đề dạng PDF.** `extractText` trả rỗng cho PDF có chủ đích; đề PDF làm mọi bài code `ungradable(system)`. Chặng 1 của §6 chỉ hỗ trợ DOCX/TXT cho tới khi có bộ đọc PDF.
- Đo độ phức tạp (`run_scaled`), hiệu chỉnh và α/κ, Java/Node, chế độ driver hàm.
- **Ghi từng câu vào nhiều cột của sổ điểm** (bắt giảng viên chọn N cột — vi phạm R1). Chỉ ghi tổng (§8). File CSV tải về thì có từng câu.
- Các sửa UI độc lập đã nêu ở báo cáo hiện trạng 2026-10-12 (nút "Bắt đầu chấm" cùng "Chấm lại" khi mọi bài không chấm được, nút "Mở bài nộp" còn khoá, lỗi dấu phẩy động của θ ở `decide.ts:188`, bẫy 18) — làm song song, **không phụ thuộc** thiết kế này.

---

## 2. Hiện trạng (đã kiểm bằng code, `main`)

| Điều | Bằng chứng |
|---|---|
| Một bài nộp = một `grading_result` | `@Index('uq_grading_result_submission', ['submissionId'], { unique: true })` *[đọc code: `grading/entities/grading-result.entity.ts:43`; migration `1789200000000`]* |
| Một bài nộp = MỘT chương trình | `sourceFilesOf` gộp mọi `.py`/`.cpp` của file nén thành một chương trình; Python nhiều file mà không có `main.py` thì `ungradable(submission)` *[đọc code: `grading/pipeline/source-files.ts:60-63`]* |
| RAR bị từ chối ở khâu chấm | `if (format === 'rar') return submission('bài nộp dạng RAR — … chỉ đọc ZIP; chấm tay')` *[đọc code: `source-files.ts:28`]* |
| Một gói test cho cả phiên, mọi ca chạy trên mọi bài | `grading_test_case WHERE bundle_id = $1` theo `es.test_bundle_id`, không lọc theo file hay câu *[đọc code: `grading/pipeline/investigation-context.service.ts:74-76`]* |
| Một đề, một đáp án mẫu cho cả phiên | `uq_grading_reference_session` *[đọc code: `grading/entities/grading-reference.entity.ts:34`]*; `loadForGrading(row.exam_session_id)` ở `investigation-context.service.ts` |
| Soạn đề đã sinh theo câu nhưng bị dồn phẳng khi gắn | `GeneratedQuestion { statement, points, modelAnswer, testBundle }`; `flattenAuthoringCases` ép mọi câu vào MỘT gói (`q{n}-` chỉ là tiền tố khoá ca) *[đọc code: `exam-authoring/authoring-bundle.ts`]* |
| Thu bài nhận `.zip`/`.rar` và kiểm nội dung bên trong | Danh sách mục bên trong lưu ở bảng `required_deliverable_entry` *[đọc code: `exam-session/entities/required-deliverable-entry.entity.ts`]*; đối chiếu bằng `matchEntries` (tên cuối, không phân biệt hoa thường, bỏ thư mục) *[đọc code: `submission/archive-check/entry-matcher.ts`]*; RAR đọc bằng `node-unrar-js` chỉ để liệt kê tên (`archive-reader.ts`) |
| Không có test nào chấm một phiên nhiều bài | e2e dùng một yêu cầu nộp mỗi phiên *[đọc code: `test/investigator-end-to-end.e2e-spec.ts:135`]* |

Hệ quả cho đề 3 câu: nếu ba file nộp riêng, mỗi file thành một kết quả riêng nhưng **cùng chạy toàn bộ ca test của phiên** — ca của bài 2 chạy lên `bai1.py` và trừ oan *(suy ra từ code, chưa chạy thử)*. Nếu ba file nằm trong một `.zip`, bài Python không có `main.py` bị loại. Nếu nén `.rar`, mọi bài dồn về chấm tay.

---

## 3. Mô hình dữ liệu

### 3.1 Bảng `exam_problem` (mới)

Một dòng cho mỗi câu của phiên.

| Cột | Ý nghĩa |
|---|---|
| `exam_session_id`, `ordinal` | Phiên và số thứ tự câu 1..N; `unique(exam_session_id, ordinal)` |
| `title`, `points_hundredths` | Tên câu; điểm của câu bằng số nguyên phần trăm điểm (cùng đơn vị `hundredths.ts` đang dùng) |
| `required_deliverable_id` | Yêu cầu nộp chứa file của câu |
| `entry_name` (rỗng được) | Tên mục bên trong khi yêu cầu nộp là `.zip`/`.rar`; cùng cú pháp token như các mục khai ở bảng `required_deliverable_entry`. Rỗng khi câu là một yêu cầu nộp riêng |
| `language` | Ngôn ngữ của câu (`cpp`/`python`). **Chuyển từ yêu cầu nộp sang câu**, vì một file nén có thể chứa C++ lẫn Python |
| `statement`, `statement_quote` | Phần đề của câu, và đoạn trích nguyên văn từ đề làm bằng chứng (§6.5) |
| `rubric_id` | Rubric (một phiên bản) của câu; tổng điểm các tiêu chí bằng `points_hundredths` |
| `test_bundle_id` | Gói test đã duyệt và ghim của câu. FK ghép `(test_bundle_id, id)` sang `grading_test_bundle(id, problem_id)` thay cho `fk_exam_session_test_bundle` |

Các bảng hiện có đổi như sau *[bản đồ ảnh hưởng]*:

- `grading_reference`: khoá unique chuyển từ `(exam_session_id)` sang `(exam_session_id, problem_id)`. Đáp án mẫu vẫn **không bao giờ** nằm ở `exam_material` (sinh viên tải được).
- `grading_test_bundle`: thêm `problem_id`. `unique(exam_session_id, version)` có thể giữ nếu `nextVersion` tiếp tục đánh số theo phiên.
- `exam_session`: thêm `blueprint_confirmed_at`, `blueprint_confirmed_by` (§6.4). Các cột `rubric_id`, `test_bundle_id` giữ lại như bí danh của "câu mặc định" (§3.3) cho tới khi plan P2 kết thúc.
- `required_deliverable.language` và `ck_required_deliverable_language`: giữ cho phiên cũ; phiên mới đọc ngôn ngữ từ câu.

### 3.2 Đơn vị chấm

`grading_result` thêm cột `problem_id`. Ở **pha 2** (§10), `uq_grading_result_submission` đổi thành `unique(submission_id, problem_id)` để một file nén sinh nhiều kết quả. Mọi bảng con (`grading_attempt`, `score_computation`, `teacher_review`, `audit_sample_review`, `error_rule_sighting`) đã khoá theo `grading_result.id` nên **không đổi** *[bản đồ ảnh hưởng]*. Thêm bất biến: `problem_id` không bao giờ đổi sau khi tạo (cạnh `pipeline` đã có trigger tương tự) — phải cập nhật test vòng đời `T-LIFE-1`.

### 3.3 Câu mặc định

Phiên 1 câu, và mọi phiên cũ, nhận một câu mặc định (`ordinal = 1`) tự sinh từ rubric, gói test và tài liệu chấm mà phiên đang có. Giảng viên không khai gì. Các route cấp phiên hiện có (`PUT grading-reference`, tạo/duyệt/ghim gói test, gắn rubric) ghi vào câu mặc định. Một resolver duy nhất `resolveProblemConfig()` thay cho 5–6 chỗ đang đọc `es.rubric_id` / `es.test_bundle_id` / `loadForGrading(sessionId)`.

### 3.4 Điểm tổng

Điểm tổng sinh viên **không lưu thành ô**. Nó là một hàm đọc, cùng tinh thần `currentScore()`: tổng điểm hiện tại của các câu, cộng bằng số nguyên phần trăm điểm. Không ghi "tổng" vào `score_computation` (bảng chỉ-thêm, khoá theo `grading_result_id`). Tổng chỉ đủ tin cậy khi mọi câu của sinh viên đã xong; trước đó hiển thị **"tạm"**, và **"—"** nếu có câu đang kiểm mù (§8).

### 3.5 Bất biến giữ nguyên

Trigger đóng băng 8 cột AI (không phụ thuộc `submission_id`), 15 cặp chuyển trạng thái, `score_computation`/`error_rule_revision`/`price_table_version` chỉ-thêm, `lockTeacherScoring` (khoá theo giảng viên) *[bản đồ ảnh hưởng, §6]*. Mọi đường **ghi mới** (tạo dòng theo câu, đổi rubric của câu) phải xin `lockTeacherScoring` trước `FOR UPDATE`, đúng thứ tự khoá hiện hành.

---

## 4. Tìm file của câu

### 4.1 Định vị

Vị trí file của câu **do thiết kế khai trước**, không đoán (R6): cặp `(required_deliverable_id, entry_name)`. Hai dạng:

- **File riêng:** `entry_name` rỗng; bài nộp ↔ câu một-một.
- **Trong file nén:** `entry_name` là tên mục bên trong; một bài nộp sinh N kết quả.

Danh sách mục bên trong file nén đã được giảng viên khai ở bước tạo phiên (để kiểm thiếu file). Spec này dùng chính danh sách đó làm nguồn: **mỗi mục khai = một câu**. Giảng viên không khai lần hai.

### 4.2 Bộ đọc chung

`ProblemSourceResolver(bytes, định vị) → các file mã của đúng câu đó` (một chương trình). Đọc được:

- **ZIP**: bộ đọc yauzl hiện có, giữ nguyên các trần chống bom giải nén (`archive-rules.ts`: 500 file · 8 MiB tổng · 1 MiB mỗi file).
- **RAR**: `node-unrar-js` (đã là dependency; hôm nay chỉ dùng để liệt kê tên). Thêm giải nén, áp **cùng trần** kích thước như ZIP; từ chối RAR mã hoá.
- **File đơn** không nén, như hôm nay.

Tên mục khớp bằng **`matchEntries` chuẩn** (tên cuối, không phân biệt hoa thường, bỏ thư mục) — không viết bộ khớp thứ hai. Mục là một thư mục (`bai1/`) thì mọi file dưới nó là chương trình của câu. Luật "Python nhiều file phải có `main.py`" áp **trong phạm vi từng câu**, không áp cho cả file nén.

### 4.3 Thiếu mục của câu

Khâu thu bài đã biết chính xác mục nào thiếu (đối chiếu `entries`), nên đây là sự thật xác định. Câu đó ra `ungradable(submission)` với lý do "không nộp file của câu k". Hệ thống **không tự cho 0**: quy tắc dự án coi 0 điểm là phán quyết của giảng viên.

### 4.4 Xác nhận 0 điểm hàng loạt

Một thao tác **"Xác nhận 0 điểm cho các câu không nộp"** cho cả phiên. Mỗi câu một dòng `teacher_review` kiểu `manual_score` có lưu vết (kiểu này đã có). Luôn do giảng viên bấm. Công sức không tăng theo số câu thiếu.

---

## 5. Tên file: phòng ngừa ở agent, khớp tất định ở phía chấm

### 5.1 Câu hỏi và thông lệ ngành

Sinh viên đặt `cau2.py` hay `2.py` thay vì `bai2.py` thì sao? Ngành **không** tự đoán. Các cách phổ biến *[ngành, Phụ lục B]*:

- Đòi đúng tên, báo lỗi rõ, cho nộp lại (Gradescope, Princeton, Marmoset): đặt sai tên là lỗi số 1.
- **Phòng ngừa bằng file khởi đầu**: PrairieLearn sao chép file giảng viên chuẩn bị vào máy sinh viên.
- **Mẫu tên do giảng viên khai trước** (PrairieLearn `gradedFiles` với ký tự đại diện, REGrade với regex); tên khai cụ thể thì phải đúng tên.
- **Kiểm trước khi nộp** (nút "Check Submitted Files" của Princeton; CodeGrade hiện yêu cầu nộp đầu trang tải lên).
- Nhận diện bằng nội dung chỉ thấy ở việc *chọn điểm vào chương trình* (DOMjudge, thư viện `katt`), **không** thấy hệ nào ghép file đặt sai tên vào đúng câu bằng nội dung.

Giới hạn: các nguồn là trang hướng dẫn của từng môn hay công cụ, không phải tài liệu chính thức; việc PrairieLearn dùng file khởi đầu *để tránh sai tên* là suy luận của người viết.

### 5.2 Hiện trạng agent *[đọc code]*

- `entries` đã thay token (`{MSSV}`, `{SOMAY}`) được gửi xuống agent lúc vào phòng thi (`exam-session/exam-session.gateway.ts:480-486`).
- Agent đã in các tên đó ra tờ hướng dẫn (`apps/agent/src/exam-materials.ts:199-215`).
- Agent tạo sẵn file riêng đúng tên; với `.zip` tạo sẵn một file nén rỗng hợp lệ; `.rar` không tạo trước được nên ghi chú bảo sinh viên tự nén (`workspace-files.ts:210-223`).
- Agent có thông báo hệ điều hành, danh sách kiểm từng file ở cửa sổ chi tiết, và snapshot theo chu kỳ.
- **Lỗ hổng:** lúc nộp, `makeWorkspaceReader` chỉ kiểm file nén có tồn tại, **không nhìn vào bên trong**; việc đối chiếu `entries` do máy chủ làm *sau khi thu*, quá muộn để sinh viên sửa. Chú thích của `matchEntries` đã ghi sẵn có thể dùng lại ở agent.

### 5.3 Bốn việc ở agent, cùng chạy từ danh sách `entries` đã khai

1. **Tạo sẵn file đúng tên** (`bai1.py … baiN.py`) trong thư mục làm bài, để sinh viên chỉ sửa nội dung.
2. **Kiểm trực tiếp:** mỗi lần snapshot, và khi sinh viên bấm "Kiểm tra bài", agent mở file nén sinh viên đã tạo, chạy **đúng hàm `matchEntries` của máy chủ**, cập nhật danh sách kiểm ✓/✗ và gửi thông báo khi trạng thái đổi. Không chặn gì.
3. **Gợi ý gần đúng chỉ dành cho sinh viên:** thiếu `bai3.py` mà có `cau3.py` hay `3.py` thì nhắc "Có phải bạn muốn đặt tên `bai3.py`?". Đoán gần đúng ở đây vô hại vì sinh viên là người đổi tên và hoàn tác được.
4. **Kiểm lần cuối lúc nộp, không chặn nộp:** thiếu mục thì báo ngay rồi **vẫn nộp**, không bao giờ giữ bài của sinh viên.

### 5.4 Phía chấm

Chỉ khớp theo `matchEntries` chuẩn (§4.2). Không khớp thì câu đó chờ (`ungradable(submission)`, §4.3). **Không** có "mẫu tên khoan dung" hay "luật học sau khi chấm": với phòng ngừa và kiểm trực tiếp ở agent, phần dư rất hiếm và đi qua danh sách ngoại lệ. Ít cơ chế hơn, ít chỗ lỗi hơn. Hồ sơ bài ghi rõ cách ghép: "câu 2 ← `bai2.py`".

### 5.5 Đảo một quyết định cũ

Spec `2026-09-21-archive-content-validation-design.md` §2 đặt "không cảnh báo hay chặn ở agent" là ngoài phạm vi (quyết định của giảng viên, 2026-09-21). Spec này **đảo quyết định đó cho file nén**, theo yêu cầu của chủ đồ án ngày 2026-10-12: chi phí của một tên sai nay cao hơn vì nó cản chấm tự động. Spec cũ phải được ghi chú trỏ sang đây.

### 5.6 Rủi ro

- **Đọc RAR trong ứng dụng agent (Electron)**: cần thư viện chạy được khi đóng gói. Chưa kiểm. Nếu không được thì với RAR agent chỉ nhắc cách làm đúng và việc kiểm dồn về máy chủ.
- **Hàm khớp tên dùng chung** giữa agent và máy chủ: đặt ở gói dùng chung hoặc bản sao có test đối chiếu byte-cho-byte như `EMPTY_ZIP_EOCD` đang làm, để hai bên không lệch.
- Việc kiểm chạy cục bộ, nhẹ, chỉ thêm một khối vào danh sách kiểm đã có — không làm agent phức tạp thêm.

---

## 6. Dựng đề cương tự động

### 6.1 Khi nào chạy

Ngay lúc giảng viên gắn đề vào phiên, **chạy nền**, xong trước giờ thi. Việc này không nằm trên đường găng của buổi chấm; giảng viên có thể rời trang và quay lại.

### 6.2 Quy trình chung, mỗi chặng tự bỏ qua nếu đã có dữ liệu

| Chặng | Việc | Nguồn |
|---|---|---|
| 1. Cấu trúc | Tách danh sách câu: số thứ tự, tên, điểm, đề từng câu, tên file | Soạn đề: **chuyển thẳng** (đã có cấu trúc). Đề tự soạn: AI đọc đề, trả JSON chặt |
| 2. Đáp án mẫu | Mỗi câu một chương trình | Giảng viên có: ghép theo câu. Chưa có: AI viết |
| 3. Gói test | Ca theo nhóm cho từng câu | Soạn đề đã sinh. Chưa có: AI sinh |
| 4. Kiểm bằng chạy thật | Chạy đáp án mẫu qua sandbox với từng ca | Sandbox hiện có |
| 5. Rubric và đề xuất lỗi | Tiêu chí của câu (tổng bằng điểm câu), lỗi gợi ý dạng `proposed` | Chép từ rubric cũ nếu có, không thì AI đề xuất |

Khớp bảng §2.1 của spec lõi (đề + đáp án mẫu → hệ thống dựng bộ input rồi **chạy đáp án của giảng viên**; chỉ đề → hệ thống viết cả đáp án lẫn gói test, **chưa kiểm chứng cho tới khi giảng viên duyệt**). Cả ba nguồn đi chung một quy trình (R7).

### 6.3 Output mong đợi có hai nguồn độc lập

Mỗi ca có output do LLM dự đoán và output do **chạy đáp án mẫu thật** trong sandbox (T-POL-4 của spec lõi: chuẩn rút từ đáp án mẫu chạy thật, không từ đọc văn bản). Hai bên khớp thì ca được tin. Lệch thì ca thành **ngoại lệ**, không tự tin bên nào. Việc này vá lỗ hổng đã biết: gói test từ Soạn đề hôm nay được tự duyệt và ghim với `expected_output` do LLM viết mà chưa từng chạy đáp án mẫu (`exam-authoring/ai-provider/claude-authoring.provider.ts:184`; `grading/test-bundle/test-bundle.service.ts:58-108`).

Giới hạn thật: hai nguồn đồng thuận chỉ chứng minh không có lỗi **cài đặt**; nếu model hiểu sai chính đề thì cả hai cùng sai. Đáp án mẫu do **giảng viên** cung cấp là nguồn sự thật độc lập duy nhất, nên chuyển trường hợp "chỉ đề" thành "đề + đáp án" làm thước đáng tin hơn.

### 6.4 Một màn xác nhận

Các thẻ Câu 1..N thu gọn: file, điểm, ngôn ngữ, số ca đã kiểm (✓ hoặc ⚠), tóm tắt rubric. Ngoại lệ ⚠ hiện lên đầu và phải xử lý; còn lại là một nút **"Xác nhận đề cương"**. Công sức tỉ lệ với **số ngoại lệ**, không với số câu. Khi xác nhận, hệ thống làm thay các bước thủ công hôm nay: tạo các câu, duyệt và ghim gói test, ghim rubric, lưu tài liệu chấm, và ghi `exam_session.blueprint_confirmed_at`. Từ lúc đó tài liệu chấm khoá (cùng cơ chế `isGradingLocked`).

### 6.5 Bảo vệ chống tách sai (rủi ro nghiêm trọng, không chỉ "hiện cho giảng viên xem")

Tách câu và tách điểm sai là lỗi **hệ thống**: sai đều nhau với **cả lớp** (điểm tối đa, gói test, tỉ lệ trừ), khác lỗi chấm từng bài vốn ngẫu nhiên và có cờ cùng mẫu kiểm mù bắt. Dựa vào việc giảng viên nhìn kỹ là dựa vào sự cẩn thận của con người (người ta hay bấm "xác nhận" mà không soi từng con số) và đi ngược R1.

| Trường tách | Mức | Nguồn tin cậy hơn AI |
|---|---|---|
| Số câu, ranh giới câu | Nghiêm trọng | Số file/mục đã khai ở yêu cầu nộp |
| Điểm từng câu | Nghiêm trọng | Quét mẫu điểm bằng code, tổng phải đúng |
| Tên file của câu | Nghiêm trọng | Khai báo sẵn, không đoán |
| Đề từng câu | Vừa | Trích nguyên văn từ đề |
| Rubric, lỗi gợi ý | Nhẹ | Sửa được sau qua hàng đợi đề xuất |

Phòng thủ nhiều lớp (đường đề **tự soạn**; đường Soạn đề không tách nên không có rủi ro này):

1. **Thu hẹp vai trò của AI:** số câu và tên file lấy từ danh sách đã khai; AI chỉ *ghép* câu vào file. Điểm do code quét trước theo các mẫu thường gặp (`3 điểm`, `(2,5đ)`, `[1.0 đ]`); AI chỉ xử lý trường hợp mơ hồ.
2. **Mọi giá trị kèm đoạn trích nguyên văn**, và code kiểm đoạn đó có thật trong văn bản đề (tương tự bước kiểm bằng chứng đã có ở đường chấm).
3. **Ràng buộc cứng do code kiểm:** số câu = số file khai; tổng điểm = tổng điểm đề (mặc định 10, hoặc theo đề); thứ tự câu liền mạch; mỗi câu có đề không rỗng. Vi phạm → **dừng** (fail-closed).
4. **Hai lần tách độc lập** (khác prompt hoặc khác model); lệch nhau → ngoại lệ bắt buộc.
5. **Canh thước lúc chạy** (§7.5) bắt phần lọt qua.
6. Giảng viên chỉ thấy **ngoại lệ** cộng một dòng tổng ("N câu · tổng 10 điểm · khớp N file ✓").

Rủi ro còn lại không về 0: sự mơ hồ có sẵn trong chính đề (ví dụ "Câu 3 (2 điểm + 1 điểm cộng)") được đẩy thành ngoại lệ cho giảng viên quyết, không tự chọn.

### 6.6 Đo bằng kiểm đột biến

Theo văn hoá của bộ đo hiện có: cố ý làm hỏng đầu ra tách (gộp hai câu, đổi điểm, bỏ một câu, đổi tên file) và đòi các lớp 1–4 bắt được **100%** lỗi nghiêm trọng. Kèm một bộ đề thật có nhãn của chủ đồ án để đo độ chính xác tách trên đề thật (cần vài đề DOCX/PDF thật).

### 6.7 Đáp án mẫu là chương trình để chạy, không phải văn bản để so sánh

**Agent đọc code sinh viên không nhận văn bản đáp án mẫu**: thư mục làm việc của nó chỉ có đề, bảng lỗi, danh sách nhóm test và bài nộp (`grading/investigator/workspace.ts:88-90`); đáp án mẫu chỉ hiện như cờ có/không `modelAnswerAvailable`. Đường tự luận (`one_shot`) thì có đọc đáp án như văn bản tham chiếu. Lý do (spec lõi): so lối viết với đáp án mẫu trừ điểm mọi lời giải đúng nhưng khác lối, và trừ **đều tay trên cả lô** — lỗi hệ thống không bài nào lộ ra để ai nghi ngờ. Chuẩn là *hành vi*, không phải *hình thức*. Giá trị của đáp án giảng viên cung cấp: (1) sinh output mong đợi bằng chạy thật — giảng viên không phải gõ gói test; (2) nguồn sự thật độc lập (§6.3); (3) mẫu đối chứng đo độ phức tạp (phần chưa làm).

---

## 7. Chấm từng câu

### 7.1 Hành trình của một đơn vị (bài nộp, câu)

1. Bấm **"Bắt đầu chấm"** một lần cho cả phiên. Preflight kiểm đề cương đã xác nhận, sandbox sẵn sàng. Hệ thống tạo đồng bộ **một dòng kết quả cho mỗi (bài nộp, câu)** ở `ai_grading`, xếp công việc với mã theo **mã kết quả** (không theo mã bài nộp). Tài liệu chấm khoá.
2. Worker tải bài nộp, `ProblemSourceResolver` chọn đúng file của câu (§4). Thiếu mục → dừng ở `ungradable(submission)`.
3. Dựng ngữ cảnh **của riêng câu**: đề câu, gói test câu, bảng lỗi của rubric câu. Đáp án mẫu không đưa cho agent (§6.7).
4. Agent điều tra (chạy test theo nhóm, đọc code, kết luận lỗi kèm bằng chứng): **không đổi** so với hôm nay. Luật máy kiểm do code quyết từ kết quả chạy.
5. Bốn lăng kính phản biện: không đổi.
6. `decide()` / `computeScore()` cho câu: điểm câu = điểm tối đa của câu trừ tổng lỗi theo bảng giá của rubric câu. Tự duyệt nếu đủ điều kiện, không thì gắn cờ nêu đích danh luật.
7. Canh thước chạy song song (§7.5).
8. Gộp theo sinh viên và xử lý ngoại lệ (§8).

### 7.2 Ngữ cảnh theo câu

`InvestigationContextService.build(resultId)` đọc câu của kết quả thay vì đọc `es.test_bundle_id`, `rd.language`, `loadForGrading(sessionId)`. `source-files.ts` nhận định vị của câu thay vì gộp cả file nén.

### 7.3 Điểm trừ là bất đồng bộ, không chặn việc chấm

Cơ chế này đã có và spec **giữ nguyên**, chỉ giải thích lại vì dễ hiểu nhầm là cổng *[đọc code]*:

- Preflight cảnh báo về Bảng lỗi nhưng **không chặn** ("Không chặn việc bắt đầu", `apps/web/src/lib/preflight.ts`).
- Luật có nhưng **chưa có giá**: bài ra điểm tạm không trừ lỗi đó và bị gắn cờ `unpriced` (`grading/scoring/deduction-score.ts:45`). Khi giảng viên đặt giá, mọi bài chưa chốt tự tính lại.
- Lỗi lạ chưa có trong bảng: agent ghi vào `missingRules`; hệ thống tạo luật `proposed` (`origin = 'agent_reported'`) kèm **nơi thấy** (bài, phiên, rubric) (`grading/rules/missing-rules.ts:25-63`). Agent không bị gián đoạn.

Hàng đợi `proposed` là **một cơ chế chung** cho hai việc: gieo lỗi ban đầu khi dựng đề cương (chặng 5, §6.2) và lỗi lạ phát hiện lúc chấm. Mỗi đề xuất kèm gợi ý tiêu chí và điểm trừ theo tỉ lệ điểm của câu. Giảng viên nhận từng cái hoặc "nhận tất cả gợi ý" bằng một thao tác. **Không bước nào chặn chấm.** Công sức đặt giá tỉ lệ với số loại lỗi thật sự gặp, không với số câu hay số file. (Một lượt thiết kế đầu đã đề xuất "xác nhận cả bảng giá trước khi chấm"; chủ đồ án chỉ ra đó là sai hướng và đã bỏ.)

### 7.4 Chính sách lỗi lạ (c)

Hôm nay `missingRules` **chỉ để tạo đề xuất**: `decide()` không đọc nó (`grep` ở `decide.ts`, `diagnose.ts`, `score-core.ts` không thấy), nên một bài có lỗi thật chưa có trong bảng, không dính cờ nào khác, vẫn có thể **tự duyệt đủ điểm**; lưới an toàn duy nhất là mẫu kiểm. Và khác với `errors` — nơi lỗi không có lần gọi công cụ hợp lệ bị loại với lý do `no_valid_tool_call` (`grading/investigator/investigate.ts:254-256`) — `missingRules` **không đòi bằng chứng nào**: `toolCallIds` được phép rỗng, mã bịa chỉ bị lọc, mục vẫn giữ (`investigate.ts:263`, `protocol.ts:142`).

Chính sách (chốt cùng chủ đồ án, phương án **(c)**):

1. Lỗi lạ có **bằng chứng hợp lệ** — ít nhất một lần gọi công cụ thật, đã thành công, không bịa (cùng chuẩn áp cho lỗi trong bảng) — **giữ bài ở nhóm "cần xem"**. Bài vẫn được chấm và ra điểm tạm; chỉ khâu **tự duyệt** bị hoãn, đúng cách `unpriced` đang hoạt động.
2. Lỗi lạ **không có bằng chứng hợp lệ**: chỉ ghi đề xuất, **không giữ bài**. Lý do: nếu giữ theo suy đoán trần, chỉ một câu đoán mò của model đã giữ được bài, và mỗi bài giữ oan là thêm một lượt xem của giảng viên — đi ngược R1.
3. Trong hàng đợi, bằng chứng **có chạy thật** (`run`/`run_tests` cho thấy sai) xếp ưu tiên cao hơn bằng chứng chỉ đọc code.
4. Người xác nhận cuối cùng là giảng viên, **một lần cho mỗi loại lỗi**, không phải mỗi bài. Nhận đề xuất thì luật thành thật và các bài liên quan được thả ra (bản ghi "nơi thấy"). Bỏ đề xuất (`dismissed`) thì các bài cũng được thả, không bị trừ oan.
5. Rủi ro đã biết: đề xuất đang gom theo chữ mô tả (`missingRuleKey`), nên cùng một lỗi viết khác chữ thành nhiều đề xuất. Cần gom nhóm các đề xuất gần nhau để giảng viên không xem lặp (chuyển sang plan P4).

### 7.5 Canh thước (lưới bắt lúc chạy)

Spec lõi đã thiết kế "canh thước sau khi chấm" (cột `grading_test_case.auto_dropped_reason` đã có) nhưng **chưa cài**: không có bảng cảnh báo, không đâu ghi `auto_dropped_reason`. Spec này đưa nó vào. Khi các bài của lớp lần lượt xong, hệ thống theo dõi tỉ lệ sai theo từng ca. Một ca mà **gần như cả lớp** sai, kể cả sinh viên mạnh, dù đáp án mẫu qua → nghi thước sai: cảnh báo ở đầu trang phiên và **tạm dừng tự duyệt** các bài dính ca đó cho tới khi giảng viên quyết (bỏ ca → tính lại trên kết quả đã lưu, không chạy lại sandbox, như luật máy kiểm hôm nay). Đây là lưới bắt cho phần tách sai lọt qua §6.5 và ca test sai lọt qua §6.3.

### 7.6 Luật lời thêm sau khi chấm

Theo guide §2.2, luật lời tạo sau cuộc điều tra không tự áp cho bài đã chấm (các bài đó bị gắn cờ "chưa xét hết tiêu chí" và chờ chấm lại; chấm lại hiện chỉ có cho bài lỗi hệ thống). Để luồng "ghi đề xuất, giảng viên nhận sau" **đóng vòng**, cần một lượt **"kiểm lại riêng luật này"** rẻ hơn chấm lại cả bài: với các bài chưa từng được kiểm luật mới, chạy một lượt điều tra hẹp chỉ cho luật đó. Với các bài mà agent đã báo đúng lỗi này (bản ghi "nơi thấy"), dùng chính bằng chứng đã lưu. Thiết kế chi tiết thuộc plan P4; điểm kiểm lại ở plan phải xác nhận lại hành vi `T-FAIR-1`/`rulesSeen` trước khi cài.

---

## 8. Điểm tổng, chốt, kiểm mù, xuất sổ

- **Tổng** là hàm đọc (§3.4). Hiển thị "tạm" tới khi mọi câu xong; "—" nếu sinh viên có câu `audit_pending`, để không lộ điểm của câu bị che.
- **Chốt điểm** giữ ở cấp phiên: máy trạng thái 15 cặp, trigger bất biến và `finalizeGrades` đếm theo từng kết quả nên chạy được không sửa *[bản đồ ảnh hưởng]*. Chốt được khi không còn kết quả ở `ai_grading`, `ai_graded`, `flagged_for_review`, `audit_pending` (`BLOCKS_FINALIZE`).
- **Kiểm mù rút theo sinh viên.** Một sinh viên được rút thì mọi câu **tự duyệt** của họ vào kiểm mẫu, trình bày gộp ("HS2410020 — Câu 1, Câu 3"). Việc che điểm và lỗi vẫn áp **theo từng câu** như hôm nay. Rút bằng SHA-256 trên `(seed phiên, MSSV)` — tất định, không nhìn điểm; giữ tỉ lệ mặc định 20% (`GRADING_AUDIT_SAMPLE_PERCENT`), sàn 5%, không bao giờ 0. Khối lượng kiểm không nhân theo số câu.
- **Xuất sổ điểm: chỉ ghi tổng vào một cột.** Quyết định "không hệ thống nào tự cộng điểm" ở G5 (`2026-09-29-gradebook-export-design.md` §1.2, D7) là một quyết định nghiệp vụ, không phải giới hạn kỹ thuật. Việc giảng viên xác nhận đề cương (điểm từng câu và tổng) **chính là** quyết định đó, nên hệ thống được cộng — nhưng chỉ khi **mọi câu của sinh viên đã chốt** (không ghi điểm tạm). Cộng bằng số nguyên phần trăm điểm, làm tròn đúng một lần theo bước làm tròn giảng viên chọn. Chưa đủ câu thì để ô trống kèm lý do "chưa đủ câu" (một trong các nhãn lý do hiện có). Phiên 1 câu chạy như cũ.
- **Giao diện:** danh sách kết quả hiện **một dòng mỗi sinh viên**, kèm chip trạng thái từng câu và tổng; bấm chip mở hồ sơ của đúng câu. Các bộ lọc ("cần xem"…) đếm theo câu. CSV tải về có từng câu và tổng.

---

## 9. Sửa đúng-sai bắt buộc: ba bẫy im lặng

Ba chỗ **không nổ lỗi, chỉ ra điểm sai** khi một bài nộp có nhiều kết quả. Cả ba đã được đọc lại bằng code; viết test **trước** và thấy đỏ.

| # | Chỗ | Sai ở đâu |
|---|---|---|
| 1 | `GradingService.gradeOneById` — `this.results.findOne({ where: { submissionId } })` *[đọc code: `grading/grading.service.ts:295-298`]* | Một bài nộp có nhiều kết quả thì `findOne` trả một dòng bất kỳ → chấm nhầm câu. Phải theo `resultId` |
| 2 | `loadSessionModelRules` / `sessionModelRulesWith` *[đọc code: `grading/scoring/score-inputs.ts:102-147`]* — lấy **giao** luật lời của MỌI bài `graded` của phiên (`HAVING count(DISTINCT att.id) = (SELECT count(*) FROM att)`) | Hai câu khác rubric → giao rỗng → mọi luật lời rơi âm thầm → điểm bị thổi phồng. Phải tính **theo từng câu** *(nơi gọi: `score.service.ts:277-284,515` — bản đồ ảnh hưởng)* |
| 3 | `grade-export.data.ts` — `map.set(key, …)` trong vòng lặp theo MSSV *[đọc code: dòng 110]* | N kết quả của một sinh viên đè nhau, chỉ còn câu cuối. Phải gộp theo sinh viên *(`RESULTS_SQL` dòng 36-49, `IS NOT DISTINCT FROM` ở 127/137, `grade-export-plan.service.ts:133-134` — bản đồ ảnh hưởng)* |

Ngoài ba bẫy: `planReapply` (`score.service.ts:435`) lấy giá theo `es.rubric_id` — phải theo `g.rubric_id_version` của chính kết quả *[bản đồ ảnh hưởng]*; `grading_anchor_snapshot` chỉ nổ khi `GRADING_ANCHORS_ENABLED=true` (mặc định tắt).

---

## 10. Migration, phân pha, chia plan

### 10.1 Chiến lược migration (chỉ thêm)

- **Pha 1 — câu là một yêu cầu nộp riêng** (bài nộp ↔ kết quả vẫn một-một, **chưa đụng** unique): thêm `exam_problem`, `problem_id` cho phép rỗng ở `grading_result`/`grading_test_bundle`/`grading_reference`. Backfill câu mặc định cho phiên đã có kết quả trong **một transaction có cổng checksum** trước/sau trên (`ai_total_score`, `status`, các dòng `score_computation`, `updated_at`), tắt `trg_grading_result_updated_at` tạm thời theo tiền lệ migration `1789430000000`. Diễn tập trên bản sao trước khi áp lên Supabase, chạy `-t all` (`migrationsTransactionMode` là `none`).
- **Pha 2 — câu nằm trong file nén:** đổi `uq_grading_result_submission` thành `unique(submission_id, problem_id)`; mã công việc theo `resultId`; đọc RAR; `source-files` theo câu; agent tạo sẵn file và kiểm trực tiếp.
- **Vận hành:** Railway tự deploy `main` và **không chạy migration** → áp tay quanh lúc merge. Công việc cũ còn trong Redis chỉ có `submissionId` → bộ xử lý phải chịu được payload cũ. Hai cặp migration trùng timestamp đã có từ trước (TypeORM 0.3.31 không ép thứ tự), nhưng migration mới nên dùng dải timestamp riêng.

### 10.2 Chia thành các plan độc lập

| Plan | Nội dung | Phụ thuộc |
|---|---|---|
| **P1** | Lõi "câu" với yêu cầu nộp riêng: `exam_problem`, rubric/gói test/đề theo câu, câu mặc định, điểm tổng, xuất tổng, ba bẫy §9, giao diện danh sách theo sinh viên | — |
| **P2** | Câu trong file nén: đổi unique, mã công việc, đọc RAR, `ProblemSourceResolver`, agent tạo sẵn file và kiểm trực tiếp (§5.3), xác nhận 0 hàng loạt (§4.4) | P1 |
| **P3** | Dựng đề cương tự động và các lớp phòng thủ (§6), màn xác nhận, kiểm đột biến | P1 |
| **P4** | Canh thước (§7.5), chính sách lỗi lạ (c) và gom nhóm đề xuất (§7.4), "kiểm lại riêng luật này" (§7.6) | P1 |

Mỗi plan có kiểm chứng riêng (§11). Thứ tự giao: P1 → (P2, P3, P4 song song được). Một lượt diễn tập thật gate trước khi bắt đầu P1 trên `main` hiện tại để có mốc so sánh.

---

## 11. Kiểm thử và nghiệm thu

- **Bất biến cũ chạy nguyên:** e2e vòng đời 15 cặp, trigger 8 cột AI, các bảng chỉ-thêm; thêm test bất biến `problem_id` (cập nhật `T-LIFE-1`).
- **Viết trước, thấy đỏ:** ba bẫy §9; `planReapply` theo rubric của kết quả.
- **Kiểm đột biến** bộ tách đề cương (§6.6): các lớp phòng thủ bắt 100% lỗi nghiêm trọng.
- **Chứng minh "1 câu chạy như cũ":** chạy lại kịch bản `ngan-xep-v1` và so với lượt `20260928T094907Z-f83a05c` (điểm 5/5, lỗi 8/8, tự duyệt sai 0); không tụt ở chỉ số nào. Ghi bản ghi và dòng so sánh vào `apps/api/eval/rehearsals/` theo quy ước lịch sử benchmark.
- **Kịch bản diễn tập mới nhiều câu** (đề 3 câu, cả file riêng lẫn trong file nén; ít nhất một bài thiếu mục, một bài đặt tên lệch, một bài có lỗi lạ có bằng chứng). Tên kịch bản chốt ở plan P1. Cần key model và VM sandbox bật.
- **Eval offline:** thêm fixture nhiều câu; runner eval phải chạy cả khâu phản biện và quyết định để precision của nhóm tự quyết có mẫu số (hôm nay `autoDecision.count = 0`).
- **Tiêu chí hoàn thành toàn bộ:** một đề 3 câu, 40 bài, cả hai cách nộp. Giảng viên đi từ tạo phiên, gắn đề, xác nhận đề cương **một lần**, thu bài, bấm chấm, xử lý ngoại lệ, chốt, đến nhận file sổ điểm có tổng, không gặp ngõ cụt. Diễn tập: 0 tự duyệt sai.

---

## 12. Rủi ro và việc chuyển sang plan

| Mục | Ghi chú |
|---|---|
| Đọc RAR khi đóng gói agent | Chưa kiểm; có đường lùi (§5.6). Kiểm ở đầu P2 |
| Hàm `matchEntries` dùng chung agent ↔ API | Gói dùng chung hay bản sao có test đối chiếu — quyết ở P2 theo luật `check:cycles` của agent |
| Chi phí và thời gian dựng đề cương | Mỗi câu gọi model và chạy sandbox; đo ở P3 |
| Bộ đề thật để đo tách câu | Cần chủ đồ án cung cấp vài đề DOCX/PDF thật |
| Gom nhóm đề xuất gần nhau | Phương pháp gom chốt ở P4 |
| `T-FAIR-1`/`rulesSeen` và "kiểm lại riêng luật này" | Xác nhận lại hành vi hiện tại trước khi cài (§7.6) |
| Rò điểm bị che trong tổng | Tổng "—" khi có câu `audit_pending`; thêm canary cho đường đọc tổng |
| Chưa có số "đúng bao nhiêu %" trên bài thật | Spec này **không** cải thiện điều đó; xem §11 |

---

## 13. Nhật ký quyết định

| # | Quyết định | Người chốt / căn cứ |
|---|---|---|
| D1 | "Câu" là thực thể riêng (hướng A), không bung file nén thành bài nộp ảo (B), không để agent tự đoán (C) | Chủ đồ án, 2026-10-12 |
| D2 | Hỗ trợ cả file riêng lẫn trong file nén, cùng một mô hình | Chủ đồ án (trả lời "C") |
| D3 | Công sức giảng viên không tăng theo số câu/file; tự động hoá trừ xác nhận | Chủ đồ án |
| D4 | Đề đến từ cả ba nguồn; (1) và (3) đông nhất | Chủ đồ án |
| D5 | Điểm trừ bất đồng bộ qua hàng đợi `proposed`, **không** làm cổng trước khi chấm | Chủ đồ án (sửa đề xuất ban đầu của người viết) |
| D6 | Lỗi lạ: giữ bài **chỉ khi có bằng chứng hợp lệ** — phương án (c) | Chủ đồ án |
| D7 | Phòng thủ nhiều lớp cho bước tách câu/điểm, fail-closed | Chủ đồ án (nêu rủi ro) |
| D8 | Tên file: phòng ngừa + kiểm trực tiếp ở agent từ danh sách `entries`; bỏ "mẫu khoan dung" và "luật học sau chấm"; đảo quyết định 2026-09-21 | Chủ đồ án |
| D9 | Kiểm mù rút theo sinh viên | Đề xuất của người viết, chủ đồ án duyệt thiết kế |
| D10 | Xuất sổ: chỉ ghi tổng; chưa ghi từng câu vào nhiều cột | Đề xuất của người viết, chủ đồ án duyệt thiết kế |
| D11 | Xác nhận 0 điểm hàng loạt cho câu không nộp, luôn do giảng viên bấm | Đề xuất của người viết, chủ đồ án duyệt thiết kế |
| D12 | Hai pha migration (câu = yêu cầu nộp riêng trước; câu trong file nén sau) | Đề xuất của người viết, chủ đồ án duyệt thiết kế |
| D13 | Nhánh ảnh và bộ đọc PDF ngoài phạm vi, cần spec riêng | Người viết; chưa có quyết định của chủ đồ án về model đọc ảnh |

---

## Phụ lục A. Các file chạm nhiều nhất (theo rủi ro giảm dần) *[bản đồ ảnh hưởng]*

1. `grading/scoring/score-inputs.ts`, `score-core.ts`
2. `grading/grading.service.ts`
3. `grading/grading-run.service.ts`
4. `grade-export/grade-export.data.ts`, `grade-export-plan.service.ts`, `grade-export-write.service.ts`
5. `grading/grading.processor.ts`, `grading.queue.ts`
6. Migration mới + entity `grading-result`, `grading-reference`, `grading-test-bundle`, `exam-session`
7. `grading/scoring/score.service.ts`
8. `grading/regrade.service.ts`
9. `grading/pipeline/investigation-context.service.ts`, `source-files.ts`
10. `exam-authoring/attach-exam.service.ts`, `authoring-bundle.ts`
11. `grading/test-bundle/test-bundle.service.ts`, `grading-reference.service.ts`
12. Web: `app/teacher/grading/[resultId]/page.tsx`, `PreparePanel`, `export/_components/StepColumns.tsx`
13. `eval/rehearsal/cli.ts`, `score-run.ts`
14. `grading/submission-text.service.ts`, `grading/audit/audit-review.service.ts`

Ước lượng: một ràng buộc DB duy nhất chặn mô hình mới (`uq_grading_result_submission`); khoảng 22 file prod dùng `submission_id` làm khoá chấm; khoảng 19 file đọc rubric/bundle/reference từ phiên; 43/90 e2e và 12/147 unit (API), 44/136 test web chạm mô hình chấm.

## Phụ lục B. Nguồn tham khảo (đặt tên file)

- [NEU DS2000 Gradescope FAQ](https://course.ccs.neu.edu/ds2000/ds2000_GradescopeFAQ.pdf)
- [UPenn CIS 1210 Gradescope help](https://cis.upenn.edu/~cis1210/current/gradescope_help.html)
- [Princeton COS 126 Assignment FAQ](https://www.cs.princeton.edu/courses/archive/spr25/cos126/assignments/faq)
- [Marmoset, UWaterloo CS241e](https://www.student.cs.uwaterloo.ca/~cs241e/current/marmoset.shtml)
- [PrairieLearn workspaces](https://docs.prairielearn.com/workspaces/)
- [Codio template code freezing](https://www.codio.com/blog/coding-assignment-solution-template-code-freezing)
- [REGrade](https://ocaml.org/p/regrade)
- [Autolab filename issue](https://gitlab.encs.vancouver.wsu.edu/autolab-project/m6/autolab/-/issues/1)
- [Canvas renamed submissions](https://community.canvaslms.com/thread/23472)
- [DOMjudge team manual](https://www.cs.umd.edu/Outreach/hsContest25/domjudge-team-manual.pdf)
- [katt (Haskell Kattis client)](https://hackage.haskell.org/package/katt-0.2.0.1/docs/katt.haddock)
- [CodeGrade hand-in requirements](https://docs.codegra.de/guides/setting-up-hand-in-requirements.html) (không mở được trang; dựa vào tóm tắt kết quả tìm kiếm)
