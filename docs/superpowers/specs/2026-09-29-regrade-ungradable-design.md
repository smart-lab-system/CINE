# G3 — Chấm lại bài không chấm được

**Ngày:** 2026-09-29 (bản 2, đã kiểm lại với mã) · **Trạng thái:** chờ duyệt ở PLAN · **Nhánh:** `feat/grading-g3-regrade` (worktree `grading-g3-regrade`)

Một lần dịch vụ AI hoặc môi trường chạy bài sập là cả phiên kẹt. Hôm nay có **bốn** nơi muốn cho giảng viên bấm *chấm lại* và cả bốn đều `disabled` + `NeedsBackend`.

> **Bản 2 sửa gì so với bản 1.** Bản 1 viết khi chưa đọc `advance.ts`, các test có sẵn, `RunningPanel` và cách BullMQ giữ job. Bản này: (1) bỏ `advanceStatus` (kiểu `AdvanceExtra` không cho đặt cột lý do — bản 1 sẽ không biên dịch); (2) thêm **bốn** nơi thay vì ba (`RunningPanel` bị bỏ sót); (3) thêm lỗi **job đã hoàn tất còn nằm trong Redis** làm bài kẹt vĩnh viễn; (4) liệt kê bốn file test đang khẳng định trạng thái `disabled`; (5) sửa lỗi `409/400` sai thứ tự khi bấm hai lần; (6) bỏ dòng "sửa `ResultsTable`" của brief — thừa và đụng G4.

---

## 1. Vì sao phải làm ngay

**1.1 — Con số trên nút hôm nay là con số sai.** `page.tsx:114` truyền `systemFailed={counts.ungradable}`, và `counts.ungradable` đếm mọi bài có `ungradableReason !== null` (`session-triage.ts:38-39`) — **cả hai lớp**. §4.4 tách rõ: `system` (chấm lại được) và `submission` (bài không đọc được, chấm lại ra đúng kết quả cũ). Nút *"Chấm lại 12 bài lỗi hệ thống"* có thể đang đếm cả những bài chấm lại vô ích.

**1.2 — Một bài không chấm được làm cả phiên không chốt được.** `flagged_for_review` nằm trong `BLOCKS_FINALIZE` (`grading-transitions.ts:41`). Giảng viên chỉ còn hai lối: chấm tay từng bài, hoặc bỏ phiên.

**1.3 — Gần như toàn bộ hạ tầng đã có; thiếu đúng hai mối nối.**
* Trigger DB **đã** cho `flagged_for_review → ai_grading` với đúng điều kiện (`1789460000000-GradingLifecycleV2.ts:60-64`: `ai_total_score IS NULL AND ungradable_class = 'system'`); bảng chuyển đã có cặp đó (`grading-transitions.ts:26`).
* `InvestigatorRunService.startAttempt` (`investigator-run.service.ts:84-107`) **đã** mở lượt kế tiếp (`attempt_no = MAX + 1`) khi lượt cũ đã đóng, miễn `status === 'ai_grading'`.
* `gradeOneById` (`grading.service.ts:294-313`) tự rẽ nhánh theo `result.pipeline` và chỉ thoát sớm khi `aiTotalScore` đã có — bài không chấm được thì không có.
* **Mối nối 1:** không route nào chuyển `flagged_for_review → ai_grading` và xếp job.
* **Mối nối 2:** danh sách không mang `ungradableClass`, nên web không phân biệt được hai lớp.

---

## 2. Bảng Quyết định

