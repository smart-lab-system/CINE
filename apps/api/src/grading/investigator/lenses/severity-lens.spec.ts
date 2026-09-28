import { SeverityLens } from './severity-lens';
import { ModelTier } from '../model-pool';
import { execResult, fakeSandbox } from '../testing/fake-sandbox';
import { CTX } from '../testing/context';
import { ToolCall } from '../types';
import { ChatTextRequest } from '../../ai-provider/openai-chat';

const USAGE = { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheCreationTokens: 0 };
const EVIDENCE: ToolCall = { id: 'tc-1', tool: 'read_file', args: { path: 'bai-nop/main.cpp' }, status: 'ok', output: '// thiếu dấu chấm câu trong chú thích', structuredRef: null, startedAt: '2026-09-24T00:00:00.000Z', wallMs: 1, injectionSuspected: false };

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

describe('SeverityLens', () => {
  it('bằng chứng chỉ là một kỹ thuật nhỏ bị gán quá tay cho một luật nặng, CÓ tự chạy thử → refuted', async () => {
    const model = scripted([
      JSON.stringify({ action: 'call', calls: [{ tool: 'run_tests' }], conclusion: null }),
      JSON.stringify({ action: 'final', calls: [], conclusion: { status: 'refuted', toolCallIds: ['qua_tay-tc-1'] } }),
    ]);
    const lens = new SeverityLens({ models: [model], sandbox: passAll() });
    const r = await lens.review({ error: { ruleKey: 'chu_thich_sai', toolCallIds: ['tc-1'] }, ctx: CTX, evidence: [EVIDENCE] });
    expect(r.status).toBe('refuted');
  });

  it('mọi bậc model hỏng → challenge() bọc thành unverified (kiểm qua review() ném lỗi)', async () => {
    const dead: ModelTier = { label: 'A', model: 'A-m', ceiling: 0.5, async call() { throw Object.assign(new Error('500'), { status: 500 }); } };
    const lens = new SeverityLens({ models: [dead], sandbox: passAll() });
    await expect(lens.review({ error: { ruleKey: 'chu_thich_sai', toolCallIds: ['tc-1'] }, ctx: CTX, evidence: [EVIDENCE] })).rejects.toThrow();
  });

  it('C3 — "refuted" ngay lượt đầu, không tự chạy thử lần nào → ném lỗi, không được tin suông', async () => {
    const model = scripted([JSON.stringify({ action: 'final', calls: [], conclusion: { status: 'refuted', toolCallIds: [] } })]);
    const lens = new SeverityLens({ models: [model], sandbox: passAll() });
    await expect(lens.review({ error: { ruleKey: 'chu_thich_sai', toolCallIds: ['tc-1'] }, ctx: CTX, evidence: [EVIDENCE] })).rejects.toThrow();
  });

  it('C3 — nội dung bằng chứng gốc (evidence) ĐƯỢC đưa vào tin nhắn cho model, không chỉ mã tc-N (Quá tay cần thấy mới đánh giá được mức độ)', async () => {
    const seen: ChatTextRequest[] = [];
    const model = scripted(
      [JSON.stringify({ action: 'final', calls: [], conclusion: { status: 'confirmed', toolCallIds: [] } })],
      (req) => seen.push(req),
    );
    const lens = new SeverityLens({ models: [model], sandbox: passAll() });
    await lens.review({ error: { ruleKey: 'chu_thich_sai', toolCallIds: ['tc-1'] }, ctx: CTX, evidence: [EVIDENCE] });
    const firstUserMessage = seen[0].messages[0].content;
    expect(firstUserMessage).toContain(EVIDENCE.output);
  });
});
