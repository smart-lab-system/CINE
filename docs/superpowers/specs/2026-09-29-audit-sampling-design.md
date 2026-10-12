# G4 — Kiểm mẫu ngẫu nhiên, và màn kiểm mù

**Ngày:** 2026-09-29 · **Trạng thái:** chờ duyệt ở PLAN · **Nhánh:** `feat/grading-g4-audit` (worktree `grading-g4-audit`)

Thiết kế cho hệ thống **tự quyết** những bài có bằng chứng mạnh (`auto_approved`). Nguồn nhãn KHÔNG LỆCH duy nhất để hiệu chỉnh nó là một mẫu ngẫu nhiên các bài đã tự quyết mà giảng viên **vẫn xem, mù**: parent spec §8.1 nói thẳng *"§8 không chạy được nếu thiếu §8.1"* và *"Kiểm mẫu ship CÙNG bước bật tự quyết"*. Hôm nay có trạng thái, bảng và cột — **không gì rút bài vào `audit_pending`**, không route nào ghi nhận xét, và API không giấu điểm.

---

## 1. Vì sao phải làm ngay

**1.1 — Tự quyết đã bật mà kiểm mẫu chưa có.** `writeInitial` (`score.service.ts:250-252`) đã đưa bài sang `auto_approved` mà không ai kiểm; các thứ còn lại của §8.1 nằm đó nhưng chưa nối: trạng thái `audit_pending` (`1789420000000`), bảng `audit_sample_review` (`1789450000000:201-209`, chỉ-thêm), cột `audit_sampled`/`audit_sampled_at` (`1789430000000:20-21`), `exam_session.grading_seed` (`entity:250-251`, mặc định `uuid_generate_v4()`).

**1.2 — Bài kiểm mẫu đang bị đối xử như bài thường ở nhiều chỗ mà không ai nghĩ tới.** Rà mọi đường đọc (§4.3 bên dưới), tôi tìm ra **bốn** đường rò điểm/lỗi của hệ thống ngoài hai đường hiển nhiên (danh sách, hồ sơ). Hai đường trả **từng bài**: `POST rules/preview` (`error-rule.service.ts:160-190`) trả `{ resultId, before, after }` — `before` là điểm mới nhất của hệ thống — và câu SQL của nó **cố ý gồm `audit_pending`** (dòng 167); `POST rules/:id/price/preview` (`price.service.ts:65-107`) đếm bài theo phiên kể cả bài kiểm mẫu. Hai đường còn lại rò **bằng phép trừ**: `GET rules` và `GET rules/missing` đếm `appliedTo.results` từ điểm mới nhất của **mọi** bài (`error-rule.service.ts:200-262`, CTE `latest` không lọc trạng thái).

**1.3 — Giảng viên không mở được bài nộp code từ màn chấm.** `DossierHeader` ghi *"Mở bài nộp"* `disabled` + *cần backend*; tải bài nộp chỉ có ở trang chi tiết phiên (`SubmissionStatusItem.downloadUrl`), và kiểu đó **không mang `submissionId`** nên khớp theo MSSV mơ hồ khi phiên có nhiều yêu cầu nộp. Kiểm mù mà không xem được bài thì vô nghĩa.

---

## 2. Bảng Quyết định

