/**
 * Which area of the app each role lives in.
 *
 * This map is deliberately **exhaustive and total**: a role that is not in it
 * has no area, and is sent to an explicit "chưa được gán vai trò" page rather
 * than into an area whose APIs will refuse it.
 *
 * That rule exists because the alternative already bit us twice. `middleware`
 * used to sort roles into "admin family" and "everyone else", which put both
 * `department_admin` and `super_admin` into `/admin/*` — where every call
 * returns 403, because the API's only `@Roles` values are `'admin'` and
 * `'teacher'`. A logged-in user landed on a page where nothing worked and
 * nothing said why. Naming the two roles individually would have left the
 * same trap armed for the next value someone adds to the enum, so the
 * failure is made structural instead: unmapped means visibly unmapped.
 */
export const ROLE_AREAS = {
  admin: '/admin',
  department_admin: '/department',
  teacher: '/teacher',
} as const;

export type MappedRole = keyof typeof ROLE_AREAS;

/** Every area a signed-in user can be routed into. */
export const ALL_AREAS = Object.values(ROLE_AREAS);

/** Where an unmapped role goes: a page that says so, not a dead end. */
export const UNASSIGNED_ROLE_PATH = '/unassigned-role';

export function isMappedRole(role: string | null): role is MappedRole {
  return role !== null && role in ROLE_AREAS;
}

/** The area this role owns, or null when it has none. */
export function areaForRole(role: string | null): string | null {
  return isMappedRole(role) ? ROLE_AREAS[role] : null;
}

/**
 * Where to send this role when they land somewhere that is not theirs.
 * `super_admin` has no area today; it resolves here, which is the point.
 */
export function homeForRole(role: string | null): string {
  const area = areaForRole(role);
  return area ? `${area}/dashboard` : UNASSIGNED_ROLE_PATH;
}
