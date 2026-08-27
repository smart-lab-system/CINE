import {
  LayoutDashboard,
  Users,
  Bot,
  Wallet,
  ScrollText,
  CalendarClock,
  FilePlus2,
  Inbox,
  ClipboardCheck,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

// Matches the master brief's "Menu tối thiểu cần có" list exactly. Items
// without a real page yet still get a real route + structured "Sắp có"
// placeholder (see components/layout/placeholder-page.tsx) — never a
// missing/dead nav entry.
export const ADMIN_NAV: NavItem[] = [
  { label: 'Dashboard', href: '/admin/dashboard', icon: LayoutDashboard },
  { label: 'Quản lý tài khoản', href: '/admin/accounts', icon: Users },
  { label: 'Cấu hình AI', href: '/admin/ai-config', icon: Bot },
  { label: 'Chi phí', href: '/admin/cost', icon: Wallet },
  { label: 'Audit log', href: '/admin/audit-log', icon: ScrollText },
];

export const TEACHER_NAV: NavItem[] = [
  { label: 'Dashboard', href: '/teacher/dashboard', icon: LayoutDashboard },
  { label: 'Quản lý kỳ thi', href: '/teacher/exam-sessions', icon: CalendarClock },
  { label: 'Tạo phiên thi', href: '/teacher/exam-sessions/new', icon: FilePlus2 },
  { label: 'Quản lý bài thu', href: '/teacher/submissions', icon: Inbox },
  { label: 'Chấm điểm', href: '/teacher/grading', icon: ClipboardCheck },
];
