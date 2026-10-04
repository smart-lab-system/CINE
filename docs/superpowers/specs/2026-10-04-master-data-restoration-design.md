# Khôi phục master data có phân tầng — thiết kế

**Ngày:** 2026-10-04 · **Baseline:** `main` = `4cb6bca` · **Trạng thái:** spec, chưa implement
**Thay thế một phần:** `2026-09-20-master-data-scope-cut-design.md`. **Đảo ngược:** việc biến học kỳ/phòng/môn thành chuỗi (§3.2, phần phòng của §3.4, §3.5), việc chuyển quyền tạo lớp sang giảng viên (§4.1, §5.3), và các trang quản trị bị xoá (§5.1). **Giữ:** rubric thuộc giảng viên (§3.1), enrollment khoá theo lớp (§3.3), `class_id NOT NULL` (§3.4), hai role (§3.6)

Dựng lại học kỳ, phòng thi và lớp thành các thực thể có khoá ngoại thật, đặt quyền
tạo chúng vào tay admin, và cho giảng viên chỉ **dùng** những gì admin đã khai. Mọi
loại dữ liệu nền đều nhập được hai cách: thủ công hoặc import từ danh sách.

---

## 0. Vì sao đảo lại

Đợt cắt 20–21/09 đổi học kỳ, phòng và môn thành chuỗi chữ do giảng viên gõ, với lập
luận "hệ thống không quản lý dữ liệu nền của trường". Kết quả đo trên DB đang chạy
ngày 2026-10-04 (chỉ đọc, chỉ số tổng hợp) cho thấy đúng hậu quả mà spec cũ đã ghi
ở §7 và coi là chấp nhận được:

| Quan sát | Số liệu |
|---|---|
| Một học kỳ viết hai cách | "HK1 2026-2027" (10 phiên) và "Học kỳ 1 2026-2027" (6 phiên) là **cùng một kỳ** |
| Học kỳ rác | "TEST dien tap" (12 phiên), "TEST ha tang" (1) |
| Lớp đặt theo tên môn | "Hệ Quản Trị Dữ Liệu MongoDB": 9 sinh viên, cả 9 đã thuộc DHKTPM18ATT; 5 phiên của nhiều môn khác nhau |
| Phòng rác | `TEST-KHONG-PHONG` (13 phiên) |
| Lớp không thuộc kỳ nào | 3/3 lớp; "kỳ" chỉ tồn tại như chuỗi trên từng phiên |

Hệ quả vận hành: không thống kê được theo kỳ, danh sách lựa chọn của bộ lọc dựng từ
chuỗi gõ nên mỗi cách viết thành một "kỳ", chống trùng phòng chỉ bắt được chuỗi giống
hệt, và **không có gì chứng minh một giá trị tồn tại**.

**Nguyên tắc mới thay cho "hệ thống chỉ ghi lại những gì giảng viên khai":** *dữ liệu
nền do admin khai và kiểm chứng được bằng khoá ngoại; giảng viên chỉ chọn trong đó.
Phiên thi tiếp tục chụp lại tên lúc tạo (bản chụp) để bảng điểm không đổi theo.*

### 0.1 Phần giữ nguyên của đợt cắt cũ

Không đảo ngược: `rubric` thuộc giảng viên (`teacher_id` + `name`), `assertTeachesCourse`
đã biến mất, hai role `admin`/`teacher`, `exam_session.class_id NOT NULL`, nhãn thi bù,
môn duy nhất `CTDL&GT` là hằng số (`common/course-name.ts`). Phần chấm điểm xây trên
các thứ này nên không được lùi.

### 0.2 Về "backup branch"

Không có nhánh backup nào cho đợt cắt 20/09. Hai nhánh `backup/main-before-*-20260910`
là của lần revert "ống kính học kỳ" ngày 10/09 (16 commit `is_current`, role
`academic_affairs`) và **không dùng lại**: CLAUDE.md §1.2 cấm `is_current`. Điểm khôi
phục thật là `3cf4688` (trước đợt cắt) — chỉ để **chép giao diện admin** (`admin/semesters`,
`admin/rooms`, `department/classes`), không để revert. Gắn tag `pre-master-data-restore`
vào `4cb6bca` trước khi chạy migration (§8.1).

---

## 1. Phạm vi

### 1.1 Trong phạm vi

| Hạng mục | Ghi chú |
|---|---|
| Bảng `semester`, `room`, `administrative_class`, `student` | §2 |
| `class` thuộc học kỳ + lớp danh nghĩa; admin tạo và giao cho giảng viên | §2, §3 |
| `exam_session.room_id`; chống trùng phòng theo khoá | §2.4 |
| Admin quản lý 3 loại: học kỳ, phòng, lớp (lớp danh nghĩa nằm trong form lớp) | §4, §5 |
| Mọi loại nhập được thủ công **và** import | §6 |
| Bộ lọc năm học + học kỳ dùng chung | §7 |
| Migration, backfill, diễn tập trên bản sao | §8 |
| Sửa `CLAUDE.md` | §9 |

### 1.2 Cố ý KHÔNG trong phạm vi

- **Logic chấm điểm** (pipeline, guard, provider, prompt, bảng lỗi, bảng giá). Phần chấm
  chỉ nhận ảnh hưởng qua nhãn lớp (§2.5) và các bộ lọc.
- **Luồng xin phép vào phòng (thi bù)** và giao thức agent. Xác thực agent join vẫn
  theo ảnh chốt của phiên (`session_roster`), tức mức lớp. Mọi sinh viên ngoài danh sách
  của lớp phiên đều đi qua luồng xin phép kèm lý do.
- **Bảng môn học / catalog môn.** Vẫn một môn, vẫn là hằng số. Bộ lọc "môn học" trong ghi
  chú của giảng viên hướng dẫn **không làm** vì chỉ có một môn.
- **Bảng "năm học" riêng.** Năm học là một cột trên `semester` (§2.1).
- **Import tài khoản.** Nhập hàng loạt tài khoản kéo theo tạo mật khẩu hàng loạt.
- **Trang quản lý sinh viên cho admin.** `student` chỉ được ghi qua danh sách lớp của giảng viên.
- **Cờ `is_current`, API set-current, và mọi luật chặn thao tác theo học kỳ** (§7.3).
- **Dọn cột `course_name`** (hằng số) — việc riêng, đã có trong spec agent điều tra.
- **Lịch thi hiển thị.**

