# Học kỳ là ống kính của cả hệ thống

**Ngày:** 2026-09-06
**Trạng thái:** chờ duyệt

---

## 1. Vấn đề

Giảng viên mở "Lớp của tôi" và thấy **mọi lớp họ từng được gán, từ mọi học kỳ**, chồng chất mãi mãi. Không có cột nào cho biết lớp nào thuộc kỳ nào, và `uq_class_course_name` chỉ unique trên `(course_id, name)` — nên hai kỳ hoàn toàn có thể cùng có lớp "N01" và trên màn hình chúng giống hệt nhau.

Nguyên nhân không nằm ở data model. Chuỗi `class → course → semester` **đã tách theo kỳ sẵn**: dạy "CSDL — N01" ở HK1 và HK2 là hai row `class` khác nhau, treo trên hai row `course` khác nhau. Cái thiếu là toàn bộ tầng *"bây giờ là kỳ nào"*, và mọi thứ chảy xuống từ đó:

- `semester.start_date`/`end_date` tồn tại nhưng **không dòng code nào đọc chúng**. Hai cột ngày là trang trí.
- `ClassService.findForTeacher()` chỉ có `WHERE k.teacherId = :teacherId`.
- `TeachingClassView` không mang trường học kỳ nào.
- Chỗ duy nhất có khái niệm "kỳ hiện tại" là `pickDefaultSemester()` ở trang Quản lý bài thu — và nó suy từ **giờ của phiên thi**, không phải ngày của học kỳ. App đang có hai định nghĩa "hiện tại" có thể mâu thuẫn.

Và một vấn đề sâu hơn về phân quyền: **bất kỳ Trưởng khoa nào cũng tạo/sửa/xoá được lịch học kỳ của toàn trường.** Ràng buộc `uq_semester_name` tồn tại chính vì hai Trưởng khoa có thể cùng tạo "Học kỳ 1 2026-2027" với ngày khác nhau — đó là miếng vá triệu chứng, không phải cách sửa gốc.

---

## 2. Những quyết định đã chốt, và vì sao

### 2.1 Lịch học kỳ thuộc về một tier cấp trường, không phải cấp khoa

Ở trường thật, lịch học kỳ là quyết định của Phòng Đào tạo, công bố một lần cho toàn trường. Không khoa nào tự đặt lịch riêng.

Enum `account_role` đã có sẵn `super_admin`, và ghi chú trong `role-areas.ts` từ trước đã nêu đúng chỗ nó thuộc về: *"nếu có tier academic-affairs — role thật sự sở hữu lịch học kỳ cấp trường — thì đây là chỗ nó thuộc về"*. Spec này hiện thực hoá đúng ý định đó.

**Phương án đã cân nhắc và loại:** giao cho `admin` (tier cấp trường đã chạy, có sẵn 6 trang, và đã giữ một việc học vụ cùng loại là `unowned-courses`). Rẻ hơn thật, nhưng nó gộp hai công việc khác nhau — quản trị hạ tầng và học vụ — vào một tài khoản, tức là lặp lại đúng lỗi phân quyền sai tầng mà spec này sinh ra để sửa, chỉ ở tầng khác.

### 2.2 "Kỳ hiện hành" là cờ tường minh, không phải suy luận

Nguyên tắc 3 của CLAUDE.md: mọi điểm mơ hồ giải quyết bằng **quyết định tường minh có trước**, không đoán, không heuristic. Cả hệ thống đã theo đúng nó — `RequiredDeliverable` khai tên file trước khi thi, `Enrollment` là nguồn sự thật cố định, `rubric_id` ghim vào phiên thay cho `findActive(courseId)`.

Bản thiết kế đầu tiên của chính spec này đi ngược lại: suy `isCurrent` bằng so ngày, kèm một bảng luật tie-break cho ca chồng lấn/khoảng trống. **Đã loại.** Hai ca khó nhất tự tan khi dùng cờ:

- **Khoảng trống giữa hai kỳ (nghỉ Tết):** kỳ trước vẫn là hiện hành cho tới khi có người gạt cần. Không cần luật nào.
- **Kỳ hè chồng kỳ chính:** luật "chọn `start_date` muộn nhất" sẽ chọn kỳ hè — ngắn, ít giảng viên dạy — làm mặc định cho **toàn bộ** giảng viên. Người không dạy hè mở app thấy trống trơn. Với cờ tường minh, tình huống này không tồn tại.

