# Sequence diagram UC09 — Quản lý máy tính phòng máy (BCE)

**Use case:** UC09 / UC-LAB-02 — [Đặc tả use case](./usecase-spec-uc01-uc15.md)  
**Bộ mục lục:** [sequence-uc01-uc15-bce.md](./sequence-uc01-uc15-bce.md)  
**Code:** `admin/master-data/computers/page.tsx` · `ComputersController` · `MasterDataService` · `computer.entity.ts`  
**Được include từ:** UC08

```text
[Actor] <---> [Boundary] <---> [Controller] <---> [Entity]
                                    |
                                    +---> [Controller khác]
```

---

## 1. Ánh xạ BCE ↔ code

| BCE | Đối tượng | Code | Ghi chú |
| --- | --- | --- | --- |
| Actor | Quản trị viên | — | admin CRUD |
| Boundary | `ComputerAdminUI` | `computers/page.tsx` (+ điều hướng từ phòng) | Form gắn `roomId` |
| Control | `ComputerControl` | `ComputersController` + computer methods | `/master-data/computers` |
| Control khác | `RoomControl` | `getRoom(roomId)` trước create / khi đổi phòng | Bảo đảm phòng tồn tại |
| Entity | `Computer` | `computer.entity.ts` | unique `(roomId, hostname)`; hostname **không** đổi qua PATCH |
| Entity | `Room` | Đọc khi kiểm / đổi phòng | FK RESTRICT |

**Không vẽ:** ValidationPipe, Repository, apiClient, guards (gộp).

---

## 2. Luồng chính — Tạo máy trong phòng

### 2.1 Mermaid

```mermaid
sequenceDiagram
  autonumber
  actor Admin as Quản trị viên
  participant UI as ComputerAdminUI\n«boundary»
  participant Comp as ComputerControl\n«control»
  participant RoomCtrl as RoomControl\n«control»
  participant Room as Room\n«entity»
  participant Computer as Computer\n«entity»

  Admin ->> UI: Chọn phòng + hostname + CPU/RAM/storage/OS/… + status
  UI ->> Comp: POST /master-data/computers
  Comp ->> Comp: Guard admin + ValidationPipe(CreateComputerDto)
  Comp ->> RoomCtrl: getRoom(roomId)
  RoomCtrl ->> Room: findOne
  alt Phòng không có
    Room -->> RoomCtrl: null
    RoomCtrl -->> Comp: 404
    Comp -->> UI: 404 Room not found
  else OK
    Room -->> Comp: Room
    Comp ->> Computer: save(roomId, hostname, specs…)
    Note over Computer: unique (room_id, hostname)
    Computer -->> Comp: { id }
    Comp -->> UI: { id }
    UI -->> Admin: Máy trên danh sách / theo phòng
  end
```

### 2.2 Bảng thông điệp

| # | Từ | Tới | Thông điệp | Code |
| --- | --- | --- | --- | --- |
| 1 | Actor | UI | Nhập máy + chọn phòng | Dialog create |
| 2 | UI | Comp | `tạoMáy(dto)` | `createComputer` |
| 3 | Comp | Comp | Validate | DTO (ramGb > 0, …) |
| 4 | Comp | RoomCtrl | `kiểmPhòng(roomId)` | `getRoom` |
| 5 | RoomCtrl | Room | `findOne` | |
| 6 | Room | Comp | Room | |
| 7 | Comp | Computer | `lưu(máy)` | `save` |
| 8 | Computer | Comp | `{ id }` | |
| 9 | Comp | UI | `{ id }` | |
| 10 | UI | Actor | List cập nhật | |

---

## 3. Luồng thay thế

### 3.1 A1 — Tìm theo phòng / từ khoá

```mermaid
sequenceDiagram
  actor Admin as Quản trị viên
  participant UI as ComputerAdminUI\n«boundary»
  participant Comp as ComputerControl\n«control»
  participant Computer as Computer\n«entity»

  Admin ->> UI: roomId / status / search (hostname|IP|location|cpu)
  UI ->> Comp: GET /master-data/computers?…
  Comp ->> Computer: query + order hostname
  Computer -->> Comp: { items, total }
  Comp -->> UI: kết quả
```

### 3.2 A2 — Sửa máy

```mermaid
sequenceDiagram
  actor Admin as Quản trị viên
  participant UI as ComputerAdminUI\n«boundary»
  participant Comp as ComputerControl\n«control»
  participant RoomCtrl as RoomControl\n«control»
  participant Computer as Computer\n«entity»

  Admin ->> UI: Đổi phòng / vị trí / cấu hình / IP / status
  UI ->> Comp: PATCH /master-data/computers/:id
  Note over Comp: hostname không có trong UpdateComputerDto
  opt Đổi roomId
    Comp ->> RoomCtrl: getRoom(newRoomId)
  end
  Comp ->> Computer: assign + save
  alt Trùng hostname ở phòng đích
    Computer -->> Comp: 23505
    Comp -->> UI: 409
  else OK
    Comp -->> UI: Computer
  end
```

### 3.3 A3 — Xoá máy

```mermaid
sequenceDiagram
  actor Admin as Quản trị viên
  participant UI as ComputerAdminUI\n«boundary»
  participant Comp as ComputerControl\n«control»
  participant Computer as Computer\n«entity»

  Admin ->> UI: Xác nhận xoá
  UI ->> Comp: DELETE /master-data/computers/:id
  Comp ->> Computer: findOne + remove
  Comp -->> UI: 204
```

---

## 4. Luồng ngoại lệ

```mermaid
sequenceDiagram
  participant UI as ComputerAdminUI\n«boundary»
  participant Comp as ComputerControl\n«control»
  participant Computer as Computer\n«entity»

  UI ->> Comp: POST|PATCH|DELETE

  alt E1 — Thiếu field / RAM ≤ 0 / DTO sai
    Comp -->> UI: 400
  else E2 — Trùng hostname trong cùng phòng
    Comp ->> Computer: save
    Computer -->> Comp: 23505
    Comp -->> UI: 409
  else E3 — Phòng không tồn tại / đổi phòng đích trùng hostname
    Comp -->> UI: 404 hoặc 409
  else E4 — Không tìm thấy máy
    Comp -->> UI: 404 Computer not found
  end
```

| Ngoại lệ | Điểm cắt | Phản ứng |
| --- | --- | --- |
| E1 | ValidationPipe | Không lưu |
| E2 | Unique (room, hostname) | 409 |
| E3 | RoomControl / unique phòng đích | 404/409 |
| E4 | getComputer | 404 |

---

## 5. Sơ đồ lớp BCE

```mermaid
classDiagram
  class QuanTriVien { <<actor>> }
  class ComputerAdminUI {
    <<boundary>>
    +createComputer(dto)
    +listComputers(q)
    +updateComputer(id, dto)
    +deleteComputer(id)
  }
  class ComputerControl { <<control>> }
  class RoomControl { <<control>> }
  class Computer {
    <<entity>>
    +roomId
    +hostname
    +cpu
    +ramGb
    +status
  }
  class Room { <<entity>> }

  QuanTriVien --> ComputerAdminUI
  ComputerAdminUI --> ComputerControl
  ComputerControl --> RoomControl : kiểm phòng
  ComputerControl --> Computer
  RoomControl --> Room
  Computer --> Room : FK
```

---

## 6. Checklist

1. Luôn có Control → RoomControl trên create (và khi đổi phòng).
2. Note: hostname bất biến sau tạo.
3. Cùng hostname ở **phòng khác** vẫn hợp lệ — chỉ unique theo phòng.
4. Actor chỉ nối Boundary.
