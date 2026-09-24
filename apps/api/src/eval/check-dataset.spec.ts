import { readFileSync } from 'node:fs';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkDe, stripCppComments } from './check-dataset';
import { loadDataset } from './load-dataset';
import { writeMiniDe } from './testing/mini-de';
import { ProgramInput, ProgramRunner, ProgramRunResult } from './program-runner';

/** Runner giả: "chạy" bằng cách tra bảng theo mã nguồn. */
class FakeRunner implements ProgramRunner {
  constructor(private readonly table: Record<string, (input: string) => string | 'crash' | 'timeout'>) {}
  async run(p: ProgramInput): Promise<ProgramRunResult> {
    const fn = this.table[p.source.trim()];
    if (!fn) return { compiled: false, compileLog: 'lỗi biên dịch giả' };
    return {
      compiled: true,
      cases: p.cases.map((c) => {
        const out = fn(c.input);
        if (out === 'crash') return { key: c.key, status: 'runtime_crash' as const, stdout: '' };
        if (out === 'timeout') return { key: c.key, status: 'timeout' as const, stdout: '' };
        return { key: c.key, status: 'ok' as const, stdout: out };
      }),
    };
  }
}
const double = (i: string) => `${2 * Number(i.trim())}\n`;
const identity = (i: string) => `${Number(i.trim())}\n`;
const table = {
  'int f(int x) { return 2 * x; }': double,
  'int f(int x) { return x; }': identity,
};

async function mini(overrides: Record<string, unknown> = {}) {
  const root = await mkdtemp(join(tmpdir(), 'chk-'));
  const dir = await writeMiniDe(root, overrides);
  return { root, dir };
}

describe('checkDe', () => {
  it('bộ dữ liệu đúng → không có vấn đề nào', async () => {
    const { root } = await mini();
    const de = (await loadDataset(root)).des[0];
    expect(await checkDe(de, new FakeRunner(table))).toEqual([]);
  });

  it('T-EVAL-8 — expectedScore gõ tay lệch với điểm tính được → SCORE_MISMATCH', async () => {
    const { root, dir } = await mini();
    const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));
    manifest.cases[1].expectedScore = '7.00';
    await writeFile(join(dir, 'manifest.json'), JSON.stringify(manifest));
    const de = (await loadDataset(root)).des[0];
    const problems = await checkDe(de, new FakeRunner(table));
    expect(problems.map((p) => p.code)).toContain('SCORE_MISMATCH');
  });

  it('T-EVAL-2 — đột biến không đổi hành vi ở đâu cả → EQUIVALENT_MUTANT', async () => {
    const { root, dir } = await mini();
    await writeFile(join(dir, 'cases', 'M1.cpp'), 'int f(int x) { return 2 * x; }\n');
    const de = (await loadDataset(root)).des[0];
    const problems = await checkDe(de, new FakeRunner(table));
    expect(problems.map((p) => p.code)).toContain('EQUIVALENT_MUTANT');
  });

  it('T-EVAL-14 — nhãn luật lệch với nhóm test thật sự trượt → RULE_LABEL_MISMATCH', async () => {
    const { root, dir } = await mini();
    const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));
    manifest.cases[1].expectedRuleIds = [];
    manifest.cases[1].expectedScore = '10.00';
    await writeFile(join(dir, 'manifest.json'), JSON.stringify(manifest));
    const de = (await loadDataset(root)).des[0];
    const problems = await checkDe(de, new FakeRunner(table));
    expect(problems.map((p) => p.code)).toContain('RULE_LABEL_MISMATCH');
  });

  it('Review Focus 3 — chính đáp án mẫu trượt một ca → MODEL_FAILS_TEST, nêu đúng ca', async () => {
    const { root, dir } = await mini();
    await writeFile(join(dir, 'tests.json'), JSON.stringify([{ key: 'cb1', group: 'co_ban', input: '2\n', expected: '5\n' }]));
    const de = (await loadDataset(root)).des[0];
    const problems = await checkDe(de, new FakeRunner(table));
    const p = problems.find((x) => x.code === 'MODEL_FAILS_TEST');
    expect(p?.message).toMatch(/cb1/);
  });

  it('nhóm 2 không khớp đáp án mẫu trên input dò biên → NOT_A_CORRECT_SOLUTION', async () => {
    const { root, dir } = await mini();
    await writeFile(join(dir, 'probes.json'), JSON.stringify([{ key: 'p1', input: '0\n' }, { key: 'p2', input: '3\n' }]));
    const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));
    manifest.cases.push({ id: 'A1', group: 2, file: 'cases/A1.cpp', behavior: 'dynamic', expectedRuleIds: [],
      expectedOutcome: 'graded', expectedScore: '10.00', expectedComplexity: 'O(1)', cleanTwin: null, note: '' });
    await writeFile(join(dir, 'manifest.json'), JSON.stringify(manifest));
    await writeFile(join(dir, 'cases', 'A1.cpp'), 'int f(int x) { return x + x + (x == 3); }\n');
    const de = (await loadDataset(root)).des[0];
    const runner = new FakeRunner({ ...table, 'int f(int x) { return x + x + (x == 3); }': (i) => `${2 * Number(i) + (Number(i) === 3 ? 1 : 0)}\n` });
    expect((await checkDe(de, runner)).map((p) => p.code)).toContain('NOT_A_CORRECT_SOLUTION');
  });
});

describe('stripCppComments', () => {
  it('bỏ cả // lẫn /* */', () => {
    expect(stripCppComments('int a; // x\n/* y\n z */int b;')).toBe(stripCppComments('int a;\nint b;'));
  });
});