| # | Quyết định | Chọn gì | Đã cân | Vì sao | Giá nếu sai |
|---|---|---|---|---|---|
| D1 | Khi xếp lại, có xoá lớp/lý do không thể chấm không | **Có**: một UPDATE có điều kiện đặt `status='ai_grading'`, `ungradable_class=NULL`, `ungradable_reason=NULL`, `flag_for_review=false`, `confidence=NULL` | Giữ nguyên lý do | **Bắt buộc, không phải sở thích.** `ck_grading_result_ungradable` (`1789430000000:52-53`) là `CHECK (ungradable_class IS NULL OR (ai_total_score IS NULL AND ungradable_reason IS NOT NULL))`. Đường điều tra đã tự xoá khi có điểm (`score.service.ts:243-244`) nhưng **đường một-phát `gradeOneShot` (`grading.service.ts:554-597`) không hề đặt hai cột đó** → nếu giữ, lần ghi điểm đầu tiên nổ 23514 → 500 | Bài `one_shot` chấm lại nổ 500 ở lúc ghi điểm; test D1 (mutation) bắt được |
| D2 | Viết UPDATE bằng gì | Trực tiếp bằng QueryBuilder trong `RegradeService`, theo khuôn `markUngradable` (`grading.service.ts:219-232`) | Dùng `advanceStatus` | `AdvanceExtra` (`advance.ts:4-9`) chỉ cho `finalizedBy/At`, `finalizedComputationId`, `auditSampled(At)`, `flagForReview` — **không** có `ungradableClass/Reason/confidence`. Mở rộng nó là sửa file G4 cũng dùng | Hai nơi ghi chuyển trạng thái; chấp nhận vì `markUngradable` đã là tiền lệ |
| D3 | Thứ tự khoá | `lockTeacherScoring(m, teacherId)` **trước** UPDATE, trong transaction | Không khoá | Mọi đường chạm `grading_result` của bài đang chấm đều khoá trước (`markUngradable`, `startAttempt`, `lockRunning`); tránh chạy song song với lượt tính điểm | Thêm một khoá cố vấn ngắn hạn mỗi lần bấm |
| D4 | Xếp job thế nào | `queue.add('grade-submission', …, { ...GRADE_JOB_OPTIONS, jobId: 'grade-<submissionId>' })` **sau** khi transaction cam kết; nếu đã có job cùng `jobId` ở trạng thái `completed` hoặc `failed` thì **xoá nó trước** | Chỉ xoá job `failed` (như `regradeStuck`) | **Lỗi có thật:** `removeOnComplete: { age: 24 * 3600, count: 5000 }` (`grading.queue.ts:104`) giữ job hoàn tất 24 giờ. `finishUngradable` trả về bình thường nên job của một lượt "không chấm được" là `completed`. `queue.add` cùng `jobId` với job đang tồn tại **bị BullMQ bỏ qua im lặng** → DB đã sang `ai_grading`, không job nào chạy, bài kẹt. `regradeStuck` cũng không cứu được vì nó `continue` khi job tồn tại mà không `isFailed()` | Bài kẹt ở `ai_grading` mà không lỗi nào báo; test D4 (job `completed` giả) bắt được |
| D5 | Job đang sống (`active`/`waiting`/`delayed`…) | Không xoá, không thêm; tính là đã xếp lại | Ném lỗi | Một job sống sẽ đọc DB mới và chấm bài này (đọc `result.pipeline`, không dựa dữ liệu cũ); ném lỗi thì giảng viên thấy lỗi cho một việc đang chạy | Hiếm; để lại một lượt job chạy trên trạng thái vừa đổi |
| D6 | Thứ tự kiểm ở route một bài | **Trạng thái trước, rồi điểm, rồi lớp** | Bản 1: điểm → lớp | Bấm hai lần: lần hai bài đã ở `ai_grading` có `ungradable_class = NULL`; kiểm "lớp ≠ system" trước sẽ trả *"bài làm không đọc được"* — một lời nói dối. Kiểm trạng thái trước cho *"đang được chấm"* | — |
| D7 | Mã lỗi | Đang chấm → **409**; đã có kết quả (`ai_graded`…`exported`, hoặc `flagged_for_review` có điểm) → **400**; lớp `submission` → **400** kèm câu nói lối duy nhất là chấm tay | 409 cho cả ba | 409 = xung đột trạng thái; 400 = yêu cầu không hợp lệ về bản chất | — |
| D8 | "Cùng lý do" | So **nguyên văn** `ungradable_reason` | Thêm cột mã lý do | Chuỗi là văn bản tự do do hệ thống viết; chuẩn hoá là đoán. So nguyên văn gộp đúng những bài cùng một câu lỗi | Hai câu lỗi khác nhau về chữ nhưng cùng nguyên nhân không gộp — giảng viên bấm hai lần, an toàn |
| D9 | Mở rộng danh sách | `ungradableClass: 'system' \| 'submission' \| null` **ngay sau** `ungradableReason`, ở cả interface (`grading.service.ts:852`) và phép ánh xạ (`:785`) | Suy từ chuỗi lý do ở web | Suy từ chuỗi là đoán; đây là thứ duy nhất làm cho D7 chạy đúng ở UI | — |
| D10 | Một component cho mọi nút | `RegradeButton` (hộp xác nhận + gọi + kết quả + lỗi nguyên văn), dùng ở cả bốn nơi | Bốn bản sao | Hộp xác nhận phải nói đúng ba điều ở mọi nơi; một bản là cách duy nhất không lệch | Một component nhận `scope` hơi đa hình |
| D11 | Có sửa `ResultsTable` không | **Không** | Thêm nút chấm lại từng dòng (brief) | Dòng đã dẫn tới hồ sơ có nút chấm lại; nút ở dòng cần hộp xác nhận riêng; và G4 sửa cùng component | Giảng viên phải mở hồ sơ hoặc dùng nút đầu phiên để chấm lại — đủ đường |
| D12 | Băng "Dịch vụ AI lỗi" | Hiện khi có ≥ 2 bài lớp `system` **cùng một `ungradable_reason`**; đếm ở web từ danh sách | Ngưỡng theo thời gian | Danh sách **không có** thời điểm dừng của từng bài, nên không đo được "trong một khoảng ngắn"; "cùng lý do" đo được. Nói thẳng trong lời hiển thị | Băng hiện cả khi nhiều bài lỗi cách nhau nhiều giờ (vẫn hữu ích: cùng nguyên nhân) |

