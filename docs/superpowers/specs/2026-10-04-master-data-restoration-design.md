# Khôi phục master data có phân tầng — thiết kế

> **Cập nhật 2026-10-05** sau khi một bản review ngoài được kiểm với code và bốn quyết định của
> chủ đồ án: (1) chống nhầm phòng chỉ bằng cảnh báo "gần giống", không thêm cột mã ngoài; (2) Danh
> mục lớp danh nghĩa nhập trước, form lớp chỉ chọn (§2.2); (3) kênh "yêu cầu admin" để sau (§1.2);
> (4) **sửa và huỷ phiên thi vào đợt này** (§4.1), cùng trang đọc audit log (§4.2) và chữ màn trống
> (§5.2). Hai quyết định mở còn lại ở §13 mục 9 và 12.

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
| Admin quản lý: học kỳ, phòng, lớp, và **Danh mục lớp danh nghĩa** (nhập trước, form lớp chỉ chọn) | §2.2, §4, §5 |
| Mọi loại nhập được thủ công **và** import; cảnh báo "gần giống" cho phòng mới và mã lớp danh nghĩa mới | §6 |
| **Sửa và huỷ phiên thi** của giảng viên, trước giờ bắt đầu (hôm nay không có route nào) | §4.1 |
| **Trang đọc `audit_log`** của admin, đi cùng đợt phát hành với các trang ghi dữ liệu nền | §4.2 |
| Chữ ở màn trống của giảng viên: "chưa có lớp nào được giao cho bạn" thay cho lời mời tạo lớp | §5.2 |
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
- **Kênh "yêu cầu admin" cho giảng viên** — để sau (quyết định 05/10). Gồm: hộp thư yêu cầu, nút
  `mailto:` kèm danh sách admin, huy hiệu "Mới" trên lớp mới được giao, thẻ "Lớp được giao" ở
  dashboard. Hệ thống không có hạ tầng email hay thông báo nào (đã kiểm: không có thư viện
  gửi thư, không có trung tâm thông báo trong web); khi cần, giảng viên và admin liên lạc ngoài
  hệ thống như hôm nay. Chỉ phần **chữ ở màn trống** (§5.2) nằm trong đợt này.
- **Cột mã ngoài `external_code` cho phòng** — không làm (quyết định 05/10). Chống nhầm phòng
  chỉ bằng cảnh báo "gần giống" (§6.2 nguyên tắc 4).
- **Sửa file bắt buộc nộp, đổi lớp của phiên, và đổi phòng hay giờ SAU khi phiên đã bắt đầu**
  (§4.1). Phiên sai lớp hoặc sai file bắt buộc thì huỷ và tạo lại.

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

Lưu thành bảng riêng để DB kiểm chứng sự tồn tại và chống trùng. Bảng này là một **danh
mục do admin quản lý** ("Danh mục lớp danh nghĩa"), nhập **trước** khi tạo lớp. Giảng viên
không có trang, route hay bộ lọc riêng cho nó (§4, §5); họ chỉ thấy nhãn gộp (§2.5).

Quy tắc (cập nhật 05/10, thay cho bản "tạo mã ngay trong form lớp"):
- **Mã chỉ được tạo trong Danh mục:** nhập từ file (`dryRun`, §6) hoặc thêm một mã bằng tay
  (ô gõ duy nhất còn lại, có cảnh báo gần giống). **Form tạo/sửa lớp và import lớp chỉ chọn
  hoặc tham chiếu** mã đã có; mã chưa có → lỗi cụ thể: "Mã DHKTPM18C chưa có trong Danh mục
  lớp danh nghĩa, hãy thêm nó vào Danh mục trước."
- Mã được **viết hoa và cắt khoảng trắng** ở tầng ghi; `CHECK` ép lại ở DB.
- **Bỏ "mã mồ côi tự dọn":** mã được nhập trước khi có lớp nào dùng, nên "chưa có lớp" là trạng
  thái bình thường chứ không phải rác. Thay bằng: xoá một mã chỉ được khi **không lớp nào dùng
  nó** (`ON DELETE RESTRICT`), và giao diện báo lý do cụ thể kèm số lớp đang dùng.
- **Sửa một mã gõ nhầm** là sửa `code` của đúng một dòng danh mục; mọi lớp dùng nó đổi nhãn
  theo, kể cả lớp của kỳ cũ (nhãn lớp là biểu thức, không phải bản chụp, §2.5; không bảng nào
  lưu sẵn nhãn lớp). Đó là mục đích của việc sửa lỗi gõ.
- **Cảnh báo gõ gần giống** khi thêm tay hoặc import một mã mới so với mã đã có và so với
  chính các dòng khác trong file (chuẩn hoá bỏ khoảng trắng, dấu chấm, gạch ngang rồi so;
  hoặc khoảng cách chỉnh sửa ≤ 2). Danh mục chỉ vài chục dòng nên so trên trình duyệt và lặp lại
  ở server, không thêm hạ tầng.

> **Giới hạn nói thẳng:** hệ thống vẫn không biết trường thực sự có những mã lớp nào. Danh mục
> đúng đến mức file hoặc danh sách admin lấy từ cổng đào tạo đúng. Cái được: lỗi gõ chuyển
> thành lỗi sao chép, xảy ra **một lần cho cả danh mục** thay vì mỗi lần tạo lớp, và form lớp
> không còn ô gõ tự do. Cái mất: khi trường mở lớp mới giữa kỳ, admin phải thêm mã vào Danh mục
> trước rồi mới tạo lớp được. Nếu cổng đào tạo không xuất được file, admin vẫn phải gõ hoặc dán
> danh sách một lần.

### 2.3 `class` (lớp học phần)

```
semester_id             uuid NOT NULL FK -> semester             ON DELETE RESTRICT
administrative_class_id uuid NOT NULL FK -> administrative_class ON DELETE RESTRICT
group_name   varchar(50) NOT NULL DEFAULT ''     -- vd "Nhóm 1"; '' khi không tách nhóm
teacher_id   uuid NOT NULL FK -> account         ON DELETE RESTRICT   (giữ)

unique(semester_id, administrative_class_id, group_name)    -- uq_class_semester_admin_group

- name        varchar(100)     -- bỏ; thay bằng nhãn tính ra (§2.5)
- unique index uq_class_teacher_course_name (teacher_id, course_name, name)
  -- phải DROP tường minh trước khi tạo chỉ mục thay thế
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
  ex_exam_session_class_overlap, ex_exam_session_teacher_gap: GIỮ NGUYÊN
```

