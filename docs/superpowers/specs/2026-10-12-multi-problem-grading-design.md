# Chấm điểm nhiều câu — thiết kế

**Ngày:** 2026-10-12 · **Trạng thái:** chủ đồ án đã **duyệt** (2026-10-12) kèm năm điều kiện ở §10.3; bước tiếp theo là viết plan (P0 trước) · **Nhánh:** `feat/multi-problem-grading` (rẽ từ `main` @ `dc2d022`)

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
- **PDF quét ảnh (không có lớp chữ)** cần OCR hoặc model đọc ảnh: ngoài phạm vi. **PDF có lớp chữ thì NẰM TRONG phạm vi**: `extractText` hôm nay trả rỗng cho mọi PDF có chủ đích, và đề PDF làm mọi bài code `ungradable(system)` (bẫy 11 của guide). Đề thật đầu tiên chủ đồ án đưa vào (Phụ lục C) **là PDF có lớp chữ**, nên bộ đọc PDF là điều kiện của chặng 1 (§6.2) chứ không phải tuỳ chọn, và nên được làm như một sửa độc lập sớm.
- Đo độ phức tạp (`run_scaled`), hiệu chỉnh và α/κ, Java/Node, chế độ driver hàm.
- **`probe` và `compare_peers`** (bước 5 của spec lõi, §3.2 và §3.4): so hành vi bài nộp với đáp án mẫu trên input do agent tự chọn, và gom nhóm sinh viên cùng hiểu sai. Đây là đòn bẩy chất lượng chấm lớn (thu hẹp ca lỗi nhỏ nhất, phát hiện hard-code, biến một phần lỗi chỉ-đọc-code thành lỗi có bằng chứng chạy thật), nhưng cần spec riêng. Ràng buộc đã có ở spec lõi §2.1: với đề **không có đáp số duy nhất**, `probe` trên input tự dò **không được** sinh lỗi hành vi nếu gói test không khai bộ so sánh. Thiết kế này để đáp án mẫu **theo từng câu** nên không chặn việc làm sau. **Chốt (chủ đồ án, 2026-10-12): tách spec riêng, đặt ngay sau P1**, với ba điều kiện bắt buộc: (1) **phụ thuộc mức tin cậy của thước** — `probe` biến độ lệch so với đáp án mẫu thành lỗi có bằng chứng chạy thật (tin cậy 0,85 bằng θ) nên làm tăng tự duyệt, và nếu đáp án mẫu sai thì trừ oan đồng loạt cả lớp; vì vậy cột `ruler_trust` nằm ở P1a (§6.3b) và `probe` chỉ bật cho thước `teacher` hoặc `verified`; (2) **cần bộ kiểm input hợp lệ cùng bộ so sánh** (cặp validator và checker kiểu testlib), vì agent tự chọn input và input vi phạm tiền điều kiện của đề cho hành vi không xác định ở cả hai phía, gây lệch giả; (3) **chạy chế độ bóng trước**: ghi lệch nhưng chưa tính điểm, đo bằng bộ số liệu P0 xem lệch thật và lệch giả bao nhiêu rồi mới cho tác động điểm, và giới hạn số lần `probe` mỗi đơn vị.
- **Tín hiệu giữa các câu của cùng một sinh viên** (ba file giống một mẫu) và so sánh giữa sinh viên theo câu.
- **Hình dạng đề không hỗ trợ**, ghi rõ để không ai tưởng đã làm: câu tự chọn ("chọn 1 trong 2"); các ý a/b/c dùng chung một file (coi là **một** câu); đề cài đặt hàm hay lớp trong một file rồi chấm bằng driver (chế độ driver hàm, spec lõi đã đẩy ra ngoài); bài C++ nhiều file có header mà không biên dịch được thành một chương trình (ra `ungradable(submission)`). Giả định "mỗi câu một file" **đã được chủ đồ án xác nhận** cho đề thật, nhưng độ phủ của các hình dạng trên chưa đo: **điều kiện trước P1** là một bảng phân loại hình dạng trên 3–5 đề thật (§12).
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
- `exam_problem_binding` (mới, §4.3): bản ghi tường minh "giảng viên chỉ định mục này của bài nộp là file của câu này" — `(submission_id, problem_id, entry_path, chosen_by, chosen_at)`, chỉ-thêm, có `audit_log`.
- `grading_attempt`: thêm `prompt_version` (băm của system prompt) và **ghi thật** `cost_usd` (cột đã có nhưng không ai ghi). `model_used`, `tokens_in`, `tokens_out`, `sandbox_host` đã có *[đọc code: `grading/entities/grading-attempt.entity.ts`]*; cặp (bậc, model) lấy từ `model_used`.
- `exam_session`: thêm `blueprint_confirmed_at`, `blueprint_confirmed_by` (§6.4). Các cột `rubric_id`, `test_bundle_id` giữ lại như bí danh của "câu mặc định" (§3.3) **cho tới khi plan P2 kết thúc, rồi bị gỡ** (§10.1 nêu cách chống tái phát).
- `required_deliverable.language` và `ck_required_deliverable_language`: giữ cho phiên cũ; phiên mới đọc ngôn ngữ từ câu.

### 3.2 Đơn vị chấm

`grading_result` thêm cột `problem_id`. Ở **pha 2** (§10), `uq_grading_result_submission` đổi thành `unique(submission_id, problem_id)` để một file nén sinh nhiều kết quả. Mọi bảng con (`grading_attempt`, `score_computation`, `teacher_review`, `audit_sample_review`, `error_rule_sighting`) đã khoá theo `grading_result.id` nên **không đổi** *[bản đồ ảnh hưởng]*. Thêm bất biến: `problem_id` không bao giờ đổi sau khi tạo (cạnh `pipeline` đã có trigger tương tự) — phải cập nhật test vòng đời `T-LIFE-1`.

### 3.3 Câu mặc định

Phiên 1 câu, và mọi phiên cũ, nhận một câu mặc định (`ordinal = 1`) tự sinh từ rubric, gói test và tài liệu chấm mà phiên đang có. Giảng viên không khai gì. Các route cấp phiên hiện có (`PUT grading-reference`, tạo/duyệt/ghim gói test, gắn rubric) ghi vào câu mặc định. Một resolver duy nhất `resolveProblemConfig()` thay cho 5–6 chỗ đang đọc `es.rubric_id` / `es.test_bundle_id` / `loadForGrading(sessionId)`.

