import { ProgramSpec, SandboxLanguage } from '../sandbox/contract';

export interface SpikeProgram {
  id: string;
  language: SandboxLanguage;
  ns: number[];
  work: string;
}

const pow2 = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => 2 ** (from + i));
const inline = (content: string) => ({ kind: 'inline' as const, content });

const CPP_CHECKSUM = `static unsigned long long checksum(const std::vector<long long>& a) {
  unsigned long long s = 0;
  for (size_t i = 0; i < a.size(); i++) s = s * 1000003ULL + (unsigned long long)a[i];
  return s;
}
`;
const CPP_WORK = {
  linear: `#include <vector>
unsigned long long work(std::vector<long long>& a) {
  unsigned long long s = 0;
  for (long long x : a) s += (unsigned long long)x * 2654435761ULL;
  return s;
}
`,
  nlogn: `#include <vector>
${CPP_CHECKSUM}static void sort_(std::vector<long long>& a, std::vector<long long>& t, size_t l, size_t r) {
  if (r - l < 2) return;
  size_t m = l + (r - l) / 2;
  sort_(a, t, l, m); sort_(a, t, m, r);
  size_t i = l, j = m, k = l;
  while (i < m && j < r) t[k++] = a[i] <= a[j] ? a[i++] : a[j++];
  while (i < m) t[k++] = a[i++];
  while (j < r) t[k++] = a[j++];
  for (size_t q = l; q < r; q++) a[q] = t[q];
}
unsigned long long work(std::vector<long long>& a) {
  std::vector<long long> t(a.size());
  sort_(a, t, 0, a.size());
  return checksum(a);
}
`,
  quadratic: `#include <vector>
${CPP_CHECKSUM}unsigned long long work(std::vector<long long>& a) {
  for (size_t i = 1; i < a.size(); i++) {
    long long x = a[i]; size_t j = i;
    while (j > 0 && a[j - 1] > x) { a[j] = a[j - 1]; j--; }
    a[j] = x;
  }
  return checksum(a);
}
`,
};

const CPP_READ = `  int n;
  if (std::scanf("%d", &n) != 1) return 1;
  std::vector<long long> a(n);
  for (auto& x : a) std::scanf("%lld", &x);
`;
const CPP_DRIVER = {
  in_process: `#include <cstdio>
#include <vector>
#include <cine_timing.h>
unsigned long long work(std::vector<long long>& a);
int main() {
${CPP_READ}  cine::begin();
  unsigned long long r = work(a);
  cine::keep(r);
  cine::stop();
  cine::report(r);
}
`,
  process: `#include <cstdio>
#include <vector>
unsigned long long work(std::vector<long long>& a);
int main() {
${CPP_READ}  std::printf("%llu\\n", work(a));
}
`,
};

const PY_WORK = {
  nlogn: `def _merge(a):
    if len(a) < 2:
        return a
    m = len(a) // 2
    left, right = _merge(a[:m]), _merge(a[m:])
    out, i, j = [], 0, 0
    while i < len(left) and j < len(right):
        if left[i] <= right[j]:
            out.append(left[i]); i += 1
        else:
            out.append(right[j]); j += 1
    out.extend(left[i:]); out.extend(right[j:])
    return out


def work(a):
    s = 0
    for x in _merge(a):
        s = (s * 1000003 + x) % (1 << 61)
    return s
`,
  quadratic: `def work(a):
    for i in range(1, len(a)):
        x, j = a[i], i
        while j > 0 and a[j - 1] > x:
            a[j] = a[j - 1]; j -= 1
        a[j] = x
    s = 0
    for x in a:
        s = (s * 1000003 + x) % (1 << 61)
    return s
`,
};
const PY_READ = `import sys
sys.stdin.readline()
a = list(map(int, sys.stdin.readline().split()))
`;
const PY_DRIVER = {
  in_process: `${PY_READ}import cine_timing
from bai import work
cine_timing.begin()
r = work(a)
cine_timing.stop()
cine_timing.report(r)
`,
  process: `${PY_READ}from bai import work
print(work(a))
`,
};

export const SPIKE_PROGRAMS: SpikeProgram[] = [
  { id: 'cpp-linear', language: 'cpp', ns: pow2(16, 21), work: CPP_WORK.linear },
  { id: 'cpp-nlogn', language: 'cpp', ns: pow2(14, 19), work: CPP_WORK.nlogn },
  { id: 'cpp-quadratic', language: 'cpp', ns: pow2(10, 15), work: CPP_WORK.quadratic },
  { id: 'py-nlogn', language: 'python', ns: pow2(10, 15), work: PY_WORK.nlogn },
  { id: 'py-quadratic', language: 'python', ns: pow2(7, 12), work: PY_WORK.quadratic },
];

export function specOf(p: Pick<SpikeProgram, 'language' | 'work'>, mode: 'in_process' | 'process'): ProgramSpec {
  return p.language === 'cpp'
    ? { files: [{ path: 'main.cpp', ref: inline(p.work) }], driver: inline(CPP_DRIVER[mode]), entry: null }
    : { files: [{ path: 'bai.py', ref: inline(p.work) }], driver: inline(PY_DRIVER[mode]), entry: null };
}

/** Đáp án mẫu chạy xen kẽ trong mọi job đo của buổi thử: bản n log n cùng ngôn ngữ. */
export function referenceOf(language: SandboxLanguage, mode: 'in_process' | 'process'): ProgramSpec {
  return specOf({ language, work: language === 'cpp' ? CPP_WORK.nlogn : PY_WORK.nlogn }, mode);
}

/** Bài để lại tiến trình nền — để kiểm phát hiện `interference` chạy được trên runtime đang thử. */
export const CPP_FORKER = `#include <unistd.h>
#include <vector>
unsigned long long work(std::vector<long long>& a) {
  if (fork() == 0) { setsid(); for (;;) sleep(1); }
  return a.size();
}
`;
