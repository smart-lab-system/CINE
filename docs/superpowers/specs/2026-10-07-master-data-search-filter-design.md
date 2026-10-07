# Master data — search, filter & drill-down — thiết kế

**Ngày:** 2026-10-07 · **Branch:** `feature/master-data-search-filter` · **Baseline:** catalog CRUD đã có  
**Trạng thái:** implemented (local, chưa chia commit)

Bổ sung **search / filter** và **drill-down parent → child** trên các trang admin
catalog + trang Quản lý tài khoản. Không tách năm học/học kỳ hay phòng/máy
thành trang riêng. Không gắn catalog vào phiên thi / lớp môn.

---

## 0. Vì sao cần cái này

Catalog master data đã có CRUD nhưng list gần như chỉ `page` / `pageSize`.
Khi dữ liệu seed lớn, admin không tìm được một bản ghi cụ thể và không
đi từ cha → con (năm → kỳ, lớp → SV, phòng → máy) một cách tự nhiên.

Accounts đã có search + lọc role — dùng làm mẫu UX cho các trang catalog.

---

## 1. Phạm vi

### 1.1 Trong phạm vi

| Hạng mục | Ghi chú |
|---|---|
| Search + filter trên 6 bề mặt admin dưới đây | UI + query API khi còn thiếu |
| Drill-down cùng trang: năm → kỳ, phòng → máy | Click dòng cha = set filter bảng con |
| Drill-down cross-page: lớp → sinh viên | `?classId=` trên trang SV |
| URL query đồng bộ filter chính | Shareable / refresh giữ ngữ cảnh |
| Debounce search ~300ms | Mirror Accounts |
| Chip “Đang lọc” + nút xóa lọc | Mọi trang có filter active |

### 1.2 Cố ý KHÔNG trong phạm vi

- Tách trang Năm học / Học kỳ, Phòng / Máy.
- Expandable row, Sheet/Drawer chi tiết.
- Trang chi tiết từng entity (`/students/[id]`).
- Filter theo khoảng ngày năm học / học kỳ.
- Import Excel, soft-delete, đổi schema FK sang bảng cũ.
- Đổi luồng phiên thi / grading / agent.

---

## 2. Quyết định UX

### 2.1 Giữ trang ghép

| Trang | Bảng |
|---|---|
| `/admin/master-data/academic` | Năm học + Học kỳ |
| `/admin/master-data/rooms` | Phòng + Máy tính |
| `/admin/master-data/nominal-classes` | Chỉ lớp |
| `/admin/master-data/students` | Chỉ sinh viên |
| `/admin/master-data/courses` | Chỉ môn |
| `/admin/accounts` | Tài khoản |

### 2.2 Drill-down

```
[Năm học row click] ──► filter Học kỳ (academicYearId)   cùng trang
[Phòng row click]   ──► filter Máy (roomId)               cùng trang
[Lớp row click]     ──► /students?classId=…               sang trang SV
```

- Click cha **không** mở dialog edit; Edit/Delete giữ icon riêng (stopPropagation).
- Dòng cha đang active được highlight; bảng con hiện chip “Đang xem: {code}”.
- “Xóa lọc” / click lại dòng đang chọn → về “Tất cả”.
- Select filter (nếu còn) đồng bộ với state click — một nguồn sự thật.

### 2.3 Search kết hợp filter

Search và filter **AND** với nhau. Ví dụ:

- `?classId=…&q=2152` — SV trong lớp, khớp MSSV/tên
- `?roomId=…&q=PC-01` — máy trong phòng, khớp hostname/IP/vị trí

Tìm một bản ghi con **không bắt buộc** phải biết cha: bỏ filter cha, chỉ dùng `q`.

### 2.4 URL query

| Param | Dùng cho |
|---|---|
| `q` | Search text (mọi list có search) |
| `status` | Filter trạng thái entity |
| `yearId` | Học kỳ lọc theo năm (academic) |
| `classId` | Sinh viên lọc theo lớp |
| `roomId` | Máy lọc theo phòng |
| `cohortYear` | Lớp lọc theo năm khóa |
| `building` | Phòng lọc theo tòa (nếu implement) |
| `role` | Accounts (đã có) |
| `isActive` | Accounts (mới) |
| `page` | Phân trang |

Đọc query khi mount; đổi filter/search → `router.replace` (không push history mỗi debounce).

---

## 3. Ma trận search / filter theo trang

### 3.1 Quản lý tài khoản — `/admin/accounts`

| Điều khiển | Target | Ghi chú |
|---|---|---|
| Search `q` | `name`, `email` | **Đã có** |
| Filter role | `admin` \| `teacher` | **Đã có** |
| Filter isActive | `true` \| `false` \| tất cả | **Mới** — API + UI |

### 3.2 Năm học & học kỳ — `/admin/master-data/academic`

**Năm học**

| Điều khiển | Target | API hôm nay |
|---|---|---|
| Search `q` | `code`, `name` | Thiếu `search` trên list years |
| Filter status | `planned` \| `active` \| `closed` | Có `status` |

**Học kỳ**

| Điều khiển | Target | API hôm nay |
|---|---|---|
| Search `q` | `code`, `name` | Thiếu `search` |
| Filter năm học | `academicYearId` | Có — wire UI + click row |
| Filter status | cùng enum năm | Có `status` |

### 3.3 Môn học — `/admin/master-data/courses`

