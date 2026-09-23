import { AIGradingProvider, GradingRequest } from '../grading/ai-provider/ai-grading-provider';
import { DocumentResolver } from '../grading/content-resolver/document-resolver';
import { gradeOneShot } from '../grading/one-shot-grade';
import { parseHundredths } from '../grading/scoring/hundredths';
import { confirmCase, GateId, scoreGateViolation, twinIsStable } from './gates';
import { expectedScoreHundredths, LoadedDataset, LoadedDe } from './load-dataset';
import { ManifestCase } from './manifest.schema';

export interface CaseRecord {
  de: string;
  caseId: string;
  group: 1 | 2 | 3 | 4;
  attempt: number;
  status: 'ok' | 'error';
  error: string | null;
  outcome: 'graded' | 'flagged' | null;
  scoreHundredths: number | null;
  expectedOutcome: 'graded' | 'ungradable' | 'flagged';
  expectedScoreHundredths: number | null;
  violation: GateId | null;
  modelUsed: string | null;
  tokensIn: number;
  tokensOut: number;
  wallMs: number;
}

export interface RunSummary {
  verdict: 'passed_gates' | 'failed_gate';
  gates: Record<GateId, { confirmed: string[]; odd: string[] }>;
  unstablePairs: string[];
  errors: string[];
  perDe: { de: string; cases: number; autoRate: number; maeHundredths: number | null; outcomeAgreement: number }[];
  wallMs: { p50: number; p95: number };
  tokens: { p50: number; p95: number };
  modelsUsed: string[];
  group5: string;
}

const resolver = new DocumentResolver();

function requestFor(de: LoadedDe, c: ManifestCase, content: string): GradingRequest {
  return {
    studentMssv: c.id,
    content,
    // Đường hôm nay đọc mã như văn bản qua DocumentResolver (spec §0).
    deliverableType: 'document',
    criteria: de.manifest.rubric.map((r) => ({
      id: r.key,
      description: r.description,
      maxPoints: parseHundredths(r.maxPoints) / 100,
    })),
    // Đề và đáp án mẫu đi dạng VĂN BẢN qua ghi chú (mức 3 hôm nay) — fixture
    // không có PDF. Ghi vào run.json là `reference: 'note-text'`.
    reference: {
      modelAnswerNote: `Đề bài:\n${de.manifest.statement}\n\nĐáp án mẫu:\n${de.modelSource}`,
    },
  };
}

async function pool<T>(items: T[], size: number, fn: (item: T) => Promise<void>) {
  let next = 0;
  const workers = Array.from({ length: Math.max(1, size) }, async () => {
    while (next < items.length) await fn(items[next++]);
  });
  await Promise.all(workers);
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

/**
 * Chạy BASELINE — đường chấm một-phát hôm nay, qua đúng `gradeOneShot` mà
 * worker chấm dùng — trên bộ dữ liệu eval (spec 2026-09-20 §9 bước 0, §12.6).
 *
 * Không mở DB, không ghi bảng nào (§12.5, T-EVAL-5): ngữ cảnh đến từ fixture,
 * kết quả trả về cho người gọi ghi ra file. Provider lỗi ở một lượt thì lượt
 * đó là `error`, không phải vi phạm và không phải 0 điểm.
 */
export async function runBaseline(opts: {
  dataset: LoadedDataset;
  provider: AIGradingProvider;
  tier: 'fast' | 'full';
  concurrency: number;
}): Promise<{ records: CaseRecord[]; summary: RunSummary }> {
  const k = opts.tier === 'full' ? 3 : 1;
  const records: CaseRecord[] = [];

  const attemptOnce = async (de: LoadedDe, c: ManifestCase, attempt: number): Promise<CaseRecord> => {
    const base = {
      de: de.manifest.id,
      caseId: c.id,
      group: c.group,
      attempt,
      expectedOutcome: c.expectedOutcome,
      expectedScoreHundredths: expectedScoreHundredths(de, c),
      violation: null as GateId | null,
    };
    const started = Date.now();
    try {
      const content = (await resolver.resolve(Buffer.from(de.sources.get(c.id)!, 'utf8'), c.file)).text;
      const run = await gradeOneShot(opts.provider, requestFor(de, c, content));
      return {
        ...base,
        status: 'ok',
        error: null,
        outcome: run.confident ? 'graded' : 'flagged',
        // Ranh giới duy nhất từ số thực sang số nguyên: pointsFor() làm tròn
        // tới hai chữ số lẻ, nên ×100 rồi làm tròn là chính xác.
        scoreHundredths: Math.round(run.scored.totalScore * 100),
        modelUsed: run.outcome.modelUsed,
        tokensIn: run.outcome.usage.inputTokens,
        tokensOut: run.outcome.usage.outputTokens,
        wallMs: Date.now() - started,
      };
    } catch (error) {
      return {
        ...base,
        status: 'error',
        error: error instanceof Error ? error.message.slice(0, 300) : String(error),
        outcome: null,
        scoreHundredths: null,
        modelUsed: null,
        tokensIn: 0,
        tokensOut: 0,
        wallMs: Date.now() - started,
      };
    }
  };

  const work = (cases: { de: LoadedDe; c: ManifestCase }[], attempts: number[]) =>
    pool(
      cases.flatMap((x) => attempts.map((a) => ({ ...x, a }))),
      opts.concurrency,
      async ({ de, c, a }) => {
        records.push(await attemptOnce(de, c, a));
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
  for (const { de, c } of all) {
    const id = `${de.manifest.id}/${c.id}`;
    const rs = recordsOf(de.manifest.id, c.id);
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
    const scored = rs.filter((r) => r.expectedScoreHundredths !== null);
    const agree = rs.filter((r) => (r.expectedOutcome === 'graded') === (r.outcome === 'graded')).length;
    return {
      de: de.manifest.id,
      cases: de.manifest.cases.length,
      autoRate: rs.length ? rs.filter((r) => r.outcome === 'graded').length / rs.length : 0,
      maeHundredths: scored.length
        ? Math.round(
            scored.reduce((s, r) => s + Math.abs(r.scoreHundredths! - r.expectedScoreHundredths!), 0) /
              scored.length,
          )
        : null,
      outcomeAgreement: rs.length ? agree / rs.length : 0,
    };
  });

  const summary: RunSummary = {
    verdict: Object.values(gates).some((g) => g.confirmed.length > 0) ? 'failed_gate' : 'passed_gates',
    gates,
    unstablePairs,
    errors: records.filter((r) => r.status === 'error').map((r) => `${r.de}/${r.caseId}#${r.attempt}`),
    perDe,
    wallMs: { p50: percentile(ok.map((r) => r.wallMs), 50), p95: percentile(ok.map((r) => r.wallMs), 95) },
    tokens: {
      p50: percentile(ok.map((r) => r.tokensIn + r.tokensOut), 50),
      p95: percentile(ok.map((r) => r.tokensIn + r.tokensOut), 95),
    },
    modelsUsed: [...new Set(ok.map((r) => r.modelUsed).filter((m): m is string => Boolean(m)))],
    group5: 'Nhóm 5: 0 ca — chưa có bài thật',
  };
  return { records, summary };
}