---

## 3. Đã kiểm trên code

| Cần biết | Ở đâu | Kết luận |
|---|---|---|
| Trigger cho phép chấm lại | `1789460000000-GradingLifecycleV2.ts:60-64` | Chỉ khi `ai_total_score IS NULL AND ungradable_class = 'system'`, ném `check_violation` |
| Bảng chuyển | `grading-transitions.ts:26` | `['flagged_for_review','ai_grading']` có sẵn |
| `advance.ts` không đủ cột | `lifecycle/advance.ts:4-9` | `AdvanceExtra` không có `ungradableClass/ungradableReason/confidence` |
| Khuôn UPDATE có điều kiện | `grading.service.ts:219-232` | `createQueryBuilder().update(GradingResultEntity).set({...}).where('submission_id = …').andWhere("status = 'ai_grading'")` |
| CHECK lớp lý do | `1789430000000-…Columns.ts:52-53` | như D1 |
| `gradeOneShot` không xoá lớp | `grading.service.ts:554-597` | `.set` không có `ungradableClass`/`ungradableReason` |
| Đường điều tra có xoá | `score.service.ts:243-244` | `ungradableClass: null, ungradableReason: null` trong `writeInitial`, `WHERE status = 'ai_grading'` |
| `lockRunning` đòi `ai_grading` | `score.service.ts:172-186` | nên đổi trạng thái **trước**, xếp hàng **sau** |
| `startAttempt` mở lượt mới | `investigator-run.service.ts:84-107` | trả `null` nếu `status !== 'ai_grading'`; lượt cũ đã đóng → INSERT `attempt_no = MAX + 1` |
| `gradeOneById` | `grading.service.ts:294-313` | thoát sớm chỉ khi `aiTotalScore` khác NULL; rẽ nhánh theo `pipeline` |
| Job hoàn tất nằm lại 24 giờ | `grading.queue.ts:90-104` | `removeOnComplete: { age: 24 * 3600, count: 5_000 }`, `removeOnFail: false` |
| `regradeStuck` bỏ qua job không `failed` | `grading-run.service.ts:381-383` | `if (!(await existing.isFailed())) continue;` — job `completed` bị coi như đang sống |
| `jobId` | `grading-run.service.ts:294` | `grade-${submissionId}`, không chứa `:` |
| `findResultForOwner` | `grading.service.ts:661`, dùng ở `grading.controller.ts:174,213,224` | trả `GradingResultEntity`, 404/403 theo chủ sở hữu |
| `findEntityForOwner` | `test-bundle.controller.ts:25` | dùng cho route theo phiên |
| `lockTeacherScoring` | `scoring/score-inputs.ts:17` | `(m: EntityManager, teacherId: string)` |
| `GradeSubmissionJob` | `grading.queue.ts:8-20` | `{ deliverableType, submissionId, requiredFilename, rubricId, teacherId }` |
| `UngradableView` đã có lớp | `UngradableView.tsx:10-20` | prop `ungradableClass` đến từ `d.ungradableClass` của `GET …/investigation` (`InvestigatorDossier.tsx:121`) — **hồ sơ có lớp, danh sách thì không** |
| Worker thật chạy trong e2e | `test/grading.e2e-spec.ts:94`, `investigator-run.e2e-spec.ts:53` | mẫu tất định: `overrideProvider(INVESTIGATOR_DEPS)` và gọi `grading.gradeOneById(job)` trực tiếp |
| `grading-regrade.spec.ts` là việc KHÁC | `src/grading/grading-regrade.spec.ts` | "chấm lại nội bộ khi ≥ 50% dẫn chứng không kiểm chứng được" (T-G2-1b) — **không liên quan**; đặt tên mới để không nhầm |

