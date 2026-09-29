# Hồ sơ một bài (đường điều tra) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task (native/inline execution — no fresh subagent per task). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite `/teacher/grading/[resultId]` so a bài chấm theo đường điều tra (`pipeline: 'investigator'`) renders a real hồ sơ (score, lỗi chẩn đoán, đường điều tra, phản biện, hành động) instead of an empty/broken criterion form, absorb the orphan `grading/investigation/[resultId]` route into it, and give the teacher a working way out of every "Cần xem"/"Không chấm được" state without touching the `one_shot` (bài tự luận / dữ liệu cũ) path.

**Architecture:** `[resultId]/page.tsx` gains one branch: `result.pipeline === 'investigator'` renders a new `InvestigatorDossier` assembled from small presentational sections under `_components/investigator/`; everything else is untouched. All data comes from `GET /grading-results/:id/investigation` (`useResultInvestigation`) joined with the session's `GET /exam-sessions/:id/grading-results` row (for mssv/name/status — `ResultDetail` carries neither). Two new mutations (`useSetErrorException`, `useSetManualScore`) call BE routes that already exist; **no backend code changes** are needed in this plan.

**Tech Stack:** Next.js 15 App Router, TanStack Query, Tailwind (existing token set), Vitest + React Testing Library, `openapi-fetch`. New: a sibling `apps/web-e2e` workspace with Playwright `@playwright/test@1.60.0`, seeding through a NestJS application-context script that reuses `apps/api/test/helpers/*`.

**Spec:** `docs/superpowers/specs/2026-09-23-grading-ui-rebuild-design.md` (§1 bản đồ màn, §2.2 bảng quy đổi, §3.4 Hồ sơ một bài, §3.5 khối phản biện, §3.11 nhánh `one_shot`, §4 bảng xoá) and `docs/superpowers/specs/2026-09-20-grading-agent-investigator-design.md` (§4.2 caseFlags, §4.4/§4.6 cờ, §6 phản biện, §14 kiểu dữ liệu). Mockup reference: canvas "Chấm điểm — mockup UI mới", artboards `Dossier.dc.html`, `Ungradable.dc.html`, `DossierReview.dc.html` (digest at `scratchpad/digest-mockup.md` — not part of the repo, see Assumptions).

## Global Constraints

- No backend changes. Every route this plan calls already exists and is documented in `scratchpad/digest-be.md`: `GET /grading-results/:id/investigation`, `POST /grading-results/:id/error-exceptions`, `POST /grading-results/:id/manual-score`, `GET /exam-sessions/:id/grading-results`.
- Keep the URL `/teacher/grading/[resultId]?sessionId=…` stable (spec §1: "Giữ URL … để link cũ không gãy"). The `sessionId` query param name matches the EXISTING code convention (`grading/page.tsx`, `submissions/[sessionId]/page.tsx`, `SessionTable.tsx`), not the spec text's `?session=` — changing it would break 4 files outside this plan's scope; out of scope here.
- Never touch `pipeline === 'one_shot'` rendering, `CriterionCard`, `ManualCriterionCard`, `AdvocatePanel`, or `AnswerPane`'s existing highlighting behaviour (spec §4: these stay).
- Copy is Vietnamese, comma-decimal, `tabular-nums` on every number column (spec §2.1 luật 6).
- Fix, don't repeat, the four copy violations the spec itself calls out in §2.2: source labels are **"Mô hình + công cụ"** / **"Chỉ mô hình"** (not the mockup's/old code's "Model + công cụ" / "Chỉ model"); the ungradable screen says **"môi trường chạy bài"**, never "sandbox"; each đường điều tra row's PRIMARY text is the action name from the §2.2 table (`chạy gói test`, `đo độ phức tạp`, `dò biên`, `đọc cấu trúc mã`, `đọc file`), with the raw tool name only as a secondary mono line; the phản biện block never shows the word **"lăng kính"** to the teacher (say **"góc kiểm"**).
- A control with no backing route gets the dashed "cần backend" badge (mục 3.3 spec 2026-09-16, referenced by spec §2.1 luật 2) and stays `disabled`; it never sends a request when clicked.
- Every mutation error (409/400 from the routes above) renders the server's own Vietnamese message verbatim in an inline `<Alert variant="destructive">` — never a generic "Có lỗi xảy ra".
- Branch/PR: `feat/grading-ui-rebuild` (already created from `main`, current HEAD `64072e5` docs commit). Commit after each task. No git push/PR yet — that happens once all three plans (A/B/C) for this spec are done, per the user's earlier instruction to keep this on one feature branch.

## Review Focus

1. **A rule the teacher excludes/includes is missing from the latest computation** (someone priced a rule or the price recomputed between page load and the click) → server returns 400 `Lỗi này không có trong lượt tính mới nhất của bài`; the UI must show that exact message inline and NOT silently no-op or crash. → test in Task 5 (ErrorList).
2. **A published result** (`finalized`/`exported`) **still needs a way to fix an obviously wrong score** → error-exception actions must be hidden/disabled once outside `EDITABLE = {auto_approved, flagged_for_review, teacher_reviewed}`, but "Chấm tay bài này" must stay enabled (its own `PUBLISHED` set explicitly allows it) and show the audit-log warning copy. → test in Task 5 + Task 3.
3. **A result sampled for audit (`audit_pending`)** — no code produces this today, but the 409 message `Bài đang trong mẫu kiểm — hãy ghi nhận xét kiểm mẫu trước` is real and reachable by direct URL/race. The status pill must not crash on an unmapped status, and the message must render verbatim if a mutation is attempted. → test in Task 3 (StatusPill) + Task 5.
4. **A result with no score_computation yet** (`breakdown === null`, e.g. still `ai_grading`/`ai_graded`, or a bookmarked link opened mid-grading) must show a neutral "đang chấm, chưa có dữ liệu để hiện" state, never `breakdown.errors.map(...)` on `null`. → test in Task 8 (InvestigatorDossier).
5. **Two lenses disagree on the same error** (one `confirmed`, the other `unverified`) — the row must not silently pick one and hide the other; it shows both verdicts and tints the row by the worse outcome (`refuted` > `unverified` > `confirmed`), since the score-affecting fact (`counted`) already comes from the server. → test in Task 5 (ErrorList).

Sixth, structural one, not input-shaped but just as likely to bite: **the "dưới sàn" state is NOT the same as "không chấm được"**. `ungradableClass !== null` means the investigation itself never produced a verdict (sandbox/replay failure) — the Ungradable screen. `ungradableClass === null && breakdown.ungradable !== null` means investigation succeeded but scoring refuses to publish a number (a floor rule fired) — a *different* message, inside the normal Dossier layout, not the Ungradable screen. Conflating them would tell a teacher "the sandbox never ran" when it did. → handled explicitly in Task 4 (ScoreCard) and tested there.

---

## Task 1: Playwright + seed infrastructure

**Files:**
- Create: `apps/web-e2e/package.json`
- Create: `apps/web-e2e/playwright.config.ts`
- Create: `apps/web-e2e/global-setup.ts`
- Create: `apps/web-e2e/tests/investigator-dossier.spec.ts` (skeleton, filled in Task 10)
- Create: `apps/api/test/ui-e2e/seed.ts`
- Create: `apps/api/test/ui-e2e/README.md`

**Interfaces:**
- Produces: a seed script invocable as `node -r ts-node/register -r tsconfig-paths/register apps/api/test/ui-e2e/seed.ts` from `apps/api`, which writes `apps/api/test/ui-e2e/seed-output.json` shaped `{ email: string; password: string; sessionId: string; results: { flaggedUnpriced: string; autoApproved: string; ungradableSystem: string; ungradableSubmission: string; belowFloor: string } }`. Task 10 reads this file from the Playwright spec.

- [ ] **Step 1: Add the `web-e2e` workspace package**

```json
{
  "name": "web-e2e",
  "version": "0.0.0",
  "private": true,
  "scripts": {
    "test:e2e": "playwright test"
  },
  "devDependencies": {
    "@playwright/test": "1.60.0"
  }
}
```

Named `test:e2e`, not `test` — `turbo.json`'s `test` task runs every workspace's `test` script; a script literally named `test` here would make `pnpm test` (root) try to boot Docker/API/web, per `scratchpad/digest-e2e.md` §7's explicit warning.

- [ ] **Step 2: Install and confirm the pinned browser is reused**

```bash
pnpm install --frozen-lockfile
pnpm --filter web-e2e exec playwright --version
```

Expected: `Version 1.60.0`, and no browser download happens (chromium-1223 is already at `%LOCALAPPDATA%\ms-playwright`, per `scratchpad/digest-e2e.md` §7).

- [ ] **Step 3: Write the seed script**

```ts
// apps/api/test/ui-e2e/seed.ts
import '../setup-env';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module';
import { StorageService } from '../../src/storage/storage.service';
import { ScoreService } from '../../src/grading/scoring/score.service';
import { createTestAccount } from '../helpers/create-account';
import { seedSession, seedResult, seedCriterion } from '../helpers/grading-seed';
import { seedInvestigatorSession, seedRule, seedPrices, seedInvestigatorResult, storedWith } from '../helpers/investigator-seed';
import { putObject } from '../helpers/code-session-seed';
import type { DataSource } from 'typeorm';

const SOURCE_OK = `#include <bits/stdc++.h>\nusing namespace std;\nint main(){int n;cin>>n;vector<int> a(n);for(auto&x:a)cin>>x;for(auto x:a)cout<<x<<" ";}\n`;

async function main() {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  await app.init();
  const ds = app.get<DataSource>('DataSource' as never) ?? app.get(require('typeorm').DataSource);
  const storage = app.get(StorageService);
  const scores = app.get(ScoreService);

  const email = `ui_teacher_${Date.now()}@example.com`;
  const password = 'correct-horse-battery';
  const teacherId = await createTestAccount(ds, { email, password, role: 'teacher' });

  const ctx = await seedSession(ds, 'ui-dossier', { teacherId, deliverableType: 'code_project', language: 'cpp' });
  await ds.query('UPDATE examcollect.exam_session SET rubric_id = $1 WHERE id = $2', [ctx.rubricId, ctx.sessionId]);
  await seedInvestigatorSession(ds, ctx);
  // criterion tinh_dung(6) already comes from seedInvestigatorSession; add one WITHOUT a rule for the "dưới sàn"/criterion_without_rules case.
  const hieuNangId = await seedCriterion(ds, ctx.rubricId, 'hieu_nang', 1);

  const bien = await seedRule(ds, teacherId, 'sai_bien', 'tinh_dung', { kind: 'test_group_failed', group: 'bien' });
  const ten = await seedRule(ds, teacherId, 'ten_bien', 'trinh_bay'); // model-checked, LEFT UNPRICED on purpose
  await seedPrices(ds, teacherId, { [bien.ruleId]: '1.50' });

  const SEEN = [
    { ruleKey: 'sai_bien', checkedBy: 'machine' as const },
    { ruleKey: 'ten_bien', checkedBy: 'model' as const },
  ];

  async function seedInvestigatorSubmission(label: string, modelErrors: string[]) {
    const key = `e2e/ui-dossier/${label}-${Date.now()}`;
    await putObject(storage, key, SOURCE_OK);
    const { resultId } = await seedInvestigatorResult(ds, ctx, storedWith(SEEN, modelErrors));
    await scores.computeInitial(resultId);
    return resultId;
  }

  // 1. flagged, unpriced rule blocking auto-decide
  const flaggedUnpriced = await seedInvestigatorSubmission('flagged', ['ten_bien']);
  // 2. clean run, machine rule only, auto-approved
  const autoApproved = await seedInvestigatorSubmission('auto', []);
  // 3. ungradable — investigation itself never produced a verdict (system-side)
  const { resultId: ungradableSystem } = await seedInvestigatorResult(
    ds,
    ctx,
    storedWith(SEEN, [], true, SEEN, { ungradable: { class: 'system', reason: 'Sandbox không phản hồi sau 3 lần thử.' } }),
  );
  await scores.computeInitial(ungradableSystem).catch(() => undefined); // computeInitial on an ungradable attempt is expected to finish it as ungradable, not throw — see helper below
  // 4. ungradable — submission-side (unreadable/empty)
  const { resultId: ungradableSubmission } = await seedInvestigatorResult(
    ds,
    ctx,
    storedWith(SEEN, [], true, SEEN, { ungradable: { class: 'submission', reason: 'Không đọc được file nộp — rỗng hoặc hỏng.' } }),
  );
  await scores.computeInitial(ungradableSubmission).catch(() => undefined);
  // 5. below floor — criterion "hieu_nang" has no rule and is not waived
  const belowFloor = await seedInvestigatorSubmission('floor', []);

  const out = {
    email,
    password,
    sessionId: ctx.sessionId,
    results: { flaggedUnpriced, autoApproved, ungradableSystem, ungradableSubmission, belowFloor },
  };
  fs.writeFileSync(path.join(__dirname, 'seed-output.json'), JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out));

  await app.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 4: Run the seed once by hand to confirm it produces the five states**

```bash
cd apps/api
DOTENV_CONFIG_PATH=.env.test npx ts-node -r tsconfig-paths/register test/ui-e2e/seed.ts
cat test/ui-e2e/seed-output.json
```

Expected: a JSON object with 5 non-empty UUIDs. If `storedWith`/`seedInvestigatorResult` don't accept an `ungradable` override yet, read `apps/api/src/grading/decision/testing/result.ts` and `apps/api/test/helpers/investigator-seed.ts` first and adjust the seed script's call shape to match what those helpers actually export — the helper signatures above are read from `scratchpad/digest-e2e.md` §4 and may need small adaptation once compiled (this step is exactly where that gets caught, before any UI work depends on it).

