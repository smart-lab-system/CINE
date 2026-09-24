import { MeasureResult } from '../sandbox/contract';

export const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
export const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
export function std(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
}

/** Bình phương tối thiểu của ln t theo ln n. Chỉ để đo ĐỘ TẢN — bước 4 khớp nhiều mô hình (§3.1). */
export function logLogSlope(points: { n: number; t: number }[]): number {
  const x = points.map((p) => Math.log(p.n));
  const y = points.map((p) => Math.log(p.t));
  const mx = mean(x);
  const my = mean(y);
  const num = x.reduce((a, xi, i) => a + (xi - mx) * (y[i] - my), 0);
  const den = x.reduce((a, xi) => a + (xi - mx) ** 2, 0);
  return num / den;
}

export interface Session {
  perN: Map<number, number>;
  slope: number;
}

/** §3.1 chốt 1: chỉ khớp trên các n có t(n) ≥ 20 × c. */
export const MIN_FACTOR = 20;
/** Dưới số điểm này thì độ dốc không nói lên gì. */
export const MIN_POINTS = 3;

/**
 * Một job đo → một lượt: trung vị theo từng n của BÀI, trừ hằng số `c`
 * (trung vị baseline). Lượt bị dừng, hỏng, hay có mẫu không `ok` → null.
 *
 * Chỉ giữ các n có t ≥ 20 × c (§3.1 chốt 1), và cần ít nhất 3 điểm. Lượt thử
 * 2026-09-24 cho thấy vì sao: bấm giờ cả tiến trình có hằng số 5–8 ms ở n nhỏ,
 * và độ dốc tính trên cả dải bị kéo từ ~2 xuống 0,83.
 */
export function sessionOf(r: MeasureResult, field: 'innerNs' | 'outerNs'): Session | null {
  if (r.unavailable || r.aborted) return null;
  const mine = r.samples.filter((s) => s.program === 'submission');
  if (mine.length === 0 || mine.some((s) => s.status !== 'ok' || s[field] === null)) return null;
  const base = r.baseline.filter((b) => b.program === 'submission').map((b) => b[field]).filter((v): v is number => v !== null);
  const c = base.length ? median(base) : 0;
  const perN = new Map<number, number>();
  for (const n of [...new Set(mine.map((s) => s.n))].sort((a, b) => a - b)) {
    const t = median(mine.filter((s) => s.n === n).map((s) => s[field] as number));
    if (t < MIN_FACTOR * c) continue;
    perN.set(n, Math.max(1, t - c));
  }
  if (perN.size < MIN_POINTS) return null;
  return { perN, slope: logLogSlope([...perN].map(([n, t]) => ({ n, t }))) };
}

export interface Summary {
  sessions: number;
  failed: number;
  slopeMean: number;
  slopeStd: number;
  meanCv: number;
}

/**
 * Độ tản cần ít nhất 2 lượt dùng được: với 0 hay 1 lượt thì độ lệch chuẩn là
 * Infinity (không ước lượng được), KHÔNG phải 0 — một lượt đơn lẻ từng cho
 * "D4: dùng được" mà không có phép đo nào đứng sau.
 */
export function summarize(sessions: (Session | null)[]): Summary {
  const ok = sessions.filter((s): s is Session => s !== null);
  // Chỉ các n mà MỌI lượt đều giữ lại (luật 20 × c có thể giữ khác nhau).
  const ns = ok.length ? [...ok[0].perN.keys()].filter((n) => ok.every((s) => s.perN.has(n))) : [];
  const cvs = ns.map((n) => {
    const ts = ok.map((s) => s.perN.get(n)!);
    return std(ts) / mean(ts);
  });
  const enough = ok.length >= 2;
  return {
    sessions: ok.length,
    failed: sessions.length - ok.length,
    slopeMean: ok.length ? mean(ok.map((s) => s.slope)) : NaN,
    slopeStd: enough ? std(ok.map((s) => s.slope)) : Infinity,
    meanCv: enough && cvs.length ? mean(cvs) : Infinity,
  };
}

const finite = (s: Summary | undefined): s is Summary =>
  s !== undefined && Number.isFinite(s.slopeStd) && Number.isFinite(s.meanCv);

