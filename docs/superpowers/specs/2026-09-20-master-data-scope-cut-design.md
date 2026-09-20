# Thu hẹp phạm vi master data — thiết kế

**Ngày:** 2026-09-20 · **Baseline:** `main` = `3cf4688` · **Trạng thái:** spec, chưa implement

Cắt toàn bộ phần quản trị dữ liệu nền (môn học, học kỳ, phòng, khoa) ra khỏi hệ
thống, chuyển quyền sở hữu lớp học sang giảng viên, và gỡ rubric khỏi môn học.

---

## 0. Vì sao cần cái này

Hệ thống tự nhận là hệ thống chấm điểm, nhưng **26 trên 73 route API** và **10
trên 27 trang web** là quản trị dữ liệu nền, trong đó **8 trang bị xoá hẳn** còn
2 trang lớp học ở lại và đổi chủ: môn học, học kỳ, phòng thi, khoa, và
hai vai trò tồn tại chỉ để quản lý chúng. Không phần nào phục vụ việc chấm điểm.
Chúng còn ở đây vì thiết kế ban đầu thừa kế từ hướng "quản lý phòng máy" đã bị
bỏ (xem `docs/ke-hoach-tong-the-do-an.md` §1).

**Nhưng lý do thật sự phải cắt bây giờ không phải là dọn code chết.** Nó là:
hiện vật trung tâm của phần chấm điểm đang bị dữ liệu nền giam.

- `rubric` có `unique(course_id, version)` — rubric **thuộc sở hữu của môn học**.
- `rubric.service.ts:54` `assertTeachesCourse()` **đếm dòng trong bảng `class`**
  để quyết định giảng viên có được động vào rubric hay không.

Nghĩa là quyền tạo rubric được suy ra từ dữ liệu nền. Mọi thiết kế lại của phần
chấm điểm đều thừa kế cái nhà tù đó, trừ khi cắt trước. Xây phần chấm trước là
xây trên nền sắp bị xóa, rồi phải xây lại lần hai.

### 0.1 Phát hiện quyết định thứ tự: giảng viên **chưa bao giờ** được tạo lớp

Bảng `class` đã có `teacher_id` trỏ thẳng tới giảng viên, nên nhìn qua tưởng lớp
đã thuộc về giảng viên. Không phải. Mọi đường **tạo và sửa** đều gắn
`@Roles('department_admin')`:

| Việc | Vai trò hôm nay |
|---|---|
| Tạo lớp, nhập lớp từ tệp, sửa lớp, xoá lớp | `department_admin` |
| Tạo môn học, sửa, xoá | `department_admin` |
| Tạo học kỳ, tạo phòng | `admin` |
| Xem lớp mình dạy | `teacher` |
| Quản lý danh sách sinh viên trong lớp | `teacher` |

Giảng viên chỉ được **đọc** lớp và sửa roster. **Xoá `department_admin` mà không
làm gì thêm thì hệ thống mất hẳn khả năng tạo lớp**, và luồng thi bù chết theo vì
nó cần một lớp để định tuyến về.

> Vậy công việc này **không phải là xoá**. Nó là **chuyển quyền sở hữu**, rồi mới
> xoá. Ai đọc spec này và bắt đầu bằng `git rm` sẽ làm hỏng hệ thống.

---

## 1. Phạm vi

### 1.1 Trong phạm vi

| Hạng mục | Vì sao ở đây |
|---|---|
| Chuyển 4 đường tạo/sửa lớp sang `teacher` | Không có nó thì mọi thứ khác làm hỏng hệ thống |
| Rubric thuộc **giảng viên**, bỏ FK môn học | Gỡ nhà tù ở §0. Đây là mục đích thật của cả đợt |
| Môn học, học kỳ, phòng → **văn bản** | Tiền lệ đã có: `exam_session.semester_name` |
| `exam_session.class_id` → **NOT NULL** | Quyết định của chủ đồ án; đồng thời vá một lỗ thật (§3.4) |
| Xoá vai trò `department_admin`, `super_admin` | Không có logic phân tầng thật phía sau |
| Đánh dấu sinh viên thi bù ở màn bài nộp + màn chấm | Yêu cầu mới; **không cần cột mới** (§6) |
| **Viết lại 9 file đang join vào ba bảng bị xoá** | §4.4. Phần lớn nhất và dễ bỏ sót nhất của cả đợt |
| Sửa `CLAUDE.md` cho khớp mô hình mới | §4.6. Không sửa thì người sau code theo tài liệu sai |

