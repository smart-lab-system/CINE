import { DuplicateGuard } from './dedup';
import { ModelPool, ModelsExhaustedError, DeadlineExceededError, ModelTier } from './model-pool';
import { SandboxPort, ToolRunner } from './tools';
import { InvestigationContext, ToolCall, ToolCallStatus } from './types';
import { Workspace } from './workspace';

export interface LensDeps {
  models: ModelTier[];
  sandbox: SandboxPort;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

/**
 * Ngân sách RIÊNG của một lượt lăng kính — nhỏ hơn hẳn ngân sách của cuộc điều tra chính
 * (`ctx.budget`, đọc từ env qua `readInvestigationBudget()`): một lăng kính chỉ kiểm MỘT lỗi
 * (hay một câu hỏi cấp bài), không cần khám phá lại toàn bộ đề như agent chấm. Không đọc từ
 * env trong bản này (đơn giản hoá có chủ đích, ghi trong plan) — hằng số, chỉnh trực tiếp nếu
 * cần sau demo.
 */
export const LENS_BUDGET = { maxRounds: 4, maxToolCalls: 6, maxWallMs: 60_000, maxTokens: 30_000 };

function syntheticCall(id: string, tool: ToolCall['tool'], args: Record<string, unknown>, status: ToolCallStatus, message: string, now: () => number): ToolCall {
  return { id, tool, args, status, output: message, structuredRef: null, startedAt: new Date(now()).toISOString(), wallMs: 0, injectionSuspected: false };
}

export interface LensRunResult<TConclusion> {
  /** null = mọi bậc model hỏng, hay cạn ngân sách trước khi có kết luận. */
  conclusion: TConclusion | null;
  toolCalls: ToolCall[];
}

/**
 * Vòng lặp CHUNG cho cả `Challenger` (per-error) lẫn `CaseLens` (cấp bài) — hai hình dạng chỉ
 * khác ở SCHEMA của "conclusion" và ở tin nhắn mở đầu; cơ chế gọi công cụ, chống trùng, xoay
 * bậc model là MỘT, dùng lại nguyên `ToolRunner`/`DuplicateGuard`/`ModelPool` của đường điều
 * tra chính (§6 ràng buộc 2: lăng kính gọi công cụ CỦA CHÍNH NÓ, trên `Workspace` riêng của
 * lượt review này — không đọc lại toolCalls cũ của agent chấm).
 */
export async function runLensLoop<TReply extends { action: 'call' | 'final'; calls: unknown[]; conclusion: unknown }, TConclusion>(
  ctx: InvestigationContext,
  systemPrompt: string,
  userMessage: string,
  parseReply: (content: string) => TReply | null,
  argsFor: (call: never) => Record<string, unknown>,
  extractConclusion: (reply: TReply) => TConclusion,
  deps: LensDeps,
): Promise<LensRunResult<TConclusion>> {
  const now = deps.now ?? Date.now;
  const started = now();
  const deadline = started + LENS_BUDGET.maxWallMs;
  const workspace = Workspace.fromContext(ctx);
  const runner = new ToolRunner(ctx, workspace, deps.sandbox, now, deadline);
  const pool = new ModelPool(deps.models, { sleep: deps.sleep });
  const guard = new DuplicateGuard();

  const toolCalls: ToolCall[] = [];
  const messages: { role: 'user' | 'assistant'; content: string }[] = [{ role: 'user', content: userMessage }];
  let rounds = 0;

  for (;;) {
    if (rounds >= LENS_BUDGET.maxRounds) break;
    if (now() - started >= LENS_BUDGET.maxWallMs) break;
    if (toolCalls.length >= LENS_BUDGET.maxToolCalls) break;

    let reply: TReply;
    try {
      const r = await pool.ask(
        { system: systemPrompt, messages: messages.slice(), schemaName: 'lens_turn', schema: {}, maxTokens: 2_048, timeoutMs: 60_000 },
        parseReply,
        { deadline, now },
      );
      reply = r.value;
    } catch (error) {
      if (error instanceof ModelsExhaustedError || error instanceof DeadlineExceededError) return { conclusion: null, toolCalls };
      throw error;
    }
    rounds++;
    messages.push({ role: 'assistant', content: JSON.stringify(reply) });

    if (reply.action === 'final') return { conclusion: extractConclusion(reply), toolCalls };

    const results: ToolCall[] = [];
    for (const call of reply.calls as never[]) {
      if (toolCalls.length >= LENS_BUDGET.maxToolCalls) break;
      const id = `lens-tc-${toolCalls.length + 1}`;
      const args = argsFor(call);
      const admit = guard.admit((call as { tool: ToolCall['tool'] }).tool, args);
      let tc: ToolCall;
      if (!admit.admitted) {
        tc = syntheticCall(id, (call as { tool: ToolCall['tool'] }).tool, args, 'blocked_duplicate', admit.message, now);
      } else {
        const out = await runner.execute(id, { tool: (call as { tool: ToolCall['tool'] }).tool, args });
        tc = out.toolCall;
      }
      toolCalls.push(tc);
      results.push(tc);
    }
    const rendered = results.map((t) => `[${t.id}] ${t.tool} → ${t.status}\n${t.output}`).join('\n\n');
    messages.push({ role: 'user', content: rendered || 'Không lời gọi nào được chạy.' });
  }
  return { conclusion: null, toolCalls };
}
