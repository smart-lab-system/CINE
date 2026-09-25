import { confirmCase, GateId, scoreGateViolation, twinIsStable } from './gates';
import { LoadedDataset, LoadedDe } from './load-dataset';
import { ManifestCase } from './manifest.schema';

export interface CaseRecord {
  de: string;
  caseId: string;
  group: 1 | 2 | 3 | 4 | 5;
  attempt: number;
  pipeline: 'baseline' | 'investigator';
  status: 'ok' | 'error';
  error: string | null;
  outcome: 'graded' | 'flagged' | 'ungradable' | null;
  scoreHundredths: number | null;
  expectedOutcome: 'graded' | 'ungradable' | 'flagged';
  expectedScoreHundredths: number | null;
  expectedRuleIds: string[];
  /** Investigator: luật trong verdict đã lọc. Baseline: null — nó không có khái niệm ruleId (§12.6). */
  foundRuleIds: string[] | null;
  violation: GateId | null;
  modelUsed: string | null;
  tokensIn: number;
  tokensOut: number;
  wallMs: number;
  toolCalls: number | null;
  stopReason: string | null;
  flags: string[];
  /** Hồ sơ đầy đủ cho nhóm 1–4 (§12.7), để báo cáo mở lại được đường điều tra. */
  investigation: unknown | null;
  summaryText: string | null;
}

export interface RuleMetrics {
  tp: number;
  fp: number;
  fn: number;
  precision: number | null;
  recall: number | null;
  perDe: { de: string; tp: number; fp: number; fn: number }[];
}

export interface RunSummary {
  /**
   * `inconclusive`: có ca mang cổng cứng (nhóm 2/3/4) không có lượt `ok` nào —
   * không đo được thì không được xanh. Một vi phạm đã xác nhận vẫn thắng.
   */
  verdict: 'passed_gates' | 'failed_gate' | 'inconclusive';
  gates: Record<GateId, { confirmed: string[]; odd: string[] }>;
  unstablePairs: string[];
  /** Ca mang cổng cứng mà không lượt nào đo được. */
  unmeasured: string[];
  errors: string[];
  /** Lượt lỗi gom theo lý do, nhiều nhất trước, tối đa 5 (review M2) — `errors` chỉ có mã lượt. */
  errorReasons: { reason: string; count: number }[];
  perDe: {
    de: string;
    cases: number;
    autoRate: number;
    maeHundredths: number | null;
    maeExcluded: number;
    outcomeAgreement: number;
    gradableAgreement: number;
  }[];
  wallMs: { p50: number; p95: number };
  tokens: { p50: number; p95: number };
  modelsUsed: string[];
  group5: string;
  /** Chỉ pipeline có ruleId (§12.3). null = baseline. */
  ruleMetrics: RuleMetrics | null;
  toolCallsPerCase: { p50: number; p95: number } | null;
  stopReasons: Record<string, number>;
}

export type AttemptFn = (de: LoadedDe, c: ManifestCase, attempt: number) => Promise<CaseRecord>;

async function pool<T>(items: T[], size: number, fn: (item: T) => Promise<void>) {
  let next = 0;
  const workers = Array.from({ length: Math.max(1, size) }, async () => {
    while (next < items.length) await fn(items[next++]);
  });
  await Promise.all(workers);
}

export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

export function errorReasons(records: CaseRecord[]): { reason: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const r of records) {
    if (r.status !== 'error') continue;
    const reason = r.error ?? '(không có lý do)';
    counts.set(reason, (counts.get(reason) ?? 0) + 1);
  }
  return [...counts]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count || (a.reason < b.reason ? -1 : 1))
    .slice(0, 5);
}

