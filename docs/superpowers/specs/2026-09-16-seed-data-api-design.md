# Thiết kế: API bề mặt seed dữ liệu

**Ngày:** 2026-09-16  
**Trạng thái:** Đã review — các quyết định §11 chốt ngày 2026-09-17; plan
triển khai tại `docs/superpowers/plans/2026-09-16-seed-data-api.md`  
**Nhánh:** `feature/seed-data-api`  
**Dựa trên:** tài nguyên học vụ & roster
(`docs/superpowers/specs/2026-08-29-resources-and-roster-design.md` và các
module đã có trên `main`: học kỳ, môn học, lớp, phòng thi, tài khoản, import
roster). Lấy cảm hứng từ pattern `scripts/seed-sample-data.mjs` của project
Cine cũ (seed bằng cách gọi API đang chạy), **không** mang schema hay domain
lab/workstation của project đó sang.

---

## 1. Vì sao cần giai đoạn này

DB CINE mới (ExamCollect) vừa dựng xong hiện chỉ “boot” được một nửa:

- Migration seed sẵn một học kỳ, `CS101`/`CS201` (chưa có owner), và ba phòng.
- Tài khoản đầu tiên vẫn phải `INSERT` SQL kèm hash argon2
  (`DEMO-RUNBOOK.md` bước 5).
- Những thứ demo thật sự cần — môn đã có owner, lớp gắn GV, dòng roster mà
  `agent:join` dùng để xác thực — phải click tay trên UI (Trưởng khoa rồi
  giảng viên), hoặc SQL ad-hoc.

Project Cine cũ giải bài tương tự bằng một script gọi REST cho đến khi
thế giới dữ liệu “đúng hình”. Ta muốn ergonomics đó ở đây: **script Node
seed chống lại API đang chạy**, tái dùng được JSON mẫu ở project anh em
(`danh_sach_sinh_vien.json`, môn, phòng, …) sau một bước transform nhỏ.

Điều chặn script hôm nay **không phải** “không có CRUD”. Hầu hết đường ghi
đã có. Thiếu là **bề mặt ghép cho seed**:

1. **Múa token theo role.** Tạo môn cần token `department_admin`; ghi roster
   cần token `teacher`; tạo phòng và tài khoản cần `admin`. Script phải
   đăng nhập ba lần, giữ ba token, hoặc chết giữa đường.
2. **Không có “ensure” idempotent.** Chạy lại seed trên DB đã nửa đầy sẽ
   đụng unique index (`uq_semester_name`, `uq_course_semester_code`,
   `uq_room_name`, `uq_account_email`, `uq_class_course_name`,
   `uq_enrollment_course_student`) → 409. Kiểu `ensure()` cũ (GET → khớp →
   POST) khó dùng vì nhiều list bị scope theo owner (`GET /classes/mine`,
   `GET /courses/mine`), không phải tra theo khóa tự nhiên cho một actor
   admin.
3. **Deadlock bootstrap.** Không có dòng `account` nào thì không ai gọi được
   `POST /accounts`. SQL vẫn là lối thoát trong runbook — ổn cho một admin,
   nhưng script seed không tự tạo được operator của nó thì chưa đủ.
4. **Đường sản phẩm giữ nguyên đường sản phẩm.** Nới mọi `@Roles(...)` chỉ
   để script điều khiển API dạng UI sẽ làm mờ luật ownership mà hệ thống
   đã khóa ở phase roster (GV sở hữu danh sách SV; Trưởng khoa sở hữu môn;
   admin sở hữu phòng/học kỳ/tài khoản).

Giai đoạn này thêm **API seed hẹp, chỉ admin**, ghi qua đúng các service UI
đã dùng, để sau này `scripts/seed-sample-data.mjs` (ngoài phạm vi slice
triển khai đầu — xem §2) nạp được demo Khoa CNTT mà không click và không
dump SQL vào `examcollect`.

---

## 2. Mục tiêu / ngoài phạm vi

**Mục tiêu**

- Bề mặt HTTP chỉ admin, có thể **ensure** (tạo-hoặc-trả-về) đồ thị tham
  chiếu demo cần: accounts → học kỳ → phòng → môn (đã có owner) → lớp →
  enrollment/roster.
- Idempotent theo khóa tự nhiên: chạy lại cùng payload không nhân bản, không
  409.
- Ghi qua domain service / bảng app đã tin (`enrollment` vẫn là nguồn xác
  thực join).
