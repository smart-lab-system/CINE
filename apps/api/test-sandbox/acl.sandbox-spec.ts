import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import IORedis from 'ioredis';
import { createSandboxClient } from '../src/sandbox/sandbox.client';
import { sandboxAclRules } from '../src/sandbox-worker/acl-rules';
import { RunningWorker, startWorker } from '../src/sandbox-worker/main';
import { inline, RUNTIME } from './helpers';

const ADMIN_URL = process.env.SANDBOX_TEST_REDIS_URL ?? 'redis://localhost:6390';
const suffix = randomUUID().slice(0, 8);
const user = `cine-sbx-acl-${suffix}`;
const password = randomUUID();
const prefix = `cine-sbx-acl-${suffix}`;
const url = (() => {
  const u = new URL(ADMIN_URL);
  u.username = user;
  u.password = password;
  return u.toString();
})();

let admin: IORedis;
let worker: RunningWorker | undefined;
let client: ReturnType<typeof createSandboxClient> | undefined;

beforeAll(async () => {
  admin = new IORedis(ADMIN_URL);
  await admin.call('ACL', 'SETUSER', user, 'reset', 'on', `>${password}`, ...sandboxAclRules(prefix));
});

afterAll(async () => {
  await client?.close();
  await worker?.close();
  const keys = await admin.keys(`${prefix}:*`);
  if (keys.length) await admin.del(...keys);
  await admin.call('ACL', 'DELUSER', user);
  admin.disconnect();
});

describe('ACL Redis của sandbox — §3.5 luật 2', () => {
  it('worker và client chạy trọn một job với user ACL chỉ có quyền trên prefix sandbox', async () => {
    worker = await startWorker({
      sources: [{ name: 'real', redisUrl: url, prefix }],
      runtime: RUNTIME,
      images: { cpp: 'cine-sandbox-cpp:1', python: 'cine-sandbox-python:1' },
      timingCpusets: [null], generalCpuset: null, execConcurrency: 1,
      workRoot: join(tmpdir(), 'cine-sandbox-test'), allowedDownloadHosts: [], allowHttpDownloads: false,
      version: 'test', warnings: [],
    });
    client = createSandboxClient({ redisUrl: url, prefix, queueWaitMs: { exec: 60_000, measure: 60_000 } });
    const r = await client.client.exec({
      language: 'cpp',
      program: { files: [{ path: 'main.cpp', ref: inline('#include <cstdio>\nint main(){std::puts("ok");}\n') }], driver: null, entry: null },
      cases: [{ name: 'a', group: null, stdin: inline(''), expected: inline('ok\n') }],
    });
    expect(r.unavailable).toBeNull();
    expect(r.cases[0].status).toBe('pass');
  });

  it('user đó KHÔNG đọc ghi được khoá ngoài prefix, không chạy được lệnh quản trị', async () => {
    const limited = new IORedis(url, { maxRetriesPerRequest: 1 });
    try {
      await expect(limited.get('bull:grading:1')).rejects.toThrow(/NOPERM/);
      await expect(limited.set('ngoai-prefix', '1')).rejects.toThrow(/NOPERM/);
      await expect(limited.call('KEYS', '*')).rejects.toThrow(/NOPERM/);
      await expect(limited.call('FLUSHALL')).rejects.toThrow(/NOPERM/);
      await expect(limited.call('CONFIG', 'GET', '*')).rejects.toThrow(/NOPERM/);
    } finally {
      limited.disconnect();
    }
  });
});
