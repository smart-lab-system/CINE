import { Sparkles,
  LayoutDashboard,
  GraduationCap,
  Users,
  ScrollText,
  CalendarClock,
  ClipboardCheck,
  Inbox,
  ListChecks,
  BookOpen,
  CalendarRange,
  School,
  UserRound,
  Building2,
  Monitor,
  Layers,
  Puzzle,
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
  { label: 'Lớp học phần', href: '/admin/course-sections', icon: Layers },
  // Catalog master-data (2026-10-07): độc lập schema nghiệp vụ; CRUD admin.
  { label: 'Năm học', href: '/admin/master-data/academic', icon: CalendarRange },
  { label: 'Môn học', href: '/admin/master-data/courses', icon: BookOpen },
  { label: 'Lớp danh nghĩa', href: '/admin/master-data/nominal-classes', icon: School },
  { label: 'Sinh viên', href: '/admin/master-data/students', icon: UserRound },
  { label: 'Phòng', href: '/admin/master-data/rooms', icon: Building2 },
  { label: 'Máy tính', href: '/admin/master-data/computers', icon: Monitor },
  { label: 'Tiện ích IDE', href: '/admin/ide-utilities', icon: Puzzle },
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
  // Đứng TRƯỚC "Rubric" và "Chấm điểm": soạn đề là việc đầu tiên trong vòng đời
  // một kỳ thi, và thứ tự menu nên đọc ra được vòng đời đó.
  { label: 'Soạn đề', href: '/teacher/exam-authoring', icon: Sparkles },
  // Rubric: tiêu chí, điểm tối đa, lỗi và điểm trừ — phải có trước khi chấm (spec UI §1).
  // Trang `/teacher/rubrics` chuyển hướng về `/teacher/rules`.
  { label: 'Rubric', href: '/teacher/rules', icon: ListChecks },
  { label: 'Chấm điểm', href: '/teacher/grading', icon: ClipboardCheck },
  { label: 'Tiện ích IDE', href: '/teacher/ide-utilities', icon: Puzzle },
];