| # | Quyết định | Chọn gì | Đã cân | Vì sao | Giá nếu sai |
|---|---|---|---|---|---|
| D1 | Rút mẫu ở đâu, lúc nào | Trong `writeInitial`, **chỉ** khi `to === 'auto_approved'` — tức quyết định ĐẦU TIÊN của một bài đường điều tra. Rút trúng → **hai bước trong cùng transaction**: `ai_graded → auto_approved` (có sẵn) rồi `auto_approved → audit_pending` kèm `audit_sampled=true`, `audit_sampled_at=now` trong **một** UPDATE | Một bước `ai_graded → audit_pending` | Trigger **không có** cặp `ai_graded → audit_pending` (`1789460000000:40-41`; `grading-transitions.ts:16-32`), và `ck_grading_result_audit_sampled_at` bắt hai cột đổi cùng lúc | — |
| D2 | Hàm rút | `SHA-256("<seed>:<id kết quả>")`, 4 byte đầu (uint32 big-endian) `% 10000`; rút trúng khi `bucket < percent × 100`. **Thuần**, không đọc điểm, không đụng DB | `hashtext` trong SQL; `Math.random` | Tất định và tái lập được từ seed + id đã lưu; phân phối đều (test chứng minh); **đơn điệu** — tập rút ở 5% nằm trọn trong tập ở 20% cùng seed | Đổi hàm sau này thì bài đã rút không còn tái lập được — nhưng `audit_sampled` đã ghi nên lịch sử không mất |
| D3 | Tỉ lệ N | Env `GRADING_AUDIT_SAMPLE_PERCENT`; mặc định **20**; sàn **5**; trần **100**; **không bao giờ 0**. Giá trị thiếu/rỗng → mặc định. Vô nghĩa (chữ, số thập phân, `< 1`) → mặc định **kèm cảnh báo**. `1–4` → kẹp lên 5 kèm cảnh báo. `> 100` → 100 kèm cảnh báo | Từ chối khởi động (như `envPositiveInt`) | Khuôn của anh em gần nhất, `readAutoThreshold` (`decision/threshold.ts`): mặc định + cảnh báo, không nổ. Về 0 là điều parent spec cấm; mọi đường đều không cho ra 0 | Một giá trị gõ nhầm bị âm thầm thành 20 (có cảnh báo trong log) |
| D4 | **Rút mẫu tắt mặc định khi `NODE_ENV=test`** (chỉ khi env chưa đặt) | Có; e2e của chính G4 đặt `GRADING_AUDIT_SAMPLE_PERCENT=100` | Bật sẵn 20% ở test | **Không có nó thì hàng chục e2e có sẵn đỏ ngẫu nhiên**: `score-service.e2e-spec.ts:57` khẳng định `status: 'auto_approved'` ngay sau `computeInitial`, và nhiều suite khác cũng vậy — 20% số bài sẽ sang `audit_pending`. Tiền lệ: `selectAuthoringProvider`/`selectAdvocateProvider` cũng tắt/giả lập dưới `NODE_ENV=test` | Sản phẩm không bao giờ tắt (env chưa đặt ở dev/prod = 20%); chỉ test tắt. Nếu ai đặt `NODE_ENV=test` ở prod thì kiểm mẫu tắt — cùng rủi ro với hai bộ chọn provider kia |
| D5 | Giấu điểm/lỗi ở tầng API | **Một chỗ mỗi endpoint**: danh sách qua hàm thuần `blindAuditRow` bọc ở cuối `listForSession`; hồ sơ: `loadResultDetail` **trả bản mù dựng sẵn ngay đầu hàm, trước khi đọc bất kỳ dòng tính điểm nào** — không thể rò vì không đọc | Xoá trường ở controller | Đặt ở nguồn dữ liệu, không ở lớp vỏ; bản mù không đọc `score_computation` nên không thể lộ | Thêm một endpoint đọc mới mà quên → test "canary" (Task 4) là lưới an toàn: nó gọi mọi đường đọc và tìm điểm/khoá luật bí mật trong body |
| D6 | Bốn đường rò ở phía luật | Loại `audit_pending` khỏi: tier 2 của `rules/preview` (bỏ chuỗi khỏi `IN (…)`, dòng 167); `price/preview` (thêm `AND g.status <> 'audit_pending'`); CTE `latest` của `listByState` (dùng chung cho `GET rules` và `rules/missing`) | Để nguyên và chấp nhận | Rò **từng bài** (hai đường đầu) là rò trực tiếp điểm hệ thống; rò **đếm** cho phép suy ra bằng phép trừ khi số bài kiểm mẫu nhỏ (một bài duy nhất thì hiệu số chính là tập lỗi của nó) | **Hành vi nhìn thấy được đổi:** trang Luật đếm ít hơn (không tính bài kiểm mẫu chưa nhận xét) cho tới khi giảng viên nhận xét xong; sau đó bài vào số đếm như mọi bài |
| D7 | Nhận xét ghi thế nào | `POST /grading-results/:id/audit-review`, body `{ pickedRuleIds: uuid[], extraErrors: string[] }` (cả hai bắt buộc, được rỗng — "bài không có lỗi" là một nhãn thật). Một transaction: khoá giảng viên → khoá dòng → kiểm → INSERT `audit_sample_review` → `audit_pending → teacher_reviewed` | Hai route (ghi, rồi xem) | Ghi và tiết lộ phải cùng một bước nguyên tử: không có khoảng "đã ghi mà chưa mở" để nhãn bị sửa | — |
| D8 | Chọn luật hợp lệ | `pickedRuleIds` phải thuộc **bảng lỗi đang dùng (`state = 'active'`) của chính giảng viên** — 400 nếu không; khử trùng; ≤ 200. `extraErrors`: ≤ 20 dòng, mỗi dòng 1–500 ký tự **sau khi trim**, rỗng → 400 | Cho chọn mọi luật | Nhãn so với "bảng lỗi của chính họ" (parent spec §8.1 luật 3); luật đã thôi dùng không phải một lựa chọn | Luật vừa bị đổi trạng thái giữa lúc mở màn và lúc gửi → 400 với câu rõ |
| D9 | Bất biến của nhãn | Khoá chính `grading_result_id` + `guard_append_only` (có sẵn) + kiểm tường minh trước INSERT để trả **409 với câu tiếng Việt** thay vì 23505 chung chung | Chỉ dựa vào PK | `PostgresExceptionFilter` map 23505 thành câu chung chung; giảng viên cần biết vì sao | — |
| D10 | Điểm và trạng thái sau nhận xét | `teacher_reviewed`; điểm = lượt tính mới nhất của hệ thống, **không đổi**; **không** ghi `teacher_review` | Ghi `teacher_review` `kind='review'` | `finalizeGrades` xử lý bài đường điều tra `teacher_reviewed` không cần dòng review (`teacher-review.service.ts:292-307`, chữ ký ở `finalized_by`). Nhận xét là **nhãn**, không phải sửa điểm; nếu bất đồng, giảng viên dùng đường có sẵn (`error-exceptions`, `manual-score`) — giờ mở vì `teacher_reviewed ∈ EDITABLE` | — |
| D11 | "Hệ thống thấy lỗi nào" | Lượt tính mới nhất, `breakdown.errors` có `counted ∈ {'counted','unpriced'}` (bỏ `refuted`, `excluded`) | Gồm cả lỗi bị bác | Đó là chẩn đoán CUỐI mà hệ thống đứng sau; lỗi bị phản biện bác bỏ hệ thống không giữ | Một lỗi bị bác mà giảng viên chọn hiện là `teacher_only` — đúng nghĩa |
| D12 | Bản tiết lộ | `{ status, currentScore, currentScoreSource, systemErrors[], perRule[{ruleId,ruleKey,ruleName,verdict}], extraErrors[], summary{both,teacherOnly,systemOnly,neither,extra,agreement} }`; `verdict ∈ both \| teacher_only \| system_only`; `agreement`: `full` khi không có `teacherOnly`/`systemOnly`/`extra`; `none` khi `both = 0` mà có bất đồng; còn lại `partial` | Chỉ trả điểm | Đây là lúc che mù kết thúc; giảng viên cần thấy hệ thống thừa/thiếu ở đâu (parent spec §8.1 luật 3) | — |
| D13 | Tải bài nộp | Route mới `GET /grading-results/:id/submission-download` → `{ downloadUrl, fileName }` (kiểm chủ sở hữu; 404 khi bài chưa có file trên kho) | Khớp theo MSSV từ trang chi tiết phiên; sửa `DossierHeader` | Không mang `submissionId` thì mơ hồ; tách route riêng không đụng file của luồng khác. **Không** rò phán đoán của hệ thống | Một route đọc nữa phải giữ; nó chỉ ký URL của đúng bài của giảng viên |
| D14 | Route đọc số đồng thuận của phiên | **Không làm** | Thêm `GET …/audit-summary` | Báo cáo hiệu chỉnh §8.2 và canh trôi dạt là ngoài phạm vi; nhãn thô đã nằm trong `audit_sample_review` để xuất sau. Thêm route bây giờ mời dựng UI trên một con số chưa có giao thức §8.2 | Không có — cột `audit_sample_review` đủ cho lượt §8.2 sau |
| D15 | Migration | **Không** | Trigger bất biến cho `grading_seed` | Không đường code nào cập nhật `grading_seed` (chỉ entity + migration nhắc tới, đã grep). Quyết định rút đã ghi vào `audit_sampled` nên đổi seed sau không đổi lịch sử | Không có ràng buộc DB chống sửa seed bằng tay; chấp nhận, ghi ở §8 |
| D16 | Bài đã có trước thay đổi | **Không rút hồi tố** | Rút bù cho bài `auto_approved` cũ | Bài đã ở `auto_approved` có thể đã được mở xem; rút bù phá đúng điều kiện mù | Phiên cũ chưa có mẫu kiểm |
| D17 | Bài thành tự quyết SAU khi gắn cờ | **Không vào khung** (`flagged_for_review → auto_approved` ở `ruleLayerTransition` không rút) | Rút cả | Parent spec §8.1: lúc còn gắn cờ giảng viên có thể đã mở hồ sơ, nên nhãn lệch (T-SAMP-5) | Nhóm này không bao giờ được kiểm mẫu — spec ghi rõ đó là cái giá |
| D18 | Bài kiểm mẫu bị dời khỏi mẫu khi giá đổi | Giữ hành vi có sẵn (`ruleLayerTransition:535-541`): lượt tính lại ra không-auto → `audit_pending → flagged_for_review`, `audit_sampled=false` | Giữ trong mẫu | Bài đó sẽ hiện ở "Cần bạn xem" kèm chẩn đoán → không còn mù → phải rời mẫu. **Nói thẳng:** giảng viên đổi giá rồi thấy một bài kiểm mẫu chuyển nhóm là suy ra bài đó có lỗi thuộc luật vừa đổi. Đó là cái giá của việc cho đổi giá giữa lúc kiểm; không chặn ở đây | Một vector suy luận hẹp, có chủ ý |
| D19 | Tiết lộ hiển thị khi nào | Bản tiết lộ ở lại trên màn cho tới khi giảng viên bấm *Mở hồ sơ* (lúc đó mới làm mới danh sách/hồ sơ) | Làm mới ngay khi ghi | Làm mới ngay thì trang chuyển sang hồ sơ thường và bản tiết lộ biến mất trước khi kịp đọc | Điều hướng đi mà không bấm → danh sách tự làm mới ở lần mở sau (mặc định `staleTime` 0) |
| D20 | Ô điểm của bài kiểm mẫu ở danh sách | `scoreCell(_, 'audit')` = `{ text: 'ẩn', tag: 'chờ nhận xét của bạn' }` **kể cả khi `currentScore` có số**, kèm biểu tượng `EyeOff` | Chỉ tin API | Khoá thứ hai: UI không bao giờ in số cho trạng thái này dù API nhầm | — |