### 2.3 Ngày tháng đổi vai: từ bộ chọn thành chuông báo

Cờ tường minh có một điểm yếu mà việc suy-từ-ngày không có: **nó không tự sửa**. Ngày suy sai một hôm rồi tự đúng lại; cờ không ai gạt thì sai vĩnh viễn và im lặng.

`start_date`/`end_date` vì vậy vẫn ở lại, nhưng **không chọn gì nữa**. Chúng thành điều kiện cảnh báo: khi `now > end_date` của kỳ đang gạt cờ, hiển thị *"Học kỳ hiện hành đã kết thúc N ngày trước."*

Đây không phải suy luận lén lút quay lại. Cảnh báo **không đổi hành vi của hệ thống** — nó chỉ phơi ra một sự thật để người có thẩm quyền quyết định. Cùng khuôn với `submission.status='invalid'`, trang môn học mồ côi, và cảnh báo lớp chưa có danh sách: làm cho vấn đề hiện ra, không đoán hộ.

---

## 3. Tier Phòng Đào tạo

### 3.1 Phạm vi — cố ý mỏng

Tier này sở hữu **đúng một thứ: lịch học kỳ.** CRUD học kỳ, và quyết định kỳ nào hiện hành. Không gì khác. Mọi thứ đang thuộc `admin`/`department_admin`/`teacher` ở nguyên chỗ cũ.

Một tier một trang là hợp lý, không phải thiếu sót: Phòng Đào tạo trong hệ thống này đúng là chỉ giữ một quyển lịch.

### 3.2 Định danh

| Hạng mục | Giá trị |
|---|---|
| Giá trị enum trong DB | `super_admin` — **giữ nguyên**, không migrate |
| Nhãn hiển thị | **"Phòng Đào tạo"** (đổi từ "Super Admin") |
| Area | `/academic` |
| Trang chủ của role | `/academic/semesters` |

Giữ enum và đổi nhãn là có chủ ý: đổi giá trị enum kéo theo migration, làm hỏng token đang lưu hành, và không mang lại gì — cái người dùng đọc là nhãn. Nhãn "Super Admin" mô tả **thứ bậc**; "Phòng Đào tạo" mô tả **công việc**, và công việc mới là thứ quyết định ai được cấp tài khoản này.

Area đặt tên `/academic` chứ không `/super-admin`, cùng lý do.

### 3.3 Những chỗ phải sửa để tier tồn tại

Rẻ hơn nhiều so với lo ngại ban đầu, vì shell đã lấy nav từ một map theo area:

| File | Sửa |
|---|---|
| `lib/role-areas.ts` | `ROLE_AREAS` += `super_admin: '/academic'` |
| `lib/nav-config.ts` | `ACADEMIC_NAV = [{ label: 'Học kỳ', href: '/academic/semesters', icon: CalendarRange }]` |
| `components/layout/app-shell.tsx` | `role` prop += `'academic'`; thêm một mục vào map `AREA` |
| `app/academic/layout.tsx` | mới, 4 dòng, y hệt `app/admin/layout.tsx` |
| `app/academic/semesters/page.tsx` | dời từ `app/department/semesters/page.tsx`, thêm nút gạt cờ |
| `lib/account-roles.ts` | `ACCOUNT_ROLE_OPTIONS` += `super_admin`; nhãn "Phòng Đào tạo"; xoá đoạn ghi chú "deliberately absent" |

**Không cần dashboard riêng.** Tier một trang thì trang đó là nhà.

### 3.4 Bootstrap

Không có vòng lặp phụ thuộc: `admin` tạo được mọi tài khoản qua `POST /accounts` (admin-only), kể cả tài khoản Phòng Đào tạo. Sau khi tài khoản đó tồn tại, `admin` **không** đụng được vào lịch học kỳ nữa.

Hệ quả cần nói rõ: **nếu chưa có tài khoản Phòng Đào tạo nào, không ai tạo được học kỳ.** Đây là hành vi đúng, nhưng phải hiện ra chứ không được im lặng — xem §7.3.

---

## 4. `is_current`: dữ liệu và chuyển trạng thái

### 4.1 Schema