### 1.2 Cố ý KHÔNG trong phạm vi

- **Mọi logic chấm điểm.** Đợt này chỉ đổi *ai sở hữu rubric*, không đổi một dòng
  nào trong `grading.service.ts`, guard, provider, hay prompt. Việc xây lại phần
  chấm là plan riêng và nó **phụ thuộc** đợt này.
- **Luồng xin phép vào phòng.** Đã chạy đúng ở cả ba tầng (§6.1). Không đụng.
- **Agent.** Không đổi giao thức, không đổi màn hình.
- **Lịch thi hiển thị.** Chủ đồ án xếp là tính năng tương lai.
- **Bảng `audit_log`, `cost_budget`, `grading_pipeline_config`.** Là vận hành, không
  phải dữ liệu nền. Trang `admin/ai-config`, `admin/cost`, `admin/audit-log`,
  `admin/accounts` **giữ nguyên**.

---

## 2. Mô hình sở hữu mới

| Thực thể | Trước | Sau |
|---|---|---|
| `class` | Trưởng khoa tạo, giảng viên đọc | **Giảng viên tạo và sở hữu** |
| `course` | Bảng riêng, trưởng khoa tạo | **Văn bản** trên `class` và `exam_session` |
| `semester` | Bảng riêng, admin tạo | **Văn bản** (đã có sẵn trên `exam_session`) |
| `room` | Bảng riêng, admin tạo | **Văn bản** trên `exam_session` |
| `rubric` | Thuộc môn học | **Thuộc giảng viên**, có tên |
| `enrollment` | Khoá theo môn học | **Khoá theo lớp** |

Nguyên tắc rút ra, nên ghi vào `CLAUDE.md` khi làm: **hệ thống không quản lý dữ
liệu nền của trường. Nó chỉ ghi lại những gì giảng viên khai cho một phiên thi.**

---

## 3. Thay đổi lược đồ dữ liệu

Một migration duy nhất. Thứ tự các bước bên trong quan trọng vì FK.

### 3.1 `rubric` — gỡ khỏi môn học

```
- course_id uuid NOT NULL FK -> course
+ teacher_id uuid NOT NULL FK -> account
+ name       varchar(200) NOT NULL

- unique(course_id, version)
+ unique(teacher_id, name, version)
```

`assertTeachesCourse()` biến mất hoàn toàn: quyền trở thành `rubric.teacherId ===
req.user.sub`, một phép so sánh, không truy vấn. Đây là phần trả lãi lớn nhất của
cả đợt.

> **Bẫy:** `guard_rubric_criteria_immutable` trigger khoá tiêu chí khi rubric đã
> có `grading_result` trỏ tới. Trigger đọc `rubric_criterion` và `grading_result`,
> **không** đọc `course_id`, nên nó không bị ảnh hưởng. Đừng sửa nó "cho chắc".

**Backfill:** `teacher_id` lấy từ `class.teacher_id` của lớp đầu tiên thuộc
`rubric.course_id`. `name` lấy từ `course.name`. Rubric nào không suy ra được chủ
thì **dừng migration**, không gán bừa cho admin — một rubric sai chủ là một
giảng viên sửa được điểm của người khác.

### 3.2 `class` — môn học thành văn bản

```
- course_id   uuid NOT NULL FK -> course
+ course_name varchar(200) NOT NULL

- unique(course_id, name)
+ unique(teacher_id, course_name, name)
```

Khoá duy nhất đổi sang `teacher_id` vì tên môn giờ là văn bản tự do: hai giảng
viên gõ "CTDL&GT" và "Cấu trúc dữ liệu" phải là hai thứ độc lập, không đụng nhau.

### 3.3 `enrollment` — khoá theo lớp

```
- course_id       uuid NOT NULL FK -> course
  home_class_id   uuid NOT NULL FK -> class     (giữ)
  home_teacher_id uuid NOT NULL FK -> account   (GIỮ — xem dưới)

- unique(course_id, student_mssv)
+ unique(home_class_id, student_mssv)
```

> **`home_teacher_id` GIỮ NGUYÊN.** Bản nháp đầu của spec này đề xuất bỏ nó vì
> "suy được từ `class.teacher_id`". Sai, vì hai lý do. Thứ nhất, nó là FK tới
> `account`, **không** tới bảng nào bị xoá, nên nó không buộc phải đi. Thứ hai,
> cùng một cột nằm trên **ba** bảng — `enrollment`, `session_roster:57`,
> `submission:105` — và định danh trên socket exam-live khai nó là trường **bắt
> buộc** kèm kiểm tra null. Bỏ ở một bảng tạo ra ba bề mặt lệch nhau để đổi lấy
> một phép join. Không đáng.