- Có cổng chặn rõ để không thành lỗ súng trên production (§5).
- Hợp đồng API có tài liệu để script seed tương lai (và helper e2e) dựa vào.
- Đủ để map JSON project Cine anh em (SV → roster, phòng → `room`, môn →
  `course`, GV → `account` role `teacher`) mà không bịa entity kiểu lab.

**Ngoài phạm vi** — cố ý:

- **Ship `scripts/seed-sample-data.mjs` ngay trong slice đầu.** Design này
  khóa hợp đồng API; script là bước theo sau (cùng nhánh sau hoặc PR khác).
- **Lab / máy trạm / sơ đồ ghế / MAC / IP / thời khóa biểu.** Thuộc hướng
  quản lý phòng máy đã bỏ. `room` ở đây vẫn chỉ `{ name, capacity }`.
- **Phiên thi, đề thi, bài nộp, chấm điểm.** Seed dừng ở mức “sẵn sàng tạo
  phiên thi.” Tạo phiên vẫn là việc của GV (hoặc runbook) — phiên gắn giờ
  và mã join.
- **Đổi luật ownership trên UI thường.** GV vẫn sở hữu import roster; Trưởng
  khoa vẫn không ghi được qua `POST /classes/:id/roster`. Đường seed là
  lối thoát admin riêng, không phải nới role im lặng.
- **Đăng ký công khai tự phục vụ.** Vẫn cấm. Bootstrap có cổng (§5.3),
  không phải mang `/auth/register` trở lại.
- **Thay / xóa dòng seed từ migration.** `CS101`/`CS201` và ba phòng từ
  `AddCourseRoomExamType` có thể được nhận (khớp theo mã/tên) hoặc để nguyên;
  seed không xóa dữ liệu migration.
- **Đa khoa / đa tenant vượt một Trưởng khoa.** Một head sở hữu mọi môn seed
  là đủ cho demo; bảng `department` vẫn ngoài phạm vi (cùng ruling với
  design roster).

---

## 3. Lựa chọn hướng tiếp cận

Ba phương án đã xét:

| Phương án | Ý tưởng | Lý do loại / giữ |
| --- | --- | --- |
| **A. Chỉ script trên CRUD hiện có** | Không endpoint mới; seed đăng nhập admin, head, từng GV | Token dễ gãy; roster khóa teacher; list theo owner; khó khớp lớp idempotent |
| **B. Nới `@Roles` hiện có** | Cho admin/head gọi import roster, cho admin tạo môn, … | Âm thầm phá ownership phase-3 với mọi client, kể cả browser |
| **C. Module seed admin riêng** ★ | `/admin/seed/*` ensure theo khóa tự nhiên | Giữ API sản phẩm nguyên; một token; một hợp đồng idempotent; dễ tắt |

**Chọn: C.**

Hình dạng: Nest module nhỏ (`SeedModule`) với một controller, gọi vào
`AccountsService`, `SemesterService`, `RoomService`, `CourseService`,
`ClassService`, `RosterService` (hoặc wrapper mỏng tái dùng đường ghi của
chúng). Không schema thứ hai. Không `INSERT` thô trừ bootstrap DB trống ở
§5.3.

---

## 4. Mô hình tài nguyên API seed hiểu

Khóa tự nhiên (client gửi; idempotency khớp theo đây):

| Tài nguyên | Khóa tự nhiên | Map từ JSON anh em (xấp xỉ) |
| --- | --- | --- |
| Account | `email` (citext) | GV → email tổng hợp; admin/head email demo cố định |
| Semester | `name` | kiểu `Học kỳ 1 năm học 2026–2027` (hoặc giữ dòng migration) |
| Room | `name` | `danh_sach_phong_may.json` → `ten` (bỏ workstation) |
| Course | `(semesterId hoặc semesterName, code)` | `maHocPhan` / `tenMonHoc` |
| Class | `(courseCode + semester, name)` | `maLopDanhNghia` hoặc `Nhóm {nhom}` |
| Enrollment | `(courseId, studentMssv)` | `ma` + `hoTen` từ danh sách SV / roster lớp HP |

Payload dùng **định danh nghiệp vụ ổn định** (email, mã, tên), không bắt
client tự lần UUID trước. Server tự resolve UUID. Đó là lý do tồn tại của
“ensure.”

Sinh viên **vẫn không có** dòng `account`. Seed chỉ ghi `enrollment` (và
do đó roster GV nhìn thấy).

---

## 5. Bảo mật và cổng chặn

### 5.1 Ai được gọi

Mọi endpoint seed (trừ bootstrap):

- `JwtAuthGuard` + `RolesGuard`
- `@Roles('admin')` thôi

