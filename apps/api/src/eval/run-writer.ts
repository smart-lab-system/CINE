import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { CaseRecord, RunSummary } from './baseline-runner';

export interface RunMeta {
  runId: string;
  tier: 'fast' | 'full';
  split: 'dev' | 'test';
  k: number;
  gitSha: string;
  gitDirty: boolean;
  datasetHash: string;
  config: { pipeline: 'baseline'; reference: 'note-text'; provider: string };
  startedAt: string;
  finishedAt: string;
}

export function makeRunId(now: Date, gitSha: string): string {
  const ts = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  return `${ts}-${gitSha.slice(0, 7)}`;
}

/**
 * SHA hiện tại, và cây có bẩn không — bỏ qua chính thư mục `runs/`. Cây bẩn
 * nghĩa là `gitSha` không tái tạo được đúng lượt chạy này (spec §12.7).
 */
export function gitState(cwd: string): { sha: string; dirty: boolean } {
  const sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' }).trim();
  const status = execFileSync('git', ['status', '--porcelain'], { cwd, encoding: 'utf8' })
    .split('\n')
    .filter((line) => line.trim() && !line.includes('apps/api/eval/runs/'));
  return { sha, dirty: status.length > 0 };
}

/** Một lượt chạy = một thư mục mang mã lượt chạy, không bao giờ ghi đè lượt cũ (§12.7). */
export async function writeRun(
  runsRoot: string,
  meta: RunMeta,
  summary: RunSummary,
  records: CaseRecord[],
): Promise<string> {
  let dir = join(runsRoot, meta.runId);
  for (let i = 2; existsSync(dir); i++) dir = join(runsRoot, `${meta.runId}-${i}`);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'run.json'), JSON.stringify({ ...meta, summary }, null, 2) + '\n');
  await writeFile(join(dir, 'cases.jsonl'), records.map((r) => JSON.stringify(r)).join('\n') + '\n');
  return dir;
}
