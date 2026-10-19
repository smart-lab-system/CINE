/**
 * Trạng thái của MỘT câu với MỘT sinh viên, đã rút gọn cho việc cộng điểm (P1b §3.4).
 *
 * - `finalized` / `exported`: câu đã chốt, có `scoreHundredths`.
 * - `pending`: có bài nhưng chưa chốt (điểm tạm không bao giờ ra ngoài — §13.1 luật 5).
 * - `blank`: sinh viên không có bài cho câu này.
 * - `auditPending`: câu đang chờ kiểm mẫu; điểm câu đó có thể còn đổi.
 */
export interface ProblemState {
  ordinal: number;
  status: 'finalized' | 'exported' | 'pending' | 'blank';
  pointsHundredths: number;
  scoreHundredths: number | null;
  auditPending: boolean;
}

export type StudentTotal =
  /** Mọi câu đã chốt: điểm tổng chắc chắn. */
  | { kind: 'final'; hundredths: number }
  /** Còn câu chưa chốt hoặc vắng. `hundredths` chỉ cộng các câu đã chốt; `missing` là các câu chưa có bài. */
  | { kind: 'tạm'; hundredths: number; missing: number[] }
  /** Có câu đang chờ kiểm mẫu: không lộ số, vì kiểm mẫu có thể đổi điểm câu đó. */
  | { kind: 'dash' };

/**
 * Điểm tổng của MỘT sinh viên. Hàm cộng các câu; không làm tròn lại — mỗi `scoreHundredths` đã được làm tròn ở
 * nơi chấm.
 *
 * Thứ tự ưu tiên: có câu chờ kiểm mẫu → `dash`; rồi thiếu câu hoặc còn câu chưa chốt → `tạm`; còn lại → `final`.
 * `blank` được tính là thiếu, cùng với ordinal vắng hẳn khỏi mảng.
 */
export function aggregateStudentTotal(
  problems: ProblemState[],
  expectedCount: number,
  /** Số thứ tự câu thực tế của phiên. Mặc định 1..expectedCount; phiên đã bỏ câu giữa chừng thì truyền số thực tế. */
  expectedOrdinals: number[] = Array.from({ length: expectedCount }, (_, i) => i + 1),
): StudentTotal {
  if (problems.some((p) => p.auditPending)) {
    return { kind: 'dash' };
  }
  const byOrdinal = new Map(problems.map((p) => [p.ordinal, p]));
  const missing: number[] = [];
  for (const ordinal of expectedOrdinals) {
    const p = byOrdinal.get(ordinal);
    if (!p || p.status === 'blank') {
      missing.push(ordinal);
    }
  }
  const isFinal = (p: ProblemState): boolean => p.status === 'finalized' || p.status === 'exported';
  const hundredths = problems.filter(isFinal).reduce((sum, p) => sum + (p.scoreHundredths ?? 0), 0);
  if (missing.length === 0 && problems.every(isFinal)) {
    return { kind: 'final', hundredths };
  }
  return { kind: 'tạm', hundredths, missing };
}