**Test có sẵn khẳng định trạng thái `disabled` — G3 cố ý đổi, plan xử lý từng cái:**

| Test | Đang khẳng định | Xử lý |
|---|---|---|
| `page.test.tsx:241-248` | nút *Chấm lại 1 bài lỗi hệ thống* `disabled` và không gửi gì; fixture **không** có `ungradableClass` | Thay bằng ca "nút thật, đúng số"; fixture thêm `ungradableClass: 'system'` (không thêm thì đếm ra 0 — chủ ý: API cũ không mang lớp thì **không hiện** thay vì hiện số có thể sai) |
| `InvestigatorDossier.test.tsx:46` | `Chấm lại bài này` `disabled` | Thay: có mặt và `enabled` |
| `UngradableView.test.tsx:23-30` | hai nút `disabled` + hai huy hiệu | Thay |
| `RunningPanel.test.tsx:174-179` | nút *Chấm lại 2 bài lỗi hệ thống* `disabled` và không gọi gì | Thay |
| `InvestigatorDossier.test.tsx:209` | `queryByRole('button', { name: /Chấm lại bài này/ })` **không có** (bài đã chấm tay) | Giữ nguyên — vẫn đúng |
| `UngradableView.test.tsx:32-36` | lớp `submission` không có nút chấm lại | Giữ nguyên — vẫn đúng |

Mock cần thêm: `page.test.tsx`, `InvestigatorDossier.test.tsx`, `RunningPanel.test.tsx`, `UngradableView.test.tsx` đều render `RegradeButton` (dùng `useMutation`) → mock `./RegradeButton`; không mock thì vỡ vì thiếu `QueryClientProvider`.

---

## 4. Thiết kế

### 4.1 `RegradeService` — file mới `apps/api/src/grading/regrade.service.ts`

```ts
export interface RegradeSkip { resultId: string; reason: string }   // reason: câu tiếng Việt hiện thẳng
export interface RegradeOutcome { requeued: number; skipped: RegradeSkip[] }

export type RegradeRefusal =
  | { code: 'in_progress'; status: 409; message: string }
  | { code: 'has_score'; status: 400; message: string }
  | { code: 'submission_class'; status: 400; message: string }
  | { code: 'not_ungradable'; status: 400; message: string };

/** Hàm THUẦN — thứ tự kiểm là logic dễ hỏng nhất ở đây nên phải test được không cần DB. */
export function regradeRefusal(row: { status: GradingResultStatus; aiTotalScore: string | null; ungradableClass: UngradableClass | null }): RegradeRefusal | null
```

Thứ tự (D6): `status ∈ {ai_grading, ai_graded}` → `in_progress`; `status ≠ flagged_for_review` → `has_score` ("đã có kết quả"); `aiTotalScore ≠ null` → `has_score`; `ungradableClass = 'submission'` → `submission_class`; `ungradableClass ≠ 'system'` → `not_ungradable`; ngược lại `null`.

