import { CaseRecord } from './runner-core';

/**
 * `outcome_agreement` — khớp "tự quyết hay không" với mong đợi. Bước 2 investigator không bao giờ
 * ra `graded` (Q4) nên chỉ số này thấp theo cấu trúc; từ bước 3a `decide()` tự quyết, và chỉ số
 * so được giữa mọi pipeline.
 * `gradable_agreement` — khớp "chấm được hay không chấm được" với mong đợi; so được giữa mọi
 * pipeline.
 */
export type Metric = 'abs_score_error' | 'outcome_agreement' | 'gradable_agreement';

export interface Comparison {
  metric: Metric;
  /** Số ca có giá trị ở CẢ hai lượt — đơn vị của phép so. */
  cases: number;
  /** Ca chỉ lượt gốc / chỉ lượt mới có giá trị — ví dụ ca `ungradable` không có điểm (review I4). */
  onlyBase: number;
  onlyCandidate: number;
  /** candidate − base, trung bình trên các ca chung. */
  delta: number;
  lo: number;
  hi: number;
  verdict: 'regression' | 'improvement' | 'no_change';
  lowerIsBetter: boolean;
}

function valueOf(r: CaseRecord, metric: Metric): number | null {
  if (metric === 'abs_score_error') {
    return r.expectedScoreHundredths !== null && r.scoreHundredths !== null
      ? Math.abs(r.scoreHundredths - r.expectedScoreHundredths)
      : null;
  }
  if (metric === 'gradable_agreement') {
    return (r.expectedOutcome !== 'ungradable') === (r.outcome !== 'ungradable') ? 1 : 0;
  }
  return (r.expectedOutcome === 'graded') === (r.outcome === 'graded') ? 1 : 0;
}

/** k lượt của MỘT ca gộp thành một giá trị TRƯỚC (§12.4 mục 1). Lượt lỗi không tính. */
export function perCaseValues(records: CaseRecord[], metric: Metric): Map<string, number> {
  const groups = new Map<string, number[]>();
  for (const r of records) {
    if (r.status !== 'ok') continue;
    const v = valueOf(r, metric);
    if (v === null) continue;
    const key = `${r.de}/${r.caseId}`;
    groups.set(key, [...(groups.get(key) ?? []), v]);
  }
  return new Map([...groups].map(([k, vs]) => [k, vs.reduce((a, b) => a + b, 0) / vs.length]));
}

function rng(seed: number) {
  let x = seed >>> 0 || 1;
  return () => {
    x ^= x << 13;
    x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    return x;
  };
}

/** Bootstrap lấy mẫu lại THEO CA trên hiệu số ghép cặp (§12.4 mục 2, 4). Có seed để tái tạo được. */
export function pairedBootstrap(
  diffs: number[],
  opts: { iterations?: number; seed?: number } = {},
): { mean: number; lo: number; hi: number } {
  const n = diffs.length;
  if (n === 0) return { mean: 0, lo: 0, hi: 0 };
  const iterations = opts.iterations ?? 5_000;
  const next = rng(opts.seed ?? 20_260_924);
  const means: number[] = [];
  for (let i = 0; i < iterations; i++) {
    let s = 0;
    for (let j = 0; j < n; j++) s += diffs[next() % n];
    means.push(s / n);
  }
  means.sort((a, b) => a - b);
  return {
    mean: diffs.reduce((a, b) => a + b, 0) / n,
    lo: means[Math.floor(0.025 * iterations)],
    hi: means[Math.ceil(0.975 * iterations) - 1],
  };
}

/**
 * Chỉ kết luận thoái lui (hay cải thiện) khi khoảng tin cậy 95% của HIỆU SỐ không chứa 0
 * (§12.4 mục 4). Đây là cận dưới của độ bất định thật: ghép cặp khử độ khó của ca, không khử
 * tương quan trong đề (mục 3) — báo cáo phải gọi đúng tên đó.
 */
export function compareRuns(base: CaseRecord[], cand: CaseRecord[], metric: Metric): Comparison | null {
  const a = perCaseValues(base, metric);
  const b = perCaseValues(cand, metric);
  const keys = [...a.keys()].filter((k) => b.has(k)).sort();
  if (keys.length === 0) return null;
  const { mean, lo, hi } = pairedBootstrap(keys.map((k) => b.get(k)! - a.get(k)!));
  const lowerIsBetter = metric === 'abs_score_error';
  const worse = lowerIsBetter ? lo > 0 : hi < 0;
  const better = lowerIsBetter ? hi < 0 : lo > 0;
  return {
    metric,
    cases: keys.length,
    onlyBase: [...a.keys()].filter((k) => !b.has(k)).length,
    onlyCandidate: [...b.keys()].filter((k) => !a.has(k)).length,
    delta: mean,
    lo,
    hi,
    verdict: worse ? 'regression' : better ? 'improvement' : 'no_change',
    lowerIsBetter,
  };
}

/** Model thật đã trả lời một lượt chạy. Investigator ghi `a+b` khi xoay bậc. Lượt lỗi không tính. */
export function modelsOf(records: CaseRecord[]): string[] {
  const set = new Set<string>();
  for (const r of records) {
    if (r.status === 'ok' && r.modelUsed) for (const m of r.modelUsed.split('+')) set.add(m);
  }
  return [...set].sort();
}

/**
 * Duyệt Q10: Δ giữa hai lượt chỉ đọc được là hiệu ứng KIẾN TRÚC khi hai bên chấm bằng cùng bộ
 * model. Khác bộ thì Δ trộn cả hiệu ứng model vào, và báo cáo không được gọi nó là cải thiện của
 * kiến trúc. Đây là con số tiêu đề của đồ án, nên máy phải tự nói ra, không trông vào người đọc.
 */
export function modelConfound(
  base: CaseRecord[],
  cand: CaseRecord[],
): { base: string[]; candidate: string[]; same: boolean } {
  const a = modelsOf(base);
  const b = modelsOf(cand);
  return { base: a, candidate: b, same: a.length === b.length && a.every((m, i) => m === b[i]) };
}