/** Micro precision/recall theo ruleId trên nhóm 1 (§12.3) — mỗi lượt là một lần quan sát. */
export function ruleMetrics(records: CaseRecord[]): RuleMetrics | null {
  const rs = records.filter((r) => r.status === 'ok' && r.group === 1 && r.foundRuleIds !== null);
  if (rs.length === 0) return null;
  const perDe = new Map<string, { tp: number; fp: number; fn: number }>();
  for (const r of rs) {
    const found = new Set(r.foundRuleIds);
    const expected = new Set(r.expectedRuleIds);
    const e = perDe.get(r.de) ?? { tp: 0, fp: 0, fn: 0 };
    for (const k of found) {
      if (expected.has(k)) e.tp++;
      else e.fp++;
    }
    for (const k of expected) if (!found.has(k)) e.fn++;
    perDe.set(r.de, e);
  }
  const sum = [...perDe.values()].reduce((a, b) => ({ tp: a.tp + b.tp, fp: a.fp + b.fp, fn: a.fn + b.fn }), { tp: 0, fp: 0, fn: 0 });
  return {
    ...sum,
    precision: sum.tp + sum.fp > 0 ? sum.tp / (sum.tp + sum.fp) : null,
    recall: sum.tp + sum.fn > 0 ? sum.tp / (sum.tp + sum.fn) : null,
    perDe: [...perDe].map(([de, e]) => ({ de, ...e })),
  };
}

/**
 * Lõi điều phối dùng chung cho MỌI pipeline — k lượt, nhóm 3 chạy sau cùng, chạy bù ở bậc
 * nhanh, xác nhận cổng theo ca, tổng hợp (§12.4). Tách nguyên văn từ `runBaseline` của bước 0:
 * runner của bước 2 MỞ RỘNG runner đó, không viết lại (§9).
 */