```sql
ALTER TABLE semester ADD COLUMN is_current boolean NOT NULL DEFAULT false;

-- Tối đa MỘT kỳ hiện hành, ép ở tầng DB chứ không ở service: service
-- không phải thứ duy nhất ghi được bảng này, và một check trước INSERT
-- không nhìn thấy row mà request khác đang ghi ngay lúc đó. Cùng lý do
-- với ex_exam_session_room_overlap.
CREATE UNIQUE INDEX uq_semester_single_current
  ON semester (is_current) WHERE is_current;
```

Partial unique index, không phải bảng con một dòng: nó ép đúng bất biến cần ép ("tối đa một"), cho phép **không có kỳ nào** (cài mới, hoặc Phòng Đào tạo cố ý chưa gạt), và không thêm một bảng phải join.

### 4.2 Đổi kỳ hiện hành

`PUT /semesters/:id/current`, `@Roles('super_admin')`.

Phải chạy trong **một transaction**: gỡ cờ kỳ cũ rồi gắn kỳ mới. Làm ngược thứ tự sẽ đụng unique index. Gọi lại trên chính kỳ đang hiện hành là hợp lệ và không làm gì (idempotent) — bấm hai lần không phải lỗi.

Ghi audit qua **`AuditLogService.recordUserAction`**, không tự viết `INSERT` mới. Đổi kỳ hiện hành đổi thứ **mọi giảng viên trong trường nhìn thấy** — phải trả lời được "ai đổi, lúc nào".

Lý do bắt buộc đi qua service, không phải chuyện phong cách: `AuditLogEntity` có
PK phức hợp `(occurred_at, id)`, bảng partition theo `occurred_at`, và một
`@BeforeInsert stampOccurredAt()` tồn tại để JS `Date` và Postgres không lệch
độ chính xác. Insert thô bỏ qua hook đó sẽ ghi ra một dòng **không tìm lại
được bằng chính khoá của nó**.

**Hai request đổi cờ đồng thời.** T1 đổi sang kỳ B, T2 đổi sang kỳ C, gần như
cùng lúc: T1 khoá row của kỳ A ở lệnh gỡ cờ, T2 chờ, rồi T2 gắn cờ cho C khi B
đã có cờ → đụng `uq_semester_single_current`.

Điều này **không** trồi lên thành 500: `PostgresExceptionFilter` đã map `23505`
sang `ConflictException` từ trước. Cái thiếu là **thông điệp** — câu chung
*"This request conflicts with an existing record."* vô nghĩa với người vừa bấm
chuyển học kỳ. Bắt riêng `QueryFailedError` mã `23505` trong service này và trả
409 với câu nói đúng chuyện: *"Một yêu cầu khác vừa đổi kỳ hiện hành. Tải lại
rồi thử lại."*

**Không có endpoint gỡ cờ.** Trạng thái "không kỳ nào hiện hành" chỉ tồn tại lúc cài mới, không phải thứ ai đó chọn — gỡ cờ mà không gắn kỳ khác là làm mù cả hệ thống, không có ca dùng thật nào.

### 4.3 Xoá học kỳ đang hiện hành

Chặn. `SemesterService.remove()` đã dựa vào `ON DELETE RESTRICT` của `course.semester_id` để từ chối kỳ còn môn học; thêm một chặn tường minh cho cờ, kèm thông báo nói rõ phải chuyển cờ trước.

---

## 5. Ống kính: những mặt nào, server hay client

Theo đúng khuôn từng màn hình đang có, không ép về một kiểu.

| Màn hình | Lọc hiện tại | Thêm học kỳ |
|---|---|---|
| GV — Lớp của tôi | không | **server** `GET /classes/teaching?semesterId=` |
| GV — Quản lý kỳ thi | server (search/status/type + phân trang) | **server** `?semesterId=` |
| GV — Quản lý bài thu | client | **đã có** — chỉ đổi nguồn mặc định |
| TK — Lớp học | không | **server** `GET /classes/mine?semesterId=` |
| TK — Môn học | không | **server** `GET /courses/mine?semesterId=` |
| Lịch thi (sau này) | — | cùng khuôn |

**Vì sao server cho các mục mới:** chúng không phân trang và sẽ phình vô hạn qua các kỳ — đúng vấn đề §1. Lọc ở server giữ payload bị chặn theo kỳ.

