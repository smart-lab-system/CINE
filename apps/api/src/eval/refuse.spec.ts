import { KeywordGradingProvider } from '../grading/ai-provider/keyword-grading.provider';
import { refuseInvestigator, refuseReason } from './refuse';

describe('refuseReason — T-EVAL-1', () => {
  const keyword = new KeywordGradingProvider();
  const real = { name: 'real', grade: jest.fn() };

  it('NODE_ENV=test → từ chối', () => {
    expect(refuseReason({ NODE_ENV: 'test' }, real, keyword)).toMatch(/NODE_ENV=test/);
  });
  it('provider rơi về đếm từ khoá → từ chối', () => {
    expect(refuseReason({ NODE_ENV: 'development' }, keyword, keyword)).toMatch(/không có bậc model thật/);
  });
  it('model thật, không phải test → cho chạy', () => {
    expect(refuseReason({ NODE_ENV: 'development' }, real, keyword)).toBeNull();
  });
});

describe('refuseInvestigator', () => {
  const tier = {
    label: 't',
    model: 'm',
    call: async () => ({ content: '', usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 } }),
  };
  const sandbox = { ok: true as const, config: { redisUrl: 'redis://localhost:6390', prefix: 'cine-sbx-eval' } };
  it('T-EVAL-1 — NODE_ENV=test, hay không có bậc model thật nào → từ chối', () => {
    expect(refuseInvestigator({ NODE_ENV: 'test' }, [tier], sandbox)).toMatch(/NODE_ENV=test/);
    expect(refuseInvestigator({}, [], sandbox)).toMatch(/bậc model/);
  });
  it('cấu hình hàng đợi eval sai → từ chối, nêu đúng lỗi của nó', () => {
    expect(refuseInvestigator({}, [tier], { ok: false, error: 'thiếu SANDBOX_EVAL_REDIS_URL' })).toMatch(
      /SANDBOX_EVAL_REDIS_URL/,
    );
    expect(refuseInvestigator({}, [tier], sandbox)).toBeNull();
  });
});