Không `department_admin`, không `teacher`, không `super_admin`. Seed là
công cụ vận hành, không phải tính năng Trưởng khoa.

### 5.2 Kill-switch môi trường

Ngoài role admin:

```text
SEED_API_ENABLED=true   # bắt buộc; mặc định false / không set → 404 mọi route seed
```

Lý do: token admin trên production cấu hình sai không được phép bulk-ghi
roster và tài khoản. Thiếu hoặc `false` → **không đăng ký** controller
module (ưu tiên hơn trả 404 từng handler, để Swagger production sạch).

Chỉ `NODE_ENV=production` **không** đủ làm cổng — staging đôi khi cũng chạy
Node `production`. Flag tường minh mới là cổng.

### 5.3 Bootstrap khi chưa có tài khoản nào

Vấn đề: bảng `account` trống thì không ai lấy được JWT.

**Ruling:** một endpoint không cần auth, hẹp hơn register:

```http
POST /seed/bootstrap-admin
```

Chỉ chấp nhận khi:

1. `SEED_API_ENABLED=true`, và
2. `SELECT count(*) FROM examcollect.account` bằng `0`.

Body: `{ name, email, password }` → tạo đúng một account `admin` (argon2id,
cùng đường `AccountsService#create`). Nếu đã có bất kỳ account nào →
**409** với mã ổn định `BOOTSTRAP_NOT_AVAILABLE`.

Thay bước SQL trong runbook cho case DB mới phổ biến, mà không mở đăng ký
công khai. Sau admin đầu, account tiếp theo qua `POST /admin/seed/accounts`
(đã auth) hoặc UI `POST /accounts` bình thường.

### 5.4 Audit

Mỗi ensure seed **tạo mới** một dòng thì ghi `audit_log` với
`actor_type = 'user'`, `actor_id =` admin đang gọi (bootstrap: admin mới
sau khi insert — ưu tiên log sau create với id mới). Tên action:

- `seed.bootstrap_admin`
- `seed.ensure_account`
- `seed.ensure_semester`
- `seed.ensure_room`
- `seed.ensure_course`
- `seed.ensure_class`
- `seed.ensure_roster` (một event mỗi lần import lớp, kèm counts trong
  `new_value`)

Không ghi audit khi ensure chỉ khớp sẵn có (no-op).

### 5.5 Seed không được làm

- Không trả password trong response ensure (giống accounts API).
- Không endpoint nhận file `.xlsx` upload (Security rule 5) — chỉ JSON,
  giống import roster.
- Không bỏ qua regex MSSV / luật “một dòng hỏng thì cả file không nhập”
  khi ghi enrollment.
- Không hard-delete account đang bị FK trỏ tới; seed cập nhật tại chỗ hoặc
  bỏ qua.

---

## 6. Hợp đồng API

Base path: `/admin/seed` (riêng bootstrap: `/seed/bootstrap-admin`).

Mọi endpoint ensure là **`POST`**, trả **200** khi khớp dòng sẵn có và
**201** khi tạo mới. Body response luôn có
`{ id, created: boolean, ...các field view }`.

### 6.1 `POST /seed/bootstrap-admin`

Xem §5.3.

### 6.2 `POST /admin/seed/accounts`

```json
{
  "name": "Demo Teacher",
  "email": "demo-teacher@example.com",
  "password": "Demo123456!",
  "role": "teacher"
}
```

- Khớp theo `email`.
- Nếu đã có: trả account hiện tại; **không** đổi password hay role trừ khi
  bật cờ tùy chọn `updatePassword` / `updateRole` (mặc định `false` — tránh
  reset mật khẩu người dùng mỗi lần chạy lại seed).
- Nếu chưa có: tạo qua `AccountsService`.
- Role được seed: `admin`, `teacher`, `department_admin`
  (`super_admin` bị từ chối — cùng “bẫy không có area” đã ghi trong design
  roster).

### 6.3 `POST /admin/seed/semesters`

```json
{
  "name": "Học kỳ 1 2026-2027",
  "startDate": "2026-09-01",
  "endDate": "2027-01-15"
}
```

Khớp theo `name`. Nếu đã có nhưng khác ngày → cờ tùy chọn
`updateDates: true` (mặc định `false`) mới cập nhật; không thì trả nguyên
và giữ ngày (seed không được đánh nhau với lịch người đã sửa tay).

### 6.4 `POST /admin/seed/rooms`

```json
{ "name": "Phòng máy H1.1", "capacity": 40 }
```

