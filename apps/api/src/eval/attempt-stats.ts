// src/eval/attempt-stats.ts
import { totalOf, UsageByModel } from '../grading/investigator/usage-sink';

export interface AttemptRow {
  resultId: string;
  startedAt: string;
  finishedAt: string | null;
  outcome: string | null;
  tokensIn: number | null;
  tokensOut: number | null;
  costUsd: number | null;
  usageByModel: { investigation?: UsageByModel; challenge?: UsageByModel } | null;
}

export interface AttemptStats {
  units: number;
  wallSeconds: { p50: number | null; p95: number | null; max: number | null };
  tokens: { p50: number | null; p95: number | null };
  challengeTokenShare: number | null;
  cost: { pricedUnits: number; unpricedUnits: number; totalUsd: number | null; p50: number | null; p95: number | null };
  sessionWallSeconds: number | null;
}

/** Hạng gần nhất (nearest-rank): p% của n phần tử là phần tử thứ ceil(p/100·n). */
function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)];
}

/**
 * Thống kê MỖI ĐƠN VỊ chấm (spec §11: ngân sách phải đo, không đoán). Thuần: nhận hàng đã đọc từ
 * `grading_attempt`, không chạm DB — nằm ở `eval/` nơi import-scan cấm mọi đường tới DB.
 *
 * Chi phí chỉ cộng các lượt CÓ giá; số lượt không có giá được nói ra, vì một tổng bỏ qua chúng sẽ
 * trông rẻ hơn thật.
 */
export function summarizeAttempts(rows: AttemptRow[]): AttemptStats {
  const done = rows.filter((r) => r.finishedAt !== null);
  const wall = done.map((r) => (Date.parse(r.finishedAt!) - Date.parse(r.startedAt)) / 1000);
  const tokensOf = (r: AttemptRow): number => {
    if (r.usageByModel) {
      const t = totalOf(mergeShallow(r.usageByModel.investigation, r.usageByModel.challenge));
      return t.inputTokens + t.outputTokens;
    }
    return (r.tokensIn ?? 0) + (r.tokensOut ?? 0);
  };
  const withBreakdown = done.filter((r) => r.usageByModel !== null);
  const challengeTokens = withBreakdown.reduce((s, r) => {
    const t = totalOf(r.usageByModel!.challenge ?? {});
    return s + t.inputTokens + t.outputTokens;
  }, 0);
  const allTokens = withBreakdown.reduce((s, r) => s + tokensOf(r), 0);
  const priced = done.filter((r) => r.costUsd !== null).map((r) => r.costUsd!);
  const starts = done.map((r) => Date.parse(r.startedAt));
  const ends = done.map((r) => Date.parse(r.finishedAt!));
  return {
    units: done.length,
    wallSeconds: { p50: percentile(wall, 50), p95: percentile(wall, 95), max: wall.length ? Math.max(...wall) : null },
    tokens: { p50: percentile(done.map(tokensOf), 50), p95: percentile(done.map(tokensOf), 95) },
    challengeTokenShare: allTokens > 0 ? challengeTokens / allTokens : null,
    cost: {
      pricedUnits: priced.length,
      unpricedUnits: done.length - priced.length,
      totalUsd: priced.length ? priced.reduce((s, x) => s + x, 0) : null,
      p50: percentile(priced, 50),
      p95: percentile(priced, 95),
    },
    sessionWallSeconds: done.length ? (Math.max(...ends) - Math.min(...starts)) / 1000 : null,
  };
}

/** Cộng hai `UsageByModel` có thể thiếu — dùng nội bộ để tính tổng token của một lượt. */
function mergeShallow(a: UsageByModel | undefined, b: UsageByModel | undefined): UsageByModel {
  const out: UsageByModel = {};
  for (const part of [a ?? {}, b ?? {}]) {
    for (const [model, u] of Object.entries(part)) {
      const cur = out[model] ?? { inputTokens: 0, outputTokens: 0 };
      out[model] = { inputTokens: cur.inputTokens + u.inputTokens, outputTokens: cur.outputTokens + u.outputTokens };
    }
  }
  return out;
}
