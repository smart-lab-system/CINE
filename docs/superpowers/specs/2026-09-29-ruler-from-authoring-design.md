# G2 — Thước và nguồn tài liệu chấm: nối Soạn đề → gói test, và nói rõ tài liệu chấm đến từ đâu

**Ngày:** 2026-09-29 (bản 2, đã kiểm lại với mã) · **Trạng thái:** chờ duyệt ở PLAN · **Nhánh:** `feat/grading-g2-ruler` (worktree `grading-g2-ruler`)

Bao gồm: một lỗi có sẵn làm hỏng trọn luồng *gắn đề*, và ba việc còn treo mà bản *UI rebuild* đã vẽ nhưng chưa có backend: gói test sinh từ Soạn đề, bảng duyệt bộ ca, và dòng "nguồn của tài liệu chấm".

> **Bản 2 sửa gì so với bản 1.** Bản 1 viết khi chưa đọc lịch sử git và chưa đọc các file test có sẵn. Bản này: (1) coi `putObject` là **khôi phục**, không phải thêm mới — nó từng có, đã được review, và rơi mất; (2) sửa cách dọn khi hỏng (bản 1 để lại dòng `exam_material` mồ côi); (3) sửa lý do của cột `model_answer_set_at` (bản 1 nói sai về ghi chú); (4) liệt kê các test có sẵn sẽ phải đổi; (5) đặt dòng nguồn gốc thước ở đúng trang.

---

## 1. Vì sao phải làm ngay

**1.1 — Luồng *gắn đề* hỏng, và đó là tai nạn chứ không phải quyết định.**
`POST /exam-authoring/attach` dựng hai file `.docx` rồi **không upload**; `ExamMaterialService.create` (`exam-material.service.ts:90`) và `GradingReferenceService.upsert` (`grading-reference.service.ts:113`) đều `HeadObject` kiểm file, nên mọi lượt gắn dừng ở `400 Chưa thấy file trên kho lưu trữ`. E2E `test/exam-authoring-attach.e2e-spec.ts` ca *"phiên chưa tới giờ thi"* đỏ sẵn từ trước G1.

Lịch sử (đọc bằng `git show`, 2026-09-29):

| Commit | Điều đã xảy ra |
|---|---|
| `de779e8` (09-22) | Thêm `StorageService.putObject`, hai lời gọi trong `attach`, hai unit test. Message ghi lý lẽ đối chiếu Security rule 5 ("cùng lý lẽ với `getObject`: rule đó nói về file NGƯỜI DÙNG đẩy lên") và "Phát hiện ban đầu bởi code-reviewer (C1 + W3)". |
| `05e303b` (09-22) | Cùng ngày, thêm `getObjectSize` vào **chính file** `storage.service.ts`. |
| `4e06f00^` | `storage.service.ts` **không còn** `putObject` (0 lần xuất hiện) trong khi `attach` vẫn gọi `this.storage.putObject` → không biên dịch được. Không commit nào trong lịch sử đầy đủ của file có dòng xoá `putObject`; nhiều khả năng nó rơi khi giải xung đột ghép nhánh với `05e303b` (**suy luận, chưa xác minh merge cụ thể**). |
| `4e06f00` (09-23) | Message: *"remove redundant tests for putObject method"*. Thực chất xoá **hai lời gọi trong `attach` và hai unit test**, thay vì khôi phục method — đưa build về xanh và giết tính năng. |

Nên G2 **khôi phục** một thiết kế đã được cân nhắc và review, không phải đề xuất một ngoại lệ mới cho rule 5.

**1.2 — Sửa xong 1.1 thì phiên có bài code vẫn không chấm được.** `grading-run.service.ts:212-222` chặn bắt đầu chấm khi phiên có bài đường điều tra mà `exam_session.test_bundle_id` là `NULL`. `AttachExamService` **bỏ qua** `GeneratedQuestion.testBundle` — mỗi câu đề sinh ra đều kèm sẵn một mảng ca test, và nó bị vứt đi. Giảng viên soạn đề, bấm gắn, ra màn chấm rồi gặp `400` bảo tự gõ lại từng ca.

