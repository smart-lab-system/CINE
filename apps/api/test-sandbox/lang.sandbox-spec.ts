import { generateIntArray } from '../src/sandbox-worker/fetch-files';
import { handleExec } from '../src/sandbox-worker/handle-exec';
import { handleMeasure } from '../src/sandbox-worker/handle-measure';
import { CPP_TIMED_DRIVER, execJobOf, gen, inline, measureJobOf, median, realDeps } from './helpers';

const deps = realDeps();

describe('T-LANG — bẫy riêng của từng ngôn ngữ (§3.5)', () => {
  it('T-LANG-1 — C++ -O2, hàm O(n): driver dùng kết quả, n gấp 8 thì thời gian KHÔNG đứng yên', async () => {
    const linear = `#include <vector>
unsigned long long work(const std::vector<long long>& a) {
  unsigned long long s = 0;
  for (long long x : a) s += (unsigned long long)x * 2654435761ULL;
  return s;
}
`;
    const r = await handleMeasure(
      measureJobOf({
        language: 'cpp', timingMode: 'in_process',
        submission: { files: [{ path: 'main.cpp', ref: inline(linear) }], driver: inline(CPP_TIMED_DRIVER), entry: null },
        reference: null,
        points: [{ n: 1 << 17, stdin: gen(1 << 17) }, { n: 1 << 20, stdin: gen(1 << 20) }],
        repeats: 5,
      }),
      deps,
      null,
    );
    expect(r.unavailable).toBeNull();
    expect(r.aborted).toBeNull();
    const at = (n: number) => median(r.samples.filter((s) => s.n === n).map((s) => s.innerNs!));
    const ratio = at(1 << 20) / at(1 << 17);
    expect(ratio).toBeGreaterThan(4);
    expect(ratio).toBeLessThan(16);
    expect(r.samples.every((s) => s.checksum !== null)).toBe(true);
  });

  it('T-LANG-2 — C++ đúng nhưng rò bộ nhớ: lượt sanitizer KHÔNG tính là sập (detect_leaks=0)', async () => {
    const leaky = `#include <cstdio>
int main() {
  for (int i = 0; i < 100; i++) { int* p = new int[1000]; p[0] = i; }
  std::puts("ok");
  return 0;
}
`;
    const r = await handleExec(
      execJobOf({
        language: 'cpp',
        program: { files: [{ path: 'main.cpp', ref: inline(leaky) }], driver: null, entry: null },
        cases: [{ name: 'a', group: null, stdin: inline(''), expected: inline('ok\n') }],
      }),
      deps,
      null,
    );
    expect(r.compile?.ok).toBe(true);
    expect(r.cases[0].status).toBe('pass');
  });

  it('T-LANG-3 — Python đệ quy đúng, sâu 10^5: chạy được ở cả kiểm lẫn đo, không RecursionError, không segfault', async () => {
    const mod = `def tong(xs, i=0):
    return 0 if i == len(xs) else xs[i] + tong(xs, i + 1)
`;
    const runDriver = `import sys
from bai import tong
sys.stdin.readline()
print(tong(list(map(int, sys.stdin.readline().split()))))
`;
    const timeDriver = `import sys
import cine_timing
from bai import tong
sys.stdin.readline()
xs = list(map(int, sys.stdin.readline().split()))
cine_timing.begin()
r = tong(xs)
cine_timing.stop()
cine_timing.report(r)
`;
    const n = 100_000;
    const input = generateIntArray(n, 0, 9, 3);
    const expected = input.trim().split('\n')[1].split(' ').reduce((s, x) => s + Number(x), 0);

    const exec = await handleExec(
      execJobOf({
        language: 'python',
        program: { files: [{ path: 'bai.py', ref: inline(mod) }], driver: inline(runDriver), entry: null },
        cases: [{ name: 'sau', group: null, stdin: gen(n, 3, 0, 9), expected: inline(`${expected}\n`) }],
        limits: { wallMsPerCase: 10_000 },
      }),
      deps,
      null,
    );
    expect(exec.cases[0].status).toBe('pass');

    const measure = await handleMeasure(
      measureJobOf({
        language: 'python', timingMode: 'in_process',
        submission: { files: [{ path: 'bai.py', ref: inline(mod) }], driver: inline(timeDriver), entry: null },
        reference: null,
        points: [{ n, stdin: gen(n, 3, 0, 9) }],
        repeats: 1,
        limits: { wallMsPerCase: 10_000 },
      }),
      deps,
      null,
    );
    expect(measure.samples.map((s) => s.status)).toEqual(['ok']);
    expect(measure.samples[0].checksum).toBe(String(expected));
  });
});
