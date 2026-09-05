# Design: TeacherReview — giảng viên sửa và chốt điểm (A1)

**Date:** 2026-09-05
**Status:** Approved by user in chat (architectural path — 3 vòng hỏi đáp, kèm 4
khoảng trống do user chỉ ra và đã lấp; 2 trong số đó phải kiểm chứng bằng DB
introspection chứ không phải lập luận)
**Branch:** `feature/teacher-review`, tách từ `feature/session-pinned-rubric`
(PR #27) — A1 cần `rubricId`/`rubricVersion` từ đó.
**Scope:** Bước 19 của §3.5 kế hoạch tổng thể. Bước 20 (GradeExport) và 21
(calibration) tách spec riêng — xem §12.
**Reuses unchanged:** `AuditLogService.recordUserAction`, bảng `teacher_review`
và enum `grading_status` (đã có từ `InitialSchema`), `ExamSessionService
.findEntityForOwner`, toàn bộ máy trạng thái ở trigger
`validate_grading_result_lifecycle`.

---

## 1. Vì sao có spec này

### 1.1 Ba trạng thái chưa bao giờ đạt tới

`grading_status` có bảy giá trị. Hệ thống hiện chỉ đi được tới bốn:

```
ai_grading → ai_graded → auto_approved | flagged_for_review
                                            ↓
                          teacher_reviewed → finalized → exported
                          └──────────── chưa bao giờ ────────────┘
```

Bảng `teacher_review` có entity, có migration, có FK, và **không một dòng API
nào đụng tới**. "Giảng viên sửa điểm" hiện là con số 0 ở backend — nguyên văn
§7 của `2026-09-03-submissions-rollup-page-design.md`.

Hệ quả: AI đề xuất điểm xong thì luồng đứt. Giảng viên xem được điểm và bằng
chứng, nhưng không sửa được, không chốt được, không xuất được.

### 1.2 Và Security rule 4 hiện không thể thi hành

Rule 4 nằm trong danh sách "không bao giờ được vi phạm": *mọi lần sửa điểm sau
khi `status = finalized` phải ghi `AuditLog`*. Nó không bị vi phạm — nó **không
thể được thi hành**, vì không có đường code nào sửa điểm cả. A1 là lúc quy tắc
đó trở thành thật.

---

## 2. Phạm vi

**Trong:** duyệt từng bài (sửa theo tiêu chí) · chốt điểm cả phiên · sửa sau khi
chốt kèm `AuditLog` · workspace hai cột thay cho bảng phẳng.

**Ngoài:** xem §12.

---

## 3. Dữ liệu — một index, không đổi schema

Bảng `teacher_review` đủ dùng nguyên trạng. Enum đủ giá trị. **Một migration
duy nhất, và nó là về hiệu năng:**

```sql
CREATE INDEX idx_teacher_review_result_time
  ON examcollect.teacher_review (grading_result_id, reviewed_at DESC);
```

Postgres **không** tự tạo index cho phía tham chiếu của một FK. Không có index
này, mọi lần tra "review mới nhất của kết quả này" là seq scan trên
`teacher_review` — và đó là truy vấn chạy trên **mỗi** lần đọc trang Chấm điểm,
với một bảng chỉ có thêm chứ không bao giờ bớt.

### 3.1 "Điểm cuối cùng" suy lúc đọc, không denormalize

Mỗi lần sửa tạo một dòng `teacher_review` mới (bảng **không** có unique trên
`grading_result_id` — đã kiểm chứng, và đó là chủ đích: comment trên entity nói
*"edits always create a new row here"*). Điểm cuối cùng = dòng mới nhất theo
`reviewed_at`, lấy bằng lateral join.

**Đã cân nhắc và bác:**

| Phương án | Vì sao không |
|---|---|
| Thêm cột `final_score` lên `grading_result` | Hai chỗ cùng giữ một sự thật, và chúng sẽ lệch. Lại phải mở rộng `guard_grading_result_ai_immutable` để bảo vệ cột mới. |
| Đánh dấu một dòng review là "hiện hành" | Phải giữ bất biến "đúng một dòng current" — đúng loại bất biến `isActive` của rubric vừa gây rắc rối ở PR #27. |

Quy mô là vài chục bài mỗi phiên; đây không phải bài toán hiệu năng. Và lịch sử
sửa điểm **chính là** dữ liệu rule 4 tồn tại để bảo vệ — biến nó thành phái sinh
của một cột denormalized là đi ngược chiều.

---

## 4. Quyền sở hữu — phần bản nháp đầu BỎ SÓT

Bản nháp đầu của spec này **không có một dòng nào** về kiểm quyền, trong khi mọi
spec trước (Rubric, Submission, Roster) đều dùng nhất quán `findEntityForOwner`
→ 403. Đây là lỗ hổng nghiêm trọng nhất được chỉ ra khi review, và nó được lấp
tường minh ở đây.

### 4.1 `finalize-grades` — dùng lại đúng khuôn có sẵn

`examSessions.findEntityForOwner(id, teacherId)`, y hệt `start-grading` ngay
bên cạnh nó trong cùng controller.

### 4.2 `review` — cần một phương thức mới, vì `:id` không phải phiên thi

`POST /grading-results/:id/review` nhận id của một `GradingResult`. Đường tới
chủ sở hữu dài ba chặng:

```
grading_result.submission_id → submission.exam_session_id → exam_session.teacher_id
```

Thêm `GradingService.findResultForOwner(gradingResultId, teacherId)` làm đúng
join đó: **404** nếu không tồn tại, **403** nếu không phải chủ — cùng ngữ nghĩa
`findEntityForOwner`.

**Không để controller tự join.** Quy tắc quyền nằm ở một phương thức có tên là
cách duy nhất để lần sau không ai quên nó.

### 4.3 Ranh giới đã biết: chủ phiên thi vs giảng viên chủ quản

Quyền chấm neo vào `exam_session.teacher_id` — **người tạo phiên**. Nhưng §3.4
kế hoạch tổng thể định tuyến bài thi về `submission.home_teacher_id` — giảng
viên quản lý sinh viên đó — để bài "chảy" về đúng người, kể cả khi thi ghép ở
phòng/phiên của người khác.

Với thi ghép, **hai người này khác nhau**: bài của sinh viên thầy A thi ở phiên
cô B thì hiện **cô B** chấm.

A1 **giữ nguyên hành vi này**, vì `start-grading` đã hành xử như vậy từ trước và
nhất quán quan trọng hơn. Nhưng đây là mâu thuẫn thật với ý định §3.4, được ghi
ra đây để nó không mục đi trong im lặng — nó xứng đáng một task riêng, không
phải một quyết định lén trong A1.

---

## 5. Máy trạng thái — MỘT phương thức sở hữu mọi transition

Có hai chỗ đổi `grading_result.status` trong A1 (`review` và `finalize-grades`).
Cả hai đi qua **một** phương thức private:

```ts
private async advance(
  resultId: string,
  from: GradingResultStatus | GradingResultStatus[],
  to: GradingResultStatus,
): Promise<boolean>
```

Hiện thực mirror đúng `ExamSessionService.finalizeExamSession` — kiểm chứng:
`exam_session.status` chỉ được ghi ở **đúng hai chỗ**, `create()` cho giá trị
ban đầu và `finalizeExamSession()` cho transition duy nhất; cả scheduler lẫn nút
tay đều gọi hàm sau.

```ts
.update(...).set({ status: to })
.where('id = :id').andWhere('status IN (:...from)')   // optimistic
// affected === 0 → không ở trạng thái mong đợi → 409
```

**Nó KHÔNG chép lại bản đồ transition của trigger.** Chép lại là tạo ra đúng
loại lệch mà `findClash` vs `EXCLUDE` ở PR #27 phải xử lý bằng cách mirror chính
xác kèm chú thích. `WHERE status IN (...)` đủ để bắt trạng thái sai và cho ra
409 có nghĩa; `validate_grading_result_lifecycle` vẫn là nơi **định nghĩa** bản
đồ, và là lớp chặn cuối cho mọi đường ghi khác.

---

## 6. Backend — hai endpoint mới, một endpoint mở rộng

Cả ba đặt ở `GradingController`: `GradingModule` import `ExamSessionModule` một
chiều, nên route cần cả hai service phải ở phía grading. Controller không có
prefix và đã khai `exam-sessions/:id/start-grading` theo đúng kiểu này.

### 6.1 `POST /grading-results/:id/review`

Body:

```ts
{ criteria: [{ criterionId: string; verdict: CriterionVerdict; points: number }] }
```

**Không nhận `finalScore` từ client.** Server tính `finalScore = sum(points)`.
Nhận từ client thì tổng có thể không khớp các phần, và bảng phân tích theo tiêu
chí thành một lời nói dối.

Kiểm, theo thứ tự — *bạn là ai* → *việc này làm được không* → *dữ liệu có hợp lệ không*:

1. `findResultForOwner` → 404 / 403 (§4.2)
2. **Cổng trạng thái → 409** (§6.1.1)
3. Mỗi `criterionId` phải thuộc đúng `rubric_id_version` của kết quả này → 400
4. Phải khai **đủ** mọi tiêu chí của rubric đó → 400. Thiếu một tiêu chí nghĩa
   là tổng bị tính hụt mà không ai nhận ra.
5. `0 ≤ points ≤ criterion.maxPoints` → 400. Nhờ (4)+(5), tổng luôn nằm trong
   thang điểm rubric, không cần kiểm riêng.

#### 6.1.1 Cổng trạng thái — kiểm TƯỜNG MINH, không suy từ `advance()`

```
Cho phép:  auto_approved · flagged_for_review · teacher_reviewed · finalized · exported
Từ chối:   ai_grading · ai_graded            → 409
```

**Vì sao đây là một phép kiểm riêng chứ không phải hệ quả của `advance()`.**
Bản nháp đầu của spec này không có bước này: nó tạo dòng review trước, rồi gọi
`advance(id, [auto_approved, flagged_for_review], teacher_reviewed)`, và coi
`false` là "không sao, chắc là gọi lần hai". Cách đó **gộp hai tình huống khác
hẳn nhau vào cùng một hành vi im lặng**:

| Status thật | `advance` trả | Bản nháp đầu làm gì | Đúng ra phải |
|---|---|---|---|
| `teacher_reviewed` / `finalized` | `false` | tạo dòng, bỏ qua | tạo dòng — **đúng**, đây là sửa lần hai |
| `ai_grading` / `ai_graded` | `false` | tạo dòng, bỏ qua | **409, không tạo gì** |

Ở `ai_grading`, `ai_total_score` và `criterion_results` đều còn **NULL** — nên
dòng review sinh ra sẽ đánh giá một kết quả chấm rỗng. Và vì status không phải
`finalized`, nhánh audit ở §7 cũng không chạy. Sai lặng lẽ ở cả hai tầng.

Bốn phép kiểm payload (3-5) **không** bắt được chuyện này: chúng đối chiếu với
rubric, mà rubric tồn tại độc lập với việc AI đã chấm xong hay chưa.

Ghi chú `Đang chấm — không sửa được` ở rail (§8) là **tiện lợi hiển thị**, không
phải hàng rào. Một request gọi thẳng API không đi qua UI, nên hàng rào thật phải
ở đây.

**Giảng viên sửa điểm số trực tiếp; `verdict` là nhãn định tính đi kèm.**
`pointsFor()` chỉ cho ba mức (đủ / nửa / không), mà chấm thật cần 3/5 điểm. Cả
hai được lưu vào `edited_criteria` để lần sửa sau đọc lại được người trước đã
nghĩ gì.

`edited_criteria` lưu **đúng mảng đã gửi lên**, không phải diff so với AI:

```json
[{ "criterionId": "...", "verdict": "partially_met", "points": 3 }, ...]
```

Lưu nguyên trạng chứ không lưu diff, vì một dòng review phải tự nó đọc được —
dựng lại điểm từ một chuỗi diff là đúng thứ khiến lịch sử sửa điểm khó tra khi
cần nhất.

Sau khi qua cổng §6.1.1, mọi status còn lại đều hợp lệ, và `advance` chỉ còn
đúng một việc: chuyển `auto_approved | flagged_for_review` → `teacher_reviewed`.
Với `teacher_reviewed` / `finalized` / `exported` thì nó trả `false` — và ở đây
`false` có **đúng một nghĩa**: "đã qua mốc đó rồi", tức đang sửa lần thứ hai.
Không còn nghĩa thứ hai nào để lẫn.

Phân hoạch đầy đủ của các status hợp lệ, không có kẽ hở:

| Status khi gọi | Tạo dòng review | `advance` | Ghi `AuditLog` |
|---|---|---|---|
| `auto_approved`, `flagged_for_review` | ✅ | → `teacher_reviewed` | ❌ |
| `teacher_reviewed` | ✅ | không đổi | ❌ |
| `finalized`, `exported` | ✅ | không đổi | ✅ (§7) |

**`grading_result.flag_for_review` KHÔNG bị tắt sau khi duyệt.** Nó ghi lại việc
*AI đã từng không chắc về bài này*, và đó là dữ liệu đầu vào cho calibration
(bước 21). Trạng thái "đã được người xem" đã nằm ở `status = teacher_reviewed`
rồi; tắt cờ kia là xoá mất một sự thật để nói lại một sự thật đã có chỗ khác.

### 6.2 `POST /exam-sessions/:id/finalize-grades`

Tên khác `finalize` — cái đó là **chốt bài**, cái này là **chốt điểm**. Trộn hai
tên là trộn hai pipeline mà CLAUDE.md tồn tại để tách.

**Từ chối:**

- 400 nếu phiên **chưa chấm bài nào** — chốt điểm khi chưa có điểm là thao tác
  vô nghĩa; nói ra tốt hơn im lặng thành công.
- 409 nếu còn bất kỳ kết quả nào ở `flagged_for_review`, `ai_grading` hoặc
  `ai_graded` — nghĩa là còn bài chính AI nói "tôi không chắc" mà chưa ai xem.

**Khi chạy:**

| Kết quả đang ở | Việc làm |
|---|---|
| `auto_approved` | Tạo `TeacherReview` **thật** (`teacherId` = người bấm nút, `finalScore = aiTotalScore`, `editedCriteria` = đúng bản AI đưa ra) → `teacher_reviewed` → `finalized` |
| `teacher_reviewed` | → `finalized` |

Trả `{ reviewedByHand: N, acceptedAsProposed: M }` để màn xác nhận nói đúng con số.

**Không bài nào nhảy thẳng sang `finalized`.** Nếu không, bảng điểm cuối cùng sẽ
có những dòng không ai đứng tên, và mất dấu người chịu trách nhiệm.

**Idempotent.** Gọi lần hai: không còn `auto_approved` hay `teacher_reviewed`
nào, nên không tạo dòng nào, không đổi trạng thái nào, trả
`{ reviewedByHand: 0, acceptedAsProposed: 0 }`. **Không ném lỗi** — bấm nhầm hai
lần là chuyện thường và lần hai vô hại. Đây là hành vi có chủ đích, có test.

### 6.3 `GET /exam-sessions/:id/grading-results` — mở rộng

`GradingResultView` thêm, lấy từ dòng `teacher_review` mới nhất (null nếu chưa
có):

```ts
/** numeric(6,2) → TypeORM trả string; Number(...) trước khi ra API (§9.4). */
finalScore: number | null;
reviewedAt: string | null;
/** TÊN giảng viên, để rail hiển thị "do ai duyệt" mà không phải gọi thêm API.
 *  Không trả id: trang này không làm gì với id, và dấu vết ai-làm-gì thuộc về
 *  audit_log chứ không phải payload hiển thị. */
reviewedByName: string | null;
editedCriteria: { criterionId: string; verdict: string; points: number }[] | null;
```

Bốn field đều `null` khi kết quả chưa có dòng `teacher_review` nào — nghĩa là
"AI đã chấm, chưa ai duyệt", chứ không phải "điểm bằng 0".

---

## 7. Sửa sau khi chốt — nơi rule 4 thành thật

**Cùng endpoint** `POST /grading-results/:id/review`. Khác biệt duy nhất: nếu
status đã là `finalized` (hoặc `exported`), service ghi thêm:

```ts
auditLog.recordUserAction({
  actorId: teacherId,
  action: 'grading_result.score_edited_after_finalize',
  targetType: 'grading_result',
  targetId: result.id,
  oldValue: { finalScore: <trước> },
  newValue: { finalScore: <sau> },
});
```

Status **không đổi** — máy trạng thái không có đường ra khỏi `finalized`, và
không cần: điểm cuối cùng là dòng review mới nhất (§3.1).

**Sửa TRƯỚC khi chốt thì KHÔNG ghi audit.** Đó chính là điều làm cuốn sổ này có
nghĩa. Giảng viên đang duyệt 40 bài sẽ sửa tới sửa lui nhiều lần; ghi hết thì
audit log ngập sự kiện vô nghĩa và không còn dùng để tra "ai sửa điểm sau khi
công bố" được nữa.

---

## 8. Frontend — workspace hai cột

Thay `ResultsTable` ở `apps/web/src/app/teacher/grading/page.tsx`. Giữ nguyên
phần chọn phiên thi và thẻ rubric của PR #27.

```
┌────────────────┬─────────────────────────────────┐
│ ● Cần xem (5)  │  Nguyễn Văn A — 20120001        │
│   Nguyễn A 4.0 │                                 │
│ ▸ Trần B   3.5 │  Tiêu chí 1  [Đạt ▾]      5.0đ  │
│   Lê C     2.0 │  "thuật toán trình bày rõ..."   │
│                │                                 │
│ ○ Tự duyệt(35) │  Tiêu chí 2  [Một phần ▾] 2.5đ  │
│   Phạm D   8.0 │  "chưa nêu độ phức tạp"         │
│   …            │                                 │
│                │  Tổng: 7.5      [Lưu duyệt]     │
└────────────────┴─────────────────────────────────┘

          [ Chốt điểm cả phiên ]  ← tắt khi còn bài Cần xem
```

**Vì sao không giữ bảng phẳng + expand:** duyệt bài là việc **theo từng bài**,
cần chỗ cho đoạn bằng chứng và ô sửa của từng tiêu chí. Bảng là công cụ để đọc
lướt, không phải để làm việc — với 40 bài nó thành 40 lần đóng/mở.

**Vì sao không phải chế độ tập trung (một bài toàn màn hình):** nó giấu mất tiến
độ cả phiên. Giảng viên cần biết còn bao nhiêu bài `Cần xem` — vì đó chính là
điều kiện bật nút Chốt.

Hai cột cũng khớp với layout triage hai cột PR #26 vừa dựng cho trang Quản lý
bài thu.

**Chi tiết:**

- Rail trái nhóm theo **status**, không phải theo cờ. Ánh xạ đầy đủ, không có
  trạng thái nào rơi ra ngoài:

  | `status` | Nhóm |
  |---|---|
  | `flagged_for_review` | **Cần xem** — bật/tắt nút Chốt dựa vào nhóm này |
  | `auto_approved` | **Tự duyệt** |
  | `teacher_reviewed` | **Đã duyệt** |
  | `finalized`, `exported` | **Đã chốt** |
  | `ai_grading`, `ai_graded` | **Đang chấm** — chỉ thấy được nếu ai đó mở trang giữa lúc chấm; khung phải chỉ đọc |

  Việc khung phải chỉ-đọc ở nhóm "Đang chấm" là **tiện lợi hiển thị, không phải
  bảo đảm**. Hàng rào thật nằm ở cổng trạng thái §6.1.1 — một request gọi thẳng
  API không đi qua rail này.

  Sau khi chốt, cả phiên nằm gọn trong "Đã chốt" — rail không rỗng đi, nó đổi
  nhóm. Mỗi dòng là sinh viên + điểm hiện tại (điểm cuối nếu đã có review, điểm
  AI nếu chưa).
- Tổng ở khung phải **tính tự động** từ các ô điểm, không cho nhập tay — khớp
  với việc server tự tính (§6.1).
- Nút Chốt tắt khi còn bài `Cần xem`, **kèm lý do**, không tắt câm.
- Hộp xác nhận nói đúng con số: *"Bạn đang chốt 35 bài theo đúng điểm AI đề xuất
  mà chưa mở xem, và 5 bài bạn đã duyệt."*
- Sau khi chốt vẫn sửa được, nhưng nút Lưu đổi nhãn kèm cảnh báo: *"Điểm đã chốt
  — thay đổi này sẽ được ghi vào nhật ký."*

---

## 9. Bẫy khi code — ĐỌC TRƯỚC KHI SỬA

### 9.1 Criteria của rubric đã chấm là bất biến ở tầng DB

Đã kiểm chứng bằng introspection (2026-09-05), không phải giả định:

```
trg_rubric_criterion_guard_immutable
  BEFORE DELETE OR UPDATE ON rubric_criterion
  → guard_rubric_criteria_immutable()

IF EXISTS (SELECT 1 FROM grading_result WHERE rubric_id_version = OLD.rubric_id)
   THEN RAISE 'Rubric criterion % is frozen — its rubric version has
               already been used for grading'
        USING ERRCODE = 'object_not_in_prerequisite_state'
```

Đây là **ràng buộc DB thật**, chặn cả UPDATE lẫn DELETE. Nghĩa là tiêu chí không
thể biến mất hay đổi thang điểm giữa lúc giảng viên đang duyệt — nên phép kiểm
ở §6.1 bước 3-4 không có race.

### 9.2 AI output bất biến — đừng thử ghi đè

```
guard_grading_result_ai_immutable: chặn UPDATE lên ai_total_score /
criterion_results / model_used / confidence một khi ai_total_score đã có.
```

Sửa điểm **luôn** là tạo dòng `teacher_review`, không bao giờ là ghi đè
`grading_result`. Security rule 6, và trigger sẽ chặn nếu ai đó thử.

### 9.3 `AuditLogEntity` có PK phức hợp `(occurred_at, id)`

Bảng partition theo `occurred_at`. Entity có `@BeforeInsert stampOccurredAt()`
để tránh lệch độ chính xác micro giây giữa JS `Date` và Postgres — **đừng bỏ
qua nó bằng cách insert raw**, hoặc dòng ghi ra sẽ không tìm lại được bằng chính
khoá của nó.

### 9.4 `final_score` là `numeric(6,2)` → TypeORM trả **string**

Cùng lớp bẫy với `maxPoints` trong `RubricCriterionEntity` (`String(...)` khi
ghi, `Number(...)` khi đọc). `Number(...)` trước khi trả ra API.

---

## 10. Edge case

- Hai giảng viên cùng duyệt một bài → hai dòng review, dòng sau thắng. Đúng mô
  hình append-only; không cần khoá.
- `advance` trả `false` ở `review` → luôn có nghĩa "đã qua mốc `teacher_reviewed`
  rồi", tức sửa lần thứ hai; **không phải lỗi**. Nghĩa này chỉ đơn trị được vì
  cổng §6.1.1 đã loại `ai_grading`/`ai_graded` từ trước.
- `advance` trả `false` ở `finalize-grades` → **409**: một kết quả vừa đổi trạng
  thái dưới chân, nên cả lệnh chốt phải dừng thay vì chốt nửa vời.
- Phiên có kết quả nhưng **tất cả** đều `auto_approved` → chốt được ngay, hộp
  xác nhận nói "0 bài đã duyệt, N bài theo đề xuất AI".
- Kết quả ở `exported` → sửa vẫn được, vẫn ghi audit. Export chưa tồn tại (§12)
  nhưng đường code xử lý giống hệt `finalized`, không phải nhánh riêng.

---

## 11. Kiểm thử

### 11.1 Ca chốt cả spec

**Duyệt TRƯỚC khi chốt không sinh `AuditLog`; sửa SAU khi chốt CÓ sinh**, với
đúng `oldValue.finalScore` / `newValue.finalScore`. Đây là ranh giới của rule 4,
và là thứ phân biệt một cuốn sổ dùng được với một cuốn sổ ngập rác.

### 11.2 Quyền — phần bản nháp đầu bỏ sót

- `review` bởi giảng viên không sở hữu phiên → **403**
- `finalize-grades` bởi giảng viên không sở hữu phiên → **403**
- `GET grading-results` của phiên người khác → **403** (bảo vệ hành vi đã có)

### 11.3 Backend

- review tạo một dòng + chuyển `auto_approved` → `teacher_reviewed`
- review lần hai tạo dòng **thứ hai**, status **giữ nguyên**, không lỗi
- **review khi `status = ai_grading` → 409, và `teacher_review` KHÔNG có dòng
  nào mới.** Khẳng định cả hai vế: chỉ kiểm mã 409 thì một hiện thực tạo dòng
  rồi mới ném lỗi vẫn pass. Đây là ca bảo vệ §6.1.1.
- review khi `status = ai_graded` → 409, cũng không tạo dòng nào. Trạng thái này
  chỉ tồn tại trong tích tắc ở hiện thực inline hiện tại, nhưng nó là một trạng
  thái thật và `ai_graded → teacher_reviewed` không phải transition hợp lệ —
  không chặn thì dòng review sinh ra mà status kẹt lại ở `ai_graded`.
- server tính `finalScore` bằng tổng, **bỏ qua tổng client gửi lên**
- thiếu một tiêu chí → 400 · `criterionId` lạ → 400 · `points > maxPoints` → 400
- `finalize-grades` khi còn `flagged_for_review` → **409**
- `finalize-grades` khi phiên chưa chấm bài nào → **400**
- `finalize-grades` sinh `TeacherReview` thật cho bài `auto_approved`, mang
  `teacherId` của **người bấm nút**, `finalScore = aiTotalScore`
- **`finalize-grades` gọi lần hai → `{0, 0}`, không lỗi, không dòng mới**
- sau finalize, mọi kết quả của phiên ở `finalized`

### 11.4 Web

- rail trái nhóm đúng ba nhóm, đếm đúng
- tổng ở khung phải đổi theo ô điểm, không nhập tay được
- nút Chốt tắt kèm lý do khi còn bài `Cần xem`
- hộp xác nhận hiện đúng hai con số
- sau khi chốt, nút Lưu hiện cảnh báo ghi nhật ký

---

## 12. Ngoài phạm vi

- **GradeExport** (§3.5 bước 20) — ghi điểm ngược vào file Excel của giảng viên,
  cột MSSV/điểm chỉ định tường minh (Security rule 9). Transition
  `finalized → exported` để dành cho nó.
- **Calibration** (bước 21).
- **Chấm lại / chấm lẻ từng bài** — vẫn bị chặn có chủ đích, ba lớp; xem §7 của
  `2026-09-03-submissions-rollup-page-design.md`.
- **BullMQ queue** — `startGrading` vẫn chạy inline.
- **Provider LLM thật** — vẫn là `keyword-match@1`.
- **Quyền chấm theo `home_teacher_id`** — xem §4.3, task riêng.