**Vì sao không đổi Quản lý bài thu sang server:** facet của nó tính trên toàn tập ở client và trang phụ thuộc vào điều đó. Đổi đi là một refactor riêng, người dùng không được gì. Chỉ **xoá `pickDefaultSemester()`** và lấy mặc định từ cờ, để app hết hai định nghĩa "hiện tại".

### 5.1 Luật bảo mật của bộ lọc mới

`semesterId` là **bộ lọc, không bao giờ là phạm vi**. Mọi query giữ nguyên `.where(<điều kiện sở hữu>)` rồi mới `.andWhere('...semesterId = :semesterId')` khi có.

Đây là lớp lỗi cụ thể, không phải lo xa: một bộ lọc optional thêm sau rất dễ được viết thành nhánh (*"có semesterId thì where theo semester, không thì where theo owner"*) thay vì AND thêm vào điều kiện sở hữu. Viết sai kiểu đó, một Trưởng khoa truyền `semesterId` hợp lệ là thấy dữ liệu của khoa khác — không phải do cố khai thác, mà do gộp hai điều kiện sai cách.

Code hiện tại đã đúng khuôn (`findAllForOwner` luôn `.where(teacherId)` trước), nhưng đúng-hôm-nay không phải là test. Xem §7.2.

---

## 6. UI dùng chung

### 6.1 `useSemesters()` và `<SemesterFilter>`

`GET /semesters` (read đã mở cho mọi role) trả thêm `isCurrent`. `useSemesters()` trả kèm kỳ hiện hành.

Một component `<SemesterFilter>` đặt trong `PageHeader` của cả 5 màn hình. Mặc định = kỳ hiện hành, kèm mục **"Tất cả học kỳ"** làm lối thoát một click.

### 6.2 Seed một lần — nằm trong hook, không nằm ở trang

Mặc định phải **gieo một lần**, không tính lại mỗi render, nếu không lựa chọn của giảng viên bị ghi đè ngay. Trang bài thu đã học bài này (`seededRef`).

Logic đó nằm **trong `useSemesterFilter()`**, không phải ở từng trang — năm trang tự viết là năm biến thể hơi khác nhau. Ref reset theo **định danh trang/route**, không theo dữ liệu trả về.

*Đã cân nhắc và loại:* tách một hook generic `useSeedOnce`. Grep toàn `apps/web` cho thấy pattern này hiện có **đúng một chỗ** (`submissions/page.tsx:140`) — `?student=` ở trang chi tiết đọc thẳng `useSearchParams()` mỗi render, không seed gì; `hasPositioned` trong `sidebar-nav` là chuyện định vị cuộn. Trừu tượng hoá cho một ca đang có là non; đặt seeding vào chính hook của bộ lọc giải quyết cùng mối lo mà không sinh khái niệm mới.

### 6.3 Cột học kỳ hiện có điều kiện

Cột học kỳ **chỉ hiện khi đang ở "Tất cả học kỳ"**. Khi đã lọc một kỳ, mọi dòng mang cùng giá trị — hiện nó là lặp một hằng số trên mọi dòng.

Và chỉ ở ba danh sách mà **bản thân dòng không có mốc thời gian nào để tự phân biệt**:

| Danh sách | Cột học kỳ khi ở "Tất cả" | Vì sao |
|---|---|---|
| GV — Lớp của tôi | **có** | dòng chỉ có môn + tên lớp; `uq_class_course_name` cho phép HK1 và HK2 cùng có "N01" |
| TK — Lớp học | **có** | cùng lý do |
| TK — Môn học | **có** | `uq_course_semester_code` cho phép cùng mã môn lặp lại qua các kỳ |
| GV — Quản lý kỳ thi | không | mỗi dòng đã có `startTime`, tự nó đặt phiên vào đúng kỳ |
| GV — Quản lý bài thu | không | cùng lý do |

### 6.4 Chuông báo kỳ đã hết hạn

Khi `now > end_date` của kỳ hiện hành, `<SemesterFilter>` hiện một dòng phụ mờ: *"Học kỳ hiện hành đã kết thúc 12 ngày trước."*

Ở mọi màn hình, kể cả của giảng viên — họ không gạt được cần, nhưng họ **cần biết vì sao màn hình trông lạ**. Với Phòng Đào tạo, cùng dòng đó nằm ngay cạnh nút chuyển.

