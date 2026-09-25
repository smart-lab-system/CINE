import { createHash } from 'node:crypto';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { computeDeductionScore } from '../grading/scoring/deduction-score';
import { parseHundredths } from '../grading/scoring/hundredths';
import { Manifest, ManifestCase, manifestSchema, probesSchema, TestCaseSpec, testsSchema } from './manifest.schema';

export interface LoadedDe {
  manifest: Manifest;
  dir: string;
  driverSource: string;
  modelSource: string;
  tests: { key: string; group: string; input: string; expected: string | null }[];
  probes: { key: string; input: string }[];
  sources: Map<string, string>;
  maxHundredths: number;
  /** Nhóm 5: ca khai trong manifest mà bài thật chưa có ở `eval/private/` (§12.7). */
  missingPrivate: string[];
}
export interface LoadedDataset {
  des: LoadedDe[];
  datasetHash: string;
}

const lf = (s: string) => s.replace(/\r\n/g, '\n');

async function readText(dir: string, rel: string): Promise<string> {
  const path = join(dir, rel);
  try {
    return lf(await readFile(path, 'utf8'));
  } catch {
    throw new Error(`không đọc được ${path}`);
  }
}

/** xorshift32 — tất định theo seed, để ca sinh tự động giống nhau ở mọi máy. */
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

export function generateInput(spec: NonNullable<TestCaseSpec['generate']>): string {
  switch (spec.kind) {
    case 'shuffle_range': {
      const a = Array.from({ length: spec.n }, (_, i) => spec.lo + i);
      const next = rng(spec.seed);
      for (let i = a.length - 1; i > 0; i--) {
        const j = next() % (i + 1);
        [a[i], a[j]] = [a[j], a[i]];
      }
      return `${spec.n}\n${a.join(' ')}\n`;
    }
    case 'nested':
      return `${spec.open.repeat(spec.depth)}${spec.close.repeat(spec.depth)}\n`;
    case 'repeat':
      return `${spec.unit.repeat(spec.times)}\n`;
  }
}

async function listFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const name of await readdir(dir)) {
    const path = join(dir, name);
    if ((await stat(path)).isDirectory()) out.push(...(await listFiles(path)));
    else out.push(path);
  }
  return out;
}

/**
 * Nạp bộ dữ liệu eval từ thư mục fixture (spec 2026-09-20 §12.2). Mọi văn
 * bản đọc vào đều chuẩn hoá về LF, và băm cũng trên bản LF — để một lần
 * checkout trên Windows không đổi `datasetHash` (Review Focus 1).
 */
export async function loadDataset(
  root: string,
  opts: { split?: 'dev' | 'test'; only?: string } = {},
): Promise<LoadedDataset> {
  const des: LoadedDe[] = [];
  const hash = createHash('sha256');
  const names = (await readdir(root)).filter((n) => !n.startsWith('.')).sort();

  for (const name of names) {
    const dir = join(root, name);
    if (!(await stat(dir)).isDirectory()) continue;
    const manifest = manifestSchema.parse(JSON.parse(await readText(dir, 'manifest.json')));
    if (opts.split && manifest.split !== opts.split) continue;
    if (opts.only && manifest.id !== opts.only) continue;

    const tests = testsSchema.parse(JSON.parse(await readText(dir, manifest.tests))).map((t) => ({
      key: t.key,
      group: t.group,
      input: t.generate ? generateInput(t.generate) : lf(t.input!),
      expected: t.expected === undefined ? null : lf(t.expected),
    }));
    const probes = probesSchema.parse(JSON.parse(await readText(dir, manifest.probes))).map((p) => ({
      key: p.key,
      input: lf(p.input),
    }));
    const sources = new Map<string, string>();
    const missingPrivate: string[] = [];
    const privateDir = join(root, '..', 'private', manifest.id);
    for (const c of manifest.cases) {
      if (c.group !== 5) {
        sources.set(c.id, await readText(dir, c.file));
        continue;
      }
      // Nhóm 5: bài nằm NGOÀI git (§12.7). Chưa có thì bỏ ca và kể ra — không phải lỗi.
      let body: string;
      try {
        body = lf(await readFile(join(privateDir, c.file), 'utf8'));
      } catch {
        missingPrivate.push(c.id);
        continue;
      }
      if (createHash('sha256').update(body).digest('hex') !== c.sha256) {
        throw new Error(`${manifest.id}/${c.id}: bài nhóm 5 không khớp sha256 trong manifest`);
      }
      sources.set(c.id, body);
    }
    const present = { ...manifest, cases: manifest.cases.filter((c) => !missingPrivate.includes(c.id)) };

    des.push({
      manifest: present,
      dir,
      driverSource: await readText(dir, manifest.driver),
      modelSource: await readText(dir, manifest.modelAnswer),
      tests,
      probes,
      sources,
      maxHundredths: manifest.rubric.reduce((s, c) => s + parseHundredths(c.maxPoints), 0),
      missingPrivate,
    });

    for (const file of (await listFiles(dir)).sort()) {
      hash.update(relative(root, file).replace(/\\/g, '/'));
      hash.update('\0');
      hash.update(lf(await readFile(file, 'utf8')));
      hash.update('\0');
    }
  }
  return { des, datasetHash: hash.digest('hex') };
}

/** Điểm mong đợi TÍNH từ `expectedRuleIds` trên bảng đóng băng của đề (T-EVAL-8). */
export function expectedScoreHundredths(de: LoadedDe, c: ManifestCase): number | null {
  if (c.expectedOutcome !== 'graded') return null;
  return computeDeductionScore(
    de.manifest.rubric.map((r) => ({ key: r.key, maxHundredths: parseHundredths(r.maxPoints) })),
    de.manifest.rules.map((r) => ({
      ruleKey: r.ruleKey,
      criterionKey: r.criterionKey,
      deductionHundredths: r.deduction === null ? null : parseHundredths(r.deduction),
    })),
    c.expectedRuleIds,
  ).scoreHundredths;
}
