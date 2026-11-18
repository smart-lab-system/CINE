# Sequence diagram UC12 — Quản lý sĩ số lớp học phần (BCE)

**Use case:** UC12 / UC-SEC-03 — [Đặc tả use case](./usecase-spec-uc01-uc15.md)  
**Bộ mục lục:** [sequence-uc01-uc15-bce.md](./sequence-uc01-uc15-bce.md)  
**Code:** tab roster `course-sections/[id]` · `RosterService` · routes roster trên `AdminCourseSectionController`  
**Include từ:** UC10

```text
[Actor] <---> [Boundary] <---> [Controller] <---> [Entity]
                                    |
                                    +---> [Controller khác]
```

---

## 1. Ánh xạ BCE ↔ code

| BCE | Đối tượng | Code | Ghi chú |
| --- | --- | --- | --- |
| Actor | Quản trị viên | — | Teacher cũng roster lớp đã gán — sơ đồ admin |
| Boundary | `RosterAdminUI` | Chi tiết lớp — tab sĩ số | Thêm catalog / tay / import / sửa tên / xoá |
| Control | `RosterControl` | `RosterService` | add / import / updateName / remove / list |
| Control khác | `CourseSectionControl` | `getEntity(id)` trước mọi thao tác | Lấy `Class` |
| Control khác | resolve catalog | `StudentEntity` trong `resolveAddInput` | Khi `studentId` hoặc khớp mssv |
| Entity | `Enrollment` | `enrollment.entity.ts` | Snapshot mssv + name; optional `studentId` |
| Entity | `Class`, `Student` | homeClass / catalog | |

**Quy tắc chống chuyển lớp cùng môn:** `assertNoCrossClassMove` — Conflict nếu MSSV đã ở lớp khác cùng `course_id` (fallback `course_name`).

**Không vẽ:** ValidationPipe, apiClient, guards (gộp).

---

## 2. Luồng chính — Thêm từ catalog

### 2.1 Mermaid

```mermaid
sequenceDiagram
  autonumber
  actor Admin as Quản trị viên
  participant UI as RosterAdminUI\n«boundary»
  participant Roster as RosterControl\n«control»
  participant Sec as CourseSectionControl\n«control»
  participant Class as Class\n«entity»
  participant Student as Student\n«entity»
  participant Enroll as Enrollment\n«entity»

  Admin ->> UI: Tìm / chọn SV catalog (studentId)
  UI ->> Roster: POST /admin/course-sections/:id/roster/students { studentId }
  Roster ->> Sec: getEntity(id)
  Sec ->> Class: findOne
  Class -->> Roster: Class (teacherId có thể null)
  Roster ->> Student: findOne(studentId)
  alt Không có / không active
    Student -->> Roster: null hoặc status≠active
    Roster -->> UI: 404 hoặc 400
  else OK
    Student -->> Roster: Student
    Roster ->> Enroll: kiểm trùng lớp + sibling cùng môn
    Roster ->> Enroll: save(mssv, name, homeClassId, homeTeacherId, studentId)
    Enroll -->> Roster: ok
    Roster -->> UI: { mssv, name }
    UI -->> Admin: Dòng mới trên sĩ số
  end
```

### 2.2 Bảng thông điệp

| # | Từ | Tới | Thông điệp | Code |
| --- | --- | --- | --- | --- |
| 1 | Actor | UI | Chọn SV từ catalog | Search/lookup |
| 2 | UI | Roster | `thêmSV(studentId)` | `addSectionStudent` |
| 3 | Roster | Sec | `getEntity` | load Class |
| 4 | Sec | Class | findOne | |
| 5 | Roster | Student | findOne + status | `resolveAddInput` |
| 6 | Roster | Enroll | assert + save | `addStudent` |
| 7 | Roster | UI | `{ mssv, name }` | |
| 8 | UI | Actor | List sĩ số | |

---

## 3. Luồng thay thế

### 3.1 A1 — Thêm tay `{ mssv, name }`

```mermaid
sequenceDiagram
  actor Admin as Quản trị viên
  participant UI as RosterAdminUI\n«boundary»
  participant Roster as RosterControl\n«control»
  participant Student as Student\n«entity»
  participant Enroll as Enrollment\n«entity»

  Admin ->> UI: Nhập mssv + name
  UI ->> Roster: POST …/roster/students { mssv, name }
  Roster ->> Student: resolveStudentId(mssv) optional
  Roster ->> Enroll: assert + save (studentId nullable)
  Roster -->> UI: { mssv, name }
```