Khớp theo `name`. Cờ cập nhật `capacity` tùy chọn, cùng mặc định `false`.

### 6.5 `POST /admin/seed/courses`

```json
{
  "code": "4220004247",
  "name": "Nhập môn Lập trình",
  "semesterName": "Học kỳ 1 2026-2027",
  "departmentHeadEmail": "demo-head@example.com"
}
```

- Resolve học kỳ theo tên (phải ensure trước).
- Resolve Trưởng khoa theo email (phải ensure trước, role
  `department_admin`).
- Khớp theo `(semester_id, code)`.
- Nếu môn migration chưa có owner khớp mã trong học kỳ đó → **nhận lấy**
  (gán `department_head_id`) thay vì insert trùng. Khép deadlock
  “CS101 unowned” trong runbook mà không cần bước UI admin riêng.
- Nếu đã thuộc head **khác** → 409 `COURSE_OWNED_BY_OTHER`.

### 6.6 `POST /admin/seed/classes`

```json
{
  "courseCode": "4220004247",
  "semesterName": "Học kỳ 1 2026-2027",
  "name": "Nhóm 01",
  "teacherEmail": "demo-teacher@example.com"
}
```

- GV phải tồn tại với role `teacher`.
- Khớp theo `(course_id, name)`.
- Nếu đã có nhưng khác GV → cờ tùy chọn `reassignTeacher: true` (mặc định
  `false`); không thì 409 `CLASS_TEACHER_MISMATCH`.

### 6.7 `POST /admin/seed/classes/roster`

```json
{
  "courseCode": "4220004247",
  "semesterName": "Học kỳ 1 2026-2027",
  "className": "Nhóm 01",
  "students": [
    { "mssv": "24000318", "name": "Nguyễn Hoàng Minh" }
  ],
  "removeMissing": false
}
```

- Resolve lớp, rồi gọi `RosterService.importForClass` với cùng luật DTO như
  `POST /classes/:id/roster` (regex MSSV, unique, tối đa 500, validate
  all-or-nothing).
- Không yêu cầu identity “đúng GV đang dạy”: seed chạy với admin và truyền
  `ClassEntity` đã load vào service. Đây là **một** lối thoát cố ý vượt
  quyền ghi roster chỉ-lecturer — có tài liệu, có audit, có kill-switch.
- Mặc định `removeMissing: false` giữ nguyên lý do như import sản phẩm.

### 6.8 Bundle: `POST /admin/seed/bundle` — **không thuộc MVP**

Đã chốt (2026-09-17): **MVP chỉ làm endpoint rời** (§6.1–§6.7). Bundle
(một request áp cả chuỗi theo thứ tự phụ thuộc) là **phase 1b / tùy chọn
sau**, không chặn merge nhánh này.

Khi làm 1b: một lần HTTP, không bắt buộc một transaction DB cho cả payload;
response liệt kê `{ key, created, id }` từng bước; dừng ở lỗi cứng đầu tiên
và vẫn trả phần đã làm được. Hình tối thiểu:

```json
{
  "accounts": [ /* §6.2 */ ],
  "semesters": [ /* §6.3 */ ],
  "rooms": [ /* §6.4 */ ],
  "courses": [ /* §6.5 */ ],
  "classes": [ /* §6.6 */ ],
  "rosters": [ /* §6.7 */ ]
}
```

Script `scripts/seed-sample-data.mjs` (root, bước theo sau) tự ghép các
endpoint rời — không cần đợi bundle.

---

## 7. Map từ JSON mẫu project Cine anh em

Hướng dẫn cho script tương lai (chưa implement trong MVP design này):

| File anh em | Gọi seed |
| --- | --- |
| (không có — tự tạo) | bootstrap admin; ensure head + N GV |
| Học kỳ hard-code trong script cũ | `ensure` semesters |
| `danh_sach_phong_may.json` | rooms từ `ten` + `sucChua`; bỏ `ma`/workstation |
| `danh_sach_mon_hoc.json` | courses; `maHocPhan` → `code`, `tenMonHoc` → `name` |
| `danh_sach_giang_vienn.json` | accounts role=teacher; email từ slug `@example.com` |
| `danh_sach_lop_hoc_phan.json` + `danh_sach_sinh_vien.json` | classes + roster; `nhom` → `Nhóm {nn}`; mã SV đã khớp `^[A-Za-z0-9]{4,20}$` |

Giữ `MSSVTEST01…20` (+ `SV20120001/02`) trong ít nhất một lớp nếu demo
mock-agent còn cần — hoặc ensure roster thêm, hoặc giữ output
`make-sample-roster.mjs` làm fixture thứ hai.

