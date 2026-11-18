# Sequence diagram UC13 — Quản lý tiện ích IDE (BCE)

**Use case:** UC13 / UC-IDE-01 — [Đặc tả use case](./usecase-spec-uc01-uc15.md)  
**Bộ mục lục:** [sequence-uc01-uc15-bce.md](./sequence-uc01-uc15-bce.md)  
**Code:** `admin/ide-utilities/**` · `IdeExtensionsController` · `IdeExtensionsService` · `ide-extensions/entities/*`

```text
[Actor] <---> [Boundary] <---> [Controller] <---> [Entity]
                                    |
                                    +---> [Controller khác]
```

Một Nest service điều phối nhiều Entity. Trên sơ đồ giữ **một** `IdeExtensionControl`; nhánh phụ ghi note / tách sequence — không bịa thêm controller Nest không tồn tại.

---

## 1. Ánh xạ BCE ↔ code

| BCE | Đối tượng | Code | Ghi chú |
| --- | --- | --- | --- |
| Actor chính | Quản trị viên | — | Duyệt version / course policy, CRUD catalog |
| Actor phụ | Giảng viên | — | Đề xuất theo môn, xem scan; **không** approve admin-only |
| Boundary | `IdeUtilityAdminUI` | `ide-utilities/page.tsx`, `[id]/page.tsx` | Tab catalog / theo môn / kết quả quét |
| Control | `IdeExtensionControl` | `ide-extensions.controller.ts` + `ide-extensions.service.ts` | `/ide-extensions/...` |
| Entity | `IdeExtension` | catalog extension | identifier `publisher.name` |
| Entity | `IdeExtensionVersion` | version cụ thể hoặc `*` | approval_status pending/approved/… |
| Entity | `IdeExtensionPolicy` / `PolicyItem` | scope course | pending → approved |
| Entity | `IdeExtensionScan` (+ items) | kết quả Hub đồng bộ | read + from-scan |

**Không vẽ:** ValidationPipe, Marketplace HTTP client (gộp self-call Control khi refresh), apiClient, guards (gộp — ghi chú role trên từng nhánh).

---

## 2. Luồng chính — Thêm catalog + duyệt phiên bản

### 2.1 Mermaid

```mermaid
sequenceDiagram
  autonumber
  actor Admin as Quản trị viên
  participant UI as IdeUtilityAdminUI\n«boundary»
  participant Ide as IdeExtensionControl\n«control»
  participant Ext as IdeExtension\n«entity»
  participant Ver as IdeExtensionVersion\n«entity»

  Admin ->> UI: Tab Catalog — nhập displayName, publisher, identifier
  UI ->> Ide: POST /ide-extensions/catalog
  Ide ->> Ide: Guard Roles(admin) + validate
  Ide ->> Ext: save(extension)
  Ext -->> Ide: id
  Ide -->> UI: CatalogExtension
  Admin ->> UI: Mở chi tiết / thêm version (vd. 1.2.3 hoặc *)
  UI ->> Ide: POST /catalog/:id/versions { version }
  Ide ->> Ver: save(approvalStatus=pending)
  Ver -->> Ide: version row
  Ide -->> UI: version pending
  Admin ->> UI: Duyệt phiên bản
  UI ->> Ide: PATCH /versions/:versionId/approve
  Ide ->> Ver: approvalStatus=approved, approvedAt, approvedBy
  Ver -->> Ide: ok
  Ide ->> Ide: tính catalogStatus (wildcard / fully / pending / none)
  Ide -->> UI: trạng thái đã duyệt
  UI -->> Admin: Extension được phép tầng global theo quy tắc version
```

### 2.2 Bảng thông điệp

| # | Từ | Tới | Thông điệp | Code |
| --- | --- | --- | --- | --- |
| 1 | Actor | UI | Thêm extension | Tab catalog |
| 2 | UI | Ide | `tạoCatalog(dto)` | `createCatalog` |
| 3 | Ide | Ext | `save` | `createCatalogExtension` |
| 4 | Ide | UI | extension | |
| 5 | Actor | UI | Thêm version | Chi tiết |
| 6 | UI | Ide | `thêmVersion` | `addCatalogVersion` |
| 7 | Ide | Ver | `save pending` | |
| 8 | Actor | UI | Duyệt | |
| 9 | UI | Ide | `duyệtVersion` | `approveVersion` |
| 10 | Ide | Ver | set approved | |
| 11 | Ide | UI | status tổng hợp | `CATALOG_STATUS_LABEL` |

**Quy tắc allowlist (note, không phải message Actor):** `*` approved → mọi version; không `*` → chỉ exact version approved; không approved → blocked.

---

## 3. Luồng thay thế

### 3.1 A1 — Bỏ duyệt / xoá version

```mermaid
sequenceDiagram
  actor Admin as Quản trị viên
  participant UI as IdeUtilityAdminUI\n«boundary»
  participant Ide as IdeExtensionControl\n«control»
  participant Ver as IdeExtensionVersion\n«entity»

  Admin ->> UI: Unapprove hoặc Delete version
  alt Unapprove
    UI ->> Ide: PATCH /versions/:id/unapprove
    Ide ->> Ver: về pending / clear approvedAt
  else Delete
    UI ->> Ide: DELETE /versions/:id
    Ide ->> Ver: remove
  end
  Ide -->> UI: catalogStatus tính lại
```

### 3.2 A2 — Đưa vào catalog từ bản quét

