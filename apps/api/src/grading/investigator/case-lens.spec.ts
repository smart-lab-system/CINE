import { CaseLens, runCaseLens } from './case-lens';
import { CTX } from './testing/context';

const VERDICT = { errors: [], missingRules: [], injectionAttempt: { detected: false, excerpt: null } };

describe('runCaseLens()', () => {
  it('lăng kính trả lời bình thường → giữ nguyên ghi chú', async () => {
    const lens: CaseLens = { name: 'bo_sot', async review() { return { lens: 'bo_sot', suspected: true, note: 'nghi thiếu ca biên' }; } };
    const r = await runCaseLens(CTX, VERDICT, [], lens);
    expect(r).toEqual({ lens: 'bo_sot', suspected: true, note: 'nghi thiếu ca biên' });
  });

  it('lăng kính ném lỗi → suspected:false, KHÔNG bịa ra nghi ngờ (bất đối xứng ngược §6.2)', async () => {
    const lens: CaseLens = { name: 'gian_lan', async review() { throw new Error('model chết'); } };
    const r = await runCaseLens(CTX, VERDICT, [], lens);
    expect(r.suspected).toBe(false);
  });
});