**1.3 — Hai dòng "cần backend" ngay trên màn chuẩn bị chấm.** `ReferenceForm.tsx:143` (nguồn của đề) và `:164` (nguồn của đáp án mẫu). UI spec §3.7 (`2026-09-23-grading-ui-rebuild-design.md:386-387`) đòi màn này nói **nguồn** của từng tài liệu, không chỉ có hay không.

---

## 2. Bảng Quyết định

| # | Quyết định | Chọn gì | Đã cân | Vì sao | Giá nếu sai |
|---|---|---|---|---|---|
| D1 | Server ghi byte `.docx` bằng cách nào | **Khôi phục** `StorageService.putObject(key, body, contentType)` **nguyên văn bản `de779e8`** (kể cả `ContentLength: body.length`), khôi phục hai unit test đã xoá, sửa đoạn chú thích đầu class đang nói "no method reads or writes bytes" (sai từ khi có `getObject`) | (a) `fetch` vào URL ký sẵn của chính server — thêm hai chặng mạng và một cách hỏng; (b) để frontend upload hai file — phá đúng thứ `attach` sinh ra để giữ | Byte sinh ra **trong tiến trình này**, không có client để đưa qua URL ký sẵn; rule 5 nói về file **người dùng** đẩy lên; đã có `getObject` cùng loại; thiết kế này đã được code-reviewer duyệt ở `de779e8` | Nếu bạn coi đây là vi phạm rule 5: đổi sang (a) là ~3 dòng ở `attach-exam.service.ts`, bỏ Task 1 Step 3-4 |
| D2 | Dọn khi hỏng giữa chừng | Ba nhánh theo **chặng đã qua**: chưa tạo `exam_material` → `deleteObject(paperKey)`; đã tạo, chưa ghi `grading_reference` → `materials.remove` (xoá **cả dòng lẫn object**); đã ghi `grading_reference` mà gói test hỏng → **không dọn**, ghi log | Luôn `deleteObject` (bản 1: để lại dòng `exam_material` trỏ vào object đã xoá → `listForAgent` phát URL chết cho sinh viên) | `materials.remove` là cách dọn của bản gốc `de779e8`; nhánh thứ ba vì `grading_reference` giữ material bằng FK RESTRICT và `remove` sẽ từ chối | Nhánh 3 để lại đề+đáp án đã gắn nhưng **chưa có thước**, và gắn lại sẽ tạo bản đề thứ hai (xem §8) |
| D3 | `origin` của gói sinh từ Soạn đề | `'generated'` | `'teacher'`; `'from_model_answer'` | Cột trả lời "ai viết ca" — mô hình viết | Dòng nguồn gốc thước sai cho một loại phiên |
| D4 | Gói từ Soạn đề có tự duyệt + ghim không | Có **khi phiên chưa ghim gói nào**; đã ghim thì tạo gói chưa duyệt, không đụng `test_bundle_id` | Không tự duyệt (chặn 1.2); ghim đè | UI spec §3.7:395 *"Gắn bộ ba từ Soạn đề tính là đã duyệt"*. Điều kiện "chưa ghim" giữ lựa chọn tường minh của giảng viên | **Hệ quả bạn nên biết:** vì gắn = duyệt, **băng vàng "đáp án chưa kiểm chứng" gần như không bao giờ hiện** ở đường Soạn đề (nó tắt khi có gói ghim), và **nút "Bỏ ca này" không dùng được** cho gói đó (gói đã duyệt → 409). Cả hai chỉ sống với gói chưa duyệt: gói giảng viên tự gõ, gói lần gắn thứ hai, và sau này gói của G2b. Phương án ngược lại — gắn đề tạo gói **chưa duyệt** để băng vàng và bảng duyệt đều dùng được — tốn giảng viên một cú bấm, và lệch UI spec. **Nếu bạn muốn nó, đây là quyết định nên phủ quyết** |
| D5 | `case_key` khi tên ca do mô hình viết | `q{n}-{tên đã làm sạch}` (bỏ dấu, `[a-z0-9_-]`), rơi về `q{n}-c{i}`, hậu tố `-2`, `-3` khi trùng, cắt 64 ký tự | Giữ nguyên tên (nổ `CHECK` ở DB → 500); `q{n}c{i}` thuần (giảng viên không nhận ra ca) | Regex của DB `^[A-Za-z0-9_-]{1,64}$`; hàm **thuần** để unit test | Tên rác thành khoá xấu nhưng hợp lệ |
| D6 | Dấu thời gian của "nguồn đáp án" | Migration `1789500000000`: `grading_reference.model_answer_set_at timestamptz NULL`, đặt cùng nhịp với `model_answer_origin` (`answerSent`) | Dùng `updated_at`; `created_at` | **Cần nói đúng phạm vi:** `upsert` coi **ghi chú cũng là đáp án** (`answerSent` = gửi khoá file *hoặc* ghi chú), nên sửa ghi chú **có** đổi cột này — đó là chủ ý (ghi chú là một dạng đáp án). Cái nó tách khỏi `updated_at` là các lần ghi **không phải đáp án**, chủ yếu là **đổi lại đề bài**. `created_at` là lúc tạo dòng (lần ghi đầu tiên) nên sai từ lần ghi thứ hai | Lợi ích nhỏ hơn tôi nói ở bản 1: một cột để tránh một dòng nguồn nói sai giờ sau khi giảng viên đổi đề bài. Nếu không muốn migration: hiện "cập nhật lúc `updated_at`" và bỏ chữ "tải lên" |
| D7 | Đường trả `sources` | Mở rộng `GET …/grading-readiness` | Route mới | `PreparePanel` đã gọi nó; route thứ hai là fetch thứ hai và một lần kiểm chủ sở hữu nữa | Response to hơn, không phá ai (trường cộng thêm) |
| D8 | Ca tự bỏ trong con số nút duyệt | Không tính (`list()` đã loại `auto_dropped_reason IS NULL`), nhưng hàng vẫn hiện gạch ngang kèm lý do | Tính cả | Nút ghi 22 mà chạy 17 là nói dối nhỏ | — |
| D9 | Cột "câu trong đề mà ca này kiểm" | Đọc `constraint_quote`; ca không có → "—" | Suy từ `group` | Cột có sẵn, chỉ `get()` bỏ khỏi SELECT; suy từ `group` là đoán (rule 9) | Ca sinh từ Soạn đề luôn hiện "—" vì `parseExamJson` không mang trích dẫn |
| D10 | Dòng "thước do hệ thống sinh" đặt ở đâu | **Một lần mỗi trang**, component tự chứa `RulerOriginNote({ sessionId })`, đặt ở **trang danh sách** và ở **`InvestigatorDossier`** (hồ sơ bài code) — **không** đặt ở trang hồ sơ bài tự luận | Mỗi dòng bài | `grading_result` không mang `test_bundle_id`; N request thừa. Bài tự luận chấm theo rubric, **không dùng gói test** nên dòng đó vô nghĩa ở đó. UI spec "mọi dòng" được thoả bằng việc dòng có mặt ở mọi trang hiển thị kết quả của bài code | Một dòng thiếu ở màn tự luận: đúng ý nghĩa |
| D11 | `ReferenceForm` cần biết gì để tắt băng vàng | Prop `hasPinnedBundle: boolean` = `Boolean(detail.data?.testBundleId)` | Gọi thêm hook đọc gói | `TestBundleService.pin` từ chối gói chưa duyệt (400), nên **gói đã ghim theo định nghĩa đã duyệt**; không cần dữ liệu gói | — |

