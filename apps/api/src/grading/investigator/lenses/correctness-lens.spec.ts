import { CorrectnessLens } from './correctness-lens';
import { ModelTier } from '../model-pool';
import { execResult, fakeSandbox } from '../testing/fake-sandbox';
import { CTX } from '../testing/context';
import { ToolCall } from '../types';

const USAGE = { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheCreationTokens: 0 };
const EVIDENCE: ToolCall = { id: 'tc-1', tool: 'run_tests', args: { group: null }, status: 'ok', output: 'co_ban: 0/1 đạt', structuredRef: null, startedAt: '2026-09-24T00:00:00.000Z', wallMs: 1, injectionSuspected: false };

function scripted(script: string[]): ModelTier {
  let i = 0;
  return { label: 'A', model: 'A-m', ceiling: 0.5, async call() { const c = script[Math.min(i, script.length - 1)]; i++; return { content: c, usage: USAGE }; } };
}
const passNone = () => fakeSandbox((req) => execResult(req.cases.map((c) => ({ name: c.name, group: c.group, status: 'fail' }))));

describe('CorrectnessLens', () => {
  it('tự chạy lại và xác nhận lỗi có thật → confirmed, kèm bằng chứng CỦA CHÍNH NÓ', async () => {
    const model = scripted([
      JSON.stringify({ action: 'call', calls: [{ tool: 'run_tests' }], conclusion: null }),
      JSON.stringify({ action: 'final', calls: [], conclusion: { status: 'confirmed', toolCallIds: ['tinh_dung-tc-1'] } }),
    ]);
    const lens = new CorrectnessLens({ models: [model], sandbox: passNone() });
    const r = await lens.review({ error: { ruleKey: 'sai_ca_co_ban', toolCallIds: ['tc-1'] }, ctx: CTX, evidence: [EVIDENCE] });
    expect(r.status).toBe('confirmed');
  });

  it('mọi bậc model hỏng → review() NÉM lỗi (để challenge() bọc thành unverified, §6.2)', async () => {
    const dead: ModelTier = { label: 'A', model: 'A-m', ceiling: 0.5, async call() { throw Object.assign(new Error('500'), { status: 500 }); } };
    const lens = new CorrectnessLens({ models: [dead], sandbox: passNone() });
    await expect(lens.review({ error: { ruleKey: 'sai_ca_co_ban', toolCallIds: ['tc-1'] }, ctx: CTX, evidence: [EVIDENCE] })).rejects.toThrow();
  });

  it('không kết luận được → lỗi ném ra MANG lý do thật của vòng lăng kính (vd bad_output), để challenge() ghi lại', async () => {
    const lens = new CorrectnessLens({ models: [scripted(['không phải JSON'])], sandbox: passNone() });
    await expect(lens.review({ error: { ruleKey: 'sai_ca_co_ban', toolCallIds: ['tc-1'] }, ctx: CTX, evidence: [EVIDENCE] })).rejects.toThrow(/bad_output/);
  });

  it('toolCallIds trả về chỉ gồm mã CỦA LƯỢT REVIEW này, không phải mã tc-1 của agent chấm', async () => {
    const model = scripted([
      JSON.stringify({ action: 'call', calls: [{ tool: 'run_tests' }], conclusion: null }),
      JSON.stringify({ action: 'final', calls: [], conclusion: { status: 'confirmed', toolCallIds: ['tc-1', 'tinh_dung-tc-1'] } }),
    ]);
    const lens = new CorrectnessLens({ models: [model], sandbox: passNone() });
    const r = await lens.review({ error: { ruleKey: 'sai_ca_co_ban', toolCallIds: ['tc-1'] }, ctx: CTX, evidence: [EVIDENCE] });
    expect(r.toolCallIds).not.toContain('tc-1');
  });

  it('C3 — "refuted" mà KHÔNG có lời gọi run/run_tests thành công nào của chính lăng kính → ném lỗi, không được tin suông (§6, "bằng một lần chạy")', async () => {
    // Kết luận NGAY ở lượt đầu, không hề gọi công cụ nào — "refuted" ở đây là ý kiến suông.
    const model = scripted([JSON.stringify({ action: 'final', calls: [], conclusion: { status: 'refuted', toolCallIds: [] } })]);
    const lens = new CorrectnessLens({ models: [model], sandbox: passNone() });
    await expect(lens.review({ error: { ruleKey: 'sai_ca_co_ban', toolCallIds: ['tc-1'] }, ctx: CTX, evidence: [EVIDENCE] })).rejects.toThrow();
  });

  it('W-B — "confirmed" mà KHÔNG có lời gọi run/run_tests thành công nào của chính lăng kính → ném lỗi (§6.1: "chứng minh bằng một lần chạy" áp cho cả hai chiều)', async () => {
    const model = scripted([JSON.stringify({ action: 'final', calls: [], conclusion: { status: 'confirmed', toolCallIds: [] } })]);
    const lens = new CorrectnessLens({ models: [model], sandbox: passNone() });
    await expect(lens.review({ error: { ruleKey: 'sai_ca_co_ban', toolCallIds: ['tc-1'] }, ctx: CTX, evidence: [EVIDENCE] })).rejects.toThrow();
  });

  it('C3 — "refuted" CÓ một lời gọi run_tests thành công của chính lăng kính → được tin', async () => {
    const model = scripted([
      JSON.stringify({ action: 'call', calls: [{ tool: 'run_tests' }], conclusion: null }),
      JSON.stringify({ action: 'final', calls: [], conclusion: { status: 'refuted', toolCallIds: ['tinh_dung-tc-1'] } }),
    ]);
    const passAll = fakeSandbox((req) => execResult(req.cases.map((c) => ({ name: c.name, group: c.group, status: 'pass' }))));
    const lens = new CorrectnessLens({ models: [model], sandbox: passAll });
    const r = await lens.review({ error: { ruleKey: 'sai_ca_co_ban', toolCallIds: ['tc-1'] }, ctx: CTX, evidence: [EVIDENCE] });
    expect(r.status).toBe('refuted');
  });
});
