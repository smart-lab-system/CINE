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

/**
 * Ngân sách CẢ pha phản biện (bốn lăng kính) cộng vào trần job chấm (`gradeJobTimeoutMs()`) —
 * sửa sau review cuối của bước 6 (finding C1). Bốn lăng kính chạy SONG SONG với nhau
 * (`InvestigatorRunService.runChallenge`), và mỗi lăng kính xét CÁC LỖI của nó cũng song song
 * (`challenge()` dùng `Promise.all`) — nên trần thời gian THẬT của cả pha là trần của MỘT lượt
 * lăng kính chậm nhất, không phải tổng theo số lỗi hay số lăng kính. +30s dư cho hàng đợi sandbox
 * khi nhiều job chạy cùng lúc.
 */
export const CHALLENGE_PHASE_BUDGET_MS = LENS_BUDGET.maxWallMs + 30_000;

/** Cùng tinh thần `FORCE_FINAL_MESSAGE` của vòng điều tra chính (`protocol.ts`), bản ngắn cho lens. */
const FORCE_FINAL_MESSAGE = 'Đã hết ngân sách. Trả {"action":"final",…} NGAY, chỉ dựa trên các lời gọi đã có ở trên.';

function syntheticCall(id: string, tool: ToolCall['tool'], args: Record<string, unknown>, status: ToolCallStatus, message: string, now: () => number): ToolCall {
  return { id, tool, args, status, output: message, structuredRef: null, startedAt: new Date(now()).toISOString(), wallMs: 0, injectionSuspected: false };
}

export interface LensRunResult<TConclusion> {
  /** null = mọi bậc model hỏng, hay cạn ngân sách trước khi có kết luận. */
  conclusion: TConclusion | null;
  toolCalls: ToolCall[];
}

type LensStop = 'max_rounds' | 'max_wall' | 'max_tool_calls';

/**
 * Vòng lặp CHUNG cho cả `Challenger` (per-error) lẫn `CaseLens` (cấp bài) — hai hình dạng chỉ
 * khác ở SCHEMA của "conclusion" và ở tin nhắn mở đầu; cơ chế gọi công cụ, chống trùng, xoay
 * bậc model là MỘT, dùng lại nguyên `ToolRunner`/`DuplicateGuard`/`ModelPool` của đường điều
 * tra chính (§6 ràng buộc 2: lăng kính gọi công cụ CỦA CHÍNH NÓ, trên `Workspace` riêng của
 * lượt review này — không đọc lại toolCalls cũ của agent chấm).
 *
 * `label` (tên lăng kính, vd "tinh_dung"/"gian_lan") đi vào TIỀN TỐ mã lời gọi công cụ
 * (`${label}-tc-N`) — sửa sau review cuối (finding W4): bốn lăng kính của MỘT lượt chấm đều
 * đánh số `tc-1, tc-2, …` từ đầu, và không có tiền tố thì log/hồ sơ không phân biệt được lời
 * gọi nào của lăng kính nào khi đọc lại.
 */
export async function runLensLoop<TReply extends { action: 'call' | 'final'; calls: unknown[]; conclusion: unknown }, TConclusion>(
  ctx: InvestigationContext,
  label: string,
  systemPrompt: string,
  userMessage: string,
  schema: Record<string, unknown>,
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
  let stop: LensStop | null = null;

  const ask = () =>
    pool.ask(
      { system: systemPrompt, messages: messages.slice(), schemaName: 'lens_turn', schema, maxTokens: 2_048, timeoutMs: 60_000 },
      parseReply,
      { deadline, now },
    );

  for (;;) {
    if (rounds >= LENS_BUDGET.maxRounds) { stop = 'max_rounds'; break; }
    if (now() - started >= LENS_BUDGET.maxWallMs) { stop = 'max_wall'; break; }
    if (toolCalls.length >= LENS_BUDGET.maxToolCalls) { stop = 'max_tool_calls'; break; }

    let reply: TReply;
    try {
      reply = (await ask()).value;
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
      const id = `${label}-tc-${toolCalls.length + 1}`;
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

  // Chạm trần VÒNG hay LỜI GỌI (không phải trần GIỜ — xin thêm một lượt lúc đã hết giờ chỉ vượt
  // đúng trần vừa chạm) và đã có ít nhất một lời gọi THÀNH CÔNG → xin MỘT kết luận ép, cùng tinh
  // thần forced-final của vòng điều tra chính. Không có lời gọi thành công nào thì không có gì
  // để kết luận từ — hỏi thêm chỉ tốn thêm một lượt gọi model vô ích.
  if ((stop === 'max_rounds' || stop === 'max_tool_calls') && toolCalls.some((t) => t.status === 'ok')) {
    const last = messages[messages.length - 1];
    if (last.role === 'user') messages[messages.length - 1] = { ...last, content: `${last.content}\n\n${FORCE_FINAL_MESSAGE}` };
    else messages.push({ role: 'user', content: FORCE_FINAL_MESSAGE });
    try {
      const reply = (await ask()).value;
      if (reply.action === 'final') return { conclusion: extractConclusion(reply), toolCalls };
    } catch {
      // Hết bậc hay hết giờ ngay ở lượt ép cuối — rơi xuống return null bên dưới.
    }
  }
  return { conclusion: null, toolCalls };
}
