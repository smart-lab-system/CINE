# Trang kiến thức + Hồ sơ một bài (UI) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hai màn hình teacher-facing đầu tiên cho đường chấm điều tra: **Trang kiến thức** (giảng viên quản bảng lỗi — duyệt giá, xử lý luật agent báo thiếu, xem trước số bài bị ảnh hưởng trước khi lưu giá) và **Hồ sơ một bài** (điểm = trần − Σ mức trừ, danh sách lỗi kèm nguồn gốc, cờ theo từng lỗi, trạng thái không chấm được, đường điều tra thật). Đóng phần UI còn thiếu của "bước 3" (§9 mục 3) cho backend đã có từ 3c/3d/3d2.

**Architecture:** Backend của cả hai màn đã tồn tại gần đủ (`RulesController` từ 3c) — chỉ thiếu MỘT route mới để lộ chi tiết một lượt tính điểm + đường điều tra của một bài (không route nào trả `ScoreBreakdown`/`StoredInvestigation` hôm nay). Frontend theo đúng khuôn đã có: `apiClient` sinh từ OpenAPI (`packages/shared/src/api/schema.d.ts`), hàm wrapper thuần trong `lib/api/*.ts`, hook TanStack Query trong `hooks/*.ts`, page + `_components/*` theo Next.js App Router, test bằng Vitest + RTL với hook bị mock (không MSW).

**Tech Stack:** NestJS 10 + TypeORM (backend, raw SQL cho các bảng grading-model), Next.js 15 + TanStack Query + Tailwind (frontend, design token đã có: `--primary`/`--accent-strong`/Inter/`--radius: 0.75rem`).

**Spec:** `docs/superpowers/specs/2026-09-20-grading-agent-investigator-design.md` §5 (hồ sơ chẩn đoán), §5.1 (tóm tắt do harness render), §2.1 (bảng lỗi, giá), §4.1 (nguồn gốc lỗi), §4.4 (sàn bằng chứng, ungradable), §9 mục 3 (UI của bước 3: bảng lỗi, hồ sơ một bài).

## Global Constraints

- Không route nào nhận `teacherId` từ body — luôn `req.user!.sub` + `findResultForOwner`/`findEntityForOwner` đã có.
- `packages/shared/src/api/schema.d.ts` ĐANG THIẾU mọi route của `RulesController` và route mới của Task 1 — phải chạy `pnpm --filter @cine/shared generate:api-client` (API server chạy ở `localhost:3000`) SAU Task 1, TRƯỚC khi viết `apiClient.GET('/rules')` hay bất kỳ lời gọi typed nào, nếu không toàn bộ Task 2 không typecheck. Xem `cine-openapi-client-regeneration` — kèm cách khởi động lại Docker Desktop nếu nó tự tắt.
- `GradingResult` (client, `apps/web/src/lib/api/grading.ts`) đang THIẾU `pipeline`/`currentScore`/`currentScoreSource` dù server (`GradingResultView`, `grading.service.ts:815`) đã có từ 3c — mirror cho khớp, đây là gap có thật, không phải giả định.
- `deduction`/`score` là chuỗi thập phân, KHÔNG BAO GIỜ `number` trên wire (§13.2) — format bằng `formatHundredths`/`toFixed`, không `parseFloat` rồi làm tròn lại.
- Test dùng Vitest + RTL, mock ở TẦNG HOOK (`vi.mock('@/hooks/useRules', ...)`), không mock `fetch`/`apiClient` — đúng khuôn `matrix/page.test.tsx`.
- Design token đã có sẵn (`globals.css`, `tailwind.config.ts`) — dùng `bg-surface`, `border-border`, `text-caption`, `text-small`, `Badge variant=`, không tự đặt màu hex.

## Review Focus

1. **Lỗi `llm_only` không có `toolCallIds` chạm bằng chứng** — `BreakdownError.source === 'llm_only'` vẫn phải hiện được (không phải lỗi hiển thị, là loại nguồn gốc thứ ba) dù không có tool call nào để liên kết tới đường điều tra.
2. **`counted: 'unpriced'`** phải hiện RÕ là "chưa tính vào điểm vì chưa có giá", không lặng lẽ biến mất khỏi danh sách lỗi — đây là ca dễ ẩn nhất vì nó không đổi điểm.
3. **`ungradable !== null`** (cả bài) phải chặn hẳn phần điểm/danh sách lỗi, không hiện điểm `null` cạnh một bảng lỗi rỗng trông như "bài sạch".
4. **`mismatchedRules`/`notConsidered`** (luật lệch tiêu chí, luật model chưa xét đủ phiên) phải hiện ở Trang kiến thức — im lặng bỏ qua hai mảng này là đúng lỗ hổng §14.1/T-FAIR-1 mà spec cảnh báo.
5. **Xem trước giá khi phiên đã CHỐT** — `PricePreview.finalizedSessions` không có `autoAfter`/`blockedByOtherUnpriced` (giá không tự áp lại cho phiên đã chốt) — UI không được vẽ hai cột đó cho hàng phiên đã chốt như thể chúng tồn tại.

---

### Task 1: Backend — route chi tiết một lượt tính điểm

**Files:**
- Create: `apps/api/src/grading/scoring/result-detail.ts`
- Modify: `apps/api/src/grading/grading.controller.ts`
- Test: `apps/api/test/result-detail.e2e-spec.ts`

**Interfaces:**
- Consumes: `GradingService.findResultForOwner` (đã có), `ScoreService.latestComputation` = `latestComputationRow(m, resultId)` (đã có, `score-inputs.ts:44`), raw SQL join `error_rule_revision`/`rubric_criterion`.
- Produces: `loadResultDetail(ds: DataSource, result: GradingResultEntity): Promise<ResultDetail>` — Task 4/5 (qua client) và test của task này dùng đúng hình dạng `ResultDetail` khai dưới đây.

- [ ] **Step 1: Viết test e2e đỏ**