### 3.4 `exam_session` — lớp bắt buộc, phòng thành văn bản

```
- course_id  uuid NOT NULL FK -> course
+ course_name varchar(200) NOT NULL
- room_id    uuid NOT NULL FK -> room
+ room_name   varchar(150) NOT NULL
  class_id   uuid NULL  ->  uuid NOT NULL FK -> class   (ĐỔI)
  semester_name varchar(150)                            (giữ nguyên)
```

**`class_id` NOT NULL vá một lỗ thật, không chỉ là dọn dẹp.** Ràng buộc
`ex_exam_session_class_overlap` là exclusion constraint trên `class_id`; trong
Postgres, **exclusion constraint bỏ qua dòng có khoá NULL**. Nên mọi phiên thi
không gắn lớp hiện đang thoát hoàn toàn khỏi phép chống trùng lịch lớp. NOT NULL
làm ràng buộc đó có hiệu lực lần đầu tiên.

**Backfill `class_id`:** phiên nào đang NULL phải được gán tay hoặc xoá. **Không
đoán.** Dữ liệu dev hiện có chắc chắn có dòng NULL — đếm trước bằng
`SELECT count(*) FROM exam_session WHERE class_id IS NULL` rồi quyết, đừng để
migration tự chọn.

> ⚠️ **Đánh đổi phải ghi vào báo cáo, không được giấu:**
> `ex_exam_session_room_overlap` vẫn chạy được trên cột văn bản (GiST + btree_gist
> làm việc với `text` y như với `uuid`), nhưng nó **suy giảm từ bảo đảm thành
> nỗ lực tốt nhất**: "P.A101", "P A101", "a101" là ba phòng khác nhau với
> Postgres. Chống trùng phòng sau đợt này chỉ bắt được trường hợp gõ giống hệt.
> Chấp nhận được vì phòng không còn là thực thể hệ thống quản lý, nhưng
> `exam-schedule-conflict.e2e-spec.ts` phải được sửa để **khẳng định đúng hành vi
> yếu hơn này**, không phải xoá đi cho xanh.

### 3.5 Bảng xoá hẳn

`course`, `semester`, `room`. Xoá **sau cùng**, sau khi mọi FK trỏ tới chúng đã
biến mất.

### 3.6 Vai trò

`AccountRole` từ `'admin' | 'teacher' | 'super_admin' | 'department_admin'` còn
`'admin' | 'teacher'`. Tài khoản đang mang hai vai trò bị xoá phải được chuyển
sang `teacher` hoặc `admin` **trong cùng migration** — cột `role` là NOT NULL.

---

## 4. Thay đổi route

### 4.1 Chuyển vai trò (4 route) — làm TRƯỚC

| Route | Từ | Sang |
|---|---|---|
| `POST /classes` | `department_admin` | `teacher` |
| `POST /classes/import` | `department_admin` | `teacher` |
| `PATCH /classes/:id` | `department_admin` | `teacher` |
| `DELETE /classes/:id` | `department_admin` | `teacher` |

Cả bốn phải thêm kiểm tra sở hữu: giảng viên chỉ động được lớp có
`teacher_id === req.user.sub`. Trưởng khoa trước đây thấy mọi lớp trong khoa nên
không cần kiểm; giảng viên thì cần. **Bỏ sót chỗ này là một giảng viên sửa được
lớp của người khác.**

### 4.2 Xoá (17 route)

| Nhóm | Route |
|---|---|
| Môn học (7) | toàn bộ `course.controller.ts` |
| Học kỳ (4) | toàn bộ `semester.controller.ts` |
| Phòng (4) | toàn bộ `room.controller.ts` |
| Lớp (2) | `GET /classes/mine`, `GET /classes/teachers` |

`GET /classes/:id/roster` bỏ `department_admin` khỏi danh sách vai trò, chỉ còn
`teacher`.

### 4.3 Sau đợt này

| | Trước | Sau |
|---|---|---|
| Route API | 73 | 56 |
| Route master data | 26 | 9 |

Chín route master data còn lại đều là `class`, và tất cả đều thuộc giảng viên:
tạo, sửa, xoá, nhập từ tệp, xem lớp mình dạy, và bốn route quản lý roster.

### 4.4 Code phải VIẾT LẠI, không chỉ xoá route

