# Đồng bộ catalog master data vào schema nghiệp vụ — thiết kế

**Ngày:** 2026-10-07 · **Branch:** `feature/sync-master-data-schema` · **Baseline:** catalog CRUD + search/filter đã có  
**Trạng thái:** implemented  
**Tiền đề:** [2026-10-07-master-data-entities-design.md](./2026-10-07-master-data-entities-design.md) §9 (để sau: FK chọn lọc + snapshot)

Gắn catalog (`semester`, `room`, …) vào bảng nghiệp vụ cũ **mà không đảo**
`ContractMasterData` (2026-09-20): giữ cột text snapshot, thêm FK nullable,
dual-write khi tạo mới. Runtime đọc/chống trùng/export/agent/grading **không**
đổi nguồn sự thật trong phase này.

---

## 0. Vì sao cần cái này

Catalog đã tồn tại độc lập (admin CRUD). Giảng viên vẫn gõ `semesterName` /
`roomName` tự do → trùng phòng best-effort theo chuỗi, không liên kết danh mục
chuẩn.

Cần chọn từ catalog khi tạo phiên, nhưng:

- Phiên / bài nộp / bảng điểm lịch sử phải **tự mô tả được** học kỳ & phòng
  (snapshot bất biến — `ExamSessionEntity.semesterName`).
- Không được bắt buộc backfill FK cho mọi dòng cũ.
- Không được làm hỏng exclusion `ex_exam_session_room_overlap` hay filter
  `WHERE semester_name = ?`.

---

## 1. Phạm vi

### 1.1 Trong phạm vi (Phase 1 — phiên thi)

| Hạng mục | Ghi chú |
|---|---|
| Cột nullable `exam_session.semester_id`, `exam_session.room_id` | FK → catalog; `ON DELETE SET NULL` |
| Dual-write lúc tạo phiên | Có Id → validate + copy snapshot text; không Id → giữ gõ text |
| API create/update DTO + response | Optional `semesterId` / `roomId`; trả về Id khi có |
| Teacher **đọc** catalog semester/room (và năm học để lọc kỳ) | Chỉ GET list active; CRUD vẫn admin |
| UI tạo/sửa phiên: chọn học kỳ + phòng từ catalog | Vẫn cho fallback gõ text nếu không chọn |
| Migration handwritten + entity TypeORM | Không `migration:generate` mù |
| e2e: phiên cũ NULL FK vẫn chạy; phiên mới dual-write | Không regression chống trùng / list theo kỳ |

### 1.2 Cố ý KHÔNG trong phạm vi (Phase 1)

- `class.course_id`, `exam_session.course_id`, `enrollment.student_id`, gán máy.
- Đổi nguồn đọc runtime sang join catalog (export, overlap, search vẫn dùng text).
- Bỏ cột `semester_name` / `room_name` / `course_name`.
- Siết NOT NULL trên FK; backfill bắt buộc dữ liệu cũ.
- Đổi ownership / auth (vẫn `teacherId` + `session_roster`).
- Cascade đổi tên catalog → phiên đã tạo.
- Import Excel roster / chỗ ngồi máy.

### 1.3 Phase sau (spec riêng, không làm chung PR)

1. `class.course_id` + dual-write `course_name`
2. Roster / enrollment gắn `student` (resolve `mssv`)
3. (Tuỳ chọn) chống trùng phòng theo `room_id` khi cả hai phía có FK
4. Contract: UI bỏ gõ tự do; cân nhắc bỏ cột text **rất muộn**

---

## 2. Mô hình liên kết

```
catalog.semester ──FK nullable──► exam_session.semester_id
catalog.room     ──FK nullable──► exam_session.room_id

exam_session.semester_name  (snapshot, update: false — giữ nguyên)
exam_session.room_name      (snapshot text — giữ nguyên)
exam_session.course_name    (không đụng phase 1)
```

### 2.1 Cột mới

