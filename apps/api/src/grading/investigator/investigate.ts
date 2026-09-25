import { ChatTextRequest } from '../ai-provider/openai-chat';
import { wrapSubmission } from '../harness/submission-envelope';
import { DuplicateGuard } from './dedup';
import { DeadlineExceededError, ModelPool, ModelsExhaustedError, ModelTier, PoolReply } from './model-pool';
import {
  argsFor, FORCE_FINAL_MESSAGE, initialUserMessage, INVESTIGATOR_SYSTEM_PROMPT, MAX_CALLS_PER_ROUND,
  ModelReply, parseReply, renderToolResults, REPLY_JSON_SCHEMA,
} from './protocol';
import { renderSummary } from './summary';
import { programProblem, SandboxPort, ToolRunner } from './tools';
import {
  BundleCase, InvestigationContext, InvestigationFlag, InvestigationResult, StopReason, StructuredResult, ToolCall,
  ToolCallStatus, ToolName, Verdict,
} from './types';
import { uncoveredCases } from './coverage';
import { Workspace } from './workspace';

export interface InvestigateDeps {
  /** Chuỗi bậc model; vòng lặp tự xoay (§7.3). */
  models: ModelTier[];
  sandbox: SandboxPort;
  now?: () => number;
  /** Chọn lời gọi chạy lại (T-AG-3). */
  random?: () => number;
  sleep?: (ms: number) => Promise<void>;
  replyMaxTokens?: number;
}

/** Mọi thành phần tắt được bằng cấu hình, không bằng sửa code (§12.5 yêu cầu 3). */
export interface InvestigateComponents {
  replayCheck: boolean;
  tools: Record<ToolName, boolean>;
}

export const ALL_COMPONENTS: InvestigateComponents = {
  replayCheck: true,
  tools: { run: true, run_tests: true, read_file: true, list_files: true },
};

export const STALL_AFTER_ROUNDS = 2;
export const STALL_AFTER_MS = 60_000;
const MODEL_CALL_TIMEOUT_MS = 90_000;
/** Chạy lại đối chiếu là thêm một job sandbox: còn ít hơn thế thì bỏ, không kéo quá trần §7. */
const MIN_REPLAY_MS = 5_000;
const REPLAY_CONFIDENCE_CAP = 0.5;

const ZERO_CALL_REASON: Partial<Record<StopReason, string>> = {
  stalled: 'agent treo: 2 vòng, 0 lời gọi công cụ thành công (§7.2)',
  models_exhausted: 'mọi bậc model đều hỏng trước khi có lời gọi công cụ thành công nào',
};

function syntheticCall(id: string, tool: ToolName, args: Record<string, unknown>, status: ToolCallStatus, message: string, now: () => number): ToolCall {
  return { id, tool, args, status, output: message, structuredRef: null, startedAt: new Date(now()).toISOString(), wallMs: 0, injectionSuspected: false };
}

/** Thứ phải trùng khi chạy lại cùng một lời gọi — không gồm đoạn văn có mã bọc ngẫu nhiên. */
function replayKey(s: StructuredResult | null | undefined): string | null {
  if (!s) return null;
  if (s.kind === 'run') return JSON.stringify([s.compile?.ok ?? null, s.status, s.stdoutSha256]);
  return JSON.stringify([s.compile?.ok ?? null, s.cases.map((c) => [c.name, c.status])]);
}

/** Bài không gửi được sang sandbox (review M4): kết cục ungradable, 0 lời gọi model, 0 job. */
function invalidProgram(
  ctx: InvestigationContext,
  ungradable: NonNullable<InvestigationResult['ungradable']>,
  suspected: boolean,
): InvestigationResult {
  const stopReason: StopReason = ungradable.class === 'submission' ? 'empty_submission' : 'invalid_program';
  return {
    kind: 'ungradable',
    verdict: null,
    rejected: [],
    ungradable,
    flags: suspected ? ['injection_suspected'] : [],
    confidenceCap: 1,
    replay: null,
    summary: renderSummary({ toolCalls: [], structured: {}, verdict: null, rules: ctx.rules, stopReason }),
    investigation: {
      toolCalls: [],
      structuredResults: {},
      complexity: null,
      minimalFailingCase: null,
      approach: null,
      peerCluster: null,
      budget: { toolCalls: 0, wallMs: 0, tokens: 0, rounds: 0, forcedFinal: false, stopReason, limits: ctx.budget },
      modelsUsed: [],
      tierRotations: [],
    },
    usage: { inputTokens: 0, outputTokens: 0 },
  };
}

