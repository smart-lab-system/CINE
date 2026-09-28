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
const passRun = () => fakeSandbox((req) => execResult(req.cases.map((c) => ({ name: c.name, group: c.group, status: 'ran', stdout: '42\n' }))));

describe('CheatingLens', () => {
  it('bài đạt mọi test nhưng nghi hard-code theo input cụ thể (CÓ tự chạy run) → suspected true', async () => {
    const model = scripted([
      JSON.stringify({ action: 'call', calls: [{ tool: 'run', input: '99 1\n' }], conclusion: null }),
      JSON.stringify({ action: 'final', calls: [], conclusion: { suspected: true, note: 'đổi input thì chương trình vẫn in y hệt kết quả cũ' } }),
    ]);
    const lens = new CheatingLens({ models: [model], sandbox: passRun() });
    const r = await lens.review(CTX, VERDICT, []);
    expect(r.suspected).toBe(true);
  });

  it('mọi bậc model hỏng → suspected false, không bịa nghi ngờ', async () => {
    const dead: ModelTier = { label: 'A', model: 'A-m', ceiling: 0.5, async call() { throw Object.assign(new Error('500'), { status: 500 }); } };
    const lens = new CheatingLens({ models: [dead], sandbox: fakeSandbox(() => execResult([])) });
    const r = await lens.review(CTX, VERDICT, []);
    expect(r.suspected).toBe(false);
  });

  it('không kết luận được → ghi chú nêu lý do thật của bậc model (không còn một câu cố định)', async () => {
    const lens = new CheatingLens({ models: [scripted(['không phải JSON'])], sandbox: passRun() });
    const r = await lens.review(CTX, VERDICT, []);
    expect(r.suspected).toBe(false);
    expect(r.note).toContain('bad_output');
  });

  it('W4 — "suspected:true" mà KHÔNG hề tự chạy "run" nào → hạ về false, không được tin suông', async () => {
    const model = scripted([JSON.stringify({ action: 'final', calls: [], conclusion: { suspected: true, note: 'nghi hard-code' } })]);
    const lens = new CheatingLens({ models: [model], sandbox: passRun() });
    const r = await lens.review(CTX, VERDICT, []);
    expect(r.suspected).toBe(false);
  });
});