| Điều khiển | Target | API hôm nay |
|---|---|---|
| Search `q` | `code`, `name` | Có |
| Filter status | `active` \| `inactive` | Có |

### 3.4 Lớp danh nghĩa — `/admin/master-data/nominal-classes`

| Điều khiển | Target | API hôm nay |
|---|---|---|
| Search `q` | `code`, `name` | Có |
| Filter status | `active` \| `inactive` | Có |
| Filter cohortYear | exact int | **Thiếu** query param |
| Click row | điều hướng SV `?classId=` | UI only |

### 3.5 Sinh viên — `/admin/master-data/students`

| Điều khiển | Target | API hôm nay |
|---|---|---|
| Search `q` | `mssv`, `fullName` | Có |
| Filter lớp | `nominalClassId` | Có — Select đã có; đọc `classId` từ URL |
| Filter status | student status enum | Có |

### 3.6 Phòng & máy — `/admin/master-data/rooms`

**Phòng**

| Điều khiển | Target | API hôm nay |
|---|---|---|
| Search `q` | `code`, `name` | Có |
| Filter status | facility status | Có |
| Filter building | exact / ILIKE `building` | **Thiếu** — làm nếu danh sách tòa đa dạng; MVP có thể bỏ, chỉ search |

**Máy tính**

| Điều khiển | Target | API hôm nay |
|---|---|---|
| Search `q` | `hostname`, `ipAddress`, `location` | Có `search` nhưng chỉ `hostname` + `cpu` — **mở rộng** |
| Filter phòng | `roomId` | Có — Select đã có; thêm click row |
| Filter status | computer status | Có |

---

## 4. Thay đổi API (chỉ phần còn thiếu)

Giữ style DTO list hiện tại (`page`, `pageSize`, optional filters).

| Endpoint list | Thêm / sửa |
|---|---|
| `GET …/academic-years` | `search?: string` → ILIKE `code` \| `name` |
| `GET …/semesters` | `search?: string` → ILIKE `code` \| `name` |
| `GET …/nominal-classes` | `cohortYear?: number` → exact match |
| `GET …/computers` | Mở rộng `search` → `hostname` \| `ip_address` \| `location` (bỏ hoặc giữ `cpu` phụ) |
| `GET …/rooms` | (Tuỳ chọn MVP+) `building?: string` |
| `GET …/accounts` (search) | `isActive?: boolean` |

Không đổi response shape; vẫn `{ items, total, page, pageSize }` (hoặc shape accounts hiện có).

OpenAPI / client regenerate sau khi chốt DTO.

---

## 5. Thay đổi UI

### 5.1 Pattern dùng chung

Toolbar phía trên mỗi `CatalogSection` (hoặc một toolbar trang khi một list):

1. Ô search (placeholder theo entity).
2. Một hoặc nhiều `Select` filter (`Tất cả` = không gửi param).
3. Khi có filter/search active: chip tóm tắt + nút “Xóa lọc”.

Hành vi:

- Debounce search 300ms; reset `page` về 1 khi đổi search/filter.
- Loading giữ skeleton/table loading hiện có.
- Empty state phân biệt “không có dữ liệu” vs “không khớp bộ lọc”.

### 5.2 Trang cụ thể

| Trang | Việc chính |
|---|---|
| Accounts | Thêm Select trạng thái hoạt động; đồng bộ `isActive` query nếu muốn |
| Academic | Toolbar năm; toolbar kỳ; click năm → set `yearId` |
| Courses | Search + status (wire hooks đã có param) |
| Nominal classes | Search + status + cohortYear; click → `students?classId=` |
| Students | Đọc `classId` từ URL; search + status + Select lớp |
| Rooms | Toolbar phòng; toolbar máy; click phòng → set `roomId` |

### 5.3 Không làm trong đợt này

- Infinite scroll.
- Multi-select filter.
- Saved views / filter presets.

---

## 6. Acceptance criteria

1. Mọi trang trong §3 có search (nếu ma trận yêu cầu) hoạt động server-side, debounce ổn định.
2. Mọi filter trong §3 (trừ `building` nếu trì hoãn MVP+) gửi đúng query API và thu hẹp list.
3. Click năm học chỉ còn học kỳ của năm đó; xóa lọc hiện lại tất cả kỳ.
4. Click phòng chỉ còn máy của phòng đó; tương tự xóa lọc.
5. Click lớp danh nghĩa mở trang SV với filter lớp sẵn; search thêm vẫn AND.
6. Accounts lọc được theo active/inactive.
7. Refresh URL giữ filter/search chính (ít nhất `classId`, `roomId`, `yearId`, `q` nơi đã wire).
8. Edit/Delete trên dòng cha không kích hoạt drill-down.
9. Không regression CRUD create/update/delete hiện có.

---

## 7. Thứ tự triển khai gợi ý

1. API gaps (§4) + unit/e2e list query tối thiểu.
2. Academic (search/status + click năm → kỳ).
3. Rooms (click phòng → máy; mở rộng computer search).
4. Students URL `classId` + Classes click navigate; cohortYear filter.
5. Courses wire UI.
6. Accounts `isActive`.
7. URL sync + chip xóa lọc thống nhất.

---

## 8. Liên quan

- Catalog entities: `docs/superpowers/specs/2026-10-07-master-data-entities-design.md`
- Seed data: `docs/superpowers/specs/2026-10-07-seed-master-data-design.md`
- Branch làm việc: `feature/master-data-search-filter`
