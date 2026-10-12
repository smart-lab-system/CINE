# Master data entities (catalog) — thiết kế

**Ngày:** 2026-10-07 · **Branch:** `feature/master-data-entities` · **Baseline:** `main`  
**Trạng thái:** implemented (2026-10-07) — catalog + admin CRUD; chưa gắn schema cũ

Thêm lại một lớp **catalog dữ liệu nền** (năm học, học kỳ, môn, lớp danh nghĩa,
sinh viên, phòng, máy) **độc lập** với schema nghiệp vụ hiện tại. Không gắn
FK vào `exam_session`, `class`, `enrollment`, `rubric`, hay bất kỳ bảng cũ nào.
CRUD chỉ dành cho `admin`.

Đây **không** phải đảo ngược `ContractMasterData` (2026-09-20). Ownership
chấm điểm / lớp môn / phiên thi giữ nguyên: text snapshot và teacher-owned
entities không bị đụng trong đợt này.

---

## 0. Vì sao cần cái này

Sau đợt thu hẹp master data, hệ thống không còn bảng `course` / `room` /
`semester`. Giảng viên gõ phòng và học kỳ dạng văn bản; chống trùng phòng
chỉ còn best-effort theo chuỗi.

Chủ đồ án muốn có lại danh mục chuẩn (kèm sinh viên, lớp danh nghĩa, máy
tính) để quản trị — **nhưng tách pha**: trước hết chỉ tồn tại catalog +
CRUD admin. Việc gắn catalog vào phiên thi / lớp môn / roster là spec sau
(catalog + FK chọn lọc + snapshot).

---

## 1. Phạm vi

### 1.1 Trong phạm vi

| Hạng mục | Ghi chú |
|---|---|
| 7 bảng mới trong schema `examcollect` | Chỉ FK **giữa các bảng mới** |
| TypeORM entities + migration handwritten | Không `migration:generate` mù |
| Module API NestJS + routes CRUD `@Roles('admin')` | Mirror phong cách `AccountsController` |
| OpenAPI / client regenerate | Sau khi chốt controller |
| Trang admin web CRUD | Nav admin + list/create/edit (và xoá khi được phép) |
| `verify-schema` cập nhật danh sách bảng | |

### 1.2 Cố ý KHÔNG trong phạm vi

- **Mọi FK / cột mới trên bảng cũ** (`exam_session`, `class`, `enrollment`,
  `submission`, `rubric`, …).
- Đổi luồng tạo phiên thi, lớp môn, agent join, chấm điểm.
- Restore `department_admin` / `super_admin` / bảng khoa.
- Import hàng loạt (Excel) — có thể làm phase sau; MVP = form CRUD.
- Soft-delete global: schema dùng hard delete + `ON DELETE RESTRICT`
  (như `BaseEntity` comment). Trạng thái vòng đời dùng cột `status`.

---

## 2. Mô hình dữ liệu

Mọi bảng kế thừa cột chung từ `BaseEntity`: `id` uuid PK, `created_at`,
`updated_at`.

### 2.1 Sơ đồ liên kết (chỉ bảng mới)

```
academic_year 1──* semester

nominal_class 1──* student

room 1──* computer

course                 (độc lập)
```

### 2.2 `academic_year` — năm học

| Cột | Kiểu | Ràng buộc |
|---|---|---|
| `code` | varchar(20) | NOT NULL, unique — vd. `2026-2027` |
| `name` | varchar(100) | NOT NULL |
| `start_date` | date | NOT NULL |
| `end_date` | date | NOT NULL, `end_date > start_date` |
| `status` | enum | `planned` \| `active` \| `closed` |

### 2.3 `semester` — học kỳ

| Cột | Kiểu | Ràng buộc |
|---|---|---|
| `academic_year_id` | uuid | NOT NULL, FK → `academic_year` **RESTRICT** |
| `code` | varchar(20) | NOT NULL — vd. `HK1`, `HK2`, `HE` |
| `name` | varchar(100) | NOT NULL |
| `start_date` | date | NOT NULL |
| `end_date` | date | NOT NULL, `end_date > start_date` |
| `status` | enum | `planned` \| `active` \| `closed` |

**Unique:** `(academic_year_id, code)`.

Check gợi ý (app hoặc DB): khoảng ngày kỳ nằm trong khoảng năm học mẹ
(có thể lỏng ở MVP nếu lịch hè lệch nhẹ — nếu lỏng thì ghi rõ trong
service, không im lặng).