---

## 3. Đã kiểm trên code

Đọc trực tiếp trên nhánh `feat/grading-gaps-g1-g5`, 2026-09-29.

| Cần biết | Ở đâu | Kết luận |
|---|---|---|
| `attach` không ghi byte | `attach-exam.service.ts:125-148` | Chỉ `requestAnswerKeyUpload` (xin khoá; URL bị vứt) và `buildMaterialKey`. Không có `PutObject` nào trong `exam-authoring/` |
| `StorageService` hôm nay | `storage.service.ts` | Có `getObject`, `deleteObject`, `generateUploadUrl`, `generateDownloadUrl`, `objectExists`, `getObjectSize`. **Không** có `putObject` |
| Chú thích đầu class sai | `storage.service.ts:21-31` | Nói *"no method reads or writes bytes, and none should ever be added"* — sai vì `getObject` đọc byte. Nó cũng là câu người sau sẽ trích để xoá lại `putObject` |
| Bản gốc `putObject` | `git show de779e8:apps/api/src/storage/storage.service.ts` dòng 256-283 | `PutObjectCommand` với `Bucket, Key, Body, ContentType, ContentLength: body.length`, không nuốt lỗi |
| Unit test đã xoá | `git show 4e06f00` | Hai ca: gửi đúng bucket/key/body/content-type/content-length; ném khi kho từ chối. `sendMock` và `s3Error` vẫn có trong `storage.service.spec.ts` |
| Bản gốc dọn khi hỏng | `git show de779e8:…/attach-exam.service.ts` | `catch` gọi `materials.remove(session, material.id)` — xoá cả dòng lẫn object |
| `materials.remove` | `exam-material.service.ts:168-203` | Ném 403 nếu `isExamOver(session.status)`, ném 409 nếu `grading_reference` đang trỏ tới material; xoá dòng rồi `deleteObject` |
| Chặn bắt đầu chấm | `grading-run.service.ts:212-222` | Chỉ khi `pipelineFor(deliverable) === 'investigator'` |
| `testBundle` của đề | `parse-exam.ts:50-64` | `TestCase[] {name, group, input, expectedOutput}`; **không** có `constraintQuote` |
| `TEST_BUNDLE_ORIGINS` | `grading-model.types.ts:30` | `['teacher','from_model_answer','generated']`; enum DB `examcollect.test_bundle_origin` |
| Ràng buộc ca | `1789450000000-AttemptsBundlesScores.ts:54-66` | `case_key` CHECK `^[A-Za-z0-9_-]{1,64}$`; `group` CHECK độ dài 1..100; UNIQUE `(bundle_id, case_key)` |
| Ca append-only | `1789450000000:67` | `guard_append_only` trên UPDATE **và** DELETE → bỏ ca = phiên bản gói mới |
| `list()` loại ca tự bỏ | `test-bundle.service.ts:70-80` | `AND c.auto_dropped_reason IS NULL` |
| `get()` bỏ `constraint_quote` | `test-bundle.service.ts:82-102` | SELECT không có cột đó |
| `upsert` đặt `modelAnswerOrigin` | `grading-reference.service.ts:151-155` | `answerSent = storageKey !== undefined \|\| note !== undefined`; **ghi chú tính là đáp án** |
| `model_answer_set_at` chưa có | entity + migration | Không có |
| `readiness` chỉ 4 trường | `grading-reference.service.ts:184-208` | Cần thêm `sources` |
| Pinned ⇒ approved | `test-bundle.service.ts:56-68` | `pin()` ném 400 khi `approved_at` rỗng |
| `Alert`/`Badge`/`Button` variant | `components/ui/*.tsx` | `Alert` có `warning`,`success`,`destructive`,`info`; `Badge` có `warning`,`accent`,…; `Button` có `ghost`, `outline`, prop `loading` |
| `PreparePanel` gọi `ReferenceForm` | `PreparePanel.tsx:87` | Truyền `sessionId, readiness, onDirtyChange`; `detail = useExamSessionDetail(sessionId)` đã có ở dòng 39 |
| `page.tsx` không có `<h1>` riêng | `grading/page.tsx:114` | Tiêu đề nằm trong `SessionHeader`; chỗ đặt dòng thước là ngay **sau** `<SessionHeader … />` |
| Hồ sơ bài code rẽ sớm | `[resultId]/page.tsx:119-121` | `pipeline === 'investigator'` → `<InvestigatorDossier>`; nhánh dưới là bài tự luận |