| Cột | Kiểu | Ràng buộc |
|---|---|---|
| `semester_id` | uuid NULL | FK → `examcollect.semester(id)` **ON DELETE SET NULL** |
| `room_id` | uuid NULL | FK → `examcollect.room(id)` **ON DELETE SET NULL** |

Index: btree thường trên mỗi cột (lọc / join sau này); không unique.

**Vì sao SET NULL, không RESTRICT:** admin xoá/nghỉ phòng hoặc kỳ trong catalog
không được chặn bởi phiên lịch sử; phiên vẫn còn `room_name` / `semester_name`.

### 2.2 Quy tắc dual-write (tạo phiên)

Thứ tự ưu tiên khi resolve snapshot:

1. Client gửi `semesterId` (uuid) → load `semester`; từ chối nếu không tồn tại
   hoặc `status != 'active'` (và năm học mẹ không `closed` nếu muốn chặt —
   **MVP:** chỉ kiểm `semester.status === 'active'`).
2. Ghi `semester_id` + `semester_name = semester.name` (đúng cột catalog `name`).
3. Nếu **không** có `semesterId` → bắt buộc `semesterName` text như hiện tại;
   `semester_id = NULL`.

Tương tự phòng:

1. Có `roomId` → load `room`; từ chối nếu không tồn tại hoặc
   `status != 'available'`.
2. Ghi `room_id` + `room_name = room.name` (canonical từ catalog).
3. Không có `roomId` → bắt buộc `roomName` text; `room_id = NULL`.

**Xung đột Id + text:** nếu gửi cả hai, **Id thắng** — text client bị bỏ qua,
server điền từ catalog (tránh lệch snapshot).

**Sửa phiên (PATCH):**

- Cho phép đổi `roomId` / `roomName` theo quy tắc dual-write (phòng có thể đổi
  trước giờ thi — giữ hành vi hiện có nếu đã có).
- **Không** cho đổi `semesterId` / `semesterName` sau tạo (`semester_name` vẫn
  `update: false`). Nếu PATCH gửi `semesterId` khác → 400.

### 2.3 Đọc / runtime (phase 1 không đổi)

| Đường | Nguồn sự thật |
|---|---|
| `ex_exam_session_room_overlap` | `room_name` (giữ) |
| `ScheduleConflictService` | `room_name` / `class_id` (giữ) |
| Filter / export theo kỳ | `semester_name` (giữ) |
| Response API | Thêm `semesterId?`, `roomId?` (nullable) cạnh text |

Không thêm exclusion constraint trên `room_id` trong phase 1.

---

## 3. API

### 3.1 Tạo / sửa phiên

`CreateExamSessionDto` (và PATCH tương ứng nếu có):

| Field | Bắt buộc | Ghi chú |
|---|---|---|
| `semesterId` | optional uuid | Nếu có → dual-write; bỏ qua `semesterName` client |
| `semesterName` | required **khi không có** `semesterId` | Giữ validator hiện tại |
| `roomId` | optional uuid | Nếu có → dual-write |
| `roomName` | required **khi không có** `roomId` | Giữ validator hiện tại |

Validate XOR-friendly: `(semesterId \|\| semesterName)` và `(roomId \|\| roomName)`.

Response (`ExamSessionResponseDto` / list item): thêm `semesterId: string | null`,
`roomId: string | null`.

### 3.2 Teacher đọc catalog (chọn dropdown)

Hiện `/master-data/*` CRUD chỉ `@Roles('admin')`. Teacher cần list để chọn.

**Chọn:** nới **GET list** (và GET by id nếu UI cần) cho:

- `/master-data/academic-years` (filter `status=active` khuyến nghị)
- `/master-data/semesters` (filter `academicYearId`, `status=active`)
- `/master-data/rooms` (filter `status=available`)

thành `@Roles('admin', 'teacher')`.

POST / PATCH / DELETE **giữ** `@Roles('admin')`.

Không mở student / computer / course / nominal-class cho teacher trong phase 1
(không cần cho form phiên).

