# Design: Rubric ghim vào phiên thi, thay cho `findActive(courseId)`

**Date:** 2026-09-05
**Status:** Approved by user in chat (architectural path — 3 vòng hỏi đáp, kèm 3
khoảng trống do user chỉ ra và đã vá vào bản v2)
**Scope:** Ranh giới giữa "tạo phiên thi" và "chấm điểm". Không đụng
TeacherReview / GradeExport / queue / provider LLM — xem §9.
**Reuses unchanged:** `RubricService.saveNewVersion`, `assertTeachesCourse`,
trigger DB `guard_grading_result_ai_immutable`, toàn bộ
`lib/api/grading.ts` + `useGrading.ts`, cột `exam_session.rubric_id` và FK của nó
(đã tồn tại từ `InitialSchema`).

---

## 1. Vì sao có spec này

### 1.1 Cột chết và hệ quả của nó

`exam_session.rubric_id` tồn tại từ migration đầu tiên, có cả FK
(`rubric_id -> rubric`, `ON DELETE RESTRICT`). **Không một dòng code nào ghi hoặc
đọc nó.** Trên DB hiện tại: `0 / 1443` phiên có `rubric_id`.

Việc chấm giải rubric bằng `RubricService.findActive(courseId)` —
[grading.service.ts:75](../../../apps/api/src/grading/grading.service.ts) — tức là
**tra bản rubric đang `is_active` của môn, tại thời điểm bấm "Bắt đầu chấm"**.

Hệ quả: giảng viên sửa rubric giữa hai kỳ thi cùng môn thì **cả hai kỳ đều chấm
theo bản mới nhất**, kể cả kỳ đã thi xong từ trước bằng đề khác. `GradingResult`
vẫn ghi đúng `rubric_id_version` nên lịch sử không sai — nhưng *lựa chọn* thì
sai, vì không ai từng chọn cả.

### 1.2 Nguyên tắc user nêu (là lý do quyết định, không phải sở thích)

> Toàn bộ thiết kế từ đầu tới giờ đi theo 1 nguyên tắc lặp lại: **quyết định
> danh tính/ràng buộc tại thời điểm tạo phiên thi, không resolve động sau đó** —
> `RequiredDeliverable` (tên file bắt buộc khai báo trước, không đoán lúc thu
> bài), `Enrollment` (xác thực khóa vào lúc join, không suy diễn sau). Rubric nên
> đi đúng logic đó: rubric áp dụng cho 1 phiên thi là **một phần của "đề bài"**
> phiên đó.

`findActive` là đúng thứ nguyên tắc này cấm: nó là một `resolve` chạy sau, ở thời
điểm hoàn toàn không liên quan tới lúc ra đề.

### 1.3 Ranh giới cần giữ cho đúng

Cấm ở đây là **tra rubric tại thời điểm chấm**, không phải cấm giảng viên đổi ý
trước giờ thi. `RequiredDeliverable` cũng vậy: cố định *trước khi thi diễn ra*,
nhưng lúc còn soạn đề vẫn sửa được. Nên rubric **sửa được cho tới khi có
`GradingResult` đầu tiên**, sau đó khoá vĩnh viễn — mốc khoá tự nhiên, vì từ đó
đổi rubric là viết lại lịch sử, đúng thứ Security rule 7 cấm.

---

## 2. Không có migration

Cột `rubric_id` (uuid, nullable) và FK `-> rubric` `ON DELETE RESTRICT` đã có sẵn
trong `InitialSchema`. Spec này chỉ dạy tầng ứng dụng dùng nó.

**Không backfill.** Xem §5 — "có bài thu, chưa gắn rubric" là trạng thái hợp lệ
vĩnh viễn, không phải di chứng một lần, nên lời giải là UI chứ không phải script.

---

## 3. Backend

### 3.1 `CreateExamSessionDto` — thêm `rubricId`, **tuỳ chọn**

```ts
@IsOptional()
@IsUUID()
rubricId?: string;
```