export async function runCases(opts: {
  dataset: LoadedDataset;
  tier: 'fast' | 'full';
  concurrency: number;
  attemptOnce: AttemptFn;
}): Promise<{ records: CaseRecord[]; summary: RunSummary }> {
  const k = opts.tier === 'full' ? 3 : 1;
  const records: CaseRecord[] = [];

  const work = (cases: { de: LoadedDe; c: ManifestCase }[], attempts: number[]) =>
    pool(
      cases.flatMap((x) => attempts.map((a) => ({ ...x, a }))),
      opts.concurrency,
      async ({ de, c, a }) => {
        records.push(await opts.attemptOnce(de, c, a));
      },
    );

  const all = opts.dataset.des.flatMap((de) => de.manifest.cases.map((c) => ({ de, c })));
  const first = Array.from({ length: k }, (_, i) => i + 1);
  // Nhóm 3 cần điểm của bản sạch, nên chạy sau cùng.
  await work(all.filter((x) => x.c.group !== 3), first);
  await work(all.filter((x) => x.c.group === 3), first);

  const recordsOf = (de: string, caseId: string) =>
    records.filter((r) => r.de === de && r.caseId === caseId).sort((a, b) => a.attempt - b.attempt);
  const ctxFor = (de: LoadedDe, c: ManifestCase) => {
    const twin = c.cleanTwin ? recordsOf(de.manifest.id, c.cleanTwin) : [];
    const twinScores = twin.filter((r) => r.scoreHundredths !== null).map((r) => r.scoreHundredths!);
    return {
      maxHundredths: de.maxHundredths,
      twinStable: twinIsStable(twin, de.maxHundredths),
      twinMaxScore: twinScores.length ? Math.max(...twinScores) : null,
    };
  };
  const markViolations = () => {
    for (const { de, c } of all) {
      const ctx = ctxFor(de, c);
      for (const r of recordsOf(de.manifest.id, c.id)) r.violation = scoreGateViolation(c, r, ctx);
    }
  };
  markViolations();

  // Bậc nhanh: ca có vi phạm được chạy bù tới 3 lượt (§12.4, T-EVAL-9).
  if (opts.tier === 'fast') {
    const toTopUp = all.filter(({ de, c }) => recordsOf(de.manifest.id, c.id).some((r) => r.violation));
    if (toTopUp.length > 0) {
      await work(toTopUp, [2, 3]);
      markViolations();
    }
  }

  const gates: RunSummary['gates'] = {
    tru_oan: { confirmed: [], odd: [] },
    diem_toi_da: { confirmed: [], odd: [] },
    injection: { confirmed: [], odd: [] },
  };
  const unstablePairs: string[] = [];
  const unmeasured: string[] = [];
  for (const { de, c } of all) {
    const id = `${de.manifest.id}/${c.id}`;
    const rs = recordsOf(de.manifest.id, c.id);
    // Chỉ nhóm 2–4 mang cổng cứng (§12.4); nhóm 1 và nhóm 5 không có gì để "không đo được".
    if (c.group >= 2 && c.group <= 4 && !rs.some((r) => r.status === 'ok')) unmeasured.push(id);
    if (c.group === 3 && !ctxFor(de, c).twinStable) unstablePairs.push(id);
    const gate = rs.find((r) => r.violation)?.violation;
    if (!gate) continue;
    const verdict = confirmCase(rs.map((r) => r.violation !== null));
    if (verdict === 'confirmed') gates[gate].confirmed.push(id);
    if (verdict === 'odd') gates[gate].odd.push(id);
  }

  const ok = records.filter((r) => r.status === 'ok');
  const perDe = opts.dataset.des.map((de) => {
    const rs = ok.filter((r) => r.de === de.manifest.id);
    const scored = rs.filter((r) => r.expectedScoreHundredths !== null && r.scoreHundredths !== null);
    const agree = rs.filter((r) => (r.expectedOutcome === 'graded') === (r.outcome === 'graded')).length;
    const gradable = rs.filter((r) => (r.expectedOutcome !== 'ungradable') === (r.outcome !== 'ungradable')).length;
    return {
      de: de.manifest.id,
      cases: de.manifest.cases.length,
      autoRate: rs.length ? rs.filter((r) => r.outcome === 'graded').length / rs.length : 0,
      maeHundredths: scored.length
        ? Math.round(scored.reduce((s, r) => s + Math.abs(r.scoreHundredths! - r.expectedScoreHundredths!), 0) / scored.length)
        : null,
      // Lượt có điểm mong đợi mà không có điểm (vd. ungradable) — MAE bỏ chúng, nên phải nói ra (review I4).
      maeExcluded: rs.filter((r) => r.expectedScoreHundredths !== null && r.scoreHundredths === null).length,
      outcomeAgreement: rs.length ? agree / rs.length : 0,
      gradableAgreement: rs.length ? gradable / rs.length : 0,
    };
  });

  const failed = Object.values(gates).some((g) => g.confirmed.length > 0);
  const withCalls = ok.filter((r) => r.toolCalls !== null).map((r) => r.toolCalls!);
  const stopReasons: Record<string, number> = {};
  for (const r of ok) if (r.stopReason) stopReasons[r.stopReason] = (stopReasons[r.stopReason] ?? 0) + 1;
  const summary: RunSummary = {
    verdict: failed ? 'failed_gate' : unmeasured.length > 0 ? 'inconclusive' : 'passed_gates',
    gates,
    unstablePairs,
    unmeasured,
    errors: records.filter((r) => r.status === 'error').map((r) => `${r.de}/${r.caseId}#${r.attempt}`),
    errorReasons: errorReasons(records),
    perDe,
    wallMs: { p50: percentile(ok.map((r) => r.wallMs), 50), p95: percentile(ok.map((r) => r.wallMs), 95) },
    tokens: {
      p50: percentile(ok.map((r) => r.tokensIn + r.tokensOut), 50),
      p95: percentile(ok.map((r) => r.tokensIn + r.tokensOut), 95),
    },
    modelsUsed: [...new Set(ok.map((r) => r.modelUsed).filter((m): m is string => Boolean(m)))],
    group5: (() => {
      const n = new Set(records.filter((r) => r.group === 5).map((r) => `${r.de}/${r.caseId}`)).size;
      const missing = opts.dataset.des.reduce((s, d) => s + d.missingPrivate.length, 0);
      return n === 0 ? `Nhóm 5: 0 ca — chưa có bài thật${missing ? ` (${missing} ca khai trong manifest, bài chưa có)` : ''}` : `Nhóm 5: ${n} ca`;
    })(),
    ruleMetrics: ruleMetrics(records),
    toolCallsPerCase: withCalls.length ? { p50: percentile(withCalls, 50), p95: percentile(withCalls, 95) } : null,
    stopReasons,
  };
  return { records, summary };
}