**Test có sẵn sẽ bị ảnh hưởng — đã đọc, và plan phải xử lý từng cái:**

| Test | Vì sao bị ảnh hưởng | Xử lý |
|---|---|---|
| `test/test-bundle.e2e-spec.ts:104-106` | `expect(list.body).toEqual([{ id, version: 1, approvedAt: null, caseCount: 1 }])` — thêm `origin` vào `list()` làm đỏ | Thêm `origin: 'teacher'` vào đúng assertion đó (không nới thành `toMatchObject`) |
| `test/test-bundle.e2e-spec.ts:112-119` | `toEqual` cho `detail` với ca `{caseKey, group, input, expectedOutput, autoDroppedReason}` — thêm `constraintQuote` làm đỏ | Thêm `constraintQuote: null` |
| `ReferenceForm.test.tsx:68-71` | Khẳng định *"labelled 'cần backend'"* — chính thứ G2 gỡ | **Xoá ca đó**, thay bằng các ca dòng nguồn (không phải nới lỏng: hành vi được khẳng định đã cố ý đổi) |
| `ReferenceForm.test.tsx:35-39` | `renderForm` không truyền prop mới bắt buộc `hasPinnedBundle` | Thêm `hasPinnedBundle={false}` vào helper |
| `TestBundleCard.test.tsx` | `TestBundleList` gọi `useDropTestBundleCase` — hook không được mock → `useMutation` không có `QueryClientProvider` → cả file vỡ | Thêm `vi.mock('@/hooks/useTestBundleDetail', …)` vào file test; **giữ nguyên** mọi assertion (chúng vẫn đúng vì `TestBundleList` thật nằm trong card) |
| `page.test.tsx` (danh sách) | `RulerOriginNote` gọi hook chưa mock | `vi.mock('./_components/RulerOriginNote', () => ({ RulerOriginNote: () => null }))` |
| `InvestigatorDossier.test.tsx` | Như trên | Mock `@/app/teacher/grading/_components/RulerOriginNote` |
| `PreparePanel.test.tsx` | Chỉ mock `useTestBundles`; **không** thêm hook mới vào `PreparePanel` (D11), nên không vỡ | Không đổi; thêm 1 ca kiểm prop `hasPinnedBundle` đến `ReferenceForm` |