---

## 2. Mô hình dữ liệu

```
semester             (academic_year_start, term ∈ {1,2,3}, start_date, end_date)
administrative_class (code)                       -- lớp danh nghĩa, vd "DHKTPM18A"
room                 (name, capacity, is_active)
student              (mssv, full_name)

class  = lớp học phần
         (semester_id, administrative_class_id, group_name, teacher_id)
  └─ enrollment      (home_class_id, student_mssv → student.mssv, home_teacher_id)

exam_session         (class_id, room_id, teacher_id, ...)
                     + course_name / room_name / semester_name = BẢN CHỤP, server điền

KHÔNG ĐỔI: session_roster, submission, rubric, error_rule, price_table_version, grading_*
```

### 2.1 `semester`

```
id uuid PK
academic_year_start int NOT NULL         -- 2026 nghĩa là năm học 2026-2027
term smallint NOT NULL CHECK (term IN (1,2,3))
start_date date NOT NULL
end_date   date NOT NULL CHECK (end_date >= start_date)

unique(academic_year_start, term)
EXCLUDE USING gist (daterange(start_date, end_date, '[]') WITH &&)   -- không chồng ngày
```

Một năm học có 3 kỳ. Tên hiển thị suy ra: `HK{term} {year}-{year+1}`, ví dụ
`HK1 2026-2027`. Không có cột `name` riêng. `btree_gist` đã được cài sẵn.

Quy tắc: `academic_year_start` và `term` **không đổi được** khi đã có lớp trỏ tới
(DB ép). Ngày bắt đầu/kết thúc thì sửa được. Lý do: bản chụp `semester_name` trên phiên
đã ghi nhãn cũ; đổi nhãn gốc sau đó làm nhãn trên màn hình và bản chụp lệch nhau.

### 2.2 `administrative_class` (lớp danh nghĩa)

```
id uuid PK
code citext NOT NULL UNIQUE
CHECK (code ~ '^[A-Za-z0-9]{3,30}$' AND code = upper(code))
```

Lưu thành bảng riêng **chỉ để DB kiểm chứng sự tồn tại và chống trùng**; không có
trang, route hay bộ lọc riêng cho giảng viên (§4, §5). Giảng viên chỉ thấy nhãn gộp (§2.5).

Quy tắc:
- Mã được **viết hoa và cắt khoảng trắng** ở tầng ghi; `CHECK` ép lại ở DB.
- **Mã mồ côi tự dọn:** khi lớp cuối cùng dùng một mã bị xoá hoặc đổi sang mã khác, mã đó
  bị xoá trong cùng giao dịch. Sửa một mã gõ nhầm xong là nó biến khỏi danh sách chọn.
- **Cảnh báo gõ gần giống** ở giao diện (khoảng cách chỉnh sửa nhỏ so với mã đã có). Danh
  sách chỉ vài chục dòng nên so trên trình duyệt, không thêm hạ tầng.

> **Giới hạn nói thẳng:** hệ thống không biết trường có lớp "DHKTPM18C" hay không. Lần
> đầu admin gõ một mã mới, đó vẫn là con người nhập. Hệ thống bảo đảm: không trùng, không
> lệch hoa-thường, không lớp nào trỏ tới mã không tồn tại, và có cảnh báo khi gần giống.
> Muốn chặt hơn nữa: cho admin import danh sách mã lớp danh nghĩa từ file của trường trước,
> rồi form chỉ cho chọn. Không làm trong đợt này.

### 2.3 `class` (lớp học phần)

```
semester_id             uuid NOT NULL FK -> semester             ON DELETE RESTRICT
administrative_class_id uuid NOT NULL FK -> administrative_class ON DELETE RESTRICT
group_name   varchar(50) NOT NULL DEFAULT ''     -- vd "Nhóm 1"; '' khi không tách nhóm
teacher_id   uuid NOT NULL FK -> account         ON DELETE RESTRICT   (giữ)

unique(semester_id, administrative_class_id, group_name)

- name        varchar(100)     -- bỏ; thay bằng nhãn tính ra (§2.5)
- unique(teacher_id, course_name, name)
```

`group_name` mặc định là chuỗi rỗng, **không phải NULL**: Postgres coi mọi NULL là khác
nhau nên với NULL thì ràng buộc unique bị vô hiệu — cùng lỗ hổng mà spec 20/09 §3.4 đã
phát hiện ở `exam_session.class_id`.

Quy tắc:
1. **Không đổi `semester_id` của lớp đã có phiên thi** (DB ép; cơ chế — trigger hay khoá
   ngoại ghép — chốt ở plan). Lớp nhập nhầm kỳ mà chưa có phiên thì sửa thoải mái.
2. **Đổi giảng viên của lớp** là thao tác của admin. Trong cùng giao dịch,
   `enrollment.home_teacher_id` của lớp được cập nhật. Phiên, bài nộp, kết quả chấm đã có
   **vẫn thuộc giảng viên cũ**: `exam_session.teacher_id`, `session_roster.home_teacher_id`,
   `submission.home_teacher_id` không đổi — để không ai sửa được điểm của phiên người khác
   đã chấm. Giảng viên mới thấy lớp và tạo được phiên mới.
3. `course_name` trên lớp **không đổi** (hằng số). Phạm vi kiểm tra "sinh viên đã ở lớp khác"
   chuyển từ "cùng môn" (luôn đúng, nên hiện đang là **mọi lớp mọi kỳ** — `roster.service.ts:212`)
   sang **cùng học kỳ**. Sinh viên học lại ở kỳ sau không còn bị chặn.

### 2.4 `room` và `exam_session`

```
room:
  id uuid PK
  name citext NOT NULL UNIQUE     -- cắt khoảng trắng đầu/cuối, gộp khoảng trắng liên tiếp
  capacity int NULL
  is_active boolean NOT NULL DEFAULT true

exam_session:
  + room_id uuid NOT NULL FK -> room ON DELETE RESTRICT
    room_name / semester_name / course_name: giữ làm BẢN CHỤP, server điền, update:false
  ex_exam_session_room_overlap:  gist(room_name ...)  ->  gist(room_id ...)
```

