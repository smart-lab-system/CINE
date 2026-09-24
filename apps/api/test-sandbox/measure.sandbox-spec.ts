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

  // Review C1: container đo sống suốt job và mọi lượt lặp của một n dùng CÙNG
  // input — bài nhớ đệm được thì 4/5 lượt chạy nhanh thật, trung vị ra O(n) cho
  // một bài O(n²), checksum vẫn đúng. `work` trả 7 khi thấy lượt trước để lại gì.
  it('review C1 — cache qua file (/tmp, /dev/shm, thư mục làm việc) không ghi được: không lượt nào trúng cache', async () => {
    const fileCache = `#include <cstdio>
#include <vector>
static const char* paths[] = {"/tmp/cine-cache", "/dev/shm/cine-cache", "cine-cache", "/work/cine-cache"};
unsigned long long work(const std::vector<long long>& a) {
  for (const char* p : paths) if (FILE* f = std::fopen(p, "r")) { std::fclose(f); return 7; }
  for (const char* p : paths) if (FILE* f = std::fopen(p, "w")) { std::fputs("x", f); std::fclose(f); }
  return a.size() > 0 ? 0 : 1;
}
`;
    const r = await measure(fileCache);
    expect(r.unavailable).toBeNull();
    expect(r.aborted).toBeNull();
    expect(r.samples).toHaveLength(3);
    expect(r.samples.every((s) => s.status === 'ok' && s.checksum === '0')).toBe(true);
  });

  it('review C1 — cache qua đoạn nhớ SysV (shmget) → aborted interference ngay sau mẫu đầu, không lượt nào trúng', async () => {
    const shmCache = `#include <sys/ipc.h>
#include <sys/shm.h>
#include <vector>
unsigned long long work(const std::vector<long long>& a) {
  if (shmget(0x43494e45, 4096, 0600) >= 0) return 7;
  shmget(0x43494e45, 4096, IPC_CREAT | 0600);
  return a.size() > 0 ? 0 : 1;
}
`;
    const r = await measure(shmCache);
    expect(r.unavailable).toBeNull();
    expect(r.aborted).toBe('interference');
    expect(r.samples).toHaveLength(1);
    expect(r.samples.some((s) => s.checksum === '7')).toBe(false);
  });

  it('review C1 — cache qua hàng đợi POSIX (/dev/mqueue) → aborted interference', async () => {
    const mqCache = `#include <fcntl.h>
#include <mqueue.h>
#include <vector>
unsigned long long work(const std::vector<long long>& a) {
  if (mq_open("/cine-cache", O_RDONLY) != (mqd_t)-1) return 7;
  mq_open("/cine-cache", O_CREAT | O_RDONLY, 0600, nullptr);
  return a.size() > 0 ? 0 : 1;
}
`;
    const r = await measure(mqCache);
    expect(r.unavailable).toBeNull();
    expect(r.aborted).toBe('interference');
    expect(r.samples.some((s) => s.checksum === '7')).toBe(false);
  });

  it('review C1 — bài tìm và kill sleep/docker-init của container đo: bị từ chối (uid canh), phép đo không bị phá', async () => {
    const killer = `#include <dirent.h>
#include <signal.h>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <vector>
unsigned long long work(const std::vector<long long>& a) {
  unsigned long long refused = 0;
  if (DIR* d = opendir("/proc")) {
    while (dirent* e = readdir(d)) {
      int pid = std::atoi(e->d_name);
      if (pid <= 0) continue;
      char path[64], comm[64] = {0};
      std::snprintf(path, sizeof path, "/proc/%d/comm", pid);
      if (FILE* f = std::fopen(path, "r")) { if (!std::fgets(comm, sizeof comm, f)) comm[0] = 0; std::fclose(f); }
      if (!std::strncmp(comm, "sleep", 5) || !std::strncmp(comm, "docker-init", 11)) {
        if (kill(pid, SIGKILL) != 0) refused++;
      }
    }
    closedir(d);
  }
  return refused + (a.size() > 0 ? 0 : 100);
}
`;
    const r = await measure(killer);
    expect(r.unavailable).toBeNull();
    expect(r.aborted).toBeNull();
    expect(r.samples).toHaveLength(3);
    expect(r.samples.every((s) => s.status === 'ok' && s.checksum === '2')).toBe(true);
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
