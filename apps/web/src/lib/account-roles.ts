import type { BadgeProps } from '@/components/ui/badge';

// The three roles the system actually implements. `department_admin` joins
// the list now that it has an area (/department), routes that accept it, and
// resources to own — before that, creating one produced an account that could
// log in and do nothing.
//
// `super_admin` is still absent, and deliberately so: no API handler accepts
// it. An account carrying it is sent to /unassigned-role, which says as much,
// rather than to a screen where every request 403s in silence.
export const ACCOUNT_ROLE_OPTIONS = ['admin', 'department_admin', 'teacher'] as const;
export type AccountRoleOption = (typeof ACCOUNT_ROLE_OPTIONS)[number];

export const ACCOUNT_ROLE_LABELS: Record<AccountRoleOption, string> = {
  admin: 'Quản trị',
  department_admin: 'Trưởng khoa',
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
  // Its own colour, not a shade of admin: a Trưởng khoa is a different job,
  // and a table where two roles look alike is a table that gets misread.
  department_admin: 'info',
  teacher: 'accent',
};

// Every role the JWT can actually carry, including the two not creatable
// from this UI — the topbar has to render whatever the logged-in account
// says it is, not just the two options the create form offers.
const ROLE_DISPLAY: Record<string, { label: string; variant: NonNullable<BadgeProps['variant']> }> =
  {
    admin: { label: 'Quản trị', variant: 'primary' },
    super_admin: { label: 'Super Admin', variant: 'primary' },
    department_admin: { label: 'Trưởng khoa', variant: 'info' },
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
