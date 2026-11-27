import {
  Sparkles,
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
  Terminal,
  BookMarked,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

/** Sidebar section that expands to leaf links. Discriminated by `children`. */
export interface NavGroup {
  label: string;
  icon: LucideIcon;
  children: NavItem[];
}

export type NavEntry = NavItem | NavGroup;

export function isNavGroup(entry: NavEntry): entry is NavGroup {
  return 'children' in entry && Array.isArray(entry.children);
}

/** Leaf links only - for tests and “does every href have a page?” checks. */
export function flattenNavLeaves(entries: NavEntry[]): NavItem[] {
  return entries.flatMap((entry) => (isNavGroup(entry) ? entry.children : [entry]));
}

// Matches the master brief's "Menu tối thiểu cần có" list, minus one
// deliberate deviation: no separate "Tạo phiên thi" entry. That item made
// sense when the brief was written (before "Quản lý kỳ thi" had its own
// create action), but once the list page grew a "+ Tạo phiên thi" button
// (header + empty-state CTA), a sibling nav item pointing at the same
// destination was pure redundancy - reported directly against the live
// app. /teacher/exam-sessions/new still exists and is fully reachable,
// just not duplicated at the top level.
//
// Admin (2026-11-18): two accordion groups - Tổ chức học vụ + Cơ sở vật
// chất - so the flat 11-item list matches UC03–UC10 setup order. Nav label
// "Giảng viên" still routes to /admin/accounts (CRUD admin + teacher).
export const ADMIN_NAV: NavEntry[] = [
  { label: 'Dashboard', href: '/admin/dashboard', icon: LayoutDashboard },
  {
    label: 'Tổ chức học vụ',
    icon: GraduationCap,
    children: [
      { label: 'Giảng viên', href: '/admin/accounts', icon: Users },
      { label: 'Sinh viên', href: '/admin/master-data/students', icon: UserRound },
      { label: 'Năm học', href: '/admin/master-data/academic', icon: CalendarRange },
      { label: 'Môn học', href: '/admin/master-data/courses', icon: BookOpen },
      { label: 'Lớp danh nghĩa', href: '/admin/master-data/nominal-classes', icon: School },
      { label: 'Lớp học phần', href: '/admin/course-sections', icon: Layers },
    ],
  },
  {
    label: 'Cơ sở vật chất',
    icon: Building2,
    children: [
      { label: 'Phòng', href: '/admin/master-data/rooms', icon: Building2 },
      { label: 'Máy tính', href: '/admin/master-data/computers', icon: Monitor },
    ],
  },
  { label: 'Tiện ích IDE', href: '/admin/ide-utilities', icon: Puzzle },
  { label: 'Audit log', href: '/admin/audit-log', icon: ScrollText },
];

// DEPARTMENT_NAV đã bỏ ngày 2026-09-21. Vai trò Trưởng khoa biến mất ở đợt
// thu hẹp master data cùng ba bảng nó quản, và cả thư mục `app/department`
// đã bị xoá - nhưng menu của nó thì còn, trỏ vào bốn trang không tồn tại.

export const TEACHER_NAV: NavEntry[] = [
  { label: 'Dashboard', href: '/teacher/dashboard', icon: LayoutDashboard },
  { label: 'Quản lý kỳ thi', href: '/teacher/exam-sessions', icon: CalendarClock },
  { label: 'Quản lý bài thu', href: '/teacher/submissions', icon: Inbox },
  { label: 'Lớp của tôi', href: '/teacher/classes', icon: GraduationCap },
  // Đứng TRƯỚC "Rubric" và "Chấm điểm": soạn đề là việc đầu tiên trong vòng đời
  // một kỳ thi, và thứ tự menu nên đọc ra được vòng đời đó.
  { label: 'Soạn đề', href: '/teacher/exam-authoring', icon: Sparkles },
  { label: 'Kho đề', href: '/teacher/exam-bank', icon: BookMarked },
  // Rubric accordion: QA (tạm dashboard), QS (danh sách), Bảng lỗi.
  {
    label: 'Rubric',
    icon: ListChecks,
    children: [
      { label: 'Rubric chung', href: '/teacher/rubrics/qa', icon: Layers },
      { label: 'Rubric theo câu hỏi', href: '/teacher/rubrics', icon: BookOpen },
      { label: 'Bảng lỗi', href: '/teacher/rules', icon: ScrollText },
    ],
  },
  { label: 'Chấm điểm', href: '/teacher/grading', icon: ClipboardCheck },
  { label: 'Tiện ích IDE', href: '/teacher/ide-utilities', icon: Puzzle },
  { label: 'Playground', href: '/teacher/playground', icon: Terminal },
];