- `is_active = false` nghĩa là **không chọn được cho phiên mới**; phiên cũ vẫn trỏ được. Kiểm
  ở service (không phải ràng buộc DB, vì lịch sử phải tham chiếu được phòng đã ngừng).
- Chống trùng phòng chuyển lại về **khoá ngoại**, nên "P.A101" và "P A101" không còn là hai
  phòng ngẫu nhiên — chỉ chọn được phòng có trong bảng.
- `room_name`, `semester_name` do server chép từ phòng và từ học kỳ của lớp lúc tạo phiên;
  không còn ô nào cho giảng viên gõ. `course_name` chép từ lớp như hiện nay
  (`exam-session.service.ts:194`).
- Bản chụp giữ nguyên để các đường đọc hiện có (trang bài thu, danh sách chấm, token
  `{PHONG}` trong tên file, export `WHERE semester_name = ?`) **không phải sửa**.

### 2.5 Nhãn lớp — một nguồn duy nhất

Lớp không còn cột `name`. Có **một view `class_label`** tính ra nhãn hiển thị:

```
DHKTPM18A                 -- group_name = ''
DHKTPM18A – Nhóm 1        -- có nhóm
+ " · HK1 2026-2027"      -- khi cần phân biệt kỳ
```

9 file hiện đọc tên lớp (`attendance.service`, `attendance.types`, `class.service`,
`exam-session-response.dto`, `exam-session.service`, `grading.service:691`,
`submission.service`, `submission-overview.service`, `submission-overview.types`) chuyển
sang đọc view/biểu thức này. **Không giữ cột `name` song song** — đó lại là dữ liệu trùng
lặp có thể lệch nhau. Giảng viên chỉ thấy **một nhãn** ở mọi nơi; không có trang, route
hay bộ lọc riêng cho lớp danh nghĩa.

### 2.6 `student`

```
id uuid PK
mssv citext NOT NULL UNIQUE  CHECK (mssv ~ STUDENT_MSSV_REGEX)
full_name varchar(150) NOT NULL

enrollment:  - student_name
             student_mssv  FK -> student.mssv  ON DELETE RESTRICT   (giữ cột, thêm FK)
             unique(home_class_id, student_mssv)                    (giữ)
```

- Tên sinh viên nằm **một chỗ duy nhất**. Bốn nơi đang đọc hoặc ghi `enrollment.studentName`
  (`attendance.service` đọc, `session-roster.service` đọc lúc đóng băng, `roster.service`
  đọc và ghi, `enrollment.service` ghi) chuyển sang đọc/ghi qua `student`.
- `session_roster.student_name` **giữ nguyên** — là ảnh chụp tên lúc thi. Agent join và bài
  nộp đọc từ đó, nên không bị ảnh hưởng.
- **Khi nhập tay một MSSV đã có:** tên được điền sẵn và **khoá**; giảng viên không sửa
  được tên qua ô này. MSSV chưa có thì bắt buộc nhập tên.
- **Khi file Excel ghi tên khác tên đã lưu:** file mới nhất thắng, và kết quả import **liệt
  kê rõ ai bị đổi tên** (không đổi âm thầm). Đổi tên áp dụng cho mọi lớp vì chỉ có một tên.
- **Luồng xin phép thi bù** (`access-request.gateway.ts`) gọi `enrollments.addManually` với tên
  sinh viên tự gõ. Sau đợt này: MSSV đã có trong `student` → dùng tên đã lưu, **không ghi đè**
  bằng tên gõ; MSSV chưa có → tạo `student` bằng tên gõ.
- **Tra tên:** `GET /students/:mssv` trả `{ mssv, fullName }` hoặc 404, **chỉ theo đúng một
  MSSV**. Không có route liệt kê sinh viên cho giảng viên (không ai dò được danh sách người khác).
  Có giới hạn tốc độ theo người gọi; mức do plan chốt.
- `student` không bao giờ bị xoá tự động; sinh viên nối qua nhiều kỳ.

---

## 3. Thay đổi lược đồ — tổng hợp

| Bảng | Thay đổi |
|---|---|
| `semester` | **Mới** (§2.1) |
| `administrative_class` | **Mới** (§2.2) |
| `room` | **Mới**, có `is_active` (§2.4) |
| `student` | **Mới** (§2.6) |
| `class` | + `semester_id`, + `administrative_class_id`, + `group_name`; − `name`; đổi unique |
| `enrollment` | − `student_name`; + FK `student_mssv → student.mssv` |
| `exam_session` | + `room_id` NOT NULL; `ex_exam_session_room_overlap` theo `room_id`; ba cột chữ thành bản chụp `update:false` |
| `session_roster`, `submission`, `rubric`, `error_rule`, `price_table_version`, `grading_*` | **Không đổi** |

Trình tự trong migration và các điểm không-quay-lại: §8.

---

## 4. Thay đổi route

Mặc định `@Roles('admin')` trừ khi ghi khác. `RolesGuard` nhận chuỗi nên route bỏ sót vẫn
biên dịch được; `roles-retired.spec.ts` tiếp tục quét.

| Nhóm | Route | Vai trò |
|---|---|---|
| Học kỳ | `GET /semesters` | admin, teacher |
| | `POST`, `PATCH /:id`, `DELETE /:id` | admin |
| | `POST /semesters/import` (`dryRun`) | admin |
| Phòng | `GET /rooms` (`?active=true` cho form tạo phiên) | admin, teacher |
| | `POST`, `PATCH /:id` (kể cả `is_active`), `DELETE /:id` | admin |
| | `POST /rooms/import` (`dryRun`) | admin |
| Lớp | `GET /classes` (lọc `semesterId`, `academicYear`, `teacherId`, `q`) | admin |
| | `POST`, `PATCH /:id`, `DELETE /:id` | **admin** (hiện là `teacher`, thêm 21/09) |
| | `POST /classes/import` (`dryRun`) | admin |
| | `GET /classes/teaching` (thêm lọc `semesterId`/`academicYear`) | teacher, **chỉ đọc** |
| Lớp danh nghĩa | `GET /administrative-classes` (nguồn của combobox) | admin |
| Danh sách sinh viên của lớp | `GET/POST /classes/:id/roster…` (các route hiện có) | teacher (có kiểm `class.teacher_id`) |
| Sinh viên | `GET /students/:mssv` | teacher |
| Tài khoản | `GET /accounts/teachers` (đã có) | admin |