**Giới hạn của các route cấp phiên.** Chúng chỉ còn hợp lệ khi phiên **chưa có đề cương xác nhận** (tức còn đúng một câu mặc định). Khi phiên đã có nhiều câu hoặc đã có `blueprint_confirmed_at`, mọi route cấp phiên bị **từ chối `409` kèm câu tiếng Việt nói rõ** ("phiên này có N câu — sửa tài liệu chấm theo từng câu"). Không route nào được tự chọn một câu để ghi.

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

**Tên có dấu.** Hôm nay `matchEntries` chỉ hạ chữ thường, **không chuẩn hoá Unicode** (không có `normalize` nào trong `submission/` hay `grading/pipeline/`), nên `Bài1.py` ở dạng NFC và NFD bị coi là hai tên khác nhau và báo "thiếu" oan; tên trong ZIP do Windows tạo còn có thể mang mã hoá cũ. Spec yêu cầu: chuẩn hoá **cả hai phía** về NFC trước khi so, kiểm hành vi bộ đọc ZIP với tên tiếng Việt, và có test với cả hai dạng. Giới hạn đã biết còn lại: sandbox chỉ nhận đường dẫn Latin không dấu (`safePath`), nên một file phụ có dấu trong chương trình của câu vẫn làm job bị từ chối (bẫy 12 của guide) — ghi vào test của P2.

**Nơi giải nén — CHỐT (chủ đồ án, 2026-10-12): worker sandbox, trong container dùng một lần, là cơ chế duy nhất cho cả ZIP lẫn RAR.** Hôm nay ZIP đã được giải nén **trong tiến trình API** (`source-files.ts`, có trần chống bom) — rủi ro nền đã tồn tại; thêm RAR là thêm một bộ giải nén chạy trên đầu vào của sinh viên ngay trong tiến trình giữ khoá model và DB. Không giữ "tiến trình con trong API" làm đường lùi lúc chạy, vì hai cơ chế là thứ mục này muốn tránh; nó chỉ được dùng nếu spike ở đầu P2 thất bại.

"Trong worker" **chưa phải ranh giới an toàn**: tiến trình worker điều khiển Docker và API tin kết quả của nó, nên một lỗi parser ở đó không lộ khoá nhưng vẫn cho phép **làm giả kết quả chạy**. Vì vậy giải nén phải chạy **trong container** `--network none --read-only --cap-drop ALL` như khi chạy bài. ZIP dùng được image Python sẵn có; RAR cần công cụ giải nén, tức là **thêm một image**. Worker chưa có Dockerfile trong repo (guide §8.1 đã ghi), nên **đưa worker vào repo (Dockerfile, runbook) là tiền đề của P2**.

Tiêu chí đạt/trượt của spike ở đầu P2:
1. Worker lấy file nén qua URL ký hoặc `fileRef`, không cần khoá nào.
2. Chỉ trả về văn bản các file của câu, với trần nhỏ hơn nhiều trần cả file nén.
3. Giải nén **một lần cho mỗi bài nộp**, dùng lại cho N câu.
4. Bộ file xấu bị từ chối đúng trần và worker **không sập**: bom ZIP và bom RAR, đường dẫn `../`, symlink, nén lồng nhau, RAR mã hoá, tên NFC/NFD, tên mã hoá cũ của Windows.
5. Báo độ trễ thêm mỗi bài nộp (tham chiếu: khoảng 1,25 giây cho một job biên dịch cộng một ca; 1–2 giây mỗi bài là hợp lý).

Còn lại một phần rủi ro: bộ kiểm nội dung file nén (`archive-check`) vẫn **liệt kê tên mục RAR ngay trong API**. Thêm chế độ `list` cho cùng loại việc, làm **sau P2**. Nếu bảng phân loại hình dạng đề ở P0 cho thấy RAR hiếm, cân nhắc coi ZIP là đường chính và RAR là đường phụ.

### 4.3 Thiếu mục của câu

Khâu thu bài đã biết chính xác mục nào thiếu (đối chiếu `entries`), nên đây là sự thật xác định. Câu đó ra `ungradable(submission)` với lý do "không nộp file của câu k". Hệ thống **không tự cho 0**: quy tắc dự án coi 0 điểm là phán quyết của giảng viên.

Khi câu "thiếu" thật ra là **đặt tên lệch** (`cau2.py` thay vì `bai2.py`), giảng viên có thao tác **"Chỉ định file cho câu này"**: chọn một mục trong chính file nén của sinh viên đó, hệ thống ghi một dòng `exam_problem_binding` (tường minh, có người chọn, có thời điểm, có `audit_log`), rồi xếp câu đó vào hàng chấm qua đường chấm lại hiện có. Việc chọn vẫn là **quyết định tất định của một người**, không phải đoán của hệ thống, và rẻ hơn nhiều so với chấm tay cả câu. Nhờ phòng ngừa ở agent (§5.3) trường hợp này hiếm, nên không cần cơ chế nào tự động hơn.

### 4.4 Xác nhận 0 điểm hàng loạt

Một thao tác **"Xác nhận 0 điểm cho các câu không nộp"** cho cả phiên. Giao diện là **một nút duy nhất** cho cả phiên; nó ghi N dòng `teacher_review` kiểu `manual_score` có lưu vết (kiểu này đã có) trong **một transaction** (hoặc tất cả hoặc không dòng nào), và có hộp xác nhận nói số câu và số sinh viên bị ảnh hưởng. Luôn do giảng viên bấm. Công sức không tăng theo số câu thiếu.

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
- Agent đã in các tên đó ra tờ hướng dẫn (`apps/agent/src/exam-materials.ts:199-218`).
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
| 1. Cấu trúc | Tách danh sách câu: số thứ tự, tên, điểm, đề từng câu, ngôn ngữ, yêu cầu độ phức tạp, ví dụ vào/ra, **rubric nhúng trong đề nếu có**; tên file | Soạn đề: **chuyển thẳng** (đã có cấu trúc). Đề tự soạn: văn bản lấy từ DOCX/TXT hoặc **PDF có lớp chữ** (cần bộ đọc PDF, §1.4), rồi AI đọc đề, trả JSON chặt. Tên file không có trong đề thì lấy từ danh sách đã khai ở yêu cầu nộp, hoặc đề xuất `bai{n}.<đuôi theo ngôn ngữ>` |
| 2. Đáp án mẫu | Mỗi câu một chương trình | Giảng viên có: ghép theo câu. Chưa có: AI viết |
| 3. Gói test | Ca theo nhóm cho từng câu | Soạn đề đã sinh. Chưa có: AI sinh |
| 4. Kiểm bằng chạy thật | Chạy đáp án mẫu qua sandbox với từng ca | Sandbox hiện có |
| 5. Rubric và đề xuất lỗi | Tiêu chí của câu (tổng bằng điểm câu), lỗi gợi ý dạng `proposed` | **Rubric nhúng trong đề thì dùng trực tiếp** (kèm đoạn trích nguyên văn, kiểm tổng các tiêu chí = điểm câu); không có thì chép từ rubric cũ; không có nữa thì AI đề xuất |