---

## 3. Đã kiểm trên code

| Cần biết | Ở đâu | Kết luận |
|---|---|---|
| Quyết định đầu tiên ghi ở đâu | `score.service.ts:223-265` (`writeInitial`) | `advanceStatus(m, id, ['ai_graded'], to, { flagForReview })`, `to = outcome === 'auto' ? 'auto_approved' : 'flagged_for_review'` |
| Mọi lối vào quyết định đầu | `score.service.ts:120,158` | `computeInitial` và `finishAttempt` **đều** gọi `writeInitial` — một điểm rút mẫu là đủ |
| Trigger vòng đời | `1789460000000-GradingLifecycleV2.ts:36-53` | `ai_graded → {auto_approved, flagged_for_review}`; `auto_approved → {audit_pending, flagged_for_review, teacher_reviewed, finalized}`; `audit_pending → {teacher_reviewed, flagged_for_review}` |
| `advanceStatus` đủ cột | `lifecycle/advance.ts:4-9` | `AdvanceExtra` có `auditSampled`, `auditSampledAt` — đúng thứ cần |
| CHECK cờ rút mẫu | `1789430000000:54-55` | `audit_sampled = (audit_sampled_at IS NOT NULL)` |
| Bài chưa kiểm chặn chốt | `grading-transitions.ts:41-43` | `BLOCKS_FINALIZE` gồm `audit_pending` |
| `finalizeGrades` với `teacher_reviewed` đường điều tra | `teacher-review.service.ts:292-307` | Không cần dòng `teacher_review`; `finalized_computation_id` = lượt tính mới nhất có điểm |
| Sửa điểm khi đang kiểm mẫu bị chặn | `error-exception.service.ts:19,139-145` | `EDITABLE = [auto_approved, flagged_for_review, teacher_reviewed]`; `audit_pending` → 409 *"Bài đang trong mẫu kiểm — hãy ghi nhận xét kiểm mẫu trước"* — câu này **đã trỏ tới route sắp có** |
| Duyệt lẻ/hàng loạt không chạm bài điều tra | `teacher-review.service.ts:87-91,118-121` | `pipeline === 'investigator'` → 409/bỏ qua |
| Bảng nhãn | `1789450000000:201-209`, `audit-sample-review.entity.ts` | PK `grading_result_id`; `teacher_id`, `picked_rule_ids uuid[]`, `extra_errors text[]`, `recorded_at`; `guard_append_only` |
| Đọc env kiểu nào là khuôn | `decision/threshold.ts`, `score.service.ts:87` | `private readonly theta = readAutoThreshold(process.env).theta;` — hàm thuần nhận `env`, đọc lúc khởi tạo |
| `ScoreService` không có lifecycle hook | `score.service.ts:85-93` | chỉ `@Injectable()` + constructor; có sẵn field `audit: AuditLogService` (**tên `audit` đã dùng** — đặt tên khác) |
| `grading_seed` | `exam-session.entity.ts:250-251` | `uuid`, mặc định `uuid_generate_v4()`; không đường code nào ghi nó |
| Danh sách dựng ở một chỗ | `grading.service.ts:761-810` | một `return { … }` — bọc bằng `blindAuditRow` |
| Hồ sơ | `scoring/result-detail.ts:60-135` | đọc `latestComputationRow`, `grading_attempt.investigation`, `teacher_review` |
| `submission-text` an toàn theo cấu trúc | `submission-text.service.ts:157-158` | chỉ đọc `criterion_results` (bài điều tra để `[]`) |
| Đường rò `rules/preview` tier 2 | `error-rule.service.ts:160-190` | SQL `g.status IN ('auto_approved', 'audit_pending', …)` (dòng 167), trả `{resultId, before, after, capped}` |
| Đường rò `price/preview` | `price.service.ts:65-107` | không lọc trạng thái; đếm `affected`, `autoAfter` theo phiên |
| Đường rò `GET rules`, `rules/missing` | `error-rule.service.ts:126-128,200-262` | `missing` = `listByState('proposed')`; CTE `latest` lấy lượt tính mới nhất của **mọi** bài của giảng viên |
| Đường an toàn | `reapply-prices/preview` (`score.service.ts:396-…`) | chỉ chạy khi phiên **đã chốt hết** — mà `audit_pending` chặn chốt, nên không thể có bài kiểm mẫu |
| Không có gateway phát sự kiện chấm điểm | `grep gateway` | không rò qua socket |
| Xuất CSV | web `lib/grading-export.ts` | dựng ở client từ danh sách (đã mù), và chỉ mở sau khi chốt |
| Bài nộp tải được ở đâu | `lib/api/exam-session.ts:128-155`, `SubmissionStatusTable.tsx` | `downloadUrl` không kèm `submissionId` (D13) |
| Web map trạng thái | `session-triage.ts:31-32` | `audit_pending → 'audit'` (đã có) |
| Đường vào hồ sơ code | `[resultId]/page.tsx:119-121` | `pipeline === 'investigator'` → `InvestigatorDossier` — G4 rẽ nhánh **trước** dòng này |

