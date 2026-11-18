# Plan — Admin sidebar 2 nhóm quản lý

**Spec:** `docs/superpowers/specs/2026-11-18-admin-nav-two-groups-design.md`  
**Ngày:** 2026-11-18

## Tasks

- [x] Spec + plan
- [x] `nav-config.ts`: `NavGroup` / `NavEntry`; `ADMIN_NAV` 2 nhóm; nhãn Giảng viên
- [x] `sidebar-nav.tsx`: accordion + auto-expand; collapsed → DropdownMenu
- [x] `nav-config.test.ts`: flatten leaves; assert nhóm / nhãn / trang thật
- [x] `app-shell.tsx`: kiểu props nếu cần (`NavEntry[]`) — `SidebarNav` nhận `NavEntry[]`; teacher vẫn flat

## Không làm

Đổi URL `/admin/accounts`; đổi `PageHeader` accounts; đụng `TEACHER_NAV`.