```mermaid
sequenceDiagram
  actor Admin as Quản trị viên
  participant UI as IdeUtilityAdminUI\n«boundary»
  participant Ide as IdeExtensionControl\n«control»
  participant Ext as IdeExtension\n«entity»
  participant Ver as IdeExtensionVersion\n«entity»

  Admin ->> UI: Tab Kết quả quét — Thêm vào catalog
  UI ->> Ide: POST /catalog/from-scan { extensionId, version?, displayName? }
  Ide ->> Ide: Roles(admin)
  Ide ->> Ext: upsert extension
  Ide ->> Ver: upsert version pending nếu có
  Ide -->> UI: { alreadyExists | createdExtension | createdVersion }
  Note over UI: Vẫn phải duyệt (bước 9 luồng chính)
```

### 3.3 A3 — Đề xuất theo môn

```mermaid
sequenceDiagram
  actor User as Admin hoặc Giảng viên
  participant UI as IdeUtilityAdminUI\n«boundary»
  participant Ide as IdeExtensionControl\n«control»
  participant Item as PolicyItem\n«entity»

  User ->> UI: Tab Theo môn — courseId + publisher.name
  UI ->> Ide: POST /policies/course/items
  Ide ->> Ide: Roles(admin|teacher)
  Ide ->> Item: save pending + proposedBy
  Item -->> Ide: ok
  Ide -->> UI: item pending
```

### 3.4 A4 — Duyệt / từ chối / gỡ theo môn (admin)

```mermaid
sequenceDiagram
  actor Admin as Quản trị viên
  participant UI as IdeUtilityAdminUI\n«boundary»
  participant Ide as IdeExtensionControl\n«control»
  participant Item as PolicyItem\n«entity»

  Admin ->> UI: Approve / Reject / Remove
  alt Approve
    UI ->> Ide: PATCH /policies/items/:id/approve
    Ide ->> Item: approved
  else Reject
    UI ->> Ide: PATCH …/reject
    Ide ->> Item: rejected
  else Remove
    UI ->> Ide: DELETE /policies/items/:id
    Ide ->> Item: remove
  end
  Note over Ide: Teacher gọi approve/reject/delete → 403
```

### 3.5 A5 — Xem kết quả quét

```mermaid
sequenceDiagram
  actor Admin as Quản trị viên
  participant UI as IdeUtilityAdminUI\n«boundary»
  participant Ide as IdeExtensionControl\n«control»
  participant Scan as IdeExtensionScan\n«entity»

  Admin ->> UI: Tab Kết quả quét
  UI ->> Ide: GET /scans
  Ide ->> Scan: list
  Scan -->> UI: tóm tắt MSSV / máy / violationCount
  Admin ->> UI: Chọn một scan
  UI ->> Ide: GET /scans/:id
  Ide -->> UI: items + trạng thái đối chiếu
```

### 3.6 A6 — Làm mới Marketplace

```mermaid
sequenceDiagram
  actor Admin as Quản trị viên
  participant UI as IdeUtilityAdminUI\n«boundary»
  participant Ide as IdeExtensionControl\n«control»
  participant Ext as IdeExtension\n«entity»

  Admin ->> UI: Refresh Marketplace
  UI ->> Ide: POST /catalog/:id/refresh-marketplace
  Ide ->> Ide: gọi nguồn Marketplace (self)
  Ide ->> Ext: cập nhật publishedAt / lastReleasedAt
  Ide -->> UI: detail
```

---

## 4. Luồng ngoại lệ

```mermaid
sequenceDiagram
  participant UI as IdeUtilityAdminUI\n«boundary»
  participant Ide as IdeExtensionControl\n«control»

  UI ->> Ide: thao tác catalog / policy

  alt E1 — Thiếu displayName / publisher / identifier
    Ide -->> UI: 400
  else E2 — Trùng identifier / from-scan alreadyExists
    Ide -->> UI: 409 hoặc { alreadyExists: true }
  else E3 — courseId / extension không hợp lệ khi đề xuất
    Ide -->> UI: 400/404
  else E4 — Teacher duyệt policy / tạo catalog
    Ide -->> UI: 403
  else E5 — Chưa có scan
    Ide -->> UI: 200 items=[]
    UI -->> UI: empty state (không phải crash)
  end
```

| Ngoại lệ | Điểm cắt | Phản ứng |
| --- | --- | --- |
| E1 | validate create | Không tạo |
| E2 | unique / upsert | Báo đã có |
| E3 | policy create | 400/404 |
| E4 | `@Roles('admin')` trên approve | 403 |
| E5 | listScans rỗng | UI empty |

---

## 5. Sơ đồ lớp BCE

```mermaid
classDiagram
  class QuanTriVien { <<actor>> }
  class GiangVien { <<actor>> }
  class IdeUtilityAdminUI { <<boundary>> }
  class IdeExtensionControl { <<control>> }
  class IdeExtension { <<entity>> }
  class IdeExtensionVersion { <<entity>> }
  class PolicyItem { <<entity>> }
  class IdeExtensionScan { <<entity>> }

  QuanTriVien --> IdeUtilityAdminUI
  GiangVien --> IdeUtilityAdminUI : đề xuất / xem
  IdeUtilityAdminUI --> IdeExtensionControl
  IdeExtensionControl --> IdeExtension
  IdeExtensionControl --> IdeExtensionVersion
  IdeExtensionControl --> PolicyItem
  IdeExtensionControl --> IdeExtensionScan
  IdeExtension "1" --> "*" IdeExtensionVersion
```

---

## 6. Checklist

1. Happy path = catalog + approve version (tầng global).
2. Tách A3–A5 thành sơ đồ phụ — tránh một sequence quá dày.
3. Ghi rõ role admin vs teacher trên từng mũi tên nhạy cảm.
4. Không vẽ agent LAN / Hub như Entity web — scan đã sync sẵn.