Tuỳ chọn, theo §3.1 kế hoạch tổng thể: *"gắn rubric chấm điểm (**nếu dùng AI
chấm**)"*. Phiên không gắn rubric vẫn tạo / thi / thu bài / xem bài bình thường;
chỉ riêng "Bắt đầu chấm" là bị chặn.

### 3.2 `ExamSessionService.create` — một phép kiểm, không phải hai

Điều kiện duy nhất: **rubric tồn tại và `rubric.courseId === klass.courseId`**.
Sai → 400. (Cùng lý do `courseId` được suy từ `classId` chứ không nhận từ body:
một phiên trỏ tới thứ không thuộc môn của nó làm mọi thứ sau đó hỏi sai câu hỏi.)

**Không kiểm thêm "giảng viên có dạy môn này không".** `create()` đã gọi
`classes.findTaughtBy(dto.classId, teacherId)` ở dòng đầu, tức đã chứng minh
giảng viên dạy lớp đó, tức dạy môn đó. Nếu `rubric.courseId === klass.courseId`
thì rubric thuộc đúng môn ấy — gọi thêm `assertTeachesCourse` là kiểm lại điều
vừa chứng minh. Bản nháp đầu của spec này có bước đó; nó thừa.

**Vị trí:** đặt **trước** `assertNone` (kiểm trùng lịch) và trước vòng lặp sinh
mã. Lý do: đây là lỗi đầu vào (400), còn trùng lịch là xung đột trạng thái (409)
— báo lỗi đầu vào trước, và không lặp lại phép kiểm ở mỗi lần retry mã.

### 3.3 `PATCH /exam-sessions/:id/rubric` — endpoint HẸP, không phải PATCH tổng quát

Body: `{ rubricId: string | null }`. `null` = gỡ rubric.

| Tình huống | Kết quả |
|---|---|
| Không phải chủ phiên | 403 (dùng `findEntityForOwner`, như mọi route khác) |
| Rubric khác môn của phiên | 400 |
| Phiên **đã có `GradingResult`** | 409 |
| Còn lại | 200, trả về phiên đã cập nhật |

Cũng như §3.2: `findEntityForOwner` đã chứng minh quyền sở hữu phiên, và
`session.courseId` là cố định — nên chỉ cần đối chiếu `rubric.courseId` với nó,
không kiểm lại scope giảng viên.

**Vì sao không mở `PATCH /exam-sessions/:id` tổng quát.** Một endpoint sửa phiên
thi tổng quát sẽ mở đường sửa `startTime` / `endTime` / `roomId` — mà đó chính là
vùng `ScheduleConflictService.assertNone` **chưa hỗ trợ**: nó không nhận
`excludeSessionId`, nên một lệnh dời lịch sẽ báo phiên đang xung đột với chính
nó. Ghi chú đó đã nằm sẵn trên `assertNone`. Endpoint chỉ nhận `rubricId` thì
không chạm vùng đó, và ngày nào làm dời lịch thật thì đó là task riêng có test
riêng.

**Kiểm "đã có kết quả chấm chưa" là truy vấn mới**, không dùng lại
`RubricService.hasResults(rubricId)` — hàm đó đếm kết quả theo *phiên bản rubric*
trên toàn hệ thống, còn ở đây cần đếm theo *phiên thi*:

```
GradingResult ⋈ Submission  WHERE submission.exam_session_id = :id  LIMIT 1
```

### 3.4 `GradingService.startGrading` — đọc từ phiên, bỏ hẳn `findActive`

```
- const rubric = await this.rubrics.findActive(session.courseId);
+ if (!session.rubricId) throw new BadRequestException(
+   'Phiên thi này chưa gắn rubric — hãy gắn rubric trước khi chấm.');
+ const rubric = await this.rubrics.findById(session.rubricId);
```

`RubricService` **chưa có `findById`** — hiện chỉ có `findOneForTeacher` (trả
`RubricView`, kèm kiểm scope) và `findActive`. Thêm một hàm mới:

```ts
/** Tra thẳng theo id, KHÔNG kiểm scope — xem lý do ở spec §3.4. */
async findById(rubricId: string): Promise<RubricEntity | null>
```