### 6.5 Nhắc việc tồn đọng của kỳ trước

Kể cả cách A: đúng ngày chuyển cờ, bài chưa chấm của kỳ cũ rời khỏi tầm nhìn mặc định, và không có bước nào bắt người ta nhìn vào nó.

Một dòng ở dashboard giảng viên khi **kỳ trước** còn phiên cần chú ý — *"HK1 2026-2027 còn 3 phiên chưa chấm"* — bấm vào là nhảy sang kỳ đó với bộ lọc đã đặt sẵn. Một con số đếm thêm, không có máy trạng thái mới.

**Đây là mục cắt trước tiên nếu hết thời gian.** "Tất cả học kỳ" đã là lối thoát thủ công đầy đủ.

---

## 7. Kiểm thử

### 7.1 Cờ hiện hành

- Gạt cờ sang kỳ B khi kỳ A đang giữ → A hết, B có, **đúng một** row `is_current`
- Gạt lại chính kỳ đang hiện hành → không đổi gì, không lỗi
- Ghi thẳng SQL hai row `is_current = true` → unique index từ chối
- Xoá kỳ đang hiện hành → bị chặn, thông báo nói rõ phải chuyển cờ trước
- `PUT /semesters/:id/current` bởi `department_admin`/`admin`/`teacher` → **403**
- Đổi cờ → có dòng trong `audit_log`

### 7.2 Bộ lọc là bộ lọc, không phải phạm vi

Ca cụ thể, cho **từng** endpoint có `semesterId` mới:

> Trưởng khoa A truyền một `semesterId` hợp lệ, cố ý trỏ tới kỳ mà khoa của Trưởng khoa B đang dùng, và cố ý trỏ course/lớp thuộc B → kết quả vẫn **rỗng**, không phải dữ liệu của B.

Không chấp nhận test chung chung kiểu "lọc đúng theo semesterId". Thứ cần chứng minh là điều kiện sở hữu **vẫn còn đó** sau khi thêm bộ lọc, không phải bị thay thế.

Tương tự cho giảng viên: `?semesterId=` của kỳ mà họ không dạy lớp nào → rỗng, không phải lớp của người khác.

### 7.3 Không có kỳ hiện hành

- `GET /semesters` không kỳ nào gạt cờ → `isCurrent` false ở mọi kỳ, không nổ
- Mọi trang có bộ lọc → hiện *"Chưa có học kỳ hiện hành"* kèm chỉ dẫn ai là người đặt (**không** tự chọn đại một kỳ)
- Chưa có tài khoản Phòng Đào tạo nào → trang tài khoản của admin nói ra điều đó, không để nó im lặng

### 7.4 UI

- Mỗi trang mặc định đúng kỳ hiện hành, và **gieo một lần** — đổi tay rồi refetch không bị ghi đè
- "Tất cả học kỳ" trả lại toàn bộ, và cột học kỳ xuất hiện đúng lúc đó
- Chuông báo hiện khi và chỉ khi `now > end_date` của kỳ hiện hành
- `super_admin` vào `/academic/semesters` được; vào `/admin/*`, `/department/*`, `/teacher/*` bị đẩy về nhà nó
- Ba role kia vào `/academic/*` bị đẩy về nhà chúng

---

## 8. Ngoài phạm vi

