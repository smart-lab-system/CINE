import { LENS_BUDGET, runLensLoop } from './lens-loop';
import { ModelTier } from './model-pool';
import { execResult, fakeSandbox } from './testing/fake-sandbox';
import { CTX } from './testing/context';

const USAGE = { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheCreationTokens: 0 };
type Reply = { action: 'call' | 'final'; calls: { tool: 'run_tests' }[]; conclusion: { status: 'confirmed' | 'refuted' } | null };
const parse = (content: string): Reply | null => { try { return JSON.parse(content); } catch { return null; } };
const argsFor = () => ({ group: null });

function scripted(script: string[]): ModelTier {
  let i = 0;
  return { label: 'A', model: 'A-m', ceiling: 0.5, async call() { const c = script[Math.min(i, script.length - 1)]; i++; return { content: c, usage: USAGE }; } };
}

describe('runLensLoop()', () => {
  it('gọi công cụ một lượt rồi kết luận — conclusion khớp reply cuối', async () => {
    const model = scripted([
      JSON.stringify({ action: 'call', calls: [{ tool: 'run_tests' }], conclusion: null }),
      JSON.stringify({ action: 'final', calls: [], conclusion: { status: 'refuted' } }),
    ]);
    const sandbox = fakeSandbox((req) => execResult(req.cases.map((c) => ({ name: c.name, group: c.group, status: 'pass' }))));
    const r = await runLensLoop(CTX, 'system', 'user', parse, argsFor, (reply) => reply.conclusion, { models: [model], sandbox });
    expect(r.conclusion).toEqual({ status: 'refuted' });
    expect(r.toolCalls).toHaveLength(1);
    expect(r.toolCalls[0].tool).toBe('run_tests');
  });

  it('mọi bậc model hỏng → conclusion null, không ném', async () => {
    const dead: ModelTier = { label: 'A', model: 'A-m', ceiling: 0.5, async call() { throw Object.assign(new Error('500'), { status: 500 }); } };
    const r = await runLensLoop(CTX, 'system', 'user', parse, argsFor, (reply) => reply.conclusion, { models: [dead], sandbox: fakeSandbox(() => execResult([])) });
    expect(r.conclusion).toBeNull();
  });

  it('chạm trần vòng mà chưa kết luận → conclusion null, không lặp vô hạn', async () => {
    const model = scripted([JSON.stringify({ action: 'call', calls: [{ tool: 'run_tests' }], conclusion: null })]);
    const sandbox = fakeSandbox((req) => execResult(req.cases.map((c) => ({ name: c.name, group: c.group, status: 'pass' }))));
    const r = await runLensLoop(CTX, 'system', 'user', parse, argsFor, (reply) => reply.conclusion, { models: [model], sandbox });
    expect(r.conclusion).toBeNull();
    expect(r.toolCalls.length).toBeLessThanOrEqual(LENS_BUDGET.maxToolCalls);
  });
});
