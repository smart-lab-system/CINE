import { Sparkles,
  LayoutDashboard,
  GraduationCap,
  Users,
  Bot,
  Wallet,
  ScrollText,
  CalendarClock,
  CalendarRange,
  ClipboardCheck,
  DoorOpen,
  Inbox,
  ListChecks,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

// Matches the master brief's "Menu tối thiểu cần có" list, minus one
// deliberate deviation: no separate "Tạo phiên thi" entry. That item made
// sense when the brief was written (before "Quản lý kỳ thi" had its own
// create action), but once the list page grew a "+ Tạo phiên thi" button
// (header + empty-state CTA), a sibling nav item pointing at the same
// destination was pure redundancy — reported directly against the live
// app. /teacher/exam-sessions/new still exists and is fully reachable,
// just not duplicated at the top level.
//
// Items without a real page yet still get a real route + structured "Sắp
// có" placeholder (see components/layout/placeholder-page.tsx) — never a
// missing/dead nav entry.
export const ADMIN_NAV: NavItem[] = [
  { label: 'Dashboard', href: '/admin/dashboard', icon: LayoutDashboard },
  { label: 'Quản lý tài khoản', href: '/admin/accounts', icon: Users },
  // Dữ liệu nền do admin quản lý (khôi phục 2026-10, spec master-data-restoration): học kỳ, phòng thi và lớp. Bị xoá ngày 2026-09-21 cùng
  // đợt thu hẹp master data — lần đó ba mục menu ở lại trỏ vào ba trang không còn, và admin bấm vào là ra 404. Lần này mục menu và trang
  // đi CÙNG commit, và một test duyệt mọi `href` kiểm `page.tsx` có thật.
  //
  // "Danh mục lớp danh nghĩa" KHÔNG phải một mục menu: nó là hộp thoại mở từ trang Lớp, để giảng viên và các màn hình khác không bao giờ
  // thấy "hai thứ" (mã danh nghĩa và lớp học phần).
  { label: 'Học kỳ', href: '/admin/semesters', icon: CalendarRange },
  { label: 'Phòng thi', href: '/admin/rooms', icon: DoorOpen },
  { label: 'Lớp', href: '/admin/classes', icon: GraduationCap },
  { label: 'Cấu hình AI', href: '/admin/ai-config', icon: Bot },
  { label: 'Chi phí', href: '/admin/cost', icon: Wallet },
  { label: 'Audit log', href: '/admin/audit-log', icon: ScrollText },
];

// DEPARTMENT_NAV đã bỏ ngày 2026-09-21. Vai trò Trưởng khoa biến mất ở đợt
// thu hẹp master data cùng ba bảng nó quản, và cả thư mục `app/department`
// đã bị xoá — nhưng menu của nó thì còn, trỏ vào bốn trang không tồn tại.

export const TEACHER_NAV: NavItem[] = [
  { label: 'Dashboard', href: '/teacher/dashboard', icon: LayoutDashboard },
  { label: 'Quản lý kỳ thi', href: '/teacher/exam-sessions', icon: CalendarClock },
  { label: 'Quản lý bài thu', href: '/teacher/submissions', icon: Inbox },
  { label: 'Lớp của tôi', href: '/teacher/classes', icon: GraduationCap },
  // Đứng TRƯỚC "Bảng lỗi" và "Chấm điểm": soạn đề là việc đầu tiên trong vòng đời
  // một kỳ thi, và thứ tự menu nên đọc ra được vòng đời đó.
  { label: 'Soạn đề', href: '/teacher/exam-authoring', icon: Sparkles },
  // Bảng lỗi thay mục "Rubric" cũ ở đúng vị trí đó (spec UI §1): bảng luật + mức trừ + trần điểm
  // theo tiêu chí phải có trước khi chấm. Trang `/teacher/rubrics` chuyển hướng về đây.
  { label: 'Bảng lỗi', href: '/teacher/rules', icon: ListChecks },
  { label: 'Chấm điểm', href: '/teacher/grading', icon: ClipboardCheck },
];
