/**
 * Quy tắc tắt cầu dao (spec 2026-10-21 §5.3) — file THUẦN: không DB, không đọc `process.env`, không đọc đồng hồ.
 *
 * Với một phạm vi (một luật của một giảng viên, hoặc lớp bài không lỗi), `n` là số nhãn kiểm mẫu mù đang được đếm
 * và `d` là số nhãn BẤT ĐỒNG giữa giảng viên và hệ thống. Cầu dao tắt khi số bất đồng quá nhiều để còn phù hợp với
 * mức bất đồng chấp nhận được `p0`: `P(X >= d | n, p0) < alpha`, X ~ Binomial(n, p0), kiểm một phía.
 */

/** Mức bất đồng chấp nhận được (giả thuyết, không phải cam kết chất lượng — spec §5.3). */
export const BREAKER_P0 = 0.05;
/** Mức ý nghĩa: tắt khi pValue NHỎ HƠN alpha (so sánh nghiêm ngặt). */
export const BREAKER_ALPHA = 0.05;

function assertCount(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${name} phải là số nguyên không âm, nhận ${String(value)}`);
  }
}

/** ln C(n, k), cộng `k' = min(k, n - k)` số hạng ln((n - k' + i) / i) — không giai thừa nên không tràn số. */
function logChoose(n: number, k: number): number {
  const m = Math.min(k, n - k);
  let sum = 0;
  for (let i = 1; i <= m; i++) {
    sum += Math.log((n - m + i) / i);
  }
  return sum;
}

/**
 * P(X >= d), X ~ Binomial(n, p).
 *
 * Cộng TRỰC TIẾP các số hạng đuôi `k = d..n` (không lấy `1 - P(X < d)`, vì đuôi nhỏ sẽ mất hết chữ số có nghĩa),
 * trong không gian log: ln t(d) từ `logChoose`, rồi `ln t(k+1) = ln t(k) + ln((n-k)/(k+1)) + ln(p/q)`. Nhờ vậy n lớn
 * không làm `q^n` tràn dưới về 0 (đuôi thật gần 1 vẫn ra gần 1). Các số hạng được trừ cho số hạng lớn nhất trước khi
 * lấy mũ (log-sum-exp). Số hạng của đuôi là đơn đỉnh nên đỉnh là `max(d, mode)`; hai lượt duyệt, không cấp phát mảng.
 *
 * Ba ca có dạng đóng được trả thẳng, không đi qua log: `d = 0` → đúng 1; `p` ở biên 0 và 1; `d = n` → `p^n`
 * (một số hạng duy nhất — đi qua exp/log có thể lệch 1 ulp, mà ca n=1, d=1 phải ra đúng 0,05).
 */
export function binomialTailAtLeast(n: number, d: number, p: number): number {
  assertCount('n', n);
  assertCount('d', d);
  if (d > n) {
    throw new RangeError(`d (${d}) không được lớn hơn n (${n})`);
  }
  if (!(p >= 0 && p <= 1)) {
    throw new RangeError(`p phải nằm trong [0, 1], nhận ${String(p)}`);
  }

  if (d === 0) return 1;
  if (p === 0) return 0;
  if (p === 1) return 1;
  if (d === n) return p ** n;

  const logP = Math.log(p);
  const logQ = Math.log1p(-p);
  const logRatio = logP - logQ;

  const first = logChoose(n, d) + d * logP + (n - d) * logQ;

  let max = first;
  let current = first;
  for (let k = d; k < n; k++) {
    current += Math.log((n - k) / (k + 1)) + logRatio;
    if (current > max) max = current;
  }

  let sum = Math.exp(first - max);
  current = first;
  for (let k = d; k < n; k++) {
    current += Math.log((n - k) / (k + 1)) + logRatio;
    sum += Math.exp(current - max);
  }

  return Math.min(1, Math.exp(max) * sum);
}

export interface BreakerVerdict {
  trip: boolean;
  pValue: number;
}

/**
 * `n = 0` → không tắt, `pValue = 1` (không có nhãn thì không có bằng chứng). `trip` là `pValue < BREAKER_ALPHA` NGHIÊM
 * NGẶT, không epsilon: ca (n=1, d=1) có pValue đúng 0,05 và KHÔNG tắt — một nhãn bất đồng đơn lẻ không đủ để tắt.
 *
 * @throws RangeError khi n âm hoặc không nguyên, d âm, không nguyên hoặc lớn hơn n.
 */
export function breakerVerdict(input: { n: number; disagreements: number }): BreakerVerdict {
  const pValue = binomialTailAtLeast(input.n, input.disagreements, BREAKER_P0);
  return { trip: pValue < BREAKER_ALPHA, pValue };
}