**Test có sẵn bị ảnh hưởng — đã đọc, plan xử lý từng cái:**

| Test | Vì sao | Xử lý |
|---|---|---|
| `FinalizePanel.test.tsx:62-64` | khẳng định nhóm kiểm mẫu mang nhãn *"cần backend"* — thứ G4 gỡ | Thay bằng "nhóm là liên kết thật, không nhãn"; **không** đụng ca `:51-55` (liên kết `?state=`) vẫn đúng |
| `ResultsTable.test.tsx:120` | `queryByRole('button', { name: /Kiểm mẫu/ })` không có (chưa có bài kiểm mẫu trong fixture) | Giữ nguyên — vẫn đúng |
| `session-triage.test.ts:103-123` | `scoreCell` chỉ có 6 ca, không ca nào cho `'audit'` | Thêm ca; **không** đổi ca cũ |
| `score-service.e2e-spec.ts:57` và các suite khác khẳng định `auto_approved` | Sẽ đỏ ngẫu nhiên nếu rút mẫu bật | Bảo vệ bằng D4 (không sửa test) |
| `[resultId]/page.test.tsx` | Trang gọi `AuditReview` (dùng `useRules`, `useAudit` chưa mock) | Mock `./_components/AuditReview` |

---

## 4. Thiết kế