Khớp bảng §2.1 của spec lõi (đề + đáp án mẫu → hệ thống dựng bộ input rồi **chạy đáp án của giảng viên**; chỉ đề → hệ thống viết cả đáp án lẫn gói test, **chưa kiểm chứng cho tới khi giảng viên duyệt**). Cả ba nguồn đi chung một quy trình (R7).

### 6.3 Output mong đợi có hai nguồn độc lập

Mỗi ca có output do LLM dự đoán và output do **chạy đáp án mẫu thật** trong sandbox (T-POL-4 của spec lõi: chuẩn rút từ đáp án mẫu chạy thật, không từ đọc văn bản). Hai bên khớp thì ca được tin. Lệch thì ca thành **ngoại lệ**, không tự tin bên nào. Việc này vá lỗ hổng đã biết: gói test từ Soạn đề hôm nay được tự duyệt và ghim với `expected_output` do LLM viết mà chưa từng chạy đáp án mẫu (`exam-authoring/ai-provider/claude-authoring.provider.ts:184`; `grading/test-bundle/test-bundle.service.ts:58-108`).

Giới hạn thật: hai nguồn đồng thuận chỉ chứng minh không có lỗi **cài đặt**; nếu model hiểu sai chính đề thì cả hai cùng sai. Đáp án mẫu do **giảng viên** cung cấp là nguồn sự thật độc lập duy nhất, nên chuyển trường hợp "chỉ đề" thành "đề + đáp án" làm thước đáng tin hơn.

### 6.3b Độ tin cậy của thước (bảo vệ ngữ nghĩa)

§6.5 bảo vệ **cấu trúc** (số câu, điểm, tên file). Lỗi đắt hơn là lỗi **ngữ nghĩa**: ở nhánh "chỉ đề", output dự đoán lẫn đáp án mẫu đều do **cùng một model** viết, nên cùng hiểu sai đề thì cùng sai và hai nguồn vẫn "khớp". Hai bước rẻ, độc lập với model:

1. **Ví dụ vào/ra có sẵn trong đề.** Đề CTDL&GT hầu như luôn có ví dụ. Hệ thống trích các ví dụ (kèm đoạn trích nguyên văn mà code kiểm có thật trong đề) và **bắt đáp án mẫu, khi chạy thật trong sandbox, tái tạo đúng các ví dụ đó**. Lệch → ngoại lệ chặn, không đi tiếp. **Giới hạn:** đề thật đầu tiên (Phụ lục C, mục 7) **không có ví dụ vào/ra nào**, nên bước này không dùng được cho đề đó; khi đề không có ví dụ thì chỉ còn bước 2 và cờ `ruler_unverified`.
2. **Giảng viên liếc vài ca.** Với nhánh "chỉ đề", màn xác nhận hiện 2–3 ca vào/ra cho mỗi câu để giảng viên nhìn trong vài giây. Chi phí nhỏ, và chỉ phát sinh ở nhánh có rủi ro ngữ nghĩa.

**Ba mức tin cậy của thước** (lưu cạnh `model_answer_unverified` đã có ở `grading_reference`): `teacher` (đáp án do giảng viên cung cấp) · `verified` (khớp ví dụ trong đề, hoặc giảng viên đã liếc và xác nhận) · `unverified` (chỉ do model viết). Khi thước còn `unverified`, `decide()` thêm cờ cả bài `ruler_unverified` và **không tự duyệt** bài nào dựa trên thước đó (trần tin cậy, hướng sai là an toàn: bài về giảng viên, không bao giờ tự duyệt oan). Cờ tự gỡ ngay khi thước lên `verified`; vì vậy một lần liếc là đủ.

**Chia việc theo pha, vì cờ này là một thay đổi hành vi có chủ ý.** (a) **P1a** chỉ thêm cột `ruler_trust` và backfill, **không** đổi hành vi. Ánh xạ backfill (chủ đồ án duyệt): dòng `grading_reference.model_answer_unverified = true` → `unverified` (giữ nguyên); mọi dòng còn lại → `teacher`. (b) **P1b** mới bật cờ `ruler_unverified` trong `decide()`. Hệ quả cần ghi rõ: một phiên 1 câu có đáp án từ Soạn đề chưa kiểm chứng **hôm nay tự duyệt được, từ P1b thì không** — trái "chạy y như cũ" của R5, nên đây là ngoại lệ **được nêu tên**, và lượt "không tụt" ở §11 phải chạy trên một phiên thuộc loại `teacher`. Kịch bản `ngan-xep-v1` **thuộc loại `teacher`**: bộ diễn tập tạo gói test bằng route của giảng viên rồi duyệt và ghim (`eval/rehearsal/cli.ts:180-182`) và chỉ khai đề, không khai đáp án mẫu (`cli.ts:178`), nên không bị cờ mới chặn. Cần thêm một kịch bản thứ hai thuộc loại `unverified`, kỳ vọng "về giảng viên", để kiểm chính ngoại lệ đó. (c) **P3** mới nâng thước lên `verified` bằng ví dụ trong đề và lần liếc ca. Công sức **không tăng theo số bài nộp** và chỉ tăng rất nhẹ theo số câu (vài giây mỗi câu, và chỉ ở nhánh "chỉ đề"); nói chính xác như vậy thay vì hứa "không tăng theo số câu", vì việc liếc ca là một việc nhỏ nhưng có thật.

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
3. **Ràng buộc cứng do code kiểm:** số câu = số file khai; tổng điểm = tổng điểm đề (mặc định 10, hoặc theo đề); thứ tự câu liền mạch; mỗi câu có đề không rỗng; **không có hai câu trùng nội dung** (độ giống vượt ngưỡng → ngoại lệ); mỗi rubric nhúng có tổng các tiêu chí bằng điểm câu. Vi phạm → **dừng** (fail-closed). Ngoài ra có hai cảnh báo ⚠ không chặn: câu **không có rubric nhúng** (dùng rubric chép hoặc AI đề xuất), và câu **mô tả "viết hàm" trong khi gói test chạy qua stdin/stdout** — sinh viên có thể chỉ viết hàm mà không đọc input, không in output, rồi bị trừ oan đồng loạt (Phụ lục C, mục 5).
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
- Lỗi lạ chưa có trong bảng: agent ghi vào `missingRules`; hệ thống tạo luật `proposed` (`origin = 'agent_reported'`) kèm **nơi thấy** (bài, phiên, rubric) (`grading/rules/missing-rules.ts:25-66`). Agent không bị gián đoạn.

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

