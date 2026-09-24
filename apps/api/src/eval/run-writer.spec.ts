import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeRunId, RunMeta, writeRun } from './run-writer';
import { RunSummary } from './baseline-runner';

const summary = { verdict: 'passed_gates' } as unknown as RunSummary;
const meta = (over: Partial<RunMeta> = {}): RunMeta => ({
  runId: 'x', tier: 'fast', split: 'dev', k: 1, gitSha: 'abc1234', gitDirty: false,
  datasetHash: 'h', config: { pipeline: 'baseline', reference: 'note-text', provider: 'fake' },
  startedAt: 's', finishedAt: 'f', ...over,
});

describe('run-writer', () => {
  it('mã lượt chạy = thời điểm UTC + sha ngắn', () => {
    expect(makeRunId(new Date('2026-09-24T10:15:30Z'), 'abcdef1234567')).toBe('20260924T101530Z-abcdef1');
  });

  it('ghi run.json và cases.jsonl vào thư mục mang mã lượt chạy', async () => {
    const root = await mkdtemp(join(tmpdir(), 'runs-'));
    const dir = await writeRun(root, meta({ runId: 'R1' }), summary, [{ caseId: 'A0' } as never]);
    const run = JSON.parse(await readFile(join(dir, 'run.json'), 'utf8'));
    expect(run.runId).toBe('R1');
    expect(run.summary.verdict).toBe('passed_gates');
    const lines = (await readFile(join(dir, 'cases.jsonl'), 'utf8')).trim().split('\n');
    expect(JSON.parse(lines[0]).caseId).toBe('A0');
  });

  it('Review Focus 5 — cây làm việc bẩn được ghi lại trong run.json', async () => {
    const root = await mkdtemp(join(tmpdir(), 'runs-'));
    const dir = await writeRun(root, meta({ runId: 'R2', gitDirty: true }), summary, []);
    expect(JSON.parse(await readFile(join(dir, 'run.json'), 'utf8')).gitDirty).toBe(true);
  });

  it('hai lượt cùng mã không ghi đè nhau', async () => {
    const root = await mkdtemp(join(tmpdir(), 'runs-'));
    const a = await writeRun(root, meta({ runId: 'R3' }), summary, []);
    const b = await writeRun(root, meta({ runId: 'R3' }), summary, []);
    expect(a).not.toBe(b);
  });
});