### 4.1 Rút mẫu — `apps/api/src/grading/audit-sampling.ts` (file mới, thuần)

```ts
export const AUDIT_DEFAULT_PERCENT = 20;
export const AUDIT_FLOOR_PERCENT = 5;
export interface AuditSampling { enabled: boolean; percent: number; warning: string | null }
export function readAuditSampling(env: NodeJS.ProcessEnv): AuditSampling
export function auditBucket(seed: string, resultId: string): number      // 0..9999
export function drawnForAudit(seed: string, resultId: string, percent: number): boolean
```

`readAuditSampling`: thiếu/rỗng → `{ enabled: env.NODE_ENV !== 'test', percent: 20, warning: null }`; số nguyên `1..4` → `percent 5` + cảnh báo; `5..100` → nguyên; `> 100` → `100` + cảnh báo; còn lại (chữ, thập phân, `< 1`) → `percent 20`, `enabled: true`, cảnh báo. **Không nhánh nào cho `percent` < 5.**

`ScoreService`: field `private readonly sampling = readAuditSampling(process.env);` (cạnh `theta`); constructor ghi `warning` (nếu có) bằng `Logger`; `writeInitial` sau `advanceStatus(… to …)`:

```ts
if (to === 'auto_approved' && (await this.drawnForAudit(m, ctx))) {
  await advanceStatus(m, ctx.resultId, ['auto_approved'], 'audit_pending', {
    auditSampled: true, auditSampledAt: new Date(),
  });
}
```

`drawnForAudit` đọc `exam_session.grading_seed` bằng `ctx.sessionId` trong cùng `m`. `ruleLayerTransition` (`flagged_for_review → auto_approved`) **không** gọi nó (D17).

### 4.2 Giấu ở tầng API