Spec lõi đã thiết kế "canh thước sau khi chấm" (cột `grading_test_case.auto_dropped_reason` đã có) nhưng **chưa cài**: không có bảng cảnh báo, không đâu ghi `auto_dropped_reason`. Spec này đưa nó vào. Thước đo phải cụ thể, vì "gần như cả lớp sai" mơ hồ: với 30–40 sinh viên, một câu khó vốn có thể hỏng nhiều, và theo dõi từng bài một lúc đang chấm còn bị thiên lệch theo thứ tự hoàn thành và so sánh nhiều lần.

- **Độ phân biệt của ca, không phải tỉ lệ sai thô.** Với mỗi ca *c* của một câu, lấy tập sinh viên **mạnh** (qua ≥ 90% các ca *khác* của cùng câu), rồi tính tỉ lệ trong tập đó **sai ca *c***. Ca nghi ngờ khi tỉ lệ này vượt ngưỡng *và* tập mạnh đủ lớn.
- **Cỡ mẫu tối thiểu.** Không đánh giá khi tập mạnh nhỏ hơn một ngưỡng (đặt ở P4 từ dữ liệu diễn tập). Với lớp nhỏ, ca chỉ ghi nhận chứ không kích hoạt.
- **Đánh giá theo mốc, không theo từng bài:** khi đã có tối thiểu max(10, 25%) số đơn vị của câu xong, và một lần nữa lúc kết thúc lô. Có hiệu chỉnh cho việc kiểm nhiều ca cùng lúc (ví dụ Bonferroni trên các ca của câu).
- **Báo động giả đi ngược R1**, nên mức phản ứng chia hai bậc: vượt ngưỡng thường → **chỉ cảnh báo** ở đầu trang phiên; vượt ngưỡng chặt hơn → **tạm dừng tự duyệt** chỉ các bài dính ca đó cho tới khi giảng viên quyết (bỏ ca → tính lại trên kết quả đã lưu, không chạy lại sandbox, như luật máy kiểm hôm nay). Không bao giờ tạm dừng cả phiên.
- Các ngưỡng là **tham số**, chỉnh trên dữ liệu diễn tập ở P4, và mỗi lần chỉnh phải ghi lý do.

Đây là lưới bắt cho phần tách sai lọt qua §6.5 và ca test sai lọt qua §6.3 / §6.3b.

### 7.6 Luật lời thêm sau khi chấm

Theo guide §2.2, luật lời tạo sau cuộc điều tra không tự áp cho bài đã chấm (các bài đó bị gắn cờ "chưa xét hết tiêu chí" và chờ chấm lại; chấm lại hiện chỉ có cho bài lỗi hệ thống). Để luồng "ghi đề xuất, giảng viên nhận sau" **đóng vòng**, cần một lượt **"kiểm lại riêng luật này"** rẻ hơn chấm lại cả bài: với các bài chưa từng được kiểm luật mới, chạy một lượt điều tra hẹp chỉ cho luật đó. Với các bài mà agent đã báo đúng lỗi này (bản ghi "nơi thấy"), dùng chính bằng chứng đã lưu. Thiết kế chi tiết thuộc plan P4; điểm kiểm lại ở plan phải xác nhận lại hành vi `T-FAIR-1`/`rulesSeen` trước khi cài.

**Khe hở chấp nhận được giữa P1 và P4 (ghi rõ để không ai tưởng đã đóng vòng):** trước khi P4 xong, luật lời nhận sau khi chấm chỉ tạo ra trạng thái `proposed`/luật mới; các bài đã chấm không được kiểm lại luật đó và bị gắn cờ "chưa xét hết tiêu chí". Cách xử lý tạm là giảng viên chấm tay từng bài bị gắn cờ (đường chấm tay hiện có). Đây là hành vi của hôm nay, không phải thoái lui.

---

## 8. Điểm tổng, chốt, kiểm mù, xuất sổ

- **Tổng** là hàm đọc (§3.4). Hiển thị "tạm" tới khi mọi câu xong; "—" nếu sinh viên có câu `audit_pending`, để không lộ điểm của câu bị che.
- **Chốt điểm** giữ ở cấp phiên: máy trạng thái 15 cặp, trigger bất biến và `finalizeGrades` đếm theo từng kết quả nên chạy được không sửa *[bản đồ ảnh hưởng]*. Chốt được khi không còn kết quả ở `ai_grading`, `ai_graded`, `flagged_for_review`, `audit_pending` (`BLOCKS_FINALIZE`).
- **Kiểm mù rút theo sinh viên.** Một sinh viên được rút thì mọi câu **tự duyệt** của họ vào kiểm mẫu, trình bày gộp ("HS2410020 — Câu 1, Câu 3"). Việc che điểm và lỗi vẫn áp **theo từng câu** như hôm nay. Rút bằng SHA-256 trên `(seed phiên, MSSV)` — tất định, không nhìn điểm. **Đây là thay đổi so với hôm nay**: `audit-sampling.ts` đang rút theo `(seed, resultId)` ở quyết định đầu tiên của từng kết quả. Plan P1 phải ghi rõ bước chuyển và kiểm lại phân bố (hash đều, sàn 5% còn đúng khi mẫu tính theo sinh viên). Giữ tỉ lệ mặc định 20% (`GRADING_AUDIT_SAMPLE_PERCENT`), sàn 5%, không bao giờ 0. Khối lượng kiểm không nhân theo số câu. **Lưu ý thống kê:** sàn 5% của 30–40 sinh viên chỉ khoảng 2 người — mẫu này để an toàn, **không đủ để ước lượng độ chính xác**. Vì vậy kết quả kiểm (đồng ý hay lệch, bao nhiêu lỗi lệch) phải được **tổng hợp** thành báo cáo mức đồng thuận tích luỹ qua các phiên; hôm nay `audit_sample_review` được ghi nhưng chưa ai đọc (spec lõi §8, `calibration_run` chưa có người ghi).
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

**Cả ba bẫy kích hoạt ngay ở pha 1** (nhiều câu trong một phiên đã nghĩa là nhiều rubric trong một phiên, nên bẫy 2 làm rơi luật lời ngay cả khi chưa có file nén). Vì vậy cả ba sửa nằm trong **P1**, không để P2 trở đi.

Ngoài ba bẫy: `planReapply` (`score.service.ts:435`) lấy giá theo `es.rubric_id` — phải theo `g.rubric_id_version` của chính kết quả *[bản đồ ảnh hưởng]*; `grading_anchor_snapshot` chỉ nổ khi `GRADING_ANCHORS_ENABLED=true` (mặc định tắt).