/**
 * Vòng điều tra (spec §3, §5, §7). Thuần theo nghĩa của §12.5: không đọc DB, không ghi gì,
 * không gọi phản biện — phản biện ghép BÊN NGOÀI. Không ném vì model hay sandbox hỏng:
 * mọi sự cố thành một lý do dừng ghi trong `investigation.budget`.
 */
export async function investigate(
  ctx: InvestigationContext,
  deps: InvestigateDeps,
  components: InvestigateComponents = ALL_COMPONENTS,
): Promise<InvestigationResult> {
  const now = deps.now ?? Date.now;
  const random = deps.random ?? Math.random;
  const started = now();
  // Review M3: quét CẢ bài một lần, như đường một-phát — không chỉ đoạn agent chọn đọc.
  const submissionSuspected = ctx.submission.files.some((f) => wrapSubmission(f.content).injectionSuspected);
  const invalid = programProblem(ctx);
  if (invalid) return invalidProgram(ctx, invalid, submissionSuspected);
  // Trần §7 là CỨNG (review I1): model, thử lại, xoay bậc, sandbox và chạy lại đều tính theo mốc này.
  const deadline = started + ctx.budget.maxWallMs;
  const elapsed = () => now() - started;
  const workspace = Workspace.fromContext(ctx);
  const runner = new ToolRunner(ctx, workspace, deps.sandbox, now, deadline);
  const pool = new ModelPool(deps.models, { sleep: deps.sleep });
  const guard = new DuplicateGuard();

  const toolCalls: ToolCall[] = [];
  const structured: Record<string, StructuredResult> = {};
  const messages: ChatTextRequest['messages'] = [{ role: 'user', content: initialUserMessage(ctx, workspace.list()) }];
  const modelsUsed: string[] = [];
  const tierRotations: { round: number; from: string; reason: string }[] = [];
  let rounds = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let verdict: Verdict | null = null;
  let stopReason: StopReason | null = null;
  /** Lý do từng bậc của lần pool hỏng gần nhất — vào lý do ungradable (review M2). */
  let poolFailure: string | null = null;
  const okCount = () => toolCalls.filter((t) => t.status === 'ok').length;

  const ask = async (): Promise<ModelReply> => {
    let reply: PoolReply<ModelReply>;
    try {
      reply = await pool.ask(
        {
          system: INVESTIGATOR_SYSTEM_PROMPT,
          // Bản CHỤP: vòng lặp còn đẩy tiếp vào `messages`, và một provider (hay một test) giữ
          // tham chiếu tới request thì không được thấy lịch sử đổi dưới chân nó.
          messages: messages.slice(),
          schemaName: 'investigator_turn',
          schema: REPLY_JSON_SCHEMA,
          maxTokens: deps.replyMaxTokens ?? 4_096,
          // Review Focus 5 + review I1: pool cắt mỗi lần thử về phần còn lại tới `deadline`.
          timeoutMs: MODEL_CALL_TIMEOUT_MS,
        },
        parseReply,
        { deadline, now },
      );
    } catch (error) {
      // Token của các lượt hỏng vẫn là token đã tiêu (review M1); bậc chết vẫn là bậc chết (review M2).
      if (error instanceof ModelsExhaustedError || error instanceof DeadlineExceededError) {
        inputTokens += error.usage.inputTokens;
        outputTokens += error.usage.outputTokens;
        for (const r of error.rotations) tierRotations.push({ round: rounds + 1, ...r });
      }
      if (error instanceof ModelsExhaustedError) poolFailure = error.reasons.join('; ');
      throw error;
    }
    inputTokens += reply.usage.inputTokens;
    outputTokens += reply.usage.outputTokens;
    if (!modelsUsed.includes(reply.model)) modelsUsed.push(reply.model);
    for (const r of reply.rotations) tierRotations.push({ round: rounds + 1, ...r });
    messages.push({ role: 'assistant', content: JSON.stringify(reply.value) });
    return reply.value;
  };

  for (;;) {
    if (rounds >= ctx.budget.maxRounds) { stopReason = 'max_rounds'; break; }
    if (elapsed() >= ctx.budget.maxWallMs) { stopReason = 'max_wall'; break; }
    if (inputTokens + outputTokens >= ctx.budget.maxTokens) { stopReason = 'max_tokens'; break; }
    // Review M8: trần chạm đúng cuối lượt trước — hỏi thêm một lượt chỉ để bị cắt ở lời gọi đầu.
    if (toolCalls.length >= ctx.budget.maxToolCalls) { stopReason = 'max_tool_calls'; break; }
    if (rounds >= STALL_AFTER_ROUNDS && okCount() === 0 && elapsed() > STALL_AFTER_MS) { stopReason = 'stalled'; break; }

    let reply: ModelReply;
    try {
      reply = await ask();
    } catch (error) {
      if (error instanceof ModelsExhaustedError) { stopReason = 'models_exhausted'; break; }
      if (error instanceof DeadlineExceededError) { stopReason = 'max_wall'; break; }
      throw error;
    }
    rounds++; // lượt xoay bậc nằm TRONG ask() và không tính vòng (T-AG-7)

    if (reply.action === 'final') {
      verdict = reply.verdict;
      stopReason = 'verdict';
      break;
    }

    const results: ToolCall[] = [];
    const dropped = reply.calls.length - MAX_CALLS_PER_ROUND;
    for (const call of reply.calls.slice(0, MAX_CALLS_PER_ROUND)) {
      if (toolCalls.length >= ctx.budget.maxToolCalls) { stopReason = 'max_tool_calls'; break; }
      if (elapsed() >= ctx.budget.maxWallMs) { stopReason = 'max_wall'; break; }
      const id = `tc-${toolCalls.length + 1}`;
      const args = argsFor(call);
      let tc: ToolCall;
      if (!components.tools[call.tool]) {
        tc = syntheticCall(id, call.tool, args, 'error', `công cụ ${call.tool} đã tắt trong cấu hình của lượt chạy này`, now);
      } else {
        const admit = guard.admit(call.tool, args);
        if (!admit.admitted) {
          tc = syntheticCall(id, call.tool, args, 'blocked_duplicate', admit.message, now);
        } else {
          const out = await runner.execute(id, { tool: call.tool, args });
          tc = out.toolCall;
          if (out.structured) structured[id] = out.structured;
        }
      }
      toolCalls.push(tc);
      results.push(tc);
      if (guard.stuck) { stopReason = 'blocked_repeatedly'; break; }
    }
    const note = dropped > 0 ? `\n\n(${dropped} lời gọi vượt trần ${MAX_CALLS_PER_ROUND} lời gọi một lượt đã bị bỏ, không chạy.)` : '';
    messages.push({ role: 'user', content: renderToolResults(results) + note });
    if (stopReason) break;
  }

  // Chạm trần lời gọi hay trần vòng: xin MỘT kết luận từ những gì đã có (§7, T-AG-1). Trần
  // thời gian hay token thì không xin — một lời gọi nữa là vượt đúng trần vừa chạm.
  let forcedFinal = false;
  if ((stopReason === 'max_tool_calls' || stopReason === 'max_rounds') && okCount() > 0) {
    const last = messages[messages.length - 1];
    // Thay bằng một đối tượng MỚI, không sửa tại chỗ: bản chụp của lượt trước cũng trỏ tới nó.
    if (last.role === 'user') messages[messages.length - 1] = { ...last, content: `${last.content}\n\n${FORCE_FINAL_MESSAGE}` };
    else messages.push({ role: 'user', content: FORCE_FINAL_MESSAGE });
    try {
      const reply = await ask();
      forcedFinal = true;
      if (reply.action === 'final') verdict = reply.verdict;
    } catch (error) {
      // Review lần 2 M3: mọi bậc chết ở chính lượt này thì cuộc điều tra dừng VÌ MODEL, không vì
      // trần — eval tính nó là lượt lỗi, không phải một kết cục của agent.
      if (error instanceof ModelsExhaustedError) stopReason = 'models_exhausted';
      else if (!(error instanceof DeadlineExceededError)) throw error;
    }
  }
  const stop: StopReason = stopReason ?? 'verdict';

  // T-AG-2: mọi lỗi phải trỏ tới một lời gọi THÀNH CÔNG có thật.
  const known = new Set(ctx.rules.map((r) => r.ruleKey));
  const allIds = new Set(toolCalls.map((t) => t.id));
  const okIds = new Set(toolCalls.filter((t) => t.status === 'ok').map((t) => t.id));
  const rejected: InvestigationResult['rejected'] = [];
  let accepted: Verdict | null = null;
  if (verdict) {
    const errors = [];
    const seen = new Set<string>();
    for (const e of verdict.errors) {
      if (!known.has(e.ruleKey)) { rejected.push({ ruleKey: e.ruleKey, reason: 'unknown_rule' }); continue; }
      if (e.toolCallIds.some((id) => !allIds.has(id))) { rejected.push({ ruleKey: e.ruleKey, reason: 'fabricated_tool_call' }); continue; }
      const evidence = e.toolCallIds.filter((id) => okIds.has(id));
      if (evidence.length === 0) { rejected.push({ ruleKey: e.ruleKey, reason: 'no_valid_tool_call' }); continue; }
      if (seen.has(e.ruleKey)) continue; // một luật một lần — điểm không trừ hai lần cho cùng luật
      seen.add(e.ruleKey);
      errors.push({ ...e, toolCallIds: evidence });
    }
    accepted = {
      errors,
      missingRules: verdict.missingRules.map((m) => ({ ...m, toolCallIds: m.toolCallIds.filter((id) => okIds.has(id)) })),
      injectionAttempt: verdict.injectionAttempt,
    };
  }

  // Sàn của bước 2 (Q4), theo thứ tự: 0 lời gọi thành công → mọi bậc model chết → gói test rỗng
  // hay chưa chạy đủ (T-FLOOR-3) → không có kết luận đọc được. Tất cả đều ungradable. Bậc chết
  // đứng TRƯỚC sàn độ phủ (review lần 2 I2): gói chưa chạy đủ chỉ là hệ quả, lý do là model.
  // Phần còn lại của sàn §4.4 là bước 3.
  let kind: InvestigationResult['kind'] = 'verdict';
  let ungradable: InvestigationResult['ungradable'] = null;
  const missing = uncoveredCases(ctx.testBundle.cases, toolCalls, structured);
  const why = poolFailure && stop === 'models_exhausted' ? ` — ${poolFailure}`.slice(0, 500) : '';
  if (okCount() === 0) {
    kind = 'ungradable';
    ungradable = {
      class: 'system',
      reason: (ZERO_CALL_REASON[stop] ?? '0 lời gọi công cụ thành công — cuộc điều tra chưa bắt đầu (§4.4)') + why,
    };
  } else if (stop === 'models_exhausted') {
    kind = 'ungradable';
    ungradable = { class: 'system', reason: `dừng vì models_exhausted trước khi có kết luận đọc được${why}` };
  } else if (ctx.testBundle.cases.length === 0) {
    // Dòng đầu bảng §4.4: gói rỗng thì `uncoveredCases` cũng rỗng — "chạy đủ" một cách vô nghĩa.
    kind = 'ungradable';
    ungradable = { class: 'system', reason: 'gói test rỗng — không có thước nào để chạy (§4.4)' };
  } else if (missing.length > 0) {
    kind = 'ungradable';
    const groups = [...new Set(missing.map((c) => c.group))].join(', ');
    ungradable = {
      class: 'system',
      reason:
        `gói test chưa chạy đủ: ${missing.length}/${ctx.testBundle.cases.length} ca chưa có kết quả (nhóm ${groups}) — ` +
        '"không có gì để trừ" không phải "không có gì sai" (§4.4)',
    };
  } else if (!accepted) {
    kind = 'ungradable';
    ungradable = { class: 'system', reason: `dừng vì ${stop} trước khi có kết luận đọc được${why}` };
  }

  const flags: InvestigationFlag[] = [];
  if (kind === 'verdict' && stop !== 'verdict') flags.push('budget_exhausted');
  if (rejected.length > 0) flags.push('evidence_rejected');
  if (submissionSuspected || toolCalls.some((t) => t.injectionSuspected) || accepted?.injectionAttempt.detected) {
    flags.push('injection_suspected');
  }

  // T-AG-3: chạy lại MỘT lời gọi sandbox, ưu tiên lời gọi được verdict trích.
  let replay: InvestigationResult['replay'] = null;
  let confidenceCap = 1;
  if (components.replayCheck && kind === 'verdict' && accepted && deadline - now() < MIN_REPLAY_MS) {
    // Review lần 3 M2: bỏ chạy lại vì hết giờ là CHƯA đối chiếu — trần 1 không có nghĩa "đã kiểm".
    flags.push('replay_unverified');
  } else if (components.replayCheck && kind === 'verdict' && accepted) {
    const cited = new Set(accepted.errors.flatMap((e) => e.toolCallIds));
    const sandboxCalls = toolCalls.filter((t) => t.status === 'ok' && (t.tool === 'run' || t.tool === 'run_tests'));
    const preferred = sandboxCalls.filter((t) => cited.has(t.id));
    const candidates = preferred.length > 0 ? preferred : sandboxCalls;
    if (candidates.length > 0) {
      const pick = candidates[Math.min(candidates.length - 1, Math.floor(random() * candidates.length))];
      const again = await runner.execute(`${pick.id}-replay`, { tool: pick.tool, args: pick.args });
      const before = replayKey(structured[pick.id]);
      // Review M7 + lần 2 M1: sandbox không chạy được lượt lại, hay cắt nó giữa chừng vì hết ngân
      // sách job, là sự cố hạ tầng — không phải bằng chứng lệch. Nhưng cũng KHÔNG phải "đã kiểm":
      // cờ `replay_unverified` nói ra, để bước 3 không đọc trần 1 thành đã đối chiếu.
      // Lượt GỐC bị cắt mà lượt lại chạy đủ thì danh sách ca khác nhau vì ngân sách, không vì bài.
      const aborted = (s: StructuredResult | null | undefined) => s?.kind === 'run_tests' && s.aborted;
      const cut = aborted(again.structured) || aborted(structured[pick.id]);
      const matched = again.toolCall.status !== 'ok' || cut ? null : before !== null && before === replayKey(again.structured);
      replay = { toolCallId: pick.id, matched };
      if (matched === null) flags.push('replay_unverified');
      if (matched === false) {
        flags.push('replay_mismatch');
        confidenceCap = REPLAY_CONFIDENCE_CAP;
      }
    }
  }

  const finalVerdict = kind === 'verdict' ? accepted : null;
  return {
    kind,
    verdict: finalVerdict,
    rejected,
    ungradable,
    flags,
    confidenceCap,
    replay,
    summary: renderSummary({ toolCalls, structured, verdict: finalVerdict, rules: ctx.rules, stopReason: stop }),
    investigation: {
      toolCalls,
      structuredResults: structured,
      complexity: null,
      minimalFailingCase: null,
      approach: null,
      peerCluster: null,
      budget: {
        toolCalls: toolCalls.length,
        wallMs: elapsed(),
        tokens: inputTokens + outputTokens,
        rounds,
        forcedFinal,
        stopReason: stop,
        limits: ctx.budget,
      },
      modelsUsed,
      tierRotations,
    },
    usage: { inputTokens, outputTokens },
  };
}