### 2.4 `course` — môn học

| Cột | Kiểu | Ràng buộc |
|---|---|---|
| `code` | varchar(50) | NOT NULL, unique |
| `name` | varchar(200) | NOT NULL |
| `status` | enum | `active` \| `inactive` |

Không có `credits`. Không FK tới năm/kỳ.

### 2.5 `nominal_class` — lớp danh nghĩa (lớp hành chính)

Khác `class` (lớp môn do giảng viên sở hữu trong schema cũ). Tên bảng
**`nominal_class`** để không đụng entity `class` hiện có.

| Cột | Kiểu | Ràng buộc |
|---|---|---|
| `code` | varchar(50) | NOT NULL, unique — vd. `D21CQCN01` |
| `name` | varchar(150) | nullable |
| `cohort_year` | int | nullable — vd. `2021` |
| `status` | enum | `active` \| `inactive` |

### 2.6 `student` — sinh viên

Không có bảng student trước đây; danh tính nằm trên `enrollment` /
roster / submission. Bảng này là **catalog**, chưa thay thế các cột cũ.

| Cột | Kiểu | Ràng buộc |
|---|---|---|
| `mssv` | citext | NOT NULL, unique; check `^[A-Za-z0-9]{4,20}$` (cùng quy ước enrollment) |
| `full_name` | varchar(150) | NOT NULL |
| `nominal_class_id` | uuid | NOT NULL, FK → `nominal_class` **RESTRICT** |
| `status` | enum | `active` \| `inactive` \| `graduated` \| `withdrawn` |

Không có `email`.

### 2.7 `room` — phòng thi / phòng máy

| Cột | Kiểu | Ràng buộc |
|---|---|---|
| `code` | varchar(50) | NOT NULL, unique |
| `name` | varchar(150) | NOT NULL |
| `capacity` | int | NOT NULL, `> 0` |
| `building` | varchar(100) | nullable |
| `status` | enum | `available` \| `maintenance` \| `retired` |

### 2.8 `computer` — máy trong phòng

| Cột | Kiểu | Ràng buộc |
|---|---|---|
| `room_id` | uuid | NOT NULL, FK → `room` **RESTRICT** |
| `hostname` | varchar(100) | NOT NULL |
| `cpu` | varchar(200) | NOT NULL |
| `ram_gb` | int | NOT NULL, `> 0` |
| `storage` | varchar(200) | NOT NULL — mô tả ổ (vd. `512GB SSD`) |
| `gpu` | varchar(200) | nullable |
| `os` | varchar(100) | NOT NULL |
| `ip_address` | varchar(45) | nullable |
| `mac_address` | varchar(17) | nullable |
| `status` | enum | `available` \| `maintenance` \| `retired` |

**Unique:** `(room_id, hostname)`.

Không có `seat_label`.

### 2.9 Enum Postgres

Mỗi cột `status` một type riêng (tránh một enum dùng chung bị phình):

- `academic_year_status`
- `semester_status`
- `course_status`
- `nominal_class_status`
- `student_status`
- `room_status`
- `computer_status`

(Giá trị như §2.2–2.8.)

---

## 3. Quy tắc xoá & cập nhật

- Xoá cha khi còn con → **403/409** từ service sau khi DB **RESTRICT** ném
  (map qua `PostgresExceptionFilter` nếu đã có pattern tương tự).
- Đổi `status` không xoá hàng; dùng PATCH.
- Đổi `code` được phép nếu unique còn thỏa — không có snapshot phía schema
  cũ phụ thuộc code trong đợt này.
- Không cascade delete.

---

## 4. API (admin only)

Prefix gợi ý: `/master-data/...` hoặc từng resource ở root như accounts.
**Chọn:** namespace `/master-data` để không đụng route cũ và rõ đây là catalog.

Tất cả: `JwtAuthGuard` + `RolesGuard` + `@Roles('admin')`.

| Method | Path | Việc |
|---|---|---|
| GET/POST | `/master-data/academic-years` | list (filter status?), create |
| GET/PATCH/DELETE | `/master-data/academic-years/:id` | |
| GET/POST | `/master-data/semesters` | list filter `academicYearId` |
| GET/PATCH/DELETE | `/master-data/semesters/:id` | |
| GET/POST | `/master-data/courses` | |
| GET/PATCH/DELETE | `/master-data/courses/:id` | |
| GET/POST | `/master-data/nominal-classes` | |
| GET/PATCH/DELETE | `/master-data/nominal-classes/:id` | |
| GET/POST | `/master-data/students` | list filter `nominalClassId`, q=mssv/name |
| GET/PATCH/DELETE | `/master-data/students/:id` | |
| GET/POST | `/master-data/rooms` | |
| GET/PATCH/DELETE | `/master-data/rooms/:id` | |
| GET/POST | `/master-data/computers` | list filter `roomId` |
| GET/PATCH/DELETE | `/master-data/computers/:id` | |