Không kiểm scope ở đây là có chủ đích, và an toàn vì hai lớp chặn phía trên:
controller đã `findEntityForOwner` cho phiên, và `rubric_id` chỉ có thể được ghi
qua §3.2/§3.3 — cả hai đều đã ép `rubric.courseId === session.courseId`. Thêm một
lần kiểm nữa ở đây chỉ che mờ chỗ quy tắc thật sự được thi hành.

Trả `RubricEntity` chứ không phải `RubricView`, vì `startGrading` cần `rubric.id`
và `rubric.version` rồi tự nạp criteria riêng.

Thông báo cũ (*"Môn học này chưa có rubric"*) phải đổi: nó nói sai chỗ. Môn có
thể có đủ rubric mà phiên vẫn chưa gắn.

### 3.5 Đổi tên `findActive` → `findDefaultForCourse`

Nghĩa cũ ("bản mà lượt chấm sẽ dùng") chết theo §3.4. Nghĩa còn lại là "bản gợi ý
sẵn trong ô chọn lúc tạo phiên thi" — khác hẳn, nên phải đổi tên để nghĩa cũ
không bò ngược lại qua một call-site mới nào đó.

**Đổi tên là điều kiện CẦN, KHÔNG ĐỦ.** Xem §7.1 — nó chỉ bắt được caller
TypeScript; hai chỗ resolve-theo-môn nằm ở frontend và build vẫn xanh khi bỏ sót
chúng.

### 3.6 DTO — thêm `rubricId`/`rubricVersion` vào HAI chỗ, và **không** thêm `courseId`

Thêm `rubricId: string | null` và `rubricVersion: number | null` vào:

- **`SessionOverviewItem`** (`GET /submissions/overview`) — đây là nguồn danh sách
  phiên của trang Chấm điểm sau spec này, xem §4.3.
- **`ExamSessionResponseDto`** — để lệnh tạo và lệnh PATCH trả lại đúng thứ vừa
  được gắn, thay vì buộc client đoán.

**Không thêm `courseId` vào `ExamSessionListItemDto`.** Bản nháp đầu định thêm để
sửa khiếm khuyết #1, nhưng `GET /submissions/overview` **đã trả `courseId` sẵn**
— và sau §4.3 thì trang Chấm điểm lấy danh sách từ đó, nên chỗ khớp-tên-môn bị
xoá chứ không phải được vá. Thêm một field không ai đọc là nợ, không phải bản vá.

Hai chỗ còn cần `courseId` (trang rubric §4.1, ô chọn §4.2) đều lấy từ
`useTeachingClasses()`, vốn đã có sẵn.

---

## 4. Frontend

### 4.1 Mới — `/teacher/rubrics`

Editor rubric **rời khỏi** trang Chấm điểm về đây. Lý do: rubric là việc **theo
môn, làm một lần**; duyệt điểm là việc **theo phiên thi, làm mỗi kỳ**. Gộp chung
một màn hình buộc giảng viên phải chọn một phiên thi chỉ để sửa rubric của môn —
và sau spec này thì còn tệ hơn, vì rubric phải soạn **trước khi** tạo phiên thi.

- Danh sách môn giảng viên dạy: `useTeachingClasses()` rồi dedup theo `courseId`.
- Mỗi môn: phiên bản hiện hành, tổng điểm, số tiêu chí.
- Editor giữ **nguyên hành vi**: lưu = tạo phiên bản mới, không có đường update.
- Thêm 1 mục vào `nav-config.ts` (danh sách phẳng, đặt cạnh "Chấm điểm").

### 4.2 Sửa — `/teacher/exam-sessions/new`

Thêm ô chọn rubric, **tuỳ chọn**, lọc theo môn của **lớp đã chọn** (form chọn lớp
trước, `courseId` suy từ `classes.data`). Mặc định gợi ý bản `isActive`.

Môn chưa có rubric nào → trạng thái rỗng + link sang `/teacher/rubrics`, **không
chặn** việc tạo phiên thi.