- [ ] **Step 5: Write `playwright.config.ts` and `global-setup.ts`**

```ts
// apps/web-e2e/playwright.config.ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  workers: 1,
  reporter: [['list']],
  globalSetup: require.resolve('./global-setup.ts'),
  use: {
    baseURL: 'http://localhost:3000',
    storageState: '.auth/teacher.json',
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'node dist/src/main.js',
      cwd: '../api',
      env: { DOTENV_CONFIG_PATH: '.env.test' },
      url: 'http://localhost:4000/health',
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: 'pnpm --filter web start',
      cwd: '../..',
      url: 'http://localhost:3000/login',
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
```

```ts
// apps/web-e2e/global-setup.ts
import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { chromium, type FullConfig } from '@playwright/test';

export default async function globalSetup(config: FullConfig) {
  execSync('npx ts-node -r tsconfig-paths/register test/ui-e2e/seed.ts', {
    cwd: path.resolve(__dirname, '../api'),
    env: { ...process.env, DOTENV_CONFIG_PATH: '.env.test' },
    stdio: 'inherit',
  });
  const seed = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, '../api/test/ui-e2e/seed-output.json'), 'utf8'),
  );
  fs.mkdirSync(path.resolve(__dirname, '.auth'), { recursive: true });
  fs.writeFileSync(path.resolve(__dirname, '.auth/seed.json'), JSON.stringify(seed));

  const baseURL = config.projects[0]?.use?.baseURL ?? 'http://localhost:3000';
  const browser = await chromium.launch();
  const page = await browser.newPage({ baseURL });
  await page.goto('/login');
  await page.fill('#email', seed.email);
  await page.fill('#password', seed.password);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await page.waitForURL('**/teacher/dashboard');
  await page.context().storageState({ path: path.resolve(__dirname, '.auth/teacher.json') });
  await browser.close();
}
```

```ts
// apps/web-e2e/tests/investigator-dossier.spec.ts
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test, expect } from '@playwright/test';

const seed = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../.auth/seed.json'), 'utf8'),
) as {
  sessionId: string;
  results: { flaggedUnpriced: string; autoApproved: string; ungradableSystem: string; ungradableSubmission: string; belowFloor: string };
};

test('placeholder — filled in Task 10', async ({ page }) => {
  await page.goto(`/teacher/grading/${seed.results.autoApproved}?sessionId=${seed.sessionId}`);
  await expect(page.locator('h1')).toBeVisible();
});
```

- [ ] **Step 6: `.gitignore` the runtime artefacts**

```bash
cat >> apps/web-e2e/.gitignore <<'EOF'
.auth/
test-results/
playwright-report/
EOF
cat >> apps/api/.gitignore <<'EOF'
test/ui-e2e/seed-output.json
EOF
```

- [ ] **Step 7: Commit**

```bash
git add apps/web-e2e apps/api/test/ui-e2e apps/api/.gitignore
git commit -m "test(e2e): scaffold Playwright workspace and DB seed script for grading UI"
```

---

## Task 2: API layer — error-exceptions, manual-score, and the missing `caseFlags`/`ungradable` fields

**Files:**
- Modify: `apps/web/src/lib/api/grading.ts`
- Modify: `apps/web/src/hooks/useGrading.ts`
- Test: `apps/web/src/hooks/useGrading.test.ts`
- Create: `apps/web/src/lib/format.ts`
- Test: `apps/web/src/lib/format.test.ts`
- Create: `apps/web/src/lib/grading-vocab.ts`
- Test: `apps/web/src/lib/grading-vocab.test.ts`

**Interfaces:**
- Produces: `setErrorException(resultId, ruleId, direction)`, `setManualScore(resultId, score)`, `useSetErrorException(examSessionId)`, `useSetManualScore(examSessionId)`, `investigationQueryKey(resultId)`; `formatVnPoints(value: number | null): string`; `caseFlagLabel(code, detail)`, `SOURCE_LABEL`, `VERDICT_LABEL`, `toolActionLabel(tool)`, `lensLabel(key)`. All later tasks consume these — nothing here renders JSX.

- [ ] **Step 1: Write the failing tests for `format.ts`**

```ts
// apps/web/src/lib/format.test.ts
import { describe, expect, it } from 'vitest';
import { formatVnPoints, formatVnDeduction } from './format';

describe('formatVnPoints', () => {
  it('trims a trailing zero: 4 → "4,0", not "4,00"', () => {
    expect(formatVnPoints(4)).toBe('4,0');
  });
  it('keeps a real quarter-point: 7.25 → "7,25"', () => {
    expect(formatVnPoints(7.25)).toBe('7,25');
  });
  it('uses U+2212 for negative values, not ASCII hyphen', () => {
    expect(formatVnPoints(-1.5)).toBe('−1,5');
  });
  it('renders null as an em dash', () => {
    expect(formatVnPoints(null)).toBe('—');
  });
});

describe('formatVnDeduction', () => {
  it('always shows a rule price as a deduction, even given a positive number', () => {
    expect(formatVnDeduction(150)).toBe('−1,5');
  });
});
```

- [ ] **Step 2: Run to confirm it fails**

```bash
cd apps/web && pnpm exec vitest run src/lib/format.test.ts
```

Expected: FAIL — `Cannot find module './format'`.

- [ ] **Step 3: Implement `format.ts`**

```ts
// apps/web/src/lib/format.ts
/**
 * Số kiểu Việt Nam (§2.1 luật 6 của spec UI): dấu phẩy thập phân, dấu trừ
 * Unicode U+2212 (không phải dấu gạch ngang ASCII), 2 chữ số lẻ rồi bỏ số 0
 * cuối nếu tròn — "4,0" chứ không "4,00", nhưng "7,25" giữ nguyên.
 */
const VN_MINUS = '−';

export function formatVnPoints(value: number | null): string {
  if (value === null) return '—';
  const sign = value < 0 ? VN_MINUS : '';
  const comma = Math.abs(value).toFixed(2).replace('.', ',');
  return sign + comma.replace(/(,\d)0$/, '$1');
}

export function formatVnHundredths(hundredths: number | null): string {
  return formatVnPoints(hundredths === null ? null : hundredths / 100);
}

/** Mức trừ của một luật — luôn hiện dạng âm, kể cả khi giá trị lưu là số dương. */
export function formatVnDeduction(hundredths: number): string {
  return formatVnPoints(-Math.abs(hundredths) / 100);
}
```

- [ ] **Step 4: Run to confirm it passes**

```bash
pnpm exec vitest run src/lib/format.test.ts
```

- [ ] **Step 5: Write the failing tests for `grading-vocab.ts`**

```ts
// apps/web/src/lib/grading-vocab.test.ts
import { describe, expect, it } from 'vitest';
import { caseFlagLabel, lensLabel, toolActionLabel, SOURCE_LABEL, VERDICT_LABEL } from './grading-vocab';

describe('SOURCE_LABEL', () => {
  it('uses the spec §2.2 Vietnamese labels, not the old "Model" wording', () => {
    expect(SOURCE_LABEL.llm_with_tools.label).toBe('Mô hình + công cụ');
    expect(SOURCE_LABEL.llm_only.label).toBe('Chỉ mô hình');
    expect(SOURCE_LABEL.deterministic.label).toBe('Máy quyết');
  });
});

describe('VERDICT_LABEL', () => {
  it('renders "Chưa kiểm được" for unverified, per §2.2', () => {
    expect(VERDICT_LABEL.unverified.label).toBe('Chưa kiểm được');
  });
});

describe('caseFlagLabel', () => {
  it('maps a known code', () => {
    expect(caseFlagLabel('criterion_without_rules', 'tiêu chí "hieu_nang" không có luật nào trỏ vào')).toBe(
      'Tiêu chí chưa có luật nào',
    );
  });
  it('resolves investigation_flag by its detail, not its code', () => {
    expect(caseFlagLabel('investigation_flag', 'budget_exhausted')).toBe('Hết lượt điều tra trước khi xong');
  });
  it('never throws on an unknown code — names it instead of hiding it', () => {
    expect(caseFlagLabel('some_future_flag', 'chi tiết')).toContain('some_future_flag');
  });
});

describe('toolActionLabel', () => {
  it('maps run_tests to the §2.2 action name, not the tool name', () => {
    expect(toolActionLabel('run_tests')).toBe('Chạy gói test');
  });
  it('falls back to the raw name for an unmapped tool', () => {
    expect(toolActionLabel('future_tool')).toBe('future_tool');
  });
});

describe('lensLabel', () => {
  it('maps the four known lenses', () => {
    expect(lensLabel('tinh_dung')).toBe('Tính đúng');
    expect(lensLabel('gian_lan')).toBe('Gian lận');
  });
});
```

- [ ] **Step 6: Run to confirm it fails**, then **Step 7: implement**

```ts
// apps/web/src/lib/grading-vocab.ts
import type { BadgeProps } from '@/components/ui/badge';

/**
 * Bảng quy đổi lời văn — spec UI §2.2. Nhãn ở ĐÂY là chuẩn. Nếu một chỗ
 * khác trong code lệch bảng này (ví dụ "Model" thay vì "Mô hình"), sửa
 * theo bảng này — spec §2.2 tự nêu đích danh mockup còn phạm luật ở bốn
 * chỗ, và đây là nơi sửa cả bốn.
 */
export const SOURCE_LABEL: Record<
  'deterministic' | 'llm_with_tools' | 'llm_only',
  { label: string; variant: BadgeProps['variant'] }
> = {
  deterministic: { label: 'Máy quyết', variant: 'accent' },
  llm_with_tools: { label: 'Mô hình + công cụ', variant: 'info' },
  llm_only: { label: 'Chỉ mô hình', variant: 'warning' },
};

export const VERDICT_LABEL: Record<
  'confirmed' | 'refuted' | 'unverified',
  { label: string; variant: BadgeProps['variant']; tintClass: string }
> = {
  confirmed: { label: 'Xác nhận', variant: 'success', tintClass: 'bg-success-subtle' },
  refuted: { label: 'Bác bỏ', variant: 'destructive', tintClass: 'bg-danger-subtle' },
  unverified: { label: 'Chưa kiểm được', variant: 'warning', tintClass: 'bg-warning-subtle' },
};

/** Thứ tự tệ dần — dùng để tô một dòng lỗi khi nhiều góc kiểm kết luận khác nhau (Review Focus #5). */
const VERDICT_SEVERITY: Record<'confirmed' | 'refuted' | 'unverified', number> = {
  confirmed: 0,
  unverified: 1,
  refuted: 2,
};
export function worstVerdict(statuses: Array<'confirmed' | 'refuted' | 'unverified'>) {
  return statuses.reduce((worst, s) => (VERDICT_SEVERITY[s] > VERDICT_SEVERITY[worst] ? s : worst), statuses[0]);
}

const LENS_LABEL: Record<string, string> = {
  tinh_dung: 'Tính đúng',
  qua_tay: 'Quá tay',
  bo_sot: 'Bỏ sót',
  gian_lan: 'Gian lận',
};
export function lensLabel(key: string): string {
  return LENS_LABEL[key] ?? key;
}

/** Tên VIỆC hiện đầu mỗi dòng đường điều tra — không phải tên công cụ (spec §2.2, sửa vi phạm #3). */
const TOOL_ACTION_LABEL: Record<string, string> = {
  run_tests: 'Chạy gói test',
  run_scaled: 'Đo độ phức tạp',
  probe: 'Dò biên',
  ast_query: 'Đọc cấu trúc mã',
  read_file: 'Đọc file',
  run: 'Chạy chương trình',
  list_files: 'Liệt kê file',
};
export function toolActionLabel(tool: string): string {
  return TOOL_ACTION_LABEL[tool] ?? tool;
}

const CASE_FLAG_LABEL: Record<string, string> = {
  criterion_without_rules: 'Tiêu chí chưa có luật nào',
  criterion_untouched: 'Tiêu chí chưa được kiểm tới',
  nothing_passed: 'Không ca test nào đạt — hệ thống không tự cho điểm',
  low_confidence: 'Độ tin dưới ngưỡng tự quyết',
  not_code_pipeline: 'Bài tự luận — luôn do bạn duyệt',
  challenge_suspected: 'Góc kiểm gian lận nêu nghi vấn',
};

const INVESTIGATION_FLAG_LABEL: Record<string, string> = {
  injection_suspected: 'Bài nộp có câu lệnh nhắm vào AI chấm',
  replay_mismatch: 'Chạy lại để đối chiếu ra kết quả khác',
  replay_unverified: 'Chưa chạy lại để đối chiếu được',
  evidence_rejected: 'Bằng chứng không khớp lời gọi thật',
  budget_exhausted: 'Hết lượt điều tra trước khi xong',
};

/**
 * Nhãn CHÍNH của một cờ cấp bài. `detail` luôn hiện thêm ở dòng phụ dạng
 * mono — bao gồm cả khi nó chỉ lặp lại mã (`investigation_flag`), vì đó là
 * đúng thứ tự spec §2.2 mô tả. Không cờ nào bị bỏ im lặng: mã lạ vẫn ra
 * một dòng có tên, không phải một khối rỗng.
 */
export function caseFlagLabel(code: string, detail: string): string {
  if (code === 'investigation_flag') {
    return INVESTIGATION_FLAG_LABEL[detail] ?? `Điều kiện chưa có tên hiển thị (${detail})`;
  }
  return CASE_FLAG_LABEL[code] ?? `Điều kiện chưa có tên hiển thị (${code})`;
}
```

```bash
pnpm exec vitest run src/lib/grading-vocab.test.ts
```

