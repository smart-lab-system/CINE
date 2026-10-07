# List pagination + page-size picker — thiết kế

**Ngày:** 2026-10-07 · **Branch:** `feature/list-pagination` · **Baseline:** search/filter đã có  
**Trạng thái:** implemented (local, chưa chia commit)

Thống nhất **phân trang server-side** và cho phép admin **chọn mức hiển thị
30 / 50 / 100** trên các danh sách quản lý dưới đây. Không đổi schema entity,
không đổi search/filter đã có — chỉ hoàn thiện điều khiển trang + `pageSize`.

---

## 0. Vì sao cần cái này

API list đã nhận `page` / `pageSize` và trả `{ items, total, page, pageSize }`,
nhưng UI đang lệch nhau:

| Bề mặt | Hành vi hôm nay |
|---|---|
| Accounts | Có Prev/Next; `PAGE_SIZE = 20` cứng |
| Master-data lists | Gọi API với `pageSize` cố định (50 hoặc 100); nhiều trang **không** có UI đổi trang / đổi size |
| Seed lớn | Một trang cố định dễ “cắt” dữ liệu mà admin không biết còn trang sau |

Cần một pattern chung: luôn phân trang đúng, luôn cho chọn 30/50/100, đồng bộ URL.

---

## 1. Phạm vi

### 1.1 Trong phạm vi

| Trang | Route | List được phân trang |
|---|---|---|
| Quản lý tài khoản | `/admin/accounts` | Accounts |
| Năm học | `/admin/master-data/academic` | Academic years |
| Môn học | `/admin/master-data/courses` | Courses |
| Lớp danh nghĩa | `/admin/master-data/nominal-classes` | Nominal classes |
| Sinh viên | `/admin/master-data/students` | Students |
| Phòng | `/admin/master-data/rooms` | Rooms |
| Máy tính | `/admin/master-data/computers` | Computers |

Mỗi list trên:

- Footer phân trang: Prev / Next (hoặc tương đương) + nhãn `Trang {page}/{totalPages} • {total} …`
- Select **Số dòng / trang**: `30` \| `50` \| `100`
- Gửi `page` + `pageSize` lên API; tôn trọng `total` từ response

### 1.2 Cố ý KHÔNG trong phạm vi

- Học kỳ (trang chi tiết năm `/academic/[id]`) — đợt sau nếu cần cùng pattern.
- Teacher exam-sessions / grading lists.
- Infinite scroll, virtualized table, jump-to-page số tùy ý.
- Lưu `pageSize` vào localStorage / preference server (MVP: URL + state trang).
- Đổi response shape API; đổi default DTO backend trừ khi cần siết whitelist.
- Facet / dropdown phụ (ví dụ load lớp cho Select filter) — giữ `pageSize` riêng đủ lớn; không bắt buộc dùng picker 30/50/100.

---

## 2. Quyết định UX

### 2.1 Mức phân trang cho phép

```
PAGE_SIZE_OPTIONS = [30, 50, 100] as const
DEFAULT_PAGE_SIZE = 30
```

- Default **30** (gần default API hiện tại `20`, tránh nhảy tải lớn khi mở trang lần đầu).
- Chỉ ba giá trị trên xuất hiện trong Select; không cho nhập số tự do.

### 2.2 Hành vi

| Sự kiện | Hành vi |
|---|---|
| Đổi search / filter | `page → 1`; giữ `pageSize` |
| Đổi `pageSize` | `page → 1`; fetch lại với size mới |
| Prev / Next | `page ± 1` trong `[1, totalPages]` |
| `total === 0` | Hiển thị empty state hiện có; disable Prev/Next; vẫn hiện Select size |
| Loading | Giữ skeleton/table loading hiện có; không reset Select về default |

Nhãn gợi ý (mirror Accounts):

```
Trang {page}/{totalPages} • {total} {entityLabel}
Số dòng: [ 30 ▾ ]
```

`totalPages = max(1, ceil(total / pageSize))` — khi `total === 0` vẫn hiện `Trang 1/1`.

### 2.3 URL query

Đồng bộ thêm (cùng kiểu search-filter: `router.replace`, không push mỗi lần):

| Param | Ý nghĩa | Giá trị hợp lệ |
|---|---|---|
| `page` | Trang hiện tại | integer ≥ 1 |
| `pageSize` | Số dòng / trang | `30` \| `50` \| `100` |

- Đọc khi mount; giá trị ngoài whitelist → fallback `DEFAULT_PAGE_SIZE` / `page = 1`.
- Nếu `page` vượt `totalPages` sau khi fetch (ví dụ xóa hết trang cuối): clamp về `totalPages` (hoặc refetch `page = totalPages`).
- Trang có nhiều list trên một URL (không áp dụng trong phạm vi này — mỗi route một list chính). Filter params hiện có (`q`, `status`, `classId`, `roomId`, …) **giữ nguyên**.

### 2.4 Vị trí UI

Footer dưới bảng list chính (pattern Accounts):

