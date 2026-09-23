import { DockerProgramRunner } from './program-runner';

// Chạy: EVAL_DOCKER=1 pnpm --filter api test -- program-runner.docker
const maybe = process.env.EVAL_DOCKER === '1' ? it : it.skip;
jest.setTimeout(180_000); // lần đầu kéo image gcc:13

const driver = [
  '#include <cstdio>',
  '#include <vector>',
  'int f(int);',
  'int main() { int x; if (std::scanf("%d", &x) != 1) return 0; std::printf("%d\\n", f(x)); }',
].join('\n');

describe('DockerProgramRunner (Docker thật)', () => {
  const runner = new DockerProgramRunner();

  maybe('biên dịch có sanitizer và chạy đúng', async () => {
    const r = await runner.run({ driver, source: 'int f(int x) { return x * 2; }', cases: [{ key: 'a', input: '21\n' }] });
    expect(r).toEqual({ compiled: true, cases: [{ key: 'a', status: 'ok', stdout: '42\n' }] });
  });

  maybe('không biên dịch → compiled: false kèm log', async () => {
    const r = await runner.run({ driver, source: 'int f(int x) { return x * 2 }', cases: [] });
    expect(r.compiled).toBe(false);
  });

  maybe('lặp vô hạn → timeout', async () => {
    // unsigned: tràn có dấu là UB, và UBSan sẽ biến ca này thành "sập" trên một máy đủ nhanh.
    const r = await runner.run({ driver, source: 'int f(int x) { volatile unsigned long long u = x; for (;;) u = u + 1; }', cases: [{ key: 'a', input: '1\n' }] });
    expect(r.compiled && r.cases[0].status).toBe('timeout');
  });

  maybe('đọc ngoài mảng → sanitizer bắt, runtime_crash', async () => {
    const source = '#include <vector>\nint f(int x) { std::vector<int> v(2); return v.data()[x + 1]; }';
    const r = await runner.run({ driver, source, cases: [{ key: 'a', input: '1\n' }] });
    expect(r.compiled && r.cases[0].status).toBe('runtime_crash');
  });
});