```ts
// apps/api/test/result-detail.e2e-spec.ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';
import { createTestAccount } from './helpers/create-account';
import { seedSession, seedCriterion } from './helpers/grading-seed';
import { seedInvestigatorResult, seedRule, seedPrices, storedWith } from './helpers/investigator-seed';
import { ScoreService } from '../src/grading/scoring/score.service';

describe('GET /grading-results/:id/investigation (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let scores: ScoreService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new PostgresExceptionFilter());
    await app.init();
    ds = app.get(DataSource);
    scores = app.get(ScoreService);
  });
  afterAll(async () => app.close());

  async function login(label: string) {
    const email = `detail_${label}_${Date.now()}@example.com`;
    const id = await createTestAccount(ds, { email, password: 'correct-horse-battery', role: 'teacher' });
    const res = await request(app.getHttpServer()).post('/auth/login').send({ email, password: 'correct-horse-battery' });
    return { id, token: res.body.accessToken as string };
  }

  it('trả breakdown + đường điều tra của bài đã có điểm', async () => {
    const owner = await login('d1');
    const ctx = await seedSession(ds, 'detail-d1', { teacherId: owner.id, deliverableType: 'code_project', language: 'cpp' });
    await seedCriterion(ds, ctx.rubricId, 'tinh_dung', 6);
    await seedCriterion(ds, ctx.rubricId, 'trinh_bay', 4);
    const bien = await seedRule(ds, owner.id, 'sai_bien', 'tinh_dung', { kind: 'test_group_failed', group: 'bien' });
    await seedPrices(ds, owner.id, { [bien.ruleId]: '1.50' });
    const { resultId } = await seedInvestigatorResult(ds, ctx, storedWith([{ ruleKey: 'sai_bien', checkedBy: 'machine' }]));
    await scores.computeInitial(resultId);

    const res = await request(app.getHttpServer())
      .get(`/grading-results/${resultId}/investigation`)
      .set('Authorization', `Bearer ${owner.token}`);

    expect(res.status).toBe(200);
    expect(res.body.pipeline).toBe('investigator');
    expect(res.body.breakdown.errors).toEqual([
      expect.objectContaining({ ruleKey: 'sai_bien', source: 'deterministic', counted: 'counted', ruleName: expect.any(String) }),
    ]);
    expect(res.body.investigation.toolCalls.length).toBeGreaterThan(0);
    expect(res.body.investigation.summary).toEqual(expect.any(String));
  });

  it('bài của giảng viên khác → 403', async () => {
    const owner = await login('d2');
    const stranger = await login('d2-stranger');
    const ctx = await seedSession(ds, 'detail-d2', { teacherId: owner.id, deliverableType: 'code_project', language: 'cpp' });
    await seedCriterion(ds, ctx.rubricId, 'tinh_dung', 10);
    const { resultId } = await seedInvestigatorResult(ds, ctx, storedWith([]));
    await scores.computeInitial(resultId);

    const res = await request(app.getHttpServer())
      .get(`/grading-results/${resultId}/investigation`)
      .set('Authorization', `Bearer ${stranger.token}`);
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận đỏ**

Run: `pnpm --filter api test:e2e result-detail.e2e-spec.ts`
Expected: FAIL — route `grading-results/:id/investigation` chưa tồn tại (404).

- [ ] **Step 3: Viết `loadResultDetail`**

```ts
// apps/api/src/grading/scoring/result-detail.ts
import { DataSource } from 'typeorm';
import { GradingResultEntity } from '../entities/grading-result.entity';
import { GradingPipeline } from '../grading-model.types';
import { CurrentScore, currentScore } from './current-score';
import { latestComputationRow } from './score-inputs';
import type { ScoreBreakdown } from './score-core';
import type { StoredInvestigation } from './stored-investigation';

export interface ResultDetailError {
  ruleId: string;
  ruleKey: string;
  ruleName: string;
  criterionKey: string;
  source: ScoreBreakdown['errors'][number]['source'];
  toolCallIds: string[];
  deductionHundredths: number | null;
  counted: ScoreBreakdown['errors'][number]['counted'];
}

export interface ResultDetail {
  pipeline: GradingPipeline;
  currentScore: number | null;
  currentScoreSource: CurrentScore['source'];
  status: string;
  ungradableClass: string | null;
  ungradableReason: string | null;
  breakdown: (Omit<ScoreBreakdown, 'errors'> & { errors: ResultDetailError[] }) | null;
  investigation: StoredInvestigation['result'] | null;
}

/**
 * Chi tiết MỘT lượt tính điểm + đường điều tra của nó — không route nào trả cái này trước Task 1
 * của plan `2026-09-27-grading-knowledge-and-result-ui.md`. Chỉ đọc, không tính lại gì
 * (`computeScore`/`ScoreService` đã tính và lưu từ trước).
 */
export async function loadResultDetail(ds: DataSource, result: GradingResultEntity): Promise<ResultDetail> {
  const computation = await latestComputationRow(ds.manager, result.id);
  const [attempt] = result.currentAttemptId
    ? await ds.query(`SELECT investigation FROM examcollect.grading_attempt WHERE id = $1`, [result.currentAttemptId])
    : [null];
  const stored = attempt?.investigation as StoredInvestigation | undefined;

  let breakdown: ResultDetail['breakdown'] = null;
  if (computation) {
    const ruleIds = computation.breakdown.errors.map((e) => e.ruleId);
    const names = new Map<string, string>();
    if (ruleIds.length > 0) {
      const rows: { id: string; name: string }[] = await ds.query(
        `SELECT r.id, v.name FROM examcollect.error_rule r
           JOIN examcollect.error_rule_revision v ON v.id = r.current_revision_id
          WHERE r.id = ANY($1::uuid[])`,
        [ruleIds],
      );
      for (const row of rows) names.set(row.id, row.name);
    }
    breakdown = {
      ...computation.breakdown,
      errors: computation.breakdown.errors.map((e) => ({ ...e, ruleName: names.get(e.ruleId) ?? e.ruleKey })),
    };
  }

  const current = currentScore({
    pipeline: result.pipeline,
    aiTotalScore: result.aiTotalScore,
    latestScoredReview: null,
    latestManualScore: null,
    finalized: result.status === 'finalized' || result.status === 'exported',
    finalizedComputationScore: null,
    latestComputationScore: computation?.score ?? null,
  });

  return {
    pipeline: result.pipeline,
    currentScore: current.value,
    currentScoreSource: current.source,
    status: result.status,
    ungradableClass: result.ungradableClass,
    ungradableReason: result.ungradableReason,
    breakdown,
    investigation: stored?.result ?? null,
  };
}
```

*(Kiểm chữ ký thật của `currentScore()`/`CurrentScore` ở `apps/api/src/grading/scoring/current-score.ts` trước khi viết — nếu `latestScoredReview`/`latestManualScore`/`finalizedComputationScore` cần nạp thật từ DB thay vì `null` cứng để `currentScore` ra đúng cho bài đã có `teacher_review`, dùng lại đúng cách `grading.service.ts:753-761` đã nạp `source`/`review` — đừng chép sai một nhánh rồi hồ sơ hiện điểm cũ.)*

- [ ] **Step 4: Route mới**

Trong `grading.controller.ts`, thêm ngay sau `submissionTextForResult`:

```ts
  @Get('grading-results/:id/investigation')
  @Roles('teacher')
  async resultInvestigation(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    const result = await this.grading.findResultForOwner(id, req.user!.sub);
    return loadResultDetail(this.dataSource, result);
  }