Form đã 520 dòng — ô chọn này tách ra `_components/`, không nhồi thêm vào
`page.tsx`.

### 4.3 Sửa — `/teacher/grading`

| | Thay đổi |
|---|---|
| Bỏ | `RubricCard` (editor) — chuyển sang §4.1 |
| Thay | Dòng "Phiên thi này chấm theo rubric phiên bản N (tổng X điểm)" |
| Thêm | Nút **Đổi rubric** — tắt khi phiên đã có kết quả chấm, kèm lý do |
| Sửa | Nút "Bắt đầu chấm" bật/tắt theo **rubric của phiên**, không theo `isActive` của môn ([page.tsx:88](../../../apps/web/src/app/teacher/grading/page.tsx)) |
| Sửa | **Nguồn danh sách phiên** — xem dưới |
| Sửa | `key` của fragment trong `.map()` (khiếm khuyết #2, §6) |

**Đổi nguồn danh sách phiên: `useExamSessions` → `GET /submissions/overview`.**

Danh sách hiện gọi `useExamSessions({ page: 1, pageSize: 50 })` — trần cứng 50.
Nâng trần lên 200 chỉ dời cái trần đi, không bỏ nó. Endpoint overview đã có sẵn
mọi thứ cần và không có trần nào:

- `WHERE s.teacher_id = $1`, **không phân trang** (quyết định của spec roll-up:
  *"vài chục phiên/giảng viên, tải hết rồi nhóm ở client"*).
- Đã trả `courseId` → **khiếm khuyết #1 biến mất cùng đoạn code khớp-tên-môn**,
  không phải được vá.
- Đã trả `fullySubmittedCount` / `partialCount` → lọc "phiên đã có bài thu" làm
  ngay ở client, không cần endpoint mới.
- Sau §3.6 sẽ trả thêm `rubricId`/`rubricVersion` → đủ để dựng cả trạng thái chặn
  ở §5 mà không gọi thêm API nào.

Phiên **không có bài nộp nào** thì ẩn khỏi danh sách — không có gì để chấm, và
không mất mát gì. Đây **không** phải trường hợp §5.3 cấm: §5.3 nói về phiên **có
bài thật** bị giấu.

---

## 5. Trạng thái "có bài thu, chưa gắn rubric" — hạng nhất, KHÔNG ẩn

### 5.1 Vì sao đây là phần quan trọng nhất của spec

Ban đầu spec này định xử lý dữ liệu cũ bằng một bước rà DB trước khi merge. **Đó
là sai khung vấn đề.** Vì rubric là *tuỳ chọn* lúc tạo phiên, một giảng viên dạy
môn chưa soạn rubric sẽ tạo ra tình huống này **bất cứ lúc nào, mãi mãi** — không
phải di chứng một lần của lần deploy này.

Nên lời giải là UI, không phải script. Và khi UI xử lý đúng thì 178 phiên cũ (đo
được, §10) tự khỏi mà không cần đụng tới.

### 5.2 Quy tắc

- Phiên có bài thu **luôn xuất hiện** trong danh sách Chấm điểm, kể cả khi
  `rubric_id` rỗng.
- **Trong ô chọn phiên**, mục đó mang hậu tố `— chưa gắn rubric`. (Danh sách là
  một `<Select>`; badge không đặt được trong option, nên hậu tố văn bản là cách
  duy nhất nhìn thấy được *trước khi* chọn.)
- **Sau khi chọn**, thay bảng kết quả bằng **thẻ chặn**: *"Phiên thi này chưa gắn
  rubric — chưa chấm được"*, kèm **ô chọn rubric ngay tại chỗ** (chính là giao
  diện của §3.3) + link sang `/teacher/rubrics` nếu môn chưa có rubric nào.
- Nút "Bắt đầu chấm" tắt **và nêu lý do**, không tắt câm.

### 5.3 Vì sao tuyệt đối không được ẩn