> Đây là phần bản nháp đầu của spec này bỏ sót hoàn toàn, và là phần nguy hiểm
> nhất. **Tám service và một controller đọc `session.courseId` hoặc join thẳng
> vào ba bảng sắp bị xoá.** Người nào implement theo bản nháp cũ sẽ đẩy lên một
> hệ thống mà trang bài nộp, đóng băng roster, và xác thực agent đều hỏng.
>
> Bảng dưới là danh sách đầy đủ, đã đối chiếu từng dòng với code.

| File | Dòng | Đang làm gì | Phải đổi thành |
|---|---|---|---|
| `submission/submission-overview.service.ts` | 75, 211, 225-227 | SQL thô `JOIN course`, `JOIN semester`, `JOIN room`, và `ON e.course_id = s.course_id` | Bỏ ba JOIN, đọc thẳng `course_name`/`semester_name`/`room_name` từ `exam_session`; nối enrollment qua `home_class_id = es.class_id` |
| `exam-session/session-roster.service.ts` | 70, 160 | `where: { courseId: session.courseId, … }` trong `freeze()` và tra cứu sinh viên | `where: { homeClassId: session.classId }` |
| `exam-session/exam-session.gateway.ts` | 427, 430 | `enrollments.findForCourse(session.courseId, …)` — **xác thực agent join** | `findForClass(session.classId, …)`; log cũng đổi theo |
| `exam-session/recollect.service.ts` | 67 | SQL thô `ON e.course_id = s.course_id` | Nối qua `e.home_class_id = s.class_id` |
| `exam-session/access-request.gateway.ts` | 112, 196 | `findForCourse`, `findClassForCourse` khi duyệt xin phép | Tra theo lớp; `homeClassId` vẫn do giám thị chọn, **không** suy luận |
| `agent-connection/attendance.service.ts` | 131 | `enrollments.find({ where: { courseId: session.courseId } })` dựng roster | `{ where: { homeClassId: session.classId } }` |
| `exam-session/exam-session.service.ts` | — | Tạo/sửa phiên nhận `courseId`, `roomId` | Nhận `courseName`, `roomName` dạng văn bản; `classId` thành bắt buộc |
| `grading/rubric.service.ts` | 54, 62-178 | `assertTeachesCourse()` + mọi truy vấn theo `courseId` | Viết lại theo `teacherId` (§3.1) |
| `grading/grading.controller.ts` | **55, 66** | `@Get/@Post('courses/:courseId/rubrics')` — **hai route này sống sót khi xoá `course.controller.ts`** nhưng vẫn nhận `courseId` và gọi `listForCourse()` | Đổi đường dẫn thành `rubrics` (không tham số môn học), lọc theo `req.user.sub` |

Hai route rubric ở dòng 55 và 66 là cái bẫy tệ nhất trong danh sách: chúng nằm
trong `grading.controller.ts` chứ không nằm trong `course.controller.ts`, nên xoá
cả file controller môn học vẫn để chúng lại, và chúng vẫn biên dịch được cho tới
lúc chạy thật.

### 4.5 Web: bộ lọc theo học kỳ

`useSemesterFilter`, `FilterRail`, `submission-filters.ts` và năm trang trở lên
đang lọc theo `semesterId`. Đây **không phải** việc xoá: trang bài nộp của giảng
viên cần giữ khả năng lọc. Đổi sang lọc theo `semester_name` dạng văn bản, hoặc
bỏ bộ lọc học kỳ và giữ bộ lọc theo lớp. Quyết định lúc làm bước 2, và ghi lại
đã chọn gì.

### 4.6 `CLAUDE.md` phải sửa trong cùng đợt

Hai chỗ trở thành sai sau đợt này:

- Bảng tầng **Tham chiếu** liệt kê `Semester` / `Room` / `Course` / `Class` /
  `Account` / `Enrollment`. Còn lại `Class` / `Account` / `Enrollment`.
- Quy tắc xác thực agent join ở **mức môn học** đổi thành **mức lớp**. Để nguyên
  thì người implement sẽ giữ lại code xác thực theo môn vì tài liệu bảo thế.
- Mục `assignOwner` cho `Course` mồ côi thuộc `admin` — xoá hẳn.

---

## 5. Thay đổi web

### 5.1 Xoá (8 trang)

`department/classes`, `department/classes/[id]/roster`, `department/courses`,
`department/dashboard`, `department/teachers`, `admin/rooms`, `admin/semesters`,
`admin/unowned-courses`.

Cả thư mục `apps/web/src/app/department/` biến mất.

