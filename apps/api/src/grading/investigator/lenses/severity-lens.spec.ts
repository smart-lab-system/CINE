import { SeverityLens } from './severity-lens';
import { ModelTier } from '../model-pool';
import { execResult, fakeSandbox } from '../testing/fake-sandbox';
import { CTX } from '../testing/context';
import { ToolCall } from '../types';

const USAGE = { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheCreationTokens: 0 };
const EVIDENCE: ToolCall = { id: 'tc-1', tool: 'read_file', args: { path: 'bai-nop/main.cpp' }, status: 'ok', output: '// thiếu dấu chấm câu trong chú thích', structuredRef: null, startedAt: '2026-09-24T00:00:00.000Z', wallMs: 1, injectionSuspected: false };

function scripted(script: string[]): ModelTier {
  let i = 0;
  return { label: 'A', model: 'A-m', ceiling: 0.5, async call() { const c = script[Math.min(i, script.length - 1)]; i++; return { content: c, usage: USAGE }; } };
}

describe('SeverityLens', () => {
  it('bằng chứng chỉ là một kỹ thuật nhỏ bị gán quá tay cho một luật nặng → refuted', async () => {
    const model = scripted([JSON.stringify({ action: 'final', calls: [], conclusion: { status: 'refuted', toolCallIds: [] } })]);
    const lens = new SeverityLens({ models: [model], sandbox: fakeSandbox(() => execResult([])) });
    const r = await lens.review({ error: { ruleKey: 'chu_thich_sai', toolCallIds: ['tc-1'] }, ctx: CTX, evidence: [EVIDENCE] });
    expect(r.status).toBe('refuted');
  });

  it('mọi bậc model hỏng → challenge() bọc thành unverified (kiểm qua review() ném lỗi)', async () => {
    const dead: ModelTier = { label: 'A', model: 'A-m', ceiling: 0.5, async call() { throw Object.assign(new Error('500'), { status: 500 }); } };
    const lens = new SeverityLens({ models: [dead], sandbox: fakeSandbox(() => execResult([])) });
    await expect(lens.review({ error: { ruleKey: 'chu_thich_sai', toolCallIds: ['tc-1'] }, ctx: CTX, evidence: [EVIDENCE] })).rejects.toThrow();
  });
});
