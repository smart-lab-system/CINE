// `super_admin`/`department_admin` exist as account.role values in the DB
// (reserved for future Department/Super-Admin tiering) but aren't offered
// for creation/filtering here: RolesGuard's @Roles('admin') only matches
// the literal 'admin' role, so creating one of those from this UI today
// would produce an account locked out of every admin-only page, including
// this one. Shared by account-form.tsx, edit-account-form.tsx, and the
// accounts list page's role filter + badge — was previously duplicated
// between the two form files.
export const ACCOUNT_ROLE_OPTIONS = ['admin', 'teacher'] as const;
export type AccountRoleOption = (typeof ACCOUNT_ROLE_OPTIONS)[number];

export const ACCOUNT_ROLE_LABELS: Record<AccountRoleOption, string> = {
  admin: 'Quản trị',
  teacher: 'Giảng viên',
};

export const ACCOUNT_ROLE_BADGE_VARIANT: Record<AccountRoleOption, 'accent' | 'info'> = {
  admin: 'accent',
  teacher: 'info',
};