---

## 10. Migration, phân pha, chia plan

### 10.1 Chiến lược migration (chỉ thêm)

- **Pha 1 — câu là một yêu cầu nộp riêng** (bài nộp ↔ kết quả vẫn một-một, **chưa đụng** unique): thêm `exam_problem`, `problem_id` cho phép rỗng ở `grading_result`/`grading_test_bundle`/`grading_reference`. Backfill câu mặc định cho phiên đã có kết quả trong **một transaction có cổng checksum** trước/sau trên (`ai_total_score`, `status`, các dòng `score_computation`, `updated_at`), tắt `trg_grading_result_updated_at` tạm thời theo tiền lệ migration `1789430000000`. Diễn tập trên bản sao trước khi áp lên Supabase, chạy `-t all` (`migrationsTransactionMode` là `none`).
- **Pha 2 — câu nằm trong file nén:** đổi `uq_grading_result_submission` thành `unique(submission_id, problem_id)`; mã công việc theo `resultId`; đọc RAR; `source-files` theo câu; agent tạo sẵn file và kiểm trực tiếp.
- **Thứ tự triển khai (Railway tự deploy `main` và không chạy migration):** (1) áp migration **chỉ-thêm** lên DB **trước** khi merge — code cũ không bị ảnh hưởng vì chỉ thêm bảng và cột cho phép rỗng; (2) merge/deploy code mới; (3) chạy lại backfill một lần nữa để quét các dòng mà code cũ tạo ra **trong khoảng giữa** (chúng có `problem_id` rỗng). Làm ngược thứ tự (deploy trước, migration sau) làm code mới lỗi SQL "cột không tồn tại" ngay lập tức. Trong suốt pha 1, code mới coi `problem_id` rỗng là **câu mặc định** của phiên, nên không dòng nào bị bỏ sót dù backfill chạy muộn.
- **Gỡ bí danh, có cơ chế chống tái phát.** Các cột `exam_session.rubric_id` / `test_bundle_id` và các route cấp phiên bị gỡ **trong PR hoàn tất P2**, bằng một migration dọn dẹp. Từ P1, một test quét import (cùng kiểu `decision.import-scan.spec.ts`) **thất bại nếu bất kỳ file nào ngoài `resolveProblemConfig()` còn đọc hai cột đó**, để giai đoạn song song không tích thêm chỗ đọc và dữ liệu không lệch giữa hai nguồn.
- **Cổng phiên bản schema lúc khởi động.** Hôm nay không có kiểm tra migration chưa áp khi khởi động (`grep` không thấy `migrationsRun`/`showMigrations`/`pendingMigrations`), nên thứ tự "migration trước, merge sau" chỉ dựa vào việc người nhớ làm; lịch sử migration lệch DB đã từng xảy ra. P1 thêm kiểm tra lúc khởi động: còn migration chưa áp thì `/health` báo lỗi, để healthcheck của Railway ngăn bản deploy mới thay bản cũ (hành vi healthcheck của Railway cần xác nhận lúc cài).
- **Công việc cũ trong Redis** chỉ có `submissionId`: ở pha 1 (bài nộp ↔ kết quả vẫn một-một) bộ xử lý tìm kết quả theo `submissionId` như cũ; chỉ khi sang pha 2 (mã công việc theo `resultId`) mới cần cơ chế khác cho job tồn đọng.
- **Cổng trước khi đổi unique ở pha 2:** `SELECT count(*) FROM grading_result WHERE problem_id IS NULL` phải bằng 0, nếu không dừng. Hai cặp migration trùng timestamp đã có từ trước (TypeORM 0.3.31 không ép thứ tự), nhưng migration mới nên dùng dải timestamp riêng.

### 10.2 Chia thành các plan độc lập

| Plan | Nội dung | Phụ thuộc |
|---|---|---|
| **P0** | Đo nền, cổng trước P1: diễn tập thật trên `main` hiện tại; sửa runner eval chạy cả phản biện và quyết định để nhóm tự quyết có mẫu số; ghi `cost_usd` và `prompt_version`; đo thật thời gian, token, chi phí **mỗi đơn vị** (kèm lăng kính); bảng phân loại hình dạng đề thật (§1.4) | — |
| **P1a** | **Chỉ mở rộng, không đổi hành vi:** bảng `exam_problem`, `problem_id` cho phép rỗng, câu mặc định, `resolveProblemConfig()`, ba bẫy §9, cột `ruler_trust` + backfill (§6.3b), cổng phiên bản schema (§10.1), test chống tái đọc cột bí danh. Bị chặn bởi "1 câu chạy như cũ" (§11) | P0 |
| **P1b** | **Phiên nhiều câu:** đường tạo câu tối thiểu (§10.3 mục 4), danh sách theo sinh viên, điểm tổng, xuất tổng, canary đường đọc tổng, bật cờ `ruler_unverified` (ngoại lệ có tên, §6.3b) | P1a |
| **P2** | Câu trong file nén: spike giải nén trong container (§4.2), đưa worker vào repo, đổi unique, mã công việc, đọc RAR, `ProblemSourceResolver`, agent tạo sẵn file và kiểm trực tiếp (§5.3), xác nhận 0 hàng loạt (§4.4) | P1b |
| **P3** | Dựng đề cương tự động và các lớp phòng thủ (§6), bộ đọc PDF, màn xác nhận, kiểm đột biến | P1b |
| **P4** | Canh thước (§7.5), chính sách lỗi lạ (c) và gom nhóm đề xuất (§7.4), "kiểm lại riêng luật này" (§7.6) | P1b |
| **Spec riêng sau P1** | `probe` / `compare_peers`, kèm ba điều kiện ở §1.4 | P1a |

Mỗi plan có kiểm chứng riêng (§11). Thứ tự giao: **P0 → P1a → P1b → (P2, P3, P4 song song được)**. P1 tách làm hai vì nó chạm khoảng 22 file prod và 43/90 e2e: P1a chỉ mở rộng nên dễ review và dễ rollback, P1b mới có hành vi mới. P0 là điều kiện trước P1a vì mọi tuyên bố "không tụt" và mọi ngưỡng trong §6.3b, §7.5, §11 cần số đo nền; riêng việc runner eval chạy phản biện và quyết định còn là điều kiện trước P3. Chưa có lượt diễn tập thật nào kể từ 2026-09-28, trước PR #63, G1–G5 và việc chuyển điểm sang `rubric_error`.