- Lớp danh nghĩa **không có route tạo/sửa riêng**: service tạo mã mới khi `POST/PATCH /classes`
  nhận một mã chưa có, và dọn mã mồ côi (§2.2).
- `GET /exam-sessions` thay tham số `semesterName` bằng `semesterId`/`academicYear`; trường
  phản hồi `semesterNames` **bị bỏ** (danh sách lựa chọn lấy từ `GET /semesters`). Mỗi dòng
  phản hồi thêm `semesterId`, `academicYear`, `term`, `classLabel`.
- `POST /exam-sessions` nhận `roomId` (thay `roomName`), **bỏ `semesterName`** khỏi body — suy
  từ lớp. Phòng phải `is_active`; lớp phải thuộc giảng viên gọi (kiểm hiện có).
- `schedule-conflict.service.ts` nhận `roomId` + tên để dựng câu báo lỗi đọc được.
- Mọi thao tác ghi dữ liệu nền của admin (tạo/sửa/xoá thủ công, mỗi lần xác nhận import)
  ghi `audit_log`. Roster của giảng viên vẫn **không** audit (như quyết định hiện tại).

---

## 5. Thay đổi web

### 5.1 Admin — 3 trang mới

| Trang | Nội dung |
|---|---|
| **Học kỳ** | Nhóm theo năm học; thêm/sửa/xoá; nhập từ file |
| **Phòng thi** | Danh sách có ô tìm; thêm/sửa/bật-tắt hoạt động/xoá; nhập từ file |
| **Lớp** | Lọc năm học, học kỳ, giảng viên + tìm mã lớp. Form 4 ô: học kỳ, lớp danh nghĩa (combobox), nhóm, giảng viên. Nhập từ file |

Giao diện lấy lại từ `admin/semesters`, `admin/rooms`, `department/classes` ở `3cf4688`.
Không có trang lớp danh nghĩa. Thêm 3 mục vào `nav-config.ts` cho admin. Không xoá được dữ
liệu đang được dùng (học kỳ còn lớp, phòng đã có phiên, …): DB chặn, và trang báo **lý do
cụ thể** thay vì lỗi thô.

### 5.2 Giảng viên

- **Lớp của tôi:** trở về **chỉ đọc**, có bộ lọc năm học + học kỳ. Gỡ `class-form-dialog.tsx`
  và `delete-class-dialog.tsx` (thêm 21/09); form được chuyển sang trang admin.
- **Danh sách sinh viên của lớp:** giữ tải file + thêm tay; ô thêm tay gõ MSSV là tự hiện
  tên (§2.6).
- **Form tạo phiên:** lớp chọn từ danh sách lớp được giao, hiện nhãn gộp `DHKTPM18A – Nhóm 1
  · HK1 2026-2027`; phòng chọn từ phòng đang hoạt động; học kỳ hiện **chỉ để xem**, lấy từ lớp.
  Không còn ô gõ chữ nào cho phòng hay học kỳ.

### 5.3 Sinh lại client

