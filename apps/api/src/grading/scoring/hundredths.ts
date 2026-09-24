const SCORE = /^(\d{1,4})(?:\.(\d{1,2}))?$/;

/**
 * Đọc điểm (chuỗi `numeric` của Postgres, hoặc chuỗi trong fixture) thành
 * số nguyên phần trăm điểm. KHÔNG qua parseFloat: 10 − 0,1 − 0,2 bằng số
 * thực ra 9,700000000000001, và cờ "điểm đã đổi" sẽ báo giả (spec §13.2).
 */
export function parseHundredths(value: string): number {
  const match = SCORE.exec(value.trim());
  if (!match) {
    throw new Error(`"${value}" không phải điểm hợp lệ (tối đa hai chữ số lẻ, không âm)`);
  }
  const whole = Number(match[1]);
  const frac = match[2] ? Number(match[2].padEnd(2, '0')) : 0;
  return whole * 100 + frac;
}

export function formatHundredths(value: number): string {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${value} không phải số nguyên phần trăm điểm hợp lệ`);
  }
  return `${Math.floor(value / 100)}.${String(value % 100).padStart(2, '0')}`;
}
