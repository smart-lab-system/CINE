import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import IORedis from 'ioredis';
import { createSandboxClient } from '../src/sandbox/sandbox.client';
import { WorkerConfig } from '../src/sandbox-worker/config';
import { RunningWorker, startWorker } from '../src/sandbox-worker/main';
import { CPP_TIMED_DRIVER, gen, inline, RUNTIME } from './helpers';

const REDIS_URL = process.env.SANDBOX_TEST_REDIS_URL ?? 'redis://localhost:6390';
const suffix = randomUUID().slice(0, 8);
const prefixes = { real: `cine-sbx-test-real-${suffix}`, eval: `cine-sbx-test-eval-${suffix}` };

let worker: RunningWorker;
const clients: ReturnType<typeof createSandboxClient>[] = [];

beforeAll(async () => {
  const probe = new IORedis(REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1 });
  try {
    await probe.connect();
    await probe.ping();
  } catch {
    throw new Error(`cần Redis ở ${REDIS_URL} — chạy: docker compose up -d redis`);
  } finally {
    probe.disconnect();
  }
  const cfg: WorkerConfig = {
    sources: [
      { name: 'real', redisUrl: REDIS_URL, prefix: prefixes.real },
      { name: 'eval', redisUrl: REDIS_URL, prefix: prefixes.eval },
    ],
    runtime: RUNTIME,
    images: { cpp: 'cine-sandbox-cpp:1', python: 'cine-sandbox-python:1' },
    timingCpusets: [null],   // K = 1
    generalCpuset: null,
    execConcurrency: 2,
    workRoot: join(tmpdir(), 'cine-sandbox-test'),
    allowedDownloadHosts: [],
    allowHttpDownloads: false,
    version: 'test',
    warnings: [],
  };
  worker = await startWorker(cfg);
});

afterAll(async () => {
  await Promise.all(clients.map((c) => c.close()));
  await worker?.close();
  const redis = new IORedis(REDIS_URL);
  for (const prefix of Object.values(prefixes)) {
    const keys = await redis.keys(`${prefix}:*`);
    if (keys.length) await redis.del(...keys);
  }
  redis.disconnect();
});

const clientFor = (prefix: string) => {
  const c = createSandboxClient({ redisUrl: REDIS_URL, prefix, queueWaitMs: { exec: 60_000, measure: 60_000 } });
  clients.push(c);
  return c.client;
};

describe('worker sandbox qua Redis thật', () => {
  it('vòng đầy đủ: API → Redis → worker → container → Redis → API, kèm dấu vân tay thật', async () => {
    const r = await clientFor(prefixes.real).exec({
      language: 'cpp',
      program: { files: [{ path: 'main.cpp', ref: inline('#include <cstdio>\nint main(){std::puts("xin chao");}\n') }], driver: null, entry: null },
      cases: [{ name: 'a', group: null, stdin: inline(''), expected: inline('xin chao\n') }],
    });
    expect(r.unavailable).toBeNull();
    expect(r.cases[0].status).toBe('pass');
    expect(r.host?.images.cpp).toMatch(/^sha256:/);
  });

  it('T-ISO-7 — job đo của eval và của chấm thật không bao giờ chạy chồng trên một khe', async () => {
    const quadratic = `#include <vector>
unsigned long long work(const std::vector<long long>& a0) {
  std::vector<long long> a = a0;
  for (size_t i = 1; i < a.size(); i++) { long long x = a[i]; size_t j = i; while (j > 0 && a[j-1] > x) { a[j] = a[j-1]; j--; } a[j] = x; }
  return a.empty() ? 0 : a[0];
}
`;
    const req = {
      language: 'cpp' as const, timingMode: 'in_process' as const,
      submission: { files: [{ path: 'main.cpp', ref: inline(quadratic) }], driver: inline(CPP_TIMED_DRIVER), entry: null },
      reference: null,
      points: [{ n: 8_192, stdin: gen(8_192) }, { n: 16_384, stdin: gen(16_384) }],
      repeats: 3,
    };
    const [a, b] = await Promise.all([clientFor(prefixes.real).measure(req), clientFor(prefixes.eval).measure(req)]);
    expect(a.unavailable).toBeNull();
    expect(b.unavailable).toBeNull();
    const span = (r: typeof a) => [Date.parse(r.startedAt), Date.parse(r.finishedAt)];
    const [a0, a1] = span(a);
    const [b0, b1] = span(b);
    expect(a1 <= b0 || b1 <= a0).toBe(true);
  });
});