```

Thêm `import { loadResultDetail } from './scoring/result-detail';` và `import { DataSource } from 'typeorm';` + `@InjectDataSource() private readonly dataSource: DataSource` vào constructor của `GradingController` (kiểm constructor hiện có trước khi thêm — không trùng tên biến).

- [ ] **Step 5: Chạy lại, xác nhận xanh**

Run: `pnpm --filter api test:e2e result-detail.e2e-spec.ts`
Expected: PASS cả hai ca.

- [ ] **Step 6: Chạy hồi quy nhanh + build**

Run: `pnpm --filter api build && pnpm --filter api test:e2e rules-routes.e2e-spec.ts finalize-investigator.e2e-spec.ts`
Expected: PASS, build sạch.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/grading/scoring/result-detail.ts apps/api/src/grading/grading.controller.ts apps/api/test/result-detail.e2e-spec.ts
git commit -m "feat(grading): route chi tiết một lượt tính điểm cho Hồ sơ một bài (§5)"
```

---

### Task 2: Regenerate OpenAPI client + typed API wrappers

**Files:**
- Modify: `packages/shared/src/api/schema.d.ts` (sinh tự động, không sửa tay)
- Create: `apps/web/src/lib/api/rules.ts`
- Modify: `apps/web/src/lib/api/grading.ts`

