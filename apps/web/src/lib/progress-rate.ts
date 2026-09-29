/**
 * Tốc độ chấm và thời gian còn lại (spec §3.8): "số đo được, ghi rõ là ước tính và đo trên khoảng nào. Không
 * ước được thì nói là không ước được."
 *
 * Đo từ CHÍNH các lần hỏi tiến độ của trang này (số bài đã xong theo thời gian) — server không trả tốc độ và
 * `queue` là hàng đợi toàn hệ thống, không phải của riêng phiên. Nên: chưa đủ mẫu, chưa đủ thời gian, hoặc
 * chưa có bài nào xong trong khoảng đo thì trả `null`, không bịa một con số.
 */
export interface RateSample {
  /** Mốc thời gian, mili giây. */
  t: number;
  /** Số bài đã có kết quả tại mốc đó. */
  done: number;
}

/** Chỉ nhìn 10 phút gần nhất: một đợt nhanh từ lâu không nói gì về bây giờ. */
export const RATE_WINDOW_MS = 10 * 60_000;
/** Dưới ngần này thì hai mẫu cách nhau chưa đủ để gọi là một tốc độ. */
export const RATE_MIN_SPAN_MS = 20_000;

export function addSample(samples: RateSample[], sample: RateSample): RateSample[] {
  return [...samples, sample].filter((s) => sample.t - s.t <= RATE_WINDOW_MS);
}

export interface RateEstimate {
  perMinute: number;
  minutesLeft: number;
  spanSeconds: number;
}

export function estimate(samples: RateSample[], pending: number): RateEstimate | null {
  if (samples.length < 2) return null;
  const first = samples[0];
  const last = samples[samples.length - 1];
  const span = last.t - first.t;
  const finished = last.done - first.done;
  if (span < RATE_MIN_SPAN_MS || finished <= 0) return null;
  const perMinute = finished / (span / 60_000);
  return { perMinute, minutesLeft: pending / perMinute, spanSeconds: Math.round(span / 1000) };
}

const vn = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ','));

export function describeRate(e: RateEstimate | null): string {
  if (e === null) return 'Chưa ước tính được — cần đo thêm một lúc.';
  const left =
    e.minutesLeft <= 0 ? '' : e.minutesLeft < 1 ? ', còn dưới 1 phút' : `, còn khoảng ${Math.ceil(e.minutesLeft)} phút`;
  return `Ước tính: khoảng ${vn(e.perMinute)} bài/phút${left} — đo trong ${e.spanSeconds} giây vừa qua.`;
}

/**
 * Số bài đã xong đứng yên bao lâu (giây), tính từ LẦN ĐỔI cuối cùng giữa các mẫu — hoặc từ mẫu đầu nếu chưa
 * từng đổi. Cho băng "bài bị treo": nói "tiến độ đã đứng yên bao lâu" thay vì chỉ "có bài treo". `null` khi
 * chưa đủ hai mẫu để nói.
 */
export function stalledSeconds(samples: RateSample[], now: number): number | null {
  if (samples.length < 2) return null;
  let lastChange = samples[0].t;
  for (let i = 1; i < samples.length; i += 1) {
    if (samples[i].done !== samples[i - 1].done) lastChange = samples[i].t;
  }
  return Math.round((now - lastChange) / 1000);
}

export function describeStall(seconds: number): string {
  return seconds < 60 ? `${seconds} giây` : `${Math.round(seconds / 60)} phút`;
}