Cả hai ràng buộc `ex_exam_session_*_overlap` chỉ áp cho phiên **chưa kết thúc**: predicate loại
`collecting`, `completed` và `cancelled`. `ex_exam_session_teacher_gap` (khoảng cách ≥ 30 phút giữa
hai phiên của một giảng viên, migration `1789350000000`) không dính cột nào đổi trong đợt này;
migration thu hẹp **không được tạo lại hay làm mất** nó.

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

- Tên sinh viên nằm **một chỗ duy nhất**. **Sáu file** đang đọc hoặc ghi bảng `enrollment` kèm
  tên sinh viên và phải chuyển sang đọc/ghi qua `student`:
  `attendance.service` (đọc), `session-roster.service` (đọc lúc đóng băng), `roster.service`
  (đọc và ghi), `enrollment.service` (ghi), và **hai nơi dùng SQL thô** —
  `recollect.service.ts` (`e.student_name`, dòng ~70) và `submission-overview.service.ts`
  (`e.student_name`, dòng ~73). Hai nơi SQL thô **hỏng lúc chạy chứ không lúc biên dịch** sau khi
  migration thu hẹp bỏ cột, nên có test riêng (T-RW-1, T-RW-2).
- `session_roster.student_name` **giữ nguyên** — là ảnh chụp tên lúc thi. Agent join
  (`exam-session.gateway.ts` đọc qua `sessionRoster.findEntry`, biến tên `enrollment` ở đó thực
  ra là `SessionRosterEntity`) và bài nộp đọc từ đó, nên **không bị ảnh hưởng**.
- **Khi nhập tay một MSSV đã có:** tên được điền sẵn và **khoá**; giảng viên không sửa
  được tên qua ô này. MSSV chưa có thì bắt buộc nhập tên.
- **Khi file Excel ghi tên khác tên đã lưu:** file mới nhất thắng, và kết quả import **liệt
  kê rõ ai bị đổi tên** (không đổi âm thầm). Đổi tên áp dụng cho mọi lớp vì chỉ có một tên.
- **Luồng xin phép thi bù** (`access-request.gateway.ts`) gọi `enrollments.addManually` với tên
  sinh viên tự gõ. Sau đợt này: MSSV đã có trong `student` → dùng tên đã lưu, **không ghi đè**
  bằng tên gõ; MSSV chưa có → tạo `student` bằng tên gõ.
- **Tra tên:** `GET /students/:mssv` trả `{ mssv, fullName }` hoặc 404, **chỉ theo đúng một
  MSSV**. Không có route liệt kê sinh viên cho giảng viên (không ai dò được danh sách người khác).
  **Bắt buộc** có giới hạn tốc độ theo người gọi (mức do plan chốt) — nếu không, một giảng
  viên có thể quét toàn bộ MSSV để lấy tên.
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
| Lớp danh nghĩa (Danh mục, §2.2) | `GET /administrative-classes` (kèm số lớp đang dùng; nguồn của ô chọn trong form lớp) | admin |
| | `POST`, `PATCH /:id`, `DELETE /:id` (xoá chỉ khi không lớp nào dùng) | admin |
| | `POST /administrative-classes/import` (`dryRun`) | admin |
| Phiên thi (§4.1) | `PATCH /exam-sessions/:id` (sửa trước giờ bắt đầu) | teacher, chủ phiên |
| | `POST /exam-sessions/:id/cancel` | teacher, chủ phiên |
| Audit (§4.2) | `GET /audit-log` | admin |
| Danh sách sinh viên của lớp | `GET/POST /classes/:id/roster…` (các route hiện có) | teacher (có kiểm `class.teacher_id`) |
| Sinh viên | `GET /students/:mssv` | teacher |
| Tài khoản | `GET /accounts/teachers` (đã có) | admin |

- `POST/PATCH /classes` và `POST /classes/import` **không tạo mã lớp danh nghĩa**: nhận
  `administrativeClassId` (hoặc mã, tra trong Danh mục) và trả lỗi cụ thể khi mã chưa có (§2.2).
- `GET /exam-sessions` thay tham số `semesterName` bằng `semesterId`/`academicYear`; trường
  phản hồi `semesterNames` **bị bỏ** (danh sách lựa chọn lấy từ `GET /semesters`). Mỗi dòng
  phản hồi thêm `semesterId`, `academicYear`, `term`, `classLabel`.
- `POST /exam-sessions` nhận `roomId` (thay `roomName`), **bỏ `semesterName`** khỏi body — suy
  từ lớp. Phòng phải `is_active`; lớp phải thuộc giảng viên gọi (kiểm hiện có).
- `schedule-conflict.service.ts` nhận `roomId` + tên để dựng câu báo lỗi đọc được.
- Mọi thao tác ghi dữ liệu nền của admin (tạo/sửa/xoá thủ công, mỗi lần xác nhận import)
  ghi `audit_log`. Roster của giảng viên vẫn **không** audit (như quyết định hiện tại).

### 4.1 Sửa và huỷ phiên thi

**Vấn đề (đo 05/10, không phải suy đoán).** `ExamSessionController` có 19 route và **không có
route nào sửa hay huỷ một phiên**; admin chỉ có `PATCH /exam-sessions/:id/teacher` (chuyển
chủ). Ngày thi mà phòng bị đổi hay lớp nhầm giờ, giảng viên chỉ còn tạo phiên mới, nhưng phiên
cũ vẫn `active` và giữ phòng, lớp và quãng "giãn cách 30 phút" của họ (ba ràng buộc exclusion
chỉ bỏ qua `collecting`, `completed`, `cancelled`) nên phiên mới bị 409. Lối vòng có tồn tại
("Chốt bài ngay" đưa phiên sang `collecting` và nhả các ràng buộc) nhưng không ai biết và nó
kích hoạt luồng nộp bài.

