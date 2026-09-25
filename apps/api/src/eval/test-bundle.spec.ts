import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execResult, fakeSandbox } from '../grading/investigator/testing/fake-sandbox';
import { unavailableExec } from '../sandbox/contract';
import { loadDataset } from './load-dataset';
import { ProgramRunner } from './program-runner';
import { buildTestBundle, checkBundleOnWorker } from './test-bundle';
import { writeMiniDe } from './testing/mini-de';

async function mini(tests: object[]) {
  const root = await mkdtemp(join(tmpdir(), 'bundle-'));
  const dir = await writeMiniDe(root);
  await writeFile(join(dir, 'tests.json'), JSON.stringify(tests));
  return (await loadDataset(root)).des[0];
}

describe('buildTestBundle — Q5', () => {
  it('ca có output ghi tay giữ nguyên; ca sinh tự động lấy output từ ĐÁP ÁN MẪU chạy thật', async () => {
    const de = await mini([
      { key: 'cb1', group: 'co_ban', input: '2\n', expected: '4\n' },
      { key: 'n1', group: 'n_lon', generate: { kind: 'repeat', unit: '7 ', times: 3 } },
    ]);
    const calls: object[] = [];
    const runner: ProgramRunner = {
      async run(input) {
        calls.push(input);
        return { compiled: true, cases: input.cases.map((c) => ({ key: c.key, status: 'ok' as const, stdout: `OUT(${c.input.trim()})\n` })) };
      },
    };
    const bundle = await buildTestBundle(de, runner);
    expect(bundle.cases).toEqual([
      { name: 'cb1', group: 'co_ban', input: '2\n', expected: '4\n' },
      { name: 'n1', group: 'n_lon', input: '7 7 7 \n', expected: 'OUT(7 7 7)\n' },
    ]);
    expect(calls).toHaveLength(1); // chỉ ca thiếu output mới cần chạy
    expect(bundle.id).toMatch(/^mini@[0-9a-f]{12}$/);
  });

  it('đáp án mẫu không biên dịch hay không chạy xong → nổ, không dựng thước hỏng', async () => {
    const de = await mini([{ key: 'n1', group: 'g', generate: { kind: 'repeat', unit: 'x', times: 1 } }]);
    await expect(buildTestBundle(de, { run: async () => ({ compiled: false, compileLog: 'lỗi' }) })).rejects.toThrow(/không biên dịch/);
    await expect(
      buildTestBundle(de, { run: async (i) => ({ compiled: true, cases: i.cases.map((c) => ({ key: c.key, status: 'timeout' as const, stdout: '' })) }) }),
    ).rejects.toThrow(/timeout/);
  });
});

describe('checkBundleOnWorker — đáp án mẫu phải đạt 100% gói của chính nó trên worker thật (duyệt Q5)', () => {
  const bundle = {
    id: 'mini@x',
    cases: [
      { name: 'cb1', group: 'co_ban', input: '2\n', expected: '4\n' },
      { name: 'n1', group: 'n_lon', input: '7\n', expected: '14\n' },
    ],
  };
  const pass = (names: string[] = []) =>
    fakeSandbox((req) => execResult(req.cases.map((c) => ({ name: c.name, group: c.group, status: names.includes(c.name) ? 'fail' : 'pass' }))));

  it('đạt hết → ok, kèm dấu vân tay máy; job chạy ĐÁP ÁN MẪU trên đủ mọi ca', async () => {
    const de = await mini([{ key: 'cb1', group: 'co_ban', input: '2\n', expected: '4\n' }]);
    const sandbox = pass();
    const r = await checkBundleOnWorker(de, bundle, sandbox);
    expect(r).toEqual({ ok: true, host: expect.objectContaining({ runtime: 'runc' }) });
    expect(sandbox.requests[0].program.files).toEqual([{ path: 'main.cpp', ref: { kind: 'inline', content: de.modelSource } }]);
    expect(sandbox.requests[0].cases.map((c) => c.name)).toEqual(['cb1', 'n1']);
  });

  it('một ca không đạt → không ok, nêu đích danh ca và kết cục — đó là lệch môi trường, không phải lỗi của bài', async () => {
    const de = await mini([{ key: 'cb1', group: 'co_ban', input: '2\n', expected: '4\n' }]);
    const r = await checkBundleOnWorker(de, bundle, pass(['n1']));
    expect(r).toEqual({ ok: false, reason: expect.stringMatching(/n1: fail/) });
  });

  it('worker không phản hồi, đáp án mẫu không biên dịch, hay dừng giữa chừng → không ok', async () => {
    const de = await mini([{ key: 'cb1', group: 'co_ban', input: '2\n', expected: '4\n' }]);
    const down = fakeSandbox(() => unavailableExec('00000000-0000-0000-0000-000000000000', 'docker không chạy'));
    const broken = fakeSandbox(() => execResult([], { compile: { ok: false, log: 'lỗi', ms: 1 } }));
    const cut = fakeSandbox(() => execResult([{ name: 'cb1', group: 'co_ban', status: 'pass' }], { aborted: 'budget' }));
    for (const sandbox of [down, broken, cut]) {
      expect((await checkBundleOnWorker(de, bundle, sandbox)).ok).toBe(false);
    }
  });
});
