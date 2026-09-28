# Agent phản biện mới cho đường điều tra (bước 6) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thay lượt phản biện đơn (Advocate cũ, chỉ chạy trên đường one_shot) bằng bốn lăng kính hẹp chạy trên đường điều tra — mỗi lăng kính có công cụ riêng, ảnh hưởng điểm thật theo luật ba trạng thái (§6.2), và hiện trên UI thật.

**Architecture:** Bốn lăng kính chia hai hình dạng khác nhau vì câu hỏi chúng trả lời khác nhau (không ép chung một khuôn giả tạo): **Tính đúng** và **Quá tay** xét TỪNG lỗi đã chẩn đoán, trả về `confirmed`/`refuted`/`unverified` qua `Challenger`/`challenge()` đã có sẵn (bước 2) — hai lăng kính này NỐI THẲNG vào điểm theo §6.2. **Bỏ sót** và **Gian lận** xét CẢ BÀI (không gắn với một `ruleKey`), trả về một ghi chú văn bản + cờ nghi ngờ qua một kiểu mới `CaseLens` — hai lăng kính này KHÔNG đổi điểm, chỉ gắn `caseFlag` (đẩy bài về giảng viên qua đúng cơ chế `auto = caseFlags.length === 0 && errorFlags.length === 0` đã có). Cả bốn lăng kính dùng lại **một** vòng lặp gọi-công-cụ nhỏ (`lens-loop.ts`), tách khỏi vòng lặp lớn của `investigate()` nhưng cùng `ModelTier`/`ToolRunner`/`DuplicateGuard`.

Hai đơn giản hoá CÓ CHỦ Ý, ghi rõ để không ai đọc nhầm là thiếu sót:
- **Bộ dữ liệu lỗi giả (nhóm 6) để đo tỉ lệ bác đúng/bác oan (§15.1) — NGOÀI PHẠM VI plan này.** Cần dựng cả một harness đo thực nghiệm mới, rủi ro thời gian ngang bước 4 (đo phần cứng thật) — hoãn sau demo, cùng lý do bước 4 bị hoãn. Plan này chỉ có test ĐƠN VỊ cho từng phần nối (mỗi lăng kính riêng, luật §6.2 riêng).
- **"Quá tay" không thấy mức trừ bằng SỐ.** `bang-loi.md` (workspace của mọi agent, kể cả lăng kính) không lộ `deductionHundredths` cho model — luật kiến trúc từ §2.1, giữ nguyên ở đây. Lăng kính này vì vậy kiểm "bằng chứng có thực sự khớp NGHIÊM TÚC với mô tả luật, hay chỉ là một kỹ thuật nhỏ bị gán quá tay cho một luật nặng" — cùng tinh thần "quá tay" của spec, đo bằng LỜI thay vì bằng SỐ.

**Tech Stack:** NestJS 10 + TypeORM 0.3.31 + PostgreSQL 16 (apps/api); Next.js 15 + React (apps/web); zod cho JSON schema runtime validation; Jest cho apps/api, Vitest cho apps/web.

**Spec:** `docs/superpowers/specs/2026-09-20-grading-agent-investigator-design.md` §6 (toàn bộ), §9 mục 6, §15.1 dòng "6 — phản biện mới".

## Global Constraints

- **Ba ràng buộc §6, không thương lượng:** (1) lăng kính KHÔNG được thấy `note` (lập luận) của agent chấm — `ChallengeInput.error` đã là `Omit<VerdictError, 'note'>`, giữ nguyên; (2) lăng kính PHẢI gọi được công cụ CỦA CHÍNH NÓ (không phải đọc lại toolCalls cũ) — mọi lăng kính chạy `ToolRunner` riêng trên `Workspace` riêng; (3) lăng kính KHÔNG BAO GIỜ chạm điểm trực tiếp — không lăng kính nào trả về một con số điểm hay `deductionHundredths`.
- **Bất đối xứng lỗi (§6.2):** lăng kính đọc không được (lỗi mạng, JSON hỏng, hết bậc model) → `unverified`, KHÔNG BAO GIỜ `refuted`. Chấm nó "đã bác bỏ" là âm thầm chôn một lỗi có thật.
- **`refuted` vẫn gắn cờ** (chốt 2026-09-23 trong spec) — không tính điểm KHÔNG có nghĩa là im lặng; giảng viên phải thấy đúng lỗi bị bác.
- **Không xoá lỗi bị bác** — nó vẫn nằm trong `breakdown.errors`, chỉ đổi `counted` sang `'refuted'` (UI gạch ngang).
- **Cảnh báo cùng họ model lúc KHỞI ĐỘNG** (§6.3), không phải một dòng cuối báo cáo — log ngay lúc dựng module.
- **`decide()` vẫn thuần** (§12.5) — không đọc DB, không gọi model/sandbox; nhận `challenge` như một input đã tính sẵn, y hệt cách nó nhận `result`.
- Số học phần trăm điểm vẫn nguyên (§13.2) — không đụng tới đường số nào đã có, chỉ thêm một nhánh loại trừ.

## Review Focus

1. **Lỗi bị bác vẫn phải xuất hiện trong `breakdown.errors`** (chỉ đổi `counted`), không được biến mất khỏi hồ sơ — Task 8.
2. **`repriceBreakdown()` (áp giá mới cho phiên đã chốt) không được âm thầm biến `refuted` trở lại `counted`** — đây là gotcha thật đã tìm thấy khi đọc code, không phải suy đoán; khoá bằng test riêng (T-REFUTE) — Task 8.
3. **Một lỗi mà cả hai lăng kính per-error đều KHÔNG xét tới** (ví dụ challenge tắt, hay hồ sơ cũ trước bước 6) phải xử sự y hệt hôm nay — không được vô tình gắn `unverified` cho MỌI lỗi của MỌI hồ sơ cũ — Task 7.
4. **`unverified` hạ confidence NHƯNG không tự động đẩy `outcome` xuống `ungradable`** — nó vẫn đi qua đường `flagged` bình thường (giữ điểm AI, chờ giảng viên), không phải một sàn mới — Task 7.
5. **Lăng kính hỏng (model chết, JSON sai khuôn) không được làm cả lượt chấm ném lỗi** — `investigator-run.service.ts` phải tiếp tục chấm dù một/nhiều lăng kính không trả lời được, y hệt triết lý "Advocate không có bậc sàn, hỏng thì bỏ qua ý kiến" — Task 6.

---

### Task 1: Hạ tầng lăng kính dùng chung — kiểu, giao thức, vòng lặp

**Files:**
- Modify: `apps/api/src/grading/investigator/challenge.ts` (chỉ THÊM hai kiểu ở cuối file, không sửa `Challenger`/`challenge()` đã có)
- Create: `apps/api/src/grading/investigator/case-lens.ts`
- Create: `apps/api/src/grading/investigator/lens-protocol.ts`
- Create: `apps/api/src/grading/investigator/lens-loop.ts`
- Test: `apps/api/src/grading/investigator/lens-loop.spec.ts`
- Test: `apps/api/src/grading/investigator/case-lens.spec.ts`

**Interfaces:**
- Consumes: `ModelTier`, `ModelPool`, `ModelsExhaustedError`, `DeadlineExceededError` (`./model-pool`); `ToolRunner`, `SandboxPort` (`./tools`); `Workspace` (`./workspace`); `DuplicateGuard` (`./dedup`); `InvestigationContext`, `ToolCall`, `ToolName`, `TOOL_NAMES`, `Verdict` (`./types`); `argsFor` không export được từ `protocol.ts` nên lens-protocol.ts tự định nghĩa bản của mình (xem bên dưới).
- Produces: `CaseLensNote`, `StoredChallenge` (từ `challenge.ts`); `CaseLens`, `runCaseLens()` (từ `case-lens.ts`); `runLensLoop()`, `LENS_BUDGET`, `LensDeps` (từ `lens-loop.ts`) — Task 2-5 xây bốn lăng kính cụ thể trên nền này.

- [ ] **Step 1: Thêm hai kiểu chia sẻ vào `challenge.ts`**

Mở `apps/api/src/grading/investigator/challenge.ts`, thêm vào CUỐI file (không sửa gì phía trên — `Challenger`/`challenge()` đã chốt ở bước 2):

```ts
/** Ghi chú của một lăng kính CẤP BÀI (Bỏ sót, Gian lận) — không gắn với một ruleKey. */
export interface CaseLensNote {
  lens: string;
  suspected: boolean;
  note: string;
}

/**
 * Toàn bộ kết quả phản biện của MỘT lượt chấm, lưu trong `StoredInvestigation.challenge`
 * (§6, bước 6) — chưa dùng cột `grading_attempt.challenge` riêng (đã có từ migration
 * `1789450000000-AttemptsBundlesScores`): gộp vào `investigation` cho đơn giản, dùng lại
 * đúng cơ chế "tolerant khi đọc bản ghi cũ" đã có ở `readStoredInvestigation()`, thay vì mở
 * thêm một đường đọc/ghi DB riêng chỉ để có một cột không dùng tới.
 */
export interface StoredChallenge {
  /** Một entry cho MỖI lăng kính per-error (Tính đúng, Quá tay) — chưa gộp theo ruleKey. */
  perError: ChallengeConclusion[];
  /** Bỏ sót, Gian lận. */
  caseNotes: CaseLensNote[];
}
```

- [ ] **Step 2: Viết `case-lens.ts`**

```ts
import { InvestigationContext, ToolCall, Verdict } from './types';
import { CaseLensNote } from './challenge';

/**
 * Lăng kính CẤP BÀI (§6.1: Bỏ sót, Gian lận) — không xét MỘT lỗi, xét CẢ bài. Đối xứng với
 * `Challenger` (per-error) nhưng khác hình dạng: không có ruleKey để gắn kết luận vào, nên
 * kết quả là một ghi chú + cờ nghi ngờ, KHÔNG PHẢI confirmed/refuted/unverified — hai khái
 * niệm đó chỉ có nghĩa khi có một kết luận SẴN CÓ để đối chiếu.
 */
export interface CaseLens {
  readonly name: string;
  review(ctx: InvestigationContext, verdict: Verdict, toolCalls: ToolCall[]): Promise<CaseLensNote>;
}

/**
 * Một lăng kính hỏng (model chết, JSON sai khuôn) → `suspected: false`, KHÔNG chặn lượt chấm.
 * Bất đối xứng ngược với per-error: ở đây "không đọc được" phải là AN TOÀN NHẤT — một ghi chú
 * bịa ra ("suspected: true") từ một lăng kính hỏng sẽ đẩy oan một bài đúng về giảng viên.
 */
export async function runCaseLens(
  ctx: InvestigationContext,
  verdict: Verdict,
  toolCalls: ToolCall[],
  lens: CaseLens,
): Promise<CaseLensNote> {
  try {
    return await lens.review(ctx, verdict, toolCalls);
  } catch {
    return { lens: lens.name, suspected: false, note: 'không đọc được ý kiến của lăng kính này' };
  }
}
```

- [ ] **Step 3: Viết test cho `runCaseLens()`**

```ts
// apps/api/src/grading/investigator/case-lens.spec.ts
import { CaseLens, runCaseLens } from './case-lens';
import { CTX } from './testing/context';

const VERDICT = { errors: [], missingRules: [], injectionAttempt: { detected: false, excerpt: null } };

describe('runCaseLens()', () => {
  it('lăng kính trả lời bình thường → giữ nguyên ghi chú', async () => {
    const lens: CaseLens = { name: 'bo_sot', async review() { return { lens: 'bo_sot', suspected: true, note: 'nghi thiếu ca biên' }; } };
    const r = await runCaseLens(CTX, VERDICT, [], lens);
    expect(r).toEqual({ lens: 'bo_sot', suspected: true, note: 'nghi thiếu ca biên' });
  });

  it('lăng kính ném lỗi → suspected:false, KHÔNG bịa ra nghi ngờ (bất đối xứng ngược §6.2)', async () => {
    const lens: CaseLens = { name: 'gian_lan', async review() { throw new Error('model chết'); } };
    const r = await runCaseLens(CTX, VERDICT, [], lens);
    expect(r.suspected).toBe(false);
  });
});
```

- [ ] **Step 4: Chạy test, xác nhận xanh**

Run: `cd apps/api && npx jest src/grading/investigator/case-lens.spec.ts`
Expected: PASS, 2/2.

- [ ] **Step 5: Viết `lens-protocol.ts` — JSON schema + zod cho vòng lặp nhỏ**