### 5.2 Dời, KHÔNG xoá

`department/classes/_components/import-classes-dialog.tsx` → khu vực giảng viên.
Đây là chức năng nhập lớp từ tệp, thứ giảng viên sẽ cần nhất. Xoá nhầm nó là mất
một tính năng đang chạy.

### 5.3 Thêm vào `teacher/classes`

Trang này hiện chỉ đọc. Phải thêm: tạo lớp, sửa, xoá, và nút nhập từ tệp vừa dời
sang. Giao diện lấy nguyên từ `department/classes`, chỉ đổi nguồn dữ liệu.

### 5.4 Form tạo phiên thi

`teacher/exam-sessions/new` đang chọn môn học, phòng, học kỳ từ danh sách thả
xuống. Đổi thành ô nhập văn bản, còn lớp vẫn là danh sách thả xuống nhưng **bắt
buộc**, lấy từ `GET /classes/teaching`.

### 5.5 Điều hướng và đăng nhập

`middleware.ts` và trang chuyển hướng sau đăng nhập đang phân nhánh theo bốn vai
trò. Rút còn hai. `unassigned-role` giữ nguyên.

---

## 6. Sinh viên thi bù

### 6.1 Luồng xin phép đã chạy đúng — không đụng

Đã xác minh cả ba tầng:

- **Agent** hỏi họ tên + **lý do** (tối đa 300 ký tự) khi `agent:join` trả về
  `NOT_ENROLLED` — `apps/agent/src/access-request.ts`.
- **Web** hiện thẻ chờ kèm lý do cho giám thị — `AccessRequestPanel.tsx`.
- **API** giữ danh sách chờ trong bộ nhớ (cố ý, không phải bảng), và khi duyệt thì
  giám thị **tự chọn lớp** để định tuyến; việc ai mở cửa cho ai và vì sao đi vào
  `audit_log`.

Sau đợt này, xác thực rơi từ mức môn học xuống mức lớp, nên **sinh viên lớp khác
sẽ đi qua luồng này thay vì vào thẳng**. Đó là hành vi đã chọn, không phải hỏng.

### 6.2 Đánh dấu — KHÔNG cần cột mới

Phép phân biệt đã tồn tại và đang chạy ở `attendance.service.ts:158`:

```
enrollment.homeClassId === session.classId   →  sinh viên của lớp
enrollment.homeClassId !== session.classId   →  thi bù
```

`class_id` thành NOT NULL làm phép so sánh này **đáng tin hơn**, vì không còn vế
NULL. Việc cần làm chỉ là đưa cùng phép so sánh đó ra hai màn hình nữa:

- **Màn bài nộp** (`teacher/submissions/[sessionId]`): một cột hoặc nhãn màu.
- **Màn chấm** (`teacher/grading`, `teacher/grading/[resultId]`): nhãn cạnh tên
  sinh viên, kèm tên lớp gốc.

Nguồn dữ liệu: `submission.home_class_id` đã có sẵn trên mỗi bài nộp. Chỉ cần so
với `exam_session.class_id`.

> **Đừng suy ra "thi bù" từ `agent_connection_event.joined_late`.** Vào muộn và
> thi bù là hai chuyện khác nhau: một sinh viên của đúng lớp vào muộn 10 phút
> không phải thi bù, và một sinh viên thi bù có thể vào đúng giờ.

---

## 7. Hệ quả đã biết, ghi ra chứ không giấu

1. **Chống trùng phòng suy giảm** thành nỗ lực tốt nhất (§3.4).
2. **Không còn cái nhìn toàn khoa.** Không ai thấy được tất cả lớp của một môn
   nữa. Đúng ý đồ, nhưng là mất mát thật nếu sau này cần báo cáo cấp khoa.
3. **Tên môn học sẽ không nhất quán** giữa các giảng viên. Hệ quả: không gom
   thống kê theo môn được nữa. Chấp nhận được với một hệ thống chấm điểm thuần;
   không chấp nhận được nếu sau này muốn so sánh giữa các lớp cùng môn.
4. **Sinh viên thi bù phải xin phép mỗi phiên**, không được nhớ giữa các phiên.
5. **Migration không đảo ngược được** khi đã xoá ba bảng. Phải có bản sao lưu
   cơ sở dữ liệu dev trước khi chạy.

---

## 8. Thứ tự thực hiện

Thứ tự này không tuỳ ý — mỗi bước là điều kiện của bước sau.

1. **Chuyển 4 route lớp sang `teacher` + kiểm tra sở hữu.** Hệ thống vẫn chạy
   đầy đủ sau bước này; chưa xoá gì.