export interface RuntimeFacts {
  isoPassed: boolean;
  interferenceDetected: boolean;
  caseP95Ms: number;
}

export interface Decision {
  mode: 'in_process' | 'process';
  runtime: 'runc' | 'runsc';
  k: number;
  usable: boolean;
  reasons: string[];
}

const key = (runtime: string, mode: string, k: number, program: string) => `${runtime}|${mode}|${k}|${program}`;

/** Luật D1–D4 của plan 2026-09-24-sandbox-worker, Task 9 — chốt trước khi đo. */
export function decide(input: {
  summaries: Map<string, Summary>;
  facts: Partial<Record<'runc' | 'runsc', RuntimeFacts>>;
  programs: string[];
  cppPrograms: string[];
  ks: number[];
}): Decision {
  const { summaries: S, facts, programs } = input;
  const get = (r: string, m: string, k: number, p: string) => S.get(key(r, m, k, p));
  const reasons: string[] = [];

  // D1 — đòi số hữu hạn như D2/D3: `Infinity <= Infinity` là true (review M9).
  const measured = programs.every((p) => {
    const a = get('runc', 'in_process', 1, p);
    const b = get('runc', 'process', 1, p);
    return a !== undefined && b !== undefined && Number.isFinite(a.slopeStd) && Number.isFinite(b.slopeStd);
  });
  const inProcessWins =
    measured && programs.every((p) => get('runc', 'in_process', 1, p)!.slopeStd <= get('runc', 'process', 1, p)!.slopeStd);
  const mode = inProcessWins ? 'in_process' : 'process';
  reasons.push(
    measured
      ? `D1: ${mode} (${inProcessWins ? 'ổn định ít nhất bằng' : 'kém ổn định hơn'} bấm giờ cả tiến trình trên runc)`
      : 'D1: process — không đủ lượt đo trên runc để so hai cách bấm giờ',
  );

  // D2
  let runtime: 'runc' | 'runsc' = 'runc';
  const f = facts.runsc;
  if (!f) {
    reasons.push('D2: runc — không có số đo của runsc (chưa cài hoặc chưa chạy)');
  } else {
    const checks: [boolean, string][] = [
      [f.isoPassed, 'test:sandbox xanh'],
      [f.interferenceDetected, 'phát hiện tiến trình nền'],
      [f.caseP95Ms <= 1_500, `p95 một ca ${Math.round(f.caseP95Ms)} ms ≤ 1500`],
      ...programs.map((p): [boolean, string] => {
        const a = get('runsc', mode, 1, p);
        const b = get('runc', mode, 1, p);
        // Infinity ≤ 1,2 × Infinity là true trong JS — phải đòi số hữu hạn.
        const ok = finite(a) && finite(b) && a.slopeStd <= 1.2 * b.slopeStd && a.meanCv <= 1.2 * b.meanCv;
        return [ok, `${p}: độ tản trong 1,2× runc`];
      }),
    ];
    const failed = checks.filter(([ok]) => !ok).map(([, label]) => label);
    runtime = failed.length === 0 ? 'runsc' : 'runc';
    reasons.push(failed.length === 0 ? 'D2: runsc — qua cả năm điều kiện' : `D2: runc — runsc trượt: ${failed.join('; ')}`);
  }

  // D3
  let k = 1;
  for (const candidate of [...input.ks].sort((a, b) => a - b)) {
    if (candidate === 1) continue;
    const ok = programs.every((p) => {
      const a = get(runtime, mode, candidate, p);
      const b = get(runtime, mode, 1, p);
      return finite(a) && finite(b) && a.slopeStd <= 1.1 * b.slopeStd && a.meanCv <= 1.1 * b.meanCv;
    });
    if (!ok) break;
    k = candidate;
  }
  reasons.push(`D3: K = ${k}`);

  // D4
  const usable = input.cppPrograms.every((p) => (get(runtime, mode, 1, p)?.slopeStd ?? Infinity) <= 0.1);
  reasons.push(usable ? 'D4: dùng được — độ lệch chuẩn độ dốc ≤ 0,10 ở mọi chương trình C++' : 'D4: KHÔNG dùng được — ghi vào rủi ro 1 của spec §11');

  return { mode, runtime, k, usable, reasons };
}