---

## 4. Thiết kế

### 4.1 (a) Khôi phục `putObject` và làm `attach` ghi thật

**`StorageService.putObject`** — dán nguyên văn từ `de779e8` (chú thích + thân hàm, có `ContentLength`). Kèm sửa chú thích đầu class: thay câu *"no method reads or writes bytes, and none should ever be added"* bằng một câu đúng: hai method xử lý byte **trong tiến trình này** (`getObject` để chấm, `putObject` để ghi file do chính server sinh) và **không method nào được nhận byte do client gửi**.

**`AttachExamService.attach`** — ghi hai object **trước** khi gọi `create`/`upsert` (cả hai đều HEAD-check), và dọn theo chặng:

```ts
let createdMaterialId: string | null = null;
try {
  await Promise.all([
    this.storage.putObject(paperKey, paper, DOCX_MIME),
    this.storage.putObject(answerKeyKey, answerKey, DOCX_MIME),
  ]);
  const material = await this.materials.create(session, { examMaterialId, storageKey: paperKey, fileName: PAPER_FILENAME, fileSize: paper.length });
  createdMaterialId = material.id;
  await this.references.upsert(session, { … }, teacherId, 'authoring');
  return { … };
} catch (error) {
  const cleanup: Promise<void> =
    createdMaterialId !== null
      ? this.materials.remove(session, createdMaterialId) // dòng + object
      : this.storage.deleteObject(paperKey);              // chưa có dòng, chỉ có object
  await cleanup.catch((cleanupError) => this.logger.error(…));
  throw error;
}
```

Khoá đáp án là khoá **cố định** của phiên nên **không bao giờ** bị dọn (xoá là xoá đáp án của lần gắn trước). Hệ quả chấp nhận: đáp án được ghi đè **trước** khi DB cam kết; nếu một lần gắn hỏng sau bước đó thì byte đáp án là bản mới còn dòng `grading_reference` mô tả bản cũ (§8).

**Test:** unit — hai ca khôi phục của `putObject` (RED không cần hạ tầng: `service.putObject is not a function`). E2E — ca có sẵn *"phiên chưa tới giờ thi"* phải xanh **không sửa nó**; +4 ca mới: hai object thật trên kho (chữ ký `PK` của zip); gắn lần hai vẫn còn đáp án; `upsert` hỏng → không còn dòng `exam_material` thứ hai; `create` hỏng → object đề bị xoá (bắt bằng spy `deleteObject`, không cần liệt kê theo tiền tố).

### 4.2 (b) Cầu nối Soạn đề → gói test

Một đề nhiều câu → **một** gói của phiên (`exam_session` ghim đúng một `test_bundle_id`); ca các câu làm phẳng, số câu nằm ở tiền tố `q{n}-`.