**Hạ tầng đã có, chỉ thiếu chỗ ghi.** Giá trị `cancelled` có sẵn trong enum; ba ràng buộc và
`ScheduleConflictService` đã bỏ qua nó; DTO tìm kiếm nhận `status = cancelled`; web đã có nhánh
`cancelled` ở phòng chờ ("Đã huỷ") và ở bộ chọn phiên khi gắn đề; `attach` và nộp bài đã từ chối
phiên `cancelled`. Hiện **không code nào ghi** giá trị này.

**Route.**

| Route | Ai | Làm gì |
|---|---|---|
| `PATCH /exam-sessions/:id` | teacher, chủ phiên | Sửa `name`, `roomId`, `startTime`, `endTime`, `examType` (mọi trường tuỳ chọn) |
| `POST /exam-sessions/:id/cancel` | teacher, chủ phiên | Chuyển `active` → `cancelled` |

**Cửa sổ cho phép sửa:** `status = 'active'` **và** `now < start_time`. Trong cửa sổ này chắc
chắn chưa ai vào phòng, vì `agent:join` chỉ nhận sau `start_time`. Ngoài cửa sổ: 409 kèm câu "Phiên
đã bắt đầu, không sửa được. Nếu chưa ai vào phòng bạn vẫn huỷ được."

> **Vì sao không cho đổi phòng sau khi bắt đầu.** Tên phòng được dựng vào tên file ở **hai
> thời điểm**: lúc vào phòng (`{PHONG}` trong `agent:join:ack`, `exam-session.gateway.ts:477`) và
> lúc nộp (`snapshotArchiveExpectations` lấy `session.roomName` hiện tại để dựng danh sách kỳ
> vọng bên trong file nén, `submission.service.ts:196`). Đổi phòng giữa hai thời điểm khiến
> sinh viên đã vào dưới phòng cũ bị kiểm file nén lệch oan với mẫu có `{PHONG}`.

**Quy tắc sửa.**
- Không sửa được: lớp của phiên, danh sách file bắt buộc nộp, giảng viên (việc của admin), học kỳ
  (suy từ lớp), `rubricId` (đã có route riêng). Phiên sai lớp hoặc sai file bắt buộc thì **huỷ và
  tạo lại**.
- Dùng chung lớp kiểm tra thời gian của tạo phiên (tối thiểu 15 phút, lùi giờ bắt đầu tối đa 30
  phút, giảng viên cách nhau 30 phút) và `ScheduleConflictService.assertNone`, thêm tham số
  `excludeSessionId` để **loại chính phiên đang sửa** (hôm nay chữ ký không có tham số này, nên
  sửa sẽ tự va chạm với chính nó). Ràng buộc exclusion của DB vẫn là thẩm quyền cuối: `UPDATE`
  kích hoạt lại chúng, vi phạm → 23P01 → 409 qua `PostgresExceptionFilter`.
- Đổi `roomId`: phòng mới phải `is_active`; cột chụp `room_name` cập nhật **trong cùng giao dịch**
  (cột này không mang `update: false`; `semester_name` thì có và không đổi).
- Đổi giờ: kiểm tra trên cặp `(startTime, endTime)` **sau khi sửa**, kể cả khi chỉ gửi một
  trong hai đầu (đầu còn lại lấy từ bản ghi hiện có). Danh sách dự thi đã đóng băng (nếu giảng
  viên đã bấm "Mở phiên thi") không phụ thuộc giờ nên được giữ nguyên.

**Huỷ.** Điều kiện: `status = 'active'` **và** chưa có dòng `agent_connection_event` nào của phiên
**và** chưa có bài `collected`. Thoả → `status = 'cancelled'`; không thoả (đã có người vào) →
409 "Đã có sinh viên vào phòng, hãy Chốt bài ngay rồi Xác nhận kết thúc". Sau khi huỷ: phòng, lớp
và quãng giãn cách được nhả (ràng buộc bỏ qua `cancelled`); `agent:join` trả `SESSION_NOT_ACTIVE`
(đã có); phiên **không khôi phục được** (muốn thi thì tạo phiên mới). Các dòng `session_roster`
và `submission not_submitted` đã gieo nếu giảng viên từng "Mở phiên thi" được **giữ nguyên**
(vô hại, và xoá chúng chỉ thêm rủi ro). Không thêm cột `cancelled_at`/`cancelled_by`: ai huỷ,
khi nào và lý do nằm trong `audit_log` (một lý do nữa để §4.2 đi cùng đợt).

**Audit.** `exam_session.update` (giá trị cũ và mới của đúng các trường đổi) và
`exam_session.cancel`, ghi cùng giao dịch với thay đổi.

**Giao diện.** Ở `/teacher/exam-sessions`, mỗi hàng thêm "Sửa" và "Huỷ phiên", chỉ bật khi đủ
điều kiện (khi không đủ thì **ẩn kèm lý do trong tooltip**, không để nút bấm rồi mới báo 409).
Trang `/teacher/exam-sessions/[id]/edit` dùng lại form tạo, khoá các ô lớp và file bắt buộc. "Huỷ
phiên" mở hộp thoại xác nhận nêu hậu quả ("Phiên sẽ không khôi phục được; sinh viên không vào
được nữa").

**Quyết định mở (cần chủ đồ án xác nhận).** Spec chọn cửa sổ **trước giờ bắt đầu** vì đó là cách
duy nhất tránh được lỗi `{PHONG}` ở trên mà không thêm logic. Phương án B: cho đổi **chỉ phòng**
sau khi bắt đầu nếu không file bắt buộc nào dùng `{PHONG}` trong tên hoặc trong mục bên trong.
B phục vụ "đổi phòng giữa giờ" nhưng thêm một nhánh kiểm tra và một tập test; chưa chọn.

### 4.2 Trang đọc `audit_log`

