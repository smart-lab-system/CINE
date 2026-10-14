import type { PlanStudent, StudentOutcome } from './plan';

/** Lý do của sinh viên có nhiều kết quả trong phạm vi xuất (R-a, P1a): chưa có tổng điểm, nên không chọn một. */
export const CONFLICT_REASON = 'nhiều kết quả — chưa có điểm tổng';

/**
 * Gộp danh sách lớp và các kết quả thành MỘT dòng mỗi sinh viên. Khoá là MSSV chữ thường.
 *
 * Sinh viên có từ hai kết quả trở lên trong phạm vi → `conflict`, KHÔNG lấy kết quả cuối (bẫy 3, §9):
 * ghi đè im lặng là ghi một điểm mà không ai đã chọn. Sinh viên không có kết quả nào giữ `absent`.
 */
export function foldStudentResults(
  roster: { mssv: string; name: string }[],
  results: { mssv: string; name: string; outcome: StudentOutcome }[],
): PlanStudent[] {
  const map = new Map<string, PlanStudent>();
  for (const r of roster) {
    map.set(r.mssv.toLowerCase(), { mssv: r.mssv, name: r.name, outcome: { kind: 'blank', reason: 'absent' } });
  }
  const seen = new Set<string>();
  for (const r of results) {
    const key = r.mssv.toLowerCase();
    const known = map.get(key);
    const outcome: StudentOutcome = seen.has(key) ? { kind: 'conflict', reason: CONFLICT_REASON } : r.outcome;
    seen.add(key);
    map.set(key, { mssv: known?.mssv ?? r.mssv, name: known?.name ?? r.name, outcome });
  }
  return [...map.values()];
}