`apps/api/src/exam-authoring/authoring-bundle.ts` (file mới, hàm thuần): `flattenAuthoringCases(questions): AuthoringCase[]` với `caseKeyFor` / `slugify` / `groupFor` — `group` rỗng hoặc dài hơn 100 → `'general'` (không cắt câm: `group` khớp `rubric_criterion.test_group`, cắt giữa chừng là thành nhóm khác).

`TestBundleService.adoptFromAuthoring(examSessionId, teacherId, cases, sessionAlreadyPinned)` — một `ds.transaction`: `nextVersion` → INSERT bundle `origin='generated'` → INSERT ca (`constraint_quote` NULL) → nếu `!sessionAlreadyPinned`: duyệt (`approved_by/at`) rồi `UPDATE exam_session SET test_bundle_id`. `cases` kiểu **cấu trúc** `{caseKey, group, input, expectedOutput}[]` — **không** `import type` từ `exam-authoring` (grading không được biết exam-authoring; chiều phụ thuộc ngược).

Thứ tự trong `attach`: ghi byte → `materials.create` → `references.upsert` → **gói test cuối cùng**. Lý do đặt cuối: đặt trước `upsert` thì một lần gắn hỏng ở `upsert` vẫn để lại gói đã **ghim** — phiên bị đóng dấu bằng thước của một lượt gắn đã thất bại, tệ hơn một đề thiếu thước. Cái giá: xem D2 nhánh 3 và §8.

`AttachResult` thêm `testBundle: { id, version, approvedAt, pinned } | null` (`null` khi đề không sinh ca nào — không tạo gói rỗng).

`TestBundleService.list()` thêm `origin`; `create()` giữ nguyên hành vi, dùng chung hai hàm private `nextVersion`, `insertCases` với `adoptFromAuthoring`.

**Test:** unit `authoring-bundle.spec.ts` (9 ca, gồm chữ `đ` và 1 ca property trên các tên rác); e2e attach +5 ca (gói đã duyệt+ghim đúng số ca; gắn lần hai không đè và gói mới chưa duyệt; tên có dấu và tên trùng vẫn gắn được; đề không ca → `testBundle: null`; gói test hỏng → đề+đáp án vẫn nằm đó); `test-bundle.e2e-spec.ts` sửa `toEqual` như §3.

### 4.3 (c) Bảng duyệt bộ ca

`TestBundleService.get` thêm `constraint_quote` → `constraintQuote`. Route mới `POST exam-sessions/:id/test-bundles/:bundleId/drop-case` body `{ caseKey }` (`DropTestCaseDto`, regex trùng regex DB) → 201 `{ id, version }`: gói **đã duyệt** → 409; `caseKey` không thuộc gói → 404; gói phiên khác → 404 (qua `findOwnedBundle`); còn lại → gói mới cùng `origin`, cùng `created_by`, không chép ca đó, **chưa duyệt**.

Web (mã mới vào **file mới**): `lib/api/test-bundle-review.ts` (`dropTestBundleCase`), `hooks/useTestBundleDetail.ts` (`useTestBundleDetail`, `useDropTestBundleCase`), `_components/TestBundleList.tsx` (danh sách + bảng năm cột: Nhóm · Input · Output mong đợi · Câu trong đề mà ca này kiểm · *Bỏ ca này*; ca tự bỏ gạch ngang kèm lý do, không nút; đoạn giới hạn *"khớp nhau chưa chắc là đúng"* luôn hiện). `TestBundleCard.tsx` giữ khối *Tạo phiên bản mới* và uỷ thác phần danh sách cho `TestBundleList`. Ba nút *Sinh đáp án mẫu và gói test từ đề* / *Sinh gói test từ đáp án của bạn* / *Chạy thử đáp án mẫu với gói test* ở `PreparePanel.tsx` **giữ nguyên** `disabled` + `NeedsBackend` (G2b).

### 4.4 (d) Nguồn của tài liệu chấm

Migration `1789500000000-AddModelAnswerSetAt.ts` + entity `modelAnswerSetAt` + `upsert` đặt nó cùng nhịp `modelAnswerOrigin`:
`!hasAnswer ? null : answerSent ? new Date() : (existing?.modelAnswerSetAt ?? new Date())`.
`verify-schema.ts` **không** liệt kê `grading_reference` (đã grep) nên không cần sửa.

