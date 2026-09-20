import type { BadgeProps } from '@/components/ui/badge';

// HAI vai trò, và đó là toàn bộ danh sách.
//
// `department_admin` từng ở đây vì nó có khu vực riêng (/department), có
// route chấp nhận nó và có tài nguyên để sở hữu. Đợt thu hẹp master data bỏ
// cả ba: không còn môn học, phòng hay học kỳ để quản. `super_admin` chưa bao
// giờ được handler nào chấp nhận. Cả hai đã bị rút khỏi enum của Postgres ở
// `ContractMasterData`, nên chúng không còn xuất hiện trong bất kỳ JWT nào.
export const ACCOUNT_ROLE_OPTIONS = ['admin', 'teacher'] as const;
export type AccountRoleOption = (typeof ACCOUNT_ROLE_OPTIONS)[number];

export const ACCOUNT_ROLE_LABELS: Record<AccountRoleOption, string> = {
  admin: 'Quản trị',
  teacher: 'Giảng viên',
};

// Indigo for administrators, teal for teachers — the same two brand
// colours used by the shell, so "who am I / who is this row" reads the
// same way in the topbar and in a table. Never the only signal: each badge
// carries its own label.
export const ACCOUNT_ROLE_BADGE_VARIANT: Record<
  AccountRoleOption,
  'primary' | 'accent' | 'info'
> = {
  admin: 'primary',
  teacher: 'accent',
};

// Mọi vai trò mà JWT có thể mang. Giờ đúng bằng hai lựa chọn của form tạo
// tài khoản — nhưng `getRoleDisplay` vẫn nhận string và vẫn có nhánh lùi,
// vì một token cũ phát trước đợt thu hẹp master data còn hạn tới lúc hết
// hạn, và nó mang một vai trò không còn tồn tại.
const ROLE_DISPLAY: Record<string, { label: string; variant: NonNullable<BadgeProps['variant']> }> =
  {
    admin: { label: 'Quản trị', variant: 'primary' },
    teacher: { label: 'Giảng viên', variant: 'accent' },
  };

/**
 * Label + badge colour for any role string. Falls back to showing the raw
 * value rather than hiding an unrecognised role: if the backend adds a
 * fifth tier, the topbar should say something true-but-ugly instead of
 * silently mislabelling the account.
 */
export function getRoleDisplay(role: string): {
  label: string;
  variant: NonNullable<BadgeProps['variant']>;
} {
  return ROLE_DISPLAY[role] ?? { label: role, variant: 'default' };
}
