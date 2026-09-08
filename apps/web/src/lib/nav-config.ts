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
/**
 * QUY TẮC SỞ HỮU — chiếu vào đây trước khi thêm bất kỳ màn hình nào.
 *
 *   Tài nguyên CẤP TRƯỜNG  → Phòng Đào tạo (`/academic`)
 *   Tài nguyên CỦA KHOA    → Trưởng khoa   (`/department`)
 *   Tài khoản & hệ thống   → Admin         (`/admin`)
 *
 * Quy tắc này trước đây chưa từng được viết ra, nên mỗi màn hình được đặt theo
 * cảm tính của lúc dựng nó — và ba thứ đã nằm sai chỗ: Học kỳ và Phòng thi ở
 * Trưởng khoa, "Môn chưa có chủ" ở Admin. Cả ba là tài nguyên cấp trường: dùng
 * chung, tên unique toàn cục, không khoa nào sở hữu.
 *
 * Phép thử khi không chắc: nếu hai khoa cùng phải dùng một bản ghi và không
 * khoa nào được sửa nó của khoa kia, thì nó thuộc Phòng Đào tạo.
 */
export const ADMIN_NAV: NavItem[] = [
  { label: 'Dashboard', href: '/admin/dashboard', icon: LayoutDashboard },
  { label: 'Quản lý tài khoản', href: '/admin/accounts', icon: Users },
  { label: 'Cấu hình AI', href: '/admin/ai-config', icon: Bot },
  { label: 'Chi phí', href: '/admin/cost', icon: Wallet },
  { label: 'Audit log', href: '/admin/audit-log', icon: ScrollText },
];

// Phòng Đào tạo giữ ba thứ cấp trường: lịch kỳ, danh mục môn, và phòng máy.
// Trước đây đây là một tier MỘT trang — mỏng đến mức nhìn như một mảnh vụn cắt
// ra từ Trưởng khoa, và đó chính là điều làm người dùng hỏi "role Trưởng khoa
// có bị thừa không". Cả hai role đều cần thiết; ranh giới mới là chỗ sửa.
export const ACADEMIC_NAV: NavItem[] = [
  { label: 'Học kỳ', href: '/academic/semesters', icon: CalendarRange },
  { label: 'Môn học', href: '/academic/courses', icon: BookOpen },
  { label: 'Phòng thi', href: '/academic/rooms', icon: DoorOpen },
];

// Trưởng khoa sở hữu cấu trúc học vụ mà một phiên thi được dựng lên từ đó.
// Học kỳ và Phòng thi KHÔNG còn ở đây — cả hai là tài nguyên cấp trường, thuộc
// Phòng Đào tạo (/academic). Trưởng khoa vẫn ĐỌC được cả hai danh sách (bộ lọc
// và form tạo phiên thi cần), chỉ không sửa.
export const DEPARTMENT_NAV: NavItem[] = [
  { label: 'Dashboard', href: '/department/dashboard', icon: LayoutDashboard },
  { label: 'Môn học', href: '/department/courses', icon: BookOpen },
  { label: 'Lớp học', href: '/department/classes', icon: GraduationCap },
  // Read-only — who is currently teaching in this head's department. The
  // account itself stays admin's to manage (see /admin/accounts).
  { label: 'Giảng viên', href: '/department/teachers', icon: Users },
];

export const TEACHER_NAV: NavItem[] = [
  { label: 'Dashboard', href: '/teacher/dashboard', icon: LayoutDashboard },
  { label: 'Quản lý kỳ thi', href: '/teacher/exam-sessions', icon: CalendarClock },
  { label: 'Quản lý bài thu', href: '/teacher/submissions', icon: Inbox },
  { label: 'Lớp của tôi', href: '/teacher/classes', icon: GraduationCap },
  // Trước "Chấm điểm" vì đó là thứ tự thật của công việc: rubric phải có
  // trước khi tạo phiên thi, và phiên thi phải ghim rubric trước khi chấm.
  { label: 'Rubric', href: '/teacher/rubrics', icon: ListChecks },
  { label: 'Chấm điểm', href: '/teacher/grading', icon: ClipboardCheck },
];
