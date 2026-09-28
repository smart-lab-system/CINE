import { CHALLENGE_PHASE_BUDGET_MS, LENS_BUDGET, runLensLoop } from './lens-loop';
import { ModelTier } from './model-pool';
import { ChatTextRequest } from '../ai-provider/openai-chat';
import { execResult, fakeSandbox } from './testing/fake-sandbox';
import { CTX } from './testing/context';

const USAGE = { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheCreationTokens: 0 };
type Reply = { action: 'call' | 'final'; calls: { tool: 'run_tests' }[]; conclusion: { status: 'confirmed' | 'refuted' } | null };
const parse = (content: string): Reply | null => { try { return JSON.parse(content); } catch { return null; } };
const argsFor = () => ({ group: null });
const SCHEMA = { type: 'object' };

function scripted(script: string[], onCall?: (req: ChatTextRequest) => void): ModelTier {
  let i = 0;
  return {
    label: 'A',
    model: 'A-m',
    ceiling: 0.5,
    async call(req) {
      onCall?.(req);
      const c = script[Math.min(i, script.length - 1)];
      i++;
      return { content: c, usage: USAGE };
    },
  };
}
const passAll = () => fakeSandbox((req) => execResult(req.cases.map((c) => ({ name: c.name, group: c.group, status: 'pass' }))));

describe('runLensLoop()', () => {
  it('gọi công cụ một lượt rồi kết luận — conclusion khớp reply cuối', async () => {
    const model = scripted([
      JSON.stringify({ action: 'call', calls: [{ tool: 'run_tests' }], conclusion: null }),
      JSON.stringify({ action: 'final', calls: [], conclusion: { status: 'refuted' } }),
    ]);
    const r = await runLensLoop(CTX, 'tinh_dung', 'system', 'user', SCHEMA, parse, argsFor, (reply) => reply.conclusion, { models: [model], sandbox: passAll() });
    expect(r.conclusion).toEqual({ status: 'refuted' });
    expect(r.toolCalls).toHaveLength(1);
    expect(r.toolCalls[0].tool).toBe('run_tests');
  });

  it('mọi bậc model hỏng → conclusion null, không ném', async () => {
    const dead: ModelTier = { label: 'A', model: 'A-m', ceiling: 0.5, async call() { throw Object.assign(new Error('500'), { status: 500 }); } };
    const r = await runLensLoop(CTX, 'tinh_dung', 'system', 'user', SCHEMA, parse, argsFor, (reply) => reply.conclusion, { models: [dead], sandbox: fakeSandbox(() => execResult([])) });
    expect(r.conclusion).toBeNull();
  });

  it('chạm trần lời gọi/vòng mà chưa kết luận, ĐÃ có lời gọi thành công → xin thêm MỘT lượt ép kết luận (forced-final)', async () => {
    const model = scripted([
      JSON.stringify({ action: 'call', calls: [{ tool: 'run_tests' }], conclusion: null }),
      JSON.stringify({ action: 'call', calls: [{ tool: 'run_tests' }], conclusion: null }),
      JSON.stringify({ action: 'call', calls: [{ tool: 'run_tests' }], conclusion: null }),
      JSON.stringify({ action: 'call', calls: [{ tool: 'run_tests' }], conclusion: null }),
      // Lượt ép cuối, sau khi chạm trần maxRounds=4:
      JSON.stringify({ action: 'final', calls: [], conclusion: { status: 'confirmed' } }),
    ]);
    const r = await runLensLoop(CTX, 'tinh_dung', 'system', 'user', SCHEMA, parse, argsFor, (reply) => reply.conclusion, { models: [model], sandbox: passAll() });
    expect(r.conclusion).toEqual({ status: 'confirmed' });
  });

  it('chạm trần vòng, KHÔNG có lời gọi thành công nào → conclusion null, KHÔNG xin lượt ép (không có gì để kết luận từ)', async () => {
    const model = scripted([JSON.stringify({ action: 'call', calls: [{ tool: 'run_tests' }], conclusion: null })]);
    const failAll = fakeSandbox(() => { throw new Error('sandbox lỗi'); });
    const r = await runLensLoop(CTX, 'tinh_dung', 'system', 'user', SCHEMA, parse, argsFor, (reply) => reply.conclusion, { models: [model], sandbox: failAll });
    expect(r.conclusion).toBeNull();
    expect(r.toolCalls.every((t) => t.status !== 'ok')).toBe(true);
  });

  it('truyền đúng schema đã cho vào lời gọi model (W2 — không còn gửi {} rỗng)', async () => {
    const seen: unknown[] = [];
    const model = scripted(
      [JSON.stringify({ action: 'final', calls: [], conclusion: { status: 'confirmed' } })],
      (req) => seen.push(req.schema),
    );
    await runLensLoop(CTX, 'tinh_dung', 'system', 'user', SCHEMA, parse, argsFor, (reply) => reply.conclusion, { models: [model], sandbox: passAll() });
    expect(seen[0]).toBe(SCHEMA);
  });

  it('mã lời gọi công cụ có tiền tố theo "label" — không trùng giữa các lượt lăng kính khác nhau (W4)', async () => {
    const model = scripted([
      JSON.stringify({ action: 'call', calls: [{ tool: 'run_tests' }], conclusion: null }),
      JSON.stringify({ action: 'final', calls: [], conclusion: { status: 'confirmed' } }),
    ]);
    const r = await runLensLoop(CTX, 'gian_lan', 'system', 'user', SCHEMA, parse, argsFor, (reply) => reply.conclusion, { models: [model], sandbox: passAll() });
    expect(r.toolCalls[0].id).toBe('gian_lan-tc-1');
  });

  it('CHALLENGE_PHASE_BUDGET_MS ≥ LENS_BUDGET.maxWallMs (đủ cho lượt chậm nhất)', () => {
    expect(CHALLENGE_PHASE_BUDGET_MS).toBeGreaterThanOrEqual(LENS_BUDGET.maxWallMs);
  });
});
