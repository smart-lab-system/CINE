# G2b — Thước theo câu: bỏ tự duyệt khi gắn, sinh đáp án và gói test, chạy thử

**Ngày:** 2026-10-17
**Phiên bản:** v3 (sau phản hồi Q1, Q2 và câu hỏi về `decide()`)
**Trạng thái:** chờ chủ đồ án trả lời Q3 và Q4 (mục 10), và duyệt tài liệu. Chưa có code, chưa có plan.
**Thay thế:** mục "G2b" trong `2026-09-29-ruler-from-authoring-design.md` §7 và ledger G2 mục 4 ("Còn mở").
**Phụ thuộc:** G2 (main, PR #66), P1a (main, `4301be1`), sandbox-worker (main). P1b Task 8 và PR-A2 cùng đọc `ruler_trust` (mục 2, Q3).

---

## 1. Vấn đề

- Ba nút ở `apps/web/src/app/teacher/grading/_components/PreparePanel.tsx:99-108` vẫn là `NeedsBackend`.
- Chưa có route nào sinh gói hay chạy thử. Route gói test hiện có (`test-bundle.controller.ts`): tạo tay, list, get, approve, pin, drop-case.
- Soạn đề luôn gắn `verification: 'unverified'` (`claude-authoring.provider.ts:184`). Không có đường nào chạy đáp án trong sandbox.
- **Lỗ hổng P0:** `TestBundleService.adoptFromAuthoring` (`test-bundle.service.ts:61-111`) tự duyệt và ghim gói có `expected_output` do LLM viết (dòng 93-97).
- **`decide()` trên main không đọc `ruler_trust` lần nào.** Cờ `ruler_unverified` chỉ có trên nhánh P1b (Task 8). Trên main, một phiên cũ đã ghim gói do LLM viết vẫn tự duyệt như bình thường.

**Mục tiêu:** không gói nào mang output do LLM viết được duyệt hoặc ghim. Thước chỉ được tin khi có bằng chứng chạy thật và giảng viên xác nhận.

## 2. Hai PR, theo thứ tự

### PR-A2 — bỏ tự duyệt khi gắn

1. **Gắn đề không tạo gói nào** (Q2). `adoptFromAuthoring` không còn được gọi từ đường gắn. `AttachResult.testBundle` là `null`, đúng với hợp đồng hiện có khi đề không sinh ca nào. Thêm `AttachResult.nextStep = 'create_bundle'` để UI đưa giảng viên sang bước chuẩn bị.
2. **Ghi mã nguồn lúc gắn** (D-B). Khi đề có đúng một câu có `modelAnswer`, ghi nguyên chuỗi đó vào khoá theo băm nội dung (`grading-reference/<sessionId>/source-<sha256>.<ext>`) và đặt `model_answer_source_key`, `model_answer_source_sha256`. Đây là mã, không phải output mong đợi, nên không phá nguyên tắc luật 1 của G2b. **Đề nhiều câu:** không ghi mã nguồn; để P1b xử lý khi có đa câu.
3. **`ruler_trust = 'unverified'` tường minh** cho mọi đường Soạn đề. Hôm nay nó đúng gián tiếp: `attach` truyền `modelAnswerUnverified: status !== 'passed'`, và status luôn là `unverified`.
4. **Đọc `ruler_trust` trong `decide()`** (Q3, mục 10). Một trường duy nhất cho hậu quả. Nếu chọn phương án này: `unverified` → cờ `ruler_unverified` cho bài, và không `auto_approved`. Quy tắc này khớp với P1b Task 8 và spec multi-problem §6.3b; hai bên không được kết luận khác nhau.
5. **Phiên cũ đã ghim gói `generated`:** không gỡ ghim âm thầm. Băng trên màn chuẩn bị đổi thành *"thước do model viết, chưa kiểm chứng"*. Điều kiện hiện tại của băng là `unverified && !hasPinnedBundle` (G2 spec §2.1); phải đổi thành chỉ dựa trên `ruler_trust`.
6. **Duyệt không bấm mù:** màn duyệt gói sinh ra hiện 2–3 ca vào/ra và dòng *"khớp nội bộ, chưa chứng tỏ đúng"*. Duyệt không tự nâng `ruler_trust` lên `verified`. Duyệt và ghim gộp thành một thao tác.
7. **Java và node bị bỏ khỏi `AUTHORING_LANGUAGES`** (`generate-exam.dto.ts:25`).
8. **Giữ và kiểm chặn bắt đầu chấm.** Đã có: `grading-run.service.ts:215-225` chặn 400 khi có bài đường điều tra và chưa ghim gói, với thông điệp "hãy tạo, duyệt và ghim một gói test". Thêm e2e: phiên Soạn đề không có gói → `start-grading` 400.
9. **Viết lại các test khẳng định tự duyệt, tự tạo gói từ đề** (mục 6).

**Hệ quả đã chấp nhận (Q1):** sau A2, phiên Soạn đề chấm code cpp, python không bắt đầu được cho tới khi có gói tay hoặc G2b. Trước A2, phiên đó chấm được ngay bằng thước chưa từng chạy.

**Điều kiện merge A2** (Q1, đã chấp nhận có điều kiện):
- **(G1) Worker sống.** Xem mục 8: bằng chứng hiện mâu thuẫn, nên cần kiểm trực tiếp trước khi merge.
- **(G2) Bạn duyệt rõ việc merge.** Theo quy ước đã ghi về PR, tôi không merge khi chưa có xác nhận.

### PR-G2b — ba nút, chạy thật trong sandbox

Mục 3 đến mục 5. Cần worker sandbox đang chạy để merge.

## 3. Ba hành vi

| Nút | Đầu vào | Ai viết ca input | Ai viết output mong đợi | `origin` gói | `model_answer_origin` | Sau khi bấm |
|---|---|---|---|---|---|---|
| Sinh đáp án mẫu và gói test từ đề | đề của câu | LLM, có trích dẫn đề và ví dụ vào/ra nếu đề có | chạy đáp án do LLM viết trong sandbox | `generated` | `generated` | gói chưa duyệt, chưa ghim; `ruler_trust` theo mục 4.6 |
| Sinh gói test từ đáp án của bạn | đề + đáp án GV (mã nguồn) | LLM đề xuất, mỗi ca phải trích đề | chạy đáp án GV trong sandbox | `from_model_answer` | `teacher` (không đổi) | gói chưa duyệt, chưa ghim |
| Chạy thử đáp án mẫu với gói test | đáp án mẫu + gói (chọn; mặc định gói đang ghim) | — | — | không tạo gói | không đổi | ghi một lượt chạy; không đổi duyệt, ghim, `ruler_trust` |

**Luật:**

1. **Output mong đợi luôn lấy từ chạy sandbox, không bao giờ từ văn bản LLM.** Không chạy được thì không ghi gì.
2. **Không nút G2b nào duyệt hoặc ghim gói.** Duyệt là hành động riêng của giảng viên, qua route `approve` có sẵn.
3. **Ca không trích được câu nào trong đề bị bỏ** trước khi giảng viên thấy (investigator §2.1 luật 2). Ghi `auto_dropped_reason`.
4. **Chạy thử không đổi `ruler_trust`.** Khớp với gói test chỉ chứng tỏ hai thứ nhất quán, không chứng tỏ đúng (investigator §2.1 luật 4).
5. **Chỉ `cpp` và `python`.** `java`, `node` trả 400.
6. **Không ghi đè đáp án của giảng viên.** Nếu `grading_reference` đang có `model_answer_origin='teacher'`, sinh từ đề trả 409. Đáp án `authoring` hoặc `generated` thì được thay; bản cũ vẫn truy được qua băm.

## 4. Thiết kế kỹ thuật

### 4.1 Vị trí code

- **Sinh** (gọi LLM, chạy sandbox): module `exam-authoring`, service mới. `grading` không được biết `exam-authoring` (ràng buộc ghi ở `test-bundle.service.ts:8-12`). Giao với `grading` qua `TestBundleService` và `GradingReferenceService`, đã được export.
- **Chạy thử** (không gọi LLM): module `grading`, cạnh `test-bundle.controller.ts`.
- **Cổng sandbox:** `INVESTIGATOR_DEPS.sandbox` (`grading.module.ts:193`, `investigator-deps.ts:51-52`). Giá trị `null` khi thiếu `SANDBOX_REDIS_URL`. Cần đưa cổng này sang `exam-authoring` qua một provider chung.
- **Chuẩn kiểm đáp án trên worker:** `checkBundleOnWorker` và `BUNDLE_GENERATOR_IMAGE` đang ở `apps/api/src/eval/test-bundle.ts` (dòng 14, 54). Chuyển về `grading/test-bundle/`; eval import lại. Không copy.

### 4.2 Dữ liệu

- **`grading_test_bundle`:** không thêm cột. Dùng `origin` có sẵn và `problem_id` đã được ghi.
- **`grading_reference`:** thêm hai cột.
  - `model_answer_source_key text NULL`: khoá của bản mã nguồn hiện hành.
  - `model_answer_source_sha256 text NULL`: băm của bản đó.
  - Khoá lưu **theo băm nội dung**: `grading-reference/<sessionId>/source-<sha256>.<ext>`. Bản cũ không bị ghi đè; cột chỉ trỏ tới bản hiện hành. Khi P1b có nhiều câu, khoá theo phiên sẽ đè nhau.
  - `upsert` hiện kiểm khoá cố định (`grading-reference.service.ts:128-134`). Sửa để chấp nhận khoá theo băm, cùng tiền tố `grading-reference/<sessionId>/`.
- **Bảng mới `grading_test_run`:**

  | Cột | Ghi chú |
  |---|---|
  | `id`, `exam_session_id`, `problem_id`, `test_bundle_id` | `test_bundle_id` có thể null ở lượt sinh đang chạy |
  | `kind` | `generate_statement` \| `generate_answer` \| `test_run` |
  | `source_sha256` | băm của mã nguồn lúc chạy |
  | `requested_by`, `requested_at`, `finished_at` | |
  | `status` | `running` \| `pass` \| `fail` \| `compile_error` \| `unavailable` \| `aborted` \| `dropped_all` |
  | `host` jsonb | dấu vân tay máy (contract §4) |
  | `cases` jsonb | `[{name, status, ms, diff}]`. Không lưu stdout. `diff` cắt còn 200 ký tự |

  **Trạng thái `running` và guard:** dòng `running` được INSERT trước khi gọi sandbox. Đúng một lần UPDATE được phép, từ `running` sang trạng thái kết thúc, cùng kiểu `guard_test_bundle_approve_once`. Dòng `running` quá 15 phút được coi là đã chết.
- **Migration:** một file, gồm `ALTER TABLE` cho hai cột, `CREATE TABLE`, và trigger guard. Không thêm enum.

### 4.3 Route

| Route | Trả về |
|---|---|
| `POST /exam-sessions/:id/test-bundles/generate-from-statement` | `{ testBundle: {id, version, caseCount, droppedCount}, ruler: {trust, examplesChecked}, run: {runId, status} }` |
| `POST /exam-sessions/:id/test-bundles/generate-from-answer` | như trên, không có `ruler` |
| `POST /exam-sessions/:id/test-bundles/test-run` (body `{ testBundleId? }`) | `{ runId, status, cases }` |

- Hai đường sinh trả 409 khi phiên đã có kết quả chấm (cùng luật `assertNotGradedYet`). Chạy thử không bị chặn, vì nó không đổi điểm.
- Đồng bộ (D-D). Ngân sách sandbox: 60 000 ms cho chạy thử. Đường sinh có thêm thời gian LLM.

### 4.4 Luồng sinh từ đề

1. **Kiểm trước, không gọi LLM:**
   - phiên chưa khoá, câu là `cpp` hoặc `python`;
   - không có dòng `running` còn sống;
   - đáp án hiện có không phải của giảng viên (luật 6);
   - hạn mức còn (`GenerateQuotaService.assertWithin`, `generate-quota.service.ts:33-35`).
2. **Preflight worker:** chạy một job `exec` nhỏ (chương trình rỗng, một ca). Không trả lời hoặc `unavailable` thì dừng với 503, **chưa gọi LLM**.
3. **Đọc đề thành văn bản** bằng `extractText` (`grading/extract-text.ts:70`), đã dùng cho đề trên đường điều tra (`investigation-context.service.ts:56-57`). Chưa kiểm nó đọc docx trọn vẹn (mục 10).
4. **LLM:** prompt mode mới, đề cố định. Trả `{ modelAnswer, examples: [{input, output, quote}], cases: [{name, group, input, quote, answerIsUnique}] }`. Không sinh lại đề.
5. **Lọc trước khi chạy:**
   - `quote` so khớp sau chuẩn hoá NFC và gộp khoảng trắng hai phía (cùng cách với `evidence-check.ts:39`). Không khớp thì bỏ, ghi lý do.
   - `answerIsUnique = false` và không có comparator phù hợp thì bỏ ca (investigator §2.1 luật 5, T-NORM-3). Comparator dùng được: `unordered_lines`, `float_tolerance`. `checker` chưa được cài ở worker.
   - Số ca ≤ 200 (`contract.ts:117`); mỗi input ≤ 4 MiB.
6. **Chạy đáp án trên worker, hai lần** (D-C):
   - job `exec`: `program.files = [main.cpp]` hoặc `[main.py]`, `driver: null`, `entry` cho python; các ca có `expected: null` (công cụ `run`, `contract.ts:113-114`);
   - hai lần khác nhau ở một ca thì bỏ ca, lý do `nondeterministic`;
   - compile lỗi → 422 kèm log, không ghi gì;
   - `runtime_crash`, `timeout`, `output_limit` → bỏ ca, lý do là status;
   - stdout > 64 KiB (`contract.ts:206`) → bỏ ca, lý do "output vượt 64 KiB";
   - `unavailable` hoặc `aborted: 'budget'` → 503, không ghi gì.
7. **Kiểm ví dụ trong đề** (mục 4.6). Lệch → 422 kèm chi tiết, không ghi gì.
8. **Ghi một transaction:** gói (`origin='generated'`, chưa duyệt, chưa ghim, `expected_output` = stdout vừa chạy); `grading_reference` (khoá và băm mã nguồn, `model_answer_origin='generated'`, `model_answer_unverified` và `ruler_trust` theo mục 4.6); dòng `grading_test_run` chuyển sang trạng thái kết thúc. Mã nguồn được `putObject` **trước** transaction, giống đường attach hiện nay. Lỗi DB để lại object mồ côi; chấp nhận, ghi log.
9. Sau lọc không còn ca nào → `dropped_all`, không ghi gói (409), đúng luật "gói phải còn ít nhất một ca" của `dropCase`.
10. **Độ phủ:** nếu còn dưới 5 ca, hoặc dưới nửa số ca LLM đề xuất, trả cảnh báo kèm danh sách ca bị bỏ và lý do. Giảng viên thêm ca bằng route tạo gói có sẵn. Thiếu ca nhóm `bien` (biên) hoặc thiếu ca lớn thì trả cảnh báo nhóm.

### 4.5 Luồng sinh từ đáp án của giảng viên

1. Đáp án phải là **file mã nguồn** `cpp` hoặc `python`, hoặc được dán vào ô văn bản. Ngôn ngữ lấy từ câu. Đường `PUT grading-reference` hiện nhận docx và pdf; giảng viên đưa mã nguồn qua đường này (D-B).
2. Các bước 2–10 như mục 4.4, bỏ bước 4 (LLM vẫn đề xuất input). Output lấy từ chạy đáp án giảng viên. `origin='from_model_answer'`; `model_answer_origin` giữ `teacher`.
3. Đáp án không biên dịch → 422, không ghi gì.

### 4.6 Ví dụ trong đề và `ruler_trust`

Đây là bước thứ nhất của §6.3b spec multi-problem, gọi là D15 ở dòng 474 của spec đó.

- **Đề có ví dụ vào/ra:** đáp án mẫu chạy thật phải tái tạo đúng các ví dụ. Khớp hết → `ruler_trust='verified'`. Lệch → 422 kèm ví dụ lệch. Hệ thống **không** kết luận đáp án sai, vì ví dụ trong đề có thể sai chính tả. Giảng viên phải xem.
- **Đề không có ví dụ** (đề thật Phụ lục C mục 7 không có): không nâng được bằng ví dụ. `ruler_trust='unverified'` cho đến khi giảng viên liếc và xác nhận (§6.3b bước 2).
- `model_answer_unverified` đi theo `ruler_trust`: `unverified` thì cờ bật.

### 4.7 Đồng thời và lỗi

- **Bấm hai lần:** trước khi gọi LLM, kiểm không có dòng `running` còn sống của phiên. Có thì 409 "đang sinh". Cách này tiết kiệm token và hạn mức.
- INSERT gói và tính `nextVersion` trong cùng transaction, dưới khoá giảng viên (`lockTeacherScoring`), như `adoptFromAuthoring`. Lệnh sandbox nằm **ngoài** transaction để không giữ khoá 60–120 giây.
- **Hết hạn mức:** 429, không gọi LLM.
- **Sandbox không có:** 503 ở preflight, trước khi tốn LLM.

### 4.8 Chi phí

- Đường Soạn đề ghi `costUsd: null` (`exam-authoring.service.ts:86`). Đường chấm ghi qua `costOf(…, priceOf)` (`investigator-run.service.ts:85`) và `cost_usd` (`score.service.ts:168, 225`). PR-G2b tính chi phí theo cách của đường chấm.
- Mỗi lượt sinh ghi số token, chi phí và phiên bản prompt (tiêu chí chấp nhận).
- Q2 đã chấp nhận: gắn đề không tạo gói nên giảng viên bấm G2b thêm một lần gọi LLM. Hạn mức có sẵn và chi phí ghi được.

### 4.9 Ai được thấy mã nguồn đáp án

- Mã nguồn lưu bằng khoá theo băm trong `grading-reference/`. `listForAgent` không bao giờ trả prefix này (comment ở `attach-exam.service.ts`, khoảng dòng 407). Cần test khẳng định.
- Không gian làm việc của agent điều tra **không** nhận văn bản đáp án: `investigation-context.service.ts:98` chỉ đặt cờ `modelAnswerAvailable`. Cần test khẳng định.
- **Đã có sẵn, không do G2b:** bộ chấm nhận đáp án mẫu dạng docx qua `modelAnswerPdf` (`grading.service.ts:146, 463`). Docx của đường Soạn đề chứa mã, nên bộ chấm đã thấy mã đó. G2b không tăng phạm vi thấy này.
- Container của sinh viên không bao giờ thấy đáp án mẫu hay `expected_output` (T-ISO-6, investigator spec). Đã có sẵn trong worker.

## 5. Tiêu chí chấp nhận

**PR-A2:**
- [ ] Gắn đề không tạo gói nào và không duyệt, không ghim. `AttachResult.testBundle` là `null`, `nextStep='create_bundle'`.
- [ ] Đề có đúng một câu: mã nguồn được ghi theo băm, `model_answer_source_key` trỏ đúng. Đề nhiều câu: không ghi mã nguồn.
- [ ] `ruler_trust = 'unverified'` tường minh ở mọi đường Soạn đề.
- [ ] (nếu Q3 chọn A) `decide()` đọc `ruler_trust`: bài của phiên `unverified` → cờ `ruler_unverified`, không `auto_approved`. Phiên `teacher` và `verified` không đổi.
- [ ] Phiên cũ đã ghim gói `generated`: băng cảnh báo hiện, ghim không bị gỡ.
- [ ] Duyệt gói sinh ra hiện 2–3 ca vào/ra và dòng "khớp nội bộ, chưa chứng tỏ đúng"; không nâng `ruler_trust`.
- [ ] Phiên Soạn đề không có gói → `start-grading` trả 400 (e2e mới).
- [ ] `AUTHORING_LANGUAGES` không còn `java`, `node`.
- [ ] Các test ở mục 6 đã viết lại; `ngan-xep-v1` vẫn chạy được và không đổi số.

**PR-G2b:**
- [ ] Worker không trả lời → 503 ở preflight, số lần gọi LLM bằng 0.
- [ ] Sinh từ đề: `expected_output` của mọi ca bằng stdout của sandbox, KHÔNG bằng văn bản LLM (test có mock cả hai và so sánh).
- [ ] Ca không có `quote` khớp đề bị bỏ, có lý do.
- [ ] Ca có `answerIsUnique=false` không có comparator phù hợp bị bỏ, có lý do.
- [ ] Ca cho output khác nhau giữa hai lần chạy bị bỏ với lý do `nondeterministic`.
- [ ] Đề có ví dụ, đáp án tái tạo đúng → `verified`. Lệch → 422 và không ghi gì.
- [ ] Đề không có ví dụ → `unverified`.
- [ ] Gói sinh ra: `approved_at` NULL, không ghim, `origin` đúng theo mục 3.
- [ ] Sinh từ đề khi đáp án là `teacher` → 409.
- [ ] Sinh từ đáp án GV: `model_answer_origin` vẫn là `teacher`.
- [ ] Java, node → 400.
- [ ] Output > 64 KiB → ca bị bỏ với lý do đúng.
- [ ] Đáp án không biên dịch → 422, không ghi gì.
- [ ] Bấm hai lần → 409 "đang sinh", không 500.
- [ ] Phiên đã chấm → 409 cho hai đường sinh.
- [ ] Chạy thử: một dòng `grading_test_run`; `approved_at`, ghim và `ruler_trust` không đổi.
- [ ] Mã nguồn không xuất hiện trong `listForAgent` và trong không gian làm việc của agent điều tra (test).
- [ ] Chi phí và `prompt_version` được ghi cho mỗi lượt sinh.
- [ ] **Một lượt chạy thật** trên worker sandbox có thật, ghi bản ghi vào `apps/api/eval/rehearsals/`. Bắt được lỗi CRLF, mã hoá và cắt 64 KiB mà FakeSandbox không lộ ra.

## 6. Kiểm thử

**Test phải viết lại cho PR-A2** (chúng khẳng định hành vi tự duyệt, tự ghim sẽ bị bỏ):

| Tệp | Chỗ | Hành vi cũ đang được khẳng định | Thay bằng |
|---|---|---|---|
| `exam-authoring-attach.e2e-spec.ts` | dòng 317 | gắn đề sinh ra gói đã duyệt và đã ghim | gắn đề không tạo gói; `testBundle` là null |
| `exam-authoring-attach.e2e-spec.ts` | dòng 346 | gắn lần hai không đè gói đã ghim | gắn lần hai không tạo gói, không đổi ghim cũ |
| `exam-authoring-attach.e2e-spec.ts` | dòng 386 | đề không sinh ca nào → không tạo gói rỗng | vẫn đúng, giữ nguyên ý nghĩa |
| `exam-authoring-attach.e2e-spec.ts` | dòng 399 | gói test hỏng sau khi đề đã ghi → 500 | bỏ bước gói khỏi đường gắn; thay bằng ca ghi mã nguồn hỏng |
| `exam-authoring-attach.e2e-spec.ts` | dòng 437 | bỏ ca khỏi gói generated chưa duyệt → phiên bản mới | không còn gói từ attach; chuyển sang fixture tạo gói tay |
| `test-bundle.e2e-spec.ts` | dòng 377 | `adoptFromAuthoring` chạy đồng thời → đúng một gói ghim | bỏ, hoặc viết lại cho route pin chạy đồng thời |
| `multi-problem-p1a-writers.e2e-spec.ts` | dòng 86 | `adoptFromAuthoring` gắn gói vào câu 1 | viết lại theo đường tạo tay |

**Test mới cho PR-A2:** Soạn đề không có gói → `start-grading` 400 (mở rộng `start-grading-test-bundle-guard.e2e-spec.ts`); băng cảnh báo cho gói ghim `generated`.

**Fixture không đổi** (đã kiểm, không dựa vào Soạn đề): `ngan-xep-v1` (`eval/rehearsal/cli.ts:212-216`, tạo gói bằng route, duyệt, ghim), `investigator-end-to-end.e2e-spec.ts:186-199` (route), `start-grading-test-bundle-guard.e2e-spec.ts` (route). `ngan-xep-v1` không gửi `modelAnswerUnverified` nên `ruler_trust` là `teacher` (`grading-reference.service.ts:166-170, 182`). Kịch bản này không đổi số khi làm A2.

**PR-G2b:**

| Tệp | Loại | Nội dung |
|---|---|---|
| `ruler-generate.spec.ts` | unit | lọc theo trích dẫn; NFC; `answerIsUnique`; nondeterministic; ngưỡng 64 KiB; chặn java, node; floor 5 ca và nửa; nhóm `bien` |
| `check-bundle-on-worker.spec.ts` | unit | các ca hiện có của eval, sau khi chuyển về `grading/` |
| `ruler-generate.e2e-spec.ts` | e2e | FakeSandbox (`grading/investigator/testing/fake-sandbox.ts`) và LLM giả: các tiêu chí mục 5 |
| `test-bundle.e2e-spec.ts` (thêm) | e2e | route chạy thử; 409 khi `running` còn sống |
| `source-leak.e2e-spec.ts` | e2e | `listForAgent` và không gian làm việc của agent điều tra không chứa mã nguồn |
| `PreparePanel.test.tsx` | vitest | thay ca "cần backend" ở dòng 190 bằng ca mới |
| Lượt chạy thật | thủ công | một lượt trên worker thật, ghi vào `apps/api/eval/rehearsals/` |

## 7. Điểm chạm file (dự kiến)

**PR-A2:**
- `apps/api/src/grading/test-bundle/test-bundle.service.ts:61-111` — `adoptFromAuthoring` không còn đường gắn gọi tới.
- `apps/api/src/exam-authoring/attach-exam.service.ts:186-205` — bỏ bước gói; ghi mã nguồn; `ruler_trust` tường minh; `nextStep`.
- `apps/api/src/exam-authoring/dto/generate-exam.dto.ts:25` — bỏ java, node.
- Đường `decide()` và nơi gọi nó — nếu Q3 chọn A, truyền `ruler_trust` vào (cùng việc với P1b Task 8).
- `apps/web/src/app/teacher/exam-authoring/page.tsx` — hiện "Đề đã gắn. Tạo gói test" và dẫn sang bước chuẩn bị.
- `apps/web/.../PreparePanel.tsx` và băng cảnh báo — điều kiện theo `ruler_trust`.
- Các test ở mục 6.

**PR-G2b:**
- `apps/api/src/exam-authoring/` — service sinh, prompt mode mới trong `ai-provider/`.
- `apps/api/src/grading/test-bundle/` — route chạy thử; chuyển `checkBundleOnWorker` về đây.
- `apps/api/src/grading/grading-reference.service.ts:92-134` — khoá theo băm, cờ, nguồn gốc.
- `apps/api/src/grading/grading.module.ts` — export cổng sandbox.
- `apps/api/src/eval/test-bundle.ts` — import lại từ `grading/`.
- Migration mới — hai cột, bảng `grading_test_run`, trigger guard.
- `apps/web/.../PreparePanel.tsx:99-108`, `PreparePanel.test.tsx:190`.
- `packages/shared/src/api/schema.d.ts` — sinh lại sau khi thêm route.
- `docs/update-grading-system-guide.md:818` — cập nhật mục 11, dòng 6.

## 8. Phụ thuộc và rủi ro

- **Worker sandbox: bằng chứng mâu thuẫn, chưa kiểm được từ đây.**
  - Báo cáo nghiệm thu P1a (`2026-10-17-p1a-acceptance.md`, nhánh `feat/multi-problem-p1b`) ghi lượt trên **Railway** khớp và được chấp nhận; lượt **cục bộ** thất bại vì worker không xử lý job.
  - Plan P1b (cùng nhánh, mục "Điều kiện đầu vào") ghi worker EC2 không nhận job từ khoảng 14/10 và cả lượt Railway cho `run_tests = unavailable`.
  - Repo không có script kiểm worker (không thấy `sandbox-exec` hay `cine-sbx` trong `scripts/`). Kiểm được bằng cách đẩy một job `exec` tối thiểu qua `SandboxClient` với `SANDBOX_REDIS_URL` của production. Cần quyền Redis và đăng nhập AWS SSO, tôi không có.
  - Đây là điều kiện G1 của merge A2. Nếu worker chết, đường Soạn đề thành ngõ cụt cho đến khi worker sống lại.
- **Java và node không bị chặn bắt đầu chấm.** `pipelineFor` (`pipeline.ts:13-17`) đưa mọi `code_project` có ngôn ngữ ngoài `INVESTIGATOR_LANGUAGES = {cpp, python}` (`pipeline.ts:6`) vào `one_shot`. Đường này không đi qua gói test. Bài java, node do giảng viên khai vẫn chấm được không cần thước. Đây là hành vi có sẵn, không do Soạn đề, và A2 không làm tệ thêm. Việc có chặn `one_shot` cho `code_project` hay không là quyết định riêng (Q4).
- **P1b Task 8 và PR-A2 cùng đọc `ruler_trust`.** Quy tắc chung đã nêu ở mục 2. Nếu Q3 chọn A, P1b Task 8 được làm sớm và spec multi-problem §6.3b phải cập nhật lại phần chia pha.
- **P1b Task 4 cùng sửa `attach-exam.service.ts` và `adoptFromAuthoring`.** PR-A2 merge trước, P1b rebase lên nó.
- **Tài liệu cũ:** spec UI rebuild (`2026-09-23-grading-ui-rebuild-design.md:402-405`) nói chặn vì nhánh autograder chưa merge. Đã lỗi thời. Guide mục 11 dòng 6 cũng vậy.
- **Cách ghi file:** đường attach hiện `putObject` từ server; spec 2026-09-21 nói trình duyệt `PUT`. G2b theo đường hiện nay. Cần xác nhận.

## 9. Quyết định đã chốt

- **D-A (A2):** bỏ tự duyệt và tự ghim khi gắn; `ruler_trust` tường minh; cảnh báo cho phiên cũ; duyệt không bấm mù; duyệt và ghim gộp.
- **Q1 (đã chấp nhận, có ba điều kiện):**
  1. Chấm phải từ chối rõ, không hạ cấp âm thầm. Đã đúng cho cpp, python (`grading-run.service.ts:215-225`); giữ và thêm e2e cho đường Soạn đề. Đường điều tra còn có lớp dự phòng là `ungradable/system` (`investigation-context.service.ts:53`). Java, node không thuộc phạm vi này (mục 8).
  2. Worker phải sống trước khi merge A2 (G1, mục 8).
  3. Kịch bản diễn tập và demo không dựa vào gói tự ghim của Soạn đề. Đã kiểm: không fixture nào dựa vào đường đó; ba file test dựa vào `adoptFromAuthoring` cần viết lại (mục 6).
- **Q2 (đã chấp nhận):** gắn đề không tạo gói nào. Hai bổ sung: kết quả gắn dẫn sang bước tiếp theo (`nextStep`), và mã đáp án vẫn được lưu lúc gắn (D-B), vì đó là mã chứ không phải output.
- **D-B:** mã nguồn lấy từ `GeneratedQuestion.modelAnswer`, không trích từ docx. Lưu theo băm nội dung. Test không rò.
- **D-C:** comparator là hàm của worker. Chạy thử và chấm đều đi qua job `exec` của worker. `exact` (`sandbox-worker/comparators.ts:8-12`) đã chuẩn hoá CRLF và khoảng trắng cuối dòng. Thêm `answerIsUnique` và chạy hai lần để bắt output không tất định.
- **D-D:** đồng bộ. Chạy thử 60 giây. Preflight worker trước khi gọi LLM. Trạng thái `running` chặn bấm hai lần. Ngưỡng chuyển job nền: p95 của đường sinh trên 30 giây; **chưa đo**.
- **D-E:** chỉ `cpp` và `python`. Java, node bị bỏ khỏi danh sách chọn của Soạn đề (A2).
- **D-F:** ca phải trích đề, chuẩn hoá NFC và khoảng trắng hai phía. Kiểm ví dụ trong đề theo §6.3b. Floor 5 ca hoặc nửa số ca đề xuất. Yêu cầu nhóm `bien` và ca lớn.

## 10. Quyết định còn mở

1. **Q3 — `decide()` trong A2 hay P1b?** Chọn một:
   - **A (khuyến nghị):** A2 đọc `ruler_trust` trong `decide()`. Phiên `unverified`, kể cả phiên cũ đã ghim gói do LLM viết, sẽ không tự duyệt bài nào. Lý do: nếu không đọc, P0 vẫn mở cho mọi phiên cũ đã ghim cho đến khi P1b merge, và cột `ruler_trust` chỉ là trang trí. Ảnh hưởng số đo: kịch bản `ngan-xep-v1` là `teacher`, nên số không đổi. Chỉ phiên `unverified` đổi, đúng ngoại lệ đã được nêu tên trong §6.3b. Hệ quả phải ghi: spec multi-problem §6.3b phải đổi phần chia pha, và P1b Task 8 chuyển sang A2.
   - **B:** A2 chỉ đặt cột, `decide()` chưa đọc. P0 vẫn mở cho phiên cũ đã ghim tới khi P1b merge. Tài liệu phải ghi rõ điều này.
2. **Q4 — Chặn `one_shot` cho `code_project` không dùng gói?** Khuyến nghị: không làm trong A2 hay G2b. Ghi thành một mục riêng, vì đó là hành vi có sẵn và thay đổi nó ảnh hưởng nhiều bài không do Soạn đề.
3. **Gate merge A2:** G1 (kiểm worker) do bạn chạy hoặc uỷ quyền. Tôi không có quyền Redis và AWS SSO. G2 (duyệt merge) do bạn trả lời.

## 11. Đã kiểm, chưa kiểm

**Đã kiểm với code:**
- `decide()` trên main không đọc `ruler` (`decide.ts`). `ruler_unverified` chỉ có trên nhánh P1b.
- `ruler_trust` được ghi ở `grading-reference.service.ts:182` và backfill ở `default-problem-backfill.ts:105`. Không có đường đọc nào trên main.
- `adoptFromAuthoring` vẫn tự duyệt và ghim (`test-bundle.service.ts:93-97`).
- `grading-run.service.ts:215-225` chặn bắt đầu chấm khi thiếu gói, với điều kiện có bài đường điều tra.
- `pipelineFor` đưa java, node vào `one_shot`; `INVESTIGATOR_LANGUAGES = {cpp, python}`.
- Fixture `ngan-xep-v1`, `investigator-end-to-end`, `start-grading-test-bundle-guard` dùng route tạo, duyệt, ghim, không dùng Soạn đề.
- Ba file e2e dựa vào `adoptFromAuthoring` hoặc gắn đề và cần viết lại (mục 6).
- `modelAnswerUnverified` không gửi thì `ruler_trust` là `teacher`.
- Bộ so sánh `exact` đã chuẩn hoá CRLF và khoảng trắng cuối dòng.
- `cost_usd` có ở đường chấm; đường Soạn đề ghi `null`.

**Chưa kiểm:**
- Trạng thái worker sandbox ở thời điểm hiện tại. Bằng chứng mâu thuẫn (mục 8).
- `one_shot` làm gì cụ thể với java, node.
- `extractText` đọc docx trọn vẹn chưa.
- `ai_usage` có chỗ ghi `prompt_version` không.
- p95 của đường sinh.
- Chi phí của lượt sinh thực tế.
- Tôi tự đọc lại như người lập plan. Chưa qua reviewer độc lập.
