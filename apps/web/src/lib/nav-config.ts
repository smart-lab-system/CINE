import {
  LayoutDashboard,
  BookOpen,
  GraduationCap,
  DoorOpen,
  CalendarRange,
  Users,
  Bot,
  Wallet,
  ScrollText,
  CalendarClock,
  ClipboardCheck,
  Inbox,
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
  // A course with no owner is invisible to every Trưởng khoa, which makes it
  // unassignable by them too — so admin needs somewhere to see and fix it.
  { label: 'Môn chưa có chủ', href: '/admin/unowned-courses', icon: BookOpen },
  { label: 'Cấu hình AI', href: '/admin/ai-config', icon: Bot },
  { label: 'Chi phí', href: '/admin/cost', icon: Wallet },
  { label: 'Audit log', href: '/admin/audit-log', icon: ScrollText },
];

// Trưởng khoa owns the academic structure an exam session is built from.
// Semesters and rooms are university-wide (every head maintains the same
// list); courses and classes are scoped to the head who owns the course.
export const DEPARTMENT_NAV: NavItem[] = [
  { label: 'Dashboard', href: '/department/dashboard', icon: LayoutDashboard },
  { label: 'Học kỳ', href: '/department/semesters', icon: CalendarRange },
  { label: 'Môn học', href: '/department/courses', icon: BookOpen },
  { label: 'Lớp học', href: '/department/classes', icon: GraduationCap },
  { label: 'Phòng thi', href: '/department/rooms', icon: DoorOpen },
  // Read-only — who is currently teaching in this head's department. The
  // account itself stays admin's to manage (see /admin/accounts).
  { label: 'Giảng viên', href: '/department/teachers', icon: Users },
];

export const TEACHER_NAV: NavItem[] = [
  { label: 'Dashboard', href: '/teacher/dashboard', icon: LayoutDashboard },
  { label: 'Quản lý kỳ thi', href: '/teacher/exam-sessions', icon: CalendarClock },
  { label: 'Quản lý bài thu', href: '/teacher/submissions', icon: Inbox },
  { label: 'Lớp của tôi', href: '/teacher/classes', icon: GraduationCap },
  { label: 'Chấm điểm', href: '/teacher/grading', icon: ClipboardCheck },
];