`readiness()` thêm `sources`:
* `question` — `kind: 'teacher_upload'` luôn (`ExamMaterialService.requestUpload` là đường duy nhất tạo `exam_material`), `fileName` và `setAt` từ `exam_material` (`fileName`, `uploadedAt`), nạp bằng `relations: { questionMaterial: true }`.
* `modelAnswer` — `kind`: `'authoring'` khi `model_answer_origin` là `'authoring'` **hoặc** `'generated'`, còn lại `'teacher_upload'` (bản 1 viết ngược lại và sai với dòng cũ có `origin` NULL); `fileName = model_answer_filename`; `setAt = model_answer_set_at`; `unverified = model_answer_unverified`.

Web: `GradingReadiness.sources?` (tuỳ chọn — API cũ không vỡ). `ReferenceForm` gỡ **cả hai** `NeedsBackend`; dòng nguồn: có file → *"bạn tải lên lúc … (tên file)"* / *"gắn từ Soạn đề lúc … (tên file)"*; chỉ có ghi chú → *"bạn ghi chú lúc …"* (không nói "tải lên" cho một câu chữ). **Băng vàng** hiện khi `unverified && !hasPinnedBundle`; ngược lại là dòng trung tính. `PreparePanel` truyền `hasPinnedBundle={Boolean(detail.data?.testBundleId)}` (đã có `detail` ở dòng 39).

**Test:** e2e `grading-reference.e2e-spec.ts` (helper có thật: `seedSession()`, `setReference()`, `readiness()`): đặt ghi chú → `set_at` có giá trị; **chỉ đổi đề bài** → `set_at` đứng yên (đây là ca ghim D6, sửa từ bản 1); đặt lại ghi chú → `set_at` đi tiếp; bỏ đáp án → NULL; `sources` cho phiên trống / có đề / đáp án ghi chú; e2e attach: `modelAnswer.kind='authoring'`, `unverified=true`. Web: `ReferenceForm.test.tsx` thay ca "cần backend" bằng các ca dòng nguồn và băng vàng.

### 4.5 (e) Dòng nguồn gốc thước

`_components/RulerOriginNote.tsx` — `RulerOriginNote({ sessionId })` gọi `useExamSessionDetail(sessionId)` (khoá `['exam-session', id]`, đã dùng ở `PreparePanel`) và `useTestBundles(sessionId)`; render `null` khi không có gói ghim hoặc gói không do hệ thống sinh (`origin` là `'generated'` hoặc `'from_model_answer'`; `origin` vắng thì **không** coi là hệ thống sinh). Chuỗi trung tính: *"Thước do hệ thống sinh — bạn duyệt lúc {…}."* Đặt: `grading/page.tsx` ngay sau `<SessionHeader … />` (dòng 114); `InvestigatorDossier.tsx` ngay sau `{header(d.status, d.ungradableReason)}` ở nhánh bố cục thường (dòng 133).

---

## 5. Tương tác với các gói khác

| Gói | Chạm chung | Quan hệ |
|---|---|---|
| G3 | `grading.module.ts` | Cả hai cộng thêm; G2 chỉ thêm `TestBundleService` vào `exports` |
| G3 | `grading/page.tsx` | G2: một dòng ngay sau `<SessionHeader />` (dòng 114). G3 phải đặt băng **sau** khối `results.isError` (dòng 116-123), trước `{loading ? …` (dòng 125) |
| G3 | `UngradableView.tsx` / `InvestigatorDossier.tsx` | G3 sửa `UngradableView`; G2 chỉ thêm một dòng vào `InvestigatorDossier` ở **nhánh khác** (bố cục thường, dòng 133) |
| G4 | `[resultId]/page.tsx` | G2 **không** sửa file này (đặt ở `InvestigatorDossier`), nên G4 rẽ nhánh kiểm mẫu ở dòng 119-121 không xung đột |
| G4/G5 | `FinalizePanel.tsx` | Không đụng |
| S | `page.tsx` | S thay `SessionPicker`→`SessionList` ở nhánh `!sessionId` (dòng 47-49); G2 sửa nhánh có `sessionId`. Sau ghép, đối chiếu dòng 114 |