2. **Thêm UI tạo/sửa/nhập lớp vào `teacher/classes`**, dời hộp thoại nhập tệp.
   Kiểm bằng tay: một giảng viên tạo được lớp và nhập được roster mà không cần
   trưởng khoa.
3. **Migration + viết lại 9 file ở §4.4 + xoá route + xoá trang + rút vai trò —
   TRONG CÙNG MỘT LẦN.** Không tách được. Migration bỏ ba bảng mà chín file kia
   vẫn đang join vào; tách ra là có một commit ở giữa nơi hệ thống không chạy.
   Đây là bước lớn nhất của cả đợt và nên là một PR riêng.
4. **Sửa `CLAUDE.md`** theo §4.6, cùng PR với bước 3.
5. **Regenerate `packages/shared/src/api/schema.d.ts`** từ API đang chạy. Bỏ bước
   này thì `apps/web` fail typecheck ở đúng dòng gọi route vừa xoá.
6. **Đánh dấu sinh viên thi bù** ở hai màn hình (§6.2).

Bước 1 và 2 an toàn tuyệt đối và có thể merge riêng. Bước 3 là điểm không quay
lại được.

---

## 9. Test bắt buộc

| Mã | Ca | Mức |
|---|---|---|
| **T-OWN-1** | Giảng viên tạo được lớp của mình | e2e |
| **T-OWN-2** | Giảng viên **không** sửa được lớp của giảng viên khác → 403 | e2e |
| **T-OWN-3** | Giảng viên **không** đọc/sửa được rubric của người khác → 403 | e2e |
| **T-RUB-1** | Rubric tạo và ghim vào phiên thi được, không cần bảng `course` | e2e |
| **T-RUB-2** | `guard_rubric_criteria_immutable` vẫn chặn sau khi đổi khoá | e2e |
| **T-MIG-1** | Backfill `rubric.teacher_id` **dừng** khi có rubric không suy ra được chủ | unit |
| **T-MIG-2** | Migration dừng khi còn `exam_session.class_id IS NULL` | unit |
| **T-CLS-1** | Hai phiên thi cùng lớp, giờ chồng nhau → bị chặn (ràng buộc giờ có hiệu lực) | e2e |
| **T-ROOM-1** | Trùng phòng **gõ giống hệt** → chặn; gõ khác cách → **không** chặn | e2e |
| **T-MU-1** | Sinh viên lớp khác `agent:join` → `NOT_ENROLLED` → xin phép được | e2e |
| **T-MU-2** | Bài nộp có `home_class_id` khác lớp phiên → gắn nhãn thi bù ở cả hai màn | unit |
| **T-ROLE-1** | Không còn route nào chấp nhận `department_admin` | e2e |
| **T-RW-1** | Trang tổng quan bài nộp trả đúng dữ liệu sau khi bỏ ba JOIN | e2e |
| **T-RW-2** | `session-roster.freeze()` đóng băng đúng roster theo lớp | e2e |
| **T-RW-3** | `agent:join` vẫn cho sinh viên đúng lớp vào, từ chối lớp khác | e2e |
| **T-RW-4** | `recollect` nối đúng bài nộp với sinh viên sau khi đổi khoá | e2e |
| **T-RW-5** | Hai route rubric cũ (`courses/:courseId/rubrics`) không còn tồn tại | e2e |

Năm ca `T-RW-*` phủ đúng chín file ở §4.4. Không có chúng thì mọi thứ vẫn biên
dịch được và vẫn hỏng lúc chạy — đó chính là hình dạng của lỗi mà §4.4 tồn tại
để chặn.

T-ROOM-1 là ca dễ bị viết cho xanh nhất. Nó phải khẳng định **cả hai vế**, gồm cả
vế hệ thống *không* chặn được, nếu không thì sự suy giảm ở §3.4 sẽ bị quên.

---

## 10. Liên quan

- `docs/grading-system-guide.md` §11 — bảng "Cái CHƯA có"; `grade_export` vẫn chỉ
  có entity và **không** thuộc đợt này.
- `docs/superpowers/specs/2026-09-17-code-autograder-design.md` — plan song song.
  Không đụng bảng nào trong spec này, nhưng **nên merge sau**, vì nó thêm cột vào
  `exam_session`.
- Plan xây lại phần chấm điểm (chưa viết) **phụ thuộc đợt này**: nó cần rubric đã
  thuộc giảng viên trước khi bắt đầu.