---

## 8. Mã lỗi (chuỗi ổn định)

| Mã | Khi nào |
| --- | --- |
| `SEED_DISABLED` | Flag tắt (nếu handler vẫn đăng ký nhưng bị chặn) |
| `BOOTSTRAP_NOT_AVAILABLE` | Đã có account |
| `SEMESTER_NOT_FOUND` | Course/class trỏ tên học kỳ chưa có |
| `ACCOUNT_NOT_FOUND` | Email head/GV chưa có |
| `ACCOUNT_ROLE_INVALID` | Account tham chiếu sai role |
| `COURSE_NOT_FOUND` | Class/roster trỏ môn chưa có |
| `COURSE_OWNED_BY_OTHER` | Ensure sẽ cướp môn của head khác |
| `CLASS_NOT_FOUND` | Roster trỏ lớp chưa có |
| `CLASS_TEACHER_MISMATCH` | Lớp đã có, khác GV, không bật reassign |
| `SUPER_ADMIN_NOT_SEEDABLE` | Role bị từ chối |

Lỗi validate (MSSV, ngày, tên rỗng) vẫn là 400 thường từ `ValidationPipe`,
giống DTO sản phẩm.

---

## 9. Kỳ vọng kiểm thử

- e2e: flag tắt → route seed không có hoặc 404.
- e2e: DB trống → bootstrap một lần → bootstrap lần hai 409.
- e2e: ensure account/semester/room/course/class hai lần → lần hai
  `created: false`, cùng `id`.
- e2e: ensure course nhận `CS101` migration unowned khi khớp mã + học kỳ.
- e2e: roster ensure ghi `enrollment`; `agent:join` (helper suite sẵn có)
  chấp nhận MSSV đã seed.
- e2e: JWT không phải admin → 403 trên `/admin/seed/*`.
- Unit: khớp khóa tự nhiên không phân biệt hoa thường ở cột `citext`
  (email, mã môn, MSSV).

---

## 10. Thứ tự triển khai (cho plan sau)

1. Gate + `SeedModule` rỗng, chỉ wire khi `SEED_API_ENABLED=true`.
2. Bootstrap admin.
3. Ensure account / semester / room.
4. Ensure course (kèm claim unowned).
5. Ensure class.
6. Ensure roster (admin → `RosterService`).
7. (1b) Bundle endpoint.
8. (2) PR theo sau tùy chọn: `scripts/seed-sample-data.mjs` + cập nhật
   DEMO-RUNBOOK thay bước SQL account và click roster cho demo local.

Không kỳ vọng migration schema. Nếu cần checklist tên action audit trong
docs thì đó là tài liệu, không phải DDL.

---

## 11. Quyết định đã chốt (2026-09-17)

| # | Câu hỏi | Quyết định |
| --- | --- | --- |
| 1 | Bundle trong MVP hay 1b? | **Endpoint rời trước.** Bundle (§6.8) không thuộc MVP. |
| 2 | Re-seed có reset password? | **Không.** Mặc định không đổi password (vd. `Demo123456!`); chỉ đổi khi bật `updatePassword: true`. |
| 3 | Nhận môn migration unowned? | **Có.** Khớp `CS101`/`CS201` (cùng học kỳ + mã) rồi gán `department_head_id` = head seed. |
| 4 | `department_admin` được gọi seed? | **Không.** Chỉ `admin` (+ bootstrap khi DB trống). Giữ kill-switch và audit đơn giản. |
| 5 | Script seed để đâu? | **`scripts/seed-sample-data.mjs` ở root** — đồng bộ Cine anh em và `scripts/sample-roster.xlsx`. Script là bước theo sau API, không chặn MVP endpoint. |

---

## 12. Tiêu chí thành công

Design đã được chốt. Triển khai đạt khi:

- Role CRUD sản phẩm không đổi.
- Một admin + `SEED_API_ENABLED=true` đưa DB từ trống (hoặc chỉ có
  migration) tới trạng thái “Trưởng khoa + GV + môn đã owner + lớp +
  roster + phòng” mà không cần SQL (trừ fallback cũ) và không cần Agent
  Electron hay web UI.
- Ensure course nhận được `CS101`/`CS201` unowned khi khớp.
- Re-seed không reset password trừ khi bật cờ.
- Chạy lại cùng ensure là an toàn.
- Production tắt flag thì không lộ route seed.

Plan triển khai: `docs/superpowers/plans/2026-09-16-seed-data-api.md`.