- **Mốc con trong học kỳ** (đợt đăng ký, tuần thi giữa kỳ/cuối kỳ). Ở ExamCollect, giảng viên đặt giờ từng phiên thi tường minh, nên "tuần thi" là thứ nổi lên từ dữ liệu chứ không cần khai báo. Thêm mốc con là thêm thứ phải khai mà không ai đọc.
- **Nhiều lịch song song** (chính quy / vừa học vừa làm). Một lịch là đủ cho phạm vi đồ án.
- **Nhân bản lớp/danh sách sinh viên sang kỳ mới.** Đây là cách B đã loại ở giai đoạn bàn thiết kế — spec này là ống kính, không phải chuyển giao.
- **Dọn dữ liệu e2e.** Xem §9.3 — DB dev hiện có 1084 học kỳ do e2e tích tụ. Việc dọn (hoặc cho e2e tự dọn) nằm ngoài spec này, nhưng nó **chặn việc demo** tính năng này, nên phải xử lý trước khi demo chứ không phải "sau này".
- **`room` cũng đang bị mọi Trưởng khoa cùng sửa** (`DEPARTMENT_NAV` ghi rõ "Semesters and rooms are university-wide"). Đúng cùng một lớp lỗi phân quyền mà spec này sửa cho học kỳ, và **đang mở**, không phải rủi ro lý thuyết: hai Trưởng khoa cùng tạo phòng "A3-01" với `capacity` khác nhau sẽ gây nhầm thật lúc xếp lịch thi.

  Không trộn vào đây — trộn là mở rộng phạm vi giữa chừng. Nhưng **việc kế tiếp
  ngay sau khi merge spec này**, và nó dùng lại gần như nguyên bộ khung vừa dựng:
  chỉ cần chuyển quyền ghi `room` sang `super_admin`. Phòng thi **không** cần khái
  niệm "hiện hành" như học kỳ — không có gì để gạt cờ, chỉ có một chủ sở hữu để
  sửa lại cho đúng tầng.

---

## 9. Thứ tự triển khai

1. Migration `is_current` + partial unique index
2. API học kỳ: `PUT /:id/current`, đổi writes sang `@Roles('super_admin')`, chặn xoá kỳ hiện hành, `isCurrent` trong response, audit log
3. Tier `/academic`: role-areas, nav, AppShell, layout, dời trang Học kỳ, mở `super_admin` trong tuỳ chọn tạo tài khoản
4. `semesterId` cho 4 endpoint danh sách + test §7.2 cho từng cái
5. `useSemesterFilter()` + `<SemesterFilter>`, gắn vào 5 trang, xoá `pickDefaultSemester()`
6. Chuông báo kỳ hết hạn
7. Nhắc việc tồn đọng kỳ trước *(cắt trước tiên nếu hết thời gian)*

### 9.1 Bước 1–3 là MỘT lần merge, không tách PR

Thói quen của dự án này là PR nhỏ, merge từng phần. **Chỗ này là ngoại lệ.**
Giữa bước 2 và bước 3, `department_admin` đã mất quyền sửa học kỳ mà
`super_admin` chưa có area để đăng nhập vào — tức là một khoảng thời gian
thật sự **không ai trong hệ thống sửa được lịch học kỳ**. Ai theo phản xạ tách
nhỏ PR ở đây sẽ tạo ra đúng khoảng trống đó.

### 9.2 Migration KHÔNG tự backfill cờ

Sau migration, không kỳ nào có `is_current` cho tới khi có người gạt.

Đây là lựa chọn, không phải thiếu sót. Backfill "kỳ nào chứa hôm nay" nghe tiện,
nhưng nó là **đúng cái heuristic mà §2.2 vừa loại**, chỉ chạy một lần thay vì mỗi
lần đọc — và ở ca kỳ hè chồng kỳ chính nó vẫn chọn sai, chỉ khác là sai **im
lặng**, vì màn hình trông bình thường nên không ai đi kiểm.

Không backfill thì trạng thái sai là **ồn**: mọi trang nói "Chưa có học kỳ hiện
hành", ai đó sửa trong hai phút. Ồn-và-đúng hơn im-lặng-và-sai, cùng nguyên tắc
với §2.3.

*Không thêm backfill vào migration này về sau.*

### 9.3 Bước vận hành bắt buộc sau khi chạy migration

Trước khi mở lại hệ thống cho giảng viên (hoặc trước khi demo), theo khuôn
`DEMO-RUNBOOK.md`:

1. `admin` tạo tài khoản Phòng Đào tạo (`POST /accounts`, role `super_admin`).
2. Đăng nhập tài khoản đó, vào `/academic/semesters`.
3. Gạt cờ hiện hành cho đúng học kỳ.
4. Kiểm một trang bất kỳ của giảng viên: bộ lọc phải hiện đúng kỳ đó.

**Cảnh báo cho người chạy bước 3:** DB dev hiện có **1084 học kỳ**, gần như toàn
bộ là rác do e2e tích tụ (mỗi lần chạy tạo một `Semester ${stamp}` mới và không
dọn). Chọn đúng kỳ trong dropdown đó là việc thật, không phải hình thức. Xem §8.
