import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { hostname, tmpdir } from 'node:os';
import { join } from 'node:path';
import { HostFingerprint, SANDBOX_CONTRACT_VERSION } from '../src/sandbox/contract';
import { spawnCli } from '../src/sandbox-worker/docker-cli';
import { WorkerDeps } from '../src/sandbox-worker/handle-exec';

export const RUNTIME: 'runc' | 'runsc' = process.env.SANDBOX_RUNTIME === 'runsc' ? 'runsc' : 'runc';

export const HOST: HostFingerprint = {
  hostname: hostname(), cpuModel: 'test', cpuCount: 1, kernel: 'test', runtime: RUNTIME,
  dockerVersion: 'test', images: {}, workerVersion: 'test',
};

export function realDeps(): WorkerDeps {
  const workRoot = join(tmpdir(), 'cine-sandbox-test');
  mkdirSync(workRoot, { recursive: true });
  return {
    runner: {
      docker: spawnCli(),
      runtime: RUNTIME,
      images: { cpp: 'cine-sandbox-cpp:1', python: 'cine-sandbox-python:1' },
      fetchPolicy: { allowedHosts: [], allowHttp: false, maxBytes: 64 * 1024 * 1024 },
    },
    host: HOST,
    workRoot,
  };
}

export const inline = (content: string) => ({ kind: 'inline' as const, content });
export const gen = (n: number, seed = 1, lo = 0, hi = 1_000_000) =>
  ({ kind: 'generate' as const, generator: 'int_array' as const, n, lo, hi, seed });

export function execJobOf(p: Record<string, unknown>) {
  return { contract: SANDBOX_CONTRACT_VERSION, kind: 'exec', jobId: randomUUID(), ...p };
}
export function measureJobOf(p: Record<string, unknown>) {
  return { contract: SANDBOX_CONTRACT_VERSION, kind: 'measure', jobId: randomUUID(), ...p };
}

/** Driver C++ bấm giờ trong tiến trình quanh `work(a)` — dùng kết quả (T-LANG-1). */
export const CPP_TIMED_DRIVER = `#include <cstdio>
#include <vector>
#include <cine_timing.h>
unsigned long long work(const std::vector<long long>& a);
int main() {
  int n;
  if (std::scanf("%d", &n) != 1) return 1;
  std::vector<long long> a(n);
  for (auto& x : a) std::scanf("%lld", &x);
  cine::begin();
  unsigned long long r = work(a);
  cine::keep(r);
  cine::stop();
  cine::report(r);
  return 0;
}
`;

export const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};
