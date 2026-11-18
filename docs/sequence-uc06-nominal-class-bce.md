# Sequence diagram UC06 — Quản lý lớp danh nghĩa (BCE)

**Use case:** UC06 / UC-CAT-03 — [Đặc tả use case](./usecase-spec-uc01-uc15.md)  
**Bộ mục lục:** [sequence-uc01-uc15-bce.md](./sequence-uc01-uc15-bce.md)  
**Code:** `admin/master-data/nominal-classes/page.tsx` · `NominalClassesController` · `MasterDataService` · `nominal-class.entity.ts`

```text
[Actor] <---> [Boundary] <---> [Controller] <---> [Entity]
                                    |
                                    +---> [Controller khác]
```

Happy path không cần Control khác. UC07 sẽ gọi đọc `NominalClass` khi tạo sinh viên.

---

## 1. Ánh xạ BCE ↔ code

| BCE | Đối tượng | Code | Ghi chú |
| --- | --- | --- | --- |
| Actor | Quản trị viên | — | admin CRUD |
| Boundary | `NominalClassAdminUI` | `nominal-classes/page.tsx` + master-data API/hooks | Lớp hành chính, khác lớp HP |
| Control | `NominalClassControl` | `NominalClassesController` + service methods | `/master-data/nominal-classes` |
| Entity | `NominalClass` | `nominal-class.entity.ts` | `code` unique; `name?`; `cohortYear?`; status active/inactive |

**Update DTO:** cho phép sửa `name`, `cohortYear`, `status` — **không** đổi `code` sau tạo (`UpdateNominalClassDto`).

**Không vẽ:** ValidationPipe, Repository, apiClient, guards (gộp).

---

## 2. Luồng chính — Tạo lớp danh nghĩa

### 2.1 Mermaid

```mermaid
sequenceDiagram
  autonumber
  actor Admin as Quản trị viên
  participant UI as NominalClassAdminUI\n«boundary»
  participant Ctrl as NominalClassControl\n«control»
  participant NC as NominalClass\n«entity»

  Admin ->> UI: Thêm lớp / nhập code, name?, cohortYear?, status
  UI ->> Ctrl: POST /master-data/nominal-classes
  Ctrl ->> Ctrl: Guard admin + ValidationPipe(CreateNominalClassDto)
  Ctrl ->> NC: save(code, name, cohortYear, status)
  Note over NC: unique code
  NC -->> Ctrl: { id }
  Ctrl -->> UI: { id }
  UI ->> UI: invalidate list
  UI -->> Admin: Lớp mới trên danh sách
```

### 2.2 Bảng thông điệp

| # | Từ | Tới | Thông điệp | Code |
| --- | --- | --- | --- | --- |
| 1 | Actor | UI | Nhập mã lớp (vd. D21CQCN01) | Dialog |
| 2 | UI | Ctrl | `tạoLớpDanhNghĩa(dto)` | `createNominalClass` |
| 3 | Ctrl | Ctrl | Validate | DTO |
| 4 | Ctrl | NC | `lưu(lớp)` | `save(create({...}))` |
| 5 | NC | Ctrl | `{ id }` | |
| 6 | Ctrl | UI | `{ id }` | |
| 7 | UI | Actor | List cập nhật | |

---

## 3. Luồng thay thế

### 3.1 A1 — Tìm / lọc / phân trang

```mermaid
sequenceDiagram
  actor Admin as Quản trị viên
  participant UI as NominalClassAdminUI\n«boundary»
  participant Ctrl as NominalClassControl\n«control»
  participant NC as NominalClass\n«entity»

  Admin ->> UI: search / status / cohortYear / page
  UI ->> Ctrl: GET /master-data/nominal-classes?…
  Ctrl ->> NC: query + order code ASC
  NC -->> Ctrl: { items, total }
  Ctrl -->> UI: kết quả
```

### 3.2 A2 — Sửa lớp

```mermaid
sequenceDiagram
  actor Admin as Quản trị viên
  participant UI as NominalClassAdminUI\n«boundary»
  participant Ctrl as NominalClassControl\n«control»
  participant NC as NominalClass\n«entity»

  Admin ->> UI: Đổi name / cohortYear / status
  UI ->> Ctrl: PATCH /master-data/nominal-classes/:id
  Ctrl ->> NC: findOne + gán field cho phép + save
  NC -->> Ctrl: row
  Ctrl -->> UI: NominalClass
  Note over Ctrl: code không có trong Update DTO
```

### 3.3 A3 — Xoá lớp chưa có sinh viên

```mermaid
sequenceDiagram
  actor Admin as Quản trị viên
  participant UI as NominalClassAdminUI\n«boundary»
  participant Ctrl as NominalClassControl\n«control»
  participant NC as NominalClass\n«entity»

  Admin ->> UI: Xác nhận xoá
  UI ->> Ctrl: DELETE /master-data/nominal-classes/:id
  Ctrl ->> NC: findOne + remove
  alt Còn Student.nominal_class_id
    NC -->> Ctrl: 23503 RESTRICT
    Ctrl -->> UI: 409
    UI -->> Admin: Chuyển SV (UC07) rồi xoá
  else OK
    Ctrl -->> UI: 204
  end
```

---

## 4. Luồng ngoại lệ

```mermaid
sequenceDiagram
  participant UI as NominalClassAdminUI\n«boundary»
  participant Ctrl as NominalClassControl\n«control»
  participant NC as NominalClass\n«entity»

  UI ->> Ctrl: POST|PATCH|DELETE

  alt E1 — Thiếu code / DTO sai
    Ctrl -->> UI: 400
  else E2 — Trùng code
    Ctrl ->> NC: save
    NC -->> Ctrl: 23505
    Ctrl -->> UI: 409
  else E3 — Xoá khi còn SV
    Ctrl ->> NC: remove
    NC -->> Ctrl: 23503
    Ctrl -->> UI: 409
  else E4 — Không tìm thấy
    Ctrl -->> UI: 404 Nominal class not found
  end
```

| Ngoại lệ | Điểm cắt | Phản ứng |
| --- | --- | --- |
| E1 | ValidationPipe | Không lưu |
| E2 | Unique code | 409 |
| E3 | FK Student | 409 |
| E4 | getNominalClass | 404 |

---

## 5. Sơ đồ lớp BCE

```mermaid
classDiagram
  class QuanTriVien { <<actor>> }
  class NominalClassAdminUI {
    <<boundary>>
    +create(dto)
    +list(q)
    +update(id, dto)
    +remove(id)
  }
  class NominalClassControl { <<control>> }
  class NominalClass {
    <<entity>>
    +code
    +name
    +cohortYear
    +status
  }
  QuanTriVien --> NominalClassAdminUI
  NominalClassAdminUI --> NominalClassControl
  NominalClassControl --> NominalClass
```

---

## 6. Checklist

1. Nhấn mạnh khác `Class` (lớp HP) — note trên Boundary/Entity.
2. A2 không đổi `code`.
3. A3 kèm RESTRICT → UC07 trước.
4. Actor chỉ nối Boundary.