```ts
import { z } from 'zod';
import { SYSTEM_DELIMITER_RULE } from '../harness/submission-envelope';
import { TOOL_NAMES } from './types';

/** Cùng bốn công cụ của đường điều tra lớn (§6 ràng buộc 2) — lăng kính không có công cụ riêng
 *  NGOÀI bốn cái này (probe/ast_query/compare_peers là bước 5, chưa tồn tại). */
const nullableString = { anyOf: [{ type: 'string' }, { type: 'null' }] };
const nullableInteger = { anyOf: [{ type: 'integer' }, { type: 'null' }] };

const CALL_PROPERTIES = {
  tool: { type: 'string', enum: [...TOOL_NAMES] },
  input: nullableString,
  group: nullableString,
  path: nullableString,
  fromLine: nullableInteger,
  toLine: nullableInteger,
};

const callSchema = z
  .object({
    tool: z.enum(TOOL_NAMES),
    input: z.string().nullish(),
    group: z.string().nullish(),
    path: z.string().nullish(),
    fromLine: z.number().int().nullish(),
    toLine: z.number().int().nullish(),
  })
  .transform((c) => ({
    tool: c.tool,
    input: c.input ?? null,
    group: c.group ?? null,
    path: c.path ?? null,
    fromLine: c.fromLine ?? null,
    toLine: c.toLine ?? null,
  }));

export type LensCall = z.infer<typeof callSchema>;

/** Tham số chuẩn hoá theo công cụ — bản riêng của lens (protocol.ts không export bản của nó). */
export function lensArgsFor(call: LensCall): Record<string, unknown> {
  switch (call.tool) {
    case 'run':
      return { input: call.input };
    case 'run_tests':
      return { group: call.group };
    case 'read_file':
      return { path: call.path, fromLine: call.fromLine, toLine: call.toLine };
    case 'list_files':
      return {};
  }
}

const REVIEW_JSON_SCHEMA_BASE = {
  action: { type: 'string', enum: ['call', 'final'] },
  calls: {
    type: 'array',
    items: { type: 'object', additionalProperties: false, required: Object.keys(CALL_PROPERTIES), properties: CALL_PROPERTIES },
  },
};

/** Lăng kính PER-ERROR (Tính đúng, Quá tay) — kết luận là confirmed/refuted + bằng chứng. */
export const PER_ERROR_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['action', 'calls', 'conclusion'],
  properties: {
    ...REVIEW_JSON_SCHEMA_BASE,
    conclusion: {
      anyOf: [
        { type: 'null' },
        {
          type: 'object',
          additionalProperties: false,
          required: ['status', 'toolCallIds'],
          properties: {
            status: { type: 'string', enum: ['confirmed', 'refuted'] },
            toolCallIds: { type: 'array', items: { type: 'string' } },
          },
        },
      ],
    },
  },
};

const perErrorConclusion = z.object({
  status: z.enum(['confirmed', 'refuted']),
  toolCallIds: z.array(z.string().max(32)).max(25),
});
const perErrorReplySchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('call'), calls: z.array(callSchema).min(1), conclusion: z.null() }),
  z.object({ action: z.literal('final'), calls: z.array(z.unknown()), conclusion: perErrorConclusion }),
]);
export type PerErrorReply = z.infer<typeof perErrorReplySchema>;

/** Qua bộ đọc §5.2 rồi zod — cùng khuôn `parseReply()` của protocol.ts, bản cho lens. */
export function parsePerErrorReply(content: string): PerErrorReply | null {
  const parsed = perErrorReplySchema.safeParse(safeJson(content));
  return parsed.success ? parsed.data : null;
}

/** Lăng kính CẤP BÀI (Bỏ sót, Gian lận) — kết luận là một ghi chú + cờ nghi ngờ. */
export const CASE_LENS_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['action', 'calls', 'conclusion'],
  properties: {
    ...REVIEW_JSON_SCHEMA_BASE,
    conclusion: {
      anyOf: [
        { type: 'null' },
        {
          type: 'object',
          additionalProperties: false,
          required: ['suspected', 'note'],
          properties: { suspected: { type: 'boolean' }, note: { type: 'string' } },
        },
      ],
    },
  },
};

const caseLensConclusion = z.object({ suspected: z.boolean(), note: z.string().max(500) });
const caseLensReplySchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('call'), calls: z.array(callSchema).min(1), conclusion: z.null() }),
  z.object({ action: z.literal('final'), calls: z.array(z.unknown()), conclusion: caseLensConclusion }),
]);
export type CaseLensReply = z.infer<typeof caseLensReplySchema>;

export function parseCaseLensReply(content: string): CaseLensReply | null {
  const parsed = caseLensReplySchema.safeParse(safeJson(content));
  return parsed.success ? parsed.data : null;
}

/** Model đôi khi bọc JSON trong ```json …``` dù được dặn không làm vậy — cắt vỏ trước khi parse. */
function safeJson(content: string): unknown {
  const trimmed = content.trim().replace(/^```json\s*/i, '').replace(/```$/, '');
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

export const LENS_SYSTEM_DELIMITER = SYSTEM_DELIMITER_RULE;
```

- [ ] **Step 6: Viết `lens-loop.ts` — vòng lặp gọi-công-cụ nhỏ, dùng chung cho cả bốn lăng kính**

```ts
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
```

- [ ] **Step 7: Viết test cho `runLensLoop()` bằng một schema kịch bản tối giản**

```ts
// apps/api/src/grading/investigator/lens-loop.spec.ts
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
```

- [ ] **Step 8: Chạy toàn bộ test của Task 1, xác nhận xanh**

Run: `cd apps/api && npx jest src/grading/investigator/lens-loop.spec.ts src/grading/investigator/case-lens.spec.ts -v`
Expected: PASS, 5/5.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/grading/investigator/challenge.ts apps/api/src/grading/investigator/case-lens.ts apps/api/src/grading/investigator/case-lens.spec.ts apps/api/src/grading/investigator/lens-protocol.ts apps/api/src/grading/investigator/lens-loop.ts apps/api/src/grading/investigator/lens-loop.spec.ts
git commit -m "feat(investigator): hạ tầng lăng kính dùng chung (bước 6)"
```

---

### Task 2: Lăng kính "Tính đúng" (correctness)

**Files:**
- Create: `apps/api/src/grading/investigator/lenses/correctness-lens.ts`
- Test: `apps/api/src/grading/investigator/lenses/correctness-lens.spec.ts`

**Interfaces:**
- Consumes: `Challenger`, `ChallengeInput` (`../challenge`); `runLensLoop`, `LensDeps` (`../lens-loop`); `parsePerErrorReply`, `PER_ERROR_JSON_SCHEMA`, `lensArgsFor` (`../lens-protocol`).
- Produces: `CorrectnessLens` (class implementing `Challenger`) — Task 6 khởi tạo và đưa vào `InvestigatorDeps.challengers[0]`.

- [ ] **Step 1: Viết test trước — lỗi có bằng chứng thật thì `confirmed`**

```ts
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
    const model = scripted([JSON.stringify({ action: 'final', calls: [], conclusion: { status: 'confirmed', toolCallIds: ['lens-tc-1'] } })]);
    const lens = new CorrectnessLens({ models: [model], sandbox: passNone() });
    const r = await lens.review({ error: { ruleKey: 'sai_ca_co_ban', toolCallIds: ['tc-1'] }, ctx: CTX, evidence: [EVIDENCE] });
    expect(r.status).toBe('confirmed');
  });

  it('mọi bậc model hỏng → unverified, KHÔNG refuted (§6.2)', async () => {
    const dead: ModelTier = { label: 'A', model: 'A-m', ceiling: 0.5, async call() { throw Object.assign(new Error('500'), { status: 500 }); } };
    const lens = new CorrectnessLens({ models: [dead], sandbox: passNone() });
    const r = await lens.review({ error: { ruleKey: 'sai_ca_co_ban', toolCallIds: ['tc-1'] }, ctx: CTX, evidence: [EVIDENCE] });
    expect(r.status).toBe('unverified');
  });

  it('toolCallIds trả về chỉ gồm mã CỦA LƯỢT REVIEW này, không phải mã tc-1 của agent chấm', async () => {
    const model = scripted([JSON.stringify({ action: 'final', calls: [], conclusion: { status: 'confirmed', toolCallIds: ['tc-1', 'lens-tc-1'] } })]);
    const lens = new CorrectnessLens({ models: [model], sandbox: passNone() });
    const r = await lens.review({ error: { ruleKey: 'sai_ca_co_ban', toolCallIds: ['tc-1'] }, ctx: CTX, evidence: [EVIDENCE] });
    expect(r.toolCallIds).not.toContain('tc-1');
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận FAIL** (module chưa tồn tại)

Run: `cd apps/api && npx jest src/grading/investigator/lenses/correctness-lens.spec.ts`
Expected: FAIL — `Cannot find module './correctness-lens'`.

- [ ] **Step 3: Viết `correctness-lens.ts`**

```ts
import { ChallengeInput, Challenger } from '../challenge';
import { LensDeps, runLensLoop } from '../lens-loop';
import { lensArgsFor, parsePerErrorReply } from '../lens-protocol';
import { CHALLENGER_FRAME } from './frame';

const SYSTEM_PROMPT = [
  'Bạn là lăng kính "Tính đúng" của một hệ thống phản biện việc chấm bài lập trình.',
  CHALLENGER_FRAME,
  '',
  'Bạn nhận một LỖI đã được agent chấm chẩn đoán (rule_key), CÙNG bảng lỗi và đề bài trong',
  'workspace — nhưng KHÔNG nhận lý lẽ agent chấm đã dùng. Việc của bạn: tự gọi lại công cụ',
  '(run, run_tests, read_file, list_files) để kiểm xem lỗi đó CÓ THẬT không.',
  '',
  'Trả JSON: {"action":"call","calls":[...]," conclusion":null} khi cần gọi thêm công cụ, hoặc',
  '{"action":"final","calls":[],"conclusion":{"status":"confirmed"|"refuted","toolCallIds":["lens-tc-N"]}}',
  'khi đã đủ căn cứ. "refuted" nghĩa là bạn CHẠY THỬ và thấy lỗi đó không đúng như mô tả —',
  'không phải "tôi nghĩ có thể sai". toolCallIds phải là mã lens-tc-N của LƯỢT NÀY.',
].join('\n');

/** "Tính đúng" (§6.1): lỗi đã chẩn đoán có thật không, chứng minh bằng một lần chạy. */
export class CorrectnessLens implements Challenger {
  readonly name = 'tinh_dung';
  constructor(private readonly deps: LensDeps) {}

  async review(input: ChallengeInput): Promise<{ status: 'confirmed' | 'refuted'; toolCallIds: string[] }> {
    const userMessage = [
      `Luật bị chẩn đoán: ${input.error.ruleKey}`,
      `Mã bằng chứng gốc của agent chấm (đọc để biết công cụ nào từng chạy, KHÔNG được trích lại): ${input.error.toolCallIds.join(', ') || '(không có)'}`,
      'Hãy tự kiểm bằng công cụ của chính bạn.',
    ].join('\n');
    const r = await runLensLoop(
      input.ctx,
      SYSTEM_PROMPT,
      userMessage,
      parsePerErrorReply,
      lensArgsFor as never,
      (reply) => (reply.action === 'final' ? reply.conclusion : null),
      this.deps,
    );
    if (!r.conclusion) return { status: 'unverified' as never, toolCallIds: [] };
    const okIds = new Set(r.toolCalls.filter((t) => t.status === 'ok').map((t) => t.id));
    return { status: r.conclusion.status, toolCallIds: r.conclusion.toolCallIds.filter((id) => okIds.has(id)) };
  }
}
```

Chú ý: `review()` trả `status: 'unverified'` khi `conclusion` null — kiểu khai báo của `Challenger.review()` (đã có ở `challenge.ts`) chỉ ghi `'confirmed' | 'refuted'`, nhưng `challenge()` tự bọc lỗi ném ra thành `unverified` (xem `challenge.ts` dòng 43-50, khối `catch`). Để dùng đúng đường đó, `CorrectnessLens.review()` phải **ném lỗi** khi không xác nhận được, không trả `status: 'unverified'` trực tiếp (kiểu không cho phép). Sửa lại:

```ts
    if (!r.conclusion) throw new Error('lăng kính Tính đúng không kết luận được (hết bậc model hoặc cạn ngân sách)');
```

thay cho dòng `if (!r.conclusion) return { status: 'unverified' as never, toolCallIds: [] };` ở trên — `challenge()` đã có sẵn khối `try/catch` biến MỌI lỗi ném ra từ `challenger.review()` thành `unverified` (đúng test `challenge.spec.ts` dòng 37-41 đã khoá).

- [ ] **Step 4: Tạo `frame.ts` dùng chung cho bốn lăng kính**

```ts
// apps/api/src/grading/investigator/lenses/frame.ts
/** Khung mở đầu chung cho BỐN lăng kính (§6.1) — giữ một chỗ, sửa một lần. */
export const CHALLENGER_FRAME = [
  'Bạn đang xem một bài bạn KHÔNG chấm, và không có lợi ích gì trong việc một kết luận nào đó đúng.',
  'Việc của bạn là BÁC BỎ nếu bác bỏ được — không phải chấm điểm bài này lần nữa.',
  'Một khẳng định mà lẽ ra bạn kiểm được bằng cách CHẠY THỬ mà không chạy thì không được tính là đã kiểm.',
].join(' ');
```

- [ ] **Step 5: Sửa lại `correctness-lens.ts` theo đúng chú ý ở Step 3, chạy test, xác nhận xanh**

Run: `cd apps/api && npx jest src/grading/investigator/lenses/correctness-lens.spec.ts -v`
Expected: PASS, 3/3.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/grading/investigator/lenses/
git commit -m "feat(investigator): lăng kính Tính đúng (Challenger đầu tiên)"
```

---

### Task 3: Lăng kính "Quá tay" (severity)

**Files:**
- Create: `apps/api/src/grading/investigator/lenses/severity-lens.ts`
- Test: `apps/api/src/grading/investigator/lenses/severity-lens.spec.ts`

**Interfaces:**
- Consumes: giống Task 2 (`Challenger`, `runLensLoop`, `lens-protocol`, `CHALLENGER_FRAME`).
- Produces: `SeverityLens` — `InvestigatorDeps.challengers[1]` (Task 6).

- [ ] **Step 1: Viết test — cùng khuôn Task 2, đổi tên lớp và một câu prompt**

```ts
// apps/api/src/grading/investigator/lenses/severity-lens.spec.ts
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
```

- [ ] **Step 2: Chạy test, xác nhận FAIL**

- [ ] **Step 3: Viết `severity-lens.ts`** — sao y `correctness-lens.ts` (đã sửa theo Step 3/Task 2), đổi `name` và `SYSTEM_PROMPT`:

```ts
import { ChallengeInput, Challenger } from '../challenge';
import { LensDeps, runLensLoop } from '../lens-loop';
import { lensArgsFor, parsePerErrorReply } from '../lens-protocol';
import { CHALLENGER_FRAME } from './frame';

const SYSTEM_PROMPT = [
  'Bạn là lăng kính "Quá tay" của một hệ thống phản biện việc chấm bài lập trình.',
  CHALLENGER_FRAME,
  '',
  'Bạn KHÔNG thấy mức trừ bằng số của luật (bảng lỗi không lộ giá cho agent). Việc của bạn:',
  'đọc mô tả luật trong bang-loi.md và bằng chứng agent chấm đã trích, rồi tự hỏi — bằng chứng',
  'đó có thực sự khớp NGHIÊM TÚC với những gì luật mô tả, hay chỉ là một kỹ thuật nhỏ, biên,',
  'không đáng bị gán cho một luật nặng như vậy? "refuted" nghĩa là bạn cho rằng luật bị áp',
  'QUÁ TAY so với bằng chứng thật — không phải "tôi thấy lỗi này nhẹ".',
  '',
  'Trả JSON: {"action":"call","calls":[...],"conclusion":null} khi cần gọi thêm công cụ, hoặc',
  '{"action":"final","calls":[],"conclusion":{"status":"confirmed"|"refuted","toolCallIds":["lens-tc-N"]}}',
  'khi đã đủ căn cứ.',
].join('\n');

/** "Quá tay" (§6.1): mức trừ đã áp có nặng hơn bằng chứng thật sự cho phép không — đo bằng
 *  LỜI (mô tả luật), không bằng SỐ (deductionHundredths không lộ cho model, §2.1). */
export class SeverityLens implements Challenger {
  readonly name = 'qua_tay';
  constructor(private readonly deps: LensDeps) {}

  async review(input: ChallengeInput): Promise<{ status: 'confirmed' | 'refuted'; toolCallIds: string[] }> {
    const userMessage = [
      `Luật bị chẩn đoán: ${input.error.ruleKey}`,
      `Mã bằng chứng gốc (chỉ để biết công cụ nào từng chạy): ${input.error.toolCallIds.join(', ') || '(không có)'}`,
      'Đọc bang-loi.md để biết mô tả luật, rồi tự kiểm bằng công cụ của chính bạn.',
    ].join('\n');
    const r = await runLensLoop(
      input.ctx, SYSTEM_PROMPT, userMessage, parsePerErrorReply, lensArgsFor as never,
      (reply) => (reply.action === 'final' ? reply.conclusion : null), this.deps,
    );
    if (!r.conclusion) throw new Error('lăng kính Quá tay không kết luận được (hết bậc model hoặc cạn ngân sách)');
    const okIds = new Set(r.toolCalls.filter((t) => t.status === 'ok').map((t) => t.id));
    return { status: r.conclusion.status, toolCallIds: r.conclusion.toolCallIds.filter((id) => okIds.has(id)) };
  }
}
```

- [ ] **Step 4: Chạy test, xác nhận xanh**

Run: `cd apps/api && npx jest src/grading/investigator/lenses/severity-lens.spec.ts -v`
Expected: PASS, 2/2.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/grading/investigator/lenses/severity-lens.ts apps/api/src/grading/investigator/lenses/severity-lens.spec.ts
git commit -m "feat(investigator): lăng kính Quá tay"
```

---

### Task 4: Lăng kính "Bỏ sót" (omission)

**Files:**
- Create: `apps/api/src/grading/investigator/lenses/omission-lens.ts`
- Test: `apps/api/src/grading/investigator/lenses/omission-lens.spec.ts`

**Interfaces:**
- Consumes: `CaseLens` (`../case-lens`); `runLensLoop`, `LensDeps` (`../lens-loop`); `parseCaseLensReply`, `lensArgsFor` (`../lens-protocol`); `CHALLENGER_FRAME` (`./frame`).
- Produces: `OmissionLens` — `InvestigatorDeps.caseLenses[0]` (Task 6).

- [ ] **Step 1: Viết test trước**

```ts
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

describe('OmissionLens', () => {
  it('phát hiện khả năng thiếu ca biên agent chấm chưa xét → suspected true, có ghi chú', async () => {
    const model = scripted([JSON.stringify({ action: 'final', calls: [], conclusion: { suspected: true, note: 'chưa thấy ca n=0 được chạy' } })]);
    const lens = new OmissionLens({ models: [model], sandbox: fakeSandbox(() => execResult([])) });
    const r = await lens.review(CTX, VERDICT, []);
    expect(r).toEqual({ lens: 'bo_sot', suspected: true, note: 'chưa thấy ca n=0 được chạy' });
  });

  it('không thấy gì bất thường → suspected false', async () => {
    const model = scripted([JSON.stringify({ action: 'final', calls: [], conclusion: { suspected: false, note: 'đã chạy đủ, không thấy thiếu' } })]);
    const lens = new OmissionLens({ models: [model], sandbox: fakeSandbox(() => execResult([])) });
    const r = await lens.review(CTX, VERDICT, []);
    expect(r.suspected).toBe(false);
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận FAIL**

- [ ] **Step 3: Viết `omission-lens.ts`**

```ts
import { CaseLens } from '../case-lens';
import { CaseLensNote } from '../challenge';
import { LensDeps, runLensLoop } from '../lens-loop';
import { lensArgsFor, parseCaseLensReply } from '../lens-protocol';
import { InvestigationContext, ToolCall, Verdict } from '../types';
import { CHALLENGER_FRAME } from './frame';

const SYSTEM_PROMPT = [
  'Bạn là lăng kính "Bỏ sót" của một hệ thống phản biện việc chấm bài lập trình.',
  CHALLENGER_FRAME,
  '',
  'Bạn nhận đề bài, bảng lỗi, và KẾT LUẬN CUỐI của agent chấm (danh sách lỗi nó đã tìm — không',
  'phải lý lẽ của nó). Việc của bạn: tự gọi công cụ để tìm xem có lỗi nào agent chấm KHÔNG THẤY',
  'mà bằng chứng thật sự lộ ra không — ví dụ một ca biên, một điều kiện trong đề chưa được',
  'kiểm bằng run/run_tests nào.',
  '',
  'Trả JSON: {"action":"call","calls":[...],"conclusion":null} khi cần gọi thêm công cụ, hoặc',
  '{"action":"final","calls":[],"conclusion":{"suspected":true|false,"note":"…"}}. suspected=true',
  'CHỈ khi bạn đã tự chạy và thấy bằng chứng cụ thể — không phải cảm giác "có thể còn thiếu".',
].join('\n');

/** "Bỏ sót" (§6.1): có lỗi nào agent chấm không thấy mà phép dò khác lộ ra không. */
export class OmissionLens implements CaseLens {
  readonly name = 'bo_sot';
  constructor(private readonly deps: LensDeps) {}

  async review(ctx: InvestigationContext, verdict: Verdict, _toolCalls: ToolCall[]): Promise<CaseLensNote> {
    const userMessage = [
      `Lỗi agent chấm đã kết luận: ${verdict.errors.map((e) => e.ruleKey).join(', ') || '(không có — bài được coi là đúng)'}`,
      'Tự kiểm bằng công cụ của chính bạn xem còn gì agent chấm bỏ sót không.',
    ].join('\n');
    const r = await runLensLoop(
      ctx, SYSTEM_PROMPT, userMessage, parseCaseLensReply, lensArgsFor as never,
      (reply) => (reply.action === 'final' ? reply.conclusion : null), this.deps,
    );
    if (!r.conclusion) return { lens: this.name, suspected: false, note: 'không kết luận được (hết bậc model hoặc cạn ngân sách)' };
    return { lens: this.name, ...r.conclusion };
  }
}
```

- [ ] **Step 4: Chạy test, xác nhận xanh**

Run: `cd apps/api && npx jest src/grading/investigator/lenses/omission-lens.spec.ts -v`
Expected: PASS, 2/2.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/grading/investigator/lenses/omission-lens.ts apps/api/src/grading/investigator/lenses/omission-lens.spec.ts
git commit -m "feat(investigator): lăng kính Bỏ sót (CaseLens đầu tiên)"
```

---

### Task 5: Lăng kính "Gian lận" (cheating)

**Files:**
- Create: `apps/api/src/grading/investigator/lenses/cheating-lens.ts`
- Test: `apps/api/src/grading/investigator/lenses/cheating-lens.spec.ts`

**Interfaces:**
- Consumes: giống Task 4.
- Produces: `CheatingLens` — `InvestigatorDeps.caseLenses[1]` (Task 6).

- [ ] **Step 1: Viết test trước** (sao y Task 4, đổi lớp/prompt)

```ts
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

describe('CheatingLens', () => {
  it('bài đạt mọi test nhưng nghi hard-code theo input cụ thể → suspected true', async () => {
    const model = scripted([JSON.stringify({ action: 'final', calls: [], conclusion: { suspected: true, note: 'đổi input thì chương trình vẫn in y hệt kết quả cũ' } })]);
    const lens = new CheatingLens({ models: [model], sandbox: fakeSandbox(() => execResult([])) });
    const r = await lens.review(CTX, VERDICT, []);
    expect(r.suspected).toBe(true);
  });

  it('mọi bậc model hỏng → suspected false, không bịa nghi ngờ', async () => {
    const dead: ModelTier = { label: 'A', model: 'A-m', ceiling: 0.5, async call() { throw Object.assign(new Error('500'), { status: 500 }); } };
    const lens = new CheatingLens({ models: [dead], sandbox: fakeSandbox(() => execResult([])) });
    const r = await lens.review(CTX, VERDICT, []);
    expect(r.suspected).toBe(false);
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận FAIL**

- [ ] **Step 3: Viết `cheating-lens.ts`**

```ts
import { CaseLens } from '../case-lens';
import { CaseLensNote } from '../challenge';
import { LensDeps, runLensLoop } from '../lens-loop';
import { lensArgsFor, parseCaseLensReply } from '../lens-protocol';
import { InvestigationContext, ToolCall, Verdict } from '../types';
import { CHALLENGER_FRAME } from './frame';

const SYSTEM_PROMPT = [
  'Bạn là lăng kính "Gian lận" của một hệ thống phản biện việc chấm bài lập trình.',
  CHALLENGER_FRAME,
  '',
  'Việc của bạn: dùng run(input) với những input KHÁC bộ test đã cho (§6 ràng buộc 2 — bạn',
  'được tự chọn input của riêng mình) để kiểm xem chương trình có thực sự GIẢI ĐÚNG bài toán,',
  'hay chỉ khớp vì hard-code theo đúng input/output của bộ test, hay dò output cố định bất kể',
  'đầu vào. Một chương trình đúng phải cho kết quả khác nhau với input khác nhau một cách hợp lý.',
  '',
  'Trả JSON: {"action":"call","calls":[...],"conclusion":null} khi cần gọi thêm công cụ, hoặc',
  '{"action":"final","calls":[],"conclusion":{"suspected":true|false,"note":"…"}}. suspected=true',
  'CHỈ khi bạn đã TỰ CHẠY với input tự chọn và thấy bằng chứng cụ thể của việc hard-code.',
].join('\n');

/** "Gian lận" (§6.1): kết quả đúng có đến từ hard-code hay dò theo bộ test không. */
export class CheatingLens implements CaseLens {
  readonly name = 'gian_lan';
  constructor(private readonly deps: LensDeps) {}

  async review(ctx: InvestigationContext, verdict: Verdict, _toolCalls: ToolCall[]): Promise<CaseLensNote> {
    const userMessage = [
      `Lỗi agent chấm đã kết luận: ${verdict.errors.map((e) => e.ruleKey).join(', ') || '(không có — bài được coi là đúng mọi test)'}`,
      'Tự chọn input riêng (khác goi-test.md) và gọi run() để kiểm gian lận.',
    ].join('\n');
    const r = await runLensLoop(
      ctx, SYSTEM_PROMPT, userMessage, parseCaseLensReply, lensArgsFor as never,
      (reply) => (reply.action === 'final' ? reply.conclusion : null), this.deps,
    );
    if (!r.conclusion) return { lens: this.name, suspected: false, note: 'không kết luận được (hết bậc model hoặc cạn ngân sách)' };
    return { lens: this.name, ...r.conclusion };
  }
}
```

- [ ] **Step 4: Chạy test, xác nhận xanh**

Run: `cd apps/api && npx jest src/grading/investigator/lenses/cheating-lens.spec.ts -v`
Expected: PASS, 2/2.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/grading/investigator/lenses/cheating-lens.ts apps/api/src/grading/investigator/lenses/cheating-lens.spec.ts
git commit -m "feat(investigator): lăng kính Gian lận"
```

---

### Task 6: Cảnh báo cùng họ model + nối bốn lăng kính vào `InvestigatorDeps`/pipeline

**Files:**
- Create: `apps/api/src/grading/investigator/model-family.ts`
- Test: `apps/api/src/grading/investigator/model-family.spec.ts`
- Modify: `apps/api/src/grading/pipeline/investigator-deps.ts`
- Test: `apps/api/src/grading/pipeline/investigator-deps.spec.ts` (mở rộng file đã có)
- Modify: `apps/api/src/grading/pipeline/investigator-run.service.ts`
- Modify: `apps/api/src/grading/scoring/stored-investigation.ts`

**Interfaces:**
- Consumes: `CorrectnessLens`, `SeverityLens`, `OmissionLens`, `CheatingLens` (Task 2-5); `buildInvestigatorTiers` (`../investigator/model-pool`); `challenge()` (`../investigator/challenge`); `runCaseLens()` (`../investigator/case-lens`).
- Produces: `InvestigatorDeps.challengers: Challenger[]`, `InvestigatorDeps.caseLenses: CaseLens[]` — Task 8 (score-core.ts) và Task 9 (result-detail.ts) đọc `stored.challenge` mà việc này ghi ra.

- [ ] **Step 1: Viết test cho `familyOf()`/`warnIfSameFamily()`**

```ts
// apps/api/src/grading/investigator/model-family.spec.ts
import { familyOf, warnIfSameFamily } from './model-family';

describe('familyOf()', () => {
  it('bỏ tiền tố nhà cung cấp và hậu tố biến thể', () => {
    expect(familyOf('cnb/glm-5.3')).toBe('glm-5.3');
    expect(familyOf('spd/glm-5.3-flash')).toBe('glm-5.3');
    expect(familyOf('claude-sonnet-5')).toBe('claude-sonnet-5');
  });
});

describe('warnIfSameFamily()', () => {
  it('bậc chấm và bậc phản biện cùng họ → gọi log cảnh báo', () => {
    const log = jest.fn();
    warnIfSameFamily(['cnb/glm-5.3'], ['spd/glm-5.3-flash'], log);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('cùng họ'));
  });

  it('khác họ → không log', () => {
    const log = jest.fn();
    warnIfSameFamily(['claude-sonnet-5'], ['spd/glm-5.3-flash'], log);
    expect(log).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận FAIL**

- [ ] **Step 3: Viết `model-family.ts`**

```ts
import { Logger } from '@nestjs/common';

/**
 * Suy "họ" model từ id — heuristic, không phải khoá học thuật: bỏ tiền tố nhà cung cấp
 * (`vendor/`) và hậu tố biến thể phổ biến (`-flash`, `-mini`, `-lite`, `-turbo`). Đủ để bắt
 * đúng ca thật của đồ án (`cnb/glm-5.3` và `spd/glm-5.3-flash` là hai bậc CÙNG HỌ glm-5.3) mà
 * không cần một bảng ánh xạ nhà cung cấp đầy đủ.
 */
export function familyOf(model: string): string {
  const afterSlash = model.includes('/') ? model.slice(model.lastIndexOf('/') + 1) : model;
  return afterSlash.replace(/-(flash|mini|lite|turbo)$/i, '');
}

/**
 * §6.3: "phải là cảnh báo lúc KHỞI ĐỘNG, không phải một dòng cuối báo cáo" — gọi đúng một lần
 * lúc dựng `InvestigatorDeps`, không lặp lại mỗi bài.
 */
export function warnIfSameFamily(
  graderModels: string[],
  challengerModels: string[],
  log: (message: string) => void = (m) => new Logger('ChallengeLenses').warn(m),
): void {
  const graderFamilies = new Set(graderModels.map(familyOf));
  const overlap = challengerModels.map(familyOf).filter((f) => graderFamilies.has(f));
  if (overlap.length > 0) {
    log(
      `Bậc chấm và bậc phản biện cùng họ model (${[...new Set(overlap)].join(', ')}) — ` +
        'phép phản biện ở cấu hình này chỉ đo được NHIỄU, không đo được THIÊN LỆCH (§6.3). ' +
        'Ghi rõ điều này khi báo cáo kết quả phản biện.',
    );
  }
}
```

- [ ] **Step 4: Chạy test, xác nhận xanh**

Run: `cd apps/api && npx jest src/grading/investigator/model-family.spec.ts -v`
Expected: PASS, 3/3.

- [ ] **Step 5: Mở rộng `investigator-deps.spec.ts` — test TRƯỚC khi sửa `investigator-deps.ts`**

Đọc file hiện có trước khi sửa (`apps/api/src/grading/pipeline/investigator-deps.spec.ts`) — nó có 3 test đã khoá (`sandbox: null` khi thiếu `SANDBOX_REDIS_URL`, dựng client đúng url/prefix, `SANDBOX_PREFIX` rỗng → undefined). Thêm test mới, KHÔNG xoá test cũ:

```ts
it('luôn dựng đủ 2 Challenger + 2 CaseLens, kể cả khi GRADING_TIER* trống (models rỗng)', () => {
  const deps = buildInvestigatorDeps({}, { tiers: () => [], sandbox: sandbox as never });
  expect(deps.challengers).toHaveLength(2);
  expect(deps.caseLenses).toHaveLength(2);
  expect(deps.challengers.map((c) => c.name)).toEqual(['tinh_dung', 'qua_tay']);
  expect(deps.caseLenses.map((c) => c.name)).toEqual(['bo_sot', 'gian_lan']);
});

it('bậc chấm và bậc phản biện cùng một danh sách model (tái dùng GRADING_TIER*) → cảnh báo cùng họ nếu trùng', () => {
  const log = jest.fn();
  buildInvestigatorDeps(
    { SANDBOX_REDIS_URL: 'redis://x' },
    { tiers: () => [{ label: 'A', model: 'cnb/glm-5.3', ceiling: 1, call: jest.fn() }], sandbox: sandbox as never },
    log,
  );
  expect(log).toHaveBeenCalledWith(expect.stringContaining('cùng họ'));
});
```

(`sandbox` ở đây là mock `jest.fn()` đã có sẵn trong file — giữ nguyên cách dựng của test cũ trong file, chỉ thêm hai `it` này vào cuối `describe` đã có.)

- [ ] **Step 6: Chạy test, xác nhận FAIL** (field `challengers`/`caseLenses` chưa tồn tại trên `InvestigatorDeps`)

- [ ] **Step 7: Sửa `investigator-deps.ts`**

```ts
import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { createSandboxClient } from '../../sandbox/sandbox.client';
import { CaseLens } from '../investigator/case-lens';
import { Challenger } from '../investigator/challenge';
import { CheatingLens } from '../investigator/lenses/cheating-lens';
import { CorrectnessLens } from '../investigator/lenses/correctness-lens';
import { OmissionLens } from '../investigator/lenses/omission-lens';
import { SeverityLens } from '../investigator/lenses/severity-lens';
import { warnIfSameFamily } from '../investigator/model-family';
import { buildInvestigatorTiers, ModelTier } from '../investigator/model-pool';
import type { SandboxPort } from '../investigator/tools';

export const INVESTIGATOR_DEPS = Symbol('INVESTIGATOR_DEPS');

export interface InvestigatorDeps {
  models: ModelTier[];
  sandbox: SandboxPort | null;
  /** Task 2-3 — nối §6.2 vào điểm. Rỗng CHỈ KHI `sandbox` cũng null (chưa cấu hình gì). */
  challengers: Challenger[];
  /** Task 4-5 — chỉ gắn caseFlag, không đổi điểm. */
  caseLenses: CaseLens[];
  ceilingOf(model: string): number;
  close(): Promise<void>;
}

const UNKNOWN_MODEL_CEILING = 0.5;

export function buildInvestigatorDeps(
  env: NodeJS.ProcessEnv,
  factories: {
    tiers: () => ModelTier[];
    sandbox: typeof createSandboxClient;
  } = { tiers: buildInvestigatorTiers, sandbox: createSandboxClient },
  log: (line: string) => void = (line) => new Logger('InvestigatorDeps').warn(line),
): InvestigatorDeps {
  const models = factories.tiers();
  const ceilings = new Map(models.map((m) => [m.model, m.ceiling]));
  const url = env.SANDBOX_REDIS_URL?.trim();
  const built = url ? factories.sandbox({ redisUrl: url, prefix: env.SANDBOX_PREFIX?.trim() || undefined, log }) : null;
  const sandbox = built?.client ?? null;

  // Lăng kính TÁI DÙNG chính bậc model của đường chấm (cùng lý do Advocate cũ đã làm ở
  // `grading.module.ts`: một họ model thứ hai chỉ để phản biện là một `.env` khác, một cảnh
  // báo cùng họ khác — không đáng cho một demo). Warning §6.3 CHỦ ĐỘNG bắt đúng ca này.
  warnIfSameFamily(models.map((m) => m.model), models.map((m) => m.model), log);
  const lensDeps = { models, sandbox: sandbox as never };
  const challengers: Challenger[] = sandbox
    ? [new CorrectnessLens(lensDeps), new SeverityLens(lensDeps)]
    : [];
  const caseLenses: CaseLens[] = sandbox
    ? [new OmissionLens(lensDeps), new CheatingLens(lensDeps)]
    : [];

  return {
    models,
    sandbox,
    challengers,
    caseLenses,
    ceilingOf: (model) => ceilings.get(model) ?? UNKNOWN_MODEL_CEILING,
    close: async () => {
      await built?.close();
    },
  };
}

@Injectable()
export class InvestigatorDepsLifecycle implements OnModuleDestroy {
  constructor(@Inject(INVESTIGATOR_DEPS) private readonly deps: InvestigatorDeps) {}

  async onModuleDestroy(): Promise<void> {
    await this.deps.close();
  }
}
```

Chú ý về test Step 5 dòng đầu ("kể cả khi GRADING_TIER* trống"): với `sandbox` KHÔNG null nhưng `models: []`, `challengers`/`caseLenses` vẫn được dựng đủ 4 lăng kính — chúng nhận `models: []` và sẽ tự trả `unverified`/`suspected:false` khi chạy thật (đúng hành vi `ModelPool` với mảng bậc rỗng: `ModelsExhaustedError` ngay lập tức, không có bậc nào để loop). Test ở Step 5 xác nhận ĐÚNG số lượng/tên lăng kính được dựng, không xác nhận hành vi chấm — hành vi đó đã khoá ở Task 2-5.

- [ ] **Step 8: Chạy lại test, xác nhận xanh**

Run: `cd apps/api && npx jest src/grading/pipeline/investigator-deps.spec.ts src/grading/investigator/model-family.spec.ts -v`
Expected: PASS, tất cả (3 test cũ + 2 test mới + 3 test model-family).

- [ ] **Step 9: Thêm `challenge` vào `StoredInvestigation`**

Sửa `apps/api/src/grading/scoring/stored-investigation.ts`:

```ts
import type { InvestigationResult } from '../investigator/types';
import type { StoredChallenge } from '../investigator/challenge';

export interface StoredInvestigation {
  version: 1;
  result: InvestigationResult;
  rulesSeen: { ruleKey: string; checkedBy: 'machine' | 'model' }[];
  ruleTable: { ruleKey: string; checkedBy: 'machine' | 'model' }[];
  modelCeiling: number;
  /** Bước 6 (§6) — `null`/vắng mặt cho hồ sơ chấm TRƯỚC bước 6 và cho pipeline one_shot. */
  challenge?: StoredChallenge | null;
}

export function readStoredInvestigation(json: unknown): StoredInvestigation {
  const o = json as Partial<StoredInvestigation> | null;
  const ok =
    o !== null &&
    typeof o === 'object' &&
    o.version === 1 &&
    o.result !== null &&
    typeof o.result === 'object' &&
    (o.result.kind === 'verdict' || o.result.kind === 'ungradable') &&
    Array.isArray(o.rulesSeen) &&
    Array.isArray(o.ruleTable) &&
    typeof o.modelCeiling === 'number';
  if (!ok) throw new Error('hồ sơ lượt chấm không đúng khuôn StoredInvestigation v1');
  return o as StoredInvestigation;
}
```

(Chỉ thêm field optional + import — không sửa `readStoredInvestigation()`'s check: `challenge` vắng mặt vẫn hợp lệ, đúng "hồ sơ cũ phải đọc được".)

- [ ] **Step 10: Viết test cho hành vi tolerant của `readStoredInvestigation()`**

Mở `apps/api/src/grading/scoring/stored-investigation.spec.ts` (nếu chưa có file test cho hàm này, tạo mới; nếu có, thêm test):

```ts
it('hồ sơ cũ không có field challenge vẫn đọc được (bước 6 thêm SAU)', () => {
  const legacy = { version: 1, result: { kind: 'ungradable', ungradable: { class: 'system', reason: 'x' } }, rulesSeen: [], ruleTable: [], modelCeiling: 1 };
  expect(() => readStoredInvestigation(legacy)).not.toThrow();
  expect(readStoredInvestigation(legacy).challenge).toBeUndefined();
});
```

- [ ] **Step 11: Chạy test, xác nhận xanh**

- [ ] **Step 12: Nối bốn lăng kính vào `investigator-run.service.ts`**

Sửa file, thay đoạn dựng `stored` (dòng 56-64 hiện tại):

```ts
    const result = await investigate(built.ctx, { models: this.deps.models, sandbox: this.deps.sandbox! });
    const challenge = result.kind === 'verdict' ? await this.runChallenge(result, built.ctx) : null;
    const stored: StoredInvestigation = {
      version: 1,
      result,
      rulesSeen: built.ruleTable,
      ruleTable: built.ruleTable,
      modelCeiling: Math.min(1, ...result.investigation.modelsUsed.map((m) => this.deps.ceilingOf(m))),
      challenge,
    };
```

Thêm phương thức riêng (dưới `startAttempt()`, cùng class) — TÁCH RIÊNG để không phình `run()`, và để một lăng kính hỏng không bao giờ ném ra ngoài (Review Focus 5):

```ts
  /**
   * Bốn lăng kính (§6) — chạy SONG SONG, một lăng kính hỏng không được làm hỏng cả lượt chấm
   * (cùng triết lý Advocate cũ: "không có ý kiến nào tốt hơn một ý kiến bịa ra"). `challenge()`
   * đã tự bọc lỗi của TỪNG Challenger thành `unverified`; `runCaseLens()` tự bọc thành
   * `suspected:false` — nên `Promise.all` ở đây không cần try/catch riêng cho từng lăng kính.
   */
  private async runChallenge(result: InvestigationResult, ctx: InvestigationContext): Promise<StoredChallenge | null> {
    if (!result.verdict || this.deps.challengers.length === 0) return null;
    const toolCalls = result.investigation.toolCalls;
    const [perError, caseNotes] = await Promise.all([
      Promise.all(this.deps.challengers.map((c) => challenge(result.verdict!, ctx, toolCalls, c))),
      Promise.all(this.deps.caseLenses.map((l) => runCaseLens(ctx, result.verdict!, toolCalls, l))),
    ]);
    return { perError, caseNotes };
  }
```

Thêm import ở đầu file:

```ts
import { challenge } from '../investigator/challenge';
import type { StoredChallenge } from '../investigator/challenge';
import { runCaseLens } from '../investigator/case-lens';
import type { InvestigationContext } from '../investigator/types';
```

- [ ] **Step 13: Viết test cho `InvestigatorRunService` — mở rộng file test đã có**

Đọc `apps/api/src/grading/pipeline/investigator-run.service.spec.ts` (nếu tồn tại) trước khi sửa, để khớp style mock DataSource/services đã dùng. Thêm test:

```ts
it('verdict có lỗi → gọi đủ 2 Challenger + 2 CaseLens, ghi vào stored.challenge', async () => {
  // Dùng lại harness test đã có của file (DataSource giả, ScoreService giả, contexts giả) —
  // chỉ thêm challengers/caseLenses giả vào deps và kiểm `finishAttempt` nhận đúng shape.
  const challengerA = { name: 'a', review: jest.fn().mockResolvedValue({ status: 'confirmed', toolCallIds: [] }) };
  const challengerB = { name: 'b', review: jest.fn().mockResolvedValue({ status: 'refuted', toolCallIds: [] }) };
  const lensA = { name: 'x', review: jest.fn().mockResolvedValue({ lens: 'x', suspected: false, note: 'ok' }) };
  const lensB = { name: 'y', review: jest.fn().mockResolvedValue({ lens: 'y', suspected: true, note: 'nghi' }) };
  // ... dựng service với deps.challengers = [challengerA, challengerB], deps.caseLenses = [lensA, lensB],
  // investigate() trả verdict có errors (dùng CTX + fakeSandbox pass-all như các test khác trong file).
  // Kiểm: finishAttempt được gọi với stored.challenge.perError có 2 phần tử,
  // stored.challenge.caseNotes có 2 phần tử (lensB.suspected === true).
});
```

*(Ghi chú cho người thực thi: viết đủ phần "..." dựa trên mock/dựng service ĐÃ CÓ trong file test hiện tại của `InvestigatorRunService` — không đoán shape, đọc file trước.)*

- [ ] **Step 14: Chạy toàn bộ test của Task 6, xác nhận xanh**

Run: `cd apps/api && npx jest src/grading/pipeline/investigator-deps.spec.ts src/grading/pipeline/investigator-run.service.spec.ts src/grading/scoring/stored-investigation.spec.ts src/grading/investigator/model-family.spec.ts -v`
Expected: PASS.

- [ ] **Step 15: Commit**

```bash
git add apps/api/src/grading/investigator/model-family.ts apps/api/src/grading/investigator/model-family.spec.ts apps/api/src/grading/pipeline/investigator-deps.ts apps/api/src/grading/pipeline/investigator-deps.spec.ts apps/api/src/grading/pipeline/investigator-run.service.ts apps/api/src/grading/pipeline/investigator-run.service.spec.ts apps/api/src/grading/scoring/stored-investigation.ts apps/api/src/grading/scoring/stored-investigation.spec.ts
git commit -m "feat(investigator): nối bốn lăng kính vào lượt chấm thật, ghi StoredChallenge"
```

---

### Task 7: Áp luật §6.2 vào `decide()`

**Files:**
- Modify: `apps/api/src/grading/decision/types.ts`
- Modify: `apps/api/src/grading/decision/decide.ts`
- Test: `apps/api/src/grading/decision/decide.spec.ts` (mở rộng file đã có)

**Interfaces:**
- Consumes: `StoredChallenge`, `ChallengeConclusion`, `ChallengeStatus` (`../investigator/challenge`).
- Produces: `DecisionInput.challenge`, `ErrorFlag.code` thêm `'refuted' | 'unverified'`, `CaseFlagCode` thêm `'challenge_suspected'` — Task 8 (`score-core.ts`) đọc `decision.errorFlags`/`decision.caseFlags` mới này.

- [ ] **Step 1: Đọc `decide.spec.ts` hiện có trước khi sửa**

File đã có nhiều test khoá hành vi cũ — đọc để biết đúng khuôn `DecisionInput` các test khác đang dùng (rubric/rules/bundle mẫu), tái dùng cùng fixture thay vì tự bịa một bộ khác.

- [ ] **Step 2: Viết test TRƯỚC cho luật §6.2 (thêm vào cuối `describe` đã có)**

```ts
import { StoredChallenge } from '../investigator/challenge';
// (các import khác đã có sẵn trong file)

function challengeOf(perError: { ruleKey: string; status: 'confirmed' | 'refuted' | 'unverified' }[], caseNotes: StoredChallenge['caseNotes'] = []): StoredChallenge {
  return {
    perError: [{ challenger: 'lens', perError: perError.map((e) => ({ ...e, toolCallIds: [] })) }],
    caseNotes,
  };
}

describe('decide() — §6.2 phản biện', () => {
  it('lỗi bị refuted → KHÔNG trừ điểm, NHƯNG vẫn nằm trong errors và có errorFlag refuted', () => {
    // Dùng lại result/rubric/rules mẫu đã có trong file (biến cục bộ của describe cha, hay
    // helper `baseInput()`/tương đương — đọc file trước để biết tên đúng) với MỘT lỗi
    // `sai_ca_co_ban` được diagnose, rồi truyền challenge refute đúng ruleKey đó.
    const input = { /* ...base input đã có trong file... */ challenge: challengeOf([{ ruleKey: 'sai_ca_co_ban', status: 'refuted' }]) };
    const d = decide(input);
    expect(d.errors.map((e) => e.ruleKey)).toContain('sai_ca_co_ban'); // vẫn còn trong hồ sơ
    expect(d.errorFlags).toContainEqual({ ruleKey: 'sai_ca_co_ban', code: 'refuted' });
    // điểm không bị trừ vì lỗi này — kiểm bằng cách so với một input KHÔNG có challenge, điểm phải cao hơn hoặc bằng.
  });

  it('lỗi bị unverified → GIỮ trong điểm, gắn errorFlag unverified, hạ confidence', () => {
    const input = { /* ...base... */ challenge: challengeOf([{ ruleKey: 'sai_ca_co_ban', status: 'unverified' }]) };
    const d = decide(input);
    expect(d.errorFlags).toContainEqual({ ruleKey: 'sai_ca_co_ban', code: 'unverified' });
    expect(d.confidence).toBeLessThanOrEqual(0.5);
  });

  it('lỗi confirmed → không thêm errorFlag nào, hành vi y hệt không bật phản biện', () => {
    const withChallenge = decide({ /* ...base... */ challenge: challengeOf([{ ruleKey: 'sai_ca_co_ban', status: 'confirmed' }]) });
    const withoutChallenge = decide({ /* ...base... */ challenge: null });
    expect(withChallenge.errorFlags).toEqual(withoutChallenge.errorFlags);
    expect(withChallenge.scoreHundredths).toEqual(withoutChallenge.scoreHundredths);
  });

  it('challenge: null (chưa bật, hay hồ sơ cũ) → hành vi y hệt hôm nay, KHÔNG tự gắn unverified cho ai (Review Focus 3)', () => {
    const d = decide({ /* ...base... */ challenge: null });
    expect(d.errorFlags.some((f) => f.code === 'refuted' || f.code === 'unverified')).toBe(false);
  });

  it('caseNote suspected=true (Bỏ sót/Gian lận) → caseFlag challenge_suspected, chặn tự quyết', () => {
    const d = decide({ /* ...base, không có lỗi nào bị trừ, đáng lẽ auto... */ challenge: challengeOf([], [{ lens: 'gian_lan', suspected: true, note: 'nghi hard-code' }]) });
    expect(d.caseFlags).toContainEqual({ code: 'challenge_suspected', detail: expect.stringContaining('gian_lan') });
    expect(d.outcome).not.toBe('auto');
  });

  it('unverified hạ confidence NHƯNG không tự đẩy outcome xuống ungradable (Review Focus 4)', () => {
    const d = decide({ /* ...base, qua sàn bình thường... */ challenge: challengeOf([{ ruleKey: 'sai_ca_co_ban', status: 'unverified' }]) });
    expect(d.outcome).not.toBe('ungradable');
  });
});
```

*(Ghi chú cho người thực thi: thay `/* ...base... */` bằng đúng object `DecisionInput` mẫu file `decide.spec.ts` đã dùng ở các test khác — đọc file để lấy đúng `rubric`/`rules`/`result` mẫu có lỗi `sai_ca_co_ban` được `diagnose()` tìm ra, spread nó rồi thêm field `challenge`.)*

- [ ] **Step 3: Chạy test, xác nhận FAIL** (field `challenge` chưa có trên `DecisionInput`, TypeScript sẽ báo lỗi biên dịch trước cả khi chạy)

- [ ] **Step 4: Sửa `decision/types.ts`**

```ts
import { ChallengeStatus, StoredChallenge } from '../investigator/challenge';
// (giữ nguyên các import khác đã có)

export type CaseFlagCode =
  | 'criterion_untouched'
  | 'criterion_without_rules'
  | 'nothing_passed'
  | 'investigation_flag'
  | 'low_confidence'
  | 'not_code_pipeline'
  | 'challenge_suspected';

export interface ErrorFlag {
  ruleKey: string;
  code: 'unpriced' | 'refuted' | 'unverified';
}

export interface DecisionInput {
  pipeline: 'investigator' | 'one_shot';
  result: InvestigationResult;
  bundle: { cases: { name: string; group: string }[] };
  rubric: { key: string; maxHundredths: number }[];
  rules: ErrorRule[];
  rulesSeen: { ruleKey: string; checkedBy: 'machine' | 'model' }[];
  waivedCriteria: string[];
  modelCeiling: number;
  theta: number;
  /** Bước 6 (§6.2) — `null` = phản biện chưa chạy (hồ sơ cũ, hay pipeline one_shot). */
  challenge: StoredChallenge | null;
}
```

(export `ChallengeStatus` re-export không cần thiết nếu không dùng trực tiếp trong file này — chỉ import cái thật sự dùng.)

- [ ] **Step 5: Sửa `decision/decide.ts`**

Thêm hằng số và hàm gộp NGAY sau `CONTRADICTION_CAP`:

```ts
/** Đủ thấp để một bài có lỗi chưa xác minh không bao giờ tự quyết qua θ mặc định (§6.2). */
const UNVERIFIED_CONFIDENCE_CAP = 0.5;

/** Bất đối xứng §6.2, gộp NHIỀU lăng kính per-error cho MỘT ruleKey: một lăng kính bác bỏ được
 *  là đủ để refuted, dù lăng kính khác xác nhận — im lặng không phải đồng ý theo chiều ngược
 *  lại cũng đúng: mọi lăng kính xác nhận thì confirmed; còn lại là unverified. */
function mergedStatusOf(ruleKey: string, perError: ChallengeConclusion[]): ChallengeStatus | null {
  const statuses = perError.flatMap((c) => c.perError.filter((e) => e.ruleKey === ruleKey).map((e) => e.status));
  if (statuses.length === 0) return null;
  if (statuses.some((s) => s === 'refuted')) return 'refuted';
  if (statuses.every((s) => s === 'confirmed')) return 'confirmed';
  return 'unverified';
}
```

Thêm import: `import { ChallengeConclusion, ChallengeStatus } from '../investigator/challenge';`

Xoá câu cuối của doc comment `decide()`: **"Điều kiện phản biện (§6.2) chưa có hiệu lực tới bước 6."** — bước 6 chính là plan này.

Sửa đoạn tính điểm + errorFlags + confidence (thay thế các dòng tương ứng, giữ nguyên phần còn lại của hàm y hệt):

```ts
  const diagnosis = diagnose({ rules, bundle: input.bundle, result });
  const { errors } = diagnosis;

  if (BUDGET_STOPS.has(result.investigation.budget.stopReason) && errors.length === 0) {
    return {
      outcome: 'ungradable',
      ungradable: { class: 'system', reason: `cạn ngân sách (${result.investigation.budget.stopReason}) với 0 phát hiện — không phải bài sạch (T-FLOOR-1)` },
      ...none,
      diagnosis,
    };
  }

  // §6.2: lăng kính bác bỏ được loại khỏi ĐIỂM (không loại khỏi HỒ SƠ — errors giữ nguyên,
  // UI gạch ngang qua counted='refuted' ở score-core.ts), lăng kính không xác minh được thì
  // GIỮ trong điểm nhưng hạ trần confidence.
  const refutedKeys = new Set<string>();
  const unverifiedKeys = new Set<string>();
  if (input.challenge) {
    for (const e of errors) {
      const status = mergedStatusOf(e.ruleKey, input.challenge.perError);
      if (status === 'refuted') refutedKeys.add(e.ruleKey);
      else if (status === 'unverified') unverifiedKeys.add(e.ruleKey);
    }
  }

  const score = computeDeductionScore(
    rubric.map((c) => ({ key: c.key, maxHundredths: c.maxHundredths })),
    rules.map((r) => ({ ruleKey: r.ruleKey, criterionKey: r.criterionKey, deductionHundredths: r.deductionHundredths })),
    errors.filter((e) => !refutedKeys.has(e.ruleKey)).map((e) => e.ruleKey),
  );
```

... (giữ nguyên đoạn `caseFlags`/`readSubmission`/vòng `for (const c of rubric)` như hiện tại, không đổi) ...

```ts
  if (input.pipeline !== 'investigator') caseFlags.push({ code: 'not_code_pipeline', detail: 'bài tự luận không bao giờ tự quyết (§0.3)' });

  const suspectedNotes = (input.challenge?.caseNotes ?? []).filter((n) => n.suspected);
  if (suspectedNotes.length > 0) {
    caseFlags.push({
      code: 'challenge_suspected',
      detail: suspectedNotes.map((n) => `${n.lens}: ${n.note}`).join(' · '),
    });
  }

  const errorFlags: ErrorFlag[] = [
    ...score.unpricedRuleKeys.map((ruleKey) => ({ ruleKey, code: 'unpriced' as const })),
    ...[...refutedKeys].map((ruleKey) => ({ ruleKey, code: 'refuted' as const })),
    ...[...unverifiedKeys].map((ruleKey) => ({ ruleKey, code: 'unverified' as const })),
  ];

  let confidence = caseConfidence(errors, { modelCeiling: input.modelCeiling, coverageComplete });
  confidence = Math.min(confidence, result.confidenceCap);
  if (nothingPassed) confidence = Math.min(confidence, CONTRADICTION_CAP);
  if (unverifiedKeys.size > 0) confidence = Math.min(confidence, UNVERIFIED_CONFIDENCE_CAP);
```

(Phần còn lại của hàm — `if (caseFlags.length === 0 && ...)`, `const auto = ...`, `return {...}` — giữ NGUYÊN, không đổi một chữ.)

- [ ] **Step 6: Chạy test, xác nhận xanh**

Run: `cd apps/api && npx jest src/grading/decision/decide.spec.ts -v`
Expected: PASS — cả test cũ (không đổi hành vi khi `challenge: null`) lẫn test mới.

- [ ] **Step 7: Chạy TOÀN BỘ test của `decision/` để chắc không hồi quy** (mọi test cũ giờ cần truyền `challenge` — TypeScript sẽ báo THIẾU field bắt buộc ở mọi input mẫu cũ)

Run: `cd apps/api && npx jest src/grading/decision -v`
Expected: có thể FAIL vì các test khác trong `decide.spec.ts` (và bất kỳ nơi nào khác dựng `DecisionInput` trực tiếp — ví dụ eval runner) chưa có field `challenge`. Nếu FAIL vì thiếu field: thêm `challenge: null` vào MỌI object `DecisionInput` mẫu đã có trong `decide.spec.ts` và trong `apps/api/src/eval/investigator-runner.ts` (nếu file đó tự dựng `DecisionInput`) — đây là thay đổi CƠ HỌC (thêm một dòng), không đổi ý nghĩa test nào.

- [ ] **Step 8: Grep toàn repo tìm mọi nơi khác dựng `DecisionInput` để không bỏ sót**

Run: `cd apps/api && grep -rl "DecisionInput" src/ --include="*.ts" | grep -v ".spec.ts"`
Với mỗi file tìm được (ngoài `decision/types.ts`, `decision/decide.ts` đã sửa), thêm `challenge: null` (nếu đó là nơi tự dựng input) hoặc thread `challenge: input.stored.challenge ?? null` (nếu đó là `score-core.ts` — xử lý ở Task 8).

- [ ] **Step 9: Chạy lại toàn bộ test của `decision/` + `investigator/`, xác nhận xanh**

Run: `cd apps/api && npx jest src/grading/decision src/grading/investigator -v`

- [ ] **Step 10: Commit**

```bash
git add apps/api/src/grading/decision/
git commit -m "feat(grading): áp luật §6.2 (refuted/unverified) vào decide()"
```

---

### Task 8: Nối `score-core.ts` — `counted: 'refuted'`, khoá `repriceBreakdown()`

**Files:**
- Modify: `apps/api/src/grading/scoring/score-core.ts`
- Test: `apps/api/src/grading/scoring/score-core.spec.ts` (mở rộng file đã có)

**Interfaces:**
- Consumes: `StoredChallenge` (`../investigator/challenge`); `DecisionInput.challenge` (Task 7).
- Produces: `BreakdownError.counted` thêm `'refuted'` — Task 9 (`result-detail.ts`), Task 10 (`DiagnosedErrorList.tsx`) đọc field này.

- [ ] **Step 1: Đọc `score-core.spec.ts` hiện có trước khi sửa** — lấy đúng fixture `ScoreCoreInput` mẫu các test khác dùng.

- [ ] **Step 2: Viết test TRƯỚC cho `counted: 'refuted'`**

```ts
it('lỗi bị phản biện bác bỏ → counted="refuted", KHÔNG trừ điểm, vẫn còn trong breakdown.errors', () => {
  const stored = { /* ...base stored đã có trong file, với result có lỗi sai_ca_co_ban... */
    challenge: {
      perError: [{ challenger: 'lens', perError: [{ ruleKey: 'sai_ca_co_ban', status: 'refuted', toolCallIds: [] }] }],
      caseNotes: [],
    },
  };
  const out = computeScore({ /* ...base input đã có, thay stored ở trên... */ });
  const err = out.breakdown.errors.find((e) => e.ruleKey === 'sai_ca_co_ban')!;
  expect(err.counted).toBe('refuted');
});

it('T-REFUTE — repriceBreakdown() KHÔNG được biến refuted trở lại counted khi áp giá mới (gotcha thật)', () => {
  const before = { /* ...ScoreBreakdown mẫu... */ errors: [{ ruleId: 'r1', revisionId: 'v1', ruleKey: 'sai_ca_co_ban', criterionKey: 'tinh_dung', source: 'llm_with_tools', toolCallIds: [], deductionHundredths: 100, counted: 'refuted' }], perCriterion: [], caseFlags: [], errorFlags: [], confidence: 1, mismatchedRules: [], notConsidered: [], ungradable: null };
  const { breakdown } = repriceBreakdown(before, [{ key: 'tinh_dung', maxHundredths: 400 }], new Map([['r1', 150]]));
  expect(breakdown.errors[0].counted).toBe('refuted'); // KHÔNG được thành 'counted' chỉ vì có giá mới
});
```

- [ ] **Step 3: Chạy test, xác nhận FAIL** (`counted` chưa có `'refuted'`, `repriceBreakdown()` hiện tại sẽ trả `'counted'` sai)

- [ ] **Step 4: Sửa `score-core.ts`**

```ts
import type { ChallengeStatus, StoredChallenge } from '../investigator/challenge';

export interface BreakdownError {
  ruleId: string;
  revisionId: string;
  ruleKey: string;
  criterionKey: string;
  source: VerdictSource;
  toolCallIds: string[];
  deductionHundredths: number | null;
  /** `refuted`: phản biện bác bỏ (§6.2) — KHÔNG xoá khỏi hồ sơ, chỉ loại khỏi điểm. */
  counted: 'counted' | 'excluded' | 'unpriced' | 'refuted';
}
```

Sửa `computeScore()` — thread `challenge` vào lời gọi `decide()`, và mở rộng phần dựng `errors`/`score`:

```ts
export function computeScore(input: ScoreCoreInput): ScoreCoreOutput {
  const rubricKeys = new Set(input.rubric.map((c) => c.key));
  const mismatched = input.rules.filter((r) => !rubricKeys.has(r.criterionKey));
  const matching = input.rules.filter((r) => rubricKeys.has(r.criterionKey));
  const considered = (r: RuleSnapshot) => isMachineChecked(r.predicate) || input.sessionModelRules.has(r.ruleKey);
  const notConsidered = matching.filter((r) => !considered(r));
  const used = matching.filter(considered);
  const byKey = new Map(used.map((r) => [r.ruleKey, r]));

  const decision = decide({
    pipeline: 'investigator',
    result: input.stored.result,
    bundle: { cases: input.bundleCases },
    rubric: input.rubric,
    rules: used.map(toErrorRule),
    rulesSeen: input.stored.rulesSeen,
    waivedCriteria: input.waivedCriteria,
    modelCeiling: input.stored.modelCeiling,
    theta: input.theta,
    challenge: input.stored.challenge ?? null,
  });

  const excludedKeys = new Set(used.filter((r) => input.exceptions.get(r.ruleId) === 'exclude').map((r) => r.ruleKey));
  const refutedKeys = new Set(decision.errorFlags.filter((f) => f.code === 'refuted').map((f) => f.ruleKey));
  const common = {
    caseFlags: decision.caseFlags,
    errorFlags: decision.errorFlags.filter((f) => !excludedKeys.has(f.ruleKey)),
    confidence: decision.confidence,
    mismatchedRules: mismatched.map((r) => ({ ruleId: r.ruleId, ruleKey: r.ruleKey, criterionKey: r.criterionKey })),
    notConsidered: notConsidered.map((r) => ({ ruleId: r.ruleId, ruleKey: r.ruleKey })),
    ungradable: decision.outcome === 'ungradable' ? decision.ungradable : null,
  };
  if (decision.outcome === 'ungradable') {
    return {
      outcome: 'ungradable',
      ungradable: decision.ungradable,
      scoreHundredths: null,
      breakdown: { errors: [], perCriterion: [], ...common },
    };
  }

  const errors: BreakdownError[] = decision.errors.map((e) => {
    const r = byKey.get(e.ruleKey)!;
    const counted: BreakdownError['counted'] = refutedKeys.has(r.ruleKey)
      ? 'refuted'
      : excludedKeys.has(r.ruleKey)
        ? 'excluded'
        : r.deductionHundredths === null
          ? 'unpriced'
          : 'counted';
    return {
      ruleId: r.ruleId,
      revisionId: r.revisionId,
      ruleKey: r.ruleKey,
      criterionKey: r.criterionKey,
      source: e.source,
      toolCallIds: e.toolCallIds,
      deductionHundredths: r.deductionHundredths,
      counted,
    };
  });
  const score = computeDeductionScore(
    input.rubric,
    used.map((r) => ({ ruleKey: r.ruleKey, criterionKey: r.criterionKey, deductionHundredths: r.deductionHundredths })),
    errors.filter((e) => e.counted !== 'excluded' && e.counted !== 'refuted').map((e) => e.ruleKey),
  );
  return {
    outcome: decision.outcome,
    ungradable: null,
    scoreHundredths: score.scoreHundredths,
    breakdown: { errors, perCriterion: score.perCriterion, ...common },
  };
}
```

Sửa `repriceBreakdown()` — giữ `'refuted'` nguyên trạng, loại nó khỏi tính điểm lại:

```ts
export function repriceBreakdown(
  before: ScoreBreakdown,
  rubric: { key: string; maxHundredths: number }[],
  prices: ReadonlyMap<string, number | null>,
): { scoreHundredths: number; breakdown: ScoreBreakdown; newlyUnpriced: { ruleId: string; ruleKey: string }[] } {
  const errors: BreakdownError[] = before.errors.map((e) => {
    // 'refuted' và 'excluded' đứng TRƯỚC giá mới: áp giá không phục hồi một lỗi phản biện đã
    // bác, cũng như không phục hồi một lỗi giảng viên đã loại — cả hai đều là quyết định của
    // một LƯỢT KHÁC (phản biện lúc chấm, hay giảng viên lúc duyệt), không phải của bảng giá.
    if (e.counted === 'excluded' || e.counted === 'refuted') return e;
    const deductionHundredths = prices.get(e.ruleId) ?? null;
    const counted: BreakdownError['counted'] = deductionHundredths === null ? 'unpriced' : 'counted';
    return { ...e, deductionHundredths, counted };
  });
  const newlyUnpriced = errors
    .filter((e, i) => e.counted === 'unpriced' && before.errors[i].counted !== 'unpriced')
    .map((e) => ({ ruleId: e.ruleId, ruleKey: e.ruleKey }));
  const score = computeDeductionScore(
    rubric,
    errors.map((e) => ({ ruleKey: e.ruleKey, criterionKey: e.criterionKey, deductionHundredths: e.deductionHundredths })),
    errors.filter((e) => e.counted !== 'excluded' && e.counted !== 'refuted').map((e) => e.ruleKey),
  );
  return {
    scoreHundredths: score.scoreHundredths,
    breakdown: {
      ...before,
      errors,
      perCriterion: score.perCriterion,
      errorFlags: errors.filter((e) => e.counted === 'unpriced').map((e) => ({ ruleKey: e.ruleKey, code: 'unpriced' as const })),
    },
    newlyUnpriced,
  };
}
```

**Chú ý regression thật:** `repriceBreakdown()`'s `errorFlags` sau khi sửa chỉ còn tính từ `'unpriced'`, GIỐNG HỆT bản gốc (không đổi hành vi ở nhánh này) — nhưng bản gốc VỐN ĐÃ mất mọi `errorFlags` khác `'unpriced'` mỗi lần áp giá lại (kể cả `'refuted'`/`'unverified'` mới thêm). Đây là một khoảng trống có sẵn từ trước bước 6 (áp giá lại vốn chỉ quan tâm tới giá), không phải lỗi mới do plan này gây ra — nhưng vì `'refuted'` giờ mang ý nghĩa NẶNG hơn `'unpriced'`, thêm dòng sau vào `errorFlags` để không mất cờ `refuted` sau một lượt áp giá lại:

```ts
      errorFlags: [
        ...errors.filter((e) => e.counted === 'unpriced').map((e) => ({ ruleKey: e.ruleKey, code: 'unpriced' as const })),
        ...before.errorFlags.filter((f) => f.code === 'refuted' || f.code === 'unverified'),
      ],
```

- [ ] **Step 5: Chạy test, xác nhận xanh**

Run: `cd apps/api && npx jest src/grading/scoring/score-core.spec.ts -v`
Expected: PASS — cả test cũ (không challenge) lẫn hai test mới.

- [ ] **Step 6: Grep các nơi khác gọi `computeScore()` trực tiếp** để thêm `challenge: null`/thread đúng field nếu `ScoreCoreInput` được dựng thủ công ở đâu đó ngoài `score.service.ts` (ví dụ eval runner).

Run: `cd apps/api && grep -rl "computeScore(" src/ --include="*.ts" | grep -v ".spec.ts"`

- [ ] **Step 7: Chạy toàn bộ test `scoring/` + `pipeline/` + eval liên quan, xác nhận không hồi quy**

Run: `cd apps/api && npx jest src/grading/scoring src/grading/pipeline src/eval -v`

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/grading/scoring/score-core.ts apps/api/src/grading/scoring/score-core.spec.ts
git commit -m "fix(grading): score-core áp counted=refuted, khoá repriceBreakdown không phục hồi lỗi đã bác (T-REFUTE)"
```

---

### Task 9: Hợp đồng backend cho UI — `result-detail.ts`

**Files:**
- Modify: `apps/api/src/grading/scoring/result-detail.ts`
- Test: `apps/api/src/grading/scoring/result-detail.spec.ts` (tạo mới nếu chưa có, hoặc mở rộng)

**Interfaces:**
- Consumes: `StoredChallenge` (`../investigator/challenge`).
- Produces: `ResultDetail.challengeNotes: { lens: string; suspected: boolean; note: string }[]` — Task 10 (frontend) đọc field này.

- [ ] **Step 1: Viết test trước**

```ts
it('challengeNotes lấy từ stored.challenge.caseNotes; rỗng khi chưa bật phản biện', async () => {
  // Dựng result/attempt như test khác trong file (hoặc file result-detail hiện có), với
  // grading_attempt.investigation chứa challenge.caseNotes = [{lens:'gian_lan', suspected:true, note:'x'}].
  const detail = await loadResultDetail(ds, resultEntity);
  expect(detail.challengeNotes).toEqual([{ lens: 'gian_lan', suspected: true, note: 'x' }]);
});

it('hồ sơ trước bước 6 (không có challenge) → challengeNotes rỗng, không lỗi', async () => {
  const detail = await loadResultDetail(ds, resultEntityLegacy);
  expect(detail.challengeNotes).toEqual([]);
});
```

*(Ghi chú: dùng đúng cách dựng DataSource/fixture mà `result-detail.ts`'s test hiện có đang dùng — nếu chưa có file test cho `loadResultDetail`, tạo theo khuôn của một e2e/unit test gần đó trong cùng thư mục `scoring/`, đọc `score-core.spec.ts` để biết style DataSource giả nào đang được dùng trong module này.)*

- [ ] **Step 2: Chạy test, xác nhận FAIL**

- [ ] **Step 3: Sửa `result-detail.ts`**

```ts
import type { CaseLensNote } from '../investigator/challenge';

export interface ResultDetail {
  pipeline: GradingPipeline;
  currentScore: number | null;
  currentScoreSource: CurrentScore['source'];
  status: string;
  ungradableClass: string | null;
  ungradableReason: string | null;
  breakdown: (Omit<ScoreBreakdown, 'errors'> & { errors: ResultDetailError[] }) | null;
  investigation: StoredInvestigation['result'] | null;
  /** Bước 6 — ghi chú của Bỏ sót/Gian lận. Rỗng khi chưa bật phản biện hay hồ sơ cũ. */
  challengeNotes: CaseLensNote[];
}
```

Trong `loadResultDetail()`, sau dòng `const stored = attempt?.investigation as StoredInvestigation | undefined;`, thêm:

```ts
  const challengeNotes = stored?.challenge?.caseNotes ?? [];
```

Và thêm `challengeNotes` vào object trả về cuối hàm (giữ nguyên mọi field khác):

```ts
  return {
    pipeline: result.pipeline,
    currentScore: current.value,
    currentScoreSource: current.source,
    status: result.status,
    ungradableClass: result.ungradableClass,
    ungradableReason: result.ungradableReason,
    breakdown,
    investigation: stored?.result ?? null,
    challengeNotes,
  };
```

- [ ] **Step 4: Chạy test, xác nhận xanh**

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/grading/scoring/result-detail.ts apps/api/src/grading/scoring/result-detail.spec.ts
git commit -m "feat(grading): result-detail trả ghi chú lăng kính Bỏ sót/Gian lận"
```

---

### Task 10: UI — badge lỗi bị bác/chưa xác minh + khối ghi chú lăng kính

**Files:**
- Modify: `apps/web/src/lib/api/grading.ts`
- Modify: `apps/web/src/app/teacher/grading/investigation/[resultId]/_components/DiagnosedErrorList.tsx`
- Modify: `apps/web/src/app/teacher/grading/investigation/[resultId]/_components/DiagnosedErrorList.test.tsx`
- Create: `apps/web/src/app/teacher/grading/investigation/[resultId]/_components/ChallengeNotes.tsx`
- Test: `apps/web/src/app/teacher/grading/investigation/[resultId]/_components/ChallengeNotes.test.tsx`
- Modify: `apps/web/src/app/teacher/grading/investigation/[resultId]/page.tsx`

**Interfaces:**
- Consumes: `ResultDetail.challengeNotes`, `ResultDetailError.counted` (đã mở rộng ở Task 9, chảy qua OpenAPI schema — cần chạy lại regenerate client, xem Step 1).

- [ ] **Step 1: Regenerate OpenAPI client** — quy trình đã có tiền lệ trong dự án này (khởi API compiled với `.env.test`, đợi `/api-docs-json` 200, chạy `pnpm --filter @cine/shared generate:api-client`, xác nhận field mới xuất hiện trong `packages/shared/src/api/schema.d.ts`, rồi tắt server). Xác nhận KHÔNG có tiến trình `node dist/src/main.js` mồ côi đang chiếm cổng 4000 trước khi bắt đầu.

- [ ] **Step 2: Sửa `apps/web/src/lib/api/grading.ts`** — mở rộng type theo đúng field mới của backend:

```ts
export interface ResultDetailError {
  ruleId: string;
  ruleKey: string;
  ruleName: string;
  criterionKey: string;
  source: 'deterministic' | 'llm_with_tools' | 'llm_only';
  toolCallIds: string[];
  deductionHundredths: number | null;
  counted: 'counted' | 'excluded' | 'unpriced' | 'refuted';
}

export interface ChallengeNote {
  lens: string;
  suspected: boolean;
  note: string;
}

export interface ResultDetail {
  // ...(các field đã có, không đổi)...
  challengeNotes: ChallengeNote[];
}
```

(Nếu OpenAPI schema đã sinh ra kiểu tương đương ở `packages/shared/src/api/schema.d.ts`, dùng lại union đó thay vì viết tay — kiểm bằng cách đọc schema.d.ts sau Step 1; chỉ viết tay nếu route trả `Record<string, never>` do quirk NestJS Swagger CLI plugin đã gặp trước đây trong dự án này.)

- [ ] **Step 3: Viết test TRƯỚC cho `DiagnosedErrorList.tsx`**

Đọc `DiagnosedErrorList.test.tsx` hiện có trước, thêm:

```ts
it('lỗi counted="refuted" → badge "Bị bác bỏ (phản biện)", KHÔNG hiện badge "Đã bỏ cho bài này"', () => {
  const breakdown = { /* ...base breakdown mẫu đã có trong file..., */ errors: [{ ruleId: 'r1', ruleKey: 'sai_ca_co_ban', ruleName: 'Sai ca cơ bản', criterionKey: 'tinh_dung', source: 'llm_with_tools', toolCallIds: [], deductionHundredths: 100, counted: 'refuted' }], errorFlags: [{ ruleKey: 'sai_ca_co_ban', code: 'refuted' }] };
  render(<DiagnosedErrorList breakdown={breakdown} />);
  expect(screen.getByText(/bị bác bỏ/i)).toBeInTheDocument();
  expect(screen.queryByText(/đã bỏ cho bài này/i)).not.toBeInTheDocument();
});

it('errorFlag code="unverified" → badge "Chưa xác minh"', () => {
  const breakdown = { /* ...base... */ errors: [{ ruleId: 'r1', ruleKey: 'sai_ca_co_ban', ruleName: 'Sai ca cơ bản', criterionKey: 'tinh_dung', source: 'llm_with_tools', toolCallIds: [], deductionHundredths: 100, counted: 'counted' }], errorFlags: [{ ruleKey: 'sai_ca_co_ban', code: 'unverified' }] };
  render(<DiagnosedErrorList breakdown={breakdown} />);
  expect(screen.getByText(/chưa xác minh/i)).toBeInTheDocument();
});
```

- [ ] **Step 4: Chạy test, xác nhận FAIL**

- [ ] **Step 5: Sửa `DiagnosedErrorList.tsx`**

```tsx
export function DiagnosedErrorList({ breakdown }: { breakdown: NonNullable<ResultDetail['breakdown']> }) {
  const flagsByRule = new Map(breakdown.errorFlags.map((f) => [f.ruleKey, f.code]));
  return (
    <section className="flex flex-col gap-2">
      <h3 className="section-label">Lỗi chẩn đoán ({breakdown.errors.length})</h3>
      <ul className="flex flex-col gap-2">
        {breakdown.errors.map((error) => (
          <li key={error.ruleId} className={`rounded-md border border-border bg-surface p-3 ${error.counted === 'refuted' ? 'opacity-60' : ''}`}>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`font-medium ${error.counted === 'refuted' ? 'line-through' : ''}`}>{error.ruleKey}</span>
              <span className="text-caption text-muted-foreground">{error.ruleName}</span>
              <Badge variant={SOURCE_LABEL[error.source].variant}>{SOURCE_LABEL[error.source].label}</Badge>
              {error.counted === 'excluded' && <Badge variant="outline">Đã bỏ cho bài này</Badge>}
              {error.counted === 'refuted' && <Badge variant="destructive">Bị bác bỏ (phản biện)</Badge>}
              {flagsByRule.get(error.ruleKey) === 'unpriced' && <Badge variant="warning">chưa có giá</Badge>}
              {flagsByRule.get(error.ruleKey) === 'unverified' && <Badge variant="warning">Chưa xác minh</Badge>}
            </div>
            <p className="mt-1 text-caption text-muted-foreground">
              Tiêu chí {error.criterionKey}
              {error.deductionHundredths !== null && ` · trừ ${(error.deductionHundredths / 100).toFixed(2)}`}
            </p>
          </li>
        ))}
      </ul>
      {breakdown.mismatchedRules.length > 0 && (
        <p className="border-l-2 border-warning pl-2.5 text-caption text-warning-strong">
          {breakdown.mismatchedRules.length} luật trỏ tiêu chí không có trong rubric của bài này — xem lại ở Trang
          kiến thức.
        </p>
      )}
    </section>
  );
}
```

- [ ] **Step 6: Chạy test, xác nhận xanh**

- [ ] **Step 7: Viết test trước cho `ChallengeNotes.tsx`**

```tsx
// ChallengeNotes.test.tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { ChallengeNotes } from './ChallengeNotes';

describe('ChallengeNotes', () => {
  it('không có ghi chú nào → không render gì', () => {
    const { container } = render(<ChallengeNotes notes={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('có ghi chú nghi ngờ → hiện tên lăng kính và nội dung, đánh dấu rõ là NGHI NGỜ', () => {
    render(<ChallengeNotes notes={[{ lens: 'gian_lan', suspected: true, note: 'đổi input vẫn ra cùng kết quả' }]} />);
    expect(screen.getByText(/gian_lan/i)).toBeInTheDocument();
    expect(screen.getByText(/đổi input vẫn ra cùng kết quả/)).toBeInTheDocument();
  });

  it('ghi chú không nghi ngờ (suspected:false) → KHÔNG hiện (chỉ hiện cái đáng chú ý)', () => {
    render(<ChallengeNotes notes={[{ lens: 'bo_sot', suspected: false, note: 'đã chạy đủ' }]} />);
    expect(screen.queryByText(/bo_sot/i)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 8: Chạy test, xác nhận FAIL**

- [ ] **Step 9: Viết `ChallengeNotes.tsx`**

```tsx
'use client';

import { AlertTriangle } from 'lucide-react';
import type { ChallengeNote } from '@/lib/api/grading';

/**
 * Ghi chú của hai lăng kính CẤP BÀI (Bỏ sót, Gian lận, §6.1) — không gắn với một lỗi cụ thể
 * nên không vào được `DiagnosedErrorList`. Chỉ hiện ghi chú NGHI NGỜ: một lăng kính nói "không
 * thấy gì bất thường" không phải thông tin giảng viên cần đọc, nó chỉ nói lăng kính đã chạy.
 */
export function ChallengeNotes({ notes }: { notes: ChallengeNote[] }) {
  const suspected = notes.filter((n) => n.suspected);
  if (suspected.length === 0) return null;
  return (
    <section className="flex flex-col gap-2 rounded-md border border-warning bg-warning/5 p-3">
      <h3 className="flex items-center gap-2 section-label text-warning-strong">
        <AlertTriangle className="h-4 w-4" aria-hidden="true" />
        Lăng kính phản biện nghi ngờ
      </h3>
      <ul className="flex flex-col gap-1.5">
        {suspected.map((n, i) => (
          <li key={i} className="text-small text-muted-foreground">
            <span className="font-medium text-foreground">{n.lens}</span> — {n.note}
          </li>
        ))}
      </ul>
    </section>
  );
}
```

- [ ] **Step 10: Chạy test, xác nhận xanh**

- [ ] **Step 11: Đọc `page.tsx` của Hồ sơ một bài, nối `ChallengeNotes` vào**

Đọc `apps/web/src/app/teacher/grading/investigation/[resultId]/page.tsx` (23 dòng, đã đọc lúc research — có `ScoreSummary`, `DiagnosedErrorList`, `InvestigationTrail`). Thêm `<ChallengeNotes notes={detail.challengeNotes} />` ngay SAU `<DiagnosedErrorList breakdown={...} />` (trước `InvestigationTrail` — ghi chú cấp bài đọc tự nhiên hơn ngay sau danh sách lỗi từng dòng, trước khi đi vào chi tiết từng lời gọi công cụ).

- [ ] **Step 12: Chạy `pnpm build` (apps/web) để xác nhận không vỡ**

Run: `cd apps/web && pnpm build`
Expected: build thành công, không lỗi type mới.

- [ ] **Step 13: Commit**

```bash
git add apps/web/src/lib/api/grading.ts apps/web/src/app/teacher/grading/investigation/
git commit -m "feat(web): hiện lỗi bị phản biện bác bỏ/chưa xác minh + ghi chú Bỏ sót-Gian lận"
```

---

## Self-Review

**1. Spec coverage:**
- §6 ràng buộc 1 (không thấy lập luận) — `ChallengeInput.error` đã là `Omit<VerdictError,'note'>` từ bước 2, không đổi. ✅
- §6 ràng buộc 2 (công cụ riêng) — mọi lăng kính chạy `ToolRunner` riêng qua `runLensLoop()` (Task 1). ✅
- §6 ràng buộc 3 (không chạm điểm) — không lăng kính nào trả về số; điểm chỉ đổi qua `decide()`/`score-core.ts` đọc TRẠNG THÁI (Task 7-8). ✅
- §6.1 bốn lăng kính — Task 2-5, mỗi lăng kính một file, một prompt.
- §6.2 ba trạng thái + bất đối xứng — Task 7 (`mergedStatusOf`, "refuted" từ MỘT lăng kính là đủ).
- §6.2 "refuted vẫn gắn cờ" — `errorFlags` Task 7, badge Task 10.
- §6.2 "không xoá lỗi bị bác" — `counted: 'refuted'` (Task 8), giữ trong `breakdown.errors`.
- §6.3 "gắn cờ đúng lỗi, không chặn việc chấm" — cơ chế `auto = caseFlags.length===0 && errorFlags.length===0` đã có, tự động áp dụng.
- §6.3 cảnh báo cùng họ model lúc khởi động, có test — Task 6 (`model-family.ts`, chạy trong `buildInvestigatorDeps()`).
- §15.1 bước 6 "kết quả phản biện lưu ở `grading_attempt.challenge`" — CỐ Ý lệch (ghi trong `investigation` thay vì cột riêng), lý do ghi rõ trong Architecture + doc comment `StoredChallenge`.
- §15.1 bước 6 đo bằng số (≥80%/≤5%/≤15pp) — CỐ Ý NGOÀI PHẠM VI, ghi rõ đầu plan.

**2. Placeholder scan:** không còn "TBD"/"tương tự Task N không kèm code" — Task 3, 5 nói "sao y" nhưng LUÔN kèm code đầy đủ của phiên bản đã đổi. Hai chỗ duy nhất cố ý để lại việc cho người thực thi tự khớp fixture (Task 6 Step 13, Task 7 Step 2 `/* ...base... */`, Task 9 Step 1) đều ghi RÕ đó là vì phải đọc file test đã có trước — không phải placeholder che giấu thiếu sót, mà là chỉ dẫn "đọc trước khi viết" (đúng tinh thần plan phải khớp file thật, không đoán).

**3. Type consistency:** `ChallengeStatus` ('confirmed'|'refuted'|'unverified') dùng xuyên suốt Task 2-3, 7. `CaseLensNote {lens, suspected, note}` dùng xuyên suốt Task 4-5, 9-10 — tên field khớp ở mọi nơi (`stored.challenge.caseNotes`, `ResultDetail.challengeNotes`, `ChallengeNotes` component prop `notes`). `BreakdownError.counted` thêm đúng MỘT giá trị `'refuted'` ở đúng MỘT nơi định nghĩa (`score-core.ts`), mọi nơi khác (`ResultDetailError`, frontend `ResultDetailError`) tham chiếu lại kiểu đó, không định nghĩa trùng.

**4. Review Focus — đã có test riêng:**
1. Lỗi bị bác vẫn xuất hiện trong `breakdown.errors` — Task 8 Step 2 dòng 1.
2. `repriceBreakdown()` không phục hồi `refuted` — Task 8 Step 2 dòng 2 (T-REFUTE).
3. `challenge: null` không tự gắn cờ ai — Task 7 Step 2 test thứ 4.
4. `unverified` không tự ép `ungradable` — Task 7 Step 2 test cuối.
5. Lăng kính hỏng không chặn cả lượt chấm — Task 2/3 (throw → `challenge()` tự bọc unverified), Task 4/5 (`runCaseLens` tự bọc suspected:false), Task 6 Step 13 (test tích hợp ở `InvestigatorRunService`).

---

Plan complete and saved to `docs/superpowers/plans/2026-09-27-investigator-challenge-lenses.md`. Please review the plan. Which execution approach would you prefer?

- **Subagent-driven** — Một subagent mới làm từng Task, một reviewer mới kiểm trước khi sang Task tiếp, rồi review toàn nhánh ở cuối. Kỹ nhất; tốn một context mới cho mỗi Task và mỗi lượt review.
- **Native** — Tôi làm hết 10 Task trong phiên này, rồi một reviewer (code-reviewer) kiểm toàn bộ nhánh ở cuối. Rẻ và nhanh nhất; không có gate độc lập giữa chừng.

**Tôi đề xuất Native**, vì các Task phụ thuộc chuỗi RẤT chặt (Task 7 đổi `DecisionInput` bắt buộc Task 8 sửa theo ngay lập tức để code còn biên dịch được; Task 2-5 gần như sao y lẫn nhau) — chờ review giữa từng Task sẽ chỉ lặp lại đúng một nhận xét ("khớp interface đã định ở Task 1") nhiều lần, trong khi ngân sách thời gian thật (12 giờ hôm nay) quý hơn việc có nhiều gate. Plan đã mang đủ chi tiết thiết kế (kiểu dữ liệu, luật gộp, đúng dòng cần sửa) để một reviewer cuối cùng đủ sức bắt lỗi thật.