**Vì sao đi cùng đợt này.** Đợt này thêm 17 hành động ghi của admin (4 loại đối tượng) và hai
hành động sửa phiên của giảng viên vào `audit_log`, trong khi bảng **không có API hay màn hình đọc** (trang
`/admin/audit-log` là `PlaceholderPage`, `apps/api/src/admin` không có controller). DB hiện có 2
dòng. Ghi mà không đọc được thì không có giá trị điều tra.

**Phạm vi.** Một task **riêng** trong cùng đợt phát hành, không trộn vào migration hay PR
cutover (phần đọc không đổi schema và độc lập hoàn toàn). Hoàn thành **trước hoặc cùng lúc** với
các trang admin ghi dữ liệu nền, để những lần ghi đầu tiên đã đọc được.

- `GET /audit-log` (admin): lọc `action` (khớp chính xác hoặc theo tiền tố, ví dụ `room.`),
  `actorId`, `targetType`, `from`, `to`; phân trang theo `occurred_at` giảm dần. Trả `{id,
  occurredAt, actor{id, name, email}, action, targetType, targetId, oldValue, newValue}`; hai giá
  trị jsonb cắt ở 4 KB mỗi trường trong danh sách. Chỉ mục có sẵn đủ dùng:
  `(action, occurred_at)`, `(actor_id, occurred_at)`, `(target_type, target_id, occurred_at)`;
  truy vấn chỉ theo khoảng ngày không có chỉ mục riêng, chấp nhận với bảng nhỏ (ghi vào điểm mở §13).