Ẩn phiên thiếu rubric là tái phạm đúng lỗi đã bị bắt ở phase Roster: môn không có
chủ *"được liệt kê cho không ai cả"*, phải đẻ ra màn
[admin/unowned-courses](../../../apps/web/src/app/admin/unowned-courses/page.tsx)
để cứu. Ở đây còn tệ hơn — **bài thi thật của sinh viên đang nằm trong phiên bị
ẩn**, và giảng viên không có cách nào biết trang đang giấu nó vì thiếu một field
mà hệ thống chưa từng hỏi họ.

---

## 6. Bốn khiếm khuyết sửa kèm

| # | Khiếm khuyết | Sửa |
|---|---|---|
| 1 | 🔴 `courseId` suy bằng **khớp tên môn** ([page.tsx:79-82](../../../apps/web/src/app/teacher/grading/page.tsx)). Unique index là `(semester_id, code)`, không phải name → hai môn cùng tên khác học kỳ khớp nhầm bản đầu → **giảng viên sửa rubric của môn sai** | Đoạn code đó **bị xoá**: editor rubric chuyển sang §4.1, và danh sách phiên đổi sang overview vốn đã trả `courseId` (§4.3) |
| 2 | 🟡 `<>` fragment trong `.map()` không có key — key đặt nhầm vào `<TableRow>` bên trong | Đặt key lên fragment |
| 3 | 🟡 `pageSize: 50` hardcode → GV có >50 phiên không chọn được phiên cũ | Đổi nguồn sang `GET /submissions/overview`, vốn không phân trang (§4.3). Nâng trần lên 200 chỉ dời cái trần, không bỏ nó |
| 4 | 🟡 `rubric_id` là cột chết | Toàn bộ spec này |

---

## 7. Bẫy khi code — ĐỌC TRƯỚC KHI SỬA

### 7.1 Đổi tên hàm KHÔNG bắt được frontend

Audit đã chạy (2026-09-05):

| Nơi | Số chỗ |
|---|---|
| `findActive` — call-site production | **1**: `grading.service.ts:75` |
| Raw SQL đụng bảng `rubric` | 0 |
| `rubrics.find(r => r.isActive)` phía web | **2**: `grading/page.tsx:88` và `:275` |

Hai chỗ phía web là **cùng một nghĩa cũ** (resolve bản active theo môn) nhưng
bằng cơ chế khác: lọc `isActive` trên DTO ở client. **Đổi tên hàm backend không
làm chúng fail build.** Dòng `:275` nằm trong `RubricCard` (sẽ gỡ theo §4.3), còn
`:88` thì không — nó điều khiển `disabled` của nút "Bắt đầu chấm" và phải sửa tay.

**Quy trình merge bắt buộc:**
1. Đổi tên `findActive` → `findDefaultForCourse` **trước**. Mọi lỗi biên dịch phát
   sinh là **tín hiệu tốt** — xử lý hết, tuyệt đối không `@ts-ignore`.
2. Chạy `grep -rn "isActive" apps/web` và xác nhận không còn chỗ nào resolve theo
   môn ở client.

### 7.2 `isActive` VẪN giữ trên DTO

Nó còn một công dụng hợp lệ: gợi ý bản mặc định trong ô chọn ở §4.2. Chỉ hai chỗ
ở trang Chấm điểm là phải đi. Đừng xoá field.

### 7.3 Rubric đang được dùng thì không xoá được

FK `ON DELETE RESTRICT`. Hiện chưa có endpoint xoá rubric nào, nên chưa phát sinh
— nhưng ngày nào thêm thì đây là lỗi 409 phải xử lý, không phải 500.

### 7.4 Phiên bản mới không kéo theo phiên thi cũ

Giảng viên tạo rubric v2 sau khi đã gắn v1 vào phiên thi → phiên **giữ nguyên
v1**. Đây không phải bug, đây là **toàn bộ mục đích** của spec. Test §8 có case
chốt đúng điều này.

---

## 8. Kiểm thử

### 8.1 Test chốt cả spec