Câu tiếng Việt (nguyên văn, để test khớp):
* `in_progress`: *"Bài này đang được chấm — chưa cần chấm lại."*
* `has_score`: *"Bài này đã có kết quả — chấm lại là đổi thước sau khi đã đo. Nếu điểm chưa đúng, hãy chấm tay: thao tác đó có ghi nhật ký."*
* `submission_class`: *"Bài này không chấm được vì bài làm không đọc được — chấm lại sẽ ra đúng kết quả cũ, nên lối duy nhất là chấm tay."*
* `not_ungradable`: *"Bài này không ở trạng thái không chấm được."*

`regradeOne(teacherId, resultId)`: nạp một dòng bằng SQL (`grading_result` ⋈ `submission` ⋈ `required_deliverable`: `status, ai_total_score, ungradable_class, submission_id, rubric_id_version, required_filename, deliverable_type`); `regradeRefusal` → ném `ConflictException`/`BadRequestException` theo `status`; rồi `requeue`.

`requeue(teacherId, row)`: (1) **một** transaction: `lockTeacherScoring` → UPDATE có điều kiện (D1/D2/D3), điều kiện `WHERE id = :id AND status = 'flagged_for_review' AND ungradable_class = 'system' AND ai_total_score IS NULL`; `affected = 0` → trả `skipped` *"Bài đã đi tiếp — có lượt khác vừa xử lý nó."*; (2) ngoài transaction: `getJob(jobId)` → trạng thái `completed`/`failed` → `remove()`; trạng thái sống → không thêm, tính đã xếp lại (D5); không có → thêm (D4).

Nếu `queue.add` lỗi (Redis chết) sau khi DB đã sang `ai_grading`: bài ở `ai_grading` không job — đúng ca mà `regradeStuck`/nút *Chấm tiếp N bài treo* đã có cứu. Ghi vào §8.

`regradeUngradable(teacherId, examSessionId, reason)`: một `SELECT` ứng viên (`status='flagged_for_review' AND ungradable_class='system' AND ai_total_score IS NULL AND ($2::text IS NULL OR ungradable_reason = $2)`, `ORDER BY g.id`), rồi **tuần tự** gọi `requeue` cho từng dòng (không UPDATE hàng loạt: mỗi dòng phải qua đúng một UPDATE có điều kiện, và `skipped` phải nói được bài nào vì sao). Trả `{ requeued, skipped }` cho toàn bộ. Không chia lô (khác bản 1): vòng lặp tuần tự, phiên ≤ vài trăm bài.

### 4.2 Route — controller mới `regrade.controller.ts`

`POST grading-results/:id/regrade` → 201 `RegradeOutcome` (`findResultForOwner` trước). `POST exam-sessions/:id/regrade-ungradable` body `{ reason?: string | null }` (`RegradeUngradableDto`: `@IsOptional() @IsString() @MaxLength(4000)`) → 201 `RegradeOutcome` (`findEntityForOwner` trước). Đăng ký ở `grading.module.ts`: `RegradeController` vào `controllers`, `RegradeService` vào `providers` — cộng thêm, mỗi thứ một dòng.

### 4.3 Danh sách mang `ungradableClass`

`GradingResultView` và ánh xạ `listForSession`: thêm `ungradableClass` ngay sau `ungradableReason` (`entity.ungradableClass ?? null`). Web: `GradingResult.ungradableClass?: 'system' | 'submission' | null` (tuỳ chọn — API cũ không có nó).

### 4.4 Web