- Trang `/admin/audit-log` thay placeholder: bảng có lọc theo nhóm hành động (dữ liệu nền, phiên
  thi, chấm điểm), người thực hiện, khoảng ngày; mỗi dòng đọc được bằng tiếng Việt ("Admin A đổi
  phòng H3.03: sức chứa 40 → 45"), suy từ `action` và hai giá trị.
- **Quy ước tên hành động** theo kiểu hiện có (`<loại đối tượng>.<động từ>`): `semester.create|
  update|delete|import`, `room.create|update|delete|import`, `class.create|update|delete|import|
  reassign_teacher`, `administrative_class.create|update|delete|import`, `exam_session.update`,
  `exam_session.cancel`, cộng 5 hành động đã có. Mỗi lần **xác nhận import** ghi **một** dòng với
  `new_value = {added, updated, unchanged}`; vì `target_id` là `NOT NULL uuid`, dùng một UUID mới
  sinh cho lô import làm `target_id`.
- Chỉ `admin` đọc được (teacher → 403).

> **Nói thẳng về giá trị.** Với **một** admin, người đọc audit cũng là người bị audit; trang này
> **không** là biện pháp kiểm soát quyền. Giá trị thật ở quy mô này là điều tra sự cố ("ai đổi
> phòng này, khi nào?") và đối chiếu khi giảng viên và admin nói khác nhau. Không nên mô tả nó
> như đối trọng quyền lực trong báo cáo.

---

## 5. Thay đổi web

### 5.1 Admin — 3 trang mới, 1 hộp thoại, 1 trang thay placeholder

| Trang | Nội dung |
|---|---|
| **Học kỳ** | Nhóm theo năm học; thêm/sửa/xoá; nhập từ file |
| **Phòng thi** | Danh sách có ô tìm; thêm/sửa/bật-tắt hoạt động/xoá; nhập từ file |
| **Lớp** | Lọc năm học, học kỳ, giảng viên + tìm mã lớp. Form 4 ô: học kỳ, **lớp danh nghĩa (ô chọn, không gõ)**, nhóm, giảng viên. Nhập từ file. Nút **"Danh mục lớp danh nghĩa"** mở hộp thoại (xem dưới) |
| **Audit log** | Thay `PlaceholderPage` hiện có (§4.2); không phải mục menu mới |

**Danh mục lớp danh nghĩa** (hộp thoại trong trang Lớp, chỉ admin): bảng mã kèm số lớp đang dùng;
thêm một mã (ô gõ duy nhất, cảnh báo "gần giống" khi trùng chuẩn hoá); nhập từ file (§6); sửa mã;
xoá mã (chặn kèm lý do nếu còn lớp dùng). Nếu danh mục **trống**, form tạo lớp hiện lời chỉ
đường "Chưa có mã lớp danh nghĩa nào. Hãy thêm vào Danh mục lớp danh nghĩa trước." kèm nút mở
hộp thoại. Không có trang riêng, nên giảng viên và các màn hình khác không bao giờ thấy "hai
thứ".

Giao diện lấy lại từ `admin/semesters`, `admin/rooms`, `department/classes` ở `3cf4688`.
Thêm 3 mục vào `nav-config.ts` cho admin (mục Audit log đã có). Không xoá được dữ liệu đang được
dùng (học kỳ còn lớp, phòng đã có phiên, mã còn lớp, …): DB chặn, và trang báo **lý do cụ thể**
thay vì lỗi thô.

### 5.2 Giảng viên

- **Lớp của tôi:** trở về **chỉ đọc**, có bộ lọc năm học + học kỳ. Gỡ `class-form-dialog.tsx`
  và `delete-class-dialog.tsx` (thêm 21/09); form được chuyển sang trang admin.
- **Danh sách sinh viên của lớp:** giữ tải file + thêm tay; ô thêm tay gõ MSSV là tự hiện
  tên (§2.6).
- **Form tạo phiên:** lớp chọn từ danh sách lớp được giao, hiện nhãn gộp `DHKTPM18A – Nhóm 1
  · HK1 2026-2027`; phòng chọn từ phòng đang hoạt động; học kỳ hiện **chỉ để xem**, lấy từ lớp.
  Không còn ô gõ chữ nào cho phòng hay học kỳ.
- **Chữ ở màn trống (đã kiểm: hôm nay các chỗ này mời giảng viên TẠO lớp, trở thành sai):**
  - `teacher/classes/page.tsx:91-92`: tiêu đề "Bạn chưa có lớp nào", mô tả "Tạo lớp và nhập danh
    sách sinh viên — chưa có lớp thì chưa tạo được phiên thi" → tiêu đề **"Chưa có lớp nào được
    giao cho bạn"**, mô tả **"Lớp do quản trị viên tạo và giao cho bạn. Khi có lớp mới, nó sẽ hiện
    ở đây."** Không còn nút tạo lớp.
  - `teacher/exam-sessions/new/page.tsx:283`: "Bạn chưa có lớp nào. Tạo lớp…" → **"Bạn chưa có lớp
    nào được giao nên chưa tạo được phiên thi."** (không có liên kết tới trang tạo lớp).
  - Không có nút liên hệ admin hay thông báo ở đợt này (§1.2).
- **Sửa và huỷ phiên** (§4.1): hành động "Sửa" và "Huỷ phiên" ở danh sách phiên, trang
  `/teacher/exam-sessions/[id]/edit`, banner "Đã huỷ" ở phòng chờ (nhánh có sẵn).

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
| Phòng thi | tên phòng | tên, sức chứa | Nơi import có giá trị nhất. Khoá là **tên**, nên đổi tên bằng file thành một phòng mới: bản xem trước phải cảnh báo "gần giống" (nguyên tắc 4); muốn đổi tên một phòng thì sửa thủ công |
| Học kỳ | năm học + kỳ | năm học, kỳ, ngày bắt đầu, ngày kết thúc | Phải kiểm không chồng ngày, trong file lẫn với dữ liệu có sẵn |
| **Lớp danh nghĩa** (Danh mục, §2.2) | mã | một cột: mã | Chỉ thêm; không sửa, không xoá bằng file. Cảnh báo gần giống với mã có sẵn và giữa các dòng trong file |
| Lớp | học kỳ + mã lớp danh nghĩa + nhóm | học kỳ, mã lớp danh nghĩa, nhóm, email giảng viên | Học kỳ, **mã lớp danh nghĩa** và giảng viên phải **đã tồn tại**, thiếu thì dòng đó lỗi (không tự tạo). Lỗi nêu mã nào thiếu và chỉ tới Danh mục |
| Sinh viên | MSSV | MSSV, họ tên | Của giảng viên; chỉ đổi nơi ghi sang `student` |

Phụ thuộc: Danh mục lớp danh nghĩa và học kỳ → lớp; phòng độc lập. Khi thiếu, giao diện báo rõ
("chưa có học kỳ HK1 2026-2027, hãy tạo học kỳ trước"; "mã DHKTPM18C chưa có trong Danh mục").

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
4. **Mục "mới" luôn hiện riêng ở bản xem trước, kèm cảnh báo "gần giống".** Áp dụng cho **phòng
   mới** và **mã lớp danh nghĩa mới** (không áp cho học kỳ, vì khoá năm học + kỳ rất hẹp). Mỗi
   mục mới được so với mục có sẵn **và** với các dòng khác trong file, sau khi chuẩn hoá (bỏ khoảng
   trắng, dấu chấm, gạch ngang, hoa-thường) hoặc khoảng cách chỉnh sửa ≤ 2; mục gần giống hiện
   bên cạnh mục có sẵn để so ("Phòng H3.03 (mới) gần giống H3.03 (đã có)"). Nút xác nhận chỉ bật
   khi admin **tick xác nhận** cho nhóm mục gần giống. Đây là câu trả lời cho rủi ro "đổi tên
   phòng bằng file sẽ thành phòng mới": hệ thống **không ngăn** được (không biết đó là một phòng),
   nhưng nói rõ trước khi ghi. Không thêm cột mã ngoài (§1.2).
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
JSON các dòng; server kiểm lại mọi dòng. Trần dòng: học kỳ 20, phòng 500, lớp 200, Danh mục lớp
danh nghĩa 500.

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
  làm hỏng `ex_exam_session_class_overlap` vì ràng buộc đó chỉ áp cho phiên chưa kết thúc
  (predicate loại `collecting`, `completed`, `cancelled`), mà cả 29 phiên đều `completed` —
  nhưng lịch sử của `DHKTPM18ATT` sau gộp sẽ có các phiên chồng giờ.
  (Một lần đo trước đó trong cuộc brainstorm báo "0 cặp" là **vô nghĩa** vì lọc theo trạng
  thái loại bỏ mọi phiên; số đúng là 6.)
- **Đã kiểm (04/10):** không trigger nào chặn việc ghi lại `home_class_id`. Trên `submission`
  chỉ có `trg_submission_lifecycle`, và hàm `validate_submission_lifecycle` chỉ kiểm chuyển trạng
  thái khi `status` đổi; trên `session_roster` chỉ có `trg_session_roster_updated_at`. Lượt
  diễn tập trên bản sao (§8.5) vẫn là bằng chứng cuối.

Phương án khác: giữ lớp riêng và bỏ quy tắc "mỗi sinh viên một lớp mỗi kỳ" — nhưng như vậy một
lớp đặt theo tên môn vẫn nằm trong master data. Spec chọn gộp.

### 8.4 Trình tự (expand → backfill → contract)

Cần tách vì migration chạy tay, DB dùng chung, và code deploy riêng. Mỗi trạng thái trung
gian đều chạy được.

0. **Sao lưu.** `pg_dump` DB Supabase (vài trăm dòng, vài giây) + tag git
   `pre-master-data-restore` vào `4cb6bca`. Bước cuối **không đảo ngược được** (`down()` ném
   lỗi, như `ContractMasterData`, dòng 137). Đường lùi duy nhất: khôi phục bản dump + deploy tag.
0b. **Đối soát lịch sử migration TRƯỚC khi chạy bất kỳ migration nào** (phát hiện 05/10, sau
   khi spec được review). Repo có 48 file migration nhưng bảng `examcollect.migrations` trên
   Supabase chỉ có **46** dòng: `1789360000000-AddAiUsage` và `1789400000000-AddArchiveContentCheck`
   **không có dòng**, dù bảng `ai_usage`, bảng `required_deliverable_entry` và kiểu
   `archive_check_status` đã tồn tại (được áp bằng đường khác). Cả hai migration dùng
   `CREATE TABLE`/`CREATE TYPE`/`ADD COLUMN` trần, không `IF NOT EXISTS`, nên `pnpm migration:run`
   sẽ coi chúng là chưa áp và **dừng ở `AddAiUsage` với lỗi "đã tồn tại"**, chặn mọi migration
   sau đó, kể cả migration của spec này và của G2, G5 (suy luận từ nội dung file và trạng thái DB;
   chưa chạy, vì chạy sẽ ghi vào DB dùng chung). Xử lý: sau khi `pg_dump`, xác nhận từng đối tượng
   khớp với nội dung migration (cột, kiểu, ràng buộc, chỉ mục), rồi thêm hai dòng vào
   `migrations` (tương đương `--fake`) và chạy `migration:run` lên một **bản sao** DB để kiểm
   trước khi chạy lên Supabase. Đưa thao tác này vào script đối chiếu của §8.5.
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
`1789500000000` (cột trên `grading_reference`), G5 thêm `1789530000000` (bảng `grade_export_row`).

**Không có ràng buộc kỹ thuật bắt chờ**, và bản nháp đầu của spec này từng nói ngược lại một cách
sai: TypeORM 0.3.31 (bản đang cài) đã **comment out** kiểm tra "migration mới không được cũ hơn
migration đã chạy" (`MigrationExecutor.js:160-161`), nên thứ tự timestamp không chặn gì. Đã kiểm
thêm: không nhánh G nào đọc `enrollment.student_name`, `class.name`, `room_name` hay
`semester_name` (G5 chỉ đọc bản chụp `session_roster`).

Vẫn **khuyến nghị** để G1–G5 vào `main` trước, vì hai lý do còn lại là thật:
- **Chi phí merge:** mỗi nhánh G sửa 7–11 file e2e. Refactor helper seed (§10 bước 1) chạm 34 bộ;
  làm trước thì buộc 5 nhánh rebase; làm sau thì sửa một lần trên `main` thống nhất.
- **Một cửa sổ bảo trì:** cutover (§8.4) kéo theo một lần deploy Railway + Vercel; gộp được với
  lần deploy của G1–G5 thì chỉ một lần gián đoạn.

Timestamp của migration phục hồi vẫn đặt **sau mọi migration của G1–G5** để lịch sử tuyến tính,
dù TypeORM không đòi. **Song song được ngay:** spec, plan và code khôi phục trên nhánh riêng.

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
- **§2 hai role:** `admin` sở hữu thêm học kỳ, phòng, lớp và Danh mục lớp danh nghĩa, và **đọc
  được `audit_log`** (vẫn không tạo phiên, không xem bài, không chấm); `teacher` mất quyền tạo/sửa/xoá lớp, giữ roster, rubric,
  phiên thi, chấm điểm, và **được sửa và huỷ phiên của mình trước giờ bắt đầu** (§4.1).
- **Luật quản lý phiên:** thêm vào phần phiên thi: sửa và huỷ chỉ khi `status = active` và
  `now < start_time` (huỷ thêm điều kiện chưa ai vào phòng); `cancelled` là trạng thái **có người
  ghi** từ nay, không còn là giá trị chết.
- Dòng `Course/Semester — DROPPED 2026-09-20` ở phần schema: viết lại.
- Bảng cây thư mục: `course/` thành module lớp + học kỳ + phòng.

Spec và plan cũ viết trước 04/10 nhắc `Semester`/`Room` như bảng bị xoá đều đang mô tả một
hệ thống đã không còn; ghi chú đầu `2026-09-20-master-data-scope-cut-design.md` trỏ về spec này.

---

## 10. Thứ tự thực hiện

Mỗi bước là điều kiện của bước sau.

0. **Khuyến nghị (không phải ràng buộc kỹ thuật, xem §8.6):** G1–G5 đã vào `main`, migration
   của chúng đã chạy; ghi đường cơ sở (số test unit + e2e).
1. **Refactor e2e, chưa đổi schema:** gom các câu `INSERT` SQL dựng lớp/phiên/enrollment rải
   trong **34/62** bộ e2e (đếm bằng `INSERT INTO examcollect.(class|exam_session|enrollment)`,
   cộng 1 file helper) vào một helper seed duy nhất (đã có nửa chừng: `grading-seed.ts`, `open-session.ts`,
   `code-session-seed.ts`). Không đổi hành vi; e2e xanh trước và sau. Seed là SQL thô nên hỏng
   lúc **chạy**, không lúc biên dịch — kết luận "xong" phải dựa trên chạy trọn bộ e2e, không dựa
   vào `tsc`.
2. **Expand migration + entity + service** cho `semester`/`room`/`administrative_class`/
   `student`; route admin; bộ import dùng chung; view `class_label`.
3. **Web:** 3 trang admin và hộp thoại Danh mục lớp danh nghĩa, "Lớp của tôi" chỉ đọc kèm chữ màn
   trống mới (§5.2), form tạo phiên, bộ lọc dùng chung, regenerate `schema.d.ts`.
3b. **Trang đọc audit log** (§4.2): **task riêng**, không trộn vào PR cutover. Xong trước hoặc
   cùng lúc với bước 3 lên môi trường dùng thật, để những lần ghi dữ liệu nền đầu tiên đã đọc được.
3c. **Sửa và huỷ phiên thi** (§4.1): sau bước 2 (cần `room_id` và `ScheduleConflictService` theo
   khoá phòng); độc lập với bước 3 và 3b nên chạy song song được.
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
| **T-MD-4** | Xoá một mã lớp danh nghĩa còn lớp dùng → bị chặn kèm lý do và số lớp; mã không lớp nào dùng thì xoá được; **mã không lớp nào dùng không tự biến mất** (đã bỏ "mồ côi tự dọn") | e2e |
| **T-MD-5** | Không đổi được `semester_id` của lớp đã có phiên; lớp chưa có phiên thì đổi được | e2e |
| **T-MD-6** | Không đổi được `year`/`term` của học kỳ đã có lớp; đổi ngày thì được | e2e |
| **T-MD-7** | Hai học kỳ chồng ngày → DB từ chối | e2e |
| **T-MD-9** | `semester_name` bản chụp trên phiên không đổi khi admin sửa ngày của học kỳ, và `save()` không ghi đè được (`update:false`) | e2e |
| **T-RW-1** | `submission-overview` (SQL thô) vẫn trả đúng tên sinh viên sau khi bỏ `enrollment.student_name` | e2e |
| **T-RW-2** | `recollect` (SQL thô) vẫn liệt kê đúng sinh viên thiếu bài kèm tên sau khi bỏ cột | e2e |
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
| **T-IMP-4** | Lớp tham chiếu học kỳ, **mã lớp danh nghĩa** hoặc giảng viên không tồn tại → dòng lỗi, **không** tự tạo | e2e |
| **T-IMP-5** | Mã lớp danh nghĩa mới trong file Danh mục hiện ở mục riêng kèm cảnh báo gần giống (so với mã có sẵn **và** giữa các dòng trong file); nút xác nhận chỉ bật sau khi tick | unit |
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
| **T-ADM-1** | `POST/PATCH /classes` với mã lớp danh nghĩa chưa có trong Danh mục → 400, câu lỗi chỉ tới Danh mục, **không** tạo mã | e2e |
| **T-ADM-2** | Import lớp có một dòng mã chưa có → không ghi gì, lỗi nêu mã và số dòng | e2e |
| **T-ADM-3** | Thêm mã trùng sau chuẩn hoá (`dhktpm18a ` và `DHKTPM18A`) → 409; mã gần giống → cảnh báo, ghi được sau xác nhận | e2e + unit |
| **T-ADM-4** | Sửa `code` của một mã → nhãn lớp đổi ở mọi nơi, kể cả lớp của kỳ cũ | e2e |
| **T-ADM-5** | Teacher gọi route Danh mục lớp danh nghĩa → 403 | e2e |
| **T-IMP-8** | Import phòng: tên gần giống phòng có sẵn hiện cảnh báo và chỉ ghi sau khi tick; **đổi tên bằng file tạo một phòng mới** (không sửa phòng cũ), và test này khẳng định đúng hành vi đó | e2e + unit |
| **T-SES-1** | `PATCH` đổi phòng trước giờ bắt đầu: `room_id` và `room_name` đổi **trong cùng giao dịch** | e2e |
| **T-SES-2** | `PATCH` sang phòng đang có phiên chồng giờ → 409 nêu phiên đang giữ phòng; sửa **không tự va chạm với chính nó** (`excludeSessionId`) | e2e |
| **T-SES-3** | `PATCH` khi `now ≥ start_time`, hoặc phiên `collecting`/`completed`/`cancelled` → 409 | e2e |
| **T-SES-4** | `PATCH` và `cancel` bởi giảng viên khác hoặc admin → 403 | e2e |
| **T-SES-5** | `PATCH` giờ vi phạm tối thiểu 15 phút hoặc giãn cách 30 phút giảng viên → bị từ chối; đổi riêng một đầu thì kiểm trên cặp sau khi sửa | e2e |
| **T-SES-6** | Chọn phòng `is_active = false` khi sửa → bị từ chối; giữ nguyên phòng đã ngừng và chỉ sửa tên thì được | e2e |
| **T-SES-7** | `cancel` khi chưa ai vào → `cancelled`; **tạo ngay phiên mới cùng lớp, phòng, giờ được** (ràng buộc đã nhả) | e2e |
| **T-SES-8** | `cancel` khi đã có `agent_connection_event` hoặc bài `collected` → 409 | e2e |
| **T-SES-9** | `agent:join`, gắn đề và nộp bài vào phiên `cancelled` đều bị từ chối (khoá hành vi sẵn có) | e2e |
| **T-SES-10** | `PATCH` và `cancel` ghi `audit_log` với giá trị cũ và mới đúng các trường đổi | e2e |
| **T-SES-11** | Web: nút "Sửa" và "Huỷ phiên" ẩn kèm lý do khi không đủ điều kiện | unit |
| **T-AUD-1** | Mỗi thao tác ghi dữ liệu nền của admin để lại đúng một dòng audit; mỗi lần xác nhận import một dòng cho cả lô, kèm số lượng | e2e |
| **T-AUD-2** | `GET /audit-log` lọc theo `action` (chính xác và tiền tố), `actorId`, khoảng ngày; phân trang ổn định theo `occurred_at` | e2e |
| **T-AUD-3** | Teacher gọi `GET /audit-log` → 403 | e2e |
| **T-AUD-4** | Giá trị jsonb lớn bị cắt ở 4 KB trong danh sách | unit |
| **T-UX-1** | Giảng viên chưa có lớp thấy "Chưa có lớp nào được giao cho bạn" ở `/teacher/classes` và câu tương ứng ở form tạo phiên, và **không** có nút hay liên kết tạo lớp | unit |

**Nghiệm thu bằng chấm thật (mục 5 của trình tự):** sau cutover chạy lại một lượt diễn tập
trên Railway với cùng kịch bản và cùng model, ghi vào lịch sử benchmark và so với lượt trước.
`eval/rehearsal/cli.ts:147` đang hardcode `roomName: 'TEST-KHONG-PHONG'` và `semesterName:
'TEST dien tap'`, phải đổi sang `roomId` và `classId`. Phòng diễn tập phải đang hoạt động, nên
tạo riêng "Phòng diễn tập" chỉ bật khi diễn tập — không dùng lại phòng đã ngừng.

---

## 12. Hệ quả đã biết, ghi ra chứ không giấu

1. **Giảng viên không còn tự tạo lớp được** — đảo lại thay đổi 21/09. Admin thành điểm nghẽn:
   không có admin thì không có lớp mới. Đây là lựa chọn có ý thức.
2. **Mã lớp danh nghĩa vẫn là dữ liệu con người đưa vào** (§2.2): từ file hoặc danh sách admin lấy
   từ cổng đào tạo, hoặc gõ một mã trong Danh mục. Cảnh báo gần giống giảm xác suất sai, không loại
   bỏ; cái đổi là lỗi xảy ra một lần cho cả danh mục chứ không mỗi lần tạo lớp.
2b. **Khi trường mở lớp mới giữa kỳ**, admin phải thêm mã vào Danh mục trước rồi mới tạo lớp.
3. **Một sinh viên chỉ có một tên.** Một file Excel sai tên của một giảng viên đổi tên ở mọi lớp.
   Giảm nhẹ: kết quả import liệt kê rõ ai bị đổi tên.
4. **Lịch sử của `DHKTPM18ATT` có phiên chồng giờ** sau gộp lớp MongoDB (§8.3). Không hỏng
   ràng buộc nào, nhưng nhìn thấy được.
5. **Bước thu hẹp không đảo ngược được.** Đường lùi duy nhất là bản dump + deploy lại tag.
6. **Nên chờ G1–G5** vào `main` trước khi chạy migration lên Supabase để giảm chi phí rebase và gộp
   một cửa sổ bảo trì; không có ràng buộc kỹ thuật (§8.6).
7. **Admin có thêm việc trước mỗi kỳ:** tạo học kỳ, tạo lớp và giao giảng viên. Import giảm
   gánh nặng nhưng không bỏ.
8. **Ngày học kỳ tạm** (§8.2) có thể sai cho tới khi admin sửa. Không ảnh hưởng dữ liệu nào
   (chỉ chồng ngày với kỳ khác mới bị chặn).
9. **Giảng viên vẫn phải liên lạc admin ngoài hệ thống** khi thiếu lớp, học kỳ hay phòng: kênh
   "yêu cầu admin" được để sau (§1.2) và hệ thống không có hạ tầng thông báo. Giảng viên chỉ biết
   mình được giao lớp khi mở "Lớp của tôi"; màn trống nói rõ nguyên nhân (§5.2). Với 1 admin và 3
   giảng viên đây là chấp nhận được, nhưng nó **là điểm nghẽn có thật** (mục 1 ở trên).
10. **Đổi tên phòng bằng file tạo ra một phòng mới** vì khoá là tên (§6.1). Cảnh báo "gần giống"
    giảm rủi ro, không loại bỏ: hai `room_id` cho một phòng vật lý thì chống trùng phòng theo
    `room_id` không bắt được đặt trùng giữa hai id. Đổi tên một phòng nên làm thủ công.
11. **Sửa phiên chỉ trước giờ bắt đầu** (§4.1). Phiên đã bắt đầu mà cần đổi phòng thì vẫn chỉ có
    lối vòng "Chốt bài ngay, tạo phiên mới" (sinh viên đã vào phải vào lại). Phương án B (đổi
    riêng phòng khi không có `{PHONG}`) chưa chọn.
12. **Trang đọc audit không phải đối trọng quyền lực** khi chỉ có một admin (§4.2): nó phục vụ
    điều tra sự cố, không phải kiểm soát.

---

## 13. Điểm mở — kiểm khi viết plan

1. ~~Trigger trên `submission`/`session_roster` có cho ghi lại `home_class_id` không~~ — **đã
   kiểm, không có** (§8.3); chỉ còn xác nhận lại bằng diễn tập §8.5.
2. Cơ chế ép "không đổi kỳ của lớp đã có phiên" và "không đổi `year`/`term` khi đã có lớp":
   trigger hay khoá ngoại ghép.
3. **Mức** giới hạn tốc độ cho `GET /students/:mssv` (bản thân việc có giới hạn là bắt buộc, §2.6).
4. Hành vi `enrollments.addManually` (luồng xin phép) với quy tắc "một sinh viên một lớp mỗi kỳ".
5. Agent Electron hiển thị gì từ ack (`JoinScreen`, `DetailView`): giao thức không đổi, nhưng
   kiểm xem nhãn lớp nào đi qua.
6. Cách `readWorkbook` trả ô ngày Excel (§6.3).
7. `GET /accounts/teachers` đã đủ cho combobox giảng viên của admin chưa (dòng 28 của
   controller còn comment cũ nhắc "Trưởng khoa" — stale, sửa kèm).
8. **Lịch sử migration lệch DB thật** (§8.4 bước 0b): kiểm trên bản sao DB rằng sau khi thêm hai
   dòng `migrations`, `migration:run` chạy sạch; kiểm xem nguyên nhân hai migration được áp ngoài
   đường TypeORM (chạy tay trong SQL Editor?) để các môi trường khác (máy dev, Railway) không
   lặp lại.
9. **Quyết định mở (§4.1): cửa sổ sửa phiên.** Spec chọn "trước giờ bắt đầu". Phương án B: cho đổi
   **riêng phòng** sau khi bắt đầu nếu không file bắt buộc nào dùng `{PHONG}`. Cần chủ đồ án chọn.
10. Cách ép "chặn sửa sau giờ bắt đầu" và "chặn huỷ khi đã có người vào": kiểm ở service (đủ, vì
    `agent:join` đã chặn trước `start_time`), hay thêm trigger DB. Khuyến nghị service; chỉ thêm
    trigger nếu plan tìm ra đường ghi khác vào `exam_session`.
11. `GET /audit-log` chỉ theo khoảng ngày không có chỉ mục riêng (§4.2): bảng hiện 2 dòng và phân vùng
    chỉ có phần mặc định; thêm chỉ mục `(occurred_at DESC)` nếu bảng lớn lên, không làm trước.
12. Chuẩn hoá để so "gần giống" (§6.2 nguyên tắc 4): chốt hàm (bỏ khoảng trắng, dấu chấm, gạch ngang,
    hoa-thường, có thể bỏ dấu tiếng Việt cho tên phòng) và ngưỡng khoảng cách chỉnh sửa trên dữ liệu
    thật (3 phòng, 2 mã) trước khi viết test T-ADM-3 và T-IMP-8.
13. `eval/rehearsal/cli.ts` và `test/helpers` cần mã danh nghĩa có trong Danh mục khi dựng lớp: helper
    seed (§10 bước 1) phải tạo mã trước.

---

## 14. Liên quan

- `2026-09-20-master-data-scope-cut-design.md` — bị thay thế một phần (xem đầu file).
- `docs/superpowers/plans/2026-09-29-g2-g5-parallel-execution.md` — thứ tự với G1–G5 (§8.6).
- `CLAUDE.md` mục "Academic Structure & Ownership Model" — sửa theo §9.
- Memory: `examcollect-scope-pivot-2026-09-20` ("master data là ngoài phạm vi") — đã bị đảo một phần.
