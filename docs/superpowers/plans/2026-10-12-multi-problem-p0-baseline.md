# P0 — Đo nền cho chấm điểm nhiều câu: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dựng dụng cụ đo (token và chi phí theo model, kể cả của bốn lăng kính; phiên bản prompt; eval chạy phản biện và có mẫu số cho nhóm tự quyết), rồi dùng nó chạy diễn tập thật trên `main` hiện tại để có mốc so sánh, số thời gian/token/chi phí **mỗi đơn vị**, và bảng phân loại hình dạng đề thật — làm cổng trước P1a.

**Architecture:** Toàn bộ là **thêm vào**, không đổi một quyết định chấm nào: mọi trường mới là tuỳ chọn hoặc cho phép rỗng; token được gom bằng một `UsageSink` tạo **riêng cho từng lượt chấm** (lăng kính là singleton dùng chung nên không được gom vào trạng thái chung); pha phản biện được tách thành MỘT hàm `runChallengePhase` dùng chung cho đường chấm thật và runner eval; chi phí chỉ được ghi khi **mọi** model dùng trong lượt đều có giá khai trong env, còn lại ghi `NULL` (không bao giờ ghi 0 hay số đoán). Phần diễn tập thật là vận hành, có điều kiện kết thúc.

**Tech Stack:** NestJS 10 + TypeORM 0.3 (Postgres 16/17), Jest (unit + e2e tuần tự), ts-node, `pg`, pnpm monorepo.

