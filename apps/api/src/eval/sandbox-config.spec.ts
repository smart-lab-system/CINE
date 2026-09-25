import { readEvalSandboxConfig } from './sandbox-config';

const REAL = 'rediss://cine-sbx-api:MAT_KHAU_THAT@valkey.example:15820';
const WORKER = 'rediss://cine-sbx-worker:MAT_KHAU_WORKER@valkey.example:15820';

describe('cấu hình hàng đợi eval — §12.5', () => {
  it('T-EVAL-13 — cấu hình của runner eval KHÔNG chứa credential nào của hàng đợi thật', () => {
    const r = readEvalSandboxConfig({
      SANDBOX_REDIS_URL: REAL, SANDBOX_WORKER_REDIS_URL: WORKER, REDIS_URL: 'rediss://default:X@api.example:1',
      SANDBOX_EVAL_REDIS_URL: 'redis://localhost:6390',
    });
    expect(r).toEqual({ ok: true, config: { redisUrl: 'redis://localhost:6390', prefix: 'cine-sbx-eval' } });
    expect(JSON.stringify(r)).not.toMatch(/MAT_KHAU|valkey\.example|api\.example/);
  });

  it('eval trỏ vào CHÍNH hàng đợi thật (cùng user@host:port) → từ chối', () => {
    const r = readEvalSandboxConfig({ SANDBOX_REDIS_URL: REAL, SANDBOX_EVAL_REDIS_URL: REAL });
    expect(r).toEqual({ ok: false, error: expect.stringMatching(/trùng SANDBOX_REDIS_URL/) });
  });

  it('Redis local KHÔNG mật khẩu dùng chung với API → được; hàng đợi tách bằng prefix', () => {
    expect(readEvalSandboxConfig({ REDIS_URL: 'redis://localhost:6390', SANDBOX_EVAL_REDIS_URL: 'redis://localhost:6390' }).ok).toBe(true);
  });

  it('thiếu URL, URL hỏng, hay prefix trùng prefix của hàng đợi thật → từ chối', () => {
    expect(readEvalSandboxConfig({}).ok).toBe(false);
    expect(readEvalSandboxConfig({ SANDBOX_EVAL_REDIS_URL: 'không phải url' }).ok).toBe(false);
    expect(readEvalSandboxConfig({ SANDBOX_EVAL_REDIS_URL: 'redis://localhost:6390', SANDBOX_EVAL_PREFIX: 'cine-sbx' }).ok).toBe(false);
  });
});
