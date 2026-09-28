import { OmissionLens } from './omission-lens';
import { ModelTier } from '../model-pool';
import { execResult, fakeSandbox } from '../testing/fake-sandbox';
import { CTX } from '../testing/context';

const USAGE = { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheCreationTokens: 0 };
const VERDICT = { errors: [], missingRules: [], injectionAttempt: { detected: false, excerpt: null } };

function scripted(script: string[]): ModelTier {
  let i = 0;
  return { label: 'A', model: 'A-m', ceiling: 0.5, async call() { const c = script[Math.min(i, script.length - 1)]; i++; return { content: c, usage: USAGE }; } };
}
const passAll = () => fakeSandbox((req) => execResult(req.cases.map((c) => ({ name: c.name, group: c.group, status: 'pass' }))));

describe('OmissionLens', () => {
  it('phát hiện khả năng thiếu ca biên agent chấm chưa xét (CÓ tự dò bằng công cụ) → suspected true, có ghi chú', async () => {
    const model = scripted([
      JSON.stringify({ action: 'call', calls: [{ tool: 'run_tests' }], conclusion: null }),
      JSON.stringify({ action: 'final', calls: [], conclusion: { suspected: true, note: 'chưa thấy ca n=0 được chạy' } }),
    ]);
    const lens = new OmissionLens({ models: [model], sandbox: passAll() });
    const r = await lens.review(CTX, VERDICT, []);
    expect(r).toEqual({ lens: 'bo_sot', suspected: true, note: 'chưa thấy ca n=0 được chạy' });
  });

  it('không thấy gì bất thường → suspected false', async () => {
    const model = scripted([JSON.stringify({ action: 'final', calls: [], conclusion: { suspected: false, note: 'đã chạy đủ, không thấy thiếu' } })]);
    const lens = new OmissionLens({ models: [model], sandbox: fakeSandbox(() => execResult([])) });
    const r = await lens.review(CTX, VERDICT, []);
    expect(r.suspected).toBe(false);
  });

  it('W4 — "suspected:true" mà KHÔNG hề gọi công cụ nào → hạ về false, không được tin suông', async () => {
    const model = scripted([JSON.stringify({ action: 'final', calls: [], conclusion: { suspected: true, note: 'có thể còn thiếu' } })]);
    const lens = new OmissionLens({ models: [model], sandbox: fakeSandbox(() => execResult([])) });
    const r = await lens.review(CTX, VERDICT, []);
    expect(r.suspected).toBe(false);
  });
});