Tạo phiên gắn rubric **v1** → tạo rubric **v2** cho cùng môn (v2 thành `isActive`)
→ chấm phiên đó → **`GradingResult.rubric_id_version` phải trỏ v1, không phải
v2**.

Test này pass nghĩa là `findActive` đã chết thật. Fail nghĩa là còn đường resolve
động ở đâu đó.

### 8.2 Backend

- Tạo phiên với `rubricId` của **môn khác** → 400.
  *(Không có case 403 riêng: `findTaughtBy` đã chặn lớp không phải của mình từ
  trước, nên rubric của môn giảng viên không dạy tất yếu rơi vào case 400 ở
  trên — xem §3.2. Đừng viết test mong 403, nó sẽ ra 400.)*
- Tạo phiên **không** `rubricId` → 201, `rubric_id` NULL.
- `PATCH .../rubric` khi phiên **chưa** có kết quả chấm → 200.
- `PATCH .../rubric` khi phiên **đã** có kết quả chấm → 409.
- `PATCH .../rubric` bởi người không sở hữu phiên → 403.
- `PATCH .../rubric` với `null` → 200, gỡ được rubric.
- `startGrading` khi `rubric_id` NULL → 400, thông báo nói về **phiên thi**,
  không nói về môn học.
- `ExamSessionResponseDto` echo đúng `rubricId`/`rubricVersion` vừa gắn (cả ở
  `POST /exam-sessions` lẫn ở `PATCH .../rubric`).

### 8.3 Chống hồi quy "ẩn mất" (§5) — hai tầng, cả hai đều cần

Bảo vệ §5.3. Tách làm hai vì mỗi tầng hỏng theo cách khác nhau:

- **Backend:** `GET /submissions/overview` trả phiên có bài thu và `rubric_id`
  NULL, với `rubricId === null` trong payload — nghĩa là endpoint **không** lọc
  bỏ nó và client có đủ dữ liệu để hiện trạng thái chặn.
- **Web:** phiên đó **xuất hiện** trong ô chọn kèm hậu tố `— chưa gắn rubric`, và
  khi chọn thì hiện thẻ chặn thay cho bảng kết quả, nút "Bắt đầu chấm" tắt kèm
  lý do.

### 8.4 Web

- `/teacher/rubrics` render danh sách môn dedup đúng, lưu tạo phiên bản mới.
- Trang Chấm điểm hiện đúng **phiên bản đã ghim** của phiên, không phải bản
  `isActive` của môn.
- Nút "Đổi rubric" tắt khi phiên đã có kết quả.
- Ô chọn ở form tạo phiên lọc đúng theo môn của lớp đang chọn.

---

## 9. Ngoài phạm vi

Không đụng, và **không nợ** spec này thứ gì:

- `TeacherReview` — sửa/chốt điểm. Backend vẫn là con số 0 (xem §7 của
  `2026-09-03-submissions-rollup-page-design.md`).
- `GradeExport` — ghi điểm ngược vào Excel.
- Chấm lẻ từng bài / chấm lại — vẫn bị chặn có chủ đích, ba lớp.
- BullMQ queue — `startGrading` vẫn chạy inline.
- Provider LLM thật — vẫn là `keyword-match@1`.
- Calibration.
- Trang lobby `(exam-live)/exam-sessions/[id]`.

---

## 10. Công cụ vận hành (không phải bước bắt buộc)

Rà các phiên đã thu bài mà chưa gắn rubric — dùng khi cần, không phải điều kiện
merge:

```sql
SELECT s.id, s.name, s.start_time, count(x.*) AS bai_da_thu
FROM examcollect.exam_session s
JOIN examcollect.submission x
  ON x.exam_session_id = s.id AND x.status = 'collected'
WHERE s.rubric_id IS NULL
GROUP BY s.id, s.name, s.start_time
ORDER BY s.start_time DESC;
```

Đo ngày 2026-09-05: **178 phiên**, 280 bài — **toàn bộ thuộc tài khoản test
`@example.com`**, không có phiên thật nào. Đó là lý do §5 chọn giải bằng UI thay
vì script chuyển tiếp.
