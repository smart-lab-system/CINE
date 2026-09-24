import { forbiddenEnvKeys, readWorkerConfig } from './config';

const base = { SANDBOX_REDIS_URL: 'rediss://sbx:pw@redis.example:6380' };

describe('forbiddenEnvKeys — §3.5 luật 2', () => {
  it('bắt khoá model, storage, DB, JWT, Redis của API và token GitHub; bỏ qua biến rỗng', () => {
    const env = {
      ...base,
      ANTHROPIC_API_KEY: 'x', GRADING_TIER1_API_KEY: 'x', STORAGE_SECRET_KEY: 'x', STORAGE_ACCESS_KEY: 'x',
      DATABASE_URL: 'x', ACCESS_TOKEN_SECRET: 'x', REDIS_URL: 'x', REDIS_PASSWORD: '', PATH: '/usr/bin',
      GITHUB_TOKEN: 'ghu_x',
    };
    expect(forbiddenEnvKeys(env)).toEqual([
      'ACCESS_TOKEN_SECRET', 'ANTHROPIC_API_KEY', 'DATABASE_URL', 'GITHUB_TOKEN', 'GRADING_TIER1_API_KEY',
      'REDIS_URL', 'STORAGE_ACCESS_KEY', 'STORAGE_SECRET_KEY',
    ]);
  });
});

describe('readWorkerConfig', () => {
  it('thiếu SANDBOX_REDIS_URL → nổ, nêu tên biến', () => {
    expect(() => readWorkerConfig({})).toThrow(/SANDBOX_REDIS_URL/);
  });

  it('không đặt khe đo → một khe không ghim, kèm cảnh báo', () => {
    const cfg = readWorkerConfig(base);
    expect(cfg.timingCpusets).toEqual([null]);
    expect(cfg.warnings.join(' ')).toMatch(/không ghim/i);
    expect(cfg.sources).toEqual([{ name: 'real', redisUrl: base.SANDBOX_REDIS_URL, prefix: 'cine-sbx' }]);
  });

  it('đọc khe đo, lõi chung, và nguồn eval', () => {
    const cfg = readWorkerConfig(
      {
      ...base, SANDBOX_TIMING_CPUSETS: '2|3', SANDBOX_GENERAL_CPUSET: '0-1',
      SANDBOX_EVAL_REDIS_URL: 'rediss://eval:pw@eval.example:6380', SANDBOX_RUNTIME: 'runsc',
      },
      { nproc: 8 },
    );
    expect(cfg.timingCpusets).toEqual(['2', '3']);
    expect(cfg.execConcurrency).toBe(2);
    expect(cfg.runtime).toBe('runsc');
    expect(cfg.sources.map((s) => s.name)).toEqual(['real', 'eval']);
  });

  it('khe đo chồng lên lõi chung → nổ, nêu lõi bị chồng', () => {
    expect(() => readWorkerConfig({ ...base, SANDBOX_TIMING_CPUSETS: '1|2', SANDBOX_GENERAL_CPUSET: '0-1' })).toThrow(/lõi 1/);
  });

  it('eval dùng CHUNG Redis và prefix với hàng đợi thật → nổ (§3.5)', () => {
    expect(() => readWorkerConfig({ ...base, SANDBOX_EVAL_REDIS_URL: base.SANDBOX_REDIS_URL })).toThrow(/Redis riêng/);
  });

  it('review I5 — có khe đo mà không đặt lõi chung → lõi chung là phần bù, không để job kiểm chạy lên lõi đo', () => {
    const cfg = readWorkerConfig({ ...base, SANDBOX_TIMING_CPUSETS: '2|3' }, { nproc: 6 });
    expect(cfg.generalCpuset).toBe('0,1,4,5');
    expect(cfg.execConcurrency).toBe(4);
    expect(cfg.warnings.join(' ')).toMatch(/SANDBOX_GENERAL_CPUSET/);
  });

  it('review I5 — khe đo chiếm hết lõi, không còn lõi cho job kiểm → nổ', () => {
    expect(() => readWorkerConfig({ ...base, SANDBOX_TIMING_CPUSETS: '0-1|2-3' }, { nproc: 4 })).toThrow(/không còn lõi/);
  });

  it('review I5 — chỉ số lõi vượt số lõi của máy → nổ lúc khởi động, không để mọi job đo ra unavailable', () => {
    expect(() =>
      readWorkerConfig({ ...base, SANDBOX_TIMING_CPUSETS: '2|7', SANDBOX_GENERAL_CPUSET: '0-1' }, { nproc: 4 }),
    ).toThrow(/lõi 7.*4 lõi/);
  });

  it('runtime lạ → nổ', () => {
    expect(() => readWorkerConfig({ ...base, SANDBOX_RUNTIME: 'kata' })).toThrow(/SANDBOX_RUNTIME/);
  });
});
