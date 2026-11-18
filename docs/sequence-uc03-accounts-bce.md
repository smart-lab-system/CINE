# Sequence diagram UC03 — Quản lý tài khoản người dùng (BCE)

**Use case:** UC03 / UC-ACC-01 — [Đặc tả use case](./usecase-spec-uc01-uc15.md)  
**Bộ mục lục:** [sequence-uc01-uc15-bce.md](./sequence-uc01-uc15-bce.md)  
**Phương pháp:** Jacobson BCE (Boundary · Control · Entity)  
**Nguồn đối chiếu code:** `apps/web/admin/accounts` · `apps/api/accounts`

Chuỗi quan hệ chuẩn:

```text
[Actor] <---> [Boundary] <---> [Controller] <---> [Entity]
                                    |
                                    +---> [Controller khác]
```

---

## 1. Ánh xạ BCE ↔ code

| Vai trò BCE | Đối tượng trên sơ đồ | File / lớp trong code | Ghi chú |
| --- | --- | --- | --- |
| **Actor** | Quản trị viên | — | `@Roles('admin')` trên mọi route accounts |
| **Boundary** | `AccountAdminUI` | `apps/web/src/app/admin/accounts/page.tsx` + `hooks/useAccounts.ts` + `lib/api/accounts.ts` | Dialog tạo/sửa; bảng list; nút vô hiệu/xoá |
| **Control** | `AccountControl` | `accounts.controller.ts` · `accounts.service.ts` · DTO create/update/search | CRUD + deactivate/reactivate |
| **Control** (nội bộ) | Hash mật khẩu | `argon2.hash` trong `AccountsService.create` | Không tách participant; ghi self-call trên Control |
| **Entity** | `Account` | `identity/entities/account.entity.ts` | `name`, `email`, `passwordHash`, `role`, `isActive` |

**Quy tắc BCE đã áp dụng**

- Actor ↔ `AccountAdminUI` only.
- Boundary gọi Nest qua `apiClient` (Bearer access token) — gộp vào mũi tên Boundary → Control.
- `JwtAuthGuard` + `RolesGuard` gộp vào bước vào `AccountControl`.
- Không có Control khác bắt buộc; argon2 là thao tác trong `AccountControl`.

**Không vẽ riêng**

- TanStack Query invalidate — phản hồi Boundary sau success.
- `PostgresExceptionFilter` map 23505 → 409 — ghi trong ngoại lệ.

---

## 2. Luồng chính (Happy path) — Tạo tài khoản

### 2.1 Mermaid

```mermaid
sequenceDiagram
  autonumber
  actor Admin as Quản trị viên
  participant UI as AccountAdminUI\n«boundary»
  participant Acc as AccountControl\n«control»
  participant Account as Account\n«entity»

  Admin ->> UI: Mở dialog Tạo tài khoản
  Admin ->> UI: Nhập name, email, password (8–128), role
  UI ->> Acc: POST /accounts { name, email, password, role }
  Acc ->> Acc: JwtAuthGuard + RolesGuard(admin)
  Acc ->> Acc: ValidationPipe(CreateAccountDto)
  Acc ->> Acc: argon2.hash(password) → passwordHash
  Acc ->> Account: save(name, email, passwordHash, role, isActive=true)
  Account -->> Acc: { id }
  Acc -->> UI: 201/200 { id }
  UI ->> UI: invalidateQueries(accounts) + đóng dialog
  UI -->> Admin: Danh sách có tài khoản mới (không hiện password)
```

### 2.2 Bảng thông điệp

| # | Từ | Tới | Thông điệp / thao tác | Ghi chú code |
| --- | --- | --- | --- | --- |
| 1 | Actor | `AccountAdminUI` | Mở form tạo + nhập liệu | Dialog + `AccountForm` |
| 2 | `AccountAdminUI` | `AccountControl` | `tạoTàiKhoản(dto)` | `createAccount` → `POST /accounts` |
| 3 | `AccountControl` | `AccountControl` | Xác thực JWT + role admin | Guards |
| 4 | `AccountControl` | `AccountControl` | `kiểmTraĐịnhDạng(CreateAccountDto)` | `@IsEmail`, `@Length(8,128)`, `@IsIn(admin\|teacher)` |
| 5 | `AccountControl` | `AccountControl` | `bămMậtKhẩu(password)` | `argon2.hash(..., argon2id)` |
| 6 | `AccountControl` | `Account` | `lưu(account)` | `accounts.save(create(...))` |
| 7 | `Account` | `AccountControl` | `{ id }` | |
| 8 | `AccountControl` | `AccountAdminUI` | `{ id }` | |
| 9 | `AccountAdminUI` | Actor | Làm mới list / toast | `useCreateAccount.onSuccess` |

---

## 3. Luồng thay thế

### 3.1 A1 — Tìm và lọc danh sách

```mermaid
sequenceDiagram
  autonumber
  actor Admin as Quản trị viên
  participant UI as AccountAdminUI\n«boundary»
  participant Acc as AccountControl\n«control»
  participant Account as Account\n«entity»

  Admin ->> UI: Nhập search / chọn role / isActive / trang
  UI ->> Acc: GET /accounts?search&role&isActive&page&pageSize
  Acc ->> Account: queryBuilder (ILIKE name|email, filter, order, skip/take)
  Account -->> Acc: { items: AccountView[], total }
  Acc -->> UI: trang kết quả
  UI -->> Admin: Bảng tài khoản
```