**Spec:** `docs/superpowers/specs/2026-10-12-multi-problem-grading-design.md` — §10.2 (hàng P0 và điều kiện kết thúc), §10.4 (môi trường), §11 (ngân sách, eval, tiêu chí thống kê), Phụ lục C (đề thật #1).

## Global Constraints

- **P0 không đổi điểm hay kết cục của bất kỳ bài nào.** Mọi thay đổi trong `grading/` chỉ thêm quan sát. Các test đang có phải xanh không sửa (trừ test được nêu tên trong task).
- `grading/investigator/` và `eval/` **không được import** `typeorm`, `@nestjs/typeorm`, `/entities/`, `grading.service`, `grading-run.service` (`src/eval/no-db.import-scan.spec.ts` khoá điều này). Mọi file mới ở hai thư mục đó phải thuần.
- Migration **chỉ thêm**, cột cho phép rỗng, timestamp `1789570000000`; entity là nguồn sự thật; `synchronize` luôn `false`.
- `python3`, **không bao giờ** `python`, trên máy này (`C:\Python312` hỏng).
- **Không phát minh giá model.** Giá chỉ đến từ env `GRADING_TIER<n>_PRICE_IN_PER_MTOK` và `GRADING_TIER<n>_PRICE_OUT_PER_MTOK` (USD cho một triệu token). Thiếu một trong hai → bậc đó không có giá → `cost_usd = NULL`.
- **Không in bí mật** (khoá model, `DATABASE_URL`, mật khẩu tài khoản diễn tập) ra log, ra file bản ghi hay ra tin nhắn.
- **Không áp migration lên DB production khi chưa được chủ đồ án cho phép bằng lời** trong phiên làm việc đó. Chỉ kiểm tra chỉ-đọc được tự do.
- e2e chạy **tuần tự** (`maxWorkers: 1`, không nâng); trước khi tin một lượt e2e phải tắt hết tiến trình `node` jest/nest mồ côi (chúng nuốt job BullMQ).
- File trong repo dùng CRLF; không dùng script sửa file bằng `indexOf('\n…')`.
- Mọi lượt diễn tập/eval thật phải ghi bản ghi và so với lượt trước (quy ước lịch sử benchmark): một sửa chỉ "có tác dụng" khi lượt chạy SAU nó tốt hơn trên bảng.

## Review Focus

Năm trường hợp spec ngụ ý mà test thông thường dễ bỏ sót, theo thứ tự dễ cắn nhất. Mỗi dòng có test ở task sở hữu mã:

1. **Lăng kính hỏng hay hết bậc vẫn đã tiêu token** — token của lượt hỏng phải vào sổ (`UNATTRIBUTED`), không được biến mất. → Task 3.
2. **Hai lượt chấm chạy đồng thời dùng chung các lăng kính singleton** — token của lượt này không được lẫn sang lượt kia. → Task 4.
3. **Model không có giá, hoặc có token không rõ model, hoặc xoay giữa nhiều bậc** — `cost_usd` phải là `NULL`, không phải `0` và không phải con số sai. → Task 5.
4. **`grading_attempt` bất biến sau khi có `outcome`** — các cột mới phải được ghi trong **cùng** câu `UPDATE` đặt `outcome`, nếu không trigger từ chối. Và không khai gì thì các cột mới phải rỗng, hành vi cũ không đổi. → Task 5.
5. **Eval chạy với `--challenge=on` hay `--waive` không so được với lượt cũ** — lượt chạy phải ghi cấu hình đó và phần so sánh phải nói rõ là lẫn biến. → Task 6.

---

## File Structure

**Tạo:**

| File | Trách nhiệm |
|---|---|
| `apps/api/src/grading/investigator/usage-sink.ts` (+ `.spec.ts`) | Kiểu `UsageByModel`, lớp `UsageSink` (gom token theo model, mỗi lượt một cái), `mergeUsage`, `totalOf`, hằng `UNATTRIBUTED`. Thuần |
| `apps/api/src/grading/investigator/pricing.ts` (+ `.spec.ts`) | `ModelPrice`, `readPrice(env, index)`, `costOf(usage, priceOf)`. Thuần |
| `apps/api/src/grading/investigator/prompt-version.ts` (+ `.spec.ts`) | `promptVersionOf()` — băm của system prompt agent điều tra. Thuần |
| `apps/api/src/grading/investigator/challenge-phase.ts` (+ `.spec.ts`) | `runChallengePhase()` — pha phản biện dùng chung. Thuần (nhận lăng kính qua tham số) |
| `apps/api/src/database/migrations/1789570000000-AttemptUsageAndPrompt.ts` | Thêm `prompt_version`, `usage_by_model` vào `grading_attempt` |
| `apps/api/src/eval/attempt-stats.ts` (+ `.spec.ts`) | `summarizeAttempts()` — thống kê thời gian/token/chi phí mỗi đơn vị. Thuần |
| `apps/api/src/eval/cli-args-challenge.spec.ts` | Test hai cờ mới của `parseEvalArgs` |
| `apps/api/scripts/attempt-cost-report.ts` | Đọc `grading_attempt` của một phiên và in thống kê (chỉ-đọc) |
| `docs/rehearsals/2026-10-12-p0-preflight.md`, `docs/rehearsals/2026-10-12-p0-baseline.md` | Bản ghi tiền kiểm và báo cáo kết thúc P0 |
| `docs/superpowers/reports/2026-10-12-exam-shapes.md` | Bảng phân loại hình dạng đề thật |

**Sửa:** `grading/investigator/{types,investigate,lens-loop,challenge,case-lens,model-pool}.ts`, bốn file trong `grading/investigator/lenses/`, `grading/pipeline/{investigator-run.service,investigator-deps}.ts`, `grading/scoring/score.service.ts`, `grading/entities/grading-attempt.entity.ts`, `eval/{investigator-runner,cli-args,cli}.ts`, `apps/api/package.json`, `apps/api/.env.example`, `apps/api/test/finish-attempt.e2e-spec.ts`.

Đường dẫn `src/…`, `test/…`, `scripts/…`, `eval/…` tính từ `apps/api/`; đường dẫn `docs/…` tính từ **gốc repo** (nên các lệnh `git add` chạy từ `apps/api/` dùng `../../docs/…`). Lệnh chạy từ `apps/api/` trừ khi ghi khác.

---

### Task 1: Tiền kiểm môi trường và trạng thái migration

Không có mã sản phẩm. Kết quả là một bản ghi chỉ-đọc cho biết P0 có chạy được lượt thật hay không **trước khi** dồn công vào Task 8–9.

**Files:**
- Create: `docs/rehearsals/2026-10-12-p0-preflight.md`

**Interfaces:**
- Produces: bản ghi tiền kiểm mà Task 8 và Task 9 dựa vào (billing/VM, migration `1789560000000`, khoá model, tài khoản diễn tập).

- [ ] **Step 1: Đo trạng thái migration trên DB trong `apps/api/.env` (chỉ-đọc)**

Run (từ `apps/api/`):
```bash
node -r ts-node/register -r dotenv/config -r tsconfig-paths/register ./node_modules/typeorm/cli.js migration:show -d src/database/data-source.ts 2>&1 | grep -E "^\s*\[ \]" 
```
Expected hôm 2026-10-12: đúng một dòng `[ ] AddClassNominalClass1789560000000`. Nếu có thêm dòng nào khác: dừng, ghi vào bản ghi, hỏi chủ đồ án.

- [ ] **Step 2: Kiểm cột `class.nominal_class_id` có trên DB thật không**

Run:
```bash
node -e "
const fs=require('fs'),{Client}=require('pg');
const u=fs.readFileSync('.env','utf8').match(/^DATABASE_URL=(.+)$/m)[1].trim().replace(/^[\"']|[\"']\$/g,'');
(async()=>{const c=new Client({connectionString:u,ssl:{rejectUnauthorized:false}});await c.connect();
const r=await c.query(\"SELECT 1 FROM information_schema.columns WHERE table_schema='examcollect' AND table_name='class' AND column_name='nominal_class_id'\");
console.log('cột nominal_class_id có trên DB thật:',r.rowCount>0);await c.end();})();"
```
Expected: `false` nếu migration chưa được áp. Đây là sự cố triển khai đã nêu ở spec §10.3 mục 1: production đã deploy `dc2d022` (PR #71) trong khi DB thật chưa có cột mà entity `Class` dùng.

- [ ] **Step 3: Áp migration `1789560000000` — CHỈ khi chủ đồ án đã cho phép bằng lời trong phiên này**

Nếu chủ đồ án đã đồng ý, chạy (nguyên tử, một transaction):
```bash
node -r ts-node/register -r dotenv/config -r tsconfig-paths/register ./node_modules/typeorm/cli.js migration:run -d src/database/data-source.ts -t all
```
Rồi chạy lại Step 1 (không còn dòng `[ ]`) và Step 2 (`true`). Nếu chưa được phép: **bỏ qua step này**, ghi "chưa áp — chờ chủ đồ án" vào bản ghi, và tiếp tục (Task 2–7 không phụ thuộc vào nó).

- [ ] **Step 4: Kiểm billing và VM sandbox của GCE (chỉ-đọc)**

Run:
```bash
gcloud compute instances list --project animated-moon-460103-m3 --format="table(name,zone.basename(),status)"
```
Expected khi billing bật: một dòng `instance-20260924-084904 … TERMINATED|RUNNING`. Nếu lỗi `requires billing to be enabled`: ghi vào bản ghi — **Task 8 và 9 chưa chạy được lượt thật**; áp dụng điều kiện kết thúc P0 ở spec §10.2 (3 ngày làm việc rồi P1a bắt đầu không chờ).

Nếu VM có và đang `TERMINATED`: **không tự bật**; hỏi chủ đồ án (VM tính tiền theo giờ, ghi chú memory: chủ đồ án muốn tắt VM mỗi khi xong việc). Khi được phép bật: `gcloud compute instances start instance-20260924-084904 --zone asia-northeast1-a --project animated-moon-460103-m3`. Worker là dịch vụ systemd `cine-sandbox`, tự nhận job khi VM lên.

- [ ] **Step 5: Kiểm khoá model có mặt (không in giá trị)**

Run:
```bash
grep -E "^(GRADING_TIER[1-5]_(BASE_URL|MODEL|API_KEY)|SANDBOX_REDIS_URL)=" .env | sed -E 's/=.*/=<đã đặt>/'
```
Expected: đủ ba biến cho ít nhất một bậc, và `SANDBOX_REDIS_URL`. Thiếu → ghi vào bản ghi và dừng Task 8–9.

- [ ] **Step 6: Ghi bản ghi tiền kiểm**

Tạo `docs/rehearsals/2026-10-12-p0-preflight.md` với bảng (điền kết quả thật của Step 1–5, không để trống):

```markdown
# Tiền kiểm P0 (2026-10-12)

| Điều kiện | Kết quả | Hành động |
|---|---|---|
| Migration chờ trên DB thật | (liệt kê tên các dòng `[ ]`) | (đã áp / chờ chủ đồ án) |
| Cột `class.nominal_class_id` | (true/false) | |
| GCP billing / VM sandbox | (lỗi billing / TERMINATED / RUNNING) | |
| Khoá model + SANDBOX_REDIS_URL | (đủ / thiếu gì) | |
| Mật khẩu tài khoản diễn tập `teo@gmail.com` | (đã có / cần hỏi chủ đồ án) | |
```

- [ ] **Step 7: Commit**

```bash
git add ../../docs/rehearsals/2026-10-12-p0-preflight.md
git commit -m "docs(p0): bản ghi tiền kiểm môi trường và migration"
```

---

### Task 2: `UsageSink` — gom token theo model

**Files:**
- Create: `src/grading/investigator/usage-sink.ts`
- Test: `src/grading/investigator/usage-sink.spec.ts`

**Interfaces:**
- Produces (các task sau dùng đúng các tên này):
  - `interface ModelUsage { inputTokens: number; outputTokens: number }`
  - `type UsageByModel = Record<string, ModelUsage>`
  - `const UNATTRIBUTED: string` = `'(không rõ model)'`
  - `class UsageSink { add(model: string, usage: ModelUsage): void; snapshot(): UsageByModel }`
  - `function mergeUsage(...parts: UsageByModel[]): UsageByModel`
  - `function totalOf(usage: UsageByModel): ModelUsage`

- [ ] **Step 1: Viết test thất bại**

```ts
// src/grading/investigator/usage-sink.spec.ts
import { mergeUsage, totalOf, UNATTRIBUTED, UsageSink } from './usage-sink';

describe('UsageSink', () => {
  it('cộng dồn token theo từng model', () => {
    const sink = new UsageSink();
    sink.add('A', { inputTokens: 100, outputTokens: 20 });
    sink.add('A', { inputTokens: 10, outputTokens: 5 });
    sink.add('B', { inputTokens: 1, outputTokens: 2 });
    expect(sink.snapshot()).toEqual({
      A: { inputTokens: 110, outputTokens: 25 },
      B: { inputTokens: 1, outputTokens: 2 },
    });
  });

  it('snapshot là bản sao: thêm sau đó không làm đổi bản đã chụp', () => {
    const sink = new UsageSink();
    sink.add('A', { inputTokens: 1, outputTokens: 1 });
    const first = sink.snapshot();
    sink.add('A', { inputTokens: 5, outputTokens: 5 });
    expect(first).toEqual({ A: { inputTokens: 1, outputTokens: 1 } });
  });

  it('hai sink độc lập không lẫn nhau', () => {
    const a = new UsageSink();
    const b = new UsageSink();
    a.add('A', { inputTokens: 7, outputTokens: 7 });
    expect(b.snapshot()).toEqual({});
  });

  it('UNATTRIBUTED là khoá thường, cộng như mọi model khác', () => {
    const sink = new UsageSink();
    sink.add(UNATTRIBUTED, { inputTokens: 3, outputTokens: 1 });
    expect(sink.snapshot()[UNATTRIBUTED]).toEqual({ inputTokens: 3, outputTokens: 1 });
  });
});

describe('mergeUsage / totalOf', () => {
  it('mergeUsage cộng theo model qua nhiều phần và không sửa đầu vào', () => {
    const p1 = { A: { inputTokens: 1, outputTokens: 2 } };
    const p2 = { A: { inputTokens: 10, outputTokens: 20 }, B: { inputTokens: 5, outputTokens: 5 } };
    expect(mergeUsage(p1, p2)).toEqual({
      A: { inputTokens: 11, outputTokens: 22 },
      B: { inputTokens: 5, outputTokens: 5 },
    });
    expect(p1).toEqual({ A: { inputTokens: 1, outputTokens: 2 } });
  });

  it('mergeUsage không có phần nào → rỗng', () => {
    expect(mergeUsage()).toEqual({});
  });

  it('totalOf cộng mọi model', () => {
    expect(totalOf({ A: { inputTokens: 1, outputTokens: 2 }, B: { inputTokens: 10, outputTokens: 20 } })).toEqual({
      inputTokens: 11,
      outputTokens: 22,
    });
    expect(totalOf({})).toEqual({ inputTokens: 0, outputTokens: 0 });
  });
});
```

- [ ] **Step 2: Chạy test, thấy nó thất bại**

Run: `npx jest src/grading/investigator/usage-sink.spec.ts`
Expected: FAIL — `Cannot find module './usage-sink'`.

- [ ] **Step 3: Viết cài đặt tối thiểu**

```ts
// src/grading/investigator/usage-sink.ts
/**
 * Token đã tiêu, tách theo model (P0 đo nền). Một lượt chấm xoay giữa nhiều bậc model, và bốn
 * lăng kính chạy thêm trên chính các bậc đó — nên chi phí chỉ tính đúng được khi biết MODEL NÀO
 * đã tiêu bao nhiêu. Thuần: không DB, không model (nằm trong `grading/investigator/`, nơi
 * `no-db.import-scan.spec.ts` cấm mọi đường tới DB).
 */
export interface ModelUsage {
  inputTokens: number;
  outputTokens: number;
}

export type UsageByModel = Record<string, ModelUsage>;

/**
 * Khoá cho token của lượt hỏng mà không biết thuộc model nào: `ModelsExhaustedError.usage` và
 * `DeadlineExceededError.usage` cộng dồn qua nhiều bậc đã thử. Có khoá này thì `costOf` biết
 * rằng tổng chi phí chỉ là cận dưới và trả `null` thay vì một con số thiếu.
 */
export const UNATTRIBUTED = '(không rõ model)';

/**
 * MỘT sink cho MỘT lượt chấm. Các lăng kính là singleton dùng chung cho mọi job đang chạy, nên
 * sink phải đi theo lời gọi (tham số), KHÔNG được là trạng thái của lăng kính — không thì token
 * của hai bài chấm đồng thời lẫn vào nhau.
 */
export class UsageSink {
  private readonly by: UsageByModel = {};

  add(model: string, usage: ModelUsage): void {
    const current = this.by[model] ?? { inputTokens: 0, outputTokens: 0 };
    this.by[model] = {
      inputTokens: current.inputTokens + usage.inputTokens,
      outputTokens: current.outputTokens + usage.outputTokens,
    };
  }

  snapshot(): UsageByModel {
    return JSON.parse(JSON.stringify(this.by)) as UsageByModel;
  }
}

export function mergeUsage(...parts: UsageByModel[]): UsageByModel {
  const sink = new UsageSink();
  for (const part of parts) for (const [model, usage] of Object.entries(part)) sink.add(model, usage);
  return sink.snapshot();
}

export function totalOf(usage: UsageByModel): ModelUsage {
  let inputTokens = 0;
  let outputTokens = 0;
  for (const u of Object.values(usage)) {
    inputTokens += u.inputTokens;
    outputTokens += u.outputTokens;
  }
  return { inputTokens, outputTokens };
}
```

- [ ] **Step 4: Chạy test, thấy xanh**

Run: `npx jest src/grading/investigator/usage-sink.spec.ts`
Expected: PASS (7 test).

- [ ] **Step 5: Commit**

```bash
git add src/grading/investigator/usage-sink.ts src/grading/investigator/usage-sink.spec.ts
git commit -m "feat(p0): UsageSink gom token theo model, một cái cho mỗi lượt chấm"
```

---

### Task 3: Ghi token theo model ở vòng điều tra và vòng lăng kính

**Files:**
- Modify: `src/grading/investigator/types.ts` (kiểu `InvestigationResult`, quanh dòng 181)
- Modify: `src/grading/investigator/investigate.ts` (dòng 116–170 và dòng 370)
- Modify: `src/grading/investigator/lens-loop.ts` (hàm `runLensLoop`, dòng 84–140)
- Modify: `src/grading/investigator/challenge.ts` (`ChallengeInput`, `challenge()`, `StoredChallenge`)
- Modify: `src/grading/investigator/case-lens.ts` (`CaseLens`, `runCaseLens`)
- Modify: `src/grading/investigator/lenses/{correctness,severity,omission,cheating}-lens.ts`
- Test: `src/grading/investigator/investigate.spec.ts`, `src/grading/investigator/lens-loop.spec.ts`, `src/grading/investigator/challenge.spec.ts`

**Interfaces:**
- Consumes: `UsageSink`, `UsageByModel`, `UNATTRIBUTED` (Task 2).
- Produces:
  - `InvestigationResult.usageByModel?: UsageByModel`
  - `runLensLoop(ctx, label, systemPrompt, userMessage, schema, parseReply, argsFor, extractConclusion, deps, sink?: UsageSink)` — tham số thứ 10 mới, tuỳ chọn
  - `ChallengeInput.usage?: UsageSink`
  - `challenge(verdict, ctx, toolCalls, challenger, sink?: UsageSink)`
  - `CaseLens.review(ctx, verdict, toolCalls, usage?: UsageSink)`
  - `runCaseLens(ctx, verdict, toolCalls, lens, sink?: UsageSink)`

- [ ] **Step 1: Viết ba test thất bại**

Thêm vào cuối `describe('investigate()', …)` trong `src/grading/investigator/investigate.spec.ts` (dùng sẵn `scripted`, `turn`, `final`, `call`, `deps`, `CTX`, `USAGE` đã khai ở đầu file; mỗi lời gọi model trả `USAGE` = 100 vào / 20 ra):

```ts
  it('P0 — usageByModel gom token theo từng model đã trả lời', async () => {
    const model = scripted('A', [turn(call('run_tests')), final([{ ruleKey: 'sai_ca_co_ban', toolCallIds: ['tc-1'], note: null }])]);
    const r = await investigate(CTX, deps([model]));
    // Hai lượt hỏi model, mỗi lượt USAGE 100 vào / 20 ra.
    expect(r.usageByModel).toEqual({ 'A-m': { inputTokens: 200, outputTokens: 40 } });
    expect(r.usage).toEqual({ inputTokens: 200, outputTokens: 40 });
  });
```

Thêm vào cuối `describe('runLensLoop()', …)` trong `src/grading/investigator/lens-loop.spec.ts` (đầu file thêm `import { Object… }` không cần; thêm import dưới đây):

```ts
import { badOutputError } from '../ai-provider/provider-failure';
import { UNATTRIBUTED, UsageSink } from './usage-sink';
```
```ts
  it('P0 — ghi token của từng lượt vào sink theo model', async () => {
    const sink = new UsageSink();
    const model = scripted([
      JSON.stringify({ action: 'call', calls: [{ tool: 'run_tests' }], conclusion: null }),
      JSON.stringify({ action: 'final', calls: [], conclusion: { status: 'confirmed' } }),
    ]);
    await runLensLoop(CTX, 'tinh_dung', 'system', 'user', SCHEMA, parse, argsFor, (reply) => reply.conclusion, { models: [model], sandbox: passAll() }, sink);
    // Hai lượt hỏi model, mỗi lượt USAGE 10 vào / 5 ra.
    expect(sink.snapshot()).toEqual({ 'A-m': { inputTokens: 20, outputTokens: 10 } });
  });

  it('P0 — mọi bậc hỏng: token của các lượt hỏng vào UNATTRIBUTED, không biến mất', async () => {
    const sink = new UsageSink();
    const dead: ModelTier = {
      label: 'A', model: 'A-m', ceiling: 0.5,
      async call() { throw Object.assign(badOutputError('cắt cụt'), { usage: USAGE }); },
    };
    const r = await runLensLoop(CTX, 'tinh_dung', 'system', 'user', SCHEMA, parse, argsFor, (reply) => reply.conclusion, { models: [dead], sandbox: passAll() }, sink);
    expect(r.conclusion).toBeNull();
    // bad_output: thử lại cùng bậc MỘT lần rồi loại → 2 lượt hỏng × USAGE (10 vào / 5 ra).
    expect(sink.snapshot()).toEqual({ [UNATTRIBUTED]: { inputTokens: 20, outputTokens: 10 } });
  });

  it('P0 — không truyền sink thì hành vi cũ không đổi', async () => {
    const model = scripted([JSON.stringify({ action: 'final', calls: [], conclusion: { status: 'refuted' } })]);
    const r = await runLensLoop(CTX, 'tinh_dung', 'system', 'user', SCHEMA, parse, argsFor, (reply) => reply.conclusion, { models: [model], sandbox: passAll() });
    expect(r.conclusion).toEqual({ status: 'refuted' });
  });
```

Thêm vào cuối `describe('challenge() — ranh giới §12.5', …)` trong `src/grading/investigator/challenge.spec.ts`:

```ts
  it('P0 — challenge() chuyển sink cho lăng kính qua ChallengeInput.usage', async () => {
    const { UsageSink } = await import('./usage-sink');
    const sink = new UsageSink();
    let got: ChallengeInput | undefined;
    const probe: Challenger = {
      name: 'dò',
      async review(input) {
        got = input;
        input.usage?.add('M', { inputTokens: 4, outputTokens: 2 });
        return { status: 'confirmed', toolCallIds: [] };
      },
    };
    await challenge(PLANTED, CTX, [EVIDENCE], probe, sink);
    expect(got?.usage).toBe(sink);
    expect(sink.snapshot()).toEqual({ M: { inputTokens: 4, outputTokens: 2 } });
  });

  it('P0 — không truyền sink thì ChallengeInput.usage là undefined (hành vi cũ)', async () => {
    let got: ChallengeInput | undefined;
    await challenge(PLANTED, CTX, [EVIDENCE], { name: 'x', async review(i) { got = i; return { status: 'confirmed', toolCallIds: [] }; } });
    expect(got?.usage).toBeUndefined();
  });
```

- [ ] **Step 2: Chạy ba file test, thấy các ca mới thất bại**

Run: `npx jest src/grading/investigator/investigate.spec.ts src/grading/investigator/lens-loop.spec.ts src/grading/investigator/challenge.spec.ts`
Expected: các ca mới FAIL (`usageByModel` là `undefined`; `runLensLoop` không nhận tham số thứ 10; `usage` không có trên `ChallengeInput`) — kể cả lỗi biên dịch TS của ts-jest là chấp nhận được ở bước này.

- [ ] **Step 3: `types.ts` — thêm trường tuỳ chọn**

Trong `src/grading/investigator/types.ts`, thêm import ở đầu file:
```ts
import type { UsageByModel } from './usage-sink';
```
và sửa kiểu `InvestigationResult` (dòng có `usage: { inputTokens: number; outputTokens: number };`):
```ts
  usage: { inputTokens: number; outputTokens: number };
  /**
   * Cùng số token của `usage` nhưng tách theo model đã tiêu (P0 đo nền). Tuỳ chọn để mọi nơi dựng
   * `InvestigationResult` bằng tay (test, fixture) không phải đổi. Token của lượt hỏng không rõ
   * model nằm ở khoá `UNATTRIBUTED`.
   */
  usageByModel?: UsageByModel;
```

- [ ] **Step 4: `investigate.ts` — gom theo model**

Thêm import ở đầu file:
```ts
import { UNATTRIBUTED, UsageSink } from './usage-sink';
```
Ngay dưới khai báo `let outputTokens = 0;` (dòng ~126) thêm:
```ts
  const usageSink = new UsageSink();
```
Trong khối `catch (error)` của `ask`, ngay sau hai dòng `inputTokens += error.usage.inputTokens; outputTokens += error.usage.outputTokens;` thêm (cùng trong khối `if (error instanceof ModelsExhaustedError || error instanceof DeadlineExceededError)`):
```ts
        usageSink.add(UNATTRIBUTED, error.usage);
```
Ngay sau hai dòng `inputTokens += reply.usage.inputTokens; outputTokens += reply.usage.outputTokens;` thêm:
```ts
    usageSink.add(reply.model, reply.usage);
```
Ở câu `return {` cuối hàm, sau dòng `usage: { inputTokens, outputTokens },` thêm:
```ts
    usageByModel: usageSink.snapshot(),
```

- [ ] **Step 5: `lens-loop.ts` — nhận sink**

Thêm import ở đầu file:
```ts
import { UNATTRIBUTED, UsageSink } from './usage-sink';
```
Thêm tham số cuối của `runLensLoop` (sau `deps: LensDeps,`):
```ts
  deps: LensDeps,
  /** MỘT sink cho MỘT lượt chấm (P0): lăng kính là singleton nên sink đi theo lời gọi, không ở trong lăng kính. */
  sink?: UsageSink,
```
Thay hàm `ask` bằng:
```ts
  const ask = async () => {
    const reply = await pool.ask(
      { system: systemPrompt, messages: messages.slice(), schemaName: 'lens_turn', schema, maxTokens: 2_048, timeoutMs: 60_000 },
      parseReply,
      { deadline, now },
    );
    sink?.add(reply.model, reply.usage);
    return reply;
  };
```
Trong khối `catch (error)` của vòng lặp, thay hai dòng xử lý lỗi bằng:
```ts
      if (error instanceof ModelsExhaustedError) {
        sink?.add(UNATTRIBUTED, error.usage);
        return failed('models_exhausted', error.reasons.join('; '));
      }
      if (error instanceof DeadlineExceededError) {
        sink?.add(UNATTRIBUTED, error.usage);
        return failed('deadline');
      }
```

- [ ] **Step 6: `challenge.ts` và `case-lens.ts` — đưa sink qua giao diện**

`src/grading/investigator/challenge.ts`: thêm import `import type { UsageSink } from './usage-sink';`; thêm vào `ChallengeInput`:
```ts
  /** Sink token của lượt chấm đang xét (P0). Lăng kính chuyển nó cho `runLensLoop`. */
  usage?: UsageSink;
```
Sửa chữ ký và thân `challenge()`:
```ts
export async function challenge(
  verdict: Verdict,
  ctx: InvestigationContext,
  toolCalls: ToolCall[],
  challenger: Challenger,
  sink?: UsageSink,
): Promise<ChallengeConclusion> {
```
và trong `const input: ChallengeInput = {` thêm dòng `usage: sink,` sau `evidence: …,`. Ở `StoredChallenge` **không** thêm trường nào (token được trả riêng ở Task 4, hồ sơ lưu giữ nguyên hình dạng).

`src/grading/investigator/case-lens.ts`: thêm `import type { UsageSink } from './usage-sink';`, sửa:
```ts
export interface CaseLens {
  readonly name: string;
  review(ctx: InvestigationContext, verdict: Verdict, toolCalls: ToolCall[], usage?: UsageSink): Promise<CaseLensNote>;
}

export async function runCaseLens(
  ctx: InvestigationContext,
  verdict: Verdict,
  toolCalls: ToolCall[],
  lens: CaseLens,
  sink?: UsageSink,
): Promise<CaseLensNote> {
  try {
    return await lens.review(ctx, verdict, toolCalls, sink);
  } catch {
    return { lens: lens.name, suspected: false, note: 'không đọc được ý kiến của lăng kính này' };
  }
}
```

- [ ] **Step 7: Bốn lăng kính chuyển sink cho `runLensLoop`**

Trong mỗi file, thêm `import type { UsageSink } from '../usage-sink';` ở đầu.

- `lenses/correctness-lens.ts` và `lenses/severity-lens.ts`: trong lời gọi `runLensLoop(` đổi đối số cuối `this.deps,` thành
```ts
      this.deps,
      input.usage,
```
- `lenses/omission-lens.ts` và `lenses/cheating-lens.ts`: đổi chữ ký `async review(ctx: InvestigationContext, verdict: Verdict, _toolCalls: ToolCall[]): Promise<CaseLensNote> {` thành
```ts
  async review(ctx: InvestigationContext, verdict: Verdict, _toolCalls: ToolCall[], usage?: UsageSink): Promise<CaseLensNote> {
```
và đối số cuối `this.deps,` của `runLensLoop(` thành
```ts
      this.deps,
      usage,
```

- [ ] **Step 8: Chạy test, thấy xanh, rồi kiểm kiểu**

Run: `npx jest src/grading/investigator`
Expected: PASS toàn thư mục (bao gồm các ca cũ không sửa).
Run: `npx tsc --noEmit -p tsconfig.json`
Expected: không lỗi mới (chỉ các lỗi nền đã biết nếu có; so với `git stash`-free baseline bằng cách chạy lại trước khi sửa nếu cần).
Run: `npx jest src/eval/no-db.import-scan.spec.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/grading/investigator
git commit -m "feat(p0): ghi token theo model ở vòng điều tra và bốn lăng kính (UsageSink)"
```

---

### Task 4: `runChallengePhase` — một pha phản biện cho đường chấm thật và eval

Chuyển **nguyên văn** logic của `InvestigatorRunService.runChallenge` sang một hàm thuần, thêm đo token. Hành vi của đường chấm thật không đổi.

**Files:**
- Create: `src/grading/investigator/challenge-phase.ts`
- Test: `src/grading/investigator/challenge-phase.spec.ts`
- Modify: `src/grading/pipeline/investigator-run.service.ts` (hàm `runChallenge`, dòng 122–133, và chỗ gọi dòng 60)

**Interfaces:**
- Consumes: `challenge`, `Challenger`, `StoredChallenge` (`./challenge`); `CaseLens`, `runCaseLens` (`./case-lens`); `UsageSink`, `UsageByModel` (Task 2); tham số sink của Task 3.
- Produces:
  - `interface ChallengePhaseDeps { challengers: readonly Challenger[]; caseLenses: readonly CaseLens[] }`
  - `interface ChallengePhaseResult { challenge: StoredChallenge | null; usageByModel: UsageByModel }`
  - `function runChallengePhase(result: InvestigationResult, ctx: InvestigationContext, deps: ChallengePhaseDeps): Promise<ChallengePhaseResult>`

- [ ] **Step 1: Viết test thất bại**

```ts
// src/grading/investigator/challenge-phase.spec.ts
import { CaseLens } from './case-lens';
import { Challenger } from './challenge';
import { runChallengePhase } from './challenge-phase';
import { CTX } from './testing/context';
import { InvestigationResult, ToolCall, Verdict } from './types';
import { UNATTRIBUTED } from './usage-sink';
import { resultWith } from '../decision/testing/result';

const verdictOf = (ruleKeys: string[]): Verdict => ({
  errors: ruleKeys.map((ruleKey) => ({ ruleKey, toolCallIds: ['tc-1'], note: null })),
  missingRules: [],
  injectionAttempt: { detected: false, excerpt: null },
});

function investigated(ruleKeys: string[]): InvestigationResult {
  return { ...resultWith({}), verdict: verdictOf(ruleKeys) } as InvestigationResult;
}

const spend = (model: string, i: number, o: number): Challenger => ({
  name: `lens-${model}`,
  async review(input) {
    input.usage?.add(model, { inputTokens: i, outputTokens: o });
    return { status: 'confirmed', toolCallIds: [] };
  },
});
const caseSpend = (model: string, i: number, o: number): CaseLens => ({
  name: `case-${model}`,
  async review(_ctx, _verdict, _calls, usage) {
    usage?.add(model, { inputTokens: i, outputTokens: o });
    return { lens: `case-${model}`, suspected: false, note: 'ok' };
  },
});

describe('runChallengePhase()', () => {
  it('không có verdict → không phản biện, không token', async () => {
    const r = await runChallengePhase({ ...resultWith({}), verdict: null } as InvestigationResult, CTX, { challengers: [spend('M', 1, 1)], caseLenses: [] });
    expect(r).toEqual({ challenge: null, usageByModel: {} });
  });

  it('không có lăng kính per-error nào (sandbox null) → null, như hành vi cũ', async () => {
    const r = await runChallengePhase(investigated(['chu_thich_sai']), CTX, { challengers: [], caseLenses: [caseSpend('M', 1, 1)] });
    expect(r).toEqual({ challenge: null, usageByModel: {} });
  });

  it('gom token của cả lăng kính per-error lẫn cấp bài theo model', async () => {
    const r = await runChallengePhase(investigated(['chu_thich_sai']), CTX, {
      challengers: [spend('A', 10, 2), spend('A', 5, 1)],
      caseLenses: [caseSpend('B', 7, 3)],
    });
    expect(r.challenge?.perError).toHaveLength(2);
    expect(r.challenge?.caseNotes).toHaveLength(1);
    expect(r.usageByModel).toEqual({ A: { inputTokens: 15, outputTokens: 3 }, B: { inputTokens: 7, outputTokens: 3 } });
  });

  it('lỗi luật MÁY QUYẾT không gửi cho lăng kính per-error (giữ nguyên hành vi cũ), lăng kính cấp bài vẫn thấy đủ verdict', async () => {
    const seenErrors: string[][] = [];
    const per: Challenger = {
      name: 'dò',
      async review(input) { seenErrors.push([input.error.ruleKey]); return { status: 'confirmed', toolCallIds: [] }; },
    };
    let caseSaw: string[] = [];
    const cl: CaseLens = {
      name: 'c',
      async review(_ctx, verdict) { caseSaw = verdict.errors.map((e) => e.ruleKey); return { lens: 'c', suspected: false, note: '' }; },
    };
    // CTX: sai_ca_co_ban là luật máy quyết (checkedBy: 'machine'), chu_thich_sai là luật model.
    await runChallengePhase(investigated(['sai_ca_co_ban', 'chu_thich_sai']), CTX, { challengers: [per], caseLenses: [cl] });
    expect(seenErrors).toEqual([['chu_thich_sai']]);
    expect(caseSaw).toEqual(['sai_ca_co_ban', 'chu_thich_sai']);
  });

  it('Review Focus 1 — lăng kính hỏng nhưng đã tiêu token: token vẫn vào sổ', async () => {
    const broken: Challenger = {
      name: 'hỏng',
      async review(input) { input.usage?.add(UNATTRIBUTED, { inputTokens: 9, outputTokens: 1 }); throw new Error('bad_output'); },
    };
    const r = await runChallengePhase(investigated(['chu_thich_sai']), CTX, { challengers: [broken], caseLenses: [] });
    expect(r.challenge?.perError[0].perError[0].status).toBe('unverified');
    expect(r.usageByModel).toEqual({ [UNATTRIBUTED]: { inputTokens: 9, outputTokens: 1 } });
  });

  it('Review Focus 2 — hai lượt chấm đồng thời dùng CHUNG lăng kính: token không lẫn nhau', async () => {
    const shared = spend('A', 10, 1); // MỘT lăng kính singleton cho cả hai lượt
    const [r1, r2] = await Promise.all([
      runChallengePhase(investigated(['chu_thich_sai']), CTX, { challengers: [shared], caseLenses: [] }),
      runChallengePhase(investigated(['chu_thich_sai']), CTX, { challengers: [shared, shared], caseLenses: [] }),
    ]);
    expect(r1.usageByModel).toEqual({ A: { inputTokens: 10, outputTokens: 1 } });
    expect(r2.usageByModel).toEqual({ A: { inputTokens: 20, outputTokens: 2 } });
  });
});
```

- [ ] **Step 2: Chạy test, thấy thất bại**

Run: `npx jest src/grading/investigator/challenge-phase.spec.ts`
Expected: FAIL — `Cannot find module './challenge-phase'`.

- [ ] **Step 3: Viết cài đặt**

```ts
// src/grading/investigator/challenge-phase.ts
import { CaseLens, runCaseLens } from './case-lens';
import { challenge, Challenger, StoredChallenge } from './challenge';
import { InvestigationContext, InvestigationResult, Verdict } from './types';
import { UsageByModel, UsageSink } from './usage-sink';

export interface ChallengePhaseDeps {
  /** Tính đúng / Quá tay (§6.2) — nối vào điểm. */
  challengers: readonly Challenger[];
  /** Bỏ sót / Gian lận — chỉ gắn cờ, không đổi điểm. */
  caseLenses: readonly CaseLens[];
}

export interface ChallengePhaseResult {
  challenge: StoredChallenge | null;
  /** Token của MỌI lăng kính trong lượt này, theo model. Rỗng khi không có pha phản biện. */
  usageByModel: UsageByModel;
}

/**
 * Pha phản biện của MỘT lượt chấm (§6). Chuyển nguyên văn từ `InvestigatorRunService.runChallenge`
 * sang một hàm thuần để đường chấm thật và runner eval chạy ĐÚNG MỘT đoạn mã (spec §11: eval phải
 * chạy cả phản biện, nếu không thì các số đo của nó không nói gì về hệ thống thật).
 *
 * Bốn lăng kính chạy SONG SONG; một lăng kính hỏng không làm hỏng lượt chấm (`challenge()` bọc lỗi
 * từng `Challenger` thành `unverified`, `runCaseLens()` bọc thành `suspected: false`). Lỗi của luật
 * MÁY QUYẾT không gửi cho `Challenger` (§4.1: code đã đo, không phải ý kiến để tranh luận);
 * `CaseLens` vẫn nhận verdict ĐẦY ĐỦ vì chúng đánh giá cả bài.
 *
 * Mỗi lời gọi tạo MỘT `UsageSink` riêng: các lăng kính là singleton dùng chung cho mọi job đang
 * chạy nên token không được gom vào trạng thái của chúng.
 */
export async function runChallengePhase(
  result: InvestigationResult,
  ctx: InvestigationContext,
  deps: ChallengePhaseDeps,
): Promise<ChallengePhaseResult> {
  const sink = new UsageSink();
  if (!result.verdict || deps.challengers.length === 0) return { challenge: null, usageByModel: sink.snapshot() };
  const verdict = result.verdict;
  const toolCalls = result.investigation.toolCalls;
  const machineRuleKeys = new Set(ctx.rules.filter((r) => r.checkedBy === 'machine').map((r) => r.ruleKey));
  const challengeable: Verdict = { ...verdict, errors: verdict.errors.filter((e) => !machineRuleKeys.has(e.ruleKey)) };
  const [perError, caseNotes] = await Promise.all([
    Promise.all(deps.challengers.map((c) => challenge(challengeable, ctx, toolCalls, c, sink))),
    Promise.all(deps.caseLenses.map((l) => runCaseLens(ctx, verdict, toolCalls, l, sink))),
  ]);
  return { challenge: { perError, caseNotes }, usageByModel: sink.snapshot() };
}
```

- [ ] **Step 4: Chạy test, thấy xanh**

Run: `npx jest src/grading/investigator/challenge-phase.spec.ts`
Expected: PASS (6 test).

- [ ] **Step 5: Đường chấm thật dùng hàm mới (chưa ghi cost — Task 5 làm)**

Trong `src/grading/pipeline/investigator-run.service.ts`:

Thêm import (xoá import `challenge`, `runCaseLens`, `Verdict` nếu không còn dùng):
```ts
import { runChallengePhase } from '../investigator/challenge-phase';
import { mergeUsage } from '../investigator/usage-sink';
```
Thay dòng `const challengeResult = await this.runChallenge(result, built.ctx);` bằng:
```ts
    const phase = await runChallengePhase(result, built.ctx, {
      challengers: this.deps.challengers,
      caseLenses: this.deps.caseLenses,
    });
    const challengeResult = phase.challenge;
```
Xoá hàm `private async runChallenge(...)` (dòng 122–133) cùng khối chú thích của nó — logic đã chuyển nguyên văn sang `challenge-phase.ts`. Giữ nguyên mọi dòng còn lại của `run()`. (Biến `phase` sẽ được dùng ở Task 5; chưa dùng `mergeUsage` ở step này thì xoá dòng import `mergeUsage` đi và thêm lại ở Task 5.)

- [ ] **Step 6: Chạy test đường chấm thật không đổi hành vi**

Run: `npx jest src/grading/pipeline`
Expected: PASS (không sửa test nào).
Nếu hạ tầng e2e sẵn sàng (Postgres + Redis + MinIO + bucket): `npx jest --config test/jest-e2e.json test/investigator-end-to-end.e2e-spec.ts`
Expected: PASS như trước khi sửa.

- [ ] **Step 7: Commit**

```bash
git add src/grading/investigator/challenge-phase.ts src/grading/investigator/challenge-phase.spec.ts src/grading/pipeline/investigator-run.service.ts
git commit -m "refactor(p0): tách pha phản biện thành runChallengePhase dùng chung, kèm đo token"
```

---

### Task 5: Ghi `prompt_version`, `usage_by_model` và `cost_usd` cho mỗi lượt chấm

**Files:**
- Create: `src/grading/investigator/pricing.ts`, `src/grading/investigator/pricing.spec.ts`
- Create: `src/grading/investigator/prompt-version.ts`, `src/grading/investigator/prompt-version.spec.ts`
- Create: `src/database/migrations/1789570000000-AttemptUsageAndPrompt.ts`
- Modify: `src/grading/investigator/model-pool.ts` (`ModelTier`, `buildInvestigatorTiers`)
- Modify: `src/grading/pipeline/investigator-deps.ts` (giao diện `InvestigatorDeps`, hàm `buildInvestigatorDeps`)
- Modify: `src/grading/entities/grading-attempt.entity.ts`
- Modify: `src/grading/scoring/score.service.ts` (`AttemptMeta`, hai câu `UPDATE grading_attempt`)
- Modify: `src/grading/pipeline/investigator-run.service.ts`
- Modify: `.env.example`
- Test: `test/finish-attempt.e2e-spec.ts`

**Interfaces:**
- Consumes: `UsageByModel`, `UNATTRIBUTED`, `mergeUsage`, `totalOf` (Task 2); `runChallengePhase` và `phase.usageByModel` (Task 4); `InvestigationResult.usageByModel` (Task 3).
- Produces:
  - `interface ModelPrice { inPerMTok: number; outPerMTok: number }`
  - `function readPrice(env: NodeJS.ProcessEnv, index: number): ModelPrice | undefined`
  - `function costOf(usage: UsageByModel, priceOf: (model: string) => ModelPrice | undefined): number | null`
  - `function promptVersionOf(): string` (12 ký tự hex)
  - `ModelTier.price?: ModelPrice`; `InvestigatorDeps.priceOf?(model: string): ModelPrice | undefined`
  - `AttemptMeta.promptVersion?: string | null`, `AttemptMeta.usageByModel?: { investigation: UsageByModel; challenge: UsageByModel } | null`, `AttemptMeta.costUsd?: number | null`

- [ ] **Step 1: Viết test thất bại cho giá và phiên bản prompt**

```ts
// src/grading/investigator/pricing.spec.ts
import { costOf, readPrice } from './pricing';
import { UNATTRIBUTED } from './usage-sink';

const P = { inPerMTok: 3, outPerMTok: 15 };

describe('readPrice()', () => {
  it('đọc đủ hai biến dương → giá', () => {
    expect(readPrice({ GRADING_TIER1_PRICE_IN_PER_MTOK: '3', GRADING_TIER1_PRICE_OUT_PER_MTOK: '15' }, 1)).toEqual(P);
  });
  it('thiếu một trong hai → không có giá (không đoán)', () => {
    expect(readPrice({ GRADING_TIER1_PRICE_IN_PER_MTOK: '3' }, 1)).toBeUndefined();
    expect(readPrice({}, 1)).toBeUndefined();
  });
  it('giá rỗng, 0, âm hay không phải số → không có giá (Number("") là 0)', () => {
    for (const bad of ['', '0', '-1', 'abc', 'NaN', 'Infinity']) {
      expect(readPrice({ GRADING_TIER2_PRICE_IN_PER_MTOK: bad, GRADING_TIER2_PRICE_OUT_PER_MTOK: '15' }, 2)).toBeUndefined();
    }
  });
});

describe('costOf()', () => {
  it('một model có giá: (vào × giá vào + ra × giá ra) / 1.000.000, làm tròn 4 chữ số', () => {
    const usage = { A: { inputTokens: 200_000, outputTokens: 10_000 } };
    // 0,2M × 3 + 0,01M × 15 = 0,6 + 0,15 = 0,75
    expect(costOf(usage, () => P)).toBe(0.75);
  });
  it('nhiều model, mỗi model giá riêng', () => {
    const usage = { A: { inputTokens: 1_000_000, outputTokens: 0 }, B: { inputTokens: 0, outputTokens: 1_000_000 } };
    const priceOf = (m: string) => (m === 'A' ? { inPerMTok: 1, outPerMTok: 2 } : { inPerMTok: 10, outPerMTok: 20 });
    expect(costOf(usage, priceOf)).toBe(21);
  });
  it('Review Focus 3 — một model có token mà không có giá → null, KHÔNG phải 0 hay số thiếu', () => {
    const usage = { A: { inputTokens: 100, outputTokens: 10 }, B: { inputTokens: 100, outputTokens: 10 } };
    expect(costOf(usage, (m) => (m === 'A' ? P : undefined))).toBeNull();
  });
  it('Review Focus 3 — có token không rõ model → null (chỉ là cận dưới)', () => {
    expect(costOf({ A: { inputTokens: 1, outputTokens: 1 }, [UNATTRIBUTED]: { inputTokens: 5, outputTokens: 5 } }, () => P)).toBeNull();
  });
  it('model không tiêu token nào thì không cần giá', () => {
    expect(costOf({ A: { inputTokens: 0, outputTokens: 0 } }, () => undefined)).toBe(0);
  });
  it('không dùng model nào → 0 (không phải null): lượt chấm chưa gọi model', () => {
    expect(costOf({}, () => undefined)).toBe(0);
  });
});
```

```ts
// src/grading/investigator/prompt-version.spec.ts
import { promptVersionOf } from './prompt-version';

describe('promptVersionOf()', () => {
  it('12 ký tự hex, ổn định giữa các lần gọi', () => {
    expect(promptVersionOf()).toMatch(/^[0-9a-f]{12}$/);
    expect(promptVersionOf()).toBe(promptVersionOf());
  });
});
```

- [ ] **Step 2: Chạy, thấy thất bại**

Run: `npx jest src/grading/investigator/pricing.spec.ts src/grading/investigator/prompt-version.spec.ts`
Expected: FAIL — không tìm thấy module.

- [ ] **Step 3: Viết `pricing.ts` và `prompt-version.ts`**

```ts
// src/grading/investigator/pricing.ts
import { UNATTRIBUTED, UsageByModel } from './usage-sink';

/** Giá một model, USD cho MỘT TRIỆU token. */
export interface ModelPrice {
  inPerMTok: number;
  outPerMTok: number;
}

const positive = (raw: string | undefined): number | undefined => {
  const trimmed = raw?.trim();
  if (!trimmed) return undefined; // Number('') là 0 — một giá 0 âm thầm làm chi phí trông như miễn phí.
  const n = Number(trimmed);
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

/**
 * Giá của bậc `index` từ env. CẦN CẢ HAI biến; thiếu một thì không có giá. Không có bảng giá nào
 * trong code: giá đổi theo gateway và theo hợp đồng, và một con số do người viết mã đoán là cách
 * chắc chắn nhất để báo cáo chi phí sai mà trông có vẻ đáng tin.
 */
export function readPrice(env: NodeJS.ProcessEnv, index: number): ModelPrice | undefined {
  const inPerMTok = positive(env[`GRADING_TIER${index}_PRICE_IN_PER_MTOK`]);
  const outPerMTok = positive(env[`GRADING_TIER${index}_PRICE_OUT_PER_MTOK`]);
  return inPerMTok !== undefined && outPerMTok !== undefined ? { inPerMTok, outPerMTok } : undefined;
}

/**
 * Chi phí của một lượt, hoặc `null` khi không biết chắc: có model tiêu token mà không có giá, hay
 * có token không rõ model (`UNATTRIBUTED` — tổng chỉ là cận dưới). `null` chứ KHÔNG phải một số
 * thiếu: số thiếu vào báo cáo chi phí sẽ thành "rẻ hơn thật".
 */
export function costOf(usage: UsageByModel, priceOf: (model: string) => ModelPrice | undefined): number | null {
  let usd = 0;
  for (const [model, u] of Object.entries(usage)) {
    if (u.inputTokens === 0 && u.outputTokens === 0) continue;
    if (model === UNATTRIBUTED) return null;
    const price = priceOf(model);
    if (!price) return null;
    usd += (u.inputTokens * price.inPerMTok + u.outputTokens * price.outPerMTok) / 1_000_000;
  }
  return Math.round(usd * 10_000) / 10_000;
}
```

```ts
// src/grading/investigator/prompt-version.ts
import { createHash } from 'node:crypto';
import { INVESTIGATOR_SYSTEM_PROMPT } from './protocol';

/**
 * Phiên bản prompt của AGENT ĐIỀU TRA: 12 ký tự đầu của SHA-256 system prompt. Đổi một byte là đổi
 * mã — nên một bản ghi chấm trả lời được "lượt này chạy với prompt nào" mà không cần đoán theo
 * commit. GIỚI HẠN ĐÃ BIẾT: system prompt của bốn lăng kính là hằng cục bộ trong từng file lăng
 * kính, chưa nằm trong băm này; thêm chúng vào là việc riêng khi cần.
 */
export function promptVersionOf(): string {
  return createHash('sha256').update(INVESTIGATOR_SYSTEM_PROMPT).digest('hex').slice(0, 12);
}
```

- [ ] **Step 4: Chạy, thấy xanh**

Run: `npx jest src/grading/investigator/pricing.spec.ts src/grading/investigator/prompt-version.spec.ts`
Expected: PASS.

- [ ] **Step 5: Giá đi theo bậc model**

`src/grading/investigator/model-pool.ts`: thêm import `import { ModelPrice, readPrice } from './pricing';`, thêm vào `interface ModelTier`:
```ts
  /** Giá của bậc (env `GRADING_TIER<n>_PRICE_*`); thiếu thì chi phí lượt dùng bậc này là `null`. */
  price?: ModelPrice;
```
và trong `buildInvestigatorTiers`, đối tượng `tiers.push({ … })` thêm `price: readPrice(process.env, index),` sau `ceiling: config.ceiling,`.

`src/grading/pipeline/investigator-deps.ts`: thêm import `import type { ModelPrice } from '../investigator/pricing';`, thêm vào `interface InvestigatorDeps`:
```ts
  /** Giá của model (P0 đo nền); tuỳ chọn để mọi nơi dựng deps bằng tay không phải đổi. */
  priceOf?(model: string): ModelPrice | undefined;
```
và trong `buildInvestigatorDeps`, dưới `const ceilings = new Map(...)` thêm `const prices = new Map(models.map((m) => [m.model, m.price]));`, và trong đối tượng trả về thêm `priceOf: (model) => prices.get(model),` sau dòng `ceilingOf: …`.

- [ ] **Step 6: Migration và entity**

```ts
// src/database/migrations/1789570000000-AttemptUsageAndPrompt.ts
import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * P0 đo nền: hai cột cho `grading_attempt`, chỉ thêm, cho phép rỗng, không backfill (lượt cũ không
 * có số liệu này và không bịa ra). `cost_usd` đã có từ `1789450000000` nhưng chưa ai ghi.
 *
 * Trigger `guard_grading_attempt_immutable` chỉ chặn UPDATE khi `OLD.outcome IS NOT NULL`; các cột
 * mới được ghi trong CÙNG câu `UPDATE` đặt `outcome`, nên không bị chặn.
 */
export class AttemptUsageAndPrompt1789570000000 implements MigrationInterface {
  name = 'AttemptUsageAndPrompt1789570000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "examcollect"."grading_attempt" ADD COLUMN "prompt_version" character varying(40)`);
    await queryRunner.query(`ALTER TABLE "examcollect"."grading_attempt" ADD COLUMN "usage_by_model" jsonb`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "examcollect"."grading_attempt" DROP COLUMN IF EXISTS "usage_by_model"`);
    await queryRunner.query(`ALTER TABLE "examcollect"."grading_attempt" DROP COLUMN IF EXISTS "prompt_version"`);
  }
}
```

Trong `src/grading/entities/grading-attempt.entity.ts`, ngay sau cột `costUsd`, thêm:
```ts
  /** Băm system prompt của agent điều tra lúc chạy (P0); NULL với lượt chạy trước P0. */
  @Column({ name: 'prompt_version', type: 'varchar', length: 40, nullable: true })
  promptVersion!: string | null;

  /** `{ investigation, challenge }` — mỗi phần là token theo model (P0); NULL với lượt chạy trước P0. */
  @Column({ name: 'usage_by_model', type: 'jsonb', nullable: true })
  usageByModel!: Record<string, unknown> | null;
```

- [ ] **Step 7: Viết hai test e2e thất bại**

Thêm vào `test/finish-attempt.e2e-spec.ts`, ngay sau ca `'ra điểm: …'` (dùng sẵn `world`, `running`, `storedWith`, `SEEN`, `META`, `ds`, `scores`):

```ts
  it('P0 — ghi prompt_version, usage_by_model và cost_usd trong CÙNG câu UPDATE đặt outcome (trigger bất biến không chặn)', async () => {
    const ctx = await world('fa-usage');
    const r = await running(ctx);
    const usageByModel = {
      investigation: { m: { inputTokens: 100, outputTokens: 20 } },
      challenge: { m: { inputTokens: 50, outputTokens: 10 } },
    };
    const out = await scores.finishAttempt(r.resultId, r.attemptId, storedWith(SEEN), {
      ...META,
      promptVersion: 'abc123def456',
      usageByModel,
      costUsd: 0.0123,
    });
    expect(out).toMatchObject({ kind: 'scored' });
    const [a] = await ds.query(
      `SELECT outcome, prompt_version, usage_by_model, cost_usd FROM examcollect.grading_attempt WHERE id = $1`,
      [r.attemptId],
    );
    expect(a.outcome).toBe('graded');
    expect(a.prompt_version).toBe('abc123def456');
    expect(a.usage_by_model).toEqual(usageByModel);
    expect(Number(a.cost_usd)).toBeCloseTo(0.0123, 4);
  });

  it('P0 — không khai gì thì ba cột mới là NULL (hành vi cũ không đổi)', async () => {
    const ctx = await world('fa-usage-none');
    const r = await running(ctx);
    await scores.finishAttempt(r.resultId, r.attemptId, storedWith(SEEN), META);
    const [a] = await ds.query(
      `SELECT prompt_version, usage_by_model, cost_usd FROM examcollect.grading_attempt WHERE id = $1`,
      [r.attemptId],
    );
    expect(a).toEqual({ prompt_version: null, usage_by_model: null, cost_usd: null });
  });

  it('P0 — lượt không chấm được vẫn ghi token đã tiêu (điều tra tốn tiền dù bài ra ungradable)', async () => {
    const ctx = await world('fa-usage-ungradable');
    const r = await running(ctx);
    const stored: StoredInvestigation = {
      ...storedWith(SEEN),
      result: resultWith({ kind: 'ungradable', ungradable: { class: 'submission', reason: 'bài nộp không có dòng mã nào (T-EMPTY-1)' } }),
    };
    const usageByModel = { investigation: { m: { inputTokens: 7, outputTokens: 3 } }, challenge: {} };
    await scores.finishAttempt(r.resultId, r.attemptId, stored, { ...META, promptVersion: 'fff000fff000', usageByModel, costUsd: null });
    const [a] = await ds.query(
      `SELECT outcome, prompt_version, usage_by_model, cost_usd FROM examcollect.grading_attempt WHERE id = $1`,
      [r.attemptId],
    );
    expect(a.outcome).toBe('ungradable');
    expect(a.prompt_version).toBe('fff000fff000');
    expect(a.usage_by_model).toEqual(usageByModel);
    expect(a.cost_usd).toBeNull();
  });
```

- [ ] **Step 8: Chạy e2e, thấy thất bại**

Chuẩn bị (một lần): `docker compose up -d postgres minio redis`, bucket `examcollect-submissions` đã tạo tay, tắt hết tiến trình `node` jest/nest mồ côi, áp migration mới lên **DB e2e** (không phải Supabase): `pnpm migration:run:e2e`.
Run: `npx jest --config test/jest-e2e.json test/finish-attempt.e2e-spec.ts`
Expected: ba ca mới FAIL (cột chưa được ghi / `AttemptMeta` chưa có trường).

- [ ] **Step 9: `ScoreService` ghi ba cột**

Trong `src/grading/scoring/score.service.ts`:

Thêm import đầu file: `import type { UsageByModel } from '../investigator/usage-sink';`

Sửa `interface AttemptMeta`:
```ts
export interface AttemptMeta {
  modelUsed: string | null;
  tokensIn: number;
  tokensOut: number;
  sandboxHost: object | null;
  /** P0 đo nền — mọi trường tuỳ chọn; không khai thì ghi NULL (hành vi cũ). */
  promptVersion?: string | null;
  usageByModel?: { investigation: UsageByModel; challenge: UsageByModel } | null;
  costUsd?: number | null;
}
```

Trong `finishAttempt`, thay câu `UPDATE … SET outcome = 'graded' …` bằng:
```ts
      await m.query(
        `UPDATE examcollect.grading_attempt
            SET outcome = 'graded', investigation = $2, model_used = $3, tokens_in = $4, tokens_out = $5,
                sandbox_host = $6, prompt_version = $7, usage_by_model = $8, cost_usd = $9,
                finished_at = clock_timestamp()
          WHERE id = $1 AND outcome IS NULL`,
        [
          attemptId,
          JSON.stringify(stored),
          meta.modelUsed,
          meta.tokensIn,
          meta.tokensOut,
          meta.sandboxHost === null ? null : JSON.stringify(meta.sandboxHost),
          meta.promptVersion ?? null,
          meta.usageByModel == null ? null : JSON.stringify(meta.usageByModel),
          meta.costUsd ?? null,
        ],
      );
```

Trong hàm đóng lượt không chấm được (câu `UPDATE … SET outcome = 'ungradable' …`, dòng ~206), đổi thành:
```ts
      `UPDATE examcollect.grading_attempt
          SET outcome = 'ungradable', ungradable_class = $2, ungradable_reason = $3, investigation = $4,
              model_used = $5, tokens_in = $6, tokens_out = $7, sandbox_host = $8,
              prompt_version = $9, usage_by_model = $10, cost_usd = $11, finished_at = clock_timestamp()
        WHERE id = $1 AND outcome IS NULL`,
      [
        attemptId,
        u.class,
        u.reason,
        stored === null ? null : JSON.stringify(stored),
        meta?.modelUsed ?? null,
        meta?.tokensIn ?? null,
        meta?.tokensOut ?? null,
        meta?.sandboxHost == null ? null : JSON.stringify(meta.sandboxHost),
        meta?.promptVersion ?? null,
        meta?.usageByModel == null ? null : JSON.stringify(meta.usageByModel),
        meta?.costUsd ?? null,
      ],
```
(Giữ nguyên mọi tham số và phần sau của câu lệnh đó; chỉ thêm ba cột và ba tham số cuối.)

- [ ] **Step 10: Đường chấm thật tính và truyền**

Trong `src/grading/pipeline/investigator-run.service.ts` thêm import:
```ts
import { costOf } from '../investigator/pricing';
import { promptVersionOf } from '../investigator/prompt-version';
import { mergeUsage } from '../investigator/usage-sink';
```
Sửa lời gọi `finishAttempt` để meta mang đủ ba trường:
```ts
    const investigationUsage = result.usageByModel ?? {};
    const out = await this.scores.finishAttempt(resultId, attemptId, stored, {
      modelUsed: result.investigation.modelsUsed.join('+').slice(0, 200) || null,
      tokensIn: result.usage.inputTokens,
      tokensOut: result.usage.outputTokens,
      sandboxHost: hostOf(result),
      promptVersion: promptVersionOf(),
      usageByModel: { investigation: investigationUsage, challenge: phase.usageByModel },
      costUsd: costOf(mergeUsage(investigationUsage, phase.usageByModel), (model) => this.deps.priceOf?.(model)),
    });
```
(`tokensIn`/`tokensOut` GIỮ NGUYÊN ý nghĩa cũ: chỉ agent điều tra — để các số liệu cũ so được; token của lăng kính nằm trong `usage_by_model.challenge`.)

- [ ] **Step 11: `.env.example`**

Ngay dưới khối `GRADING_TIER1_*` đang comment (dòng ~168–171) thêm:
```
# Giá để báo cáo chi phí (USD cho MỘT TRIỆU token). Thiếu một trong hai → cost_usd của lượt dùng bậc này là NULL.
# GRADING_TIER1_PRICE_IN_PER_MTOK=
# GRADING_TIER1_PRICE_OUT_PER_MTOK=
```

- [ ] **Step 12: Chạy lại e2e và unit**

Run: `npx jest --config test/jest-e2e.json test/finish-attempt.e2e-spec.ts test/score-service.e2e-spec.ts`
Expected: PASS (ba ca mới xanh; `score-service` xanh không sửa).
Run: `npx jest src/grading`
Expected: PASS.
Run: `npx tsc --noEmit -p tsconfig.json && pnpm check:cycles` (từ gốc repo cho lệnh sau)
Expected: không lỗi mới; `0` vòng import.

- [ ] **Step 13: Commit**

```bash
git add src/grading src/database/migrations/1789570000000-AttemptUsageAndPrompt.ts .env.example test/finish-attempt.e2e-spec.ts
git commit -m "feat(p0): ghi prompt_version, usage_by_model và cost_usd cho từng lượt chấm"
```

---

### Task 6: Eval chạy phản biện, `--waive` và ghi rõ cấu hình

Hôm nay runner truyền `challenge: null` và `autoDecision.count = 0` ở mọi lượt. Có **hai** nguyên nhân độc lập: (a) runner không chạy lăng kính; (b) cả hai fixture có luật `complexity_exceeds_required` gắn tiêu chí `hieu_nang` (trần > 0) mà máy chưa đo được, nên `decide()` gắn `criterion_untouched` cho mọi ca và không ca nào tự quyết được. Task này sửa cả hai bằng hai cờ riêng, **mặc định không đổi** để các lượt đã commit vẫn so được.

**Files:**
- Modify: `src/eval/cli-args.ts`, `src/eval/investigator-runner.ts`, `src/eval/cli.ts`
- Test: `src/eval/cli-args-challenge.spec.ts` (mới), `src/eval/investigator-runner.spec.ts`

**Interfaces:**
- Consumes: `runChallengePhase`, `ChallengePhaseDeps` (Task 4); `StoredChallenge`.
- Produces:
  - `EvalArgs.challenge: boolean` (cờ `--challenge=on|off`, mặc định `off`)
  - `EvalArgs.waive: string[]` (cờ `--waive=<tiêu chí>[,<tiêu chí>…]`, mặc định rỗng)
  - `runInvestigator({ …, challengePhase?: ChallengePhaseDeps })`

- [ ] **Step 1: Viết test thất bại cho hai cờ**

```ts
// src/eval/cli-args-challenge.spec.ts
import { parseEvalArgs } from './cli-args';

describe('parseEvalArgs — --challenge và --waive (P0)', () => {
  it('mặc định: không phản biện, không miễn trừ — để các lượt đã commit còn so được', () => {
    const r = parseEvalArgs([]);
    expect(r).toMatchObject({ ok: true, args: { challenge: false, waive: [] } });
  });
  it('--challenge=on bật', () => {
    expect(parseEvalArgs(['--challenge=on'])).toMatchObject({ ok: true, args: { challenge: true } });
  });
  it('--challenge sai giá trị → lỗi, không đoán', () => {
    expect(parseEvalArgs(['--challenge=yes'])).toEqual({ ok: false, error: expect.stringContaining('--challenge') });
  });
  it('--waive nhận danh sách tiêu chí, bỏ khoảng trắng và mục rỗng', () => {
    expect(parseEvalArgs(['--waive=hieu_nang, trinh_bay,'])).toMatchObject({ ok: true, args: { waive: ['hieu_nang', 'trinh_bay'] } });
  });
  it('--waive có khoá không hợp lệ → lỗi (khoá tiêu chí là ^[a-z0-9_]{1,64}$)', () => {
    expect(parseEvalArgs(['--waive=Hieu Nang'])).toEqual({ ok: false, error: expect.stringContaining('--waive') });
  });
});
```

- [ ] **Step 2: Chạy, thấy thất bại**

Run: `npx jest src/eval/cli-args-challenge.spec.ts`
Expected: FAIL (`challenge`/`waive` không có trong `EvalArgs`).

- [ ] **Step 3: `cli-args.ts`**

Thêm vào `interface EvalArgs`:
```ts
  /** Chạy bốn lăng kính trong lượt eval (mặc định tắt để so được với các lượt đã commit). */
  challenge: boolean;
  /** Tiêu chí được miễn "luật chưa đo được" — để nhóm tự quyết có mẫu số (spec §11). */
  waive: string[];
```
Trong `parseEvalArgs`, trước câu `return { ok: true, … }` thêm:
```ts
  const rawChallenge = get('challenge') ?? 'off';
  if (rawChallenge !== 'on' && rawChallenge !== 'off') {
    return { ok: false, error: `--challenge phải là on hoặc off, đang là ${JSON.stringify(rawChallenge)}` };
  }
  const waive = (get('waive') ?? '').split(',').map((s) => s.trim()).filter((s) => s.length > 0);
  const badWaive = waive.find((k) => !/^[a-z0-9_]{1,64}$/.test(k));
  if (badWaive !== undefined) {
    return { ok: false, error: `--waive: khoá tiêu chí không hợp lệ ${JSON.stringify(badWaive)} (cần ^[a-z0-9_]{1,64}$)` };
  }
```
và đổi đối tượng `args` thành `{ tier, split, concurrency, only: get('de'), pipeline, compareTo, replayCheck: rawReplay === 'on', challenge: rawChallenge === 'on', waive }`.

- [ ] **Step 4: Viết test thất bại cho runner**

Thêm vào `describe('runInvestigator', …)` trong `src/eval/investigator-runner.spec.ts` (đầu file thêm `import { Challenger } from '../grading/investigator/challenge';`):

```ts
// Đầu file: thêm import
import { Challenger } from '../grading/investigator/challenge';
```
```ts
// Cuối file, ngoài describe: một đề `mini` có THÊM luật do model quyết (`mini-de` mặc định chỉ có
// một luật máy quyết `sai_co_ban`, mà lăng kính chỉ nhận lỗi của luật model — lỗi luật máy quyết bị lọc).
async function setupWithModelRule() {
  const root = await mkdtemp(join(tmpdir(), 'inv-'));
  await writeMiniDe(root, {
    rules: [
      { ruleKey: 'sai_co_ban', title: 'Sai ca cơ bản', criterionKey: 'tinh_dung', deduction: '4.00', predicate: { kind: 'test_group_failed', group: 'co_ban' } },
      { ruleKey: 'chu_thich_sai', title: 'Chú thích sai', criterionKey: 'tinh_dung', deduction: '0.50', predicate: null },
    ],
  });
  const dataset = await loadDataset(root);
  const bundles = new Map([['mini', { id: 'mini@x', cases: [{ name: 'cb1', group: 'co_ban', input: '2\n', expected: '4\n' }] }]]);
  return { dataset, bundles };
}
const NO_SANDBOX = { models: [], sandbox: { exec: async () => { throw new Error('không dùng'); } } };
const verdictWith = (ruleKeys: string[]) => ({
  errors: ruleKeys.map((ruleKey) => ({ ruleKey, toolCallIds: ['tc-1'], note: null })),
  missingRules: [],
  injectionAttempt: { detected: false, excerpt: null },
});
```
```ts
// Thêm vào cuối `describe('runInvestigator', …)`:
  it('P0 — có challengePhase thì phản biện chạy và được lưu trong hồ sơ của lượt', async () => {
    const { dataset, bundles } = await setupWithModelRule();
    const probe: Challenger = { name: 'dò', async review() { return { status: 'confirmed', toolCallIds: [] }; } };
    const withLens = await runInvestigator({
      dataset, bundles, tier: 'fast', concurrency: 1, budget: DEFAULT_BUDGET, ...opts3a, deps: NO_SANDBOX,
      investigateFn: async () => result({ verdict: verdictWith(['chu_thich_sai']) }),
      challengePhase: { challengers: [probe], caseLenses: [] },
    });
    const rec = withLens.records.find((r) => r.caseId === 'A0')!;
    const stored = (rec.investigation as { challenge?: { perError: { challenger: string; perError: { ruleKey: string; status: string }[] }[] } }).challenge;
    expect(stored?.perError).toHaveLength(1);
    expect(stored?.perError[0]).toMatchObject({ challenger: 'dò', perError: [{ ruleKey: 'chu_thich_sai', status: 'confirmed' }] });
  });

  it('P0 — không có challengePhase thì hành vi cũ: không có phản biện trong hồ sơ, token không đổi', async () => {
    const { dataset, bundles } = await setupWithModelRule();
    const { records } = await runInvestigator({
      dataset, bundles, tier: 'fast', concurrency: 1, budget: DEFAULT_BUDGET, ...opts3a, deps: NO_SANDBOX,
      investigateFn: async () => result({ verdict: verdictWith(['chu_thich_sai']) }),
    });
    const rec = records[0];
    expect((rec.investigation as { challenge?: unknown }).challenge).toBeUndefined();
    expect(rec.tokensIn).toBe(400);
    expect(rec.tokensOut).toBe(100);
  });

  it('P0 — token của lăng kính cộng vào tokensIn/tokensOut của lượt (thống kê phiên thấy chi phí thật)', async () => {
    const { dataset, bundles } = await setupWithModelRule();
    const spender: Challenger = {
      name: 'tốn',
      async review(input) { input.usage?.add('m-1', { inputTokens: 50, outputTokens: 10 }); return { status: 'confirmed', toolCallIds: [] }; },
    };
    const { records } = await runInvestigator({
      dataset, bundles, tier: 'fast', concurrency: 1, budget: DEFAULT_BUDGET, ...opts3a, deps: NO_SANDBOX,
      investigateFn: async () => result({ verdict: verdictWith(['chu_thich_sai']) }),
      challengePhase: { challengers: [spender], caseLenses: [] },
    });
    expect(records[0].tokensIn).toBe(450); // 400 điều tra + 50 lăng kính
    expect(records[0].tokensOut).toBe(110); // 100 điều tra + 10 lăng kính
  });
```

- [ ] **Step 5: Chạy, thấy thất bại**

Run: `npx jest src/eval/investigator-runner.spec.ts`
Expected: các ca mới FAIL (`challengePhase` chưa có trong tham số).

- [ ] **Step 6: `investigator-runner.ts`**

Thêm import: `import { ChallengePhaseDeps, runChallengePhase } from '../grading/investigator/challenge-phase';` và `import { mergeUsage, totalOf } from '../grading/investigator/usage-sink';`.

Thêm vào danh sách tham số `opts` (sau `components?`):
```ts
  /** Có thì chạy pha phản biện giống đường chấm thật (spec §11). Không có thì `challenge: null` như trước. */
  challengePhase?: ChallengePhaseDeps;
```
Sau dòng `const result = await run(ctx, opts.deps, components);` thêm:
```ts
        const phase = opts.challengePhase ? await runChallengePhase(result, ctx, opts.challengePhase) : null;
        const lensTotal = totalOf(phase?.usageByModel ?? {});
```
Trong lời gọi `decide({ … })` thay dòng `challenge: null,` (và khối chú thích 3 dòng ngay trên nó nói runner không gọi `challenge()`) bằng:
```ts
          // Có `challengePhase` thì chạy đúng pha phản biện của đường chấm thật; không thì null, và
          // §6.2 không có hiệu lực trên lượt này (các lượt đã commit trước P0 đều ở trạng thái đó).
          challenge: phase?.challenge ?? null,
```
Đổi hai dòng token của bản ghi:
```ts
          tokensIn: result.usage.inputTokens + lensTotal.inputTokens,
          tokensOut: result.usage.outputTokens + lensTotal.outputTokens,
```
và trong đối tượng `investigation: { … }` thêm hai trường `challenge: phase?.challenge ?? undefined, usageByModel: { investigation: result.usageByModel ?? {}, challenge: phase?.usageByModel ?? {} },` (đặt sau `decision`).

- [ ] **Step 7: `cli.ts` — nối cờ, miễn trừ và ghi cấu hình**

Trong `src/eval/cli.ts`:

Thêm import: `import { buildInvestigatorTiers } from '../grading/investigator/model-pool';` đã có; thêm
```ts
import { CorrectnessLens } from '../grading/investigator/lenses/correctness-lens';
import { SeverityLens } from '../grading/investigator/lenses/severity-lens';
import { OmissionLens } from '../grading/investigator/lenses/omission-lens';
import { CheatingLens } from '../grading/investigator/lenses/cheating-lens';
```
Ngay sau khi đã có `dataset` (sau `loadDataset`) và trước khi dùng nó, nếu `args.waive.length > 0` áp miễn trừ lên mọi đề (đổi một bản sao, không ghi ngược file):
```ts
    const waiveSet = new Set(args.waive);
    if (waiveSet.size > 0) {
      for (const de of dataset.des) {
        const known = new Set(de.manifest.rubric.map((r) => r.key));
        const unknown = [...waiveSet].filter((k) => !known.has(k));
        if (unknown.length > 0) {
          console.error(`--waive: đề ${de.manifest.id} không có tiêu chí ${unknown.join(', ')}`);
          process.exit(2);
        }
        de.manifest.waivedCriteria = [...new Set([...de.manifest.waivedCriteria, ...waiveSet])];
      }
    }
```
(Đặt trong nhánh `pipeline === 'investigator'`, nơi `dataset` đã được dựng; `args` là kết quả `parseEvalArgs` đã có tên khác trong file — dùng đúng tên biến hiện có.)

Trong lời gọi `runInvestigator({ … })` thêm:
```ts
        challengePhase: args.challenge
          ? {
              challengers: [new CorrectnessLens({ models: tiers, sandbox: client as never }), new SeverityLens({ models: tiers, sandbox: client as never })],
              caseLenses: [new OmissionLens({ models: tiers, sandbox: client as never }), new CheatingLens({ models: tiers, sandbox: client as never })],
            }
          : undefined,
```
Trong khối `config = { … }` của nhánh investigator, đổi `ablation` thành `ablation: args.challenge ? ['−run_scaled', '−probe'] : ['−run_scaled', '−probe', '−advocate'],` và thêm `challenge: args.challenge ? 'on' : 'off', waived: args.waive,`.

Ở khối so sánh (`if (baseRun) { … comparison = { … } }`) thêm khai báo lẫn biến **trước** `comparison = {`:
```ts
    const baseConfig = baseRun.meta.config as { challenge?: string; waived?: string[] };
    const confounded: string[] = [];
    if ((baseConfig.challenge ?? 'off') !== (args.challenge ? 'on' : 'off')) confounded.push('challenge');
    if (JSON.stringify(baseConfig.waived ?? []) !== JSON.stringify(args.waive)) confounded.push('waived');
    if (confounded.length > 0) console.warn(`⚠ So sánh lẫn biến: ${confounded.join(', ')} khác lượt gốc — Δ không phải hiệu ứng của một thay đổi.`);
```
và thêm `confounded,` vào đối tượng `comparison`.

(Nếu tên biến cờ trong `cli.ts` khác `args`, dùng đúng tên hiện có — kiểm bằng cách đọc 40 dòng đầu của file; mọi chỗ trên chỉ đổi cách đọc cờ, không đổi luồng.)

- [ ] **Step 8: Chạy test, kiểu và import-scan**

Run: `npx jest src/eval`
Expected: PASS (các ca cũ không sửa).
Run: `npx tsc --noEmit -p tsconfig.json`
Expected: không lỗi mới.
Run: `npx jest src/eval/no-db.import-scan.spec.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/eval
git commit -m "feat(p0): eval chạy phản biện (--challenge) và miễn trừ tiêu chí (--waive), ghi rõ lẫn biến"
```

---

### Task 7: Thống kê thời gian, token và chi phí mỗi đơn vị

**Files:**
- Create: `src/eval/attempt-stats.ts`, `src/eval/attempt-stats.spec.ts`
- Create: `scripts/attempt-cost-report.ts`
- Modify: `package.json` (thêm script `report:attempts`)

**Interfaces:**
- Consumes: `UsageByModel`, `totalOf` (Task 2).
- Produces:
  - `interface AttemptRow { resultId: string; startedAt: string; finishedAt: string | null; outcome: string | null; tokensIn: number | null; tokensOut: number | null; costUsd: number | null; usageByModel: { investigation?: UsageByModel; challenge?: UsageByModel } | null }`
  - `interface AttemptStats { units: number; wallSeconds: { p50: number | null; p95: number | null; max: number | null }; tokens: { p50: number | null; p95: number | null }; challengeTokenShare: number | null; cost: { pricedUnits: number; unpricedUnits: number; totalUsd: number | null; p50: number | null; p95: number | null }; sessionWallSeconds: number | null }`
  - `function summarizeAttempts(rows: AttemptRow[]): AttemptStats`

- [ ] **Step 1: Viết test thất bại**

```ts
// src/eval/attempt-stats.spec.ts
import { AttemptRow, summarizeAttempts } from './attempt-stats';

const row = (over: Partial<AttemptRow>): AttemptRow => ({
  resultId: 'r', startedAt: '2026-10-12T10:00:00.000Z', finishedAt: '2026-10-12T10:01:00.000Z', outcome: 'graded',
  tokensIn: 1000, tokensOut: 100, costUsd: null, usageByModel: null, ...over,
});

describe('summarizeAttempts()', () => {
  it('không có hàng nào → mọi số là null, 0 đơn vị', () => {
    expect(summarizeAttempts([])).toEqual({
      units: 0, wallSeconds: { p50: null, p95: null, max: null }, tokens: { p50: null, p95: null },
      challengeTokenShare: null, cost: { pricedUnits: 0, unpricedUnits: 0, totalUsd: null, p50: null, p95: null }, sessionWallSeconds: null,
    });
  });

  it('chỉ đếm lượt đã kết thúc (có finishedAt); thời gian tính bằng giây', () => {
    const s = summarizeAttempts([
      row({ resultId: 'a', startedAt: '2026-10-12T10:00:00.000Z', finishedAt: '2026-10-12T10:01:00.000Z' }), // 60 s
      row({ resultId: 'b', startedAt: '2026-10-12T10:00:10.000Z', finishedAt: '2026-10-12T10:02:10.000Z' }), // 120 s
      row({ resultId: 'c', finishedAt: null }), // đang chạy: bỏ
    ]);
    expect(s.units).toBe(2);
    expect(s.wallSeconds).toEqual({ p50: 60, p95: 120, max: 120 });
    // Cả phiên: từ lúc bắt đầu sớm nhất (10:00:00) tới lúc kết thúc muộn nhất (10:02:10) = 130 s.
    expect(s.sessionWallSeconds).toBe(130);
  });

  it('token: ưu tiên tổng của usageByModel (điều tra + lăng kính); không có thì tokensIn + tokensOut', () => {
    const s = summarizeAttempts([
      row({ resultId: 'a', usageByModel: { investigation: { m: { inputTokens: 800, outputTokens: 100 } }, challenge: { m: { inputTokens: 90, outputTokens: 10 } } } }),
      row({ resultId: 'b', tokensIn: 500, tokensOut: 50 }),
    ]);
    // a = 800+100+90+10 = 1000 ; b = 550
    expect(s.tokens).toEqual({ p50: 550, p95: 1000 });
  });

  it('phần token của lăng kính trên tổng (chỉ tính trên các lượt có usageByModel)', () => {
    const s = summarizeAttempts([
      row({ usageByModel: { investigation: { m: { inputTokens: 700, outputTokens: 100 } }, challenge: { m: { inputTokens: 180, outputTokens: 20 } } } }),
    ]);
    expect(s.challengeTokenShare).toBeCloseTo(0.2, 5); // 200 / 1000
  });

  it('chi phí: tổng chỉ trên các lượt CÓ giá; nói rõ bao nhiêu lượt không có giá (không âm thầm coi là 0)', () => {
    const s = summarizeAttempts([
      row({ resultId: 'a', costUsd: 0.1 }),
      row({ resultId: 'b', costUsd: 0.3 }),
      row({ resultId: 'c', costUsd: null }),
    ]);
    expect(s.cost.pricedUnits).toBe(2);
    expect(s.cost.unpricedUnits).toBe(1);
    expect(s.cost.totalUsd).toBeCloseTo(0.4, 5);
  });

  it('không lượt nào có giá → totalUsd là null (không phải 0)', () => {
    expect(summarizeAttempts([row({ costUsd: null })]).cost.totalUsd).toBeNull();
  });
});
```

- [ ] **Step 2: Chạy, thấy thất bại**

Run: `npx jest src/eval/attempt-stats.spec.ts`
Expected: FAIL — không tìm thấy module.

- [ ] **Step 3: Cài đặt**

```ts
// src/eval/attempt-stats.ts
import { totalOf, UsageByModel } from '../grading/investigator/usage-sink';

export interface AttemptRow {
  resultId: string;
  startedAt: string;
  finishedAt: string | null;
  outcome: string | null;
  tokensIn: number | null;
  tokensOut: number | null;
  costUsd: number | null;
  usageByModel: { investigation?: UsageByModel; challenge?: UsageByModel } | null;
}

export interface AttemptStats {
  units: number;
  wallSeconds: { p50: number | null; p95: number | null; max: number | null };
  tokens: { p50: number | null; p95: number | null };
  challengeTokenShare: number | null;
  cost: { pricedUnits: number; unpricedUnits: number; totalUsd: number | null; p50: number | null; p95: number | null };
  sessionWallSeconds: number | null;
}

/** Hạng gần nhất (nearest-rank): p% của n phần tử là phần tử thứ ceil(p/100·n). */
function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)];
}

/**
 * Thống kê MỖI ĐƠN VỊ chấm (spec §11: ngân sách phải đo, không đoán). Thuần: nhận hàng đã đọc từ
 * `grading_attempt`, không chạm DB — nằm ở `eval/` nơi import-scan cấm mọi đường tới DB.
 *
 * Chi phí chỉ cộng các lượt CÓ giá; số lượt không có giá được nói ra, vì một tổng bỏ qua chúng sẽ
 * trông rẻ hơn thật.
 */
export function summarizeAttempts(rows: AttemptRow[]): AttemptStats {
  const done = rows.filter((r) => r.finishedAt !== null);
  const wall = done.map((r) => (Date.parse(r.finishedAt!) - Date.parse(r.startedAt)) / 1000);
  const tokensOf = (r: AttemptRow): number => {
    if (r.usageByModel) {
      const t = totalOf(mergeShallow(r.usageByModel.investigation, r.usageByModel.challenge));
      return t.inputTokens + t.outputTokens;
    }
    return (r.tokensIn ?? 0) + (r.tokensOut ?? 0);
  };
  const withBreakdown = done.filter((r) => r.usageByModel !== null);
  const challengeTokens = withBreakdown.reduce((s, r) => {
    const t = totalOf(r.usageByModel!.challenge ?? {});
    return s + t.inputTokens + t.outputTokens;
  }, 0);
  const allTokens = withBreakdown.reduce((s, r) => s + tokensOf(r), 0);
  const priced = done.filter((r) => r.costUsd !== null).map((r) => r.costUsd!);
  const starts = done.map((r) => Date.parse(r.startedAt));
  const ends = done.map((r) => Date.parse(r.finishedAt!));
  return {
    units: done.length,
    wallSeconds: { p50: percentile(wall, 50), p95: percentile(wall, 95), max: wall.length ? Math.max(...wall) : null },
    tokens: { p50: percentile(done.map(tokensOf), 50), p95: percentile(done.map(tokensOf), 95) },
    challengeTokenShare: allTokens > 0 ? challengeTokens / allTokens : null,
    cost: {
      pricedUnits: priced.length,
      unpricedUnits: done.length - priced.length,
      totalUsd: priced.length ? priced.reduce((s, x) => s + x, 0) : null,
      p50: percentile(priced, 50),
      p95: percentile(priced, 95),
    },
    sessionWallSeconds: done.length ? (Math.max(...ends) - Math.min(...starts)) / 1000 : null,
  };
}

/** Cộng hai `UsageByModel` có thể thiếu — dùng nội bộ để tính tổng token của một lượt. */
function mergeShallow(a: UsageByModel | undefined, b: UsageByModel | undefined): UsageByModel {
  const out: UsageByModel = {};
  for (const part of [a ?? {}, b ?? {}]) {
    for (const [model, u] of Object.entries(part)) {
      const cur = out[model] ?? { inputTokens: 0, outputTokens: 0 };
      out[model] = { inputTokens: cur.inputTokens + u.inputTokens, outputTokens: cur.outputTokens + u.outputTokens };
    }
  }
  return out;
}
```
`mergeShallow` (cuối file) cộng hai `UsageByModel` có thể thiếu; `tokensOf` dùng nó để lấy tổng token của MỘT lượt gồm cả điều tra lẫn lăng kính.

- [ ] **Step 4: Chạy, thấy xanh**

Run: `npx jest src/eval/attempt-stats.spec.ts`
Expected: PASS (6 test).

- [ ] **Step 5: Script đọc DB (chỉ-đọc) và in thống kê**

```ts
// scripts/attempt-cost-report.ts
/**
 * Thống kê thời gian/token/chi phí mỗi đơn vị chấm của MỘT phiên (spec §11, P0).
 *   node -r ts-node/register -r dotenv/config -r tsconfig-paths/register scripts/attempt-cost-report.ts --session <uuid>
 * Chỉ-đọc: một transaction READ ONLY, không ghi gì. KHÔNG in DATABASE_URL.
 */
import { Client } from 'pg';
import { AttemptRow, summarizeAttempts } from '../src/eval/attempt-stats';

async function main(): Promise<void> {
  const i = process.argv.indexOf('--session');
  const sessionId = i >= 0 ? process.argv[i + 1] : undefined;
  if (!sessionId || !/^[0-9a-f-]{36}$/i.test(sessionId)) {
    console.error('Cần --session <uuid của phiên thi>');
    process.exit(2);
  }
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('Thiếu DATABASE_URL');
    process.exit(2);
  }
  const client = new Client({ connectionString: url, ssl: /localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query('BEGIN READ ONLY');
    const { rows } = await client.query(
      `SELECT a.grading_result_id AS "resultId", a.started_at AS "startedAt", a.finished_at AS "finishedAt",
              a.outcome, a.tokens_in AS "tokensIn", a.tokens_out AS "tokensOut", a.cost_usd AS "costUsd",
              a.usage_by_model AS "usageByModel"
         FROM examcollect.grading_attempt a
         JOIN examcollect.grading_result g ON g.id = a.grading_result_id
         JOIN examcollect.submission s ON s.id = g.submission_id
        WHERE s.exam_session_id = $1
        ORDER BY a.started_at`,
      [sessionId],
    );
    const attempts: AttemptRow[] = rows.map((r) => ({
      ...r,
      startedAt: new Date(r.startedAt).toISOString(),
      finishedAt: r.finishedAt ? new Date(r.finishedAt).toISOString() : null,
      costUsd: r.costUsd === null ? null : Number(r.costUsd),
    }));
    console.log(JSON.stringify({ sessionId, attempts: attempts.length, stats: summarizeAttempts(attempts) }, null, 2));
    await client.query('ROLLBACK');
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error('Lỗi:', e instanceof Error ? e.message : String(e));
  process.exit(1);
});
```
Trong `package.json` mục `scripts` thêm dòng:
```json
    "report:attempts": "node -r ts-node/register -r dotenv/config -r tsconfig-paths/register scripts/attempt-cost-report.ts",
```

- [ ] **Step 6: Kiểm kiểu và commit**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: không lỗi mới. (Nếu `tsconfig.json` không bao `scripts/`, chạy `npx tsc --noEmit scripts/attempt-cost-report.ts --esModuleInterop --resolveJsonModule --skipLibCheck` để kiểm riêng.)
```bash
git add src/eval/attempt-stats.ts src/eval/attempt-stats.spec.ts scripts/attempt-cost-report.ts package.json
git commit -m "feat(p0): thống kê thời gian, token và chi phí mỗi đơn vị chấm"
```

---

### Task 8: Lượt diễn tập nền trên `main` đã deploy

Vận hành, không có mã mới. Mục đích: **mốc so sánh** với lượt `20260928T094907Z-f83a05c` trước khi P1a đụng vào lõi. Chạy trên bản **đã deploy** (Railway), không cần mã của P0.

**Điều kiện:** Task 1 báo VM sandbox đang chạy và khoá model đủ; Railway đã deploy `main` (kiểm: `gh api repos/smart-lab-system/CINE/deployments --jq '.[0:2][] | "\(.sha[0:7]) \(.environment) \(.created_at)"'`). Nếu API trên Railway chưa có `SANDBOX_REDIS_URL` hay khoá model, mọi bài sẽ ra `ungradable(system)` — đó là lỗi môi trường, **không phải hồi quy**; ghi đúng như vậy.

**Files:**
- Modify (do harness sinh ra): `apps/api/eval/rehearsals/README.md` và thư mục lượt mới `apps/api/eval/rehearsals/<runId>/`
- Create: `docs/rehearsals/2026-10-12-p0-baseline.md`

- [ ] **Step 1: Hỏi chủ đồ án mật khẩu tài khoản diễn tập `teo@gmail.com`**

Mật khẩu **không được lưu** ở đâu cả (memory chỉ ghi tài khoản và lớp). Hỏi chủ đồ án, dùng qua biến môi trường của shell hiện tại, không ghi ra file, không in ra log.

- [ ] **Step 2: Chạy một lượt 1 bài để kiểm đường đi (rẻ)**

Run (từ `apps/api/`):
```bash
export REHEARSAL_BASE_URL="https://cine-production-6032.up.railway.app"
export REHEARSAL_EMAIL="teo@gmail.com"
export REHEARSAL_PASSWORD="<do chủ đồ án cung cấp>"
export REHEARSAL_CLASS_ID="822c2414-9e78-4ea3-b6b3-7f0109cf1188"
pnpm rehearsal -- --scenario ngan-xep-v1 --only HS2410020 --deploy "$(gh api repos/smart-lab-system/CINE/deployments --jq '.[0].sha[0:7]')" --note "P0: kiểm đường đi 1 bài trước lượt đủ"
```
Expected: bài chấm xong (không phải `ungradable(system)` vì thiếu sandbox/khoá). Nếu `ungradable(system)`: dừng, ghi lý do (thường là sandbox worker không nhận job hoặc Railway thiếu env), không chạy lượt đủ.

- [ ] **Step 3: Chạy lượt đủ 5 bài**

Run:
```bash
pnpm rehearsal -- --scenario ngan-xep-v1 --deploy "$(gh api repos/smart-lab-system/CINE/deployments --jq '.[0].sha[0:7]')" --note "P0: lượt nền trên main sau #63, G1–G5, rubric_error, master data"
```
Expected: harness in bảng so kỳ vọng và ghi một dòng vào `apps/api/eval/rehearsals/README.md` cùng thư mục `<runId>/run.json`. Chạy **lặp lại một lần nữa** (cùng lệnh, `--note "… lượt 2/2 để đo độ dao động"`) vì diễn tập 28/09 cho thấy kết quả dao động giữa các lượt.

- [ ] **Step 4: So với lượt 2026-09-28 và ghi báo cáo**

Tạo `docs/rehearsals/2026-10-12-p0-baseline.md` (điền số thật từ `README.md` và `run.json`; không để ô trống):

```markdown
# P0 — lượt nền trên main (2026-10-12)

Bản chạy: <sha> · model: <từ run.json> · kịch bản `ngan-xep-v1` · 5 bài.

| Chỉ số | 28/09 `…f83a05c` (lượt B) | Lượt P0 #1 | Lượt P0 #2 | Δ |
|---|---|---|---|---|
| Điểm đúng | 5/5 | | | |
| Lỗi bắt được | 8/8 | | | |
| Lỗi thừa | 0 | | | |
| Quyết định đúng | 4/5 | | | |
| Tự duyệt SAI | 0 | | | |
| Tự duyệt (thực/kỳ vọng) | 2/3 | | | |
| Cờ oan / bỏ lỡ | 0 / 1 | | | |
| Lăng kính hỏng | 5 | | | |
| Thời gian chấm (s) | 140 | | | |

## Kết luận về hồi quy
(Một trong ba: "không thấy hồi quy" / "có hồi quy ở …, nghi do PR/commit …" / "không kết luận được vì lỗi môi trường: …".)
```
Quy tắc đọc: một chỉ số tụt ở **cả hai** lượt mới là nghi hồi quy; tụt ở một lượt là dao động. Với cỡ mẫu 5 bài, mọi kết luận chỉ là "kiểm khói", không phải "đạt" (spec §11).

- [ ] **Step 5: Commit**

```bash
git add eval/rehearsals ../../docs/rehearsals/2026-10-12-p0-baseline.md
git commit -m "docs(p0): lượt diễn tập nền trên main và so với 2026-09-28"
```

---

### Task 9: Lượt diễn tập có đo chi phí và thời gian (API chạy bản P0)

Vận hành. Chạy **bản P0** (Task 2–7) để có `usage_by_model`, `prompt_version`, `cost_usd`. Bản Railway chưa có mã này, nên chạy API cục bộ.

**Điều kiện (hỏi chủ đồ án trước, một lần):** (a) migration `1789570000000` được áp lên **DB mà API cục bộ trỏ tới** — nếu là Supabase thì đây là thay đổi DB production cần cho phép bằng lời; phương án khác là DB cục bộ (Docker) với bản sao dữ liệu; (b) VM sandbox đang chạy; (c) giá model khai trong `.env` (`GRADING_TIER<n>_PRICE_IN_PER_MTOK`/`_OUT_`) — nếu không có giá, `cost_usd` là `NULL` và báo cáo chỉ có token (vẫn hữu ích).

**Files:**
- Modify: `docs/rehearsals/2026-10-12-p0-baseline.md` (thêm mục chi phí)

- [ ] **Step 1: Khởi động API cục bộ từ nhánh P0**

Run (từ `apps/api/`, không in env): `pnpm build && NODE_ENV=development node dist/main.js` hoặc `pnpm start`. Kiểm `GET http://localhost:4000/health` trả 200. Nhớ: `.env` trỏ DB nào thì API ghi vào DB đó.

- [ ] **Step 2: Chạy diễn tập trỏ vào API cục bộ**

Run:
```bash
export REHEARSAL_BASE_URL="http://localhost:4000"
# giữ REHEARSAL_EMAIL, REHEARSAL_PASSWORD, REHEARSAL_CLASS_ID như Task 8
pnpm rehearsal -- --scenario ngan-xep-v1 --deploy local-p0 --note "P0: lượt đo chi phí và thời gian (bản P0 cục bộ)"
```
Ghi lại `sessionId` mà harness in ra.

- [ ] **Step 3: Lấy thống kê mỗi đơn vị**

Run: `pnpm report:attempts --session <sessionId>`
Expected: JSON có `units: 5`, `wallSeconds`, `tokens`, `challengeTokenShare`, `cost`. Thêm vào `docs/rehearsals/2026-10-12-p0-baseline.md` mục:

```markdown
## Chi phí và thời gian mỗi đơn vị (bản P0, 5 bài)

| Số đo | Giá trị |
|---|---|
| Đơn vị đã chấm | |
| Thời gian chấm mỗi đơn vị p50 / p95 / max (s) | |
| Token mỗi đơn vị p50 / p95 (điều tra + lăng kính) | |
| Phần token của bốn lăng kính | |
| Chi phí mỗi đơn vị p50 / p95 (USD) · số lượt không có giá | |
| Cả phiên 5 bài (s) | |

Ngoại suy THÔ cho 120 đơn vị (40 sinh viên × 3 câu), với đồng thời `GRADE_CONCURRENCY` = 5: thời gian ≈ 120/5 × p50; token ≈ 120 × p50; chi phí ≈ 120 × p50. Đây là ngoại suy từ 5 bài, **không** phải số đo cho 120 đơn vị.
```

- [ ] **Step 4: Tắt VM nếu đã bật cho lượt này**

Chủ đồ án muốn tắt VM mỗi khi xong việc: `gcloud compute instances stop instance-20260924-084904 --zone asia-northeast1-a --project animated-moon-460103-m3` (chỉ khi chính phiên này đã bật nó và được cho phép).

- [ ] **Step 5: Commit**

```bash
git add eval/rehearsals ../../docs/rehearsals/2026-10-12-p0-baseline.md
git commit -m "docs(p0): thời gian, token và chi phí mỗi đơn vị từ lượt diễn tập bản P0"
```

---

### Task 10: Bảng hình dạng đề thật và báo cáo kết thúc P0

**Files:**
- Create: `docs/superpowers/reports/2026-10-12-exam-shapes.md`
- Modify: `docs/rehearsals/2026-10-12-p0-baseline.md` (mục "Kết luận P0 và quyết định cho P1")

- [ ] **Step 1: Tạo bảng hình dạng đề, hàng đầu là đề thật #1**

```markdown
# Bảng phân loại hình dạng đề thật

Nguồn dữ liệu: các đề thật do chủ đồ án cung cấp. Mỗi hàng một đề. Cột "Không hỗ trợ" nêu các hình dạng spec §1.4 chưa hỗ trợ.

| # | Đề | Nguồn | Định dạng | Câu | Ngôn ngữ | Điểm | Tên file nêu trong đề | Ví dụ vào/ra | Rubric nhúng | Hợp đồng I/O | Tiêu chí không đo được bằng test | Câu trùng | Không hỗ trợ |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `de-thi.pdf` (CTDL&GT cuối kỳ) | Rất có thể xuất từ Soạn đề (khung dòng khớp `buildExamPaperDocx`) | PDF có lớp chữ | 3 | Python | 3 + 3,5 + 3,5 = 10 | không | không | Câu 1, Câu 2 (tổng khớp); Câu 3 không | lai: "viết hàm" nhưng đọc stdin/in ra | O(n) + không dùng thư viện (0,5đ); O(h) + không chuyển cây thành mảng (0,25đ); cấm `eval`, `re` | Câu 3 = Câu 1 | chế độ driver hàm (nếu sinh viên chỉ viết hàm) |
```

- [ ] **Step 2: Xin thêm 2–4 đề từ chủ đồ án**

Hỏi chủ đồ án các đề DOCX/PDF thật còn lại, đặc biệt: đề tự soạn (không từ Soạn đề), đề có câu tự chọn, đề có ý a/b/c dùng chung file, đề C++. Mỗi đề thêm một hàng theo cùng cột. **Chưa đủ mẫu thì ghi rõ "n = 1" ở đầu bảng** — một đề không phải bảng phân loại.

- [ ] **Step 3: Viết "Kết luận P0 và quyết định cho P1" vào báo cáo kết thúc**

Thêm vào cuối `docs/rehearsals/2026-10-12-p0-baseline.md`:

```markdown
## Kết luận P0 và quyết định cho P1

- **Hồi quy so với 2026-09-28:** (không / có, ở … / không kết luận được vì …)
- **Ngân sách đo được:** (số mỗi đơn vị từ Task 9, hoặc "chưa đo được vì …")
- **Mục tiêu 40 bài ≤ 30 phút của spec lõi:** (đặt lại thành … theo số câu / chưa đủ số liệu)
- **Hình dạng đề:** n = (số đề). Hình dạng chưa hỗ trợ chiếm (…/n). Ảnh hưởng tới phạm vi P1: (không / …)
- **Điều kiện kết thúc P0 (spec §10.2):** (đã có ≥ 1 bản ghi diễn tập thật so với 28/09 / môi trường chưa sẵn sàng sau 3 ngày → P1a bắt đầu không chờ, P1b chờ số đo)
- **Danh sách hồi quy cần sửa TRƯỚC P1b:** (liệt kê, hoặc "không có")
```
Điền bằng dữ liệu thật của Task 1, 8, 9 — không viết ước lượng thay cho số đo; ô nào chưa có số đo thì ghi đúng "chưa đo được vì …".

- [ ] **Step 4: Chạy toàn bộ kiểm chứng cuối P0 và commit**

Run (từ `apps/api/`): `npx jest` (unit) rồi `npx tsc --noEmit -p tsconfig.json`; từ gốc repo: `pnpm check:cycles`.
Expected: unit xanh (≥ 1448 test như lượt đo 2026-10-12 cộng các ca mới), 0 lỗi kiểu mới, 0 vòng import.
```bash
git add ../../docs/superpowers/reports/2026-10-12-exam-shapes.md ../../docs/rehearsals/2026-10-12-p0-baseline.md
git commit -m "docs(p0): bảng hình dạng đề thật và báo cáo kết thúc P0"
```

---

## Self-Review

**1. Phủ spec (§10.2 hàng P0, §11, §10.4):**
- Diễn tập thật trên `main` so với `20260928T094907Z-f83a05c` → Task 8.
- Runner eval chạy phản biện + quyết định, nhóm tự quyết có mẫu số → Task 6 (hai nguyên nhân tách riêng: lăng kính và tiêu chí chưa đo được).
- Ghi `cost_usd` và `prompt_version` → Task 5 (kèm `usage_by_model`, cần để chi phí có nghĩa khi lượt xoay giữa nhiều bậc và có lăng kính).
- Đo thời gian/token/chi phí mỗi đơn vị kèm lăng kính → Task 3 (token lăng kính vốn bị bỏ), Task 7, Task 9.
- Bảng phân loại hình dạng đề thật → Task 10.
- Điều kiện kết thúc P0, billing/VM, migration `1789560000000` → Task 1 và Task 10.
- **Không thuộc P0, cố ý:** `ruler_trust`, `exam_problem`, mọi thay đổi hành vi chấm (P1a trở đi).

**2. Quét chỗ giữ chỗ:** không có "TBD/TODO/xử lý sau". Các bảng điền số trong Task 8–10 là **mẫu báo cáo để điền bằng số đo thật**, mỗi bảng đi kèm quy tắc "không để trống, chưa đo được thì ghi lý do"; đó là sản phẩm của việc vận hành, không phải mã chưa viết.

**3. Nhất quán kiểu và tên:** `UsageSink.add/snapshot`, `UsageByModel`, `UNATTRIBUTED`, `mergeUsage`, `totalOf` (Task 2) được dùng đúng tên ở Task 3, 4, 5, 6, 7. `runChallengePhase(result, ctx, deps) → { challenge, usageByModel }` (Task 4) được dùng ở Task 5 (`phase.usageByModel`) và Task 6 (`phase?.challenge`). `AttemptMeta` thêm `promptVersion`, `usageByModel: { investigation, challenge }`, `costUsd` (Task 5) khớp hình dạng `AttemptRow.usageByModel` ở Task 7. Tham số thứ 10 `sink` của `runLensLoop` (Task 3) khớp bốn lăng kính.

**4. Review Focus ↔ test:** (1) `challenge-phase.spec` ca "lăng kính hỏng nhưng đã tiêu token" + `lens-loop.spec` ca `UNATTRIBUTED`; (2) `challenge-phase.spec` ca hai lượt đồng thời dùng chung lăng kính; (3) `pricing.spec` các ca `null`; (4) `finish-attempt.e2e-spec` ca cùng-UPDATE và ca "không khai gì → NULL" (cộng ca lượt ungradable vẫn ghi token); (5) `cli-args-challenge.spec` + cảnh báo `confounded` ở Task 6.

**Điểm tôi chưa chắc (người thực thi cần kiểm khi làm):** (a) tên biến chứa kết quả `parseEvalArgs` trong `eval/cli.ts` (Task 6 Step 7 nói rõ dùng đúng tên hiện có); (b) `tsconfig.json` có bao thư mục `scripts/` hay không (Task 7 Step 6 nêu cách kiểm riêng); (c) Railway có `SANDBOX_REDIS_URL` và khoá model đủ để chạy bài code hay không — Task 8 Step 2 kiểm bằng lượt 1 bài trước khi tốn tiền cho lượt đủ.