* `apps/api/src/grading/audit-blind.ts` (mới, thuần): `blindAuditRow(row)` — nếu `row.status !== 'audit_pending'` trả nguyên; ngược lại `aiTotalScore = null`, `confidence = null`, `criterionResults = []`, `advocateOpinion = null`, `finalScore = null`, `currentScore = null`, `currentScoreSource = 'none'`, `triage = null`. Và `blindResultDetail(result)`: `ResultDetail` không điểm, `breakdown = null`, `investigation = null`, `challengeNotes = []`, `challengeVerdicts = []`.
* `GradingService.listForSession`: đổi `return { … }` thành `const view = { … }; return blindAuditRow(view);`.
* `loadResultDetail`: dòng đầu — `if (result.status === 'audit_pending') return blindResultDetail(result);` (trước khi đọc bất kỳ thứ gì).

### 4.3 Giấu ở phía luật (D6)

Ba sửa SQL, mỗi cái một dòng: tier 2 của `ErrorRuleService.preview` bỏ `'audit_pending'`; `PriceService.preview` thêm `AND g.status <> 'audit_pending'`; CTE `latest` của `listByState` thêm `AND g.status <> 'audit_pending'`. `recomputeForTeacher` **giữ** `audit_pending` (chỉ ghi, không trả) để điểm của bài kiểm mẫu vẫn đúng khi giá đổi.

**Bảng liệt kê từng đường đọc và quyết định** (spec yêu cầu; Task 4 có test "canary" gọi TẤT CẢ):

| Đường | Rò gì | Quyết định |
|---|---|---|
| `GET exam-sessions/:id/grading-results` | điểm, `triage`, độ tin cậy | `blindAuditRow` |
| `GET grading-results/:id/investigation` | breakdown, lỗi, ghi chú lăng kính, điểm | bản mù dựng sẵn |
| `POST rules/preview` (tier 2) | `resultId` + điểm `before` từng bài | loại `audit_pending` |
| `POST rules/:id/price/preview` | `affected`, `autoAfter` theo phiên | loại `audit_pending` |
| `GET rules`, `GET rules/missing` | `appliedTo.results`, `mismatchedIn` | loại khỏi CTE `latest` |
| `GET grading-results/:id/submission-text` | — | an toàn theo cấu trúc |
| `POST reapply-prices/preview` | — | không thể có bài kiểm mẫu (đã chốt hết) |
| `GET exam-sessions/:id/grading-progress` | số bài theo trạng thái | không rò (chỉ đếm trạng thái, mà trạng thái vốn hiển thị) |
| `POST grading-results/:id/review`, `bulk-review` | — | bỏ qua/409 bài điều tra |
| `error-exceptions`, `manual-score` | — | 409 có câu trỏ tới nhận xét kiểm mẫu |
| Socket | — | không có gateway chấm điểm |

### 4.4 Ghi nhận xét — `apps/api/src/grading/audit/`

* `audit-compare.ts` (thuần): `compareAudit({ picked, systemRuleIds, extraCount, activeRuleCount })` → `{ perRule: { ruleId, verdict }[], summary }` theo D12.
* `audit-review.service.ts`: `record(teacherId, resultId, dto)` (D7-D12) và `submissionDownload(resultId)` (D13).
* `audit-review.controller.ts`: `POST grading-results/:id/audit-review` → 201 bản tiết lộ; `GET grading-results/:id/submission-download`. Chủ sở hữu luôn qua `GradingService.findResultForOwner`.
* `dto/audit-review.dto.ts`: `@IsArray() @ArrayMaxSize(200) @IsUUID('all', { each: true }) pickedRuleIds`, `@IsArray() @ArrayMaxSize(20) @IsString({ each: true }) @Length(1, 500, { each: true }) extraErrors`.
* Đăng ký ở `grading.module.ts`: `AuditReviewController` vào `controllers`, `AuditReviewService` vào `providers`.

Thứ tự trong `record`: `lockTeacherScoring` → `SELECT … FOR UPDATE` dòng kết quả → `status ≠ audit_pending` → 409; đã có dòng `audit_sample_review` → 409; luật lạ → 400; INSERT; `advanceStatus(['audit_pending'] → 'teacher_reviewed', { flagForReview: false })`; dựng bản tiết lộ từ `latestComputationRow`.

### 4.5 Web

