// src/eval/attempt-stats.spec.ts
import { AttemptRow, summarizeAttempts } from './attempt-stats';

const row = (over: Partial<AttemptRow>): AttemptRow => ({
  resultId: 'r', startedAt: '2026-10-12T10:00:00.000Z', finishedAt: '2026-10-12T10:01:00.000Z', outcome: 'graded',
  tokensIn: 1000, tokensOut: 100, costUsd: null, usageByModel: null, ...over,
});

describe('summarizeAttempts()', () => {
  it('không có hàng nào → mọi số là null, 0 đơn vị', () => {
    expect(summarizeAttempts([])).toEqual({
      units: 0, wallSeconds: { p50: null, p95: null, max: null }, tokens: { p50: null, p95: null },
      challengeTokenShare: null, cost: { pricedUnits: 0, unpricedUnits: 0, totalUsd: null, p50: null, p95: null }, sessionWallSeconds: null,
    });
  });

  it('chỉ đếm lượt đã kết thúc (có finishedAt); thời gian tính bằng giây', () => {
    const s = summarizeAttempts([
      row({ resultId: 'a', startedAt: '2026-10-12T10:00:00.000Z', finishedAt: '2026-10-12T10:01:00.000Z' }), // 60 s
      row({ resultId: 'b', startedAt: '2026-10-12T10:00:10.000Z', finishedAt: '2026-10-12T10:02:10.000Z' }), // 120 s
      row({ resultId: 'c', finishedAt: null }), // đang chạy: bỏ
    ]);
    expect(s.units).toBe(2);
    expect(s.wallSeconds).toEqual({ p50: 60, p95: 120, max: 120 });
    // Cả phiên: từ lúc bắt đầu sớm nhất (10:00:00) tới lúc kết thúc muộn nhất (10:02:10) = 130 s.
    expect(s.sessionWallSeconds).toBe(130);
  });

  it('token: ưu tiên tổng của usageByModel (điều tra + lăng kính); không có thì tokensIn + tokensOut', () => {
    const s = summarizeAttempts([
      row({ resultId: 'a', usageByModel: { investigation: { m: { inputTokens: 800, outputTokens: 100 } }, challenge: { m: { inputTokens: 90, outputTokens: 10 } } } }),
      row({ resultId: 'b', tokensIn: 500, tokensOut: 50 }),
    ]);
    // a = 800+100+90+10 = 1000 ; b = 550
    expect(s.tokens).toEqual({ p50: 550, p95: 1000 });
  });

  it('phần token của lăng kính trên tổng (chỉ tính trên các lượt có usageByModel)', () => {
    const s = summarizeAttempts([
      row({ usageByModel: { investigation: { m: { inputTokens: 700, outputTokens: 100 } }, challenge: { m: { inputTokens: 180, outputTokens: 20 } } } }),
    ]);
    expect(s.challengeTokenShare).toBeCloseTo(0.2, 5); // 200 / 1000
  });

  it('chi phí: tổng chỉ trên các lượt CÓ giá; nói rõ bao nhiêu lượt không có giá (không âm thầm coi là 0)', () => {
    const s = summarizeAttempts([
      row({ resultId: 'a', costUsd: 0.1 }),
      row({ resultId: 'b', costUsd: 0.3 }),
      row({ resultId: 'c', costUsd: null }),
    ]);
    expect(s.cost.pricedUnits).toBe(2);
    expect(s.cost.unpricedUnits).toBe(1);
    expect(s.cost.totalUsd).toBeCloseTo(0.4, 5);
  });

  it('không lượt nào có giá → totalUsd là null (không phải 0)', () => {
    expect(summarizeAttempts([row({ costUsd: null })]).cost.totalUsd).toBeNull();
  });
});
