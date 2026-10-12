export const RULES_PATH = '/teacher/rules';

/**
 * Liên kết tới Bảng lỗi; biết rubric thì mở đúng rubric đó (`?rubric=<tên>`, spec mục 5.8, T-RBE-UI-9).
 * Tên rubric là chữ giảng viên gõ nên LUÔN qua `encodeURIComponent` — `&`, `#`, `?`, `%`, `+` đều có thể có mặt.
 */
export function rulesHref(rubricName?: string | null): string {
  return rubricName ? `${RULES_PATH}?rubric=${encodeURIComponent(rubricName)}` : RULES_PATH;
}
