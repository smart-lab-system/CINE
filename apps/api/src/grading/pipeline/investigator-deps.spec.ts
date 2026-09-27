import type { ModelTier } from '../investigator/model-pool';
import { buildInvestigatorDeps } from './investigator-deps';

const tier = (model: string, ceiling: number): ModelTier => ({
  label: `tầng (${model})`,
  model,
  ceiling,
  call: async () => ({ content: '', usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 } }),
});

describe('buildInvestigatorDeps — bậc model và cổng sandbox của đường điều tra', () => {
  it('không SANDBOX_REDIS_URL → không có sandbox, KHÔNG rơi về REDIS_URL của API', () => {
    const sandbox = jest.fn();
    const deps = buildInvestigatorDeps({ REDIS_URL: 'rediss://default:x@api-redis:6379' }, { tiers: () => [], sandbox });
    expect(deps.sandbox).toBeNull();
    expect(sandbox).not.toHaveBeenCalled();
  });

  it('có SANDBOX_REDIS_URL → dựng client với đúng URL và tiền tố', async () => {
    const close = jest.fn(async () => undefined);
    const client = { exec: jest.fn() };
    const sandbox = jest.fn(() => ({ client, close }));
    const deps = buildInvestigatorDeps(
      { SANDBOX_REDIS_URL: 'rediss://sbx:y@sbx-redis:6380', SANDBOX_PREFIX: 'cine-sbx-prod' },
      { tiers: () => [], sandbox: sandbox as never },
    );
    expect(sandbox).toHaveBeenCalledWith(expect.objectContaining({ redisUrl: 'rediss://sbx:y@sbx-redis:6380', prefix: 'cine-sbx-prod' }));
    expect(deps.sandbox).toBe(client);
    await deps.close();
    expect(close).toHaveBeenCalled();
  });

  it('SANDBOX_PREFIX trống → để client dùng tiền tố mặc định', () => {
    const sandbox = jest.fn(() => ({ client: { exec: jest.fn() }, close: async () => undefined }));
    buildInvestigatorDeps({ SANDBOX_REDIS_URL: 'redis://x', SANDBOX_PREFIX: '' }, { tiers: () => [], sandbox: sandbox as never });
    expect(sandbox).toHaveBeenCalledWith(expect.objectContaining({ prefix: undefined }));
  });

  it('ceilingOf: trần của bậc có model đó; model lạ → 0,5 (khuôn eval)', () => {
    const deps = buildInvestigatorDeps({}, { tiers: () => [tier('m-a', 0.9), tier('m-b', 0.7)], sandbox: jest.fn() });
    expect(deps.models.map((m) => m.model)).toEqual(['m-a', 'm-b']);
    expect(deps.ceilingOf('m-b')).toBe(0.7);
    expect(deps.ceilingOf('la')).toBe(0.5);
  });
});
