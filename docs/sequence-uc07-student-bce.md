# Sequence diagram UC07 — Quản lý hồ sơ sinh viên (BCE)

**Use case:** UC07 / UC-CAT-04 — [Đặc tả use case](./usecase-spec-uc01-uc15.md)  
**Bộ mục lục:** [sequence-uc01-uc15-bce.md](./sequence-uc01-uc15-bce.md)  
**Code:** `admin/master-data/students/**` · `StudentsController` · `MasterDataService` · `student.entity.ts`

```text
[Actor] <---> [Boundary] <---> [Controller] <---> [Entity]
                                    |
                                    +---> [Controller khác]
```

---

## 1. Ánh xạ BCE ↔ code

| BCE | Đối tượng | Code | Ghi chú |
| --- | --- | --- | --- |
| Actor | Quản trị viên | — | Catalog SV — không có account web |
| Boundary | `StudentAdminUI` | `students/page.tsx`, `students/[id]/page.tsx` | List CRUD; trang `[id]` **chỉ đọc** + drill lớp HP |
| Control | `StudentControl` | `StudentsController` + student methods trong `MasterDataService` | `/master-data/students` |
| Control khác | `NominalClassControl` (logic) | `getNominalClass` trước create/update khi có `nominalClassId` | Kiểm lớp DN tồn tại |
| Entity | `Student` | `student.entity.ts` | mssv citext unique; ck `^[A-Za-z0-9]{4,20}$`; status active/inactive/graduated/withdrawn |
| Entity (đọc kèm) | `NominalClass`, `Enrollment`/`Class` | Chi tiết SV join lớp DN + liệt kê lớp HP | Chỉ A2 |

**Không vẽ:** ValidationPipe, Repository, apiClient, guards (gộp).

---

## 2. Luồng chính — Tạo hồ sơ sinh viên

### 2.1 Mermaid

```mermaid
sequenceDiagram
  autonumber
  actor Admin as Quản trị viên
  participant UI as StudentAdminUI\n«boundary»
  participant Stu as StudentControl\n«control»
  participant NCCtrl as NominalClassControl\n«control»
  participant NC as NominalClass\n«entity»
  participant Student as Student\n«entity»

  Admin ->> UI: Nhập mssv, fullName, chọn nominalClassId, status
  UI ->> Stu: POST /master-data/students
  Stu ->> Stu: Guard admin + ValidationPipe(CreateStudentDto)
  Stu ->> NCCtrl: getNominalClass(nominalClassId)
  NCCtrl ->> NC: findOne
  alt Lớp DN không có
    NC -->> NCCtrl: null
    NCCtrl -->> Stu: 404
    Stu -->> UI: 404
  else OK
    NC -->> Stu: NominalClass
    Stu ->> Student: save(mssv, fullName, nominalClassId, status)
    Note over Student: unique mssv; CHECK độ dài/ký tự
    Student -->> Stu: { id }
    Stu -->> UI: { id }
    UI -->> Admin: Hồ sơ trên danh sách
  end
```

### 2.2 Bảng thông điệp

| # | Từ | Tới | Thông điệp | Code |
| --- | --- | --- | --- | --- |
| 1 | Actor | UI | Nhập MSSV, họ tên, lớp DN, status | Form create |
| 2 | UI | Stu | `tạoHồSơ(dto)` | `createStudent` |
| 3 | Stu | Stu | Validate DTO | |
| 4 | Stu | NCCtrl | `kiểmLớpDanhNghĩa(id)` | `getNominalClass` (cùng MasterDataService) |
| 5 | NCCtrl | NC | `findOne` | |
| 6 | NC | Stu | NominalClass | |
| 7 | Stu | Student | `lưu(sv)` | `createStudent` → `save` |
| 8 | Student | Stu | `{ id }` | |
| 9 | Stu | UI | `{ id }` | |
| 10 | UI | Actor | List cập nhật | |

Trên sơ đồ StarUML có thể gộp NCCtrl vào self-call `StudentControl` nếu muốn ít participant — tài liệu này giữ Control khác đúng mẫu UC01 (`| +--->`).

---

## 3. Luồng thay thế

### 3.1 A1 — Tìm / lọc / phân trang

```mermaid
sequenceDiagram
  actor Admin as Quản trị viên
  participant UI as StudentAdminUI\n«boundary»
  participant Stu as StudentControl\n«control»
  participant Student as Student\n«entity»

  Admin ->> UI: search mssv|tên / nominalClassId / status / page
  UI ->> Stu: GET /master-data/students?…
  Stu ->> Student: query + order mssv
  Student -->> Stu: { items, total }
  Stu -->> UI: trang kết quả
```

