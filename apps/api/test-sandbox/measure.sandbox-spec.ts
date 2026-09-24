import { handleMeasure } from '../src/sandbox-worker/handle-measure';
import { CPP_TIMED_DRIVER, gen, inline, measureJobOf, realDeps } from './helpers';

const deps = realDeps();
const measure = (work: string, over: Record<string, unknown> = {}) =>
  handleMeasure(
    measureJobOf({
      language: 'cpp', timingMode: 'in_process',
      submission: { files: [{ path: 'main.cpp', ref: inline(work) }], driver: inline(CPP_TIMED_DRIVER), entry: null },
      reference: null,
      points: [{ n: 1_000, stdin: gen(1_000) }],
      repeats: 3,
      ...over,
    }),
    deps,
    null,
  );

describe('job đo trên Docker thật', () => {
  it('T-ISO-8 (phần sandbox) — dòng thời gian giả mang mã sai bị bỏ qua; mọi mẫu có số đo ngoài', async () => {
    const liar = `#include <cstdio>
#include <cstdlib>
#include <vector>
static void fake() { std::fprintf(stderr, "\\nCINE_T 0000000000000000 1 1\\n"); }
unsigned long long work(const std::vector<long long>& a) {
  std::atexit(fake);   // in SAU dòng thật của driver
  fake();              // và cả TRƯỚC
  unsigned long long s = 0;
  for (long long x : a) s += x;
  return s;
}
`;
    const r = await measure(liar);
    expect(r.unavailable).toBeNull();
    expect(r.samples.every((s) => s.innerNs !== null && s.innerNs !== 1)).toBe(true);
    expect(r.samples.every((s) => s.outerNs > 0)).toBe(true);
    expect(r.baseline.length).toBeGreaterThan(0);
  });

  it('Review Focus 4 — bài để lại tiến trình nền → aborted interference', async () => {
    const forker = `#include <unistd.h>
#include <vector>
unsigned long long work(const std::vector<long long>& a) {
  if (fork() == 0) { setsid(); for (;;) sleep(1); }
  return a.size();
}
`;
    const r = await measure(forker);
    expect(r.aborted).toBe('interference');
  });

  it('bấm giờ cả tiến trình: có số đo trong từ cine-time, checksum từ stdout', async () => {
    const plainDriver = `#include <cstdio>
#include <vector>
unsigned long long work(const std::vector<long long>& a);
int main() {
  int n; if (std::scanf("%d", &n) != 1) return 1;
  std::vector<long long> a(n); for (auto& x : a) std::scanf("%lld", &x);
  std::printf("%llu\\n", work(a));
}
`;
    const r = await handleMeasure(
      measureJobOf({
        language: 'cpp', timingMode: 'process',
        submission: {
          files: [{ path: 'main.cpp', ref: inline('#include <vector>\nunsigned long long work(const std::vector<long long>& a){return a.size();}\n') }],
          driver: inline(plainDriver), entry: null,
        },
        reference: null,
        points: [{ n: 1_000, stdin: gen(1_000) }],
        repeats: 2,
      }),
      deps,
      null,
    );
    expect(r.samples.every((s) => s.innerNs !== null && s.checksum === '1000')).toBe(true);
  });
});