Mã mới vào **file mới**:
* `lib/api/audit.ts`, `hooks/useAudit.ts`: `recordAuditReview`, `getSubmissionDownload`; `useRecordAuditReview(resultId)` (không làm mới — D19), `useSubmissionDownload(resultId)`, `useOpenDossierAfterAudit(sessionId, resultId)` (làm mới danh sách + hồ sơ).
* `[resultId]/_components/AuditReview.tsx` (+ `AuditReveal.tsx`): tiêu đề *Kiểm mẫu*; đoạn giải thích **nói thẳng**: bài này được hệ thống chọn ngẫu nhiên, không dựa vào điểm; điểm và lỗi của hệ thống đang ẩn tới khi bạn nhận xét; *"Bước này gần như chấm lại từ đầu, nên tốn công hơn một bài cần xem"* (parent spec §8.1 còn ghi "khoảng 5 bài mỗi phiên 40 bài" — con số đó phụ thuộc N và tỉ lệ tự quyết, cả hai đổi được, nên màn hình **không** in nó); nút **Tải bài nộp**; danh sách luật **đang dùng** của chính giảng viên (từ `useRules`, lọc `state === 'active'`, **không hiện giá** — giá làm lệch lựa chọn) để tick; ô *Lỗi khác không có trong bảng lỗi* (mỗi dòng một lỗi); **không tick gì và không ghi gì** là một nhãn thật ("bài không có lỗi") nên nút chỉ mở khi giảng viên tick *Tôi xác nhận: bài này không có lỗi nào*, và dấu tick tự bỏ ngay khi họ chọn hoặc gõ thứ gì; nút *Ghi nhận xét và xem kết luận của hệ thống* mở hộp xác nhận *"Nhận xét ghi rồi thì khoá, không sửa được"* (*Xem lại* / *Ghi và khoá*) — chưa gửi gì cho tới *Ghi và khoá*; lỗi máy chủ nguyên văn ở form (hộp xác nhận tự đóng khi lỗi); thành công → `AuditReveal` (điểm hệ thống, bảng so sánh có **biểu tượng và chữ** cho từng verdict, tóm tắt đồng thuận) + nút *Mở hồ sơ*. Props: `{ resultId, sessionId, studentMssv, studentName, onRecorded, onOpenDossier }`.
* `[resultId]/page.tsx`: một import, một `useState` `audited`, và trước `if (result?.pipeline === 'investigator')` thêm `if (result && (result.status === 'audit_pending' || audited)) return <AuditReview … onRecorded={() => setAudited(true)} onOpenDossier={() => setAudited(false)} />;`. `audited` là thứ giữ D19 đúng: ghi nhận xét đổi trạng thái bài sang `teacher_reviewed`, và một lần làm mới danh sách (TanStack Query làm mới khi cửa sổ lấy lại tiêu điểm) sẽ đưa trang sang hồ sơ thường **trước khi** giảng viên đọc xong bản so sánh.
* `lib/session-triage.ts`: `scoreCell` trả `{ text: 'ẩn', tag: 'chờ nhận xét của bạn' }` cho `state === 'audit'` (D20); `ScoreTag` thêm giá trị đó. `ResultsTable.tsx`: biểu tượng `EyeOff` (`aria-hidden`) trước chữ ở ô điểm của dòng kiểm mẫu.
* `FinalizePanel.tsx`: bỏ `needsBackend: true` của nhóm kiểm mẫu và dòng `{g.needsBackend && <NeedsBackend />}` (không còn ai dùng); **giữ** import `NeedsBackend` (khối sổ điểm của G5 còn dùng tới lúc G5 thay).

---

## 5. Tương tác với các gói khác

| Gói | Chạm chung | Quan hệ |
|---|---|---|
| G3 | `grading.module.ts` | Cả hai thêm vào **cùng dòng** `controllers: […]` — xung đột một dòng, lấy hợp; `providers` khác dòng |
| G3 | `listForSession` | G3 thêm `ungradableClass` (một dòng mới); G4 bọc `return` bằng `blindAuditRow`. Hai vùng khác |
| G3 | `ResultsTable.tsx` | G3 **không** sửa file này |
| G2 | `[resultId]/page.tsx` | G2 **không** sửa file này (đặt ở `InvestigatorDossier`); G4 rẽ nhánh dòng 119-121 |
| G5 | `FinalizePanel.tsx` | G4 sửa `groups` + dòng `needsBackend`; G5 thay khối sổ điểm (dòng 100-112). **Cả G4 lẫn G5 đều giữ** import `NeedsBackend` (trên nhánh mỗi bên nó còn được dùng); **người ghép bên thứ hai gỡ nó** (eslint báo import thừa) |
| S | `session-triage.ts` | S thêm hàm; G4 sửa `scoreCell` + `ScoreTag`. Cộng thêm |

File của riêng G4: `audit-sampling.ts`, `audit-blind.ts`, `audit/*`, `lib/api/audit.ts`, `hooks/useAudit.ts`, `AuditReview.tsx`, `AuditReveal.tsx`.

---