Query mặc định phía UI teacher: chỉ bản ghi `active` / `available`; không hiện
`closed` / `retired` / `maintenance` trừ khi admin xem.

### 3.3 OpenAPI / client

Regenerate `packages/shared` schema sau khi chốt DTO + role GET.

---

## 4. Web (teacher)

Form tạo phiên thi:

- Select **Học kỳ**: load semesters (có thể nhóm theo năm học).
- Select **Phòng**: load rooms `available`.
- Giữ lối **“Nhập tay”** (collapse / toggle) gửi text không Id — tương thích
  fixture e2e và trường hợp catalog trống.
- Khi chọn select: chỉ gửi Id (không gửi text, hoặc gửi text nhưng server bỏ qua).

List / chi tiết phiên: hiển thị text snapshot như cũ; Id chỉ dùng nội bộ/edit
prefill khi `roomId` còn non-null.

---

## 5. Migration & entity

- File handwritten trong `apps/api/src/database/migrations/`, timestamp sau
  migration catalog / seed gần nhất trên nhánh.
- `ALTER TABLE examcollect.exam_session ADD COLUMN …`
- FK tên rõ: `fk_exam_session_semester`, `fk_exam_session_room`.
- Entity: cột + `@ManyToOne` nullable `onDelete: 'SET NULL'`; **không**
  `eager` load bắt buộc trên mọi query list.
- `verify-schema` nếu repo assert cột — cập nhật tương ứng.

Down migration: drop FK + drop columns.

---

## 6. Kiểm thử

| Ca | Kỳ vọng |
|---|---|
| Tạo phiên chỉ text (không Id) | 201; `semester_id`/`room_id` NULL; overlap/list kỳ như cũ |
| Tạo phiên có `semesterId` + `roomId` active | 201; Id set; text = catalog.name |
| `semesterId` closed / không tồn tại | 400/404 |
| `roomId` retired / maintenance | 400 |
| Gửi Id + text lệch | text trong DB = catalog; không phải text client |
| PATCH đổi `semesterId` | 400 |
| Teacher GET `/master-data/semesters` | 200 |
| Teacher POST `/master-data/rooms` | 403 |
| Xoá room catalog đang được phiên trỏ | SET NULL trên phiên; `room_name` còn |
| Regression e2e schedule-conflict + create session | xanh |

Không yêu cầu viết lại grading / agent e2e trừ khi đụng compile.

---

## 7. Thứ tự implement gợi ý

1. Migration + entity columns  
2. Dual-write trong `ExamSessionService` create (+ PATCH room)  
3. DTO / response / OpenAPI client  
4. Nới GET roles catalog (years, semesters, rooms)  
5. UI form phiên: select + fallback text  
6. e2e + chỉnh fixture nếu cần  

---

## 8. Tóm tắt quyết định

| Quyết định | Chọn |
|---|---|
| Kiểu gắn | FK nullable + snapshot text + dual-write |
| Phase 1 surface | Chỉ `exam_session` ← `semester`, `room` |
| ON DELETE | `SET NULL` |
| Đọc runtime | Vẫn text (overlap, export, filter) |
| Teacher & catalog | GET list years/semesters/rooms; không CRUD |
| Text fallback | Giữ (e2e + catalog trống) |
| `semester_name` sau tạo | Bất biến (không PATCH) |
| Snapshot lấy từ | `semester.name`, `room.name` |
| Đảo ContractMasterData / bỏ text | Không |

---

## 9. Liên hệ spec khác

- Catalog độc lập: [master-data-entities-design](./2026-10-07-master-data-entities-design.md) — đợt này **mở** phần §9 chỉ cho session semester/room.
- Scope cut / snapshot: [master-data-scope-cut-design](./2026-09-20-master-data-scope-cut-design.md) — không đảo contract; mở rộng mềm.
- Search/filter admin catalog: không đổi; teacher dùng subset GET.