**Interfaces:**
- Produces: `apps/web/src/lib/api/rules.ts` exports `Rule`, `RulePreview`, `PricePreview`, `CriterionWaiver`, `listRules()`, `listMissingRules()`, `createRule()`, `reviseRule()`, `previewRule()`, `setRuleState()`, `previewPrice()`, `setPrice()`, `listWaivers()`, `setWaiver()`, `revokeWaiver()`. Task 3's hooks import these by name.
- `apps/web/src/lib/api/grading.ts`: `GradingResult` gets `pipeline: 'one_shot' | 'investigator'`, `currentScore: number | null`, `currentScoreSource: string`; new `getResultInvestigation(resultId): Promise<ResultDetail>` (mirror của Task 1's `ResultDetail`).

- [ ] **Step 1: Chạy API rồi sinh lại client**

Run (hai terminal, hoặc background): `pnpm --filter api start:dev` rồi khi server sẵn sàng `pnpm --filter @cine/shared generate:api-client`
Expected: `packages/shared/src/api/schema.d.ts` đổi, có `/rules`, `/rules/missing`, `/rules/{id}/price`, `/grading-results/{id}/investigation`, v.v. Nếu Docker Desktop tự tắt giữa chừng (đã xảy ra ở phiên trước), khởi động lại rồi thử lại — xem `cine-openapi-client-regeneration`.

- [ ] **Step 2: `apps/web/src/lib/api/rules.ts`**

```ts
import { apiClient } from '@/lib/api-client';

/** Mirrors RuleListItem (apps/api/src/grading/rules/error-rule.service.ts). */
export interface Rule {
  id: string;
  ruleKey: string;
  state: string;
  origin: string;
  revision: { id: string; revision: number; name: string; description: string; criterionKey: string; predicate: unknown | null };
  checkedBy: 'machine' | 'model';
  deduction: string | null;
  appliedTo: { results: number; sessions: number };
  mismatchedIn: number;
}

/** Mirrors RulePreview (apps/api/src/grading/rules/error-rule.service.ts). */
export type RulePreview =
  | { tier: 2; results: { resultId: string; sessionId: string; before: string | null; after: number | null; capped: boolean }[] }
  | { tier: 3; reason: string }
  | { tier: 4; sessions: { sessionId: string; name: string; graded: boolean }[] };

/** Mirrors PricePreview (apps/api/src/grading/rules/price.service.ts). */
export interface PricePreview {
  openSessions: { sessionId: string; name: string; affected: number; autoAfter: number; blockedByOtherUnpriced: number }[];
  finalizedSessions: { sessionId: string; name: string; affected: number }[];
}

export interface CriterionWaiver {
  id: string;
  criterionKey: string;
  setAt: string;
  revokedAt: string | null;
}

function fail(error: unknown, response: Response): Error {
  const body = error as { message?: string | string[] } | undefined;
  const message = Array.isArray(body?.message) ? body!.message.join('; ') : body?.message;
  return new Error(message ?? `Yêu cầu thất bại (HTTP ${response.status})`);
}

export async function listRules(): Promise<Rule[]> {
  const { data, error, response } = await apiClient.GET('/rules');
  if (error || !response.ok) throw fail(error, response);
  return data as unknown as Rule[];
}

export async function listMissingRules(): Promise<Rule[]> {
  const { data, error, response } = await apiClient.GET('/rules/missing');
  if (error || !response.ok) throw fail(error, response);
  return data as unknown as Rule[];
}

export interface RuleInput {
  ruleKey?: string;
  name?: string;
  description?: string;
  criterionKey?: string;
  predicate?: unknown;
}

export async function createRule(input: RuleInput): Promise<{ ruleId: string; revisionId: string }> {
  const { data, error, response } = await apiClient.POST('/rules', { body: input as never });
  if (error || !response.ok) throw fail(error, response);
  return data as unknown as { ruleId: string; revisionId: string };
}

export async function reviseRule(ruleId: string, changes: RuleInput): Promise<{ revisionId: string }> {
  const { data, error, response } = await apiClient.PATCH('/rules/{id}', {
    params: { path: { id: ruleId } },
    body: changes as never,
  });
  if (error || !response.ok) throw fail(error, response);
  return data as unknown as { revisionId: string };
}

export async function previewRule(input: RuleInput & { ruleId?: string; deduction?: string | null }): Promise<RulePreview> {
  const { data, error, response } = await apiClient.POST('/rules/preview', { body: input as never });
  if (error || !response.ok) throw fail(error, response);
  return data as unknown as RulePreview;
}

export async function setRuleState(ruleId: string, state: 'active' | 'dismissed' | 'retired'): Promise<void> {
  const { error, response } = await apiClient.POST('/rules/{id}/state', {
    params: { path: { id: ruleId } },
    body: { state },
  });
  if (error || !response.ok) throw fail(error, response);
}

/** "Lưu thì ảnh hưởng bao nhiêu bài" — gọi TRƯỚC setPrice (spec UI 3.1). */
export async function previewPrice(ruleId: string, deduction: string | null): Promise<PricePreview> {
  const { data, error, response } = await apiClient.POST('/rules/{id}/price/preview', {
    params: { path: { id: ruleId } },
    body: { deduction },
  });
  if (error || !response.ok) throw fail(error, response);
  return data as unknown as PricePreview;
}

export async function setPrice(ruleId: string, deduction: string | null): Promise<void> {
  const { error, response } = await apiClient.PUT('/rules/{id}/price', {
    params: { path: { id: ruleId } },
    body: { deduction },
  });
  if (error || !response.ok) throw fail(error, response);
}

export async function listWaivers(rubricId: string): Promise<CriterionWaiver[]> {
  const { data, error, response } = await apiClient.GET('/rubrics/{id}/criterion-waivers', {
    params: { path: { id: rubricId } },
  });
  if (error || !response.ok) throw fail(error, response);
  return data as unknown as CriterionWaiver[];
}

export async function setWaiver(rubricId: string, criterionKey: string): Promise<void> {
  const { error, response } = await apiClient.POST('/rubrics/{id}/criterion-waivers', {
    params: { path: { id: rubricId } },
    body: { criterionKey },
  });
  if (error || !response.ok) throw fail(error, response);
}

export async function revokeWaiver(waiverId: string): Promise<void> {
  const { error, response } = await apiClient.POST('/criterion-waivers/{id}/revoke', {
    params: { path: { id: waiverId } },
  });
  if (error || !response.ok) throw fail(error, response);
}
```

*(Xác nhận đúng shape đường dẫn openapi-fetch của các route có `:id`/`:id/state` v.v. khớp với `schema.d.ts` MỚI sinh ở Step 1 — openapi-typescript đặt tên path param theo đúng token trong route Nest, thường trùng `id`/`bundleId` sẵn có; sửa lại path key nếu generator đặt tên khác.)*

- [ ] **Step 3: Mở rộng `apps/web/src/lib/api/grading.ts`**

Thêm vào interface `GradingResult` (sau `editedCriteria`):

```ts
  /** Đường chấm của bài — gán một lần lúc bắt đầu chấm (§14.1). */
  pipeline: 'one_shot' | 'investigator';
  /** Điểm hiện tại theo §14.2 — MỌI màn đọc điểm từ đây, không phải `aiTotalScore`. */
  currentScore: number | null;
  currentScoreSource: string;
```

Thêm cuối file:

```ts
/** Mirrors ResultDetail (apps/api/src/grading/scoring/result-detail.ts). */
export interface ResultDetailError {
  ruleId: string;
  ruleKey: string;
  ruleName: string;
  criterionKey: string;
  source: 'deterministic' | 'llm_with_tools' | 'llm_only';
  toolCallIds: string[];
  deductionHundredths: number | null;
  counted: 'counted' | 'excluded' | 'unpriced';
}

export interface ToolCallView {
  id: string;
  tool: string;
  args: Record<string, unknown>;
  status: string;
  output: string;
  startedAt: string;
  wallMs: number;
  injectionSuspected: boolean;
}

export interface ResultDetail {
  pipeline: 'one_shot' | 'investigator';
  currentScore: number | null;
  currentScoreSource: string;
  status: string;
  ungradableClass: string | null;
  ungradableReason: string | null;
  breakdown: {
    errors: ResultDetailError[];
    perCriterion: { key: string; maxHundredths: number; deductedHundredths: number; capped: boolean }[];
    errorFlags: { ruleKey: string; code: string }[];
    confidence: number | null;
    mismatchedRules: { ruleId: string; ruleKey: string; criterionKey: string }[];
    notConsidered: { ruleId: string; ruleKey: string }[];
  } | null;
  investigation: {
    kind: 'verdict' | 'ungradable';
    summary: string;
    flags: string[];
    investigation: { toolCalls: ToolCallView[] };
  } | null;
}

export async function getResultInvestigation(gradingResultId: string): Promise<ResultDetail> {
  const { data, error, response } = await apiClient.GET('/grading-results/{id}/investigation', {
    params: { path: { id: gradingResultId } },
  });
  if (error || !response.ok) throw fail(error, response);
  return data as unknown as ResultDetail;
}
```

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter web exec tsc --noEmit`
Expected: 0 lỗi. Nếu `apiClient.GET('/rules')` báo path không tồn tại trong type, quay lại Step 1 — schema chưa sinh lại đúng.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/api/schema.d.ts apps/web/src/lib/api/rules.ts apps/web/src/lib/api/grading.ts
git commit -m "feat(web): sinh lại API client + wrapper cho rules và chi tiết lượt tính điểm"
```

---

### Task 3: Hooks

**Files:**
- Create: `apps/web/src/hooks/useRules.ts`
- Modify: `apps/web/src/hooks/useGrading.ts`

**Interfaces:**
- Consumes: mọi hàm của Task 2.
- Produces: `useRules()`, `useMissingRules()`, `useCreateRule()`, `useReviseRule()`, `useSetRuleState()`, `usePreviewRule()` (không cache, gọi trực tiếp qua `useMutation` vì input đổi liên tục lúc gõ), `usePreviewPrice()`, `useSetPrice()`, `useWaivers(rubricId)`, `useSetWaiver(rubricId)`, `useRevokeWaiver(rubricId)` — Task 4 gọi các hook này. `useResultInvestigation(resultId)` — Task 5 gọi hook này.

- [ ] **Step 1: `apps/web/src/hooks/useRules.ts`**

```ts
'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createRule,
  listMissingRules,
  listRules,
  listWaivers,
  previewPrice,
  previewRule,
  reviseRule,
  revokeWaiver,
  setPrice,
  setRuleState,
  setWaiver,
  type PricePreview,
  type RuleInput,
} from '@/lib/api/rules';

const RULES_KEY = ['rules'] as const;
const MISSING_KEY = ['rules', 'missing'] as const;

export function useRules() {
  return useQuery({ queryKey: RULES_KEY, queryFn: listRules });
}

/** Luật agent báo còn thiếu (§2.1) — chặn tự quyết cho tới khi giảng viên xử lý (spec UI 3.1). */
export function useMissingRules() {
  return useQuery({ queryKey: MISSING_KEY, queryFn: listMissingRules });
}

function invalidateRules(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: RULES_KEY });
  void queryClient.invalidateQueries({ queryKey: MISSING_KEY });
}

export function useCreateRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: RuleInput) => createRule(input),
    onSuccess: () => invalidateRules(queryClient),
  });
}

/** Duyệt một luật `proposed` thành luật thật: revise (gắn tiêu chí/predicate) rồi `active`. */
export function useReviseRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ ruleId, changes }: { ruleId: string; changes: RuleInput }) => reviseRule(ruleId, changes),
    onSuccess: () => invalidateRules(queryClient),
  });
}

export function useSetRuleState() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ ruleId, state }: { ruleId: string; state: 'active' | 'dismissed' | 'retired' }) =>
      setRuleState(ruleId, state),
    onSuccess: () => invalidateRules(queryClient),
  });
}

/** "Lưu thì áp vào đâu" — không cache, gõ tới đâu xem trước tới đó. */
export function usePreviewRule() {
  return useMutation({ mutationFn: previewRule });
}

/** "Lưu thì ảnh hưởng bao nhiêu bài" (spec UI 3.1, T-POL-5) — PHẢI gọi trước useSetPrice. */
export function usePreviewPrice() {
  return useMutation<PricePreview, Error, { ruleId: string; deduction: string | null }>({
    mutationFn: ({ ruleId, deduction }) => previewPrice(ruleId, deduction),
  });
}

export function useSetPrice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ ruleId, deduction }: { ruleId: string; deduction: string | null }) => setPrice(ruleId, deduction),
    onSuccess: () => invalidateRules(queryClient),
  });
}

export function useWaivers(rubricId: string | undefined) {
  return useQuery({
    queryKey: ['rubrics', rubricId, 'criterion-waivers'],
    queryFn: () => listWaivers(rubricId!),
    enabled: Boolean(rubricId),
  });
}

export function useSetWaiver(rubricId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (criterionKey: string) => setWaiver(rubricId!, criterionKey),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['rubrics', rubricId, 'criterion-waivers'] }),
  });
}

export function useRevokeWaiver(rubricId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (waiverId: string) => revokeWaiver(waiverId),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['rubrics', rubricId, 'criterion-waivers'] }),
  });
}
```

- [ ] **Step 2: Thêm `useResultInvestigation` vào `useGrading.ts`**

```ts
import { getResultInvestigation } from '@/lib/api/grading';
// ...

/** Chi tiết một lượt tính điểm — Hồ sơ một bài, đường điều tra. */
export function useResultInvestigation(gradingResultId: string | undefined) {
  return useQuery({
    queryKey: ['grading-results', gradingResultId, 'investigation'],
    queryFn: () => getResultInvestigation(gradingResultId!),
    enabled: Boolean(gradingResultId),
  });
}
```

- [ ] **Step 3: Typecheck + lint**

Run: `pnpm --filter web exec tsc --noEmit && pnpm --filter web lint`
Expected: 0 lỗi.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/hooks/useRules.ts apps/web/src/hooks/useGrading.ts
git commit -m "feat(web): hook cho bảng lỗi/giá và chi tiết đường điều tra"
```

---

### Task 4: Trang kiến thức

**Files:**
- Create: `apps/web/src/app/teacher/rules/page.tsx`
- Create: `apps/web/src/app/teacher/rules/_components/RuleTable.tsx`
- Create: `apps/web/src/app/teacher/rules/_components/PriceEditDialog.tsx`
- Create: `apps/web/src/app/teacher/rules/_components/MissingRulesPanel.tsx`
- Test: `apps/web/src/app/teacher/rules/page.test.tsx`
- Test: `apps/web/src/app/teacher/rules/_components/PriceEditDialog.test.tsx`

**Interfaces:**
- Consumes: `useRules`, `useMissingRules`, `usePreviewPrice`, `useSetPrice`, `useReviseRule`, `useSetRuleState` (Task 3); `Rule`, `PricePreview` (Task 2).
- Produces: route `/teacher/rules`, liên kết từ nav (theo khuôn `apps/web/src/components/layout` — thêm một mục nếu nav teacher là danh sách tĩnh; kiểm file layout trước khi sửa).

- [ ] **Step 1: Viết test đỏ cho `page.tsx`** (khuôn `matrix/page.test.tsx`: mock hook, không mock fetch)

```tsx
// page.test.tsx
import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import RulesPage from './page';

vi.mock('@/hooks/useRules', () => ({
  useRules: () => ({ data: [
    { id: 'r1', ruleKey: 'sai_bien', state: 'active', origin: 'teacher',
      revision: { id: 'v1', revision: 1, name: 'Sai ca biên', description: 'Nhóm biên không đạt', criterionKey: 'tinh_dung', predicate: null },
      checkedBy: 'machine', deduction: '1.50', appliedTo: { results: 5, sessions: 2 }, mismatchedIn: 0 },
    { id: 'r2', ruleKey: 'chua_gia', state: 'active', origin: 'teacher',
      revision: { id: 'v2', revision: 1, name: 'Chưa có giá', description: 'x', criterionKey: 'tinh_dung', predicate: null },
      checkedBy: 'model', deduction: null, appliedTo: { results: 0, sessions: 0 }, mismatchedIn: 1 },
  ], isLoading: false }),
  useMissingRules: () => ({ data: [], isLoading: false }),
  usePreviewPrice: () => ({ mutateAsync: vi.fn(), data: undefined, isPending: false }),
  useSetPrice: () => ({ mutate: vi.fn(), isPending: false }),
  useReviseRule: () => ({ mutate: vi.fn(), isPending: false }),
  useSetRuleState: () => ({ mutate: vi.fn(), isPending: false }),
}));

describe('Trang kiến thức', () => {
  it('hiện luật chưa có giá và số bài lệch tiêu chí', () => {
    render(<RulesPage />);
    expect(screen.getByText('sai_bien')).toBeInTheDocument();
    expect(screen.getByText(/chưa có giá/i)).toBeInTheDocument();
    expect(screen.getByText(/1 bài lệch tiêu chí/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận đỏ**

Run: `pnpm --filter web test rules/page.test.tsx`
Expected: FAIL — `./page` chưa tồn tại.

- [ ] **Step 3: `RuleTable.tsx`** (dense table, khuôn `MatrixTable.tsx`)

```tsx
'use client';

import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { Rule } from '@/lib/api/rules';

export function RuleTable({ rules, onEditPrice }: { rules: Rule[]; onEditPrice: (rule: Rule) => void }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Luật</TableHead>
            <TableHead>Tiêu chí</TableHead>
            <TableHead>Nguồn</TableHead>
            <TableHead className="text-right">Giá</TableHead>
            <TableHead className="text-right">Đã áp</TableHead>
            <TableHead>Cảnh báo</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rules.map((rule) => (
            <TableRow key={rule.id}>
              <TableCell>
                <span className="font-medium">{rule.ruleKey}</span>
                <span className="block text-caption text-muted-foreground">{rule.revision.name}</span>
              </TableCell>
              <TableCell>{rule.revision.criterionKey}</TableCell>
              <TableCell>
                <Badge variant={rule.checkedBy === 'machine' ? 'accent' : 'info'}>
                  {rule.checkedBy === 'machine' ? 'Máy kiểm' : 'Model'}
                </Badge>
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {rule.deduction === null ? (
                  <Badge variant="warning">chưa có giá</Badge>
                ) : (
                  rule.deduction
                )}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {rule.appliedTo.results} bài / {rule.appliedTo.sessions} phiên
              </TableCell>
              <TableCell>
                {rule.mismatchedIn > 0 && (
                  <Badge variant="destructive">{rule.mismatchedIn} bài lệch tiêu chí</Badge>
                )}
              </TableCell>
              <TableCell>
                <button
                  type="button"
                  className="text-small font-medium text-primary underline-offset-2 hover:underline"
                  onClick={() => onEditPrice(rule)}
                >
                  Sửa giá
                </button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
```

- [ ] **Step 4: `PriceEditDialog.tsx`** — bắt buộc xem trước TRƯỚC khi cho lưu (T-POL-5, Global Constraint)

```tsx
'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { usePreviewPrice, useSetPrice } from '@/hooks/useRules';
import type { Rule } from '@/lib/api/rules';

export function PriceEditDialog({ rule, onClose }: { rule: Rule | null; onClose: () => void }) {
  const [deduction, setDeduction] = useState(rule?.deduction ?? '');
  const preview = usePreviewPrice();
  const setPrice = useSetPrice();

  if (!rule) return null;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Giá của {rule.ruleKey}</DialogTitle>
        </DialogHeader>
        <div className="flex items-center gap-2">
          <Input
            value={deduction}
            onChange={(e) => setDeduction(e.target.value)}
            placeholder="Mức trừ, ví dụ 1.50"
          />
          <Button
            variant="secondary"
            onClick={() => preview.mutate({ ruleId: rule.id, deduction: deduction || null })}
            disabled={preview.isPending}
          >
            Xem trước
          </Button>
        </div>

        {preview.data && (
          <div className="rounded-md border border-border bg-surface p-3 text-small">
            {preview.data.openSessions.length === 0 && preview.data.finalizedSessions.length === 0 ? (
              <p className="text-muted-foreground">Giá này chưa áp vào bài nào.</p>
            ) : (
              <>
                {preview.data.openSessions.map((s) => (
                  <p key={s.sessionId}>
                    <span className="font-medium">{s.name}</span>: {s.affected} bài,{' '}
                    {s.autoAfter} bài tự duyệt được sau khi lưu
                    {s.blockedByOtherUnpriced > 0 && `, ${s.blockedByOtherUnpriced} bài vẫn chờ luật khác`}
                  </p>
                ))}
                {preview.data.finalizedSessions.map((s) => (
                  <p key={s.sessionId} className="text-muted-foreground">
                    <span className="font-medium">{s.name}</span> (đã chốt): {s.affected} bài — không tự áp lại
                  </p>
                ))}
              </>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Huỷ</Button>
          <Button
            onClick={() => setPrice.mutate({ ruleId: rule.id, deduction: deduction || null }, { onSuccess: onClose })}
            disabled={!preview.data || setPrice.isPending}
          >
            Lưu giá
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

*(`disabled={!preview.data}` là ép buộc "phải xem trước rồi mới lưu" — Review Focus/T-POL-5. Kiểm `Dialog`/`Input`/`Button` export thật đúng tên trước khi copy — đọc `apps/web/src/components/ui/dialog.tsx` một lượt.)*

- [ ] **Step 5: `MissingRulesPanel.tsx`** — khuôn `NotBuiltYetPanel` cho "chưa xử lý", không phải "chưa xây"

```tsx
'use client';

import { Badge } from '@/components/ui/badge';
import type { Rule } from '@/lib/api/rules';

export function MissingRulesPanel({ rules }: { rules: Rule[] }) {
  if (rules.length === 0) return null;
  return (
    <section className="rounded-lg border border-warning/60 bg-warning-subtle/40 p-4">
      <h3 className="text-small font-semibold">Luật agent báo còn thiếu ({rules.length})</h3>
      <p className="mt-1 text-caption text-muted-foreground">
        Agent gặp lỗi không khớp luật nào đã có. Xử lý bằng cách tạo luật thật từ đây, hoặc đánh dấu
        không phải lỗi — chưa xử lý thì các bài này không tự quyết được.
      </p>
      <ul className="mt-2.5 flex flex-col gap-1.5">
        {rules.map((rule) => (
          <li key={rule.id} className="flex items-center gap-2 text-small">
            <Badge variant="warning">proposed</Badge>
            {rule.revision.description}
          </li>
        ))}
      </ul>
    </section>
  );
}
```

- [ ] **Step 6: `page.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { useMissingRules, useRules } from '@/hooks/useRules';
import { RuleTable } from './_components/RuleTable';
import { PriceEditDialog } from './_components/PriceEditDialog';
import { MissingRulesPanel } from './_components/MissingRulesPanel';
import type { Rule } from '@/lib/api/rules';

export default function RulesPage() {
  const rules = useRules();
  const missing = useMissingRules();
  const [editing, setEditing] = useState<Rule | null>(null);

  return (
    <div className="flex flex-col gap-4 p-6">
      <h1 className="text-large font-semibold">Trang kiến thức</h1>
      {missing.data && <MissingRulesPanel rules={missing.data} />}
      {rules.isLoading ? (
        <p className="text-muted-foreground">Đang tải…</p>
      ) : (
        <RuleTable rules={rules.data ?? []} onEditPrice={setEditing} />
      )}
      <PriceEditDialog rule={editing} onClose={() => setEditing(null)} />
    </div>
  );
}
```

- [ ] **Step 7: Chạy lại test, xác nhận xanh**

Run: `pnpm --filter web test rules/`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/app/teacher/rules
git commit -m "feat(web): Trang kiến thức — bảng lỗi, giá kèm xem trước, luật còn thiếu"
```

---

### Task 5: Hồ sơ một bài (đường điều tra)

**Files:**
- Create: `apps/web/src/app/teacher/grading/investigation/[resultId]/page.tsx`
- Create: `apps/web/src/app/teacher/grading/investigation/[resultId]/_components/ScoreSummary.tsx`
- Create: `apps/web/src/app/teacher/grading/investigation/[resultId]/_components/DiagnosedErrorList.tsx`
- Create: `apps/web/src/app/teacher/grading/investigation/[resultId]/_components/InvestigationTrail.tsx`
- Test: `apps/web/src/app/teacher/grading/investigation/[resultId]/page.test.tsx`

**Interfaces:**
- Consumes: `useResultInvestigation` (Task 3), `ResultDetail`/`ToolCallView` (Task 2).
- Produces: route `/teacher/grading/investigation/[resultId]`.

- [ ] **Step 1: Viết test đỏ**

```tsx
// page.test.tsx
import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import ResultPage from './page';

vi.mock('next/navigation', () => ({ useParams: () => ({ resultId: 'r1' }) }));
vi.mock('@/hooks/useGrading', () => ({
  useResultInvestigation: () => ({
    isLoading: false,
    data: {
      pipeline: 'investigator', currentScore: 8.5, currentScoreSource: 'auto',
      status: 'auto_approved', ungradableClass: null, ungradableReason: null,
      breakdown: {
        errors: [
          { ruleId: 'r1', ruleKey: 'sai_bien', ruleName: 'Sai ca biên', criterionKey: 'tinh_dung',
            source: 'deterministic', toolCallIds: ['tc-1'], deductionHundredths: 150, counted: 'counted' },
          { ruleId: 'r2', ruleKey: 'ten_bien', ruleName: 'Đặt tên biến', criterionKey: 'trinh_bay',
            source: 'llm_with_tools', toolCallIds: [], deductionHundredths: null, counted: 'unpriced' },
        ],
        perCriterion: [{ key: 'tinh_dung', maxHundredths: 600, deductedHundredths: 150, capped: false }],
        errorFlags: [{ ruleKey: 'ten_bien', code: 'unpriced' }],
        confidence: 0.8, mismatchedRules: [], notConsidered: [],
      },
      investigation: {
        kind: 'verdict', summary: 'Bài chạy đủ test, một lỗi đặt tên biến.', flags: [],
        investigation: { toolCalls: [{ id: 'tc-1', tool: 'run_tests', args: {}, status: 'ok', output: '', startedAt: '', wallMs: 120, injectionSuspected: false }] },
      },
    },
  }),
}));

describe('Hồ sơ một bài', () => {
  it('hiện điểm hiện tại, lỗi chưa có giá, và đường điều tra', () => {
    render(<ResultPage />);
    expect(screen.getByText('8.5')).toBeInTheDocument();
    expect(screen.getByText('sai_bien')).toBeInTheDocument();
    expect(screen.getByText(/chưa có giá/i)).toBeInTheDocument();
    expect(screen.getByText('run_tests')).toBeInTheDocument();
    expect(screen.getByText(/một lỗi đặt tên biến/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận đỏ**

Run: `pnpm --filter web test grading/investigation`
Expected: FAIL — route chưa tồn tại.

- [ ] **Step 3: `ScoreSummary.tsx`**

```tsx
'use client';

import { Badge } from '@/components/ui/badge';
import type { ResultDetail } from '@/lib/api/grading';

export function ScoreSummary({ detail }: { detail: ResultDetail }) {
  if (detail.ungradableClass) {
    return (
      <section className="rounded-lg border border-destructive/60 bg-destructive/5 p-4">
        <p className="text-small font-semibold text-destructive">Không chấm được — {detail.ungradableClass}</p>
        <p className="mt-1 text-small text-muted-foreground">{detail.ungradableReason}</p>
      </section>
    );
  }
  return (
    <section className="flex items-center gap-4 rounded-lg border border-border bg-surface p-4">
      <span className="text-3xl font-semibold tabular-nums">
        {detail.currentScore === null ? '—' : detail.currentScore}
      </span>
      <Badge variant={detail.currentScoreSource === 'auto' ? 'accent' : 'info'}>
        {detail.currentScoreSource}
      </Badge>
      {detail.breakdown?.perCriterion.map((c) => (
        <span key={c.key} className="text-caption text-muted-foreground">
          {c.key}: {(c.deductedHundredths / 100).toFixed(2)}/{(c.maxHundredths / 100).toFixed(2)}
          {c.capped && ' (chạm trần)'}
        </span>
      ))}
    </section>
  );
}
```

- [ ] **Step 4: `DiagnosedErrorList.tsx`** — nguồn gốc + cờ theo TỪNG lỗi (Review Focus #1, #2)

```tsx
'use client';

import { Badge, type BadgeProps } from '@/components/ui/badge';
import type { ResultDetail, ResultDetailError } from '@/lib/api/grading';

const SOURCE_LABEL: Record<ResultDetailError['source'], { label: string; variant: BadgeProps['variant'] }> = {
  deterministic: { label: 'Máy quyết', variant: 'accent' },
  llm_with_tools: { label: 'Model + công cụ', variant: 'info' },
  llm_only: { label: 'Chỉ model', variant: 'warning' },
};

export function DiagnosedErrorList({ breakdown }: { breakdown: NonNullable<ResultDetail['breakdown']> }) {
  const flagsByRule = new Map(breakdown.errorFlags.map((f) => [f.ruleKey, f.code]));
  return (
    <section className="flex flex-col gap-2">
      <h3 className="section-label">Lỗi chẩn đoán ({breakdown.errors.length})</h3>
      <ul className="flex flex-col gap-2">
        {breakdown.errors.map((error) => (
          <li key={error.ruleId} className="rounded-md border border-border bg-surface p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{error.ruleName}</span>
              <Badge variant={SOURCE_LABEL[error.source].variant}>{SOURCE_LABEL[error.source].label}</Badge>
              {error.counted === 'excluded' && <Badge variant="secondary">Đã bỏ cho bài này</Badge>}
              {flagsByRule.get(error.ruleKey) === 'unpriced' && <Badge variant="warning">chưa có giá</Badge>}
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
          {breakdown.mismatchedRules.length} luật trỏ tiêu chí không có trong rubric của bài này — xem lại ở Trang kiến thức.
        </p>
      )}
    </section>
  );
}
```

- [ ] **Step 5: `InvestigationTrail.tsx`**

```tsx
'use client';

import type { ResultDetail } from '@/lib/api/grading';

export function InvestigationTrail({ investigation }: { investigation: NonNullable<ResultDetail['investigation']> }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="section-label">Đường điều tra</h3>
      <p className="rounded-md border-l-2 border-primary bg-surface p-3 text-small">{investigation.summary}</p>
      <ul className="flex flex-col gap-1.5">
        {investigation.investigation.toolCalls.map((call) => (
          <li key={call.id} className="flex items-center gap-2 rounded-md border border-border p-2 text-small">
            <span className="font-mono text-caption text-muted-foreground">{call.id}</span>
            <span className="font-medium">{call.tool}</span>
            <span className="text-caption text-muted-foreground">{call.status} · {call.wallMs}ms</span>
            {call.injectionSuspected && (
              <span className="text-caption font-semibold text-destructive">nghi ngờ injection</span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
```

- [ ] **Step 6: `page.tsx`**

```tsx
'use client';

import { useParams } from 'next/navigation';
import { useResultInvestigation } from '@/hooks/useGrading';
import { ScoreSummary } from './_components/ScoreSummary';
import { DiagnosedErrorList } from './_components/DiagnosedErrorList';
import { InvestigationTrail } from './_components/InvestigationTrail';

export default function ResultInvestigationPage() {
  const { resultId } = useParams<{ resultId: string }>();
  const { data, isLoading } = useResultInvestigation(resultId);

  if (isLoading || !data) return <p className="p-6 text-muted-foreground">Đang tải…</p>;

  return (
    <div className="flex flex-col gap-4 p-6">
      <h1 className="text-large font-semibold">Hồ sơ một bài</h1>
      <ScoreSummary detail={data} />
      {data.breakdown && <DiagnosedErrorList breakdown={data.breakdown} />}
      {data.investigation && <InvestigationTrail investigation={data.investigation} />}
    </div>
  );
}
```

- [ ] **Step 7: Chạy lại test, xác nhận xanh**

Run: `pnpm --filter web test grading/investigation`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add "apps/web/src/app/teacher/grading/investigation"
git commit -m "feat(web): Hồ sơ một bài — điểm, lỗi chẩn đoán kèm nguồn gốc, đường điều tra"
```

---

### Task 6: Nối đường — matrix/danh sách trỏ đúng route theo `pipeline`

**Files:**
- Modify: `apps/web/src/app/teacher/grading/matrix/_components/MatrixTable.tsx` (hoặc nơi đang có link "xem bài")
- Test: `apps/web/src/app/teacher/grading/matrix/_components/MatrixTable.test.tsx` (mở rộng, không viết lại)

**Interfaces:**
- Consumes: `GradingResult.pipeline` (Task 2).
- Produces: mỗi hàng của Ma trận link tới `/teacher/grading/investigation/{id}` khi `pipeline === 'investigator'`, giữ nguyên `/teacher/grading/{id}` khi `one_shot`.

- [ ] **Step 1: Đọc `MatrixTable.tsx` hiện tại tìm chỗ có link "xem bài"**

Nếu chưa có cột/link nào dẫn tới hồ sơ một bài (bảng nén hiện tại theo Explore agent's report có thể chưa có cột đó), thêm MỘT `TableCell` cuối bảng:

```tsx
<TableCell>
  <Link
    href={row.pipeline === 'investigator' ? `/teacher/grading/investigation/${row.id}` : `/teacher/grading/${row.id}`}
    className="text-small font-medium text-primary underline-offset-2 hover:underline"
  >
    Xem
  </Link>
</TableCell>
```

Thêm `import Link from 'next/link';` và một `<TableHead />` tương ứng ở header.

- [ ] **Step 2: Test hồi quy + ca mới**

Thêm vào `MatrixTable.test.tsx`:

```tsx
it('bài pipeline=investigator trỏ tới hồ sơ một bài, không phải màn cũ', () => {
  render(<MatrixTable results={[result({ id: 'g1', pipeline: 'investigator' })]} ... />);
  expect(screen.getByRole('link', { name: 'Xem' })).toHaveAttribute('href', '/teacher/grading/investigation/g1');
});
```

*(`result()` là factory đã có ở `matrix/_components/fixtures.ts` — thêm `pipeline` vào default nếu factory chưa có trường này, không tạo factory mới.)*

- [ ] **Step 3: Chạy test**

Run: `pnpm --filter web test matrix/`
Expected: PASS, không hồi quy ca cũ.

- [ ] **Step 4: Chạy toàn bộ web test + build**

Run: `pnpm --filter web test && pnpm --filter web build`
Expected: PASS, build sạch.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/teacher/grading/matrix
git commit -m "feat(web): ma trận trỏ đúng hồ sơ một bài theo pipeline"
```

---

## Ngoài phạm vi plan này

- Màn "đang chấm" (grading-in-progress) và "chốt điểm" — đã có `ReadinessStrip`/`ConfidenceTiles`/`FinalizeGradesButton` phần nào; không đụng ở đây.
- Kiểm mẫu (§8.1) — màn riêng, chưa có backend route.
- Chỉnh sửa `criterion-waiver` UI đầy đủ (danh sách + thu hồi) — Task 4 chỉ thêm hook, chưa thêm UI cho waiver (không có trong yêu cầu gốc của hai màn này); để lại `useWaivers`/`useSetWaiver`/`useRevokeWaiver` làm sẵn cho lượt sau.