### 3.2 A2 — Xem chi tiết (read-only)

```mermaid
sequenceDiagram
  autonumber
  actor Admin as Quản trị viên
  participant UI as StudentAdminUI\n«boundary»
  participant Stu as StudentControl\n«control»
  participant Student as Student\n«entity»
  participant NC as NominalClass\n«entity»
  participant Enroll as Enrollment\n«entity»
  participant Class as Class\n«entity»

  Admin ->> UI: Mở /admin/master-data/students/:id
  UI ->> Stu: GET /master-data/students/:id
  Stu ->> Student: findOne + relations nominalClass
  Student ->> NC: join
  Stu ->> Enroll: list theo mssv hoặc studentId
  Enroll ->> Class: join homeClass (+ teacher, semester…)
  Stu -->> UI: StudentDetail + courseSections[]
  UI -->> Admin: Chỉ đọc — sửa/xoá ở list (A3/A4)
```

### 3.3 A3 — Sửa hồ sơ từ danh sách

```mermaid
sequenceDiagram
  actor Admin as Quản trị viên
  participant UI as StudentAdminUI\n«boundary»
  participant Stu as StudentControl\n«control»
  participant NCCtrl as NominalClassControl\n«control»
  participant Student as Student\n«entity»

  Admin ->> UI: Đổi fullName / nominalClassId / status
  UI ->> Stu: PATCH /master-data/students/:id
  opt Đổi lớp DN
    Stu ->> NCCtrl: getNominalClass(newId)
  end
  Stu ->> Student: assign + save
  Student -->> Stu: row
  Stu -->> UI: Student
  Note over UI: Đổi khỏi active không gỡ sĩ số lớp HP đã có
```

### 3.4 A4 — Xoá hồ sơ catalog

```mermaid
sequenceDiagram
  actor Admin as Quản trị viên
  participant UI as StudentAdminUI\n«boundary»
  participant Stu as StudentControl\n«control»
  participant Student as Student\n«entity»

  Admin ->> UI: Xác nhận xoá
  UI ->> Stu: DELETE /master-data/students/:id
  Stu ->> Student: remove
  Stu -->> UI: 204
  Note over Student: Enrollment snapshot mssv/name giữ nguyên; student_id SET NULL nếu có FK
```

---

## 4. Luồng ngoại lệ

```mermaid
sequenceDiagram
  participant UI as StudentAdminUI\n«boundary»
  participant Stu as StudentControl\n«control»
  participant Student as Student\n«entity»

  UI ->> Stu: POST|PATCH

  alt E1 — MSSV sai dạng / thiếu tên / thiếu lớp
    Stu -->> UI: 400 (pipe hoặc CHECK)
  else E2 — Trùng MSSV
    Stu ->> Student: save
    Student -->> Stu: 23505
    Stu -->> UI: 409
  else E3 — Lớp DN không tồn tại
    Stu -->> UI: 404 Nominal class not found
  else E4 — Không tìm thấy SV
    Stu -->> UI: 404 Student not found
  end
```

| Ngoại lệ | Điểm cắt | Phản ứng |
| --- | --- | --- |
| E1 | DTO / `ck_student_mssv` | Không lưu |
| E2 | Unique mssv | 409 |
| E3 | NominalClassControl | 404 |
| E4 | requireStudent | 404 |

**Hệ quả nghiệp vụ (E ngoài sequence tạo):** SV `status ≠ active` → UC12 từ chối thêm từ catalog.

---

## 5. Sơ đồ lớp BCE

```mermaid
classDiagram
  class QuanTriVien { <<actor>> }
  class StudentAdminUI {
    <<boundary>>
    +createStudent(dto)
    +listStudents(q)
    +getStudent(id)
    +updateStudent(id, dto)
    +deleteStudent(id)
  }
  class StudentControl { <<control>> }
  class NominalClassControl { <<control>> }
  class Student {
    <<entity>>
    +mssv
    +fullName
    +nominalClassId
    +status
  }
  class NominalClass { <<entity>> }

  QuanTriVien --> StudentAdminUI
  StudentAdminUI --> StudentControl
  StudentControl --> NominalClassControl : kiểm lớp
  StudentControl --> Student
  NominalClassControl --> NominalClass
  Student --> NominalClass : FK
```

---

## 6. Checklist

1. Happy path có mũi tên Control → Control khác (NominalClass).
2. A2 chi tiết: Boundary read-only; không vẽ nút Sửa trên `[id]`.
3. Không tạo `Account` cho sinh viên.
4. Actor chỉ nối Boundary.
