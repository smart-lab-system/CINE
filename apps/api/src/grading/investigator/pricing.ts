import { UNATTRIBUTED, UsageByModel } from './usage-sink';

/** Giá một model, USD cho MỘT TRIỆU token. */
export interface ModelPrice {
  inPerMTok: number;
  outPerMTok: number;
}

const positive = (raw: string | undefined): number | undefined => {
  const trimmed = raw?.trim();
  if (!trimmed) return undefined; // Number('') là 0 — một giá 0 âm thầm làm chi phí trông như miễn phí.
  const n = Number(trimmed);
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

/**
 * Giá của bậc `index` từ env. CẦN CẢ HAI biến; thiếu một thì không có giá. Không có bảng giá nào
 * trong code: giá đổi theo gateway và theo hợp đồng, và một con số do người viết mã đoán là cách
 * chắc chắn nhất để báo cáo chi phí sai mà trông có vẻ đáng tin.
 */
export function readPrice(env: NodeJS.ProcessEnv, index: number): ModelPrice | undefined {
  const inPerMTok = positive(env[`GRADING_TIER${index}_PRICE_IN_PER_MTOK`]);
  const outPerMTok = positive(env[`GRADING_TIER${index}_PRICE_OUT_PER_MTOK`]);
  return inPerMTok !== undefined && outPerMTok !== undefined ? { inPerMTok, outPerMTok } : undefined;
}

/**
 * Chi phí của một lượt, hoặc `null` khi không biết chắc: có model tiêu token mà không có giá, hay
 * có token không rõ model (`UNATTRIBUTED` — tổng chỉ là cận dưới). `null` chứ KHÔNG phải một số
 * thiếu: số thiếu vào báo cáo chi phí sẽ thành "rẻ hơn thật".
 *
 * Là cận TRÊN khi gateway bật prompt caching: `inputTokens` là `prompt_tokens` (đã gồm phần cache) và
 * mỗi bậc chỉ có MỘT giá vào. Hôm nay endpoint báo `cached_tokens` = 0 (xem `openai-chat.ts`), nên chưa
 * lưu token cache; bật caching thì phải lưu thêm `cacheReadTokens` vào `usage_by_model` trước khi tin con số này.
 */
export function costOf(usage: UsageByModel, priceOf: (model: string) => ModelPrice | undefined): number | null {
  let usd = 0;
  for (const [model, u] of Object.entries(usage)) {
    if (u.inputTokens === 0 && u.outputTokens === 0) continue;
    if (model === UNATTRIBUTED) return null;
    const price = priceOf(model);
    if (!price) return null;
    usd += (u.inputTokens * price.inPerMTok + u.outputTokens * price.outPerMTok) / 1_000_000;
  }
  return Math.round(usd * 10_000) / 10_000;
}