* `lib/session-triage.ts` (cộng thêm hàm thuần): `countSystemUngradable(results)` và `groupByUngradableReason(results)` — chỉ bài `stateOf === 'ungradable'` **và** `ungradableClass === 'system'`; bài không có `ungradableClass` **không** được đếm (không đoán).
* `lib/api/regrade.ts`, `hooks/useRegrade.ts` (file mới): `regradeResult(resultId)`, `regradeUngradable(examSessionId, reason)`; `useRegradeResult(examSessionId)` (mutate `resultId`), `useRegradeUngradable(examSessionId)` (mutate `reason | null`). Cả hai làm mới `['exam-sessions', id, 'grading-results']`, `['exam-sessions', id, 'grading-progress']`; `useRegradeResult` làm mới cả `investigationQueryKey(resultId)`.
* `_components/RegradeButton.tsx` (mới, D10): `scope = { kind: 'result'; sessionId; resultId } | { kind: 'session'; sessionId; reason: string | null; count: number }`. Bấm mở hộp xác nhận nói **ba điều**: (1) bao nhiêu bài; (2) *mỗi bài là một lượt gọi có tính phí*; (3) *đóng trang không dừng việc chấm*. Xác nhận → gọi; thành công hiện *"Đã xếp lại N bài."* và mỗi lý do bỏ qua một dòng (`role="status"`); lỗi hiện nguyên văn `Alert` destructive.
* `SessionHeader.tsx`: nút *Chấm lại N bài lỗi hệ thống* → `RegradeButton` (session, `reason: null`), `systemFailed` = `countSystemUngradable`. `RunningPanel.tsx` khối "N bài đã dừng" → `RegradeButton` (session) và sửa câu *"chấm lại cả loạt cần một route mà backend chưa có"*. `UngradableView.tsx`: *Chấm lại bài này* (result) và *Chấm lại cả N bài cùng lý do* (session + `reason`); `N` là prop mới `sameReasonCount` do `InvestigatorDossier` tính từ danh sách. `_components/AiServiceBand.tsx` (mới, D12) đặt ở `page.tsx` **sau** khối `results.isError`, **trước** `{loading ? …`.
* Lớp `submission`: giữ nguyên — không nút chấm lại, chỉ *Chấm tay bài này*.

---

## 5. Tương tác với các gói khác

| Gói | Chạm chung | Quan hệ |
|---|---|---|
| G2 | `grading.module.ts` | Cả hai cộng thêm (G2 vào `exports`, G3 vào `controllers`/`providers`) |
| G2 | `page.tsx` | G2: một dòng ngay sau `<SessionHeader />`. G3: băng **sau** khối `results.isError`, trước `{loading ? …` |
| G2 | `InvestigatorDossier.tsx` | G2: một dòng ở nhánh bố cục thường (`{header(...)}` trước `{handGraded && (`). G3: nhánh `d.ungradableClass && !handGraded` (dòng 116-129) |
| G4 | `listForSession` | G4 ẩn điểm bài kiểm mẫu (đổi giá trị); G3 thêm một trường. Cùng hàm, hai dòng khác nhau |
| G4 | `ResultsTable.tsx` | G3 **không** sửa file này (D11) |
| S | `page.tsx`, `SessionHeader.tsx` | S thêm `BackToListLink` ở `SessionHeader`; G3 sửa vùng nút. Cộng thêm |

File của riêng G3: `regrade.service.ts`, `regrade.controller.ts`, `dto/regrade-ungradable.dto.ts`, `lib/api/regrade.ts`, `hooks/useRegrade.ts`, `RegradeButton.tsx`, `AiServiceBand.tsx`.

---

## 6. Các test sẽ viết

| Tệp | Loại | Nội dung |
|---|---|---|
| `regrade.service.spec.ts` | unit (mới) | `regradeRefusal`: 8 ca gồm **thứ tự** (bài đã ở `ai_grading` có lớp NULL → `in_progress`, không phải `submission_class`) |
| `test/regrade.e2e-spec.ts` | e2e (mới, **queue giả**) | một bài `system` → dòng về `ai_grading`, lớp+lý do NULL, `queue.add` đúng `jobId`; **mutation D1**: sau route, `scoreResult` thành công (bỏ hai cột khỏi UPDATE → 23514); lớp `submission` → 400; có điểm → 400; đang chấm → 409; bấm hai lần → lần hai 409 *"đang được chấm"*; job `completed` còn trong Redis giả → bị xoá rồi thêm (**D4**); job `failed` → như trên; job `active` → không thêm, vẫn `requeued: 1`; cả phiên: đúng số, lọc `reason`, bài lớp `submission` không bị kéo vào, `skipped` có bài đã đi tiếp; gói của người khác → 403/404 |
| `test/regrade-loop.e2e-spec.ts` | e2e (mới, worker gọi trực tiếp) | đường điều tra: sau route, `grading.gradeOneById(job)` với `INVESTIGATOR_DEPS` kịch bản → lượt chấm thứ hai (`attempt_no = 2`), `ai_total_score` có, lớp NULL |
| `test/grading-results-triage.e2e-spec.ts` | e2e (mở rộng) | `listForSession` trả `ungradableClass` |
| `session-triage.test.ts` | vitest | `countSystemUngradable`, `groupByUngradableReason` (bài thiếu `ungradableClass` không được đếm) |
| `RegradeButton.test.tsx`, `AiServiceBand.test.tsx` | vitest (mới) | hộp xác nhận nói đủ ba điều; lỗi nguyên văn; bỏ qua hiện lý do |
| `page.test.tsx`, `InvestigatorDossier.test.tsx`, `UngradableView.test.tsx`, `RunningPanel.test.tsx` | vitest | thay bốn ca `disabled` (§3) |