Chỉ G2 sửa: `test-bundle.*`, `grading-reference.service.ts`, `grading-reference.entity.ts`, `ReferenceForm.tsx`, `TestBundleCard.tsx`, `attach-exam.service.ts`, `storage.service.ts`.

---

## 6. Các test sẽ viết

| Tệp | Loại | Nội dung |
|---|---|---|
| `storage.service.spec.ts` | unit (khôi phục) | 2 ca `putObject` |
| `authoring-bundle.spec.ts` | unit (mới) | 9 ca (gồm chữ `đ` và 1 ca property trên các tên rác) |
| `exam-authoring-attach.e2e-spec.ts` | e2e | 5 ca cũ giữ nguyên (ca đỏ sẵn phải xanh **không sửa**); +4 ca §4.1; +5 ca §4.2; +1 ca §4.4 (`sources` sau khi gắn từ Soạn đề) |
| `test-bundle.e2e-spec.ts` | e2e | sửa 2 `toEqual`; +5 ca: `constraintQuote`, `drop-case` (tạo phiên bản mới giữ `origin`), 409 gói đã duyệt, 404 ca lạ, 404 gói phiên khác + 400 `caseKey` sai khuôn. (Ca "gói `generated` chưa duyệt không ghim được" đã bỏ: ca "ghim trước khi duyệt → 400" có sẵn đã phủ nó) |
| `grading-reference.e2e-spec.ts` | e2e | +7 ca (`set_at` ×4, `sources` ×3) |
| `TestBundleList.test.tsx` | vitest (mới) | 9 ca |
| `TestBundleCard.test.tsx` | vitest | thêm 1 dòng mock, giữ nguyên assertion |
| `ReferenceForm.test.tsx` | vitest | xoá 1 ca, sửa helper, +7 ca |
| `RulerOriginNote.test.tsx` | vitest (mới) | 5 ca |
| `PreparePanel.test.tsx`, `page.test.tsx`, `InvestigatorDossier.test.tsx` | vitest | +1 ca; +2 ca và 1 mock; +1 ca và 1 mock |

---

## 7. Ngoài phạm vi

* **G2b** — sinh đáp án/gói test chỉ từ đề (LLM + môi trường chạy bài) và *Chạy thử đáp án mẫu với gói test*.
* *Canh thước* sau khi chấm (`ruler_warning`).
* Sàn §14.3 (*gói test chưa từng chạy → `ungradable`*): `grading-run.service.ts:212` mới chặn lúc **bắt đầu**.
* Ghi đè `origin` của gói đã tồn tại; gộp nhiều đề thành một gói; xuất gói test; sửa ca của gói đã duyệt.
* Việc của G1 (xong), G3, G4, G5.

---

## 8. Giới hạn đã biết và chỗ chưa kiểm chứng

**Giới hạn chấp nhận (đã nêu ở D2):**
1. Gói test hỏng **sau khi** đề và đáp án đã ghi → `attach` trả 500 nhưng đề+đáp án đã nằm trong phiên, chưa có thước. Gắn lại tạo bản đề thứ hai (xoá tay ở màn quản lý phiên). Không đảo thứ tự để tránh vì đảo có thể ghim thước của một lượt gắn thất bại.
2. Đáp án (khoá cố định) bị ghi đè trước khi DB cam kết; lần gắn hỏng sau đó để byte mới dưới dòng mô tả bản cũ.

**Chưa kiểm chứng:**
* Việc `putObject` rơi khi ghép nhánh là **suy luận** từ: `git log --full-history -G putObject` chỉ ra đúng `de779e8`, file ở `4e06f00^` có 0 lần `putObject`, và `05e303b` cùng ngày cùng file. Không đọc được commit ghép cụ thể.
* Chưa chạy e2e lần nào (Docker Desktop tắt); "ca *phiên chưa tới giờ thi* đỏ sẵn" dựa vào ledger G1 (tagged stash `47a1eb1`).
* Chưa xác nhận `app.get(GradingReferenceService)` trong e2e trả đúng singleton mà `AttachExamService` giữ (Nest test app mặc định `strict: false`, nên có khả năng đúng) — Task 1 có ca RED chứng minh.
