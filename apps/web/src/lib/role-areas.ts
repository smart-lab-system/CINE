/**
 * Which area of the app each role lives in.
 *
 * This map is deliberately **exhaustive and total**: a role that is not in it
 * has no area, and is sent to an explicit "chưa được gán vai trò" page rather
 * than into an area whose APIs will refuse it.
 *
 * That rule exists because the alternative already bit us twice. `middleware`
 * used to sort roles into "admin family" and "everyone else", which put every
 * non-teacher role into `/admin/*` — where every call returns 403, because
 * the API accepted only `'admin'` and `'teacher'` then. A logged-in user
 * landed on a page where nothing worked and nothing said why. Naming each
 * role individually would have left the same trap armed for the next value
 * someone adds to the enum, so the failure is made structural instead:
 * unmapped means visibly unmapped.
 */
export const ROLE_AREAS = {
  admin: '/admin',
  department_admin: '/department',
  teacher: '/teacher',
  // Phòng Đào tạo. Tên area mô tả CÔNG VIỆC, không thứ bậc — cùng lý do role
  // đổi tên từ super_admin thành academic_affairs.
  academic_affairs: '/academic',
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
 * Area nào KHÔNG có dashboard riêng, và trang nào là nhà của nó thay thế.
 *
 * `/academic` là tier một trang: Phòng Đào tạo sở hữu đúng một thứ, quyển lịch
 * học kỳ. Dựng thêm một dashboard chỉ để có chỗ hạ cánh là thêm một trang
 * trống.
 */
const AREA_HOME: Record<string, string> = {
  '/academic': '/academic/semesters',
};

/**
 * Where to send this role when they land somewhere that is not theirs.
 * A role still absent from ROLE_AREAS resolves to UNASSIGNED_ROLE_PATH,
 * which is the point.
 */
export function homeForRole(role: string | null): string {
  const area = areaForRole(role);
  if (!area) {
    return UNASSIGNED_ROLE_PATH;
  }
  return AREA_HOME[area] ?? `${area}/dashboard`;
}