List: phân trang kiểu accounts (`page`/`limit` hoặc `offset`/`limit` —
**khớp convention hiện có của `AccountsService.search`**).

DTO: class-validator; create bắt buộc field NOT NULL; patch partial.

Response: entity fields camelCase như phần còn lại của API.

---

## 5. Web admin

### 5.1 Nav

Thêm nhóm **Dữ liệu nền** (hoặc từng mục) vào `ADMIN_NAV`:

- Năm học & học kỳ (có thể một trang tabbed, hoặc hai route)
- Môn học
- Lớp danh nghĩa
- Sinh viên
- Phòng & máy (trang phòng; máy nested hoặc filter theo phòng)

Route dưới `/admin/master-data/...`.

### 5.2 UX tối thiểu mỗi resource

- Bảng list + tìm/lọc
- Form tạo / sửa (Dialog hoặc trang riêng — khớp pattern `admin/accounts`)
- Nút xoá với confirm; nếu RESTRICT → toast lỗi rõ (“còn học kỳ / SV / máy”)
- Select cha: semester chọn academic year; student chọn nominal class;
  computer chọn room

Teacher **không** thấy nav / không gọi API (403).

---

## 6. Cấu trúc code gợi ý

```
apps/api/src/master-data/
  master-data.module.ts
  entities/
    academic-year.entity.ts
    semester.entity.ts
    course.entity.ts
    nominal-class.entity.ts
    student.entity.ts
    room.entity.ts
    computer.entity.ts
  *.controller.ts / *.service.ts / dto/
```

Đăng ký entities trong `data-source.ts` + `MasterDataModule` import vào
`AppModule`.

Migration: một file handwritten `AddMasterDataEntities` tạo 7 bảng + enum
+ index/FK.

`verify-schema.ts`: thêm 7 tên bảng vào `EXPECTED_TABLES`.

---

## 7. Kiểm thử

- Unit/service: unique conflict, RESTRICT delete, validation mssv.
- e2e API: CRUD happy path + 403 teacher + xoá cha khi còn con.
- Web: smoke test list/create nếu repo đã có pattern test admin accounts.

**Rule — e2e chỉ trên database test:** mọi e2e của đợt này (và toàn
repo) chỉ chạy qua `apps/api/.env.test` → Postgres/Redis/MinIO local
(`docker-compose`, cổng 5442). Cấm trỏ `DATABASE_URL` e2e sang cloud /
production / DB demo đang phục vụ người dùng. Guard bắt buộc:
`apps/api/test/setup-env.ts`.

Không yêu cầu regression exam/grading — không đụng module đó.

---

## 8. Thứ tự implement gợi ý

1. Migration + entities + verify-schema  
2. Module API + OpenAPI client  
3. Admin UI theo resource (năm→kỳ→…→máy, vì có FK phụ thuộc)  
4. e2e admin CRUD  

---

## 9. Việc cố ý để sau (không làm trong spec này)

- `exam_session.semester_id` / `room_id` + snapshot  
- `class.course_id` thay `course_name` hằng  
- Đồng bộ / thay `enrollment` bằng `student_id`  
- Gán máy cho chỗ ngồi phiên thi  
- Import CSV/Excel roster  

Khi làm các việc đó: viết **spec riêng**, giữ nguyên nguyên tắc snapshot
bất biến trên session (xem thảo luận catalog + FK chọn lọc).

---

## 10. Tóm tắt quyết định

| Quyết định | Chọn |
|---|---|
| Liên kết schema cũ? | **Không** trong đợt này |
| Ownership grading / class? | Không đổi |
| `is_active`? | Không — dùng `status` enum theo từng bảng |
| `course.credits` / `student.email` / `computer.seat_label`? | Không |
| Hardware máy | `cpu`, `ram_gb`, `storage`, `gpu?`, `os` |
| Tên lớp hành chính | `nominal_class` (tránh đụng `class`) |
| Ai CRUD | Chỉ `admin` |
