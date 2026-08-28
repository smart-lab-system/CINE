import type { BadgeProps } from '@/components/ui/badge';

// `super_admin`/`department_admin` exist as account.role values in the DB
// (reserved for future Department/Super-Admin tiering) but aren't offered
// for creation/filtering here: RolesGuard's @Roles('admin') only matches
// the literal 'admin' role, so creating one of those from this UI today
// would produce an account locked out of every admin-only page, including
// this one. Shared by account-form.tsx, edit-account-form.tsx, and the
// accounts list page's role filter + badge.
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
export const ACCOUNT_ROLE_BADGE_VARIANT: Record<AccountRoleOption, 'primary' | 'accent'> = {
  admin: 'primary',
  teacher: 'accent',
};

// Every role the JWT can actually carry, including the two not creatable
// from this UI — the topbar has to render whatever the logged-in account
// says it is, not just the two options the create form offers.
const ROLE_DISPLAY: Record<string, { label: string; variant: NonNullable<BadgeProps['variant']> }> =
  {
    admin: { label: 'Quản trị', variant: 'primary' },
    super_admin: { label: 'Super Admin', variant: 'primary' },
    department_admin: { label: 'Admin khoa', variant: 'primary' },
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