| # | Từ | Tới | Thông điệp | Code |
| --- | --- | --- | --- | --- |
| 1 | Actor | UI | Đổi bộ lọc | URL/search params |
| 2 | UI | Acc | `tìmKiếm(query)` | `searchAccounts` |
| 3 | Acc | Account | Query có điều kiện | `AccountsService.search` |
| 4 | Acc | UI | `AccountView[]` (không có passwordHash) | `toView` |

### 3.2 A2 — Sửa thông tin

```mermaid
sequenceDiagram
  autonumber
  actor Admin as Quản trị viên
  participant UI as AccountAdminUI\n«boundary»
  participant Acc as AccountControl\n«control»
  participant Account as Account\n«entity»

  Admin ->> UI: Sửa name / email / role trên một hàng
  UI ->> Acc: PATCH /accounts/:id { name?, email?, role? }
  Acc ->> Account: findOne(id)
  Account -->> Acc: Account
  Acc ->> Account: update(...)
  Account -->> Acc: AccountView
  Acc -->> UI: AccountView
  UI -->> Admin: Hàng đã cập nhật
```

Không đổi mật khẩu ở nhánh này (`UpdateAccountDto` không có password).

### 3.3 A3 — Vô hiệu hoá

```mermaid
sequenceDiagram
  autonumber
  actor Admin as Quản trị viên
  participant UI as AccountAdminUI\n«boundary»
  participant Acc as AccountControl\n«control»
  participant Account as Account\n«entity»

  Admin ->> UI: Chọn vô hiệu hoá (isActive đang true)
  UI ->> Acc: PATCH /accounts/:id/deactivate
  Acc ->> Account: findOne(id)
  Acc ->> Account: update(isActive=false)
  Acc -->> UI: 204
  UI -->> Admin: Trạng thái «vô hiệu»
  Note over Account: Login/refresh sau đó bị AuthControl từ chối
```

### 3.4 A4 — Kích hoạt lại

Đối xứng A3: `PATCH /accounts/:id/reactivate` → `isActive=true`.

### 3.5 A5 — Xoá cứng

```mermaid
sequenceDiagram
  autonumber
  actor Admin as Quản trị viên
  participant UI as AccountAdminUI\n«boundary»
  participant Acc as AccountControl\n«control»
  participant Account as Account\n«entity»

  Admin ->> UI: Xác nhận xoá
  UI ->> Acc: DELETE /accounts/:id
  Acc ->> Account: findOne(id)
  Acc ->> Account: delete(id)
  alt FK RESTRICT (đã dạy / có phiên…)
    Account -->> Acc: 23503
    Acc -->> UI: 409
    UI -->> Admin: Không xoá được — dùng vô hiệu hoá
  else Thành công
    Acc -->> UI: 204
    UI -->> Admin: Hàng biến mất khỏi list
  end
```

---

## 4. Luồng ngoại lệ

```mermaid
sequenceDiagram
  autonumber
  actor Admin as Quản trị viên
  participant UI as AccountAdminUI\n«boundary»
  participant Acc as AccountControl\n«control»
  participant Account as Account\n«entity»

  Admin ->> UI: Gửi form tạo/sửa
  UI ->> Acc: POST|PATCH /accounts...

  alt E1 — DTO không hợp lệ
    Acc ->> Acc: ValidationPipe từ chối
    Acc -->> UI: 400
    UI -->> Admin: Báo lỗi trường / toast
  else E2 — Email trùng
    Acc ->> Account: save
    Account -->> Acc: 23505 unique
    Acc -->> UI: 409
    UI -->> Admin: Trùng email
  else E3 — Xoá bị FK chặn
    Acc ->> Account: delete
    Account -->> Acc: 23503
    Acc -->> UI: 409
    UI -->> Admin: Gợi ý deactivate (A3)
  else E4 — Không tìm thấy id
    Acc ->> Account: findOne
    Account -->> Acc: null
    Acc -->> UI: 404 Account not found
  end
```

| Ngoại lệ | Điểm cắt BCE | Phản ứng |
| --- | --- | --- |
| E1 | `AccountControl` ValidationPipe | Không ghi Entity |
| E2 | `Account` unique email | 409 |
| E3 | `Account` DELETE + FK | 409; dùng A3 |
| E4 | `findOrThrow` | 404 |
| (auth) | Guards | 401/403 nếu không phải admin |

---

## 5. Sơ đồ lớp BCE

```mermaid
classDiagram
  direction LR
  class QuanTriVien {
    <<actor>>
  }
  class AccountAdminUI {
    <<boundary>>
    +createAccount(dto)
    +searchAccounts(query)
    +updateAccount(id, dto)
    +deactivate(id)
    +reactivate(id)
    +deleteAccount(id)
  }
  class AccountControl {
    <<control>>
    +create(dto)
    +search(query)
    +update(id, dto)
    +deactivate(id)
    +reactivate(id)
    +remove(id)
  }
  class Account {
    <<entity>>
    +id
    +name
    +email
    +passwordHash
    +role
    +isActive
  }

  QuanTriVien --> AccountAdminUI : tương tác
  AccountAdminUI --> AccountControl : gọi
  AccountControl --> Account : đọc/ghi
```

---

## 6. Checklist khi vẽ lại

1. Happy path = **tạo** tài khoản; A1–A5 là sơ đồ/frame riêng.
2. Không hiện `passwordHash` trên Boundary response (`AccountView`).
3. A3/A4 không audit (đúng comment service) — không vẽ `AuditLog` cho UC03.
4. A5 luôn có nhánh 409 FK.
5. Actor chỉ nối Boundary; Entity không gọi ngược.
