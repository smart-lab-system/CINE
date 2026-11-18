# Sequence diagram UC05 — Quản lý môn học (BCE)

**Use case:** UC05 / UC-CAT-02 — [Đặc tả use case](./usecase-spec-uc01-uc15.md)  
**Bộ mục lục:** [sequence-uc01-uc15-bce.md](./sequence-uc01-uc15-bce.md)  
**Phương pháp:** Jacobson BCE · **Code:** `admin/master-data/courses/page.tsx` · `CoursesController` · `MasterDataService` · `course.entity.ts`

```text
[Actor] <---> [Boundary] <---> [Controller] <---> [Entity]
                                    |
                                    +---> [Controller khác]
```

UC05 **không** bắt buộc Control khác trên happy path tạo môn. (Lớp HP / IDE policy gọi `Course` ở UC khác.)

---

## 1. Ánh xạ BCE ↔ code

| BCE | Đối tượng | Code | Ghi chú |
| --- | --- | --- | --- |
| Actor | Quản trị viên | — | `@Roles('admin')` C/U/D |
| Boundary | `CourseAdminUI` | `courses/page.tsx` + `useMasterData` / `lib/api/master-data.ts` | Catalog list + dialog |
| Control | `CourseControl` | `CoursesController` + `createCourse` / `updateCourse` / `removeCourse` / `listCourses` | `/master-data/courses` |
| Entity | `Course` | `course.entity.ts` | `code` unique; `name`; status `active` \| `inactive` |

**Không vẽ:** ValidationPipe, Repository, apiClient, Jwt guards (gộp bước vào Control).

---

## 2. Luồng chính — Tạo môn học

### 2.1 Mermaid

```mermaid
sequenceDiagram
  autonumber
  actor Admin as Quản trị viên
  participant UI as CourseAdminUI\n«boundary»
  participant Ctrl as CourseControl\n«control»
  participant Course as Course\n«entity»

  Admin ->> UI: Mở thêm môn / nhập code, name, status
  UI ->> Ctrl: POST /master-data/courses
  Ctrl ->> Ctrl: Guard admin + ValidationPipe(CreateCourseDto)
  Ctrl ->> Course: save(code, name, status)
  Note over Course: unique code
  Course -->> Ctrl: { id }
  Ctrl -->> UI: { id }
  UI ->> UI: invalidate courses query
  UI -->> Admin: Môn mới trên danh sách
```

### 2.2 Bảng thông điệp

| # | Từ | Tới | Thông điệp | Code |
| --- | --- | --- | --- | --- |
| 1 | Actor | UI | Nhập mã, tên, trạng thái | Dialog |
| 2 | UI | Ctrl | `tạoMôn(dto)` | `createCourse` |
| 3 | Ctrl | Ctrl | Validate `@Length` code≤50, name≤200, status | `CreateCourseDto` |
| 4 | Ctrl | Course | `lưu(môn)` | `createCourse` → `save` |
| 5 | Course | Ctrl | `{ id }` | |
| 6 | Ctrl | UI | `{ id }` | |
| 7 | UI | Actor | List cập nhật | |

---

## 3. Luồng thay thế

### 3.1 A1 — Tìm / lọc / phân trang

```mermaid
sequenceDiagram
  actor Admin as Quản trị viên
  participant UI as CourseAdminUI\n«boundary»
  participant Ctrl as CourseControl\n«control»
  participant Course as Course\n«entity»

  Admin ->> UI: search / status / page
  UI ->> Ctrl: GET /master-data/courses?…
  Ctrl ->> Course: query ILIKE code|name + status + pagination
  Course -->> Ctrl: { items, total }
  Ctrl -->> UI: kết quả
  UI -->> Admin: Bảng môn
```

### 3.2 A2 — Sửa môn

```mermaid
sequenceDiagram
  actor Admin as Quản trị viên
  participant UI as CourseAdminUI\n«boundary»
  participant Ctrl as CourseControl\n«control»
  participant Course as Course\n«entity»

  Admin ->> UI: Đổi name và/hoặc status
  UI ->> Ctrl: PATCH /master-data/courses/:id
  Note over Ctrl: UpdateCourseDto — không có code trong update hiện tại
  Ctrl ->> Course: findOne + assign + save
  Course -->> Ctrl: row
  Ctrl -->> UI: Course
```

### 3.3 A3 — Xoá môn chưa dùng

```mermaid
sequenceDiagram
  actor Admin as Quản trị viên
  participant UI as CourseAdminUI\n«boundary»
  participant Ctrl as CourseControl\n«control»
  participant Course as Course\n«entity»

  Admin ->> UI: Xác nhận xoá
  UI ->> Ctrl: DELETE /master-data/courses/:id
  Ctrl ->> Course: findOne + remove
  alt Còn class.course_id (RESTRICT)
    Course -->> Ctrl: 23503
    Ctrl -->> UI: 409
    UI -->> Admin: Chuyển inactive (A2) thay vì xoá
  else OK
    Ctrl -->> UI: 204
  end
```

---

## 4. Luồng ngoại lệ

```mermaid
sequenceDiagram
  participant UI as CourseAdminUI\n«boundary»
  participant Ctrl as CourseControl\n«control»
  participant Course as Course\n«entity»

  UI ->> Ctrl: POST|PATCH|DELETE

  alt E1 — Thiếu/sai DTO
    Ctrl -->> UI: 400
  else E2 — Trùng code (create)
    Ctrl ->> Course: save
    Course -->> Ctrl: 23505
    Ctrl -->> UI: 409
  else E3 — Xoá khi còn lớp HP
    Ctrl ->> Course: remove
    Course -->> Ctrl: 23503
    Ctrl -->> UI: 409
  else E4 — Không tìm thấy
    Ctrl ->> Course: findOne
    Course -->> Ctrl: null
    Ctrl -->> UI: 404 Course not found
  end
```

| Ngoại lệ | Điểm cắt | Phản ứng |
| --- | --- | --- |
| E1 | ValidationPipe | Không lưu |
| E2 | Unique `code` | 409 |
| E3 | FK từ `class` | 409; dùng `inactive` |
| E4 | getCourse | 404 |

---

## 5. Sơ đồ lớp BCE

```mermaid
classDiagram
  class QuanTriVien { <<actor>> }
  class CourseAdminUI {
    <<boundary>>
    +createCourse(dto)
    +listCourses(q)
    +updateCourse(id, dto)
    +deleteCourse(id)
  }
  class CourseControl { <<control>> }
  class Course {
    <<entity>>
    +code
    +name
    +status
  }
  QuanTriVien --> CourseAdminUI
  CourseAdminUI --> CourseControl
  CourseControl --> Course
```

---

## 6. Checklist

1. Happy path = tạo môn; A1–A3 tách frame.
2. Không vẽ credits / FK năm (không có trong entity).
3. A3 luôn kèm nhánh RESTRICT → gợi ý `inactive`.
4. Actor chỉ nối Boundary.