### 3.2 A2 — Import nhiều dòng

```mermaid
sequenceDiagram
  actor Admin as Quản trị viên
  participant UI as RosterAdminUI\n«boundary»
  participant Roster as RosterControl\n«control»
  participant Enroll as Enrollment\n«entity»

  Admin ->> UI: Dán / tải danh sách MSSV+tên
  UI ->> Roster: POST …/roster (ImportRosterDto)
  Roster ->> Enroll: xử lý từng dòng (add/update theo policy import)
  Roster -->> UI: kết quả (kèm dòng lỗi nếu có)
```

### 3.3 A3 — Sửa họ tên một dòng

```mermaid
sequenceDiagram
  actor Admin as Quản trị viên
  participant UI as RosterAdminUI\n«boundary»
  participant Roster as RosterControl\n«control»
  participant Enroll as Enrollment\n«entity»

  Admin ->> UI: Đổi tên, giữ MSSV
  UI ->> Roster: PATCH …/roster/students/:mssv { name }
  Roster ->> Enroll: find + set studentName (+ resolve studentId)
  Enroll -->> Roster: entry
  Roster -->> UI: { mssv, name }
```

### 3.4 A4 — Xoá khỏi lớp

```mermaid
sequenceDiagram
  actor Admin as Quản trị viên
  participant UI as RosterAdminUI\n«boundary»
  participant Roster as RosterControl\n«control»
  participant Enroll as Enrollment\n«entity»

  Admin ->> UI: Xoá một MSSV khỏi sĩ số
  UI ->> Roster: DELETE …/roster/students/:mssv
  Roster ->> Enroll: findOne + remove
  alt Không có trong lớp
    Roster -->> UI: 404
  else OK
    Roster -->> UI: 204
  end
  Note over Enroll: Không xoá Student catalog (UC07)
```

---

## 4. Luồng ngoại lệ

```mermaid
sequenceDiagram
  participant UI as RosterAdminUI\n«boundary»
  participant Roster as RosterControl\n«control»
  participant Enroll as Enrollment\n«entity»

  UI ->> Roster: POST thêm SV

  alt E1 — Catalog không active / không tồn tại
    Roster -->> UI: 400/404
  else E2 — Trùng MSSV trong cùng lớp
    Roster -->> UI: 409 (unique / conflict)
  else E3 — Đã ở lớp khác cùng môn
    Roster ->> Enroll: assertNoCrossClassMove
    Roster -->> UI: 409 kèm tên lớp đang giữ
  else E4 — Thiếu mssv+name khi thêm tay
    Roster -->> UI: 400 Cần studentId hoặc cặp mssv+name
  else E5 — Xoá MSSV không thuộc lớp
    Roster -->> UI: 404
  end
```

| Ngoại lệ | Điểm cắt | Phản ứng |
| --- | --- | --- |
| E1 | resolveAddInput + status | Không thêm |
| E2 | unique lớp+mssv | 409 |
| E3 | sibling cùng môn | 409 + hướng dẫn xoá lớp cũ |
| E4 | validate input | 400 |
| E5 | removeStudent | 404 |

---

## 5. Sơ đồ lớp BCE

```mermaid
classDiagram
  class QuanTriVien { <<actor>> }
  class RosterAdminUI { <<boundary>> }
  class RosterControl { <<control>> }
  class CourseSectionControl { <<control>> }
  class Enrollment {
    <<entity>>
    +studentMssv
    +studentName
    +homeClassId
    +homeTeacherId
    +studentId
  }
  class Class { <<entity>> }
  class Student { <<entity>> }

  QuanTriVien --> RosterAdminUI
  RosterAdminUI --> RosterControl
  RosterControl --> CourseSectionControl
  CourseSectionControl --> Class
  RosterControl --> Student
  RosterControl --> Enrollment
```

---

## 6. Checklist

1. Happy path = thêm từ catalog `active`.
2. E3 cross-class bắt buộc trên sơ đồ ngoại lệ (đặc trưng ExamCollect).
3. Xoá sĩ số ≠ xoá hồ sơ UC07.
4. `getEntity` trước mọi thao tác — Control khác rõ ràng.
