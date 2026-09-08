import type { BadgeProps } from '@/components/ui/badge';

// Bốn role hệ thống thực sự cài đặt. Một role chỉ vào danh sách này khi nó có
// area, có route chấp nhận nó, và có tài nguyên để sở hữu — trước đó, tạo một
// tài khoản như vậy sinh ra người đăng nhập được mà không làm được gì.
//
// `academic_affairs` (Phòng Đào tạo) gia nhập khi nó có cả ba: area /academic,
// @Roles('academic_affairs') trên các route ghi học kỳ, và quyển lịch học kỳ
// cấp trường để sở hữu.
export const ACCOUNT_ROLE_OPTIONS = [
  'admin',
  'department_admin',
  'teacher',
  'academic_affairs',
] as const;
export type AccountRoleOption = (typeof ACCOUNT_ROLE_OPTIONS)[number];

export const ACCOUNT_ROLE_LABELS: Record<AccountRoleOption, string> = {
  admin: 'Quản trị',
  department_admin: 'Trưởng khoa',
  teacher: 'Giảng viên',
  academic_affairs: 'Phòng Đào tạo',
};

// Indigo for administrators, teal for teachers — the same two brand
// colours used by the shell, so "who am I / who is this row" reads the
// same way in the topbar and in a table. Never the only signal: each badge
// carries its own label.
export const ACCOUNT_ROLE_BADGE_VARIANT: Record<
  AccountRoleOption,
  'primary' | 'accent' | 'info' | 'warning'
> = {
  admin: 'primary',
  // Its own colour, not a shade of admin: a Trưởng khoa is a different job,
  // and a table where two roles look alike is a table that gets misread.
  department_admin: 'info',
  teacher: 'accent',
  academic_affairs: 'warning',
};

// Every role the JWT can actually carry, including the two not creatable
// from this UI — the topbar has to render whatever the logged-in account
// says it is, not just the two options the create form offers.
const ROLE_DISPLAY: Record<string, { label: string; variant: NonNullable<BadgeProps['variant']> }> =
  {
    admin: { label: 'Quản trị', variant: 'primary' },
    academic_affairs: { label: 'Phòng Đào tạo', variant: 'warning' },
    department_admin: { label: 'Trưởng khoa', variant: 'info' },
    teacher: { label: 'Giảng viên', variant: 'accent' },
  };

/**
 * Label + badge colour cho một role bất kỳ.
 *
 * Role không có trong map hiện ra như một CẢNH BÁO, không phải như một vai
 * trò. Bản trước trả `{ label: role, variant: 'default' }` với ý đúng — thà
 * nói một điều thật mà xấu hơn là dán nhãn sai âm thầm — nhưng chưa đủ xấu:
 * một chuỗi enum thô trong badge xám đọc y như một vai trò hợp lệ, và đó chính
 * là cách người dùng kết luận hệ thống có hai role riêng biệt "Phòng Đào tạo"
 * và `super_admin` (một tab giữ bundle cũ, hoặc một JWT phát trước migration
 * rename, là đủ).
 *
 * Cùng nguyên tắc `ROLE_AREAS` đã ghi: unmapped means visibly unmapped. Vẫn in
 * ra giá trị thô, vì đó là thứ duy nhất giúp chẩn đoán.
 */
export function getRoleDisplay(role: string): {
  label: string;
  variant: NonNullable<BadgeProps['variant']>;
} {
  return (
    ROLE_DISPLAY[role] ?? {
      label: `Vai trò không xác định (${role})`,
      variant: 'destructive',
    }
  );
}