1. Trái / giữa: `Trang x/y • total …`
2. Phải: nút Trước · Sau + Select kích thước

Select đặt cạnh Prev/Next để một cụm điều khiển phân trang — không nhét vào toolbar search.

---

## 3. API

### 3.1 Giữ nguyên contract

Query: `page`, `pageSize` (đã có trên accounts + master-data DTOs).  
Response: `{ items, total, page, pageSize }` (hoặc shape accounts tương đương).

`ListQueryDto` / `SearchAccountsDto` đã `@Max(100)` — đủ cho option 100. Không cần nâng trần.

### 3.2 Siết whitelist (khuyến nghị, nhỏ)

Tuỳ chọn implement: validate `pageSize` ∈ `{30, 50, 100}` thay vì mọi số 1…100.

- **Ưu:** client “lạ” không xin size lệch (ví dụ 7, 99).
- **Nhược:** call site nội bộ đang dùng `pageSize: 1` (dashboard đếm `total`) hoặc `100` cho facet sẽ vỡ nếu áp dụng global.

**Quyết định:** **không** siết whitelist ở DTO dùng chung trong đợt này. UI chỉ gửi 30/50/100; backend giữ `@Min(1) @Max(100)`. Facet/dashboard tiếp tục dùng size riêng.

### 3.3 Default backend

Default DTO hiện `pageSize = 20`. Không bắt buộc đổi trong đợt này — UI luôn gửi explicit `pageSize`. Nếu muốn khớp docs: đổi default DTO → `30` trong commit riêng, kèm OpenAPI regenerate.

---

## 4. Thay đổi UI / code

### 4.1 Component dùng chung (khuyến nghị)

Tách một khối nhỏ tái sử dụng, ví dụ `ListPaginationBar`:

```ts
type Props = {
  page: number;
  pageSize: 30 | 50 | 100;
  total: number;
  entityLabel: string; // "tài khoản" | "năm học" | …
  disabled?: boolean;  // khi loading
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: 30 | 50 | 100) => void;
};
```

Constants dùng chung (web):

```ts
export const PAGE_SIZE_OPTIONS = [30, 50, 100] as const;
export type PageSize = (typeof PAGE_SIZE_OPTIONS)[number];
export const DEFAULT_PAGE_SIZE: PageSize = 30;
```

Helper parse URL: `parsePageSize(raw) → PageSize` (invalid → default).

### 4.2 Wire từng trang

| Trang | Việc chính |
|---|---|
| Accounts | Bỏ `PAGE_SIZE = 20`; state/`URL` `pageSize`; gắn Select; query key gồm `pageSize` |
| Academic (years) | State `page` + `pageSize`; footer; bỏ hardcode `pageSize: 50` cho list chính |
| Courses | Như trên |
| Nominal classes | Như trên — **không** đổi call facet `pageSize: 100` (nếu còn) |
| Students | Như trên — Select lớp vẫn load riêng |
| Rooms | Như trên |
| Computers | Như trên — Select phòng vẫn load riêng |

React Query / hooks: đưa `pageSize` vào queryKey (Accounts comment sẵn gợi ý việc này).

### 4.3 Tương thích search-filter

Giữ hành vi đã chốt ở spec search-filter:

- Đổi `q` / filter → reset `page = 1`
- Đổi `pageSize` → reset `page = 1`, **không** xóa filter
- Chip “Đang lọc” / drill-down không đụng pagination trừ khi filter đổi

---

## 5. Acceptance criteria

1. Bảy trang §1.1 đều có Prev/Next hoạt động đúng với `total` từ API.
2. Mỗi trang có Select mức **30 / 50 / 100**; đổi size reload đúng số dòng và về trang 1.
3. Default lần đầu vào trang (không có query): `pageSize = 30`, `page = 1`.
4. Refresh URL giữ `page` + `pageSize` (và filter hiện có).
5. `pageSize` trên URL không hợp lệ → fallback 30, không crash.
6. Đổi search/filter không làm mất lựa chọn `pageSize`.
7. Empty list: Select size vẫn dùng được; Prev/Next disabled hợp lý.
8. Không regression CRUD / search / filter / drill-down.
9. Facet dropdown (lớp, phòng, …) vẫn đủ option — không bị kẹt ở 30 vì nhầm dùng chung state list chính.

---

## 6. Thứ tự triển khai gợi ý

1. Constants + `ListPaginationBar` (+ helper parse URL).
2. Accounts (đã có Prev/Next — chỉ thêm size + URL `pageSize`).
3. Students, Courses, Nominal classes (một list / trang).
4. Rooms, Computers.
5. Academic years.
6. Smoke: đổi size, đổi trang, đổi filter, refresh URL trên từng trang.

---

## 7. Liên quan

- Search/filter: `docs/superpowers/specs/2026-10-07-master-data-search-filter-design.md`
- Catalog entities: `docs/superpowers/specs/2026-10-07-master-data-entities-design.md`
- Branch: `feature/list-pagination`
