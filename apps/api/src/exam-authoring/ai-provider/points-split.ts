/**
 * Chia tổng điểm (đơn vị phần trăm điểm) cho `count` câu, bằng số nguyên phần trăm. Mỗi câu làm tròn xuống, phần dư
 * dồn vào câu cuối nên tổng luôn đúng. Ví dụ: 1000 cho 3 câu → [333, 333, 334], tức 3,33 + 3,33 + 3,34 (review I3).
 * Hàm thuần.
 */
export function splitTotalHundredths(totalHundredths: number, count: number): number[] {
  const base = Math.floor(totalHundredths / count);
  const parts = Array.from({ length: count }, () => base);
  parts[count - 1] += totalHundredths - base * count;
  return parts;
}