---

## 7. Ngoài phạm vi

Chấm lại bài **đã có điểm** (§1.2/§2.2 cấm; lối duy nhất là chấm tay có nhật ký); mọi kiểu thử lại tự động (`@Interval`); ước lượng chi phí; nút hàng loạt cho lớp `submission`; làm dịch vụ AI/môi trường chạy bài sống lại; khối *Đang chạy ngay lúc này* (G7; nhãn `NeedsBackend` ở `RunningPanel.tsx:175` **giữ nguyên**); nút chấm lại từng dòng ở `ResultsTable`. Ba test cũ mã hoá luật đóng băng **cũ** (T-FREEZE-1 ở `grading-reference.e2e-spec.ts`, ca 409 ở `session-rubric.e2e-spec.ts`, T-ATT-2): plan kiểm từng cái ở Task cuối, chỉ sửa nếu còn sai — `grading-reference.e2e-spec.ts` đã có `T-FREEZE-3` (phiên chỉ có bài không chấm được → sửa tài liệu ĐƯỢC) nên luật 6 đã được cài.

---

## 8. Giới hạn đã biết và chỗ chưa kiểm chứng

**Giới hạn chấp nhận:**
1. `queue.add` lỗi sau khi DB đã sang `ai_grading` → bài kẹt không job. Cứu bằng nút *Chấm tiếp N bài treo* có sẵn (`regradeStuck`) — nhưng **chỉ** khi nó không bị job `completed` chặn; D4 giữ cho ca chính không dính lỗi đó.
2. Job `active` cho một bài vừa được đưa về `ai_grading` (D5): job sẽ đọc DB mới; chưa có test chứng minh lượt chạy dở ấy kết thúc sạch.
3. Băng D12 đo "cùng lý do", không đo "trong một khoảng ngắn", vì danh sách không có thời điểm dừng.
4. **Chấm lại khoá thước của phiên (luật 6, tìm thấy khi chạy thật).** Chấm lại đưa bài sang `ai_grading`, và `GRADING_LOCKED_SQL` (`grading-lock.ts`) khoá đề, đáp án, gói test và rubric của phiên khi có bài `ai_grading`/`ai_graded`. Khoá tới khi bài có điểm hoặc lại dừng. Hộp xác nhận của `RegradeButton` không nói điều này. Ai cần sửa thước phải sửa **trước** khi chấm lại. Chưa sửa hộp xác nhận (ngoài phạm vi); nên thêm một câu vào hộp ở lượt sau.

**Chưa kiểm chứng:**
* Chưa chạy e2e (Docker Desktop tắt): mutation check của D1 (bỏ hai cột → 23514) là suy luận từ câu CHECK đã đọc nguyên văn.
* Chưa quan sát `Job.getState()` trả `'completed'` trên một job hoàn tất thật (chỉ đọc kiểu): BullMQ **6.3.4** khai `getState(): Promise<JobState | 'unknown'>` và `JobState = 'completed' | 'failed' | 'active' | 'delayed' | 'prioritized' | 'waiting' | 'waiting-children'` (`node_modules/.pnpm/bullmq@6.3.4…/dist/esm/classes/job.d.ts:331`, `types/job-type.d.ts:2`). Ca e2e D4 dùng queue **giả**, nên không chứng minh được hành vi thật của Redis — Task 14 có một bước smoke với Redis thật.
* Đã kiểm: `investigationQueryKey` được `hooks/useGrading.ts:311` export.