## 6. Các test sẽ viết (đối chiếu mã test của parent spec)

| Mã | Loại | Tệp | Nội dung |
|---|---|---|---|
| T-AUDIT-1, T-AUDIT-2, T-SAMP-3 | unit | `audit-sampling.spec.ts` | tỉ lệ trong ±2% (20 000 id), ±1% ở 5%; đơn điệu; sàn — mọi giá trị env nhận được cho `percent ≥ 5`, không bao giờ 0; độc lập điểm; tách theo seed; `readAuditSampling` từng nhánh, gồm `NODE_ENV=test` |
| — | unit | `audit-blind.spec.ts` | bài `audit_pending` mất điểm/triage/độ tin cậy; bài khác nguyên vẹn |
| — | unit | `audit-compare.spec.ts` | `both`/`teacher_only`/`system_only`, `neither`, `agreement` ba mức, trùng, luật đã thôi dùng |
| T-SAMP-5 + rút ở lần đầu | e2e | `audit-sampling.e2e-spec.ts` | env 100 → bài tự quyết đầu tiên sang `audit_pending` với `audit_sampled` **và** `audit_sampled_at`; bài gắn cờ rồi thành tự quyết nhờ đặt giá **không** rút; test tắt mặc định |
| T-SAMP-1 | e2e | `audit-blind.e2e-spec.ts` | "canary": seed một bài kiểm mẫu với điểm `8.63` và khoá luật bí mật, gọi MỌI đường đọc (§4.3), khẳng định body không chứa hai chuỗi đó / đếm không tính bài này |
| T-SAMP-2, T-SAMP-4 | e2e | `audit-review.e2e-spec.ts` | ghi rồi khoá (409), vẫn là nhãn dù sau đó bất đồng; còn bài kiểm mẫu chưa kiểm → `finalize-grades` 409; tiết lộ đúng; 400/403/404 |
| — | vitest | `session-triage.test.ts`, `ResultsTable.test.tsx`, `FinalizePanel.test.tsx`, `AuditReview.test.tsx`, `[resultId]/page.test.tsx` | xem plan |

---

## 7. Ngoài phạm vi

Huấn luyện/dùng mô hình hiệu chỉnh (§8) và các bảng eval/calibration; báo cáo hiệu chỉnh §8.2 và canh trôi dạt; route đọc số đồng thuận (D14); chấm lại (G3); sổ điểm (G5); thước (G2); ràng buộc DB cho `grading_seed` (D15); rút bù hồi tố (D16); nút tải bài nộp ở `DossierHeader` (D13 chỉ cung cấp route và dùng ở `AuditReview`).

---

## 8. Giới hạn đã biết và chỗ chưa kiểm chứng

**Giới hạn chấp nhận:**
1. Không có ràng buộc DB chống sửa `grading_seed` bằng tay (D15).
2. Vector suy luận hẹp ở D18: đổi giá làm một bài kiểm mẫu chuyển nhóm.
3. Nhóm bài "tự quyết sau khi được đặt giá" không bao giờ được kiểm mẫu (D17) — bộ hiệu chỉnh không được suy rộng nhãn cho nhóm đó.
4. Số đếm ở trang Luật thấp hơn thực tế cho tới khi các bài kiểm mẫu được nhận xét (D6).
5. `NODE_ENV=test` ở môi trường thật sẽ tắt kiểm mẫu (D4) — cùng rủi ro với bộ chọn provider.

**Chưa kiểm chứng:**
* Chưa chạy e2e (Docker Desktop tắt): tính chất "đơn điệu và phân phối" được chứng minh ở unit, còn hành vi hai-bước trong transaction thật chưa quan sát.
* Chưa xác nhận Jest sao chép `process.env` theo từng file test (nếu không, `afterAll` của `audit-sampling.e2e-spec.ts` phải khôi phục biến — plan đã làm).
* `GradingService.findResultForOwner` đã đọc (`grading.service.ts:661-681`: 404 khi không có bài, 403 khi khác chủ). `ExamSessionService.findEntityForOwner` (dùng bởi `finalize-grades`) **chưa** đọc thân hàm — chỉ thấy controller gọi nó; T-SAMP-4 dựa vào việc nó chỉ kiểm sở hữu, sẽ lộ ngay ở lần chạy e2e đầu nếu sai.
* Chưa quan sát trigger vòng đời chấp nhận `audit_pending → teacher_reviewed` với đúng tập cột mà `advanceStatus` ghi (`status`, `flagForReview`): bảng chuyển trạng thái ở migration `1789460000000` cho phép cặp này, nhưng chưa có test nào đi cặp đó qua `advanceStatus` — `audit-review.e2e-spec.ts` là lần đầu.