Route đổi nên phải chạy API rồi regenerate `packages/shared/src/api/schema.d.ts`; bỏ bước
này thì `apps/web` fail typecheck ở đúng dòng gọi route cũ (xem memory "OpenAPI client
regeneration").

---

## 6. Nhập dữ liệu hai cách

Mọi loại dữ liệu nền có **thủ công** (form) và **import** (file .xlsx). Danh sách sinh viên
của lớp đã có cả hai và giữ nguyên luồng.

### 6.1 Phạm vi và khoá nhận diện

| Dữ liệu | Khoá | Cột trong file | Ghi chú |
|---|---|---|---|
| Phòng thi | tên phòng | tên, sức chứa | Nơi import có giá trị nhất |
| Học kỳ | năm học + kỳ | năm học, kỳ, ngày bắt đầu, ngày kết thúc | Phải kiểm không chồng ngày, trong file lẫn với dữ liệu có sẵn |
| Lớp | học kỳ + mã lớp danh nghĩa + nhóm | học kỳ, mã lớp danh nghĩa, nhóm, email giảng viên | Học kỳ và giảng viên phải **đã tồn tại**, thiếu thì dòng đó lỗi. Mã lớp danh nghĩa mới thì được tạo (nguyên tắc 4) |
| Sinh viên | MSSV | MSSV, họ tên | Của giảng viên; chỉ đổi nơi ghi sang `student` |

Phụ thuộc: học kỳ → lớp; phòng độc lập. Khi thiếu, giao diện báo rõ ("chưa có học kỳ HK1
2026-2027, hãy tạo học kỳ trước").

### 6.2 Tám nguyên tắc

1. **Import chỉ thêm và sửa, không bao giờ xoá.** Khác roster, không có tuỳ chọn "xoá những
   người không có trong file" — xoá hàng loạt theo file dữ liệu nền là nguy hiểm, và DB cũng
   chặn dữ liệu đang được dùng. Muốn xoá thì làm thủ công.
2. **Chỉ sửa trường không phải khoá** (sức chứa phòng, ngày học kỳ, giảng viên của lớp). Đổi
   khoá là một dòng mới; đổi tên làm thủ công. Khi file đổi giảng viên của một lớp, bản xem
   trước phải nêu **"đổi giảng viên A → B"**, không chỉ đếm số dòng.
3. **File có dòng lỗi thì không ghi gì.** Lỗi hiện kèm số dòng ở bước xem trước; sửa file rồi
   chọn lại. Khớp với roster và giữ bất biến "DB phản ánh đúng file". (Bộ nhập lớp cũ bỏ
   dòng lỗi vì khoa có nhiều dòng; với 10–50 dòng lý do đó không còn nặng.)
4. **Mã lớp danh nghĩa mới trong file được tạo, nhưng hiện riêng ở bản xem trước** kèm cảnh
   báo gần giống mã có sẵn, để một dòng gõ nhầm không lặng lẽ thêm mã mới.
5. **Xem trước và ghi dùng chung một hàm tính trên server.** Roster hiện tính diff hai lần
   (trình duyệt và server) nên có thể lệch. Với dữ liệu có tham chiếu chéo, server tính hết;
   xem trước gọi cùng hàm ở chế độ `dryRun` (không ghi), nên người dùng thấy đúng cái sẽ xảy
   ra. Roster **giữ nguyên** như hiện tại.
6. **Nhập thủ công và import dùng chung một lớp kiểm tra** ở service (độ dài, định dạng,
   không trùng) để hai đường không lệch nhau.
7. **Audit:** mỗi lần xác nhận import ghi một dòng `audit_log` (ai, loại, số lượng).
8. **File mẫu tải về** cho từng loại, đúng tên cột. Bước ghép cột giữ lại cho file có tên cột
   khác nhưng **tự nhận diện theo tên cột trước**.

### 6.3 Bộ import dùng chung

Hiện chưa có: `ColumnMapper` gắn cứng "Cột MSSV", `ImportReview` hiển thị `mssv — tên`. Dựng
bộ dùng chung điều khiển bằng một **mô tả cột** cho từng loại (khoá, bắt buộc, bí danh tên cột,
cách hiển thị diff). Giữ nguyên các điểm đã đúng của roster: exceljs đọc **trong trình duyệt**
(giới hạn 5MB / 2.000 dòng / 40 cột, `read-workbook.ts`), **file không lên server** — chỉ gửi
JSON các dòng; server kiểm lại mọi dòng. Trần dòng: học kỳ 20, phòng 500, lớp 200.

Ô ngày trong Excel có thể thành số, ngày hoặc chữ tuỳ cách `readWorkbook` đọc. Chỉ nhận định
dạng không mơ hồ (`yyyy-mm-dd` hoặc `dd/mm/yyyy`) và hiện ngày đã hiểu ở bản xem trước. Cách
`readWorkbook` trả ô ngày cần kiểm khi viết plan.

---

## 7. Bộ lọc năm học + học kỳ

### 7.1 Hiện trạng cần gom

Ba bản cài đặt riêng của cùng một bộ lọc, đều lọc theo **chuỗi chữ** và dựng danh sách lựa
chọn từ các dòng đã tải: `components/layout/semester-filter.tsx` (trang kỳ thi),
`FilterRail.tsx` (bài thu), `lib/session-list.ts` (chấm điểm). Trang "Lớp của tôi" không có
bộ lọc nào.

### 7.2 Thiết kế

Một component + một hook dùng chung, hai ô liên kết **Năm học → Học kỳ**:
- Lựa chọn lấy từ **bảng `semester`** (`GET /semesters`), không dựng từ dữ liệu đã tải.
- Chọn năm học không chọn kỳ = cả 3 kỳ; đổi năm học thì ô kỳ về "tất cả" nếu kỳ đang chọn
  không có trong năm mới.
- Lọc bằng **khoá**: server lọc qua `class.semester_id`; các trang đã tải sẵn tiếp tục lọc
  trong trình duyệt theo `semesterId`/`academicYear`/`term` trên mỗi dòng.
- **Mặc định "Tất cả học kỳ"** ở mọi màn hình. Lý do: bản học kỳ 10/09 từng phải thêm riêng
  "nhắc việc tồn đọng của kỳ trước" (commit `1e5df56` trên nhánh backup) vì bộ lọc mặc định
  đã che mất bài chưa chấm xong của kỳ cũ.
- Mỗi màn hình giữ bộ lọc **riêng**; chuyển màn hình thì về mặc định (quyết định hiện tại).

| Màn hình | Bộ lọc |
|---|---|
| Giảng viên: Kỳ thi, Bài thu, Chấm điểm | Năm học + học kỳ, cùng các bộ lọc có sẵn (lớp, phòng, loại kỳ thi) |
| Giảng viên: Lớp của tôi | Năm học + học kỳ |
| Giảng viên: Dashboard | Tổng số phiên theo bộ lọc |
| Admin: Lớp | Năm học + học kỳ + giảng viên, ô tìm mã lớp |
| Admin: Học kỳ | Nhóm theo năm học |
| Admin: Phòng thi | Ô tìm theo tên |
| Rubric, Bảng lỗi, Soạn đề | **Không có lọc học kỳ** — thuộc giảng viên, không thuộc kỳ nào |
| Màn hình bên trong một phiên | Không có — đã thuộc đúng một phiên |

### 7.3 Học kỳ không bao giờ chặn thao tác

Quy tắc CLAUDE.md §1.2 giữ nguyên: bộ lọc chỉ thu hẹp tầm nhìn. Giảng viên vẫn tạo được phiên
cho lớp của kỳ đã kết thúc. **Bài test:** hệ thống có bao giờ *từ chối* một thao tác vì lý do
liên quan tới học kỳ không? Câu trả lời đúng vẫn là **không** — ngoại lệ duy nhất là ràng buộc
toàn vẹn dữ liệu (không đổi kỳ của lớp đã có phiên, §2.3), không phải luật nghiệp vụ theo ngày.

---

## 8. Migration và dữ liệu đang có

### 8.1 Dữ liệu thật (đo 2026-10-04, chỉ đọc)

Một DB Supabase Singapore; `.env` và `railway.toml` đều trỏ vào đó, và các phiên diễn tập
ngày 28/09 chạy qua Railway nằm ngay trong DB này nên gần như chắc chắn là cùng một DB
(chưa xác minh được biến môi trường trên Railway). Đủ 48/48 migration. Migration **chạy
tay**, không tự chạy khi deploy.

| | |
|---|---|
| Tài khoản | 4 (1 admin, 3 giảng viên) |
| Lớp | 3: `DHKTPM18ATT` (9 sv), `DHKTPM18CTT` (45 sv, chưa có phiên), "Hệ Quản Trị Dữ Liệu MongoDB" (9 sv) |
| Enrollment / sinh viên | 63 / 54 (**không xung đột tên**; 9 MSSV thuộc hai lớp) |
| Phiên | 29, tất cả `completed`, 0 `archived`; 13 là phiên test (đều có kết quả chấm) |
| Bài nộp / kết quả chấm / rubric | 252 / 62 / 8 |
| `session_roster` | 252 (tên **khớp** enrollment ở cả 252 dòng) |

### 8.2 Ánh xạ

| Dữ liệu | Xử lý |
|---|---|
| Học kỳ | Tạo **HK1 2026-2027** (`2026`, `1`). Hai cách viết gộp thành một. 16 phiên + 13 phiên test đều diễn ra 17/09–30/09/2026 (giờ Việt Nam) nên đều thuộc kỳ này. **Ngày tạm `2026-09-01 → 2027-01-31`** — migration không có cách biết ngày thật; admin sửa trên giao diện sau |
| Phòng | Tạo `Phòng máy A1`, `Phòng máy B1`, `Phòng H3.03` (sức chứa NULL, hoạt động) và `TEST-KHONG-PHONG` (**`is_active = false`**) |
| Lớp danh nghĩa | `DHKTPM18ATT`, `DHKTPM18CTT` |
| Lớp | `DHKTPM18ATT` → kỳ HK1 2026-2027, nhóm `''`. `DHKTPM18CTT` → cũng HK1 2026-2027 (không có phiên để suy; **giả định này cần admin xác nhận**) |
| Lớp "MongoDB" | **Gộp vào `DHKTPM18ATT`** (§8.3) |
| Sinh viên | 54 dòng vào `student` |
| 13 phiên test | **Giữ và lưu trữ** (`archived_at` đã có sẵn) — không xoá |
| `semester_name` bản chụp | Hai cách viết (`HK1 2026-2027`, `Học kỳ 1 2026-2027`) được viết lại thành `HK1 2026-2027`; hai chuỗi TEST **giữ nguyên** để còn nhận ra |

Migration **không đoán**: dòng nào không ánh xạ được thì dừng (cùng kiểu `RAISE EXCEPTION`
của `ExpandMasterDataToText`, dòng 67–117).

### 8.3 Gộp lớp MongoDB

Lớp này là một lớp đặt theo tên môn cũ, có 9 sinh viên đều đã ở `DHKTPM18ATT`. Gộp vào
`DHKTPM18ATT`:
- ghi lại `class_id` của 5 phiên;
- ghi lại `home_class_id` của **45 dòng `session_roster` và 45 bài nộp**;
- xoá 9 enrollment trùng, rồi xoá lớp;
- đối chiếu số lượng trước/sau (45 + 45 + 9).

Hai điểm phải nói thẳng:
- **6 cặp phiên trùng giờ** giữa hai lớp (đo không lọc trạng thái). Việc gộp **không thể**
  làm hỏng `ex_exam_session_class_overlap` vì ràng buộc đó bỏ qua phiên `completed`, mà cả 29
  phiên đều `completed` — nhưng lịch sử của `DHKTPM18ATT` sau gộp sẽ có các phiên chồng giờ.
  (Một lần đo trước đó trong cuộc brainstorm báo "0 cặp" là **vô nghĩa** vì lọc theo trạng
  thái loại bỏ mọi phiên; số đúng là 6.)
- **Chưa kiểm:** trigger nào trên `submission`/`session_roster` có chặn ghi lại `home_class_id`
  không. Không thấy trigger nào nhắc tới cột này trong migration, nhưng bằng chứng là lượt
  diễn tập trên bản sao (§8.5).

Phương án khác: giữ lớp riêng và bỏ quy tắc "mỗi sinh viên một lớp mỗi kỳ" — nhưng như vậy một
lớp đặt theo tên môn vẫn nằm trong master data. Spec chọn gộp.

### 8.4 Trình tự (expand → backfill → contract)

Cần tách vì migration chạy tay, DB dùng chung, và code deploy riêng. Mỗi trạng thái trung
gian đều chạy được.

0. **Sao lưu.** `pg_dump` DB Supabase (vài trăm dòng, vài giây) + tag git
   `pre-master-data-restore` vào `4cb6bca`. Bước cuối **không đảo ngược được** (`down()` ném
   lỗi, như `ContractMasterData`, dòng 137). Đường lùi duy nhất: khôi phục bản dump + deploy tag.
1. **Migration mở rộng (chỉ thêm):** 4 bảng mới; cột `class.semester_id`,
   `class.administrative_class_id`, `class.group_name`, `exam_session.room_id` cho phép NULL.
   Code cũ vẫn chạy.
2. **Backfill** theo §8.2, SQL chạy lại được, kèm đối chiếu số lượng.
3. **Deploy code mới** (Railway + Vercel).
4. **Chạy lại backfill** để bắt các phiên tạo trong lúc chờ, rồi **migration thu hẹp**: `NOT NULL`,
   khoá ngoại, unique, đổi chống trùng phòng sang `room_id`, bỏ `enrollment.student_name` và
   `class.name`. Dừng nếu còn dòng NULL.

Giữa bước 3 và 4 cần một khoảng bảo trì vài phút (3 giảng viên). Máy dev nào đang trỏ vào
Supabase phải chuyển sang nhánh mới trước bước 4. Migration phục hồi dùng timestamp **sau
mọi migration của G1–G5** (§8.6). `migrationsTransactionMode: 'none'` nên mỗi migration tự
mở giao dịch (tiền lệ: `NormalizeCourseNameToSingleSubject`).

### 8.5 Diễn tập trên bản sao — chốt chặn chính

Khôi phục bản dump vào Postgres local (Docker), chạy migration + backfill, rồi đối chiếu:
1. Số dòng mọi bảng không đổi, trừ các thay đổi đã biết: `enrollment` 63→54, `student` +54,
   `semester` +1, `room` +4, `administrative_class` +2.
2. **Checksum điểm số** (`grading_result`, `score_computation`) trước và sau **giống hệt**.
3. Đúng 45 + 45 dòng bị ghi lại `home_class_id`; không còn FK NULL.
4. Chèn thử hai phiên chưa kết thúc trùng phòng thì bị chặn theo `room_id`.

Cùng script đối chiếu chạy lại trên Supabase ở bước 4 như **điều kiện báo xong**.

### 8.6 Quan hệ với nhánh G1–G5

Bốn nhánh G2–G5 song song, mỗi nhánh hơn `main` 30–35 commit (đo ngày 04/10). G2 thêm migration
`1789500000000`, G5 thêm `1789530000000`. **TypeORM từ chối một migration mới nếu timestamp cũ
hơn migration đã chạy trên DB.** Nên nếu migration phục hồi chạy lên Supabase trước, hai
migration của G2 và G5 sẽ bị từ chối.

- **Song song được ngay:** spec, plan và code khôi phục trên nhánh riêng.
- **Phải chờ G1–G5 vào `main` và chạy migration của chúng:** việc merge và việc chạy migration
  khôi phục lên Supabase.
- Chờ cũng có lợi: mỗi nhánh G sửa 7–11 file e2e. Khôi phục sửa cách các test dựng lớp/phiên
  một lần trên `main` thống nhất thay vì buộc 5 nhánh rebase.

---

## 9. `CLAUDE.md` phải sửa trong cùng đợt

Mục "Academic Structure & Ownership Model" đang ở rev 5 và nói thẳng điều ngược lại. Sửa
thành rev 6:
- **§0:** thay "hệ thống không quản lý dữ liệu nền" bằng nguyên tắc ở §0 của spec này; xoá
  danh sách "Cái giá đã chấp nhận".
- **§1.1 bảng hai loại dữ liệu:** tầng Tham chiếu = `Semester`, `Room`, `Class`
  (+ `AdministrativeClass`), `Student`, `Account`, `Enrollment`.
- **§1.2:** học kỳ lại là một **thực thể**, nhưng vẫn **không phải trạng thái** — giữ nguyên
  cấm `is_current` và cấm luật chặn thao tác theo kỳ. Sửa câu "Khái niệm kỳ hiện tại đã biến
  mất hẳn" cho khớp (học kỳ có ngày nhưng không có cờ).
- **§1.3:** sửa câu từ chối mặc định "catalog môn học, phân cấp nhiều tầng". Vẫn từ chối
  catalog môn học; chấp nhận Học kỳ/Phòng/Lớp danh nghĩa vì phiên thi và bộ lọc tiêu thụ chúng.
  Phép thử "trường biết hay giảng viên khai?" đổi thành "admin khai và kiểm chứng được?".
- **§2 hai role:** `admin` sở hữu thêm học kỳ, phòng, lớp (+ lớp danh nghĩa); `teacher` mất
  quyền tạo/sửa/xoá lớp, giữ roster, rubric, phiên thi, chấm điểm.
- Dòng `Course/Semester — DROPPED 2026-09-20` ở phần schema: viết lại.
- Bảng cây thư mục: `course/` thành module lớp + học kỳ + phòng.

Spec và plan cũ viết trước 04/10 nhắc `Semester`/`Room` như bảng bị xoá đều đang mô tả một
hệ thống đã không còn; ghi chú đầu `2026-09-20-master-data-scope-cut-design.md` trỏ về spec này.

---

## 10. Thứ tự thực hiện

Mỗi bước là điều kiện của bước sau.

0. **Điều kiện:** G1–G5 đã vào `main`, migration của chúng đã chạy; ghi đường cơ sở (số test
   unit + e2e).
1. **Refactor e2e, chưa đổi schema:** gom các câu `INSERT` SQL dựng lớp/phiên rải trong 33/62
   bộ e2e vào một helper seed duy nhất (đã có nửa chừng: `grading-seed.ts`, `open-session.ts`,
   `code-session-seed.ts`). Không đổi hành vi; e2e xanh trước và sau. Seed là SQL thô nên hỏng
   lúc **chạy**, không lúc biên dịch — kết luận "xong" phải dựa trên chạy trọn bộ e2e, không dựa
   vào `tsc`.
2. **Expand migration + entity + service** cho `semester`/`room`/`administrative_class`/
   `student`; route admin; bộ import dùng chung; view `class_label`.
3. **Web:** 3 trang admin, "Lớp của tôi" chỉ đọc, form tạo phiên, bộ lọc dùng chung, regenerate
   `schema.d.ts`.
4. **Backfill + diễn tập trên bản sao** (§8.5).
5. **Cutover trên Supabase** (§8.4 bước 0→4).
6. **Sửa `CLAUDE.md`** (cùng PR bước 2–3); **nghiệm thu bằng chấm thật** (§11 mục 5).

---

## 11. Test bắt buộc

| Mã | Ca | Mức |
|---|---|---|
| **T-MD-1** | `class` trỏ `administrative_class_id`/`semester_id` không tồn tại → DB từ chối | e2e |
| **T-MD-2** | Hai lớp cùng `(kỳ, mã, nhóm)` → chặn; `group_name = ''` **không** lọt khe NULL | e2e |
| **T-MD-3** | Mã `dhktpm18a ` và `DHKTPM18A` là cùng một mã | unit/e2e |
| **T-MD-4** | Lớp cuối dùng một mã bị xoá/đổi → mã mồ côi biến mất trong cùng giao dịch | e2e |
| **T-MD-5** | Không đổi được `semester_id` của lớp đã có phiên; lớp chưa có phiên thì đổi được | e2e |
| **T-MD-6** | Không đổi được `year`/`term` của học kỳ đã có lớp; đổi ngày thì được | e2e |
| **T-MD-7** | Hai học kỳ chồng ngày → DB từ chối | e2e |
| **T-MD-8** | Không xoá được học kỳ còn lớp, phòng đã có phiên, mã còn lớp — báo lý do cụ thể | e2e |
| **T-ROOM-1** | Hai phiên chưa kết thúc cùng `room_id`, giờ chồng → chặn (ràng buộc đã trở lại bảo đảm) | e2e |
| **T-ROOM-2** | Phòng `is_active = false` không chọn được cho phiên mới; phiên cũ vẫn tham chiếu được | e2e |
| **T-ROOM-3** | `room_name` bản chụp không đổi khi admin đổi tên phòng | e2e |
| **T-OWN-1** | Giảng viên gọi `POST/PATCH/DELETE /classes` → 403 | e2e |
| **T-OWN-2** | Giảng viên không tạo phiên cho lớp của giảng viên khác (kiểm hiện có, giữ) | e2e |
| **T-OWN-3** | Admin đổi giảng viên lớp: `enrollment.home_teacher_id` đổi; `exam_session.teacher_id` và `submission.home_teacher_id` của phiên cũ **không** đổi | e2e |
| **T-STU-1** | `GET /students/:mssv` trả tên đúng; không có route liệt kê | e2e |
| **T-STU-2** | Nhập tay MSSV đã có: tên bị khoá, không ghi đè được | e2e |
| **T-STU-3** | Import file tên khác: file thắng, kết quả liệt kê đổi tên | e2e |
| **T-STU-4** | Sinh viên học lại ở kỳ sau được nhập vào lớp kỳ mới (lỗi phạm vi "cùng môn" đã hết) | e2e |
| **T-STU-5** | Luồng xin phép: MSSV đã có thì **không** ghi đè tên bằng tên gõ | e2e |
| **T-IMP-1** | File có một dòng lỗi → không ghi gì, lỗi kèm số dòng | e2e |
| **T-IMP-2** | Import không bao giờ xoá, kể cả khi dòng "vắng" trong file | e2e |
| **T-IMP-3** | `dryRun` trả đúng thứ lần ghi thật sẽ làm; không ghi gì | e2e |
| **T-IMP-4** | Lớp tham chiếu học kỳ/giảng viên không tồn tại → dòng lỗi, **không** tự tạo | e2e |
| **T-IMP-5** | Mã lớp danh nghĩa mới hiện ở mục riêng, kèm cảnh báo gần giống | unit |
| **T-IMP-6** | Đổi giảng viên qua file hiện "A → B" ở bản xem trước | unit |
| **T-IMP-7** | Ô ngày mơ hồ bị từ chối; `yyyy-mm-dd` và `dd/mm/yyyy` được | unit |
| **T-FLT-1** | Lọc theo năm học, theo học kỳ, đổi năm học thì ô kỳ về "tất cả" | unit |
| **T-FLT-2** | Học kỳ chưa có phiên nào vẫn xuất hiện trong danh sách lọc | unit |
| **T-FLT-3** | Tạo phiên cho lớp của kỳ đã kết thúc vẫn được (bộ lọc không chặn) | e2e |
| **T-MIG-1** | Backfill dừng khi gặp chuỗi học kỳ/phòng/lớp không ánh xạ được | unit |
| **T-MIG-2** | Backfill chạy lại không đổi gì (idempotent) | e2e |
| **T-MIG-3** | Gộp lớp: đúng 45 + 45 + 9, không còn tham chiếu tới lớp đã xoá | e2e |
| **T-MIG-4** | Migration thu hẹp dừng khi còn FK NULL | unit |
| **T-GR-1** | Toàn bộ e2e chấm điểm hiện có xanh sau khi đổi helper seed | e2e |
| **T-GR-2** | Checksum điểm trước/sau migration giống hệt (diễn tập §8.5) | script |
| **T-GR-3** | Agent join + thi bù: ca hiện có chạy lại nguyên vẹn (sinh viên lớp khác vẫn `NOT_ENROLLED` rồi xin phép được) | e2e |

**Nghiệm thu bằng chấm thật (mục 5 của trình tự):** sau cutover chạy lại một lượt diễn tập
trên Railway với cùng kịch bản và cùng model, ghi vào lịch sử benchmark và so với lượt trước.
`eval/rehearsal/cli.ts:147` đang hardcode `roomName: 'TEST-KHONG-PHONG'` và `semesterName:
'TEST dien tap'`, phải đổi sang `roomId` và `classId`. Phòng diễn tập phải đang hoạt động, nên
tạo riêng "Phòng diễn tập" chỉ bật khi diễn tập — không dùng lại phòng đã ngừng.

---

## 12. Hệ quả đã biết, ghi ra chứ không giấu

1. **Giảng viên không còn tự tạo lớp được** — đảo lại thay đổi 21/09. Admin thành điểm nghẽn:
   không có admin thì không có lớp mới. Đây là lựa chọn có ý thức.
2. **Mã lớp danh nghĩa vẫn do người gõ** lần đầu (§2.2). Cảnh báo gần giống giảm xác suất sai,
   không loại bỏ.
3. **Một sinh viên chỉ có một tên.** Một file Excel sai tên của một giảng viên đổi tên ở mọi lớp.
   Giảm nhẹ: kết quả import liệt kê rõ ai bị đổi tên.
4. **Lịch sử của `DHKTPM18ATT` có phiên chồng giờ** sau gộp lớp MongoDB (§8.3). Không hỏng
   ràng buộc nào, nhưng nhìn thấy được.
5. **Bước thu hẹp không đảo ngược được.** Đường lùi duy nhất là bản dump + deploy lại tag.
6. **Phải chờ G1–G5** trước khi chạy migration lên Supabase (§8.6).
7. **Admin có thêm việc trước mỗi kỳ:** tạo học kỳ, tạo lớp và giao giảng viên. Import giảm
   gánh nặng nhưng không bỏ.
8. **Ngày học kỳ tạm** (§8.2) có thể sai cho tới khi admin sửa. Không ảnh hưởng dữ liệu nào
   (chỉ chồng ngày với kỳ khác mới bị chặn).

---

## 13. Điểm mở — kiểm khi viết plan

1. Trigger trên `submission`/`session_roster` có cho ghi lại `home_class_id` không (§8.3).
2. Cơ chế ép "không đổi kỳ của lớp đã có phiên" và "không đổi `year`/`term` khi đã có lớp":
   trigger hay khoá ngoại ghép.
3. Giới hạn tốc độ cho `GET /students/:mssv`.
4. Hành vi `enrollments.addManually` (luồng xin phép) với quy tắc "một sinh viên một lớp mỗi kỳ".
5. Agent Electron hiển thị gì từ ack (`JoinScreen`, `DetailView`): giao thức không đổi, nhưng
   kiểm xem nhãn lớp nào đi qua.
6. Cách `readWorkbook` trả ô ngày Excel (§6.3).
7. `GET /accounts/teachers` đã đủ cho combobox giảng viên của admin chưa (dòng 28 của
   controller còn comment cũ nhắc "Trưởng khoa" — stale, sửa kèm).

---

## 14. Liên quan

- `2026-09-20-master-data-scope-cut-design.md` — bị thay thế một phần (xem đầu file).
- `docs/superpowers/plans/2026-09-29-g2-g5-parallel-execution.md` — thứ tự với G1–G5 (§8.6).
- `CLAUDE.md` mục "Academic Structure & Ownership Model" — sửa theo §9.
- Memory: `examcollect-scope-pivot-2026-09-20` ("master data là ngoài phạm vi") — đã bị đảo một phần.
