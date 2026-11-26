# Kiểm kê UI hiện trạng (đo ngày 2026-11-26, base `main` @ 8f43e370)

Mọi số đều đo bằng lệnh trên cây mã, không ước lượng. Ảnh chụp thực tế CHƯA có (xem "Chưa kiểm chứng").

## 1. Bề mặt UI

| Bề mặt | Công nghệ | Quy mô |
|---|---|---|
| `apps/web` | Next.js 15 App Router, React 19, Tailwind 3.4, shadcn-style trên Radix, lucide-react, sonner, GSAP | 48 trang, 3 layout nhóm (`admin`, `teacher`, `(exam-live)`), 339 file `.tsx` (~56 300 dòng), 112 test `.tsx` + 61 test `.ts` |
| `apps/agent/electron/renderer` | Electron + Vite, Tailwind (bản sao token riêng) | ~1 980 dòng TSX, ~12 màn/panel (Landing, Join, Detail, MgmtApp, 2 Login, RolePick, TeacherExamPick, TeacherHub, StudentNode, ProposeRoomDialog, 2 panel) |
| `apps/web/src/app/api/*` | Route handler đăng nhập/làm mới token | 4 file, KHÔNG có UI |

## 2. Hệ thiết kế đang có (đã tồn tại, chất lượng cao)

- Token HSL trong `src/app/globals.css`: bề mặt, primary (Indigo), accent (Teal), 4 màu ngữ nghĩa mỗi màu 4 bậc
  (`DEFAULT / strong / subtle / foreground`), 4 màu tô bằng chứng `--ev-1..4`, bóng 3 bậc, bán kính. Tương phản đã đo và ghi lại trong file.
- Dark mode: token có đủ nhưng KHÔNG có công tắc; chỉ 4 file dùng `dark:`.
- Thang chữ đặt tên (`text-display/h1/h2/h3/body/small/caption/beacon`), một họ font (Inter, có subset `vietnamese`).
- Chuyển động: một đường cong (`ease-smooth`), GSAP có cổng `prefers-reduced-motion`.
- Focus ring dùng chung, scrollbar theo palette, hai tiện ích nền (`app-wash`, `grid-rule`).
- Khung: `AppShell` (sidebar thu gọn nhớ trạng thái, topbar 64px cố định, Sheet cho mobile).

## 3. Thành phần dùng chung

- `components/ui` (20 file): alert, auto-textarea, badge, button, card, dialog, dropdown-menu, form-field, input, label,
  popover, searchable-select, select, sheet, skeleton, sonner, table, tooltip.
- `components/layout` (11): app-shell, brand, empty-state, page-header, placeholder-page, semester-filter, sidebar-nav, stat-card, user-chip, logout-button.
- `components/resource` (3: shell CRUD + dialog), `components/roster` (6), `components/accounts` (2), `components/motion` (2), `components/jplag` (1).

Mức dùng lại (số file): Button 124, Badge 49, Card 33, Dialog 40, Table 29, PageHeader 37, Skeleton 46, EmptyState 13, StatCard 4.
Dùng thẻ thô: `<button>` 53 file, `<input>` 25, `<select>` 18, `<textarea>` 5, `<table>` 20 (một phần là bên trong chính primitive).

## 4. Vị trí và khối lượng theo khu vực (file `.tsx` không tính test)

| Khu vực | Trang | File | Dòng |
|---|---:|---:|---:|
| `(auth)/login` | 1 | 1 | 209 |
| `(exam-live)/exam-sessions/[id]` (màn chiếu/phòng chờ) | 1 | 11 | 3 022 |
| `admin/*` | 19 | 28 | 8 327 |
| &nbsp;&nbsp;master-data (academic, computers, courses, nominal-classes, rooms, students) | 11 | 18 | 5 243 |
| &nbsp;&nbsp;accounts / audit-log / course-sections / dashboard / ide-utilities | 8 | 10 | 3 084 |
| `teacher/*` | 26 | 143 | 23 141 |
| &nbsp;&nbsp;grading (gồm export, finalize, `[resultId]`, investigator) | 4 | 68 | 9 548 |
| &nbsp;&nbsp;exam-sessions (danh sách, chi tiết, tạo mới) | 3 | 22 | 5 111 |
| &nbsp;&nbsp;rules (luật/bảng lỗi theo rubric) | 3 | 28 | 3 993 |
| &nbsp;&nbsp;exam-authoring / exam-bank / submissions / rubrics / classes / playground / dashboard | 14 | 25 | 4 480 |
| &nbsp;&nbsp;ide-utilities (chỉ re-export từ admin) | 3 | 3 | 3 |
| `unassigned-role` | 1 | 1 | 47 |
| `components/` dùng chung | - | 42 | 4 634 |

Cấu trúc thư mục: `src/app/<khu vực>/<màn>/page.tsx` + `_components/` cạnh trang; `src/components/{ui,layout,...}`; `src/lib` (logic thuần + `api/`); `src/hooks`.
Style: Tailwind utility trong JSX, KHÔNG có CSS module, KHÔNG có styled-components; CSS toàn cục duy nhất là `globals.css`. 12 chỗ `style={{}}`.

## 5. Tín hiệu kỹ thuật liên quan đến chất lượng giao diện

- Token bị lách: 64 class dùng bảng màu thô Tailwind (`bg-red-500`...) nằm trên 23 dòng của 5 file (số dòng mỗi file):
  `admin/ide-utilities/page.tsx` (4), `admin/ide-utilities/[id]/page.tsx` (10), `admin/master-data/computers/page.tsx` (2),
  `teacher/playground/page.tsx` (1), `components/jplag/jplag-comparison-viewer.tsx` (6). Hex/rgb literal trong tsx: 1.
- 10 file vượt 500 dòng (quy tắc nội bộ của `CLAUDE.md`), lớn nhất: `(exam-live)/exam-sessions/[id]/page.tsx` 851 dòng.
- Hai khu vực `admin/ide-utilities` và `teacher/ide-utilities` dùng chung một trang (re-export), nên sửa một nơi là đổi cả hai vai.

## 6. Chưa kiểm chứng (cần làm ở giai đoạn 0 của plan)

- Chưa có ảnh chụp nào của 48 trang. Docker đang tắt nên chưa dựng được stack có dữ liệu.
- Chưa đo thực tế: căn lề/khoảng cách giữa các trang, mật độ bảng, tràn ngang ở 390px, độ nhất quán thuật ngữ.
- Nhận định "UI thô sơ" của người giao việc CHƯA được dữ liệu hỗ trợ ở tầng hệ thống (token/primitive/khung đều tốt).
  Nếu có vấn đề thật, nhiều khả năng ở tầng từng màn: mật độ, phân cấp thị giác, bố cục các trang lớn (grading, exam-sessions, rules), thuật ngữ.