**P0 phụ thuộc môi trường ngoài** (khoá model, VM sandbox, DB thật), nên có điều kiện kết thúc để không kéo dài vô hạn và được phép đổi phạm vi P1:
- **Xong khi** có ít nhất một bản ghi diễn tập thật trên `main` hiện tại (kịch bản `ngan-xep-v1`, một lượt chạy đủ) và được so với lượt `20260928T094907Z-f83a05c`, kèm số thời gian, token, `cost_usd` mỗi đơn vị.
- **Nếu lộ hồi quy** so với lượt 2026-09-28 (từ PR #63, G1–G5 hay việc chuyển điểm sang `rubric_error`): P0 xuất danh sách hồi quy; chúng được sửa **trước P1b**, còn P1a (không đổi hành vi) có thể bắt đầu song song.
- **Nếu môi trường chưa sẵn sàng** sau 3 ngày làm việc kể từ lúc bắt đầu: P1a bắt đầu mà không chờ, P1b chờ số đo. Mốc này ghi lại, không âm thầm kéo dài.
- Tình trạng môi trường lúc viết: xem §10.4.

---

### 10.3 Năm điều kiện chủ đồ án duyệt kèm (phải vào plan)

1. **Cổng schema và R4.** Hai dòng migration lệch cũ (`AddAiUsage`, `AddArchiveContentCheck`) **đã được áp** (đo 2026-10-12: DB thật 56 dòng, repo 57 file). Dòng còn thiếu là `1789560000000-AddClassNominalClass` (từ PR #71, thêm `class.nominal_class_id`): production đã deploy `dc2d022` lúc 05:30Z trong khi cột chưa tồn tại trên DB thật, và entity `Class` đã dùng cột đó (`course/entities/class.entity.ts`). Nghĩa là cổng schema, nếu bật hôm nay, sẽ **đỏ đúng lý do**, và nó cũng là một ví dụ sống cho sự cần thiết của cổng. Plan P1a: bước đầu tiên đo lại bảng `migrations` và **không bật cổng trước khi DB thật khớp repo**.
2. **`ruler_unverified` và R5:** mô tả đầy đủ ở §6.3b (ánh xạ backfill, `ngan-xep-v1` thuộc loại `teacher`, ngoại lệ có tên, cần thêm kịch bản `unverified`).
3. **Tách P1 làm hai** (P1a chỉ mở rộng, bị chặn bởi "1 câu chạy như cũ"; P1b mới có phiên nhiều câu): bảng ở §10.2.
4. **Đường tạo câu ở P1**, để P1 không thành tính năng không ai dùng được và P3 (phần rủi ro nhất) không chặn mọi giá trị người dùng: (a) **"Gắn đề vào phiên" từ Soạn đề tạo N câu tự động**, vì dữ liệu theo câu (`statement`, `points`, `modelAnswer`, `testBundle`) đã có cấu trúc, không cần AI tách — nhóm (1), một trong hai nhóm đông nhất, dùng được ngay ở P1b; (b) một màn **"Đề cương" thủ công tối thiểu** cho nhóm (3) cho tới khi có P3: thêm từng dòng (file hoặc mục trong file nén, điểm, rubric, gói test); (c) kịch bản diễn tập tạo câu qua route nội bộ kèm seed. P3 sau đó chỉ **thay việc nhập tay** bằng dựng tự động.
5. **P0 được phép đổi phạm vi P1**, có điều kiện kết thúc (§10.2).

### 10.4 Tình trạng môi trường lúc viết (2026-10-12)

- **Khoá model:** `apps/api/.env` có `GRADING_TIER1_*` và `GRADING_TIER2_*` (đủ ba biến mỗi bậc), `ANTHROPIC_API_KEY` và `SANDBOX_REDIS_URL` (chỉ kiểm sự hiện diện, không in giá trị).
- **VM sandbox:** dự án GCP `animated-moon-460103-m3` trả lỗi *"This API method requires billing to be enabled"* khi liệt kê instance, nên VM **không liệt kê và không bật được** cho tới khi billing được bật lại (việc của chủ đồ án trên console). Không có VM thì không có sandbox và P0 không chạy được lượt thật; điều kiện "môi trường chưa sẵn sàng" ở §10.2 áp dụng.
- **DB thật:** còn một migration chưa áp (§10.3 mục 1).

## 11. Kiểm thử và nghiệm thu

- **Bất biến cũ chạy nguyên:** e2e vòng đời 15 cặp, trigger 8 cột AI, các bảng chỉ-thêm; thêm test bất biến `problem_id` (cập nhật `T-LIFE-1`).
- **Bước đầu tiên của P1 (trước khi viết code):** lập danh sách **cụ thể** các test bị ảnh hưởng (43/90 e2e và 12/147 unit của API, 44/136 test web chạm mô hình chấm; riêng `grading-lifecycle.e2e-spec` kiểm unique phải viết lại; seed ở `test/helpers/grading-seed.ts` chèn `grading_result` không có `problem_id`) để việc cập nhật test không bị bỏ sót.
- **Viết trước, thấy đỏ:** ba bẫy §9; `planReapply` theo rubric của kết quả.
- **Canary đường đọc tổng (bắt buộc ở P1):** test chứng minh mọi đường trả tổng điểm (danh sách, hồ sơ, xuất sổ, CSV) **không lộ** điểm của câu `audit_pending`, theo mẫu canary của kiểm mù hiện có.
- **Kiểm đột biến** bộ tách đề cương (§6.6): các lớp phòng thủ bắt 100% lỗi nghiêm trọng.
- **Chứng minh "1 câu chạy như cũ":** chạy lại kịch bản `ngan-xep-v1` và so với lượt `20260928T094907Z-f83a05c` (điểm 5/5, lỗi 8/8, tự duyệt sai 0); không tụt ở chỉ số nào. Ghi bản ghi và dòng so sánh vào `apps/api/eval/rehearsals/` theo quy ước lịch sử benchmark.
- **Kịch bản diễn tập mới nhiều câu** (đề 3 câu, cả file riêng lẫn trong file nén; ít nhất một bài thiếu mục, một bài đặt tên lệch, một bài có lỗi lạ có bằng chứng). Tên kịch bản chốt ở plan P1. Cần key model và VM sandbox bật.
- **Eval offline (điều kiện trước P3, không phải gạch đầu dòng tuỳ chọn):** thêm fixture nhiều câu; runner eval **phải chạy cả khâu phản biện và quyết định** để nhóm tự quyết có mẫu số. Hôm nay runner truyền `challenge: null` (`src/eval/investigator-runner.ts`) và `autoDecision.count = 0` ở mọi lượt, nên **không đo được** precision của nhóm tự quyết lẫn hành vi của lăng kính.
- **Ngân sách mỗi đơn vị và mỗi phiên (đo ở P0, không đoán).** Thời gian, token và chi phí **nhân theo số câu**, trong khi R1 chỉ nói về công sức giảng viên. Ước lượng thô, tính từ số đã commit và **chưa đo** với lăng kính: p50 ≈ 11,4k token mỗi đơn vị ở cấu hình mỏng của eval offline → 120 đơn vị (40 × 3) ≈ 1,3 triệu token chỉ riêng agent điều tra, chưa tính bốn lăng kính; với đồng thời 5 và 74–148 giây mỗi bài trong diễn tập thì ≈ 30–60 phút cho 120 đơn vị. Spec lõi đặt mục tiêu 40 bài ≤ 30 phút khi mỗi sinh viên chỉ một đơn vị (§15.2; chính spec lõi đã ghi nó có thể phải xét lại ở §11), nên **mục tiêu phải đặt lại theo số câu**. P0 ghi số thật (thời gian, token, `cost_usd` mỗi đơn vị và mỗi phiên), rồi mới đặt mục tiêu và chọn đòn bẩy (nâng `GRADE_CONCURRENCY` trong giới hạn của gateway, ngân sách lăng kính nhẹ hơn cho đơn vị sạch…).
- **Tiêu chí hoàn thành toàn bộ:** một đề 3 câu, 40 bài, cả hai cách nộp. Giảng viên đi từ tạo phiên, gắn đề, xác nhận đề cương **một lần**, thu bài, bấm chấm, xử lý ngoại lệ, chốt, đến nhận file sổ điểm có tổng, không gặp ngõ cụt.
- **Tiêu chí an toàn tự duyệt, nêu rõ ngưỡng thống kê.** Theo quy tắc ba, 0 lỗi trên *n* đơn vị **tự duyệt** cho cận trên 95% xấp xỉ 3/*n*. Mẫu số là số đơn vị được **tự duyệt**, không phải mọi đơn vị: ở tỉ lệ tự quyết đo được 35%, một lớp 40 × 3 = 120 đơn vị chỉ cho khoảng 42 đơn vị tự duyệt, tức cận trên ≈ 7%. Vì vậy: tuyên bố "tự duyệt sai ≤ 5%" đòi **0 lỗi trên ≥ 60 đơn vị tự duyệt**; tuyên bố "≤ 2,5%" đòi ≥ 120. Các đơn vị đó phải đến từ ít nhất 2 phiên hoặc ≥ 3 câu khác nhau, và được báo cùng cận trên (Clopper–Pearson). Đơn vị cùng sinh viên hoặc cùng câu không độc lập nên con số thật rộng hơn. Dưới ngưỡng thì ghi **"kiểm khói"**, không ghi "đạt". Một lượt diễn tập 5 bài dựng sẵn cho cận trên ≈ 60% (3/5) và **không bao giờ** được trích làm bằng chứng an toàn.

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
| Rò điểm bị che trong tổng | Tổng "—" khi có câu `audit_pending`; canary cho đường đọc tổng là **yêu cầu bắt buộc của P1** (§11) |
| Chưa có số "đúng bao nhiêu %" trên bài thật | Spec này **không** cải thiện điều đó; P0 và §11 nêu ngưỡng thống kê để không tuyên bố quá tay |
| Chi phí và thời gian nhân theo số câu | P0 đo thật; mục tiêu "40 bài ≤ 30 phút" đặt lại theo số câu (§11) |
| Thước `unverified` ở nhánh "chỉ đề" | Cờ `ruler_unverified` chặn tự duyệt tới khi lên `verified` (§6.3b) |
| Nơi giải nén RAR/ZIP | **Đã chốt:** container dùng một lần trong worker; spike ở đầu P2 với tiêu chí đạt/trượt (§4.2). Tiền đề: đưa worker vào repo |
| Billing GCP của VM sandbox đang tắt | Việc của chủ đồ án; chặn lượt thật của P0 (§10.4) |
| Migration `1789560000000` chưa áp trên DB thật trong khi production đã deploy code dùng nó | Báo chủ đồ án; plan P1a đo lại trước khi bật cổng schema (§10.3) |
| Chuẩn hoá Unicode tên mục | Bắt buộc ở P2, có test NFC/NFD (§4.2) |
| Độ phủ các hình dạng đề chưa hỗ trợ | Bảng phân loại trên 3–5 đề thật là điều kiện trước P1 (§1.4) |

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
| D14 | P0 đo nền là cổng trước P1; runner eval phải chạy phản biện và quyết định trước P3; tiêu chí an toàn nêu ngưỡng *n* theo quy tắc ba trên số đơn vị **tự duyệt** | Bản review ngoài do chủ đồ án chuyển (2026-10-12); người viết kiểm lại và nhận, chỉnh mẫu số từ "mọi đơn vị" sang "đơn vị tự duyệt" |
| D15 | Ba mức tin cậy của thước; `unverified` không tự duyệt; kiểm bằng ví dụ trong đề và để giảng viên liếc vài ca | Cùng bản review; nhận |
| D16 | Canh thước đo bằng độ phân biệt của ca, cỡ mẫu tối thiểu, đánh giá theo mốc, hai bậc phản ứng | Cùng bản review; nhận |
| D17 | Thao tác "Chỉ định file cho câu này" (`exam_problem_binding`) | Cùng bản review; nhận |
| D18 | Nơi giải nén RAR/ZIP: **worker sandbox trong container dùng một lần**, cơ chế duy nhất; spike đầu P2; chuẩn hoá Unicode tên mục | Chủ đồ án **chốt** 2026-10-12 (kèm tiêu chí spike và tiền đề đưa worker vào repo) |
| D19 | Cổng phiên bản schema lúc khởi động; test chống tái đọc cột bí danh; ghi `prompt_version` và `cost_usd` | Cùng bản review; nhận |
| D20 | `probe`/`compare_peers` tách thành spec riêng, đặt ngay sau P1, kèm ba điều kiện (§1.4): phụ thuộc `ruler_trust`, validator cùng checker, chế độ bóng trước | Chủ đồ án **chốt** 2026-10-12 |
| D21 | Tách P1 thành P1a (chỉ mở rộng) và P1b (phiên nhiều câu) | Chủ đồ án, điều kiện duyệt spec |
| D22 | Đường tạo câu ở P1: Soạn đề tạo N câu tự động + màn "Đề cương" thủ công tối thiểu | Chủ đồ án yêu cầu quyết rõ; người viết đề xuất cách này (§10.3) — **cần chủ đồ án xác nhận** |
| D23 | P0 có điều kiện kết thúc và được phép đổi phạm vi P1 | Chủ đồ án, điều kiện duyệt spec |
| D24 | Ánh xạ backfill `ruler_trust`: `unverified` giữ nguyên, còn lại thành `teacher`; `ngan-xep-v1` là `teacher` | Chủ đồ án (ánh xạ); người viết xác định loại của `ngan-xep-v1` bằng code (`cli.ts:178-182`) |
| D25 | Bộ đọc PDF có lớp chữ nằm trong phạm vi (không phải OCR); nên làm như một sửa độc lập sớm | Người viết, từ đề thật đầu tiên là PDF (Phụ lục C) — **cần chủ đồ án xác nhận** |

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

## Phụ lục C. Đề thật #1 và điều nó cho thấy (điểm dữ liệu đầu tiên cho bảng phân loại hình dạng đề)

Nguồn: `de-thi.pdf` do chủ đồ án đưa vào ngày 2026-10-12 (đề thực hành cuối kỳ CTDL&GT, Python, 2 trang, PDF có lớp chữ). Đây là **một** điểm dữ liệu, chưa phải bảng phân loại; P0 cần thêm 2–4 đề nữa.

| # | Quan sát | Hệ quả cho thiết kế |
|---|---|---|
| 1 | 3 câu, đều Python qua stdin/stdout; điểm 3 + 3,5 + 3,5 = 10 (khớp). Ngôn ngữ ghi ở đầu đề ("Ngôn ngữ: python"); mỗi câu có dòng "Yêu cầu độ phức tạp" | Hình dạng khớp mô hình "mỗi câu một chương trình". Ngôn ngữ và yêu cầu độ phức tạp **đọc được từ đề**, không cần giảng viên khai lại |
| 2 | **Rubric nhúng trong đề** cho Câu 1 (0,5 + 1,0 + 1,0 + 0,5 = 3) và Câu 2 (0,75 + 1,25 + 0,75 + 0,5 + 0,25 = 3,5); tổng từng câu khớp điểm câu | Chặng 5 (§6.2) dùng thẳng rubric nhúng, kèm đoạn trích và kiểm tổng; không cần AI đề xuất rubric. Giảm công sức giảng viên |
| 3 | **Câu 3 trùng nguyên văn phần đề bài của Câu 1** (`validate_expression`), không có dòng tiêu đề kiểu "Câu 3 (độ khó – điểm)" và **không có rubric**. Toàn bộ khung dòng của đề (tiêu đề, `Ngôn ngữ:`, `Câu N. (X điểm)`, `Yêu cầu độ phức tạp:`) **khớp từng dòng** với `buildExamPaperDocx` (`exam-authoring/docx/exam-paper.docx.ts:20-48`), nên đây rất có thể là bản xuất PDF của một đề Soạn đề *(suy luận từ định dạng, không có bằng chứng trực tiếp về cách tạo)*. Riêng thân Câu 3 thiếu dòng tiêu đề và rubric mà hai câu kia có; hai thứ đó nằm trong chính trường `statement` do model viết, không nằm trong mẫu in | Cần ràng buộc **phát hiện câu trùng** (§6.5) và cảnh báo thiếu rubric. Nguồn gốc của sự trùng lặp **chưa xác minh** (có thể sinh lại câu, có thể giảng viên chỉnh): cần hỏi giảng viên đây có cố ý không; nếu do Soạn đề thì cần sửa riêng ở Soạn đề (kiểm trùng khi sinh/sinh lại) |
| 4 | Đề **không nêu tên file** | Tên file lấy từ danh sách đã khai ở yêu cầu nộp, hoặc hệ thống đề xuất `bai{n}.py` và truyền cho sinh viên qua tờ hướng dẫn của agent (§5.3) |
| 5 | **Hợp đồng I/O lai:** Câu 1 nói "Viết hàm `validate_expression(s)`" nhưng phần Input/Output đòi đọc một dòng từ stdin và in `True`/`False`; Câu 2 yêu cầu `class Node`, `class BST` nhưng input là `n`, `n` giá trị, `p q` qua stdin | Sinh viên chỉ viết hàm mà không đọc input / không in kết quả sẽ không có output nào và bị trừ oan đồng loạt. Hôm nay hệ thống chỉ chạy chương trình trọn vẹn (chế độ driver hàm ngoài phạm vi). Cảnh báo ⚠ ở màn xác nhận (§6.5); cần nêu rõ hợp đồng I/O cho sinh viên; **nên cân nhắc đưa chế độ driver vào sớm hơn**, vì đề có tên hàm tường minh |
| 6 | **Tiêu chí không đo được bằng chạy test:** "Đúng độ phức tạp O(n)… không dùng thư viện ngoài" (0,5 điểm, Câu 1); "O(h), không chuyển cây thành mảng" (0,25 điểm, Câu 2); "Cấm dùng `eval`, `re`" | Cần `run_scaled` hoặc `ast_query` (chưa có). Trước khi có: hoặc là luật lời (tin cậy thấp), hoặc miễn trừ; **bài O(n²) vẫn có thể qua mọi test và lấy đủ điểm tiêu chí này**. Quyết cách xử lý ở P3 |
| 7 | **Không có ví dụ vào/ra cụ thể nào** trong đề (chỉ có quy tắc bằng lời). Có nêu ca biên rõ ràng: chuỗi rỗng, `n = 0` in `NONE`, `p = q` | Biện pháp "tái tạo ví dụ có sẵn trong đề" (§6.3b, bước 1) **không dùng được cho đề này**; còn lại bước 2 (giảng viên liếc ca) và cờ `ruler_unverified`. Các ca biên nêu trong đề cho phép dựng nhóm test `bien` một cách tất định |
| 8 | Nguồn gốc: nếu đề này đến từ Soạn đề thì cấu trúc theo câu **đã tồn tại** lúc soạn và chỉ bị mất khi giảng viên xuất file rồi tải lên lại thay vì dùng "Gắn đề vào phiên" | Với đề từ Soạn đề, đường đúng là P1b (tạo N câu từ dữ liệu có cấu trúc), không phải tách lại từ PDF. Đường tách PDF vẫn cần cho đề tự soạn (nhóm 3) và cho giảng viên đã tải PDF lên |
| 9 | Đề là **PDF**, không phải DOCX | Hôm nay `extractText` trả rỗng cho PDF, nên nếu đề này được tải lên làm đề chấm thì **mọi bài code ra `ungradable(system)`** (bẫy 11). Bộ đọc PDF có lớp chữ nằm trong phạm vi (§1.4, D25) |
