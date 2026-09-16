# Duyệt hàng loạt & can thiệp theo tiêu chí — thiết kế

**Ngày:** 2026-09-16 · **rev 1**
**Trạng thái:** chờ duyệt
**Nhánh nền:** `feature/grading-ui-waves-0-3` (sau khi PR #33 merge)
**Là đợt 4** của `docs/superpowers/specs/2026-09-16-grading-ui-design.md` §2.1
**Bản mẫu:** https://claude.ai/artifact/1eARVjMh1B15SN9bKy2KjJ — màn "Ma trận điều hành"

---

## 0. Luận điểm

> **Khi gần cả lớp bị giữ lại, bắt giảng viên mở từng bài là hệ thống thất bại ở đúng lúc nó cần thành công.**

Đợt 0→3 làm được việc thứ nhất: mở khoá dữ liệu và dựng chỗ để đọc một bài
cho tử tế. Nhưng nó không giảm **số bài phải đọc**. Với cấu hình hiện tại —
ngưỡng tự duyệt 0.85 cao hơn mọi trần của bậc dự phòng — **không bài nào tự
duyệt**, nên con số "cần bạn duyệt" luôn là gần cả lớp.

Đợt này nén nó xuống. Không phải bằng cách duyệt hộ, mà bằng cách nhóm những
bài mà **quyết định là như nhau** lại, và cho phép quyết định một lần.

---

## 1. Phạm vi

**Trong phạm vi:** một route ghi hàng loạt, bốn luật biến đổi, và màn Ma trận
điều hành.

**Ngoài phạm vi, đã tách có chủ đích:**

| Việc | Vì sao tách |
|---|---|
| Tạm dừng / tiếp tục lượt chấm | **Đợt 4b.** Bài toán khác (cứu một lượt đang sai, không phải giảm số bài phải đọc), và giá thật cao hơn spec cũ ngụ ý — xem §7 |
| Gom cụm ngữ nghĩa | Đợt 6. Cần hạ tầng embedding; `grep embedding\|pgvector\|cosine` trong `apps/api/src` trả về **0 file** |
| Huỷ lượt chấm, chạy lại bài lỗi | Đợt 4b |

---

## 2. Hai thứ mockup nói sai

Bản mẫu vẽ trước khi đọc kỹ ràng buộc server. Ghi ra để người đọc sau không
tưởng mockup là nguồn sự thật.

### 2.1 "Chia đều trọng số sang các tiêu chí còn lại" là BẤT KHẢ

`TeacherReviewService.validateAndTotal()`:

```ts
if (entry.points > maxPoints) {
  throw new BadRequestException(`Điểm của một tiêu chí vượt quá điểm tối đa (${maxPoints}).`);
}
```

Chia trọng số của tiêu chí bị huỷ sang tiêu chí khác nghĩa là cho tiêu chí đó
**vượt thang của chính nó** — server trả 400. Cả hai đường mà spec giao diện
§6.4 nêu đều hỏng ở đây: đường 1 (ghi `teacher_review` hàng loạt) bị chặn bởi
chính dòng trên, đường 2 (rubric version mới) thì vừa đắt vừa làm hỏng dữ liệu
hiệu chuẩn.

**Đổi ngữ nghĩa:** "huỷ tiêu chí" thành **"cho điểm tối đa tiêu chí này cho cả
lớp"**. Không tiêu chí nào vượt thang, tổng vẫn trên cùng thang điểm, rubric
không đổi, `guard_rubric_criteria_immutable` không bị đụng tới. Và nó trung
thực hơn: rubric vẫn nói tiêu chí đáng N điểm, và mọi sinh viên được N.

### 2.2 "Lấy mức cao hơn" không phải một thao tác riêng

Mockup có ba nút hàng loạt: *Giữ điểm lượt chấm* · *Lấy mức cao hơn* · *Áp kiến
nghị của lượt phản biện*. Hai nút sau là cùng một thứ, nếu `apply_advocate`
được định nghĩa cho đúng: **lấy `max` theo TỪNG tiêu chí**, không ghi đè mù.

Định nghĩa đó mua được một bảo đảm **kiểm được bằng test**:

> Áp kiến nghị phản biện **không bao giờ làm tụt điểm** một sinh viên.

Đó là thứ bán được cho giảng viên, và nó an toàn kể cả khi lượt phản biện lỡ
kiến nghị một mức thấp hơn — kiểu `AdvocateSuggestion` không cấm điều đó, dù
vai của nó là bênh vực.

---

## 3. Một route, một union luật

### 3.1 Vì sao một, không phải hai

`bulk-review` và `criterion-adjust` là **cùng một phép toán ở hai độ mịn**:
*xuất phát từ kết quả AI, áp một phép biến đổi, ghi một dòng `teacher_review`*.

Tách làm hai route thì phần **khó** bị nhân đôi — giao dịch, khoá hàng theo
thứ tự, cổng trạng thái, audit cho bài đã công bố — còn phần **dễ** (phép biến
đổi) thì không. Một route, và bốn luật là bốn hàm thuần.

### 3.2 Hợp đồng

```
POST /exam-sessions/:id/bulk-review
@Roles('teacher') + examSessions.findEntityForOwner(id, req.user.sub)
```

```ts
export interface BulkReviewDto {
  /** LUÔN tường minh, kể cả khi là cả phiên. */
  resultIds: string[];
  rule:
    | { kind: 'keep_ai' }
    | { kind: 'apply_advocate' }
    | { kind: 'criterion_full_marks'; criterionId: string }
    | { kind: 'criterion_bonus';      criterionId: string; points: number };
  privateNote?: string;
}

export interface BulkReviewOutcome {
  applied: number;
  skipped: { resultId: string; reason: 'not_reviewable' | 'no_advocate' }[];
  /** Bài đã công bố — mỗi bài một dòng nhật ký. */
  audited: number;
}
```

### 3.3 Ba quyết định trong hợp đồng

**① `resultIds` luôn bắt buộc — không có "bỏ trống = cả phiên".**

Client đã có sẵn danh sách (nó vừa gọi `grading-results` để vẽ bảng), nên 45
UUID tốn ~1,7KB. Đổi lại: server kiểm **từng id có thuộc phiên không**, nên một
client cũ không vô tình chạm vào những bài nó không biết là có. "Cho điểm tối
đa cả lớp" là thao tác mà *cả lớp* phải do người gửi khai ra, không do server suy.

**② `skipped` trả về LÝ DO, không chỉ số đếm.**

Bài rơi về `ai_grading` do đối soát thì bị bỏ qua — nhưng giảng viên cần biết
**bài nào** để quay lại. `skipped: 3` bắt họ tự đi tìm.

**③ `criterionId` kiểm MỘT lần cho cả phiên.**

Mọi kết quả trong một phiên dùng chung một `rubric_id_version`: `startGrading`
đóng băng rubric một lần, và `setSessionRubric` trả 409 khi đã có kết quả. Nên
"tiêu chí này có trong rubric không" là câu hỏi của phiên, không của từng bài.

**Cố ý KHÔNG có `dry_run`.** Bảng ma trận đã hiện Δ và điểm quy ra trước khi
bấm — đó chính là bản xem trước. Một chế độ preview ở server sẽ là nguồn sự
thật thứ hai cho cùng một phép tính.

---

## 4. Bốn hàm luật

File `apps/api/src/grading/bulk-rules.ts` — **LEAF, không import gì** ngoài
type. Cùng lý do `harness/grading-guards.ts` là hàm thuần: đây là chỗ duy nhất
có phép tính điểm, và test nó phải chạy trong mili giây mà không dựng Nest.

```ts
export type BulkRule =
  | { kind: 'keep_ai' }
  | { kind: 'apply_advocate' }
  | { kind: 'criterion_full_marks'; criterionId: string }
  | { kind: 'criterion_bonus';      criterionId: string; points: number };

export interface RuleInput {
  /** Nguồn sự thật cho "phải có tiêu chí nào" — KHÔNG phải criterionResults. */
  rubricCriteria: { id: string; maxPoints: number }[];
  criterionResults: CriterionResult[];
  advocateOpinion: AdvocateOpinion | null;
}

export type RuleOutcome =
  | { ok: true;  criteria: ReviewCriterion[] }
  | { ok: false; reason: 'no_advocate' };

export function applyRule(rule: BulkRule, input: RuleInput): RuleOutcome;
```

| Luật | Làm gì |
|---|---|
| `keep_ai` | chép nguyên mức đánh giá + điểm của AI |
| `apply_advocate` | theo TỪNG tiêu chí, lấy `max(điểm AI, điểm quy từ kiến nghị)`. Không có ý kiến → `{ ok: false, reason: 'no_advocate' }` |
| `criterion_full_marks` | chép AI, đặt tiêu chí đã nêu về `met` / điểm tối đa |
| `criterion_bonus` | chép AI, `points = min(hiện tại + N, tối đa)` |

### 4.1 Bốn chi tiết quyết định tính đúng

**① Duyệt theo `rubricCriteria`, không theo `criterionResults`.**
`validateAndTotal` ném 400 nếu payload không phủ **đủ** mọi tiêu chí của
rubric. Nếu AI trả thiếu một tiêu chí — guard G3 chặn, nhưng phòng thủ vẫn rẻ
— thì duyệt theo đầu ra AI sinh payload thiếu và làm hỏng **cả lô**. Tiêu chí
nào AI không nói thì mặc định `not_met` / 0.

**② `keep_ai` KHÔNG phải no-op.**
Nó vẫn ghi một dòng `teacher_review`, và đó chính là thứ đẩy trạng thái sang
`teacher_reviewed` — điều kiện để `finalizeGrades` chạy. Nhóm Δ=0 cần đúng cái
này: hai lượt đã đồng thuận, giảng viên xác nhận, bài đi tiếp.

**③ `criterion_bonus` chặn trần, im lặng.**
Không chặn thì một bài đã ở điểm tối đa nhận `+2` sẽ vượt `maxPoints` và 400
**cả lô**. Chặn là ngữ nghĩa đúng của "cộng bù" — không ai cộng vượt thang.
Nhãn trên UI phải nói ra (§6.2), để sự im lặng không thành bất ngờ.

**④ Mức đánh giá suy TỪ điểm, không ngược lại.**
`pointsFor()` chỉ có ba bậc, còn chấm thật cần 3/5. `ReviewCriterionDto` đã ghi
rõ *"giảng viên sửa ĐIỂM trực tiếp; `verdict` là nhãn định tính đi kèm"*, và
`validateAndTotal` **không** kiểm hai thứ khớp nhau. Nên tính điểm trước, rồi
gắn nhãn: bằng trần → `met`, bằng 0 → `not_met`, còn lại → `partially_met`.

---

## 5. Giao dịch, cổng trạng thái, audit

Phần rủi ro cao nhất của cả đợt.

### 5.1 File riêng, nhưng KHÔNG logic riêng

`bulk-review.service.ts` tách khỏi `teacher-review.service.ts` — đúng tiền lệ
`grading-run.service.ts` tách khỏi `grading.service.ts`.

Nhưng nó **không được viết lại** máy móc duyệt. `review()` hiện tự mở giao dịch
(`this.dataSource.transaction`), nên gọi nó 45 lần là 45 giao dịch — hỏng giữa
chừng để lại nửa lớp đã chỉnh.

**Rút ruột `review()` ra một `reviewWithin(manager, …)` riêng:**

```
review()      →  mở giao dịch  →  reviewWithin(manager, …)
bulkReview()  →  mở giao dịch  →  reviewWithin(manager, …) × N
```

Cùng nguyên tắc đã áp cho `verifyEvidence` / `locateEvidence` ở đợt 0: **một
cài đặt, hai đường vào.** Hai thân hàm là hai thứ sẽ trôi khỏi nhau, và ở đây
cái trôi sẽ là quy tắc audit.

### 5.2 Ba ca khó được thừa hưởng miễn phí

| Ca | `review()` đã làm gì |
|---|---|
| Duyệt lần đầu | `advance(auto_approved\|flagged_for_review → teacher_reviewed)` |
| Duyệt lần hai | `advance` trả `false`, mang đúng một nghĩa: *"đã qua `teacher_reviewed`, nên đây là lần sửa thứ hai"* |
| Sửa sau khi chốt | Trạng thái không nhúc nhích (vòng đời không có lối ra khỏi `finalized`), nhưng audit bắn |

### 5.3 Thứ tự khoá hàng phải XÁC ĐỊNH

`finalizeGrades` đã khoá hàng có `ORDER BY`, kèm lý do: *"Không có `ORDER BY`
thì thứ tự chỉ đúng do tình cờ (heap scan), và hai giao dịch chốt cùng một
phiên…"* — tức deadlock.

`bulkReview` chạm **đúng tập hàng đó**, nên phải khoá theo **cùng thứ tự**. Một
lượt chốt điểm và một lượt duyệt hàng loạt xảy ra cùng lúc là chuyện rất thật:
giảng viên bấm "duyệt cả nhóm" rồi bấm "chốt" ngay sau.

### 5.4 Bỏ qua ≠ nuốt lỗi

Hai loại "không làm được", xử lý **ngược nhau**:

- **Trạng thái không duyệt được** (`ai_grading`, `ai_graded`) → bỏ qua, ghi vào
  `skipped` kèm lý do, **lô vẫn chạy**. Đây là tình huống vận hành: một bài vừa
  được đối soát lại. Repo có sẵn cả hai nếp (`RosterService` chặn cả batch,
  `ClassImportService` thì không) và ghi rõ lý do phân biệt; ca này giống
  `ClassImportService`.
- **Id không thuộc phiên** → **400, không làm gì cả**, kiểm TRƯỚC khi mở giao
  dịch. Đây là bug hoặc tấn công, không phải tình huống vận hành.

Và mọi lỗi ngoài dự kiến → **rollback toàn bộ**. Không có chế độ "áp được bao
nhiêu hay bấy nhiêu": với "cứu cả lớp khi một tiêu chí hỏng", nửa vời tệ hơn
không làm.

### 5.5 Audit: cùng tên hành động, thêm ngữ cảnh

Security rule 4 không có ngoại lệ cho thao tác hàng loạt. 45 bài đã `finalized`
= **45 dòng audit**, trong cùng giao dịch.

Giữ nguyên tên `grading_result.score_edited_after_finalize`, **không** đặt tên
mới: câu hỏi thật của thanh tra là *"ai đổi điểm sau khi công bố"*, và tách làm
hai tên buộc mọi truy vấn sau này phải nhớ hỏi cả hai.

`rule` đi vào `newValue`, để phân biệt 45 quyết định riêng lẻ với một cú bấm
ảnh hưởng 45 bài — khác biệt đó là thứ người đọc sổ sáu tháng sau cần thấy.

> **Đã kiểm, không phải giả định:** `AuditLogService.recordUserAction` nhận
> `newValue?: Record<string, unknown>` (payload tuỳ ý) và nhận `manager` để ghi
> trong cùng giao dịch của người gọi. Comment tại chỗ giải thích vì sao tham số
> `manager` tồn tại: *"một entry ghi trên kết nối thứ hai LÀ một đường như thế:
> bản sửa commit, lần ghi này hỏng, và điểm đã công bố đã đổi mà không có tên ai"*.

---

## 6. Màn Ma trận điều hành

Đây là màn thứ ba của bản mẫu. Hệ thiết kế **không đổi** — token Indigo+Teal
của repo, Inter, TanStack Table, checkbox + **một** thanh hành động.

### 6.1 Giữ nguyên từ mockup

Phân nhóm ba mức theo khoảng cách · bảng nén 7 cột (chọn · sinh viên · lượt
chấm · phản biện · lệch · lý do giữ lại · **một câu tóm tắt**) · thanh hành
động dính đáy nền indigo · dòng nói rõ cột "Phản biện" là điểm **quy ra**.

Phần tính toán **đã có sẵn**: `apps/web/src/lib/grading-triage.ts` từ đợt 0→3
có `advocateScore()` và `pointsForVerdict()`, đã được test. Nhóm Δ tính ở
client, không cần route mới.

### 6.2 Ba chỗ phải sửa so với mockup

| Mockup | Sửa thành | Vì sao |
|---|---|---|
| 3 nút hàng loạt | **2 nút** — *Giữ điểm lượt chấm* · *Áp kiến nghị phản biện* | "Lấy mức cao hơn" gộp vào nút thứ hai (§2.2) |
| *"Huỷ tiêu chí — chia đều trọng số"* | **"Cho điểm tối đa tiêu chí này cho cả lớp"** | chia trọng số bị 400 (§2.1) |
| *"Cộng bù"* | **"Cộng bù, tối đa +N điểm"** | chặn trần không được thành bất ngờ (§4.1③) |

Panel can thiệp tiêu chí **bỏ** viền đứt `cần backend`. Panel gom cụm **giữ**
(đợt 6).

### 6.3 Một thứ mockup chưa có

`skipped` cần chỗ hiển thị — một dòng dưới thanh hành động:

> *Đã áp cho 11 bài. **3 bài bỏ qua**: Nguyễn Minh Anh, Lê Thanh Hà, Võ Hoàng
> Nam — đang được chấm lại.*

Nêu **TÊN**, không nêu số đếm.

---

## 7. Đợt 4b — tạm dừng lượt chấm (tách riêng, ghi để không mất)

Nhu cầu có thật: giảng viên thấy bất thường giữa lượt chấm và muốn dừng.

**Nhưng `queue.pause()` của BullMQ là SAI.** `GRADING_QUEUE = 'grading'` —
**một** hàng đợi dùng chung cho mọi giảng viên. Guide đã cảnh báo: *"Queue là
TOÀN CỤC theo Redis, không theo tiến trình."* Nút "Tạm dừng" trên màn của thầy
A sẽ dừng lượt chấm của thầy B, và không ai được báo gì.

**Vì sao một hàng đợi là đúng, không phải thiếu sót:**

```ts
@Processor(GRADING_QUEUE, {
  concurrency: GRADE_CONCURRENCY,   // 5
  limiter: GRADE_RATE_LIMIT,        // 10 job/giây
})
```

Hai con số đó là ngân sách của **tài nguyên bên ngoài** — rate limit và tiền
token của nhà cung cấp AI. Trong BullMQ chúng gắn vào **worker**, mà mỗi hàng
đợi cần worker riêng. Một hàng đợi mỗi lượt chấm nghĩa là ngân sách **nhân lên
theo số lượt đang chạy**: ba giảng viên bấm cùng lúc = 15 lời gọi song song,
30 job/giây, vượt đúng cái trần hai dòng này tồn tại để giữ.

**Thiết kế đúng cho 4b:** cờ tạm dừng **theo phiên**, không theo hàng đợi.

| | |
|---|---|
| migration | cột cờ trên `exam_session` |
| `grading.processor.ts` | đọc cờ đầu `process()`, nếu dừng thì `job.moveToDelayed()` |
| 2 route | tạm dừng / tiếp tục |

Đi theo đúng đường `progress()` đã đi: `total/pending/done` đếm từ **DB theo
phiên**, còn `queue.*` là câu hỏi khác — *"hàng đợi toàn hệ thống có kẹt
không"*. Hàng đợi không phải chỗ diễn đạt trạng thái của một lượt chấm.

⚠️ Nó chạm `grading.processor.ts` — file đang gánh timeout, phân loại lỗi và
chống retry sai. Đó là lý do nó là spec riêng, không phải một task thêm vào đây.

---

## 8. Test

### 8.1 Hàm thuần (`bulk-rules.spec.ts`)

| Ca | Vì sao có |
|---|---|
| `keep_ai` chép đúng mức đánh giá + điểm | nền của ba luật kia |
| **AI trả thiếu một tiêu chí → output vẫn phủ ĐỦ rubric** | thiếu là 400 cả lô |
| **`apply_advocate` không bao giờ làm tụt điểm** | khẳng định trên MỌI tiêu chí, không phải một ca mẫu |
| `apply_advocate` với `opinion === null` → `no_advocate` | nhóm Δ=0 có bài không kích hoạt cổng |
| `criterion_bonus` chặn trần | không chặn là 400 cả lô |
| `criterion_bonus` suy nhãn từ điểm | trần → `met`, 0 → `not_met`, còn lại → `partially_met` |
| `criterion_full_marks` chỉ động vào tiêu chí đã nêu | các tiêu chí khác phải nguyên vẹn |

### 8.2 E2E

- N bài → N dòng `teacher_review`, **một giao dịch**
- Bài `ai_grading` bị bỏ qua **kèm lý do**, lô vẫn chạy
- Id không thuộc phiên → **400 và không ghi gì**
- Bài đã `finalized` → **một dòng audit mỗi bài**, cùng giao dịch, `rule` có trong `newValue`
- **Audit hỏng → cả lô rollback.** Khuôn có sẵn: `teacher-review.e2e-spec.ts` ca *"audit hỏng thì điểm KHÔNG đổi"*, spy lên `AuditLogService`
- Bài đã `teacher_reviewed` → sửa lần hai chạy được (`advance` trả `false` là đúng, không phải lỗi)

### 8.3 Component (vitest)

- Thanh hành động **chỉ hiện khi có dòng được chọn**
- Danh sách bỏ qua hiện **TÊN**, không hiện số đếm
- Nhãn "Cộng bù" nói ra trần
- Nhóm Δ đếm đúng — `grading-triage.test.ts` đã phủ sẵn

---

## 9. Cố ý KHÔNG làm

| Không làm | Vì sao |
|---|---|
| `bulk_full_marks` cho cả bài | Cho cả lớp điểm tối đa toàn bài là thứ không nên có nút bấm |
| `dry_run` ở server | Bảng ma trận đã là bản xem trước; preview ở server là nguồn sự thật thứ hai |
| Áp một phần khi lỗi | Nửa lớp đã chỉnh, nửa chưa, không ai biết ranh giới ở đâu |
| Tên hành động audit riêng cho bulk | Tách tên buộc mọi truy vấn sau này phải hỏi cả hai |
| Vòng lặp 45 lời gọi `review()` ở client | Không có giao dịch; và 45 round-trip qua process đang chạy 5 worker chấm |

---

## 10. Rủi ro

| Rủi ro | Mức | Xử lý |
|---|---|---|
| `reviewWithin` rút ra làm đổi hành vi của `review()` đơn lẻ | **Cao** | 25 test của `teacher-review.e2e-spec.ts` phải xanh KHÔNG sửa một dòng nào. Đó là điều kiện nghiệm thu của task rút ruột |
| Deadlock giữa `bulkReview` và `finalizeGrades` | Trung bình | Cùng `ORDER BY` khi khoá hàng, như §5.3 |
| Giao dịch 45 bài quá dài | Thấp | `finalizeGrades` đã làm cả phiên trong một giao dịch; quy mô mục tiêu là 40–50 bài |
| `criterion_bonus` chặn trần âm thầm gây hiểu nhầm | Thấp | Nhãn UI nói ra trần (§6.2) |

---

## 11. Câu hỏi còn mở

Không còn. Bốn câu của bản nháp đã chốt trong lúc thiết kế:

| | Chốt |
|---|---|
| Một route hay hai? | **Một**, union luật — phần khó không bị nhân đôi |
| "Huỷ tiêu chí" nghĩa là gì? | **Cho điểm tối đa**; chia trọng số bất khả (§2.1) |
| "Lấy mức cao hơn" có phải luật riêng? | **Không** — gộp vào `apply_advocate` định nghĩa theo max từng tiêu chí (§2.2) |
| Tạm dừng có nằm trong đợt này? | **Không** — đợt 4b, và `queue.pause()` là cách sai (§7) |
