import { CheatingLens } from './cheating-lens';
import { ModelTier } from '../model-pool';
import { execResult, fakeSandbox } from '../testing/fake-sandbox';
import { CTX } from '../testing/context';

const USAGE = { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheCreationTokens: 0 };
const VERDICT = { errors: [], missingRules: [], injectionAttempt: { detected: false, excerpt: null } };

function scripted(script: string[]): ModelTier {
  let i = 0;
  return { label: 'A', model: 'A-m', ceiling: 0.5, async call() { const c = script[Math.min(i, script.length - 1)]; i++; return { content: c, usage: USAGE }; } };
}

describe('CheatingLens', () => {
  it('bài đạt mọi test nhưng nghi hard-code theo input cụ thể → suspected true', async () => {
    const model = scripted([JSON.stringify({ action: 'final', calls: [], conclusion: { suspected: true, note: 'đổi input thì chương trình vẫn in y hệt kết quả cũ' } })]);
    const lens = new CheatingLens({ models: [model], sandbox: fakeSandbox(() => execResult([])) });
    const r = await lens.review(CTX, VERDICT, []);
    expect(r.suspected).toBe(true);
  });

  it('mọi bậc model hỏng → suspected false, không bịa nghi ngờ', async () => {
    const dead: ModelTier = { label: 'A', model: 'A-m', ceiling: 0.5, async call() { throw Object.assign(new Error('500'), { status: 500 }); } };
    const lens = new CheatingLens({ models: [dead], sandbox: fakeSandbox(() => execResult([])) });
    const r = await lens.review(CTX, VERDICT, []);
    expect(r.suspected).toBe(false);
  });
});