- [ ] **Step 8: Extend the `ResultDetail` breakdown type and add the two new API functions**

Read `apps/web/src/lib/api/grading.ts:429-501` first (already quoted in full in this plan's research — the `ResultDetailError`, `ChallengeNote`, `ChallengeVerdict`, `ToolCallView`, `ResultDetail` interfaces). Apply this diff:

```ts
// apps/web/src/lib/api/grading.ts — inside the `breakdown` object type of ResultDetail, ADD two fields
//   caseFlags: { code: string; detail: string }[];
//   ungradable: { class: 'system' | 'submission'; reason: string } | null;
// (both exist server-side per grading/scoring/score-core.ts's ScoreBreakdown; the web mirror had omitted
// them because no screen needed caseFlags or the "dưới sàn" case before this plan)

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
    caseFlags: { code: string; detail: string }[];
    errorFlags: { ruleKey: string; code: string }[];
    confidence: number | null;
    mismatchedRules: { ruleId: string; ruleKey: string; criterionKey: string }[];
    notConsidered: { ruleId: string; ruleKey: string }[];
    ungradable: { class: 'system' | 'submission'; reason: string } | null;
  } | null;
  investigation: {
    kind: 'verdict' | 'ungradable';
    summary: string;
    flags: string[];
    verdict: { errors: { ruleKey: string; toolCallIds: string[]; note: string | null }[] } | null;
    replay: { toolCallId: string; matched: boolean | null } | null;
    investigation: { toolCalls: ToolCallView[] };
  } | null;
  challengeNotes: ChallengeNote[];
  challengeVerdicts: ChallengeVerdict[];
}

export type ExceptionDirection = 'exclude' | 'include';

/** Bỏ hoặc giữ một lỗi cho riêng bài này (§2.2 spec chấm; POST /grading-results/:id/error-exceptions). */
export async function setErrorException(
  gradingResultId: string,
  ruleId: string,
  direction: ExceptionDirection,
): Promise<{ scoreHundredths: number | null; status: string }> {
  const { data, error, response } = await apiClient.POST('/grading-results/{id}/error-exceptions', {
    params: { path: { id: gradingResultId } },
    body: { ruleId, direction } as never,
  });
  if (error || !response.ok) throw fail(error, response);
  return data as unknown as { scoreHundredths: number | null; status: string };
}

/**
 * Chấm tay bài này — điểm không đổi theo luật hay giá nữa (§2.2 spec chấm;
 * POST /grading-results/:id/manual-score). `score` PHẢI là chuỗi thập phân
 * ("7", "7.5", "7.25"), không phải số — server 400 nếu gửi number.
 */
export async function setManualScore(
  gradingResultId: string,
  score: string,
): Promise<{ score: string; status: string }> {
  const { data, error, response } = await apiClient.POST('/grading-results/{id}/manual-score', {
    params: { path: { id: gradingResultId } },
    body: { score } as never,
  });
  if (error || !response.ok) throw fail(error, response);
  return data as unknown as { score: string; status: string };
}
```

- [ ] **Step 9: Write the failing hook tests**

```ts
// apps/web/src/hooks/useGrading.test.ts — ADD these cases to the existing file (append; do not remove existing tests)
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api/grading', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/grading')>();
  return { ...actual, setErrorException: vi.fn(), setManualScore: vi.fn() };
});

describe('investigationQueryKey', () => {
  it('is stable for the same resultId', async () => {
    const { investigationQueryKey } = await import('./useGrading');
    expect(investigationQueryKey('r1')).toEqual(['grading-results', 'r1', 'investigation']);
  });
});
```

(The mutation hooks themselves — `useSetErrorException`, `useSetManualScore` — are exercised through the components that call them in Task 5/Task 3's tests via a mocked `@/hooks/useGrading` module, matching this repo's existing test pattern; a hook-level test here only needs to pin the query-key shape, the same treatment `readinessQueryKey` already gets.)

```bash
pnpm exec vitest run src/hooks/useGrading.test.ts
```

Expected: FAIL — `investigationQueryKey` is not exported yet.

- [ ] **Step 10: Add the hooks**

```ts
// apps/web/src/hooks/useGrading.ts — ADD (keep every existing export)
import { setErrorException, setManualScore, type ExceptionDirection } from '@/lib/api/grading';

/** Khoá cache của một hồ sơ điều tra — export để invalidate đúng chỗ và để test ghim. */
export function investigationQueryKey(gradingResultId: string | undefined) {
  return ['grading-results', gradingResultId, 'investigation'] as const;
}

/**
 * Bỏ/giữ một lỗi cho riêng bài này. Làm mới cả hồ sơ (điểm, trạng thái vừa
 * đổi) lẫn danh sách bài của phiên (trạng thái/điểm hiện ở đó cũng đổi).
 */
export function useSetErrorException(examSessionId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ resultId, ruleId, direction }: { resultId: string; ruleId: string; direction: ExceptionDirection }) =>
      setErrorException(resultId, ruleId, direction),
    onSuccess: (_data, { resultId }) => {
      void queryClient.invalidateQueries({ queryKey: investigationQueryKey(resultId) });
      void queryClient.invalidateQueries({ queryKey: ['exam-sessions', examSessionId, 'grading-results'] });
    },
  });
}

/** Chấm tay bài này — từ đây điểm không đổi theo luật/giá nữa. */
export function useSetManualScore(examSessionId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ resultId, score }: { resultId: string; score: string }) => setManualScore(resultId, score),
    onSuccess: (_data, { resultId }) => {
      void queryClient.invalidateQueries({ queryKey: investigationQueryKey(resultId) });
      void queryClient.invalidateQueries({ queryKey: ['exam-sessions', examSessionId, 'grading-results'] });
    },
  });
}
```

Also replace the existing `useResultInvestigation` body's inline key literal with a call to `investigationQueryKey` (same value, now named):

```ts
export function useResultInvestigation(gradingResultId: string | undefined) {
  return useQuery({
    queryKey: investigationQueryKey(gradingResultId),
    queryFn: () => getResultInvestigation(gradingResultId!),
    enabled: Boolean(gradingResultId),
  });
}
```

- [ ] **Step 11: Run to confirm everything in this task passes, then typecheck**

```bash
pnpm exec vitest run src/hooks/useGrading.test.ts src/lib/format.test.ts src/lib/grading-vocab.test.ts
pnpm --filter web exec tsc --noEmit
```

- [ ] **Step 12: Commit**

```bash
git add apps/web/src/lib/api/grading.ts apps/web/src/hooks/useGrading.ts apps/web/src/hooks/useGrading.test.ts apps/web/src/lib/format.ts apps/web/src/lib/format.test.ts apps/web/src/lib/grading-vocab.ts apps/web/src/lib/grading-vocab.test.ts
git commit -m "feat(grading): add error-exception/manual-score API layer, format and vocab helpers"
```

---

## Task 3: Header, status pill, "Mở bài nộp" and "Chấm tay bài này" dialogs

**Files:**
- Create: `apps/web/src/app/teacher/grading/[resultId]/_components/investigator/StatusPill.tsx`
- Test: `.../investigator/StatusPill.test.tsx`
- Create: `.../investigator/DossierHeader.tsx`
- Test: `.../investigator/DossierHeader.test.tsx`
- Create: `.../investigator/SubmissionDialog.tsx`
- Test: `.../investigator/SubmissionDialog.test.tsx`
- Create: `.../investigator/ManualScoreDialog.tsx`
- Test: `.../investigator/ManualScoreDialog.test.tsx`

**Interfaces:**
- Consumes: `GradingResultView` (mssv/name/status/pipeline, from Task 2's untouched `lib/api/grading.ts`), `ResultDetail` (from `useResultInvestigation`), `useSubmissionText`, `useSetManualScore`.
- Produces: `<StatusPill status={string} ungradableClass={string|null} />`, `<DossierHeader result mssv name sessionName roomName resultId sessionId maxTotal currentScore />`, `<SubmissionDialog resultId open onOpenChange />`, `<ManualScoreDialog resultId sessionId currentScore maxTotal open onOpenChange />` — all consumed by `InvestigatorDossier` in Task 8.

- [ ] **Step 1: Write the failing test for `StatusPill`**

```tsx
// .../investigator/StatusPill.test.tsx
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { describe, expect, it } from 'vitest';
import { StatusPill } from './StatusPill';

describe('StatusPill', () => {
  it('shows "Cần bạn xem" for flagged_for_review without an ungradable reason', () => {
    render(<StatusPill status="flagged_for_review" ungradableReason={null} />);
    expect(screen.getByText(/Cần bạn xem/i)).toBeInTheDocument();
  });
  it('shows "Không chấm được" when flagged AND ungradableReason is set, not "Cần bạn xem"', () => {
    render(<StatusPill status="flagged_for_review" ungradableReason="Sandbox không phản hồi." />);
    expect(screen.getByText('Không chấm được')).toBeInTheDocument();
    expect(screen.queryByText(/Cần bạn xem/i)).not.toBeInTheDocument();
  });
  it('shows "Tự quyết" for auto_approved', () => {
    render(<StatusPill status="auto_approved" ungradableReason={null} />);
    expect(screen.getByText('Tự quyết')).toBeInTheDocument();
  });
  it('shows "Kiểm mẫu" for audit_pending (Review Focus #3 — reachable even though nothing produces it yet)', () => {
    render(<StatusPill status="audit_pending" ungradableReason={null} />);
    expect(screen.getByText('Kiểm mẫu')).toBeInTheDocument();
  });
  it('never crashes on an unmapped status — names it instead of throwing', () => {
    render(<StatusPill status="some_future_status" ungradableReason={null} />);
    expect(screen.getByText('some_future_status')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to confirm it fails**

```bash
pnpm exec vitest run "src/app/teacher/grading/\[resultId\]/_components/investigator/StatusPill.test.tsx"
```

- [ ] **Step 3: Implement `StatusPill`**

```tsx
// .../investigator/StatusPill.tsx
import { CheckCircle2, CircleMinus, RefreshCw, Repeat, TriangleAlert } from 'lucide-react';
import { Badge, type BadgeProps } from '@/components/ui/badge';

/**
 * Bốn nhóm hiển thị (spec §4.4 — suy từ trạng thái, không có trường nào nói
 * thẳng): "Cần bạn xem" và "Không chấm được" đều là `flagged_for_review`,
 * phân biệt DUY NHẤT bằng `ungradableReason !== null`.
 */
export function StatusPill({
  status,
  ungradableReason,
}: {
  status: string;
  ungradableReason: string | null;
}) {
  if (status === 'flagged_for_review' && ungradableReason !== null) {
    return (
      <Badge variant="default" className="gap-1.5">
        <CircleMinus className="h-3 w-3" aria-hidden="true" />
        Không chấm được
      </Badge>
    );
  }
  const byStatus: Record<string, { label: string; variant: BadgeProps['variant']; icon: typeof CheckCircle2 }> = {
    flagged_for_review: { label: 'Cần bạn xem', variant: 'warning', icon: TriangleAlert },
    auto_approved: { label: 'Tự quyết', variant: 'success', icon: CheckCircle2 },
    audit_pending: { label: 'Kiểm mẫu', variant: 'primary', icon: Repeat },
    ai_grading: { label: 'Đang chấm', variant: 'default', icon: RefreshCw },
    ai_graded: { label: 'Đang chấm', variant: 'default', icon: RefreshCw },
    teacher_reviewed: { label: 'Đã duyệt', variant: 'accent', icon: CheckCircle2 },
    finalized: { label: 'Đã chốt', variant: 'primary', icon: CheckCircle2 },
    exported: { label: 'Đã chốt', variant: 'primary', icon: CheckCircle2 },
  };
  const entry = byStatus[status] ?? { label: status, variant: 'default' as const, icon: TriangleAlert };
  const Icon = entry.icon;
  return (
    <Badge variant={entry.variant} className="gap-1.5">
      <Icon className="h-3 w-3" aria-hidden="true" />
      {entry.label}
    </Badge>
  );
}
```

- [ ] **Step 4: Run to confirm it passes**

- [ ] **Step 5: Write the failing test for `SubmissionDialog`**

```tsx
// .../investigator/SubmissionDialog.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi } from 'vitest';
import { SubmissionDialog } from './SubmissionDialog';

let useSubmissionTextMock = () => ({ data: undefined as unknown, isLoading: true });
vi.mock('@/hooks/useGrading', () => ({ useSubmissionText: () => useSubmissionTextMock() }));

describe('SubmissionDialog', () => {
  it('renders the submission text read-only when open', () => {
    useSubmissionTextMock = () => ({
      data: { paragraphs: ['Đoạn một.', 'Đoạn hai.'], spans: [], unlocatable: [], truncatedByGrading: false },
      isLoading: false,
    });
    render(<SubmissionDialog resultId="r1" open onOpenChange={vi.fn()} />);
    expect(screen.getByText('Đoạn một.')).toBeInTheDocument();
  });
  it('closes when the close control fires', () => {
    useSubmissionTextMock = () => ({
      data: { paragraphs: ['x'], spans: [], unlocatable: [], truncatedByGrading: false },
      isLoading: false,
    });
    const onOpenChange = vi.fn();
    render(<SubmissionDialog resultId="r1" open onOpenChange={onOpenChange} />);
    fireEvent.click(screen.getByRole('button', { name: /Đóng/i }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
```

- [ ] **Step 6: Run to confirm it fails, Step 7: implement**

```tsx
// .../investigator/SubmissionDialog.tsx
'use client';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useSubmissionText } from '@/hooks/useGrading';
import { AnswerPane } from '../AnswerPane';

/**
 * "Mở bài nộp" — dùng lại `AnswerPane` ở chế độ chỉ xem: không tiêu chí
 * nào đang chọn nên không có gì để tô màu, nhưng cùng một khối hiển thị
 * bài làm mà hồ sơ theo tiêu chí đã dùng (spec §4: rà AnswerPane trước
 * khi xoá — đây là chỗ dùng lại).
 */
export function SubmissionDialog({
  resultId,
  open,
  onOpenChange,
}: {
  resultId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const text = useSubmissionText(open ? resultId : undefined);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Bài nộp</DialogTitle>
        </DialogHeader>
        {text.isLoading || !text.data ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          <AnswerPane
            text={text.data}
            criterionIndexOf={() => -1}
            activeCriterionId={null}
            onSelectCriterion={() => undefined}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 8: Write the failing test for `ManualScoreDialog`**

```tsx
// .../investigator/ManualScoreDialog.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi } from 'vitest';
import { ManualScoreDialog } from './ManualScoreDialog';

const mutate = vi.fn();
vi.mock('@/hooks/useGrading', () => ({ useSetManualScore: () => ({ mutate, isPending: false, isError: false, error: null }) }));

describe('ManualScoreDialog', () => {
  it('prefills the input with the current score (T-UI-25)', () => {
    render(<ManualScoreDialog resultId="r1" sessionId="s1" currentScore={7.5} maxTotal={10} open onOpenChange={vi.fn()} />);
    expect(screen.getByLabelText(/Điểm/i)).toHaveValue('7.5');
  });
  it('submits a decimal STRING, not a number, and includes the resultId', () => {
    render(<ManualScoreDialog resultId="r1" sessionId="s1" currentScore={7.5} maxTotal={10} open onOpenChange={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/Điểm/i), { target: { value: '8' } });
    fireEvent.click(screen.getByRole('button', { name: 'Chấm tay' }));
    expect(mutate).toHaveBeenCalledWith({ resultId: 'r1', score: '8' }, expect.anything());
  });
  it('rejects a value above the rubric ceiling before sending anything', () => {
    render(<ManualScoreDialog resultId="r1" sessionId="s1" currentScore={7.5} maxTotal={10} open onOpenChange={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/Điểm/i), { target: { value: '15' } });
    fireEvent.click(screen.getByRole('button', { name: 'Chấm tay' }));
    expect(mutate).not.toHaveBeenCalled();
    expect(screen.getByText(/vượt trần/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 9: Run to confirm it fails, Step 10: implement**

```tsx
// .../investigator/ManualScoreDialog.tsx
'use client';

import { useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { useSetManualScore } from '@/hooks/useGrading';

/**
 * Chấm tay bài này (§2.2 ngoại lệ cấp bài) — điền sẵn điểm hệ thống
 * (T-UI-25), gửi CHUỖI thập phân (server 400 nếu gửi số). Sau khi lưu,
 * điểm này KHÔNG đổi theo luật hay giá nữa — câu này hiện luôn, không chỉ
 * lúc lỗi, vì đây là hệ quả người bấm nút cần biết TRƯỚC khi bấm.
 */
export function ManualScoreDialog({
  resultId,
  sessionId,
  currentScore,
  maxTotal,
  open,
  onOpenChange,
}: {
  resultId: string;
  sessionId: string;
  currentScore: number | null;
  maxTotal: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [score, setScore] = useState(currentScore !== null ? String(currentScore) : '');
  const [clientError, setClientError] = useState<string | null>(null);
  const setManualScore = useSetManualScore(sessionId);

  function submit() {
    setClientError(null);
    const parsed = Number(score.replace(',', '.'));
    if (!/^\d{1,4}(\.\d{1,2})?$/.test(score.trim())) {
      setClientError('Điểm: chuỗi thập phân tối đa hai chữ số lẻ, không âm.');
      return;
    }
    if (parsed > maxTotal) {
      setClientError(`Điểm vượt trần của rubric (${maxTotal.toFixed(2)}).`);
      return;
    }
    setManualScore.mutate({ resultId, score: score.trim() }, { onSuccess: () => onOpenChange(false) });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Chấm tay bài này</DialogTitle>
        </DialogHeader>
        <p className="text-caption text-muted-foreground">
          Từ lúc lưu, điểm bài này không đổi theo luật hay giá nữa — kể cả khi bạn sửa Bảng lỗi sau đó.
        </p>
        <FormField id="manual-score" label="Điểm">
          <Input id="manual-score" value={score} onChange={(e) => setScore(e.target.value)} placeholder="Ví dụ: 7.5" />
        </FormField>
        {clientError && (
          <Alert variant="destructive">
            <AlertDescription>{clientError}</AlertDescription>
          </Alert>
        )}
        {setManualScore.isError && (
          <Alert variant="destructive">
            <AlertDescription>{setManualScore.error.message}</AlertDescription>
          </Alert>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Huỷ
          </Button>
          <Button loading={setManualScore.isPending} onClick={submit}>
            Chấm tay
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 11: Write the failing test for `DossierHeader`**

```tsx
// .../investigator/DossierHeader.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi } from 'vitest';
import { DossierHeader } from './DossierHeader';

vi.mock('@/hooks/useGrading', () => ({
  useSubmissionText: () => ({ data: undefined, isLoading: true }),
}));

const baseProps = {
  resultId: 'r1',
  sessionId: 's1',
  sessionName: 'Giữa kỳ N01',
  roomName: 'B2.07',
  mssv: 'SV20120088',
  studentName: 'Nguyễn Văn A',
  status: 'flagged_for_review',
  ungradableReason: null as string | null,
  onOpenManualScore: () => {},
};

describe('DossierHeader', () => {
  it('shows MSSV, name, session and room', () => {
    render(<DossierHeader {...baseProps} />);
    expect(screen.getByText(/SV20120088/)).toBeInTheDocument();
    expect(screen.getByText(/Nguyễn Văn A/)).toBeInTheDocument();
    expect(screen.getByText(/Giữa kỳ N01/)).toBeInTheDocument();
    expect(screen.getByText(/B2\.07/)).toBeInTheDocument();
  });

  it('opens the submission dialog from "Mở bài nộp"', () => {
    render(<DossierHeader {...baseProps} onOpenManualScore={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Mở bài nộp' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('keeps "Chấm tay bài này" enabled on a finalized result (Review Focus #2) and calls the handler, not a local dialog', () => {
    const onOpenManualScore = vi.fn();
    render(<DossierHeader {...baseProps} status="finalized" onOpenManualScore={onOpenManualScore} />);
    const btn = screen.getByRole('button', { name: 'Chấm tay bài này' });
    expect(btn).toBeEnabled();
    fireEvent.click(btn);
    expect(onOpenManualScore).toHaveBeenCalled();
  });
});
```

`DossierHeader` does NOT own a `ManualScoreDialog` — the dialog is mounted exactly once, by `InvestigatorDossier` (Task 8), which is also the only place that needs `currentScore`/`maxTotal` for it. `DossierHeader` only opens the submission dialog locally and calls `onOpenManualScore()` for the other one; this keeps the mock list above (`useSetManualScore` is mocked but never asserted here) honest about what this component actually renders.

- [ ] **Step 12: Run to confirm it fails, Step 13: implement**

```tsx
// .../investigator/DossierHeader.tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StatusPill } from './StatusPill';
import { SubmissionDialog } from './SubmissionDialog';

export function DossierHeader({
  resultId,
  sessionId,
  sessionName,
  roomName,
  mssv,
  studentName,
  status,
  ungradableReason,
  onOpenManualScore,
}: {
  resultId: string;
  sessionId: string;
  sessionName: string;
  roomName: string | null;
  mssv: string;
  studentName: string;
  status: string;
  ungradableReason: string | null;
  /** Bấm "Chấm tay bài này" — hộp thoại thật do `InvestigatorDossier` giữ, để cả trang chỉ có MỘT hộp. */
  onOpenManualScore: () => void;
}) {
  const [openSubmission, setOpenSubmission] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      <nav aria-label="Vị trí" className="flex items-center gap-1.5 text-caption text-muted-foreground">
        <Link href={`/teacher/grading?sessionId=${sessionId}`} className="flex items-center gap-1 hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          Chấm điểm
        </Link>
        <span aria-hidden="true">›</span>
        <span>{sessionName}</span>
        <span aria-hidden="true">›</span>
        <span className="text-foreground">{mssv}</span>
      </nav>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <h1 className="text-h1">
              {mssv} · {studentName}
            </h1>
            <StatusPill status={status} ungradableReason={ungradableReason} />
          </div>
          <p className="text-caption text-muted-foreground">
            {sessionName}
            {roomName && ` · Phòng ${roomName}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => setOpenSubmission(true)}>
            Mở bài nộp
          </Button>
          <Button variant="outline" onClick={onOpenManualScore}>
            Chấm tay bài này
          </Button>
        </div>
      </div>
      <SubmissionDialog resultId={resultId} open={openSubmission} onOpenChange={setOpenSubmission} />
    </div>
  );
}
```

`sessionId` stays a prop (used by the breadcrumb link) even though this component no longer passes it to a dialog.

- [ ] **Step 14: Run every test in this task, typecheck, commit**

```bash
pnpm exec vitest run "src/app/teacher/grading/\[resultId\]/_components/investigator"
pnpm --filter web exec tsc --noEmit
git add "apps/web/src/app/teacher/grading/[resultId]/_components/investigator"
git commit -m "feat(grading): investigator dossier header, status pill, submission and manual-score dialogs"
```

---

## Task 4: Score card (normal / dưới sàn) and case-flags banner

**Files:**
- Create: `.../investigator/ScoreCard.tsx`
- Test: `.../investigator/ScoreCard.test.tsx`
- Create: `.../investigator/CaseFlagsBanner.tsx`
- Test: `.../investigator/CaseFlagsBanner.test.tsx`

**Interfaces:**
- Consumes: `ResultDetail.breakdown` (Task 2's extended type), `formatVnPoints` (Task 2), `caseFlagLabel` (Task 2).
- Produces: `<ScoreCard breakdown currentScore currentScoreSource onManualScore />`, `<CaseFlagsBanner caseFlags errorFlags onGoToRules onManualScore />` — both consumed by `InvestigatorDossier` (Task 8).

- [ ] **Step 1: Write the failing test for `ScoreCard`**

```tsx
// .../investigator/ScoreCard.test.tsx
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { describe, expect, it } from 'vitest';
import { ScoreCard } from './ScoreCard';

const perCriterion = [
  { key: 'tinh_dung', maxHundredths: 400, deductedHundredths: 150, capped: false },
  { key: 'hieu_nang', maxHundredths: 100, deductedHundredths: 100, capped: true },
];

describe('ScoreCard', () => {
  it('shows the score and a formula that sums the per-criterion deductions', () => {
    render(
      <ScoreCard
        currentScore={2.5}
        currentScoreSource="computation"
        breakdown={{ perCriterion, ungradable: null } as never}
      />,
    );
    expect(screen.getByText('2,5')).toBeInTheDocument();
    expect(screen.getByText(/tinh_dung/)).toBeInTheDocument();
    expect(screen.getByText(/chạm trần/)).toBeInTheDocument();
  });

  it('shows "—", never 0, when currentScore is null and there is no floor reason (still grading)', () => {
    render(<ScoreCard currentScore={null} currentScoreSource="none" breakdown={null} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('distinguishes "dưới sàn" from "không chấm được" (Review Focus #6): shows the floor reason, not a sandbox message', () => {
    render(
      <ScoreCard
        currentScore={null}
        currentScoreSource="none"
        breakdown={{ perCriterion: [], ungradable: { class: 'submission', reason: 'Tiêu chí "hieu_nang" chưa có luật nào — không tự quyết được.' } } as never}
      />,
    );
    expect(screen.getByText(/hieu_nang.*chưa có luật nào/)).toBeInTheDocument();
    expect(screen.queryByText(/môi trường chạy bài/i)).not.toBeInTheDocument();
  });

  it('shows a plain note, not a formula, when the score was set by hand', () => {
    render(<ScoreCard currentScore={9} currentScoreSource="manual" breakdown={{ perCriterion, ungradable: null } as never} />);
    expect(screen.getByText(/chấm tay/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to confirm it fails, Step 3: implement**

```tsx
// .../investigator/ScoreCard.tsx
import { formatVnPoints } from '@/lib/format';
import type { ResultDetail } from '@/lib/api/grading';

type Breakdown = NonNullable<ResultDetail['breakdown']>;

export function ScoreCard({
  currentScore,
  currentScoreSource,
  breakdown,
}: {
  currentScore: number | null;
  currentScoreSource: string;
  breakdown: Breakdown | null;
}) {
  // "Dưới sàn" (§4.4): điều tra CHẠY XONG, nhưng chấm điểm từ chối công bố
  // một con số — khác hẳn "không chấm được" (điều tra không chạy được gì).
  // Nói nhầm cái này thành cái kia là nói với giảng viên rằng sandbox chết
  // trong khi nó chạy bình thường.
  if (breakdown?.ungradable) {
    return (
      <section className="flex flex-col gap-2 rounded-lg border border-warning bg-warning/5 p-4">
        <span className="text-caption font-semibold text-muted-foreground">Điểm</span>
        <span className="text-3xl font-semibold tabular-nums text-muted-foreground">—</span>
        <p className="text-small text-warning-strong">{breakdown.ungradable.reason}</p>
        <p className="text-caption text-muted-foreground">
          Cuộc điều tra đã chạy xong — đây không phải lỗi môi trường chạy bài. Hệ thống chỉ từ chối tự chấm; chấm tay
          để bài này có điểm.
        </p>
      </section>
    );
  }

  if (currentScoreSource === 'manual') {
    return (
      <section className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4">
        <span className="text-caption font-semibold text-muted-foreground">Điểm — do bạn chấm tay</span>
        <span className="text-3xl font-semibold tabular-nums">{formatVnPoints(currentScore)}</span>
        <p className="text-caption text-muted-foreground">
          Điểm này không theo công thức luật/giá — bạn đã chấm tay bài này.
        </p>
      </section>
    );
  }

  const total = breakdown?.perCriterion.reduce((sum, c) => sum + c.maxHundredths, 0) ?? 0;
  const terms = (breakdown?.perCriterion ?? []).filter((c) => c.deductedHundredths > 0);

  return (
    <section className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4">
      <span className="text-caption font-semibold text-muted-foreground">
        {currentScoreSource === 'finalized' ? 'Điểm — đã xuất vào bảng điểm' : 'Điểm tạm tính'}
      </span>
      <span className="text-3xl font-semibold tabular-nums">{formatVnPoints(currentScore)}</span>
      {breakdown && (
        <p className="font-mono text-small text-muted-foreground">
          {formatVnPoints(total / 100)}
          {terms.map((c) => ` − ${formatVnPoints(c.deductedHundredths / 100)}`).join('')} = {formatVnPoints(currentScore)}
        </p>
      )}
      {terms.map((c) => (
        <p key={c.key} className="text-caption text-muted-foreground">
          {c.key}: −{formatVnPoints(c.deductedHundredths / 100)}
          {c.capped && ' (chạm trần)'}
        </p>
      ))}
      <p className="text-caption text-muted-foreground">Mức trừ lấy từ Bảng lỗi — mô hình không đặt con số nào.</p>
    </section>
  );
}
```

- [ ] **Step 4: Run to confirm it passes**

- [ ] **Step 5: Write the failing test for `CaseFlagsBanner`**

```tsx
// .../investigator/CaseFlagsBanner.test.tsx
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi } from 'vitest';
import { CaseFlagsBanner } from './CaseFlagsBanner';

describe('CaseFlagsBanner', () => {
  it('renders one line per case flag, code as primary and detail as a secondary mono line (T-UI-23)', () => {
    render(
      <CaseFlagsBanner
        caseFlags={[{ code: 'criterion_without_rules', detail: 'tiêu chí "hieu_nang" không có luật nào trỏ vào' }]}
        errorFlags={[]}
        onManualScore={vi.fn()}
      />,
    );
    expect(screen.getByText('Tiêu chí chưa có luật nào')).toBeInTheDocument();
    expect(screen.getByText('tiêu chí "hieu_nang" không có luật nào trỏ vào')).toHaveClass('font-mono');
  });

  it('never hides an unmapped code — still shows a line with the raw code (T-UI-23)', () => {
    render(<CaseFlagsBanner caseFlags={[{ code: 'brand_new_flag', detail: 'chi tiết lạ' }]} errorFlags={[]} onManualScore={vi.fn()} />);
    expect(screen.getByText(/brand_new_flag/)).toBeInTheDocument();
  });

  it('offers "Đặt giá" linking to Bảng lỗi for an unpriced error flag', () => {
    render(<CaseFlagsBanner caseFlags={[]} errorFlags={[{ ruleKey: 'ten_bien', code: 'unpriced' }]} onManualScore={vi.fn()} />);
    expect(screen.getByRole('link', { name: /Đặt giá/i })).toHaveAttribute('href', '/teacher/rules');
  });

  it('offers "Chấm tay bài này" for a flag with no rule-level fix, and calls the handler', () => {
    const onManualScore = vi.fn();
    render(
      <CaseFlagsBanner
        caseFlags={[{ code: 'low_confidence', detail: 'confidence 0.72 < θ 0.85' }]}
        errorFlags={[]}
        onManualScore={onManualScore}
      />,
    );
    screen.getByRole('button', { name: 'Chấm tay bài này' }).click();
    expect(onManualScore).toHaveBeenCalled();
  });

  it('renders nothing when there is nothing to show', () => {
    const { container } = render(<CaseFlagsBanner caseFlags={[]} errorFlags={[]} onManualScore={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 6: Run to confirm it fails, Step 7: implement**

```tsx
// .../investigator/CaseFlagsBanner.tsx
'use client';

import Link from 'next/link';
import { TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { caseFlagLabel } from '@/lib/grading-vocab';

/** Mã cờ có lối gỡ Ở TẦNG LUẬT (đưa sang Bảng lỗi) thay vì cần chấm tay. */
const RULE_FIXABLE = new Set(['criterion_without_rules']);

export function CaseFlagsBanner({
  caseFlags,
  errorFlags,
  onManualScore,
}: {
  caseFlags: { code: string; detail: string }[];
  errorFlags: { ruleKey: string; code: string }[];
  onManualScore: () => void;
}) {
  const unpriced = errorFlags.filter((f) => f.code === 'unpriced');
  if (caseFlags.length === 0 && unpriced.length === 0) return null;

  return (
    <section role="status" className="flex flex-col gap-2.5 rounded-lg border border-warning bg-warning/5 p-4">
      <h2 className="flex items-center gap-2 text-small font-semibold text-warning-strong">
        <TriangleAlert className="h-4 w-4" aria-hidden="true" />
        Cần bạn xem
      </h2>
      <ul className="flex flex-col gap-2">
        {unpriced.map((f) => (
          <li key={f.ruleKey} className="flex flex-wrap items-center justify-between gap-2 text-small">
            <span>
              Luật <span className="font-mono">{f.ruleKey}</span> chưa có giá
            </span>
            <Link href="/teacher/rules">
              <Button size="sm" variant="outline">
                Đặt giá
              </Button>
            </Link>
          </li>
        ))}
        {caseFlags.map((flag, i) => (
          <li key={i} className="flex flex-col gap-0.5 text-small">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>{caseFlagLabel(flag.code, flag.detail)}</span>
              {RULE_FIXABLE.has(flag.code) ? (
                <Link href="/teacher/rules">
                  <Button size="sm" variant="outline">
                    Tạo luật cho tiêu chí này
                  </Button>
                </Link>
              ) : (
                <Button size="sm" variant="outline" onClick={onManualScore}>
                  Chấm tay bài này
                </Button>
              )}
            </div>
            <span className="font-mono text-caption text-muted-foreground">{flag.detail}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
```

- [ ] **Step 8: Run every test in this task, typecheck, commit**

```bash
pnpm exec vitest run "src/app/teacher/grading/\[resultId\]/_components/investigator/ScoreCard.test.tsx" "src/app/teacher/grading/\[resultId\]/_components/investigator/CaseFlagsBanner.test.tsx"
pnpm --filter web exec tsc --noEmit
git add "apps/web/src/app/teacher/grading/[resultId]/_components/investigator/ScoreCard.tsx" "apps/web/src/app/teacher/grading/[resultId]/_components/investigator/ScoreCard.test.tsx" "apps/web/src/app/teacher/grading/[resultId]/_components/investigator/CaseFlagsBanner.tsx" "apps/web/src/app/teacher/grading/[resultId]/_components/investigator/CaseFlagsBanner.test.tsx"
git commit -m "feat(grading): score card (normal/duoi-san) and case-flags banner for the investigator dossier"
```

---

## Task 5: Error list — source pills, exclude/include actions, phản biện tint boxes

**Files:**
- Create: `.../investigator/ErrorList.tsx`
- Test: `.../investigator/ErrorList.test.tsx`

**Interfaces:**
- Consumes: `ResultDetailError[]`, `ChallengeVerdict[]`, `errorFlags`, `SOURCE_LABEL`/`VERDICT_LABEL`/`worstVerdict`/`lensLabel` (Task 2), `useSetErrorException` (Task 2).
- Produces: `<ErrorList resultId sessionId status errors errorFlags verdicts investigationNotes />` — consumed by `InvestigatorDossier` (Task 8). `investigationNotes` = `ResultDetail.investigation?.verdict?.errors ?? []` (the `{ruleKey, toolCallIds, note}[]` used as the "evidence" line).

- [ ] **Step 1: Write the failing tests**

```tsx
// .../investigator/ErrorList.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi } from 'vitest';
import { ErrorList } from './ErrorList';

const mutate = vi.fn();
let mockState = { isPending: false, isError: false, error: null as Error | null };
vi.mock('@/hooks/useGrading', () => ({ useSetErrorException: () => ({ mutate, ...mockState }) }));

const baseError = {
  ruleId: 'rule-1', ruleKey: 'sai_bien', ruleName: 'Sai biên', criterionKey: 'tinh_dung',
  source: 'deterministic' as const, toolCallIds: ['tc-1'], deductionHundredths: 150, counted: 'counted' as const,
};

describe('ErrorList', () => {
  it('uses the spec §2.2 wording, not "Model + công cụ"', () => {
    render(
      <ErrorList
        resultId="r1" sessionId="s1" status="flagged_for_review"
        errors={[{ ...baseError, source: 'llm_with_tools' }]}
        errorFlags={[]} verdicts={[]} investigationNotes={[]}
      />,
    );
    expect(screen.getByText('Mô hình + công cụ')).toBeInTheDocument();
    expect(screen.queryByText(/Model \+ công cụ/)).not.toBeInTheDocument();
  });

  it('excludes an error and sends the resultId + ruleId + direction (Bỏ lỗi này cho riêng bài này)', () => {
    render(
      <ErrorList resultId="r1" sessionId="s1" status="flagged_for_review" errors={[baseError]} errorFlags={[]} verdicts={[]} investigationNotes={[]} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Bỏ lỗi này cho riêng bài này' }));
    expect(mutate).toHaveBeenCalledWith({ resultId: 'r1', ruleId: 'rule-1', direction: 'exclude' });
  });

  it('hides exclude/include actions once the result is finalized (Review Focus #2)', () => {
    render(
      <ErrorList resultId="r1" sessionId="s1" status="finalized" errors={[baseError]} errorFlags={[]} verdicts={[]} investigationNotes={[]} />,
    );
    expect(screen.queryByRole('button', { name: /Bỏ lỗi/i })).not.toBeInTheDocument();
  });

  it('shows the server error message verbatim on a stale-rule 400 (Review Focus #1)', () => {
    mockState = { isPending: false, isError: true, error: new Error('Lỗi này không có trong lượt tính mới nhất của bài') };
    render(
      <ErrorList resultId="r1" sessionId="s1" status="flagged_for_review" errors={[baseError]} errorFlags={[]} verdicts={[]} investigationNotes={[]} />,
    );
    expect(screen.getByText('Lỗi này không có trong lượt tính mới nhất của bài')).toBeInTheDocument();
    mockState = { isPending: false, isError: false, error: null };
  });

  it('strikes through a refuted error, shows "0" not "0,0", and offers only "Không đồng ý"', () => {
    render(
      <ErrorList
        resultId="r1" sessionId="s1" status="flagged_for_review"
        errors={[{ ...baseError, counted: 'refuted', deductionHundredths: 150 }]}
        errorFlags={[]}
        verdicts={[{ lens: 'qua_tay', ruleKey: 'sai_bien', status: 'refuted', reason: 'Khung mã của đề đặt sẵn tên biến.' }]}
        investigationNotes={[]}
      />,
    );
    expect(screen.getByText('sai_bien')).toHaveClass('line-through');
    expect(screen.getByText('0')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Không đồng ý/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Bỏ lỗi này cho riêng bài này' })).not.toBeInTheDocument();
  });

  it('renders every verdict when two lenses disagree, tinted by the worse one (Review Focus #5)', () => {
    render(
      <ErrorList
        resultId="r1" sessionId="s1" status="flagged_for_review"
        errors={[baseError]}
        errorFlags={[]}
        verdicts={[
          { lens: 'tinh_dung', ruleKey: 'sai_bien', status: 'confirmed', reason: null },
          { lens: 'qua_tay', ruleKey: 'sai_bien', status: 'unverified', reason: 'Hết ngân sách trước khi đo lại được.' },
        ]}
        investigationNotes={[]}
      />,
    );
    expect(screen.getByText('Tính đúng')).toBeInTheDocument();
    expect(screen.getByText('Quá tay')).toBeInTheDocument();
    expect(screen.getByText(/Chưa kiểm được/)).toBeInTheDocument();
    expect(screen.getByText(/Xác nhận/)).toBeInTheDocument();
    expect(screen.queryByText(/lăng kính/i)).not.toBeInTheDocument(); // spec §2.2 fix #4: never say "lăng kính"
  });

  it('shows the investigation note as the evidence line when present', () => {
    render(
      <ErrorList
        resultId="r1" sessionId="s1" status="flagged_for_review" errors={[baseError]} errorFlags={[]} verdicts={[]}
        investigationNotes={[{ ruleKey: 'sai_bien', toolCallIds: ['tc-1'], note: 'run_tests("bien") trượt 3/5.' }]}
      />,
    );
    expect(screen.getByText(/trượt 3\/5/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to confirm it fails**

- [ ] **Step 3: Implement**

```tsx
// .../investigator/ErrorList.tsx
'use client';

import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useSetErrorException } from '@/hooks/useGrading';
import { SOURCE_LABEL, VERDICT_LABEL, lensLabel, worstVerdict } from '@/lib/grading-vocab';
import { formatVnPoints } from '@/lib/format';
import type { ResultDetailError, ChallengeVerdict } from '@/lib/api/grading';

/** Trạng thái mà một lỗi vẫn sửa được (§4.3 EDITABLE, review/error-exception.service.ts). */
const EDITABLE = new Set(['auto_approved', 'flagged_for_review', 'teacher_reviewed']);

export function ErrorList({
  resultId,
  sessionId,
  status,
  errors,
  errorFlags,
  verdicts,
  investigationNotes,
}: {
  resultId: string;
  sessionId: string;
  status: string;
  errors: ResultDetailError[];
  errorFlags: { ruleKey: string; code: string }[];
  verdicts: ChallengeVerdict[];
  investigationNotes: { ruleKey: string; toolCallIds: string[]; note: string | null }[];
}) {
  const setException = useSetErrorException(sessionId);
  const editable = EDITABLE.has(status);

  const verdictsByRule = new Map<string, ChallengeVerdict[]>();
  for (const v of verdicts) verdictsByRule.set(v.ruleKey, [...(verdictsByRule.get(v.ruleKey) ?? []), v]);
  const unverifiedByRule = new Set(errorFlags.filter((f) => f.code === 'unverified').map((f) => f.ruleKey));

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <h2 className="section-label">Lỗi chẩn đoán được</h2>
        <span className="text-caption text-muted-foreground">
          {errors.filter((e) => e.counted === 'counted').length} lỗi đã trừ
          {errors.some((e) => e.counted === 'refuted') && ` · ${errors.filter((e) => e.counted === 'refuted').length} bị bác bỏ`}
          {errors.some((e) => e.counted === 'unpriced') && ` · ${errors.filter((e) => e.counted === 'unpriced').length} chờ giá`}
        </span>
      </div>

      {setException.isError && (
        <Alert variant="destructive">
          <AlertDescription>{setException.error.message}</AlertDescription>
        </Alert>
      )}

      <ul className="flex flex-col gap-2">
        {errors.map((error) => {
          const source = SOURCE_LABEL[error.source];
          const rowVerdicts = verdictsByRule.get(error.ruleKey) ?? [];
          const worst = rowVerdicts.length > 0 ? worstVerdict(rowVerdicts.map((v) => v.status)) : null;
          const refuted = error.counted === 'refuted';
          const unpriced = error.counted === 'unpriced';
          const unverified = unverifiedByRule.has(error.ruleKey);
          const note = investigationNotes.find((n) => n.ruleKey === error.ruleKey)?.note;

          return (
            <li
              key={error.ruleId}
              className={`flex flex-col gap-1.5 rounded-md border border-border bg-surface p-3 ${refuted ? 'opacity-70' : ''}`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className={`font-medium ${refuted ? 'line-through' : ''}`}>{error.ruleKey}</span>
                <span className="text-caption text-muted-foreground">
                  {error.ruleName} · {error.criterionKey}
                </span>
                <Badge variant={source.variant}>{source.label}</Badge>
                {unpriced && <Badge variant="warning">Chờ giá — chưa trừ</Badge>}
                <span className="ml-auto font-semibold tabular-nums">
                  {refuted ? '0' : unpriced ? '—' : formatVnPoints(-error.deductionHundredths! / 100)}
                </span>
              </div>

              {note && <p className="text-small text-muted-foreground">{note}</p>}

              {worst && (
                <div className={`flex flex-col gap-1 rounded-md p-2 ${VERDICT_LABEL[worst].tintClass}`}>
                  {rowVerdicts.map((v) => (
                    <p key={v.lens} className="text-small">
                      <span className="font-semibold">
                        {lensLabel(v.lens)}: {VERDICT_LABEL[v.status].label}
                      </span>
                      {v.reason && <span className="text-muted-foreground"> — {v.reason}</span>}
                    </p>
                  ))}
                </div>
              )}

              {editable && (
                <div className="flex gap-3 text-small">
                  {refuted && (
                    <Button
                      variant="link"
                      className="h-auto p-0"
                      onClick={() => setException.mutate({ resultId, ruleId: error.ruleId, direction: 'include' })}
                    >
                      Không đồng ý — giữ lỗi này cho riêng bài này
                    </Button>
                  )}
                  {!refuted && unverified && (
                    <Button
                      variant="link"
                      className="h-auto p-0"
                      onClick={() => setException.mutate({ resultId, ruleId: error.ruleId, direction: 'exclude' })}
                    >
                      Bỏ lỗi cho riêng bài này
                    </Button>
                  )}
                  {!refuted && !unverified && (
                    <>
                      <Link href="/teacher/rules" className="font-medium text-accent-strong hover:underline">
                        Sửa luật này
                      </Link>
                      <Button
                        variant="link"
                        className="h-auto p-0"
                        onClick={() => setException.mutate({ resultId, ruleId: error.ruleId, direction: 'exclude' })}
                      >
                        Bỏ lỗi này cho riêng bài này
                      </Button>
                    </>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
```

- [ ] **Step 4: Run to confirm it passes, typecheck, commit**

```bash
pnpm exec vitest run "src/app/teacher/grading/\[resultId\]/_components/investigator/ErrorList.test.tsx"
pnpm --filter web exec tsc --noEmit
git add "apps/web/src/app/teacher/grading/[resultId]/_components/investigator/ErrorList.tsx" "apps/web/src/app/teacher/grading/[resultId]/_components/investigator/ErrorList.test.tsx"
git commit -m "feat(grading): investigator error list with exclude/include actions and phan bien tints"
```

---

## Task 6: Criteria table, coverage, and investigation trail

**Files:**
- Create: `.../investigator/CriteriaTable.tsx`
- Test: `.../investigator/CriteriaTable.test.tsx`
- Create: `.../investigator/CoverageSection.tsx`
- Test: `.../investigator/CoverageSection.test.tsx`
- Create: `.../investigator/InvestigationTrail.tsx` (replaces the one under `grading/investigation/[resultId]/_components/`, not deleted until Task 8)
- Test: `.../investigator/InvestigationTrail.test.tsx`

**Interfaces:**
- Consumes: `breakdown.perCriterion`, `ResultDetail.investigation` (Task 2's extended type, incl. `replay`), `toolActionLabel` (Task 2).
- Produces: `<CriteriaTable perCriterion />`, `<CoverageSection investigation />`, `<InvestigationTrail investigation />` — consumed by `InvestigatorDossier` (Task 8).

- [ ] **Step 1: Write the failing test for `CriteriaTable`**

```tsx
// .../investigator/CriteriaTable.test.tsx
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { describe, expect, it } from 'vitest';
import { CriteriaTable } from './CriteriaTable';

describe('CriteriaTable', () => {
  it('shows trần/bị trừ/còn and a "chạm trần" note, plus the total row', () => {
    render(
      <CriteriaTable
        perCriterion={[
          { key: 'tinh_dung', maxHundredths: 400, deductedHundredths: 150, capped: false },
          { key: 'hieu_nang', maxHundredths: 100, deductedHundredths: 100, capped: true },
        ]}
      />,
    );
    expect(screen.getByText('tinh_dung')).toBeInTheDocument();
    expect(screen.getByText(/chạm trần/)).toBeInTheDocument();
    expect(screen.getByText('Tổng')).toBeInTheDocument();
    expect(screen.getByText('2,5')).toBeInTheDocument(); // (400+100-150-100)/100
  });
});
```

- [ ] **Step 2: Run to confirm it fails, Step 3: implement**

```tsx
// .../investigator/CriteriaTable.tsx
import { formatVnPoints } from '@/lib/format';

export function CriteriaTable({
  perCriterion,
}: {
  perCriterion: { key: string; maxHundredths: number; deductedHundredths: number; capped: boolean }[];
}) {
  const totalMax = perCriterion.reduce((sum, c) => sum + c.maxHundredths, 0);
  const totalDeducted = perCriterion.reduce((sum, c) => sum + c.deductedHundredths, 0);
  return (
    <section className="flex flex-col gap-2">
      <h2 className="section-label">Theo tiêu chí</h2>
      <table className="w-full text-small">
        <thead>
          <tr className="text-caption text-muted-foreground">
            <th className="text-left font-semibold">Tiêu chí</th>
            <th className="text-right font-semibold">Trần</th>
            <th className="text-right font-semibold">Bị trừ</th>
            <th className="text-right font-semibold">Còn</th>
          </tr>
        </thead>
        <tbody>
          {perCriterion.map((c) => (
            <tr key={c.key} className="border-t border-border/70">
              <td>
                {c.key}
                {c.capped && <span className="ml-1 text-caption font-semibold text-muted-foreground">· chạm trần</span>}
              </td>
              <td className="text-right tabular-nums">{formatVnPoints(c.maxHundredths / 100)}</td>
              <td className="text-right tabular-nums">−{formatVnPoints(c.deductedHundredths / 100)}</td>
              <td className="text-right font-semibold tabular-nums">
                {formatVnPoints((c.maxHundredths - c.deductedHundredths) / 100)}
              </td>
            </tr>
          ))}
          <tr className="border-t border-border font-semibold">
            <td>Tổng</td>
            <td className="text-right tabular-nums">{formatVnPoints(totalMax / 100)}</td>
            <td className="text-right tabular-nums">−{formatVnPoints(totalDeducted / 100)}</td>
            <td className="text-right tabular-nums">{formatVnPoints((totalMax - totalDeducted) / 100)}</td>
          </tr>
        </tbody>
      </table>
    </section>
  );
}
```

- [ ] **Step 4: Write the failing test for `CoverageSection`**

```tsx
// .../investigator/CoverageSection.test.tsx
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { describe, expect, it } from 'vitest';
import { CoverageSection } from './CoverageSection';

const investigation = {
  kind: 'verdict' as const,
  summary: 'x',
  flags: [],
  verdict: { errors: [] },
  replay: { toolCallId: 'tc-3', matched: true },
  investigation: {
    toolCalls: [
      { id: 'tc-1', tool: 'run_tests', args: {}, status: 'ok', output: '', startedAt: '', wallMs: 100, injectionSuspected: false },
    ],
  },
};

describe('CoverageSection', () => {
  it('shows the replay result using real data, matched → "khớp"', () => {
    render(<CoverageSection investigation={investigation as never} />);
    expect(screen.getByText(/khớp/i)).toBeInTheDocument();
  });

  it('says the replay is unverified when matched is null, not "khớp"', () => {
    render(<CoverageSection investigation={{ ...investigation, replay: { toolCallId: 'tc-3', matched: null } } as never} />);
    expect(screen.getByText(/chưa chạy lại được|không xác định/i)).toBeInTheDocument();
  });

  it('marks complexity analysis as not built — never fakes a chart (step 4 of the grading spec is not done)', () => {
    render(<CoverageSection investigation={investigation as never} />);
    expect(screen.getByText(/chưa có/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 5: Run to confirm it fails, Step 6: implement**

```tsx
// .../investigator/CoverageSection.tsx
import type { ResultDetail } from '@/lib/api/grading';

export function CoverageSection({ investigation }: { investigation: NonNullable<ResultDetail['investigation']> }) {
  const runTestsCalls = investigation.investigation.toolCalls.filter((c) => c.tool === 'run_tests');
  const replay = investigation.replay;

  return (
    <section className="flex flex-col gap-2">
      <h2 className="section-label">Độ phủ điều tra</h2>
      <p className="text-caption text-muted-foreground">
        "Không tìm thấy lỗi" và "đã kiểm và không có lỗi" là hai chuyện khác nhau. Đây là phần đã kiểm.
      </p>
      <ul className="flex flex-col gap-1 text-small">
        <li>Đã chạy {runTestsCalls.length} lượt gói test.</li>
        {replay && (
          <li>
            Chạy lại ngẫu nhiên lời gọi #{replay.toolCallId} →{' '}
            {replay.matched === true ? 'khớp' : replay.matched === false ? 'lệch' : 'chưa chạy lại được để đối chiếu'}.
          </li>
        )}
      </ul>
      <div className="relative rounded-lg border border-dashed border-border bg-surface p-3">
        <span className="absolute -top-2.5 right-3 rounded-sm border border-dashed border-border bg-background px-1.5 text-[0.625rem] font-semibold uppercase tracking-[0.07em] text-muted-foreground">
          chưa có
        </span>
        <h3 className="text-small font-semibold">Độ phức tạp đo được</h3>
        <p className="mt-1 text-caption text-muted-foreground">
          Cần công cụ đo độ phức tạp (bước 4 của spec chấm điểm) — chưa xây. Bài nộp chưa được so với đề theo lớp thời
          gian chạy.
        </p>
      </div>
    </section>
  );
}
```

- [ ] **Step 7: Write the failing test for `InvestigationTrail`**

```tsx
// .../investigator/InvestigationTrail.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { describe, expect, it } from 'vitest';
import { InvestigationTrail } from './InvestigationTrail';

const investigation = {
  summary: 'Tóm tắt hệ thống.',
  investigation: {
    toolCalls: [
      { id: 'tc-1', tool: 'run_tests', args: { group: 'bien' }, status: 'ok', output: 'PASS', startedAt: '', wallMs: 620, injectionSuspected: false },
    ],
  },
} as never;

describe('InvestigationTrail', () => {
  it('shows the §2.2 action name as the primary label, and the raw tool as a secondary mono line', () => {
    render(<InvestigationTrail investigation={investigation} />);
    expect(screen.getByText('Chạy gói test')).toBeInTheDocument();
    expect(screen.getByText('run_tests')).toHaveClass('font-mono');
  });

  it('expands a row to show its real output', () => {
    render(<InvestigationTrail investigation={investigation} />);
    fireEvent.click(screen.getByRole('button', { name: /Chạy gói test/ }));
    expect(screen.getByText('PASS')).toBeInTheDocument();
  });

  it('shows the harness summary verbatim (T-UI-4) — the field itself, not model prose reconstructed client-side', () => {
    render(<InvestigationTrail investigation={investigation} />);
    expect(screen.getByText('Tóm tắt hệ thống.')).toBeInTheDocument();
  });
});
```

- [ ] **Step 8: Run to confirm it fails, Step 9: implement**

```tsx
// .../investigator/InvestigationTrail.tsx
'use client';

import { useState } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import { toolActionLabel } from '@/lib/grading-vocab';
import type { ResultDetail } from '@/lib/api/grading';

export function InvestigationTrail({ investigation }: { investigation: NonNullable<ResultDetail['investigation']> }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const calls = investigation.investigation.toolCalls;

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <h2 className="section-label">Đường điều tra</h2>
        <span className="text-caption text-muted-foreground">{calls.length} lời gọi</span>
      </div>
      <p className="rounded-md border-l-2 border-primary bg-surface p-3 text-small">{investigation.summary}</p>
      <ol className="flex flex-col gap-1.5">
        {calls.map((call) => {
          const ok = call.status === 'ok';
          const open = openId === call.id;
          return (
            <li key={call.id} className="rounded-md border border-border">
              <button
                type="button"
                aria-expanded={open}
                onClick={() => setOpenId(open ? null : call.id)}
                className="flex w-full items-center gap-2 p-2 text-left text-small"
              >
                <span className="w-6 text-caption text-muted-foreground">#{call.id.replace('tc-', '')}</span>
                <span className="flex-grow font-medium">{toolActionLabel(call.tool)}</span>
                <span className="font-mono text-caption text-muted-foreground">{call.tool}</span>
                {ok ? (
                  <CheckCircle2 className="h-4 w-4 text-success-strong" aria-hidden="true" />
                ) : (
                  <XCircle className="h-4 w-4 text-danger-strong" aria-hidden="true" />
                )}
                <span className="w-14 text-right text-caption text-muted-foreground">{call.wallMs}ms</span>
              </button>
              {open && (
                <div className="border-t border-border p-2.5 pl-10">
                  <pre className="max-h-64 overflow-y-auto rounded-md bg-foreground p-2.5 font-mono text-caption text-background">
                    {call.output}
                  </pre>
                  <p className="mt-1.5 text-caption text-muted-foreground">Đầu ra cắt tối đa 8 KB mỗi lời gọi.</p>
                  {call.injectionSuspected && (
                    <p className="mt-1 text-caption font-semibold text-destructive">Nghi ngờ chỉ thị nhắm vào AI chấm.</p>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
```

- [ ] **Step 10: Run every test in this task, typecheck, commit**

```bash
pnpm exec vitest run "src/app/teacher/grading/\[resultId\]/_components/investigator/CriteriaTable.test.tsx" "src/app/teacher/grading/\[resultId\]/_components/investigator/CoverageSection.test.tsx" "src/app/teacher/grading/\[resultId\]/_components/investigator/InvestigationTrail.test.tsx"
pnpm --filter web exec tsc --noEmit
git add "apps/web/src/app/teacher/grading/[resultId]/_components/investigator/CriteriaTable.tsx" "apps/web/src/app/teacher/grading/[resultId]/_components/investigator/CriteriaTable.test.tsx" "apps/web/src/app/teacher/grading/[resultId]/_components/investigator/CoverageSection.tsx" "apps/web/src/app/teacher/grading/[resultId]/_components/investigator/CoverageSection.test.tsx" "apps/web/src/app/teacher/grading/[resultId]/_components/investigator/InvestigationTrail.tsx" "apps/web/src/app/teacher/grading/[resultId]/_components/investigator/InvestigationTrail.test.tsx"
git commit -m "feat(grading): criteria table, honest coverage section, and rebuilt investigation trail"
```

---

## Task 7: Ungradable view

**Files:**
- Create: `.../investigator/UngradableView.tsx`
- Test: `.../investigator/UngradableView.test.tsx`

**Interfaces:**
- Consumes: `ResultDetail` (ungradableClass/ungradableReason/investigation), `InvestigationTrail` (Task 6).
- Produces: `<UngradableView ungradableClass ungradableReason investigation onOpenManualScore />` — consumed by `InvestigatorDossier` (Task 8), which owns the one `ManualScoreDialog` on the page.

- [ ] **Step 1: Write the failing tests**

```tsx
// .../investigator/UngradableView.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi } from 'vitest';
import { UngradableView } from './UngradableView';

const investigation = {
  summary: 'x',
  investigation: { toolCalls: [{ id: 'tc-1', tool: 'run_tests', args: {}, status: 'error', output: 'timeout', startedAt: '', wallMs: 0, injectionSuspected: false }] },
} as never;

describe('UngradableView', () => {
  it('shows "—" for the score, never 0 or the max (T-UI-5)', () => {
    render(<UngradableView ungradableClass="system" ungradableReason="Sandbox không phản hồi." investigation={investigation} onOpenManualScore={vi.fn()} />);
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.queryByText('10')).not.toBeInTheDocument();
  });

  it('says "môi trường chạy bài", never "sandbox" (spec §2.2 fix #2)', () => {
    render(<UngradableView ungradableClass="system" ungradableReason="Môi trường chạy bài không phản hồi." investigation={investigation} onOpenManualScore={vi.fn()} />);
    expect(screen.queryByText(/sandbox/i)).not.toBeInTheDocument();
  });

  it('offers a regrade path, marked cần backend, ONLY for class "system" (§2.3)', () => {
    render(<UngradableView ungradableClass="system" ungradableReason="x" investigation={investigation} onOpenManualScore={vi.fn()} />);
    const regrade = screen.getByRole('button', { name: /Chấm lại bài này/i });
    expect(regrade).toBeDisabled();
    expect(screen.getByText(/cần backend/i)).toBeInTheDocument();
  });

  it('never offers a regrade path for class "submission" — only chấm tay', () => {
    render(<UngradableView ungradableClass="submission" ungradableReason="x" investigation={investigation} onOpenManualScore={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /Chấm lại/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Chấm tay bài này' })).toBeEnabled();
  });

  it('calls onOpenManualScore, and does not mount its own dialog', () => {
    const onOpenManualScore = vi.fn();
    render(<UngradableView ungradableClass="submission" ungradableReason="x" investigation={investigation} onOpenManualScore={onOpenManualScore} />);
    fireEvent.click(screen.getByRole('button', { name: 'Chấm tay bài này' }));
    expect(onOpenManualScore).toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to confirm it fails, Step 3: implement**

```tsx
// .../investigator/UngradableView.tsx
'use client';

import { CircleMinus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { InvestigationTrail } from './InvestigationTrail';
import type { ResultDetail } from '@/lib/api/grading';

/** Không tự giữ `ManualScoreDialog` — `InvestigatorDossier` (Task 8) giữ đúng MỘT hộp thoại cho cả trang. */
export function UngradableView({
  ungradableClass,
  ungradableReason,
  investigation,
  onOpenManualScore,
}: {
  ungradableClass: 'system' | 'submission';
  ungradableReason: string;
  investigation: ResultDetail['investigation'];
  onOpenManualScore: () => void;
}) {
  const touchedCalls = investigation?.investigation.toolCalls.length ?? 0;

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_404px]">
      <section className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-7">
        <div className="flex flex-col gap-1.5">
          <span className="text-caption font-semibold text-muted-foreground">Điểm</span>
          <span className="text-3xl font-semibold tabular-nums text-muted-foreground">
            — <span className="text-body font-medium">chưa có điểm nào cho bài này</span>
          </span>
        </div>
        <div className="flex items-center gap-2 text-small font-semibold">
          <CircleMinus className="h-4 w-4" aria-hidden="true" />
          Không chấm được
        </div>
        <p className="max-w-[640px] text-small text-muted-foreground">{ungradableReason}</p>
        <div className="max-w-[680px] rounded-md bg-surface-2 p-3.5 text-small">
          <strong>Vì sao không cho điểm, thay vì cho một điểm tạm.</strong> Chấm theo kiểu trừ lỗi, một cuộc điều tra
          không chạy được gì sẽ không tìm ra lỗi nào — và nếu cứ tính, bài sẽ ra <strong>điểm tối đa</strong>. "Không
          tìm thấy lỗi" không có nghĩa là "không có lỗi".
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-small font-semibold">Bạn có thể</span>
          <div className="flex flex-wrap gap-2">
            {ungradableClass === 'system' && (
              <>
                <Button disabled>
                  Chấm lại bài này
                  <span className="ml-2 rounded-md border border-dashed border-muted-foreground px-1.5 py-px text-caption font-semibold text-muted-foreground">
                    cần backend
                  </span>
                </Button>
                <Button variant="outline" disabled>
                  Chấm lại cả các bài cùng lý do
                  <span className="ml-2 rounded-md border border-dashed border-muted-foreground px-1.5 py-px text-caption font-semibold text-muted-foreground">
                    cần backend
                  </span>
                </Button>
              </>
            )}
            <Button variant="outline" onClick={onOpenManualScore}>
              Chấm tay bài này
            </Button>
          </div>
          <p className="text-caption text-muted-foreground">
            {ungradableClass === 'system'
              ? 'Lỗi ở phía hệ thống, không phải ở bài làm.'
              : 'Bài làm không đọc được — chấm lại sẽ ra đúng kết quả cũ, nên lối duy nhất là chấm tay.'}
          </p>
        </div>
      </section>
      <section className="rounded-lg border border-border bg-surface p-4">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="section-label">Những gì đã chạy</h2>
          <span className="text-caption text-muted-foreground">{touchedCalls} lời gọi</span>
        </div>
        {investigation ? (
          <InvestigationTrail investigation={investigation} />
        ) : (
          <p className="text-small text-muted-foreground">Chưa có lời gọi nào được ghi lại.</p>
        )}
      </section>
    </div>
  );
}
```

- [ ] **Step 4: Run to confirm it passes, typecheck, commit**

```bash
pnpm exec vitest run "src/app/teacher/grading/\[resultId\]/_components/investigator/UngradableView.test.tsx"
pnpm --filter web exec tsc --noEmit
git add "apps/web/src/app/teacher/grading/[resultId]/_components/investigator/UngradableView.tsx" "apps/web/src/app/teacher/grading/[resultId]/_components/investigator/UngradableView.test.tsx"
git commit -m "feat(grading): ungradable view for investigator results, class-aware regrade affordance"
```

---

## Task 8: Assemble `InvestigatorDossier`, branch `[resultId]/page.tsx`, absorb the `investigation/` route

**Files:**
- Create: `.../investigator/InvestigatorDossier.tsx`
- Test: `.../investigator/InvestigatorDossier.test.tsx`
- Modify: `apps/web/src/app/teacher/grading/[resultId]/page.tsx`
- Modify: `apps/web/src/app/teacher/grading/[resultId]/page.test.tsx` (add cases; keep existing ones passing unmodified)
- Modify: `apps/web/src/app/teacher/grading/matrix/_components/MatrixTable.tsx`
- Modify: `apps/web/src/app/teacher/grading/matrix/_components/MatrixTable.test.tsx`
- Delete: `apps/web/src/app/teacher/grading/investigation/[resultId]/page.tsx`
- Delete: `apps/web/src/app/teacher/grading/investigation/[resultId]/_components/ChallengeNotes.tsx` (+ `.test.tsx`)
- Delete: `apps/web/src/app/teacher/grading/investigation/[resultId]/_components/DiagnosedErrorList.tsx` (+ `.test.tsx`)
- Delete: `apps/web/src/app/teacher/grading/investigation/[resultId]/_components/InvestigationTrail.tsx`
- Delete: `apps/web/src/app/teacher/grading/investigation/[resultId]/_components/ScoreSummary.tsx`
- Delete: `apps/web/src/app/teacher/grading/investigation/[resultId]/_components/lens-labels.ts`
- Delete: `apps/web/src/app/teacher/grading/investigation/[resultId]/page.test.tsx`

**Interfaces:**
- Consumes: everything from Tasks 3–7, `useGradingResults`, `useSessionOverview`, `useExamSessionDetail`, `useResultInvestigation`, `useRubrics`.
- Produces: `<InvestigatorDossier resultId sessionId />` — the sole thing `page.tsx` renders for `pipeline === 'investigator'`.

- [ ] **Step 1: Write the failing tests for `InvestigatorDossier`**

```tsx
// .../investigator/InvestigatorDossier.test.tsx
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi } from 'vitest';
import { InvestigatorDossier } from './InvestigatorDossier';

let resultsMock = () => ({ data: [] as unknown[], isLoading: false, isError: false });
let detailMock = () => ({ data: undefined as unknown, isLoading: false });
let overviewMock = () => ({ data: [] as unknown[] });
let examSessionMock = () => ({ data: undefined as unknown });
let rubricsMock = () => ({ data: [] as unknown[] });

vi.mock('@/hooks/useGrading', () => ({
  useGradingResults: () => resultsMock(),
  useResultInvestigation: () => detailMock(),
  useRubrics: () => rubricsMock(),
  useSubmissionText: () => ({ data: undefined, isLoading: true }),
  useSetManualScore: () => ({ mutate: vi.fn(), isPending: false, isError: false, error: null }),
  useSetErrorException: () => ({ mutate: vi.fn(), isPending: false, isError: false, error: null }),
}));
vi.mock('@/hooks/useSubmissionOverview', () => ({ useSessionOverview: () => overviewMock() }));
vi.mock('@/hooks/useExamSession', () => ({ useExamSessionDetail: () => examSessionMock() }));

const baseResult = {
  id: 'r1', studentMssv: 'SV1', studentName: 'A', status: 'flagged_for_review',
  ungradableReason: null, pipeline: 'investigator' as const, currentScore: 6, currentScoreSource: 'computation',
};

describe('InvestigatorDossier', () => {
  it('shows a neutral loading state while the result is still grading (Review Focus #4) — never crashes on a null breakdown', () => {
    resultsMock = () => ({ data: [{ ...baseResult, status: 'ai_grading' }], isLoading: false, isError: false });
    detailMock = () => ({
      data: { pipeline: 'investigator', currentScore: null, currentScoreSource: 'none', status: 'ai_grading', ungradableClass: null, ungradableReason: null, breakdown: null, investigation: null, challengeNotes: [], challengeVerdicts: [] },
      isLoading: false,
    });
    render(<InvestigatorDossier resultId="r1" sessionId="s1" />);
    expect(screen.getByText(/đang chấm/i)).toBeInTheDocument();
  });

  it('renders the Ungradable view when ungradableClass is set', () => {
    resultsMock = () => ({ data: [{ ...baseResult, ungradableReason: 'x' }], isLoading: false, isError: false });
    detailMock = () => ({
      data: { pipeline: 'investigator', currentScore: null, currentScoreSource: 'none', status: 'flagged_for_review', ungradableClass: 'system', ungradableReason: 'x', breakdown: null, investigation: { summary: 's', investigation: { toolCalls: [] } }, challengeNotes: [], challengeVerdicts: [] },
      isLoading: false,
    });
    render(<InvestigatorDossier resultId="r1" sessionId="s1" />);
    expect(screen.getByText('Không chấm được')).toBeInTheDocument();
  });

  it('renders the full dossier for a normal flagged result', () => {
    resultsMock = () => ({ data: [baseResult], isLoading: false, isError: false });
    detailMock = () => ({
      data: {
        pipeline: 'investigator', currentScore: 6, currentScoreSource: 'computation', status: 'flagged_for_review',
        ungradableClass: null, ungradableReason: null,
        breakdown: {
          errors: [{ ruleId: 'rule-1', ruleKey: 'sai_bien', ruleName: 'Sai biên', criterionKey: 'tinh_dung', source: 'deterministic', toolCallIds: [], deductionHundredths: 150, counted: 'counted' }],
          perCriterion: [{ key: 'tinh_dung', maxHundredths: 1000, deductedHundredths: 150, capped: false }],
          caseFlags: [], errorFlags: [], confidence: 0.9, mismatchedRules: [], notConsidered: [], ungradable: null,
        },
        investigation: { summary: 'x', verdict: { errors: [] }, replay: null, investigation: { toolCalls: [] } },
        challengeNotes: [], challengeVerdicts: [],
      },
      isLoading: false,
    });
    render(<InvestigatorDossier resultId="r1" sessionId="s1" />);
    expect(screen.getByText('SV1')).toBeInTheDocument();
    expect(screen.getByText('sai_bien')).toBeInTheDocument();
    expect(screen.getByText('Theo tiêu chí')).toBeInTheDocument();
  });

  it('shows "not found" when the result is missing from the session list', () => {
    resultsMock = () => ({ data: [], isLoading: false, isError: false });
    render(<InvestigatorDossier resultId="missing" sessionId="s1" />);
    expect(screen.getByText(/Không tìm thấy bài này/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to confirm it fails**

- [ ] **Step 3: Implement `InvestigatorDossier`**

```tsx
// .../investigator/InvestigatorDossier.tsx
'use client';

import Link from 'next/link';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { useGradingResults, useResultInvestigation, useRubrics } from '@/hooks/useGrading';
import { useSessionOverview } from '@/hooks/useSubmissionOverview';
import { useExamSessionDetail } from '@/hooks/useExamSession';
import { DossierHeader } from './DossierHeader';
import { CaseFlagsBanner } from './CaseFlagsBanner';
import { ScoreCard } from './ScoreCard';
import { ErrorList } from './ErrorList';
import { CriteriaTable } from './CriteriaTable';
import { CoverageSection } from './CoverageSection';
import { InvestigationTrail } from './InvestigationTrail';
import { UngradableView } from './UngradableView';
import { ManualScoreDialog } from './ManualScoreDialog';

/**
 * Đúng MỘT `ManualScoreDialog` cho cả trang — cả `DossierHeader`, cả
 * `UngradableView`, cả `CaseFlagsBanner` chỉ gọi `setOpenManual(true)`,
 * không component con nào tự giữ hộp thoại của riêng nó.
 */
export function InvestigatorDossier({ resultId, sessionId }: { resultId: string; sessionId: string }) {
  const [openManual, setOpenManual] = useState(false);
  const results = useGradingResults(sessionId || undefined);
  const detail = useResultInvestigation(resultId);
  const overview = useSessionOverview();
  const session = (overview.data ?? []).find((item: { id: string }) => item.id === sessionId);
  const examSession = useExamSessionDetail(sessionId || undefined);
  const rubrics = useRubrics();
  const rubric = rubrics.data?.find((r) => r.version === session?.rubricVersion);
  const maxTotal = rubric?.totalPoints ?? 10;

  const result = results.data?.find((r) => r.id === resultId);

  if (results.isLoading || detail.isLoading) return <Skeleton className="h-64 w-full" />;

  if (results.isError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>Không tải được kết quả chấm — {results.error.message}. Thử tải lại trang.</AlertDescription>
      </Alert>
    );
  }

  if (!result) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          Không tìm thấy bài này. Quay lại{' '}
          <Link href={`/teacher/grading?sessionId=${sessionId}`} className="font-semibold underline underline-offset-2">
            màn Điều phối
          </Link>{' '}
          và chọn lại.
        </AlertDescription>
      </Alert>
    );
  }

  const header = (status: string, ungradableReason: string | null, currentScore: number | null) => (
    <DossierHeader
      resultId={resultId} sessionId={sessionId}
      sessionName={session?.name ?? '—'} roomName={examSession.data?.roomName ?? null}
      mssv={result.studentMssv} studentName={result.studentName}
      status={status} ungradableReason={ungradableReason}
      onOpenManualScore={() => setOpenManual(true)}
    />
  );
  const dialog = (currentScore: number | null) => (
    <ManualScoreDialog
      resultId={resultId} sessionId={sessionId}
      currentScore={currentScore} maxTotal={maxTotal}
      open={openManual} onOpenChange={setOpenManual}
    />
  );

  const d = detail.data;
  if (!d || (d.breakdown === null && d.ungradableClass === null && d.investigation === null)) {
    // Điều tra chưa xong (ai_grading/ai_graded), hoặc chưa có bản ghi nào — Review Focus #4:
    // KHÔNG đọc breakdown.errors trên null, chỉ nói đang chấm.
    return (
      <div className="flex flex-col gap-4">
        {header(result.status, result.ungradableReason, null)}
        <Alert variant="info">
          <AlertDescription>AI đang chấm bài này — chưa có dữ liệu để hiện. Tải lại sau ít phút.</AlertDescription>
        </Alert>
        {dialog(null)}
      </div>
    );
  }

  if (d.ungradableClass) {
    return (
      <div className="flex flex-col gap-4">
        {header(d.status, d.ungradableReason, null)}
        <UngradableView
          ungradableClass={d.ungradableClass} ungradableReason={d.ungradableReason ?? ''}
          investigation={d.investigation} onOpenManualScore={() => setOpenManual(true)}
        />
        {dialog(null)}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {header(d.status, d.ungradableReason, d.currentScore)}
      {d.breakdown && (
        <CaseFlagsBanner
          caseFlags={d.breakdown.caseFlags}
          errorFlags={d.breakdown.errorFlags}
          onManualScore={() => setOpenManual(true)}
        />
      )}
      <div className="grid gap-4 lg:grid-cols-[1fr_404px]">
        <div className="flex flex-col gap-4">
          <ScoreCard currentScore={d.currentScore} currentScoreSource={d.currentScoreSource} breakdown={d.breakdown} />
          {d.breakdown && (
            <ErrorList
              resultId={resultId} sessionId={sessionId} status={d.status}
              errors={d.breakdown.errors} errorFlags={d.breakdown.errorFlags} verdicts={d.challengeVerdicts}
              investigationNotes={d.investigation?.verdict?.errors ?? []}
            />
          )}
          {d.investigation && <InvestigationTrail investigation={d.investigation} />}
        </div>
        <div className="flex flex-col gap-4">
          {d.breakdown && <CriteriaTable perCriterion={d.breakdown.perCriterion} />}
          {d.investigation && <CoverageSection investigation={d.investigation} />}
        </div>
      </div>
      {dialog(d.currentScore)}
    </div>
  );
}
```

Add `import { useState } from 'react';` at the top alongside the other imports.

- [ ] **Step 4: Run every investigator-component test**

```bash
pnpm exec vitest run "src/app/teacher/grading/\[resultId\]/_components/investigator"
```

- [ ] **Step 5: Branch `page.tsx`**

Read the current file in full (already quoted in this plan's research). Insert ONE branch, immediately after the existing `if (!result) { ... }` block and BEFORE `const readOnly = ...`:

```tsx
// apps/web/src/app/teacher/grading/[resultId]/page.tsx — add this import at the top
import { InvestigatorDossier } from './_components/investigator/InvestigatorDossier';

// ...inside GradingDetailPage, right after the `if (!result) { return <Alert>...</Alert>; }` block:
  if (result.pipeline === 'investigator') {
    return <InvestigatorDossier resultId={resultId} sessionId={sessionId} />;
  }

  // (unchanged) const readOnly = IN_PROGRESS.includes(result.status); ...
```

Nothing else in `page.tsx` changes — the entire `one_shot` branch below is untouched.

- [ ] **Step 6: Add investigator cases to `page.test.tsx`, keep the existing one_shot cases passing**

Read `apps/web/src/app/teacher/grading/[resultId]/page.test.tsx` first to match its existing mock setup exactly (query params, `useGradingResults` mock shape). Append:

```tsx
describe('pipeline branch', () => {
  it('renders the InvestigatorDossier for pipeline=investigator, not the criterion form', () => {
    resultsMock = () => ({ data: [{ id: 'r1', pipeline: 'investigator', studentMssv: 'SV1', studentName: 'A', status: 'auto_approved', ungradableReason: null, criterionResults: [], editedCriteria: null, aiTotalScore: 9, confidence: 0.95 }], isLoading: false, isError: false });
    render(<GradingDetailPage params={Promise.resolve({ resultId: 'r1' })} />);
    expect(screen.queryByText('Bài làm')).not.toBeInTheDocument(); // the one_shot AnswerPane card heading
  });
});
```

- [ ] **Step 7: Run `page.test.tsx` — confirm EVERY existing case still passes plus the new one**

```bash
pnpm exec vitest run "src/app/teacher/grading/\[resultId\]/page.test.tsx"
```

- [ ] **Step 8: Fix `MatrixTable`'s link and its test**

Read `apps/web/src/app/teacher/grading/matrix/_components/MatrixTable.tsx:144-147` and its test file. Replace the pipeline-conditional href with a single unconditional one:

```tsx
// before (MatrixTable.tsx, illustrative — read the real surrounding code first):
// href={result.pipeline === 'investigator' ? `/teacher/grading/investigation/${result.id}` : `/teacher/grading/${result.id}?sessionId=${sessionId}`}

// after:
href={`/teacher/grading/${result.id}?sessionId=${sessionId}`}
```

Update `MatrixTable.test.tsx`'s assertion(s) that expect `/teacher/grading/investigation/...` for an investigator row to instead expect `/teacher/grading/<id>?sessionId=...`.

- [ ] **Step 9: Delete the orphan `investigation/[resultId]` route**

```bash
git rm -r apps/web/src/app/teacher/grading/investigation
```

- [ ] **Step 10: Run the whole grading test area, typecheck, lint, build**

```bash
pnpm exec vitest run src/app/teacher/grading src/hooks/useGrading.test.ts
pnpm --filter web exec tsc --noEmit
pnpm --filter web lint
pnpm --filter web build
```

- [ ] **Step 11: Commit**

```bash
git add -A -- apps/web/src/app/teacher/grading
git commit -m "feat(grading): branch [resultId] by pipeline, assemble InvestigatorDossier, absorb investigation/ route"
```

---

## Task 9: Full regression

**Files:** none new — this task only runs and, if needed, patches fallout.

- [ ] **Step 1: Run every web unit test**

```bash
pnpm --filter web test
```

Expected: all green except the one pre-existing, unrelated failure already known from the Task 1 baseline run (`src/lib/read-workbook.test.ts` timeout, 2026-09-28) — if that one fails again, it is not this plan's regression; anything else failing must be fixed before continuing.

- [ ] **Step 2: Build and lint the whole web app**

```bash
pnpm --filter web build
pnpm --filter web lint
```

- [ ] **Step 3: Run the backend e2e specs this plan's routes are documented by, to confirm the local stack still matches the contract this plan was written against (no BE code changed, so this should already be green — it is a sanity check, not new coverage)**

```bash
cd apps/api
npx jest --config ./test/jest-e2e.json error-exception result-detail finalize-investigator criterion-waiver rules-routes > /tmp/e2e-plan-a.log 2>&1
grep -E "^Tests:|^Test Suites:" /tmp/e2e-plan-a.log
```

- [ ] **Step 4: Commit any fixup separately if Steps 1–3 required changes**

```bash
git add -A
git commit -m "fix(grading): regression fixes after investigator dossier rebuild" --allow-empty
```

## Execution note

This plan is executed **inline, in this session** (superpowers:executing-plans), on branch `feat/grading-ui-rebuild`, with a commit after each task. No user review gate between tasks — proceed straight through Task 10, then report the final state (test/build/lint results, and whether the Playwright suite ran green) without waiting for approval, per the user's standing instruction for this work.
