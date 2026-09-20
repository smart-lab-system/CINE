/**
 * Which area of the app each role lives in.
 *
 * This map is deliberately **exhaustive and total**: a role that is not in it
 * has no area, and is sent to an explicit "chưa được gán vai trò" page rather
 * than into an area whose APIs will refuse it.
 *
 * That rule exists because the alternative already bit us twice. `middleware`
 * used to sort roles into "admin family" and "everyone else", which put every
 * admin-ish role into `/admin/*` — where the calls 403, because the API only
 * accepts the roles it names. A logged-in user landed on a page where nothing
 * worked and nothing said why.
 *
 * Vẫn giữ nguyên hình dạng này sau khi enum rút còn hai giá trị, và lý do
 * còn mạnh hơn trước: một token phát TRƯỚC `ContractMasterData` vẫn mang
 * `department_admin` cho tới khi hết hạn, và nó phải rơi vào trang 'chưa
 * được gán vai trò' thay vì vào một khu vực không còn tồn tại.
 */
export const ROLE_AREAS = {
  admin: '/admin',
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
 * Một vai trò đã rút không có khu vực nào; nó rơi về đây, và đó là điểm.
 */
export function homeForRole(role: string | null): string {
  const area = areaForRole(role);
  return area ? `${area}/dashboard` : UNASSIGNED_ROLE_PATH;
}
