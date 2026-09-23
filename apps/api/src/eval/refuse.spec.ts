import { KeywordGradingProvider } from '../grading/ai-provider/keyword-grading.provider';
import { refuseReason } from './refuse';

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
