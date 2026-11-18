# Admin sidebar — 2 nhóm quản lý — thiết kế

**Ngày:** 2026-11-18  
**Trạng thái:** implemented  
**Plan:** `docs/superpowers/plans/2026-11-18-admin-nav-two-groups.md`

---

## 1. Vấn đề

Menu admin (`ADMIN_NAV`) là danh sách phẳng ~11 mục: tài khoản, lớp HP, năm học, môn, lớp danh nghĩa, SV, phòng, máy, IDE, audit… Khó quét và không phản ánh chuỗi nghiệp vụ UC03–UC10.

## 2. Quyết định

| # | Quyết định |
|---|---|
| D1 | Hai nhóm accordion trong sidebar; không gộp hết vào một “Quản lý” |
| D2 | **Tổ chức học vụ:** Giảng viên, Sinh viên, Năm học, Môn học, Lớp danh nghĩa, Lớp học phần |
| D3 | **Cơ sở vật chất:** Phòng, Máy tính |
| D4 | Mục đơn ngoài nhóm: Dashboard, Tiện ích IDE, Audit log |
| D5 | Đổi nhãn nav “Quản lý tài khoản” → **Giảng viên**; route `/admin/accounts` và `PageHeader` trang giữ nguyên (trang vẫn CRUD `admin` + `teacher`) |
| D6 | UX mở rộng: accordion inline (expanded sidebar); collapsed rail → `DropdownMenu` liệt kê children |
| D7 | Tự mở nhóm nếu `pathname` khớp một child; active rail chỉ trên leaf link |
| D8 | `TEACHER_NAV` không đổi |

## 3. Cấu trúc menu

```
Dashboard
Tổ chức học vụ
  ├ Giảng viên          /admin/accounts
  ├ Sinh viên           /admin/master-data/students
  ├ Năm học             /admin/master-data/academic
  ├ Môn học             /admin/master-data/courses
  ├ Lớp danh nghĩa      /admin/master-data/nominal-classes
  └ Lớp học phần        /admin/course-sections
Cơ sở vật chất
  ├ Phòng               /admin/master-data/rooms
  └ Máy tính            /admin/master-data/computers
Tiện ích IDE
Audit log
```

## 4. Model

```ts
NavItem  { label, href, icon }
NavGroup { label, icon, children: NavItem[] }
NavEntry = NavItem | NavGroup   // discriminate bằng `children`
```

`ADMIN_NAV: NavEntry[]`. Icon nhóm: `GraduationCap` (học vụ), `Building2` (CSVC).

## 5. UI / a11y

- Header nhóm: `button` + `aria-expanded`; chevron xoay khi mở.
- Children indent; cùng class `sidebar-item` cho leaf.
- Collapsed: icon nhóm là trigger dropdown; label nhóm + children trong menu; leaf vẫn `sr-only` / `title` như mục đơn.
- Mobile sheet dùng cùng `SidebarNav` (expanded).

## 6. Ngoài scope

- Đổi URL accounts; đổi title trang “Quản lý tài khoản”.
- Gom / tách thêm nhóm; đổi `TEACHER_NAV`.
