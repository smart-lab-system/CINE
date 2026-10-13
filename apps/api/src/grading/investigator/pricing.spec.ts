import { costOf, readPrice } from './pricing';
import { UNATTRIBUTED } from './usage-sink';

const P = { inPerMTok: 3, outPerMTok: 15 };

describe('readPrice()', () => {
  it('đọc đủ hai biến dương → giá', () => {
    expect(readPrice({ GRADING_TIER1_PRICE_IN_PER_MTOK: '3', GRADING_TIER1_PRICE_OUT_PER_MTOK: '15' }, 1)).toEqual(P);
  });
  it('thiếu một trong hai → không có giá (không đoán)', () => {
    expect(readPrice({ GRADING_TIER1_PRICE_IN_PER_MTOK: '3' }, 1)).toBeUndefined();
    expect(readPrice({}, 1)).toBeUndefined();
  });
  it('giá rỗng, 0, âm hay không phải số → không có giá (Number("") là 0)', () => {
    for (const bad of ['', '0', '-1', 'abc', 'NaN', 'Infinity']) {
      expect(readPrice({ GRADING_TIER2_PRICE_IN_PER_MTOK: bad, GRADING_TIER2_PRICE_OUT_PER_MTOK: '15' }, 2)).toBeUndefined();
    }
  });
});

describe('costOf()', () => {
  it('một model có giá: (vào × giá vào + ra × giá ra) / 1.000.000, làm tròn 4 chữ số', () => {
    const usage = { A: { inputTokens: 200_000, outputTokens: 10_000 } };
    // 0,2M × 3 + 0,01M × 15 = 0,6 + 0,15 = 0,75
    expect(costOf(usage, () => P)).toBe(0.75);
  });
  it('nhiều model, mỗi model giá riêng', () => {
    const usage = { A: { inputTokens: 1_000_000, outputTokens: 0 }, B: { inputTokens: 0, outputTokens: 1_000_000 } };
    const priceOf = (m: string) => (m === 'A' ? { inPerMTok: 1, outPerMTok: 2 } : { inPerMTok: 10, outPerMTok: 20 });
    expect(costOf(usage, priceOf)).toBe(21);
  });
  it('Review Focus 3 — một model có token mà không có giá → null, KHÔNG phải 0 hay số thiếu', () => {
    const usage = { A: { inputTokens: 100, outputTokens: 10 }, B: { inputTokens: 100, outputTokens: 10 } };
    expect(costOf(usage, (m) => (m === 'A' ? P : undefined))).toBeNull();
  });
  it('Review Focus 3 — có token không rõ model → null (chỉ là cận dưới)', () => {
    expect(costOf({ A: { inputTokens: 1, outputTokens: 1 }, [UNATTRIBUTED]: { inputTokens: 5, outputTokens: 5 } }, () => P)).toBeNull();
  });
  it('model không tiêu token nào thì không cần giá', () => {
    expect(costOf({ A: { inputTokens: 0, outputTokens: 0 } }, () => undefined)).toBe(0);
  });
  it('không dùng model nào → 0 (không phải null): lượt chấm chưa gọi model', () => {
    expect(costOf({}, () => undefined)).toBe(0);
  });
});
