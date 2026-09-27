# Bước 3c — Bảng lỗi, bảng giá, lượt tính điểm, điểm hiện tại Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dịch vụ và route cho bảng lỗi có uuid, bảng giá có phiên bản, lượt tính điểm chỉ-thêm và hàm *điểm hiện tại* §14.2 — để một lượt chấm của đường điều tra (3d ghi) thành điểm, và đổi giá / đổi luật / bỏ lỗi / đánh dấu tiêu chí tính lại điểm mà không gọi model.

**Architecture:** Một lõi thuần `computeScore()` bọc `decide()` của 3a: ánh xạ `rule_key` → uuid và bản sửa (T-KEY-1), loại luật lệch tiêu chí, không xét luật bằng lời mà KHÔNG PHẢI mọi bài của phiên đều đã thấy (T-FAIR-1, *"tất cả hoặc không"*), áp ngoại lệ cấp lỗi, rồi tính số học. `ScoreService` là chỗ DUY NHẤT ghi `score_computation` và dời trạng thái sau một lượt tính; mọi dịch vụ khác (giá, luật, ngoại lệ, đánh dấu, chốt) gọi nó TRONG transaction của mình, nên thay đổi và mọi lượt tính lại nó gây ra commit cùng nhau. Một khoá tư vấn theo giảng viên xếp hàng mọi lượt tính của cùng giảng viên. Hồ sơ của lượt chấm có hợp đồng JSON riêng (`StoredInvestigation`) mà 3d ghi và 3c đọc.

**Tech Stack:** NestJS 10 · TypeORM 0.3.31 · PostgreSQL 16 (local docker, cổng 5442) · Jest · class-validator (`ValidationPipe({ whitelist: true })` — mọi trường DTO phải có decorator).

**Spec:** `docs/superpowers/specs/2026-09-20-grading-agent-investigator-design.md` (bản lần 10, trong worktree, chưa commit) — §2.1 (bảng lỗi, số học, *luật chưa có giá*, *khoá theo giảng viên*), §2.2 (bốn bậc, điểm là hàm, ngoại lệ hai cấp, ghim giá lúc chốt, công bằng trong một phiên), §4.1–§4.2, §14.1–§14.3. Spec UI `docs/superpowers/specs/2026-09-23-grading-ui-rebuild-design.md` (bản ở cây chính) mục 3.1, 3.2 — dòng *"Cần từ API"*. Nền: PR #48 (3b, mô hình dữ liệu).

## Global Constraints

- §2.1: *"Model không bao giờ đặt `deduction`."* Mức trừ đọc từ bảng giá; `score_computation.score` do code tính.
- §2.1 số học: `điểm = clamp(0, tối_đa, tối_đa − Σ_C min(C.max, Σ mức_trừ quy về C))` — `computeDeductionScore` đã có, dùng nguyên.
- §2.2: *"Mỗi lần sửa giá sinh một phiên bản bảng giá"*; *"Mỗi lượt tính lại là một dòng MỚI"*; *"Phiên chưa chốt đi theo bảng giá hiện hành"*; *"Lúc chốt, phiên chụp phiên bản bảng giá đang dùng"*; *"Phiên đã chốt chỉ đổi khi giảng viên chủ động bấm … mỗi bài bị đổi điểm có một dòng `audit_log`"*.
- §2.2 công bằng: *"Luật bằng lời thêm vào khi phiên đã chấm thì hoặc chấm lại mọi bài liên quan của phiên, hoặc không áp cho phiên đó. Không có trạng thái nửa vời."*
- §2.2 ngoại lệ: *"Lỗi — Mọi lượt tính lại GIỮ việc bỏ lỗi đó"*; *"Bài — Chấm tay … Không lượt tính lại nào đổi điểm bài đó nữa"*; cả hai là một dòng `teacher_review`, *"không sinh luật nào"*.
- §14.2: *"`ai_total_score` … không bao giờ là điểm hiện tại của đường `investigator`"*; *"Đường `one_shot` giữ hành vi hôm nay."*
- §14.3: *"Ai gây ra lượt tính lại quyết bước chuyển"* — thao tác trên MỘT bài → `teacher_reviewed`; chỉ lượt tính lại tầng luật mới được đưa bài `flagged ⇄ auto_approved`; bài `teacher_reviewed` chưa chốt đổi điểm theo tầng luật nhưng giữ trạng thái. Mọi bước chuyển là UPDATE có điều kiện trên trạng thái hiện tại.
- §2.1 khoá theo giảng viên: luật, giá của người này **không bao giờ** áp vào bài người kia (T-POL-8) — mọi truy vấn lọc `teacher_id`, mọi thao tác kiểm chủ sở hữu. `teacher_review.error_rule_id` và `score_computation.price_table_version_id` là khoá ngoại trơn (M3 của 3b): service kiểm thay.
- Không phụ thuộc vòng giữa service cùng module (CLAUDE.md).
- DB: chỉ DB local qua wrapper `db.sh` (đọc `apps/api/.env.test`, dừng nếu không phải localhost). Không đụng Supabase.
- Comment tiếng Việt; commit tiếng Việt kiểu conventional + dòng `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`. Plan commit được; spec thì không.

## Phạm vi — cái gì KHÔNG ở plan này

| Việc | Ở đâu |
|---|---|
| Ghi `grading_attempt` từ `investigate()` thật, nối đường chấm, chấm lại bài chưa có điểm, luật mồi, *luật còn thiếu* do agent báo (tạo dòng `error_rule` `proposed`) | 3d |
| Rút mẫu, `audit_pending` có người ghi, nhận xét kiểm mẫu | 3e |
| Màn Bảng lỗi, sửa luật, hồ sơ bài; sinh lại `schema.d.ts` | 3f |
| Bậc 3 (chạy lại công cụ cho cả phiên) và bậc 4 (chấm lại bằng model) | bước 5 / sau |
| Phản biện (`refuted`; chiều `include` có tác dụng với lỗi bị bác bỏ) | bước 6 — ở 3c `include` chỉ gỡ một `exclude` trước đó |

## Review Focus

1. **Giá của một luật đổi trong lúc một phiên khác của cùng giảng viên đã chốt** → phiên chưa chốt tính lại ngay, phiên đã chốt KHÔNG đổi và không sinh `audit_log` nào (T-PIN-1). Test: Task 4 + Task 9.
2. **Giảng viên lưu giá đúng lúc worker đang tính lượt đầu của một bài** → bài đó không được giữ điểm theo giá cũ: lượt tính đầu và lượt tính lại tầng luật của cùng giảng viên xếp hàng qua một khoá. Test: Task 4 (ca khoá).
3. **Giảng viên bỏ một lỗi rồi sau đó đổi giá của CHÍNH luật đó** → điểm bài đó không đổi; đổi giá luật khác trong bài vẫn áp; bài chấm tay không lượt tính nào đổi (T-EXC-1). Test: Task 2 + Task 7.
4. **Luật bằng lời thêm giữa lô** (vài bài đã chấm không thấy nó, các bài chấm sau thấy) → KHÔNG bài nào của phiên xét nó, không bài nào bị kéo sang gắn cờ, và lượt tính nêu nó là *không xét* (T-FAIR-1). Test: Task 2 + Task 4.
5. **Lượt tính lại tầng luật làm một bài tự quyết trượt công thức** (vừa thêm một luật máy kiểm có lỗi mới chưa có giá) → bài về `flagged_for_review`; bài đang kiểm mẫu bị huỷ khỏi mẫu (T-DEMOTE-1); bài `teacher_reviewed` giữ trạng thái. Test: Task 4.

---

## File Structure

| File | Trách nhiệm |
|---|---|
| `apps/api/src/database/migrations/1789470000000-ScoreReasonCriterionWaiver.ts` (mới) | Thêm lý do tính lại `criterion_waiver` |
| `apps/api/src/grading/scoring/stored-investigation.ts` (mới) | Hợp đồng JSON của `grading_attempt.investigation` (3d ghi, 3c đọc) |
| `apps/api/src/grading/scoring/score-core.ts` (mới, thuần) | `computeScore()` |
| `apps/api/src/grading/scoring/score-inputs.ts` (mới) | Đọc từ DB mọi đầu vào của `computeScore()`; khoá theo giảng viên |
| `apps/api/src/grading/scoring/current-score.ts` (mới, thuần) | Hàm *điểm hiện tại* §14.2 |
| `apps/api/src/grading/scoring/score.service.ts` (mới) | Chỗ duy nhất ghi `score_computation` và dời trạng thái sau lượt tính |
| `apps/api/src/grading/lifecycle/advance.ts` (mới) | UPDATE trạng thái có điều kiện dùng chung |
| `apps/api/src/grading/rules/rule-input.ts` (mới, thuần) | Kiểm đầu vào của một luật (khoá, tiêu chí, bốn mẫu điều kiện), mức trừ |
| `apps/api/src/grading/rules/error-rule.service.ts`, `price.service.ts`, `criterion-waiver.service.ts` (mới) | Luật, giá, đánh dấu tiêu chí |
| `apps/api/src/grading/review/error-exception.service.ts` (mới) | Bỏ / giữ lỗi cho riêng một bài, chấm tay |
| `apps/api/src/grading/rules/rules.controller.ts` + `rules/dto/*.ts`, `review/dto/*.ts` (mới) | Route cho 3f |
| `apps/api/src/grading/teacher-review.service.ts` (sửa) | Chốt điểm đường điều tra, ghim giá; đường duyệt một-phát từ chối bài đường điều tra |
| `apps/api/src/grading/grading.service.ts` (sửa) | `listForSession` trả điểm hiện tại |
| `apps/api/test/helpers/grading-seed.ts` (sửa), `investigator-seed.ts` (mới) | Dựng kết quả + lượt chấm đường điều tra cho e2e |

---

### Task 0: Workspace, DB

- [ ] **Step 1:** Nhánh `feature/grading-rules-prices`, tách từ `feature/grading-data-model` (PR #48, `43b1444`).
- [ ] **Step 2:** Workspace `.superpowers/sdd/2026-09-27-grading-rules-prices/`; chép `db.sh` (wrapper của 3b) vào đó; mở ledger.
- [ ] **Step 3:** Docker (`cine-postgres-1`, `cine-minio-1`, `cine-redis-1`), dọn tiến trình node jest/nest mồ côi, rồi `bash …/db.sh pnpm --filter api migration:run` — Expected: *No migrations are pending*.

---

### Task 1: Lý do tính lại `criterion_waiver`

**Files:** Create `apps/api/src/database/migrations/1789470000000-ScoreReasonCriterionWaiver.ts`; Modify `apps/api/src/grading/grading-model.types.ts` (`SCORE_COMPUTATION_REASONS`).

§14.3 kể *"gỡ đánh dấu không có luật trừ"* là một lượt tính lại tầng luật, nhưng enum `score_computation_reason` của §14.1 không có lý do cho nó. Thêm, thay vì mượn nhãn khác — nhãn sai là lịch sử sai.

- [ ] **Step 1: Migration.**

```ts
import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Lý do tính lại `criterion_waiver` (§14.3: đánh dấu / gỡ đánh dấu *"tiêu chí không có luật trừ"*
 * là một lượt tính lại tầng luật). §14.1 chưa kể nó trong enum; mượn nhãn khác là ghi sai lịch sử.
 */
export class ScoreReasonCriterionWaiver1789470000000 implements MigrationInterface {
  name = 'ScoreReasonCriterionWaiver1789470000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TYPE "examcollect"."score_computation_reason" ADD VALUE IF NOT EXISTS 'criterion_waiver'`);
  }

  public async down(): Promise<void> {
    throw new Error('ScoreReasonCriterionWaiver1789470000000: không hoàn được — Postgres không bỏ được giá trị enum');
  }
}
```

- [ ] **Step 2:** `SCORE_COMPUTATION_REASONS` thêm `'criterion_waiver'` ở cuối.
- [ ] **Step 3:** `bash …/db.sh pnpm --filter api migration:run`; `pnpm --filter api test:e2e -- entity-schema` → PASS.
- [ ] **Step 4:** Commit `feat(db): lý do tính lại criterion_waiver (§14.3)`.

---

### Task 2: Hợp đồng hồ sơ lượt chấm + lõi `computeScore()` (thuần)

**Files:** Create `apps/api/src/grading/scoring/stored-investigation.ts`, `score-core.ts`, test `score-core.spec.ts`.

**Interfaces — Produces:**
- `StoredInvestigation { version: 1; result: InvestigationResult; rulesSeen: {ruleKey, checkedBy}[]; modelCeiling: number }`, `readStoredInvestigation(json: unknown): StoredInvestigation` (ném `Error` khi sai khuôn).
- `RuleSnapshot { ruleId; revisionId; ruleKey; criterionKey; predicate: RulePredicate | null; deductionHundredths: number | null }`.
- `computeScore(input: ScoreCoreInput): ScoreCoreOutput`:
  - `ScoreCoreInput { stored; bundleCases: {name, group}[]; rubric: {key, maxHundredths}[]; rules: RuleSnapshot[]; sessionModelRules: ReadonlySet<string>; waivedCriteria: string[]; exceptions: ReadonlyMap<string /*ruleId*/, 'exclude' | 'include'>; theta: number }` — `sessionModelRules` = `rule_key` mà MỌI lượt chấm hiện hành của phiên đều đã thấy dưới dạng `model` (Task 3 đọc).
  - `ScoreCoreOutput { outcome: 'auto' | 'flagged' | 'ungradable'; ungradable: {class, reason} | null; scoreHundredths: number | null; breakdown: ScoreBreakdown }`.
- `ScoreBreakdown { errors: BreakdownError[]; perCriterion: {key, maxHundredths, deductedHundredths, capped}[]; caseFlags; errorFlags; confidence: number | null; mismatchedRules: {ruleId, ruleKey, criterionKey}[]; notConsidered: {ruleId, ruleKey}[] }`, `BreakdownError { ruleId; revisionId; ruleKey; criterionKey; source; toolCallIds; deductionHundredths: number | null; counted: 'counted' | 'excluded' | 'unpriced' }`.

Ngoại lệ `exclude` áp SAU `decide()`: lỗi vẫn nằm trong hồ sơ với `counted = 'excluded'` và không trừ; `decide()` vẫn chạy trên đủ luật, vì bỏ luật khỏi bảng thì lỗi máy quyết của nó biến mất khỏi hồ sơ và tiêu chí của nó có thể trông như *"không có luật nào"*. Kết cục `outcome` của một bài có ngoại lệ không quyết trạng thái — bài đó đã `teacher_reviewed` (§14.3).

- [ ] **Step 1: Test đỏ.**

```ts
// apps/api/src/grading/scoring/score-core.spec.ts
import { readFileCall, resultWith, runTestsCall } from '../decision/testing/result';
import { computeScore, RuleSnapshot, ScoreCoreInput } from './score-core';
import { readStoredInvestigation, StoredInvestigation } from './stored-investigation';

const CASES = [
  { name: 'c1', group: 'co_ban' },
  { name: 'c2', group: 'bien' },
];
const RUBRIC = [
  { key: 'tinh_dung', maxHundredths: 600 },
  { key: 'trinh_bay', maxHundredths: 400 },
];

function rule(over: Partial<RuleSnapshot> & { ruleKey: string }): RuleSnapshot {
  return {
    ruleId: `id-${over.ruleKey}`, revisionId: `rev-${over.ruleKey}`, criterionKey: 'tinh_dung',
    predicate: null, deductionHundredths: 100, ...over,
  };
}

const CALLS = [
  runTestsCall('t1', null, [
    { name: 'c1', group: 'co_ban', status: 'pass' },
    { name: 'c2', group: 'bien', status: 'fail' },
  ]),
  readFileCall('r1', 'bai-nop/main.cpp'),
];

/** Bài: nhóm `bien` fail (máy quyết), model báo `ten_bien` (luật bằng lời), đã đọc file bài nộp. */
function stored(over: Partial<StoredInvestigation> = {}): StoredInvestigation {
  return {
    version: 1,
    result: resultWith({ calls: CALLS, errors: [{ ruleKey: 'ten_bien', toolCallIds: ['r1'] }] }),
    rulesSeen: [
      { ruleKey: 'sai_bien', checkedBy: 'machine' },
      { ruleKey: 'ten_bien', checkedBy: 'model' },
    ],
    modelCeiling: 1,
    ...over,
  };
}

const BIEN = rule({ ruleKey: 'sai_bien', predicate: { kind: 'test_group_failed', group: 'bien' }, deductionHundredths: 150 });
const TEN = rule({ ruleKey: 'ten_bien', criterionKey: 'trinh_bay', deductionHundredths: 50 });
const LATE = rule({ ruleKey: 'chu_thich_sai', criterionKey: 'trinh_bay', deductionHundredths: 25 });

function input(over: Partial<ScoreCoreInput> = {}): ScoreCoreInput {
  return {
    stored: stored(),
    bundleCases: CASES,
    rubric: RUBRIC,
    rules: [BIEN, TEN],
    sessionModelRules: new Set(['ten_bien']),
    waivedCriteria: [],
    exceptions: new Map(),
    theta: 0.85,
    ...over,
  };
}

describe('computeScore', () => {
  it('trừ theo bảng giá, ánh xạ rule_key sang uuid và bản sửa (T-KEY-1); confidence (150·1 + 50·0,5)/200 ≥ θ → tự quyết', () => {
    const out = computeScore(input());
    expect(out.outcome).toBe('auto');
    expect(out.scoreHundredths).toBe(1000 - 150 - 50);
    expect(out.breakdown.errors.map((e) => [e.ruleId, e.revisionId, e.counted])).toEqual([
      ['id-sai_bien', 'rev-sai_bien', 'counted'],
      ['id-ten_bien', 'rev-ten_bien', 'counted'],
    ]);
  });

  it('đổi giá thì đổi điểm, không cần gì khác (bậc 1, T-TIER-1)', () => {
    const out = computeScore(input({ rules: [{ ...BIEN, deductionHundredths: 300 }, TEN] }));
    expect(out.scoreHundredths).toBe(1000 - 300 - 50);
  });

  it('luật máy kiểm MỚI được đo trên kết quả đã lưu, không cần model (bậc 2, T-TIER-2)', () => {
    const out = computeScore(input({ stored: stored({ rulesSeen: [{ ruleKey: 'ten_bien', checkedBy: 'model' }] }) }));
    expect(out.breakdown.errors.map((e) => e.ruleKey)).toContain('sai_bien');
  });

  it('luật BẰNG LỜI có sau lượt chấm → không xét, nêu ra, và KHÔNG kéo bài sang gắn cờ (T-FAIR-1)', () => {
    const out = computeScore(input({ rules: [BIEN, TEN, LATE] }));
    expect(out.breakdown.notConsidered).toEqual([{ ruleId: 'id-chu_thich_sai', ruleKey: 'chu_thich_sai' }]);
    expect(out.breakdown.caseFlags.map((f) => f.code)).not.toContain('criterion_untouched');
    expect(out.outcome).toBe('auto');
    expect(out.scoreHundredths).toBe(computeScore(input()).scoreHundredths);
  });

  it('bài NÀY đã thấy luật lời, nhưng không phải mọi bài của phiên → vẫn không xét (tất cả hoặc không, §2.2)', () => {
    const saw = stored({
      rulesSeen: [...stored().rulesSeen, { ruleKey: 'chu_thich_sai', checkedBy: 'model' }],
      result: resultWith({
        calls: CALLS,
        errors: [{ ruleKey: 'ten_bien', toolCallIds: ['r1'] }, { ruleKey: 'chu_thich_sai', toolCallIds: ['r1'] }],
      }),
    });
    const out = computeScore(input({ stored: saw, rules: [BIEN, TEN, LATE] }));
    expect(out.breakdown.notConsidered.map((r) => r.ruleKey)).toEqual(['chu_thich_sai']);
    expect(out.breakdown.errors.map((e) => e.ruleKey)).not.toContain('chu_thich_sai');
    expect(out.scoreHundredths).toBe(800);
  });

  it('luật trỏ tiêu chí không có trong rubric → bị loại và nêu ra, KHÔNG ném (§14.1)', () => {
    const out = computeScore(input({ rules: [BIEN, TEN, rule({ ruleKey: 'la', criterionKey: 'khong_co', deductionHundredths: 999 })] }));
    expect(out.breakdown.mismatchedRules).toEqual([{ ruleId: 'id-la', ruleKey: 'la', criterionKey: 'khong_co' }]);
    expect(out.scoreHundredths).toBe(800);
  });

  it('bỏ một lỗi cho riêng bài này → không trừ, vẫn hiện trong hồ sơ là "excluded" (§2.2)', () => {
    const out = computeScore(input({ exceptions: new Map([['id-sai_bien', 'exclude']]) }));
    expect(out.scoreHundredths).toBe(1000 - 50);
    expect(out.breakdown.errors.find((e) => e.ruleKey === 'sai_bien')?.counted).toBe('excluded');
  });

  it('T-EXC-1: lỗi đã bỏ → đổi giá CHÍNH luật đó không đổi điểm; đổi giá luật khác vẫn áp', () => {
    const exceptions = new Map([['id-sai_bien', 'exclude' as const]]);
    expect(computeScore(input({ exceptions, rules: [{ ...BIEN, deductionHundredths: 500 }, TEN] })).scoreHundredths).toBe(950);
    expect(computeScore(input({ exceptions, rules: [BIEN, { ...TEN, deductionHundredths: 75 }] })).scoreHundredths).toBe(925);
  });

  it('"include" (gỡ một "exclude" trước đó) → lỗi tính lại vào điểm (T-EXC-2)', () => {
    const out = computeScore(input({ exceptions: new Map([['id-sai_bien', 'include']]) }));
    expect(out.scoreHundredths).toBe(800);
  });

  it('luật chưa có giá: không trừ, gắn cờ đúng lỗi đó, bài không tự quyết (T-POL-2)', () => {
    const out = computeScore(input({ rules: [{ ...BIEN, deductionHundredths: null }, TEN] }));
    expect(out.breakdown.errors.find((e) => e.ruleKey === 'sai_bien')?.counted).toBe('unpriced');
    expect(out.breakdown.errorFlags).toEqual([{ ruleKey: 'sai_bien', code: 'unpriced' }]);
    expect(out.outcome).toBe('flagged');
  });

  it('lượt chấm dưới sàn → ungradable, không có điểm', () => {
    const out = computeScore(input({ bundleCases: [] }));
    expect(out.outcome).toBe('ungradable');
    expect(out.scoreHundredths).toBeNull();
  });
});

describe('readStoredInvestigation', () => {
  it('nhận đúng khuôn, từ chối khuôn lạ', () => {
    expect(readStoredInvestigation(JSON.parse(JSON.stringify(stored()))).version).toBe(1);
    expect(() => readStoredInvestigation({ version: 2 })).toThrow(/hồ sơ lượt chấm/);
    expect(() => readStoredInvestigation(null)).toThrow(/hồ sơ lượt chấm/);
  });
});
```

Run: `pnpm --filter api test -- score-core` — Expected: FAIL (module không có).

- [ ] **Step 2: Hợp đồng.**

```ts
// apps/api/src/grading/scoring/stored-investigation.ts
import type { InvestigationResult } from '../investigator/types';

/**
 * Hợp đồng của cột `grading_attempt.investigation` với đường `investigator` — 3d ghi, 3c đọc.
 * Đổi hình dạng là một migration DỮ LIỆU: lượt chấm bất biến, nên hồ sơ cũ sống mãi ở phiên bản
 * cũ. `rulesSeen` và `modelCeiling` đi kèm vì lượt tính lại (bậc 1, 2) gọi lại `decide()` trên hồ
 * sơ đã lưu, và hai thứ đó không suy lại được sau này.
 */
export interface StoredInvestigation {
  version: 1;
  result: InvestigationResult;
  /** Bảng lỗi model đã thấy lúc điều tra (review I3 của 3a; T-FAIR-1). */
  rulesSeen: { ruleKey: string; checkedBy: 'machine' | 'model' }[];
  /** Trần thấp nhất của các bậc model đã trả lời (§4.2). */
  modelCeiling: number;
}

export function readStoredInvestigation(json: unknown): StoredInvestigation {
  const o = json as Partial<StoredInvestigation> | null;
  const ok =
    o !== null && typeof o === 'object' && o.version === 1 &&
    o.result !== null && typeof o.result === 'object' && (o.result.kind === 'verdict' || o.result.kind === 'ungradable') &&
    Array.isArray(o.rulesSeen) && typeof o.modelCeiling === 'number';
  if (!ok) throw new Error('hồ sơ lượt chấm không đúng khuôn StoredInvestigation v1');
  return o as StoredInvestigation;
}
```

- [ ] **Step 3: Lõi.**

```ts
// apps/api/src/grading/scoring/score-core.ts
import { decide } from '../decision/decide';
import { isMachineChecked } from '../decision/predicates';
import type { CaseFlag, Decision, ErrorFlag, ErrorRule, RulePredicate, VerdictSource } from '../decision/types';
import { computeDeductionScore } from './deduction-score';
import type { StoredInvestigation } from './stored-investigation';

/** Một luật ĐANG DÙNG của giảng viên: bản sửa hiện hành, giá ở phiên bản bảng giá của lượt tính. */
export interface RuleSnapshot {
  ruleId: string;
  revisionId: string;
  ruleKey: string;
  criterionKey: string;
  predicate: RulePredicate | null;
  deductionHundredths: number | null;
}

export interface ScoreCoreInput {
  stored: StoredInvestigation;
  bundleCases: { name: string; group: string }[];
  rubric: { key: string; maxHundredths: number }[];
  rules: RuleSnapshot[];
  /** `rule_key` mà MỌI lượt chấm hiện hành của phiên đã thấy dưới dạng `model` (§2.2 *"tất cả hoặc không"*). */
  sessionModelRules: ReadonlySet<string>;
  waivedCriteria: string[];
  /** ruleId → ngoại lệ cấp lỗi MỚI NHẤT của bài này (§2.2). */
  exceptions: ReadonlyMap<string, 'exclude' | 'include'>;
  theta: number;
}

export interface BreakdownError {
  ruleId: string;
  revisionId: string;
  ruleKey: string;
  criterionKey: string;
  source: VerdictSource;
  toolCallIds: string[];
  deductionHundredths: number | null;
  /** `excluded`: giảng viên bỏ lỗi này cho riêng bài này; `unpriced`: luật chưa có giá. */
  counted: 'counted' | 'excluded' | 'unpriced';
}

export interface ScoreBreakdown {
  errors: BreakdownError[];
  perCriterion: { key: string; maxHundredths: number; deductedHundredths: number; capped: boolean }[];
  caseFlags: CaseFlag[];
  errorFlags: ErrorFlag[];
  confidence: number | null;
  /** Luật trỏ tiêu chí không có trong rubric của bài — bị loại, nêu ở trang kiến thức (§14.1). */
  mismatchedRules: { ruleId: string; ruleKey: string; criterionKey: string }[];
  /** Luật model phải phán mà không phải mọi bài của phiên đều đã thấy — không xét (§2.2, T-FAIR-1). */
  notConsidered: { ruleId: string; ruleKey: string }[];
}

export interface ScoreCoreOutput {
  outcome: Decision['outcome'];
  ungradable: Decision['ungradable'];
  scoreHundredths: number | null;
  breakdown: ScoreBreakdown;
}

/**
 * Điểm là HÀM của chẩn đoán, bảng giá, rubric (§2.2) — không đọc DB, không gọi model hay sandbox.
 * Gọi lại được trên hồ sơ đã lưu mỗi khi giá, luật máy kiểm, đánh dấu tiêu chí hay ngoại lệ đổi.
 */
export function computeScore(input: ScoreCoreInput): ScoreCoreOutput {
  const rubricKeys = new Set(input.rubric.map((c) => c.key));

  // §14.1: luật trỏ tiêu chí không khớp rubric thì không áp được trần — loại, nêu ra. `decide()`
  // ném với luật như vậy (M7 của 3a); một lượt tính không được chết vì giảng viên sửa một luật.
  const mismatched = input.rules.filter((r) => !rubricKeys.has(r.criterionKey));
  const matching = input.rules.filter((r) => rubricKeys.has(r.criterionKey));
  // T-FAIR-1: luật model phải PHÁN (bằng lời, hay có predicate mà máy chưa đo — Q1) chỉ xét khi
  // mọi bài của phiên đều đã thấy nó. Luật máy kiểm thì đo lại trên kết quả đã lưu (bậc 2).
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
  });

  const excludedKeys = new Set(used.filter((r) => input.exceptions.get(r.ruleId) === 'exclude').map((r) => r.ruleKey));
  const common = {
    caseFlags: decision.caseFlags,
    errorFlags: decision.errorFlags.filter((f) => !excludedKeys.has(f.ruleKey)),
    confidence: decision.confidence,
    mismatchedRules: mismatched.map((r) => ({ ruleId: r.ruleId, ruleKey: r.ruleKey, criterionKey: r.criterionKey })),
    notConsidered: notConsidered.map((r) => ({ ruleId: r.ruleId, ruleKey: r.ruleKey })),
  };
  if (decision.outcome === 'ungradable') {
    return { outcome: 'ungradable', ungradable: decision.ungradable, scoreHundredths: null, breakdown: { errors: [], perCriterion: [], ...common } };
  }

  const errors: BreakdownError[] = decision.errors.map((e) => {
    const r = byKey.get(e.ruleKey)!;
    return {
      ruleId: r.ruleId,
      revisionId: r.revisionId,
      ruleKey: r.ruleKey,
      criterionKey: r.criterionKey,
      source: e.source,
      toolCallIds: e.toolCallIds,
      deductionHundredths: r.deductionHundredths,
      counted: excludedKeys.has(r.ruleKey) ? 'excluded' : r.deductionHundredths === null ? 'unpriced' : 'counted',
    };
  });
  const score = computeDeductionScore(
    input.rubric,
    used.map((r) => ({ ruleKey: r.ruleKey, criterionKey: r.criterionKey, deductionHundredths: r.deductionHundredths })),
    errors.filter((e) => e.counted !== 'excluded').map((e) => e.ruleKey),
  );
  return {
    outcome: decision.outcome,
    ungradable: null,
    scoreHundredths: score.scoreHundredths,
    breakdown: { errors, perCriterion: score.perCriterion, ...common },
  };
}

function toErrorRule(r: RuleSnapshot): ErrorRule {
  return { ruleKey: r.ruleKey, criterionKey: r.criterionKey, deductionHundredths: r.deductionHundredths, predicate: r.predicate };
}
```

- [ ] **Step 4:** `pnpm --filter api test -- score-core` → PASS (12 ca). Nếu một ca về `outcome` đỏ vì `decide()` gắn một cờ fixture không định (vd. `criterion_without_rules`), sửa FIXTURE, không sửa lõi; ghi ruling.
- [ ] **Step 5:** Commit `feat(scoring): computeScore — điểm là hàm của chẩn đoán, giá, rubric; luật lệch tiêu chí bị loại, luật lời không phải mọi bài đã thấy thì không xét, ngoại lệ cấp lỗi (§2.2, §14.1, T-KEY-1, T-FAIR-1, T-EXC-1)`.

---

### Task 3: Đầu vào từ DB, khoá theo giảng viên, UPDATE có điều kiện dùng chung

**Files:** Create `apps/api/src/grading/scoring/score-inputs.ts`, `apps/api/src/grading/lifecycle/advance.ts`; Modify `apps/api/src/grading/teacher-review.service.ts` (thân `advance` gọi hàm chung); Modify `apps/api/test/helpers/grading-seed.ts` (`seedResult` nhận `pipeline`; `seedSession` nhận `teacherId`, `startHoursAgo`); Create `apps/api/test/helpers/investigator-seed.ts`.

**Interfaces — Produces:**
- `advanceStatus(m: EntityManager, resultId, from: GradingResultStatus[], to: GradingResultStatus, extra = {}): Promise<boolean>`.
- `lockTeacherScoring(m: EntityManager, teacherId: string): Promise<void>` — `pg_advisory_xact_lock`, nhả khi transaction kết thúc.
- `teacherOfResult(m, resultId): Promise<string>`.
- `currentPriceVersion(m, teacherId): Promise<{ id: string; version: number } | null>`.
- `latestComputationRow(m, resultId): Promise<{ id: string; score: string; priceTableVersionId: string | null; breakdown: ScoreBreakdown } | null>`.
- `loadRuleSnapshots(m, teacherId, priceVersionId: string | null): Promise<RuleSnapshot[]>` — luật `active` của giảng viên, bản sửa hiện hành, giá ở phiên bản đã cho.
- `loadSessionModelRules(m, sessionId): Promise<Set<string>>`.
- `loadScoreContext(m, resultId): Promise<ScoreContext>`.
- Helper e2e: `seedResult(ds, ctx, pipeline = 'one_shot')`; `seedSession(ds, label, { deliverableType?, language?, teacherId?, startHoursAgo? })` — `teacherId` dùng lại giảng viên có sẵn (phiên thứ hai của cùng người), `startHoursAgo` (mặc định 1) lùi khung giờ để không vướng luật cách ≥ 30 phút giữa hai phiên của một giảng viên (migration `1789350000000`); `seedInvestigatorSession`, `seedRule`, `seedPrices`, `storedWith`, `seedInvestigatorResult`.

- [ ] **Step 1: `advance.ts`; `TeacherReviewService.advance` giữ chữ ký, thân thành `return advanceStatus(manager, resultId, from, to, extra);`.**

```ts
// apps/api/src/grading/lifecycle/advance.ts
import { EntityManager } from 'typeorm';
import { GradingResultEntity, GradingResultStatus } from '../entities/grading-result.entity';

type AdvanceExtra = Partial<
  Pick<GradingResultEntity, 'finalizedBy' | 'finalizedAt' | 'finalizedComputationId' | 'auditSampled' | 'auditSampledAt' | 'flagForReview'>
>;

/**
 * Bước chuyển trạng thái của MỘT kết quả — UPDATE có điều kiện trên trạng thái hiện tại (§14.3).
 * `false` = dòng không ở trạng thái mong đợi, người gọi dừng. Trigger vòng đời là chỗ ÉP bảng
 * chuyển; hàm này không tự kiểm bảng.
 */
export async function advanceStatus(
  m: EntityManager,
  resultId: string,
  from: GradingResultStatus[],
  to: GradingResultStatus,
  extra: AdvanceExtra = {},
): Promise<boolean> {
  const updated = await m
    .createQueryBuilder()
    .update(GradingResultEntity)
    .set({ status: to, ...extra })
    .where('id = :id', { id: resultId })
    .andWhere('status IN (:...from)', { from })
    .execute();
  return (updated.affected ?? 0) > 0;
}
```

- [ ] **Step 2: `score-inputs.ts`.**

```ts
// apps/api/src/grading/scoring/score-inputs.ts
import { EntityManager } from 'typeorm';
import type { RulePredicate } from '../decision/types';
import { parseHundredths } from './hundredths';
import type { RuleSnapshot, ScoreBreakdown } from './score-core';
import { readStoredInvestigation, StoredInvestigation } from './stored-investigation';

/**
 * Mọi lượt tính của MỘT giảng viên xếp hàng qua khoá này, tới hết transaction. Không có nó, một
 * lượt tính đầu đọc bảng giá cũ trong lúc một lượt sửa giá chưa commit và bị lượt đó bỏ qua (bài
 * còn `ai_grading`) — bài giữ điểm theo giá cũ mãi (Review Focus 2).
 */
export async function lockTeacherScoring(m: EntityManager, teacherId: string): Promise<void> {
  await m.query(`SELECT pg_advisory_xact_lock(hashtextextended('score_computation:' || $1::text, 0))`, [teacherId]);
}

export async function teacherOfResult(m: EntityManager, resultId: string): Promise<string> {
  const [row] = await m.query(
    `SELECT es.teacher_id FROM examcollect.grading_result g
       JOIN examcollect.submission s ON s.id = g.submission_id
       JOIN examcollect.exam_session es ON es.id = s.exam_session_id
      WHERE g.id = $1`,
    [resultId],
  );
  if (!row) throw new Error(`không có kết quả chấm ${resultId}`);
  return row.teacher_id;
}

export async function currentPriceVersion(m: EntityManager, teacherId: string): Promise<{ id: string; version: number } | null> {
  const [row] = await m.query(
    `SELECT id, version FROM examcollect.price_table_version WHERE teacher_id = $1 ORDER BY version DESC LIMIT 1`,
    [teacherId],
  );
  return row ? { id: row.id, version: row.version } : null;
}

export async function latestComputationRow(
  m: EntityManager,
  resultId: string,
): Promise<{ id: string; score: string; priceTableVersionId: string | null; breakdown: ScoreBreakdown } | null> {
  const [row] = await m.query(
    `SELECT id, score, price_table_version_id, breakdown FROM examcollect.score_computation
      WHERE grading_result_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [resultId],
  );
  return row ? { id: row.id, score: row.score, priceTableVersionId: row.price_table_version_id, breakdown: row.breakdown } : null;
}

/** Luật ĐANG DÙNG của giảng viên, giá ở `priceVersionId` (null = chưa có bảng giá: mọi luật chưa giá). */
export async function loadRuleSnapshots(m: EntityManager, teacherId: string, priceVersionId: string | null): Promise<RuleSnapshot[]> {
  const rows: { rule_id: string; revision_id: string; rule_key: string; criterion_key: string; predicate: RulePredicate | null; deduction: string | null }[] =
    await m.query(
      `SELECT r.id AS rule_id, v.id AS revision_id, r.rule_key, v.criterion_key, v.predicate, p.deduction
         FROM examcollect.error_rule r
         JOIN examcollect.error_rule_revision v ON v.id = r.current_revision_id
         LEFT JOIN examcollect.rule_price p ON p.error_rule_id = r.id AND p.price_table_version_id = $2
        WHERE r.teacher_id = $1 AND r.state = 'active'
        ORDER BY r.rule_key`,
      [teacherId, priceVersionId],
    );
  return rows.map((r) => ({
    ruleId: r.rule_id,
    revisionId: r.revision_id,
    ruleKey: r.rule_key,
    criterionKey: r.criterion_key,
    predicate: r.predicate,
    deductionHundredths: r.deduction === null ? null : parseHundredths(r.deduction),
  }));
}

/**
 * `rule_key` mà MỌI lượt chấm hiện hành (`graded`) của phiên đã thấy dưới dạng `model` — §2.2
 * *"tất cả hoặc không"*: một luật lời thêm giữa lô thì bài chấm trước không thấy nó, nên không bài
 * nào của phiên xét nó. Chấm lại một bài (3d) sau khi thêm luật cũng không kéo luật đó vào phiên.
 */
export async function loadSessionModelRules(m: EntityManager, sessionId: string): Promise<Set<string>> {
  const rows: { rule_key: string }[] = await m.query(
    `WITH att AS (
       SELECT a.id, a.investigation
         FROM examcollect.grading_result g
         JOIN examcollect.submission s ON s.id = g.submission_id
         JOIN examcollect.grading_attempt a ON a.id = g.current_attempt_id AND a.outcome = 'graded'
        WHERE s.exam_session_id = $1 AND g.pipeline = 'investigator')
     SELECT r ->> 'ruleKey' AS rule_key
       FROM att CROSS JOIN LATERAL jsonb_array_elements(att.investigation -> 'rulesSeen') r
      WHERE r ->> 'checkedBy' = 'model'
      GROUP BY 1
     HAVING count(DISTINCT att.id) = (SELECT count(*) FROM att)`,
    [sessionId],
  );
  return new Set(rows.map((r) => r.rule_key));
}

export interface ScoreContext {
  resultId: string;
  teacherId: string;
  sessionId: string;
  pipeline: 'one_shot' | 'investigator';
  status: string;
  ungradableClass: 'system' | 'submission' | null;
  rubricId: string;
  attemptId: string | null;
  stored: StoredInvestigation | null;
  bundleId: string | null;
  bundleCases: { name: string; group: string }[];
  rubric: { key: string; maxHundredths: number }[];
  waivedCriteria: string[];
  exceptions: Map<string, 'exclude' | 'include'>;
  hasManualScore: boolean;
}

export async function loadScoreContext(m: EntityManager, resultId: string): Promise<ScoreContext> {
  const [row] = await m.query(
    `SELECT g.pipeline, g.status, g.ungradable_class, g.rubric_id_version, g.current_attempt_id,
            s.exam_session_id, es.teacher_id, es.test_bundle_id,
            a.outcome AS attempt_outcome, a.investigation
       FROM examcollect.grading_result g
       JOIN examcollect.submission s ON s.id = g.submission_id
       JOIN examcollect.exam_session es ON es.id = s.exam_session_id
       LEFT JOIN examcollect.grading_attempt a ON a.id = g.current_attempt_id
      WHERE g.id = $1`,
    [resultId],
  );
  if (!row) throw new Error(`không có kết quả chấm ${resultId}`);
  const rubric: { key: string; max_points: string }[] = await m.query(
    `SELECT key, max_points FROM examcollect.rubric_criterion WHERE rubric_id = $1 ORDER BY sort_order, created_at, key`,
    [row.rubric_id_version],
  );
  const cases: { case_key: string; group: string }[] = row.test_bundle_id
    ? await m.query(
        `SELECT case_key, "group" FROM examcollect.grading_test_case
          WHERE bundle_id = $1 AND auto_dropped_reason IS NULL ORDER BY case_key`,
        [row.test_bundle_id],
      )
    : [];
  const waivers: { criterion_key: string }[] = await m.query(
    `SELECT criterion_key FROM examcollect.criterion_waiver WHERE rubric_id = $1 AND revoked_at IS NULL`,
    [row.rubric_id_version],
  );
  // Ngoại lệ cấp lỗi MỚI NHẤT cho từng luật của bài này thắng (§2.2).
  const exceptionRows: { error_rule_id: string; direction: 'exclude' | 'include' }[] = await m.query(
    `SELECT DISTINCT ON (error_rule_id) error_rule_id, direction
       FROM examcollect.teacher_review
      WHERE grading_result_id = $1 AND kind = 'error_exception'
      ORDER BY error_rule_id, reviewed_at DESC, created_at DESC`,
    [resultId],
  );
  const [manual] = await m.query(
    `SELECT 1 FROM examcollect.teacher_review WHERE grading_result_id = $1 AND kind = 'manual_score' LIMIT 1`,
    [resultId],
  );
  return {
    resultId,
    teacherId: row.teacher_id,
    sessionId: row.exam_session_id,
    pipeline: row.pipeline,
    status: row.status,
    ungradableClass: row.ungradable_class,
    rubricId: row.rubric_id_version,
    attemptId: row.current_attempt_id,
    stored: row.attempt_outcome === 'graded' ? readStoredInvestigation(row.investigation) : null,
    bundleId: row.test_bundle_id,
    bundleCases: cases.map((c) => ({ name: c.case_key, group: c.group })),
    rubric: rubric.map((c) => ({ key: c.key, maxHundredths: parseHundredths(c.max_points) })),
    waivedCriteria: waivers.map((w) => w.criterion_key),
    exceptions: new Map(exceptionRows.map((e) => [e.error_rule_id, e.direction])),
    hasManualScore: Boolean(manual),
  };
}
```

- [ ] **Step 3: Helper e2e.** Trong `grading-seed.ts`: `seedResult(ds, ctx, pipeline: 'one_shot' | 'investigator' = 'one_shot')` thêm cột `pipeline` vào câu INSERT (trigger vòng đời chặn đổi `pipeline` sau INSERT). `seedSession(ds, label, opts)` thêm `opts.teacherId?: string` (có thì không gọi `seedTeacher`) và `opts.startHoursAgo = 1` — `start_time = now() - make_interval(hours => $n)`, `end_time = start_time + interval '2 hours'`. Rồi:

```ts
// apps/api/test/helpers/investigator-seed.ts
import { DataSource } from 'typeorm';
import { readFileCall, resultWith, runTestsCall } from '../../src/grading/decision/testing/result';
import type { StoredInvestigation } from '../../src/grading/scoring/stored-investigation';
import { seedCriterion, seedResult, SeedSession } from './grading-seed';

/**
 * Phiên đường điều tra: rubric hai tiêu chí (`tinh_dung` 6, `trinh_bay` 4), gói test hai ca
 * (`c1` nhóm `co_ban`, `c2` nhóm `bien`) ghim vào phiên.
 */
export async function seedInvestigatorSession(ds: DataSource, ctx: SeedSession): Promise<{ bundleId: string }> {
  await seedCriterion(ds, ctx.rubricId, 'tinh_dung', 6);
  await seedCriterion(ds, ctx.rubricId, 'trinh_bay', 4);
  const [b] = await ds.query(
    `INSERT INTO examcollect.grading_test_bundle (exam_session_id, version, origin, created_by, approved_by, approved_at)
     VALUES ($1, 1, 'teacher', $2, $2, now()) RETURNING id`,
    [ctx.sessionId, ctx.teacherId],
  );
  await ds.query(
    `INSERT INTO examcollect.grading_test_case (bundle_id, case_key, "group", input, expected_output)
     VALUES ($1, 'c1', 'co_ban', '1', '1'), ($1, 'c2', 'bien', '2', '2')`,
    [b.id],
  );
  await ds.query(`UPDATE examcollect.exam_session SET test_bundle_id = $2 WHERE id = $1`, [ctx.sessionId, b.id]);
  return { bundleId: b.id };
}

export async function seedRule(
  ds: DataSource,
  teacherId: string,
  ruleKey: string,
  criterionKey: string,
  predicate: object | null = null,
): Promise<{ ruleId: string; revisionId: string }> {
  const [r] = await ds.query(
    `INSERT INTO examcollect.error_rule (teacher_id, rule_key, origin, state) VALUES ($1, $2, 'teacher', 'active') RETURNING id`,
    [teacherId, ruleKey],
  );
  const [v] = await ds.query(
    `INSERT INTO examcollect.error_rule_revision (error_rule_id, revision, name, description, criterion_key, predicate, created_by)
     VALUES ($1, 1, $2, $2, $3, $4, $5) RETURNING id`,
    [r.id, ruleKey, criterionKey, predicate === null ? null : JSON.stringify(predicate), teacherId],
  );
  await ds.query(`UPDATE examcollect.error_rule SET current_revision_id = $2 WHERE id = $1`, [r.id, v.id]);
  return { ruleId: r.id, revisionId: v.id };
}

/** Phiên bản bảng giá mới của giảng viên với ĐÚNG các giá đã cho (luật không có dòng = chưa giá). */
export async function seedPrices(ds: DataSource, teacherId: string, prices: Record<string, string | null>): Promise<string> {
  const [{ next }] = await ds.query(
    `SELECT COALESCE(MAX(version), 0) + 1 AS next FROM examcollect.price_table_version WHERE teacher_id = $1`,
    [teacherId],
  );
  const [v] = await ds.query(
    `INSERT INTO examcollect.price_table_version (teacher_id, version, created_by) VALUES ($1, $2, $1) RETURNING id`,
    [teacherId, next],
  );
  for (const [ruleId, deduction] of Object.entries(prices)) {
    await ds.query(
      `INSERT INTO examcollect.rule_price (price_table_version_id, error_rule_id, teacher_id, deduction) VALUES ($1, $2, $3, $4)`,
      [v.id, ruleId, teacherId, deduction],
    );
  }
  return v.id;
}

/** Hồ sơ: nhóm `bien` fail (hay pass), model báo các lỗi `modelErrors`, đã đọc file bài nộp. */
export function storedWith(rulesSeen: StoredInvestigation['rulesSeen'], modelErrors: string[] = [], bienFails = true): StoredInvestigation {
  return {
    version: 1,
    result: resultWith({
      calls: [
        runTestsCall('t1', null, [
          { name: 'c1', group: 'co_ban', status: 'pass' },
          { name: 'c2', group: 'bien', status: bienFails ? 'fail' : 'pass' },
        ]),
        readFileCall('r1', 'bai-nop/main.cpp'),
      ],
      errors: modelErrors.map((ruleKey) => ({ ruleKey, toolCallIds: ['r1'] })),
    }),
    rulesSeen,
    modelCeiling: 1,
  };
}

/** Kết quả đường điều tra ở `ai_grading`, có lượt chấm `graded` mang hồ sơ đã cho. */
export async function seedInvestigatorResult(
  ds: DataSource,
  ctx: SeedSession,
  stored: StoredInvestigation,
): Promise<{ resultId: string; attemptId: string }> {
  const { resultId } = await seedResult(ds, ctx, 'investigator');
  const [a] = await ds.query(
    `INSERT INTO examcollect.grading_attempt (grading_result_id, attempt_no, outcome, investigation, triggered_by, finished_at)
     VALUES ($1, 1, 'graded', $2, $3, now()) RETURNING id`,
    [resultId, JSON.stringify(stored), ctx.teacherId],
  );
  await ds.query(`UPDATE examcollect.grading_result SET current_attempt_id = $2 WHERE id = $1`, [resultId, a.id]);
  return { resultId, attemptId: a.id };
}
```

- [ ] **Step 4:** `pnpm --filter api exec tsc --noEmit -p tsconfig.json` sạch; `pnpm --filter api test:e2e -- teacher-review bulk-review grading-lifecycle-v2 grading-freeze` PASS.
- [ ] **Step 5:** Commit `refactor(grading): UPDATE trạng thái có điều kiện dùng chung; đọc đầu vào lượt tính từ DB, khoá theo giảng viên; helper e2e đường điều tra`.

---

### Task 4: `ScoreService` — lượt tính đầu, tính lại tầng luật, bước chuyển

**Files:** Create `apps/api/src/grading/scoring/score.service.ts`; Modify `apps/api/src/grading/grading.module.ts` (`ScoreService` vào `providers` + `exports`; `ScoreComputationEntity` vào `forFeature`); Test `apps/api/test/score-service.e2e-spec.ts`.

**Interfaces — Produces:**
- `ScoreService.computeInitial(resultId): Promise<{ outcome: 'auto' | 'flagged'; computationId: string; scoreHundredths: number }>` — bài `investigator` ở `ai_grading`, lượt chấm hiện hành `graded`. Khoá giảng viên, ĐỌC LẠI ngữ cảnh sau khoá, ghi `score_computation` (`initial`, `created_by` null), rồi MỘT UPDATE có điều kiện `ai_grading → ai_graded` kèm `ai_total_score`, `confidence`, `model_used` (cắt 100 ký tự — cột `varchar(100)`); `criterion_results` GIỮ `[]` (khuôn cột đó là của `one_shot` — `criterionId`, `verdict` — và calibration đọc nó; khung trừ điểm nằm ở `breakdown`); rồi `ai_graded → auto_approved | flagged_for_review`. Lượt tính ra dưới sàn → NÉM, không ghi gì: 3d phải quyết kết cục lượt chấm TRƯỚC khi ghi `outcome = 'graded'` (lượt chấm bất biến từ lúc có kết cục).
- `ScoreService.recomputeForTeacher(m: EntityManager, teacherId, reason: ScoreComputationReason, actorId: string | null, scope: { ruleId?: string; rubricId?: string } = {}): Promise<RecomputeSummary>` — CHẠY TRONG transaction của người gọi, nên thay đổi luật / giá và mọi lượt tính lại nó gây ra commit cùng nhau. Bài được tính: `investigator`, trạng thái `auto_approved | audit_pending | flagged_for_review | teacher_reviewed`, lượt chấm hiện hành `graded`, chưa chấm tay, của phiên mà `teacher_id` = giảng viên; `ruleId` → chỉ bài mà lượt tính mới nhất có lỗi của luật đó; `rubricId` → chỉ bài của rubric đó. Khoá hàng theo `g.id` (thứ tự xác định).
- `RecomputeSummary { recomputed: number; promoted: number; demoted: number; belowFloor: number }`.
- `ScoreService.recomputeOne(m, resultId, reason, actorId): Promise<ScoreCoreOutput>` — tính và ghi cho MỘT bài, KHÔNG dời trạng thái (người gọi dời). Người gọi đã khoá giảng viên.
- `ScoreService.preview(resultId, transform: (rules: RuleSnapshot[]) => RuleSnapshot[]): Promise<ScoreCoreOutput>` — không ghi.
- `ScoreService.latestComputation(m, resultId)` = `latestComputationRow` (Task 3).

Luật dời trạng thái sau lượt tính TẦNG LUẬT (§14.3, T-DEMOTE-1):

| Trạng thái trước | Kết cục mới | Sau |
|---|---|---|
| `flagged_for_review`, `ungradable_class` null | `auto` | `auto_approved` |
| `auto_approved` | không `auto` | `flagged_for_review` |
| `audit_pending` | không `auto` | `flagged_for_review`, `audit_sampled = false`, `audit_sampled_at = null` (huỷ khỏi mẫu) |
| `teacher_reviewed` | bất kỳ | giữ nguyên |

Lượt tính lại ra DƯỚI SÀN (vd. bài cạn ngân sách mà luật duy nhất của nó vừa bị thu hồi → 0 phát hiện, T-FLOOR-1): không ghi dòng (`score` NOT NULL), bài tự quyết về `flagged_for_review` theo bảng trên, đếm vào `belowFloor`. Ruling ghi ở ledger — spec không nói ca này.

- [ ] **Step 1: Test đỏ.**

```ts
// apps/api/test/score-service.e2e-spec.ts
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { ScoreService } from '../src/grading/scoring/score.service';
import { forceStatus, seedSession } from './helpers/grading-seed';
import { seedInvestigatorResult, seedInvestigatorSession, seedPrices, seedRule, storedWith } from './helpers/investigator-seed';

const SEEN = [
  { ruleKey: 'sai_bien', checkedBy: 'machine' as const },
  { ruleKey: 'ten_bien', checkedBy: 'model' as const },
];

describe('ScoreService (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let scores: ScoreService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    ds = app.get(DataSource);
    scores = app.get(ScoreService);
  });
  afterAll(async () => app.close());

  /** Phiên, hai luật (mỗi tiêu chí một luật — T-FLOOR-6), bảng giá v1: sai_bien 1,50, ten_bien 0,50. */
  async function world(label: string) {
    const ctx = await seedSession(ds, label);
    await seedInvestigatorSession(ds, ctx);
    const bien = await seedRule(ds, ctx.teacherId, 'sai_bien', 'tinh_dung', { kind: 'test_group_failed', group: 'bien' });
    const ten = await seedRule(ds, ctx.teacherId, 'ten_bien', 'trinh_bay');
    await seedPrices(ds, ctx.teacherId, { [bien.ruleId]: '1.50', [ten.ruleId]: '0.50' });
    return { ctx, bien, ten };
  }
  const recompute = (teacherId: string, reason: Parameters<ScoreService['recomputeForTeacher']>[2], scope = {}) =>
    ds.transaction((m) => scores.recomputeForTeacher(m, teacherId, reason, teacherId, scope));
  const status = async (id: string) =>
    (await ds.query(`SELECT status, ai_total_score, audit_sampled, criterion_results FROM examcollect.grading_result WHERE id = $1`, [id]))[0];
  const computations = (id: string) =>
    ds.query(`SELECT reason, score FROM examcollect.score_computation WHERE grading_result_id = $1 ORDER BY created_at`, [id]);

  it('lượt tính đầu: ghi score_computation initial, ai_total_score, criterion_results giữ [], và tự quyết khi thoả công thức', async () => {
    const { ctx } = await world('sc-initial');
    const { resultId } = await seedInvestigatorResult(ds, ctx, storedWith(SEEN));
    const out = await scores.computeInitial(resultId);
    expect(out).toMatchObject({ outcome: 'auto', scoreHundredths: 1000 - 150 });
    expect(await status(resultId)).toMatchObject({ status: 'auto_approved', ai_total_score: '8.50', criterion_results: [] });
    expect(await computations(resultId)).toEqual([{ reason: 'initial', score: '8.50' }]);
  });

  it('lượt tính đầu dưới sàn → ném, không ghi dòng nào, bài vẫn ai_grading', async () => {
    const { ctx } = await world('sc-floor');
    await ds.query(`UPDATE examcollect.exam_session SET test_bundle_id = NULL WHERE id = $1`, [ctx.sessionId]);
    const { resultId } = await seedInvestigatorResult(ds, ctx, storedWith(SEEN));
    await expect(scores.computeInitial(resultId)).rejects.toThrow(/dưới sàn/);
    expect(await computations(resultId)).toEqual([]);
    expect((await status(resultId)).status).toBe('ai_grading');
  });

  it('T-POL-1: đổi giá một luật → mọi bài chưa chốt dính luật đó tính lại ngay; bài không dính thì không', async () => {
    const { ctx, bien, ten } = await world('sc-price');
    const a = await seedInvestigatorResult(ds, ctx, storedWith(SEEN));
    const b = await seedInvestigatorResult(ds, ctx, storedWith(SEEN, [], false));
    await scores.computeInitial(a.resultId);
    await scores.computeInitial(b.resultId);
    await seedPrices(ds, ctx.teacherId, { [bien.ruleId]: '2.00', [ten.ruleId]: '0.50' });
    const sum = await recompute(ctx.teacherId, 'price_change', { ruleId: bien.ruleId });
    expect(sum.recomputed).toBe(1);
    expect((await computations(a.resultId)).map((c: { score: string }) => c.score)).toEqual(['8.50', '8.00']);
    expect(await computations(b.resultId)).toHaveLength(1);
  });

  it('T-DEMOTE-1: luật máy kiểm mới, chưa giá, có lỗi → bài tự quyết về gắn cờ; bài kiểm mẫu bị huỷ khỏi mẫu; teacher_reviewed giữ', async () => {
    const { ctx } = await world('sc-demote');
    const a = await seedInvestigatorResult(ds, ctx, storedWith(SEEN));
    const b = await seedInvestigatorResult(ds, ctx, storedWith(SEEN));
    const c = await seedInvestigatorResult(ds, ctx, storedWith(SEEN));
    for (const r of [a, b, c]) await scores.computeInitial(r.resultId);
    await forceStatus(ds, b.resultId, 'audit_pending', { audit_sampled: true, audit_sampled_at: new Date() });
    await forceStatus(ds, c.resultId, 'teacher_reviewed');
    await seedRule(ds, ctx.teacherId, 'bien_2', 'trinh_bay', { kind: 'test_group_failed', group: 'bien' });
    const sum = await recompute(ctx.teacherId, 'tier2_rule');
    expect(sum).toMatchObject({ recomputed: 3, demoted: 2 });
    expect((await status(a.resultId)).status).toBe('flagged_for_review');
    expect(await status(b.resultId)).toMatchObject({ status: 'flagged_for_review', audit_sampled: false });
    expect((await status(c.resultId)).status).toBe('teacher_reviewed');
  });

  it('đặt giá cho luật đang chặn → bài gắn cờ lên tự quyết (§14.3)', async () => {
    const { ctx, bien, ten } = await world('sc-promote');
    const extra = await seedRule(ds, ctx.teacherId, 'bien_2', 'trinh_bay', { kind: 'test_group_failed', group: 'bien' });
    const a = await seedInvestigatorResult(ds, ctx, storedWith(SEEN));
    expect(await scores.computeInitial(a.resultId)).toMatchObject({ outcome: 'flagged' });
    await seedPrices(ds, ctx.teacherId, { [bien.ruleId]: '1.50', [ten.ruleId]: '0.50', [extra.ruleId]: '0.25' });
    const sum = await recompute(ctx.teacherId, 'price_change', { ruleId: extra.ruleId });
    expect(sum.promoted).toBe(1);
    expect((await status(a.resultId)).status).toBe('auto_approved');
  });

  it('bài đã chốt không bao giờ vào lượt tính lại tầng luật (phần tính lại của T-PIN-1)', async () => {
    const { ctx, bien, ten } = await world('sc-pin');
    const a = await seedInvestigatorResult(ds, ctx, storedWith(SEEN));
    await scores.computeInitial(a.resultId);
    await forceStatus(ds, a.resultId, 'finalized', { finalized_by: ctx.teacherId, finalized_at: new Date() });
    await seedPrices(ds, ctx.teacherId, { [bien.ruleId]: '3.00', [ten.ruleId]: '0.50' });
    expect((await recompute(ctx.teacherId, 'price_change', { ruleId: bien.ruleId })).recomputed).toBe(0);
    expect(await computations(a.resultId)).toHaveLength(1);
  });

  it('T-POL-8: đổi giá của giảng viên A không đụng bài của giảng viên B', async () => {
    const A = await world('sc-a');
    const B = await world('sc-b');
    const ra = await seedInvestigatorResult(ds, A.ctx, storedWith(SEEN));
    const rb = await seedInvestigatorResult(ds, B.ctx, storedWith(SEEN));
    await scores.computeInitial(ra.resultId);
    await scores.computeInitial(rb.resultId);
    await seedPrices(ds, A.ctx.teacherId, { [A.bien.ruleId]: '4.00', [A.ten.ruleId]: '0.50' });
    await recompute(A.ctx.teacherId, 'price_change');
    expect(await computations(rb.resultId)).toHaveLength(1);
  });

  it('T-FAIR-1: luật lời thêm giữa lô → bài chấm sau có thấy nó cũng KHÔNG xét, cả phiên không bài nào về gắn cờ', async () => {
    const { ctx } = await world('sc-fair');
    const early = await seedInvestigatorResult(ds, ctx, storedWith(SEEN));
    await scores.computeInitial(early.resultId);
    await seedRule(ds, ctx.teacherId, 'chu_thich_sai', 'trinh_bay');
    const late = await seedInvestigatorResult(
      ds, ctx, storedWith([...SEEN, { ruleKey: 'chu_thich_sai', checkedBy: 'model' }], ['chu_thich_sai']),
    );
    expect(await scores.computeInitial(late.resultId)).toMatchObject({ outcome: 'auto', scoreHundredths: 850 });
    await recompute(ctx.teacherId, 'rule_revision');
    for (const id of [early.resultId, late.resultId]) {
      expect((await status(id)).status).toBe('auto_approved');
      const [last] = await ds.query(
        `SELECT breakdown FROM examcollect.score_computation WHERE grading_result_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [id],
      );
      expect(last.breakdown.notConsidered.map((r: { ruleKey: string }) => r.ruleKey)).toEqual(['chu_thich_sai']);
    }
  });

  it('Review Focus 2: lượt tính đầu CHỜ một lượt sửa giá đang mở của cùng giảng viên, rồi tính theo giá mới', async () => {
    const { ctx, bien, ten } = await world('sc-lock');
    const a = await seedInvestigatorResult(ds, ctx, storedWith(SEEN));
    const runner = ds.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      await runner.query(`SELECT pg_advisory_xact_lock(hashtextextended('score_computation:' || $1::text, 0))`, [ctx.teacherId]);
      let settled = false;
      const pending = scores.computeInitial(a.resultId).finally(() => {
        settled = true;
      });
      await new Promise((r) => setTimeout(r, 400));
      expect(settled).toBe(false);
      const [v] = await runner.query(
        `INSERT INTO examcollect.price_table_version (teacher_id, version, created_by) VALUES ($1, 2, $1) RETURNING id`,
        [ctx.teacherId],
      );
      await runner.query(
        `INSERT INTO examcollect.rule_price (price_table_version_id, error_rule_id, teacher_id, deduction)
         VALUES ($1, $2, $4, '3.00'), ($1, $3, $4, '0.50')`,
        [v.id, bien.ruleId, ten.ruleId, ctx.teacherId],
      );
      await runner.commitTransaction();
      expect(await pending).toMatchObject({ scoreHundredths: 1000 - 300 - 50 });
    } finally {
      if (runner.isTransactionActive) await runner.rollbackTransaction();
      await runner.release();
    }
  });
});
```

Run: `pnpm --filter api test:e2e -- score-service` — Expected: FAIL (`ScoreService` không có).

Ca T-FAIR-1: bài `late` thấy `chu_thich_sai` và model báo nó, nhưng bài `early` không thấy → không xét cho cả hai; điểm của `late` = 1000 − 150 = 850. Ca khoá: `sai_bien` 3,00, `ten_bien` 0,50 → (300·1 + 50·0,5)/350 ≥ θ.

- [ ] **Step 2: `ScoreService`.**

```ts
// apps/api/src/grading/scoring/score.service.ts
import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { readAutoThreshold } from '../decision/threshold';
import { GradingResultEntity } from '../entities/grading-result.entity';
import { ScoreComputationEntity } from '../entities/score-computation.entity';
import type { ScoreComputationReason } from '../grading-model.types';
import { advanceStatus } from '../lifecycle/advance';
import { formatHundredths } from './hundredths';
import { computeScore, RuleSnapshot, ScoreCoreOutput } from './score-core';
import {
  currentPriceVersion,
  latestComputationRow,
  loadRuleSnapshots,
  loadScoreContext,
  loadSessionModelRules,
  lockTeacherScoring,
  ScoreContext,
  teacherOfResult,
} from './score-inputs';

export interface RecomputeSummary {
  recomputed: number;
  promoted: number;
  demoted: number;
  /** Lượt tính lại ra dưới sàn — không ghi được dòng (điểm NOT NULL), bài tự quyết về gắn cờ. */
  belowFloor: number;
}

type Computed = ScoreCoreOutput & { priceVersionId: string | null };

/**
 * Chỗ DUY NHẤT ghi `score_computation` (§2.2 *"dòng tính lại"*) và dời trạng thái sau một lượt
 * tính. Mọi dịch vụ khác — giá, luật, ngoại lệ, đánh dấu, chốt — gọi vào đây, trong transaction
 * của chính nó.
 */
@Injectable()
export class ScoreService {
  private readonly theta = readAutoThreshold(process.env).theta;

  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  readonly latestComputation = latestComputationRow;

  async computeInitial(resultId: string): Promise<{ outcome: 'auto' | 'flagged'; computationId: string; scoreHundredths: number }> {
    return this.ds.transaction(async (m) => {
      await lockTeacherScoring(m, await teacherOfResult(m, resultId));
      // Đọc SAU khoá: một lượt đánh dấu tiêu chí hay sửa giá vừa commit phải được thấy.
      const ctx = await loadScoreContext(m, resultId);
      if (ctx.pipeline !== 'investigator' || ctx.status !== 'ai_grading' || !ctx.stored) {
        throw new Error(`kết quả ${resultId} không tính đầu được (đường ${ctx.pipeline}, ${ctx.status}, lượt chấm ${ctx.stored ? 'graded' : 'chưa graded'})`);
      }
      const out = await this.compute(m, ctx);
      if (out.outcome === 'ungradable' || out.scoreHundredths === null) {
        throw new Error(`lượt tính đầu của ${resultId} ra dưới sàn (${out.ungradable?.reason}) — người gọi phải quyết kết cục lượt chấm trước`);
      }
      const computationId = await this.insertComputation(m, ctx, 'initial', null, out);
      // `ai_total_score` = điểm của lượt tính đầu, dưới trigger bất biến (§14.2): ghi CÙNG UPDATE
      // với các cột AI khác, vì guard đóng băng chúng ngay khi `ai_total_score` có.
      const wrote = await m
        .createQueryBuilder()
        .update(GradingResultEntity)
        .set({
          status: 'ai_graded',
          aiTotalScore: formatHundredths(out.scoreHundredths),
          confidence: out.breakdown.confidence === null ? null : out.breakdown.confidence.toFixed(3),
          modelUsed: ctx.stored.result.investigation.modelsUsed.join('+').slice(0, 100) || null,
        })
        .where('id = :id', { id: resultId })
        .andWhere("status = 'ai_grading'")
        .execute();
      if ((wrote.affected ?? 0) === 0) throw new Error(`kết quả ${resultId} đã rời ai_grading`);
      const to = out.outcome === 'auto' ? 'auto_approved' : 'flagged_for_review';
      await advanceStatus(m, resultId, ['ai_graded'], to, { flagForReview: to === 'flagged_for_review' });
      return { outcome: out.outcome, computationId, scoreHundredths: out.scoreHundredths };
    });
  }

  async recomputeForTeacher(
    m: EntityManager,
    teacherId: string,
    reason: ScoreComputationReason,
    actorId: string | null,
    scope: { ruleId?: string; rubricId?: string } = {},
  ): Promise<RecomputeSummary> {
    await lockTeacherScoring(m, teacherId);
    const ids: { id: string }[] = await m.query(
      `SELECT g.id
         FROM examcollect.grading_result g
         JOIN examcollect.submission s ON s.id = g.submission_id
         JOIN examcollect.exam_session es ON es.id = s.exam_session_id
         JOIN examcollect.grading_attempt a ON a.id = g.current_attempt_id AND a.outcome = 'graded'
        WHERE es.teacher_id = $1
          AND g.pipeline = 'investigator'
          AND g.status IN ('auto_approved', 'audit_pending', 'flagged_for_review', 'teacher_reviewed')
          AND NOT EXISTS (SELECT 1 FROM examcollect.teacher_review t WHERE t.grading_result_id = g.id AND t.kind = 'manual_score')
          AND ($2::uuid IS NULL OR g.rubric_id_version = $2)
          AND ($3::uuid IS NULL OR EXISTS (
                SELECT 1 FROM (SELECT c.breakdown FROM examcollect.score_computation c
                                WHERE c.grading_result_id = g.id ORDER BY c.created_at DESC LIMIT 1) last
                 WHERE last.breakdown -> 'errors' @> jsonb_build_array(jsonb_build_object('ruleId', $3::text))))
        ORDER BY g.id
        FOR UPDATE OF g`,
      [teacherId, scope.rubricId ?? null, scope.ruleId ?? null],
    );
    const sum: RecomputeSummary = { recomputed: 0, promoted: 0, demoted: 0, belowFloor: 0 };
    for (const { id } of ids) {
      const out = await this.recomputeOne(m, id, reason, actorId);
      sum.recomputed++;
      if (out.scoreHundredths === null) sum.belowFloor++;
      const moved = await this.ruleLayerTransition(m, id, out);
      if (moved === 'promoted') sum.promoted++;
      if (moved === 'demoted') sum.demoted++;
    }
    return sum;
  }

  /** Tính và ghi cho MỘT bài; KHÔNG dời trạng thái. Người gọi đã khoá giảng viên. */
  async recomputeOne(m: EntityManager, resultId: string, reason: ScoreComputationReason, actorId: string | null): Promise<ScoreCoreOutput> {
    const ctx = await loadScoreContext(m, resultId);
    const out = await this.compute(m, ctx);
    if (out.scoreHundredths !== null) await this.insertComputation(m, ctx, reason, actorId, out);
    return out;
  }

  /** Như lượt tính, KHÔNG ghi — xem trước tác động của một giá hay một luật (T-POL-5). */
  async preview(resultId: string, transform: (rules: RuleSnapshot[]) => RuleSnapshot[]): Promise<ScoreCoreOutput> {
    const ctx = await loadScoreContext(this.ds.manager, resultId);
    return this.compute(this.ds.manager, ctx, transform);
  }

  /** Lượt tính theo bảng giá HIỆN HÀNH của giảng viên (phiên chưa chốt đi theo giá hiện hành, §2.2). */
  private async compute(m: EntityManager, ctx: ScoreContext, transform?: (rules: RuleSnapshot[]) => RuleSnapshot[]): Promise<Computed> {
    if (!ctx.stored) throw new Error(`kết quả ${ctx.resultId} không có lượt chấm graded`);
    const price = await currentPriceVersion(m, ctx.teacherId);
    const rules = await loadRuleSnapshots(m, ctx.teacherId, price?.id ?? null);
    const out = computeScore({
      stored: ctx.stored,
      bundleCases: ctx.bundleCases,
      rubric: ctx.rubric,
      rules: transform ? transform(rules) : rules,
      sessionModelRules: await loadSessionModelRules(m, ctx.sessionId),
      waivedCriteria: ctx.waivedCriteria,
      exceptions: ctx.exceptions,
      theta: this.theta,
    });
    return { ...out, priceVersionId: price?.id ?? null };
  }

  private async insertComputation(
    m: EntityManager,
    ctx: ScoreContext,
    reason: ScoreComputationReason,
    actorId: string | null,
    out: Computed,
  ): Promise<string> {
    const repo = m.getRepository(ScoreComputationEntity);
    const row = await repo.save(
      repo.create({
        gradingResultId: ctx.resultId,
        attemptId: ctx.attemptId!,
        priceTableVersionId: out.priceVersionId,
        rubricIdVersion: ctx.rubricId,
        testBundleId: ctx.bundleId,
        reason,
        score: formatHundredths(out.scoreHundredths!),
        breakdown: out.breakdown as unknown as Record<string, unknown>,
        createdBy: actorId,
      }),
    );
    return row.id;
  }

  /** §14.3 — chỉ lượt tính TẦNG LUẬT mới được đưa bài flagged ⇄ auto_approved. */
  private async ruleLayerTransition(m: EntityManager, resultId: string, out: ScoreCoreOutput): Promise<'promoted' | 'demoted' | null> {
    if (out.outcome === 'auto') {
      const [r] = await m.query(`SELECT ungradable_class FROM examcollect.grading_result WHERE id = $1`, [resultId]);
      if (r.ungradable_class !== null) return null;
      return (await advanceStatus(m, resultId, ['flagged_for_review'], 'auto_approved', { flagForReview: false })) ? 'promoted' : null;
    }
    if (await advanceStatus(m, resultId, ['auto_approved'], 'flagged_for_review', { flagForReview: true })) return 'demoted';
    // Bài đang kiểm mẫu bị huỷ khỏi mẫu (§14.3): cờ rút mẫu tắt cùng bước chuyển.
    if (await advanceStatus(m, resultId, ['audit_pending'], 'flagged_for_review', { flagForReview: true, auditSampled: false, auditSampledAt: null })) {
      return 'demoted';
    }
    return null;
  }
}
```

- [ ] **Step 3:** `pnpm --filter api test:e2e -- score-service` → PASS (9 ca). `pnpm --filter api test` → xanh.
- [ ] **Step 4:** Commit `feat(scoring): ScoreService — lượt tính đầu, tính lại tầng luật trong transaction của người gọi, khoá theo giảng viên, dời trạng thái theo §14.3 (T-POL-1, T-DEMOTE-1, T-PIN-1, T-FAIR-1, T-POL-8)`.

---

### Task 5: Luật và giá — dịch vụ

**Files:** Create `apps/api/src/grading/rules/rule-input.ts` + `rule-input.spec.ts`, `error-rule.service.ts`, `price.service.ts`; Modify `grading.module.ts` (providers); Test `apps/api/test/rules-prices.e2e-spec.ts`.

**Interfaces — Produces:**
- `parseRuleInput(x: unknown): RuleInput`, `parseRuleChanges(x: unknown): RuleChanges`, `parsePredicate(x: unknown): RulePredicate | null`, `parseDeduction(x: unknown): string | null` — thuần; ném `BadRequestException` với lời tiếng Việt. Một chỗ kiểm cho cả route (Task 10) lẫn service.
- `ErrorRuleService.create(teacherId, input: RuleInput): Promise<{ ruleId; revisionId; recompute: RecomputeSummary | null }>` — `state = 'active'`, `origin = 'teacher'`, bản sửa 1; trùng `ruleKey` → `ConflictException`; luật máy kiểm → tính lại `tier2_rule` trong CÙNG transaction; luật lời → không tính lại (T-FAIR-1).
- `ErrorRuleService.revise(teacherId, ruleId, changes: RuleChanges)` → bản sửa mới (T-RULEREV-1); đổi `criterionKey`/`predicate` → tính lại `rule_revision`; chỉ đổi chữ → không.
- `ErrorRuleService.setState(teacherId, ruleId, state: 'active' | 'dismissed' | 'retired')` → tính lại `rule_revision` (tập luật đổi). *Tạo luật từ đây* của một luật `proposed` = `revise` rồi `setState('active')`; *Không phải lỗi* = `setState('dismissed')` (spec UI 3.1).
- `ErrorRuleService.list(teacherId): Promise<RuleListItem[]>` — luật `active`: id, ruleKey, state, origin, bản sửa hiện hành, `checkedBy`, giá hiện hành (`string | null`), `appliedTo: { results; sessions }` (bài mà lượt tính MỚI NHẤT có lỗi của luật, không `excluded`), `mismatchedIn: number` (bài mà lượt tính mới nhất nêu luật là lệch tiêu chí, §14.1).
- `ErrorRuleService.missing(teacherId)` — luật `proposed` (3d sinh), cùng khuôn.
- `ErrorRuleService.preview(teacherId, input: RuleInput & { ruleId?: string; deduction?: string | null }): Promise<RulePreview>` — KHÔNG ghi (spec UI 3.2 *"Lưu thì áp vào đâu"*). Bậc 2 (máy kiểm): mọi bài chưa chốt, chưa chấm tay của giảng viên, tính với luật đang soạn thay / thêm vào bảng; chỉ trả bài mà luật đó có lỗi, kèm điểm trước / sau và cờ chạm trần. Bậc 3 (mẫu máy chưa đo được ở bước 3): lý do của `evaluatePredicate`. Bậc 4 (bằng lời): phiên của giảng viên, `graded` = đã có lượt chấm `graded` → *không xét*.
- `ErrorRuleService.owned(m, teacherId, ruleId): Promise<ErrorRuleEntity>` — 404 nếu không phải luật của giảng viên (T-POL-8).
- `PriceService.setPrice(teacherId, ruleId, deduction: string | null, actorId): Promise<{ versionId; recompute: RecomputeSummary }>` — phiên bản bảng giá mới chép cả bảng + giá đổi (T-VER-1), rồi tính lại `price_change` cho bài dính luật đó, CÙNG transaction.
- `PriceService.preview(teacherId, ruleId, deduction): Promise<PricePreview>` — KHÔNG ghi: `{ openSessions: { sessionId; name; affected; autoAfter; blockedByOtherUnpriced }[]; finalizedSessions: { sessionId; name; affected }[] }` (T-POL-5; spec UI 3.1 *"Lưu thì điều gì xảy ra"*). Bài chấm tay không tính vào `affected` — điểm của nó không đổi nữa.

- [ ] **Step 1: Test đỏ (unit).**

```ts
// apps/api/src/grading/rules/rule-input.spec.ts
import { parseDeduction, parseRuleInput } from './rule-input';

const base = { ruleKey: 'sai_bien', name: 'Sai biên', description: 'Ca biên không đạt', criterionKey: 'tinh_dung' };

describe('parseRuleInput', () => {
  it.each([
    [null],
    [{ kind: 'test_group_failed', group: 'bien' }],
    [{ kind: 'calls_function', name: 'sort' }],
    [{ kind: 'complexity_exceeds_required' }],
    [{ kind: 'no_recursion' }],
    [{ kind: 'no_recursion', functionName: 'dfs' }],
  ])('nhận mẫu %j', (predicate) => {
    expect(parseRuleInput({ ...base, predicate }).predicate).toEqual(predicate);
  });

  it.each([
    [{ kind: 'eval_code', src: 'x' }],
    [{ kind: 'test_group_failed' }],
    [{ kind: 'complexity_exceeds_required', x: 1 }],
    [{ kind: 'calls_function', name: 'a b' }],
    ['test_group_failed'],
  ])('từ chối mẫu %j', (predicate) => {
    expect(() => parseRuleInput({ ...base, predicate })).toThrow(/điều kiện/);
  });

  it('từ chối khoá luật và khoá tiêu chí sai khuôn', () => {
    expect(() => parseRuleInput({ ...base, ruleKey: 'Sai Bien', predicate: null })).toThrow(/ruleKey/);
    expect(() => parseRuleInput({ ...base, criterionKey: '', predicate: null })).toThrow(/criterionKey/);
  });
});

describe('parseDeduction', () => {
  it('null hoặc chuỗi tối đa hai chữ số lẻ; không nhận number', () => {
    expect(parseDeduction(null)).toBeNull();
    expect(parseDeduction('1.5')).toBe('1.5');
    expect(() => parseDeduction(1.5)).toThrow(/mức trừ/);
    expect(() => parseDeduction('7.555')).toThrow(/mức trừ/);
    expect(() => parseDeduction('-1')).toThrow(/mức trừ/);
  });
});
```

- [ ] **Step 2: Test đỏ (e2e)** — `apps/api/test/rules-prices.e2e-spec.ts`: cùng `beforeAll`, `SEEN` và `world()` của Task 4 (chép vào file này), thêm `rules = app.get(ErrorRuleService)`, `prices = app.get(PriceService)`.

```ts
it('T-RULEREV-1: đổi tiêu chí → bản sửa 2, luật trỏ bản 2, lượt tính cũ vẫn mang bản 1', async () => {
  const { ctx, ten } = await world('rr-rev');
  const a = await seedInvestigatorResult(ds, ctx, storedWith(SEEN));
  await scores.computeInitial(a.resultId);
  const { revisionId } = await rules.revise(ctx.teacherId, ten.ruleId, { criterionKey: 'tinh_dung' });
  const revs = await ds.query(`SELECT revision FROM examcollect.error_rule_revision WHERE error_rule_id = $1 ORDER BY revision`, [ten.ruleId]);
  expect(revs.map((r: { revision: number }) => r.revision)).toEqual([1, 2]);
  const [rule] = await ds.query(`SELECT current_revision_id FROM examcollect.error_rule WHERE id = $1`, [ten.ruleId]);
  expect(rule.current_revision_id).toBe(revisionId);
  const rows = await ds.query(`SELECT reason, breakdown FROM examcollect.score_computation WHERE grading_result_id = $1 ORDER BY created_at`, [a.resultId]);
  expect(rows.map((r: { reason: string }) => r.reason)).toEqual(['initial', 'rule_revision']);
  const revOf = (b: { errors: { ruleKey: string; revisionId: string }[] }) => b.errors.find((e) => e.ruleKey === 'ten_bien')!.revisionId;
  expect(revOf(rows[0].breakdown)).toBe(ten.revisionId);
  expect(revOf(rows[1].breakdown)).toBe(revisionId);
});

it('sửa chữ của luật (tên, mô tả) → bản sửa mới, KHÔNG tính lại', async () => {
  const { ctx, ten } = await world('rr-text');
  const a = await seedInvestigatorResult(ds, ctx, storedWith(SEEN));
  await scores.computeInitial(a.resultId);
  await rules.revise(ctx.teacherId, ten.ruleId, { name: 'Tên biến khó đọc' });
  expect(await ds.query(`SELECT 1 FROM examcollect.score_computation WHERE grading_result_id = $1`, [a.resultId])).toHaveLength(1);
});

it('T-VER-1: sửa giá hai lần → hai phiên bản mới, mỗi bản chép đủ bảng; dòng cũ không đổi', async () => {
  const { ctx, bien, ten } = await world('rr-ver');
  await prices.setPrice(ctx.teacherId, bien.ruleId, '2.00', ctx.teacherId);
  await prices.setPrice(ctx.teacherId, ten.ruleId, '0.75', ctx.teacherId);
  const rows = await ds.query(
    `SELECT v.version, p.deduction FROM examcollect.price_table_version v
       JOIN examcollect.rule_price p ON p.price_table_version_id = v.id
      WHERE v.teacher_id = $1 ORDER BY v.version, p.deduction`,
    [ctx.teacherId],
  );
  expect(rows.map((r: { version: number; deduction: string }) => [r.version, r.deduction])).toEqual([
    [1, '0.50'], [1, '1.50'], [2, '0.50'], [2, '2.00'], [3, '0.75'], [3, '2.00'],
  ]);
});

it('T-POL-5: xem trước một giá trả đúng số bài theo phiên chưa chốt, và không ghi gì', async () => {
  const { ctx } = await world('rr-preview');
  const extra = await seedRule(ds, ctx.teacherId, 'bien_2', 'trinh_bay', { kind: 'test_group_failed', group: 'bien' });
  for (let i = 0; i < 2; i++) await scores.computeInitial((await seedInvestigatorResult(ds, ctx, storedWith(SEEN))).resultId);
  const [{ n: before }] = await ds.query(`SELECT count(*)::int AS n FROM examcollect.score_computation`);
  const p = await prices.preview(ctx.teacherId, extra.ruleId, '0.25');
  expect(p.openSessions).toEqual([{ sessionId: ctx.sessionId, name: expect.any(String), affected: 2, autoAfter: 2, blockedByOtherUnpriced: 0 }]);
  expect(p.finalizedSessions).toEqual([]);
  const [{ n: after }] = await ds.query(`SELECT count(*)::int AS n FROM examcollect.score_computation`);
  expect(after).toBe(before);
  expect(await ds.query(`SELECT 1 FROM examcollect.price_table_version WHERE teacher_id = $1 AND version > 1`, [ctx.teacherId])).toHaveLength(0);
});

it('T-POL-8: giá và bản sửa trên luật của giảng viên khác → 404', async () => {
  const A = await world('rr-a');
  const B = await world('rr-b');
  await expect(prices.setPrice(B.ctx.teacherId, A.bien.ruleId, '1.00', B.ctx.teacherId)).rejects.toThrow(/Không tìm thấy luật/);
  await expect(rules.revise(B.ctx.teacherId, A.bien.ruleId, { name: 'x' })).rejects.toThrow(/Không tìm thấy luật/);
});

it('list: appliedTo đếm bài của lượt tính mới nhất; trùng ruleKey → 409', async () => {
  const { ctx } = await world('rr-list');
  for (let i = 0; i < 2; i++) await scores.computeInitial((await seedInvestigatorResult(ds, ctx, storedWith(SEEN))).resultId);
  const list = await rules.list(ctx.teacherId);
  expect(list.find((r) => r.ruleKey === 'sai_bien')).toMatchObject({ deduction: '1.50', checkedBy: 'machine', appliedTo: { results: 2, sessions: 1 } });
  await expect(rules.create(ctx.teacherId, { ruleKey: 'sai_bien', name: 'x', description: 'x', criterionKey: 'tinh_dung', predicate: null }))
    .rejects.toThrow(/đã có/);
});

it('preview luật: máy kiểm → bậc 2 kèm điểm trước/sau; bằng lời → bậc 4, phiên đã chấm "không xét"', async () => {
  const { ctx } = await world('rr-tier');
  const a = await seedInvestigatorResult(ds, ctx, storedWith(SEEN));
  await scores.computeInitial(a.resultId);
  const t2 = await rules.preview(ctx.teacherId, {
    ruleKey: 'bien_3', name: 'x', description: 'x', criterionKey: 'trinh_bay',
    predicate: { kind: 'test_group_failed', group: 'bien' }, deduction: '0.40',
  });
  expect(t2).toEqual({ tier: 2, results: [{ resultId: a.resultId, sessionId: ctx.sessionId, before: '8.00', after: 760, capped: false }] });
  const t4 = await rules.preview(ctx.teacherId, { ruleKey: 'loi_moi', name: 'x', description: 'x', criterionKey: 'trinh_bay', predicate: null });
  expect(t4).toEqual({ tier: 4, sessions: [{ sessionId: ctx.sessionId, name: expect.any(String), graded: true }] });
});
```

Ca *phiên đã chốt nằm ở `finalizedSessions`* viết ở Task 9 (T-PIN-1), nơi có đường chốt thật.

Run: FAIL (service không có).

- [ ] **Step 3: `rule-input.ts`.**

```ts
// apps/api/src/grading/rules/rule-input.ts
import { BadRequestException } from '@nestjs/common';
import type { RulePredicate } from '../decision/types';
import { parseHundredths } from '../scoring/hundredths';

export interface RuleInput { ruleKey: string; name: string; description: string; criterionKey: string; predicate: RulePredicate | null }
export type RuleChanges = Partial<Omit<RuleInput, 'ruleKey'>>;

const KEY = /^[a-z0-9_]{1,64}$/;
const IDENT = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;

const bad = (msg: string): never => {
  throw new BadRequestException(msg);
};

function text(x: unknown, field: string, max: number): string {
  if (typeof x !== 'string' || x.trim().length === 0 || x.length > max) bad(`${field}: chuỗi 1–${max} ký tự`);
  return (x as string).trim();
}

function key(x: unknown, field: string): string {
  if (typeof x !== 'string' || !KEY.test(x)) bad(`${field}: chỉ chữ thường, số, gạch dưới, 1–64 ký tự`);
  return x as string;
}

/** Đúng bốn mẫu của §4.1 — không có mẫu thứ năm, không code tự do (rủi ro 10). */
export function parsePredicate(x: unknown): RulePredicate | null {
  if (x === null) return null;
  if (typeof x !== 'object' || Array.isArray(x)) return bad('điều kiện: null hoặc một trong bốn mẫu');
  const o = x as Record<string, unknown>;
  const only = (...allowed: string[]) => {
    if (Object.keys(o).some((k) => !allowed.includes(k))) bad(`điều kiện ${String(o.kind)}: có trường lạ`);
  };
  switch (o.kind) {
    case 'test_group_failed':
      only('kind', 'group');
      if (typeof o.group !== 'string' || o.group.length < 1 || o.group.length > 100) bad('điều kiện test_group_failed: thiếu nhóm');
      return { kind: 'test_group_failed', group: o.group as string };
    case 'calls_function':
      only('kind', 'name');
      if (typeof o.name !== 'string' || !IDENT.test(o.name)) bad('điều kiện calls_function: tên hàm không hợp lệ');
      return { kind: 'calls_function', name: o.name as string };
    case 'complexity_exceeds_required':
      only('kind');
      return { kind: 'complexity_exceeds_required' };
    case 'no_recursion':
      only('kind', 'functionName');
      if (o.functionName !== undefined && (typeof o.functionName !== 'string' || !IDENT.test(o.functionName))) {
        bad('điều kiện no_recursion: tên hàm không hợp lệ');
      }
      return o.functionName === undefined ? { kind: 'no_recursion' } : { kind: 'no_recursion', functionName: o.functionName as string };
    default:
      return bad('điều kiện: mẫu không có trong bốn mẫu của §4.1');
  }
}

export function parseRuleInput(x: unknown): RuleInput {
  const o = (x ?? {}) as Record<string, unknown>;
  return {
    ruleKey: key(o.ruleKey, 'ruleKey'),
    name: text(o.name, 'name', 200),
    description: text(o.description, 'description', 2000),
    criterionKey: key(o.criterionKey, 'criterionKey'),
    predicate: parsePredicate(o.predicate === undefined ? null : o.predicate),
  };
}

export function parseRuleChanges(x: unknown): RuleChanges {
  const o = (x ?? {}) as Record<string, unknown>;
  const out: RuleChanges = {};
  if (o.name !== undefined) out.name = text(o.name, 'name', 200);
  if (o.description !== undefined) out.description = text(o.description, 'description', 2000);
  if (o.criterionKey !== undefined) out.criterionKey = key(o.criterionKey, 'criterionKey');
  if (o.predicate !== undefined) out.predicate = parsePredicate(o.predicate);
  return out;
}

/** Mức trừ: null (chưa có giá) hoặc chuỗi thập phân — không nhận `number` (§13.2: không qua số thực). */
export function parseDeduction(x: unknown): string | null {
  if (x === null) return null;
  if (typeof x !== 'string') return bad('mức trừ: chuỗi thập phân tối đa hai chữ số lẻ, hoặc null');
  try {
    parseHundredths(x);
  } catch {
    bad('mức trừ: chuỗi thập phân tối đa hai chữ số lẻ, không âm');
  }
  return x.trim();
}
```

- [ ] **Step 4: `ErrorRuleService`.**

```ts
// apps/api/src/grading/rules/error-rule.service.ts
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { evaluatePredicate, isMachineChecked } from '../decision/predicates';
import type { RulePredicate } from '../decision/types';
import { ErrorRuleEntity } from '../entities/error-rule.entity';
import { ErrorRuleRevisionEntity } from '../entities/error-rule-revision.entity';
import { formatHundredths, parseHundredths } from '../scoring/hundredths';
import type { RuleSnapshot } from '../scoring/score-core';
import { RecomputeSummary, ScoreService } from '../scoring/score.service';
import { RuleChanges, RuleInput } from './rule-input';

export interface RuleListItem {
  id: string;
  ruleKey: string;
  state: string;
  origin: string;
  revision: { id: string; revision: number; name: string; description: string; criterionKey: string; predicate: RulePredicate | null };
  checkedBy: 'machine' | 'model';
  deduction: string | null;
  appliedTo: { results: number; sessions: number };
  mismatchedIn: number;
}

export type RulePreview =
  | { tier: 2; results: { resultId: string; sessionId: string; before: string | null; after: number | null; capped: boolean }[] }
  | { tier: 3; reason: string }
  | { tier: 4; sessions: { sessionId: string; name: string; graded: boolean }[] };

/** Bảng lỗi của MỘT giảng viên (§2.1). Không xoá dòng nào; sửa là bản sửa mới (§14.1). */
@Injectable()
export class ErrorRuleService {
  constructor(@InjectDataSource() private readonly ds: DataSource, private readonly scores: ScoreService) {}

  async create(teacherId: string, input: RuleInput): Promise<{ ruleId: string; revisionId: string; recompute: RecomputeSummary | null }> {
    return this.ds.transaction(async (m) => {
      const repo = m.getRepository(ErrorRuleEntity);
      if (await repo.findOne({ where: { teacherId, ruleKey: input.ruleKey } })) {
        throw new ConflictException(`Luật "${input.ruleKey}" đã có trong bảng lỗi của bạn`);
      }
      const rule = await repo.save(repo.create({ teacherId, ruleKey: input.ruleKey, state: 'active', origin: 'teacher', currentRevisionId: null }));
      const rev = await this.insertRevision(m, rule.id, 1, input, teacherId);
      await m.update(ErrorRuleEntity, rule.id, { currentRevisionId: rev.id });
      // Luật máy kiểm mới đo được trên kết quả đã lưu (bậc 2). Luật lời thì không áp cho phiên đã chấm (T-FAIR-1).
      const recompute = isMachineChecked(input.predicate)
        ? await this.scores.recomputeForTeacher(m, teacherId, 'tier2_rule', teacherId)
        : null;
      return { ruleId: rule.id, revisionId: rev.id, recompute };
    });
  }

  async revise(teacherId: string, ruleId: string, changes: RuleChanges): Promise<{ revisionId: string; recompute: RecomputeSummary | null }> {
    return this.ds.transaction(async (m) => {
      const rule = await this.owned(m, teacherId, ruleId);
      const current = await m.getRepository(ErrorRuleRevisionEntity).findOneByOrFail({ id: rule.currentRevisionId! });
      const next = {
        name: changes.name ?? current.name,
        description: changes.description ?? current.description,
        criterionKey: changes.criterionKey ?? current.criterionKey,
        predicate: changes.predicate !== undefined ? changes.predicate : current.predicate,
      };
      const rev = await this.insertRevision(m, rule.id, current.revision + 1, next, teacherId);
      await m.update(ErrorRuleEntity, rule.id, { currentRevisionId: rev.id });
      const scoring = next.criterionKey !== current.criterionKey || JSON.stringify(next.predicate) !== JSON.stringify(current.predicate);
      const recompute = scoring ? await this.scores.recomputeForTeacher(m, teacherId, 'rule_revision', teacherId) : null;
      return { revisionId: rev.id, recompute };
    });
  }

  async setState(teacherId: string, ruleId: string, state: 'active' | 'dismissed' | 'retired'): Promise<{ recompute: RecomputeSummary }> {
    return this.ds.transaction(async (m) => {
      await this.owned(m, teacherId, ruleId);
      await m.update(ErrorRuleEntity, ruleId, { state });
      return { recompute: await this.scores.recomputeForTeacher(m, teacherId, 'rule_revision', teacherId) };
    });
  }

  list(teacherId: string): Promise<RuleListItem[]> {
    return this.listByState(teacherId, 'active');
  }

  /** *Luật còn thiếu* agent báo (3d sinh dòng `proposed`) — trang kiến thức đọc ở đây. */
  missing(teacherId: string): Promise<RuleListItem[]> {
    return this.listByState(teacherId, 'proposed');
  }

  async preview(teacherId: string, input: RuleInput & { ruleId?: string; deduction?: string | null }): Promise<RulePreview> {
    if (input.ruleId) await this.owned(this.ds.manager, teacherId, input.ruleId);
    if (input.predicate && !isMachineChecked(input.predicate)) {
      return { tier: 3, reason: evaluatePredicate(input.predicate, { cases: [] }, [], {}).reason ?? 'máy chưa đo được mẫu này' };
    }
    if (!input.predicate) {
      const sessions: { id: string; name: string; graded: boolean }[] = await this.ds.query(
        `SELECT es.id, es.name, EXISTS (
                  SELECT 1 FROM examcollect.grading_result g
                    JOIN examcollect.submission s ON s.id = g.submission_id
                    JOIN examcollect.grading_attempt a ON a.id = g.current_attempt_id AND a.outcome = 'graded'
                   WHERE s.exam_session_id = es.id) AS graded
           FROM examcollect.exam_session es WHERE es.teacher_id = $1 ORDER BY es.start_time DESC`,
        [teacherId],
      );
      return { tier: 4, sessions: sessions.map((s) => ({ sessionId: s.id, name: s.name, graded: s.graded })) };
    }
    const draft: RuleSnapshot = {
      ruleId: input.ruleId ?? 'draft',
      revisionId: 'draft',
      ruleKey: input.ruleKey,
      criterionKey: input.criterionKey,
      predicate: input.predicate,
      deductionHundredths: input.deduction == null ? null : parseHundredths(input.deduction),
    };
    const rows: { result_id: string; session_id: string }[] = await this.ds.query(
      `SELECT g.id AS result_id, es.id AS session_id
         FROM examcollect.grading_result g
         JOIN examcollect.submission s ON s.id = g.submission_id
         JOIN examcollect.exam_session es ON es.id = s.exam_session_id
         JOIN examcollect.grading_attempt a ON a.id = g.current_attempt_id AND a.outcome = 'graded'
        WHERE es.teacher_id = $1 AND g.pipeline = 'investigator'
          AND g.status IN ('auto_approved', 'audit_pending', 'flagged_for_review', 'teacher_reviewed')
          AND NOT EXISTS (SELECT 1 FROM examcollect.teacher_review t WHERE t.grading_result_id = g.id AND t.kind = 'manual_score')
        ORDER BY g.id`,
      [teacherId],
    );
    const results: Extract<RulePreview, { tier: 2 }>['results'] = [];
    for (const r of rows) {
      const after = await this.scores.preview(r.result_id, (rules) => [
        ...rules.filter((x) => x.ruleId !== draft.ruleId && x.ruleKey !== draft.ruleKey),
        draft,
      ]);
      if (!after.breakdown.errors.some((e) => e.ruleKey === draft.ruleKey)) continue;
      const last = await this.scores.latestComputation(this.ds.manager, r.result_id);
      const crit = after.breakdown.perCriterion.find((c) => c.key === draft.criterionKey);
      results.push({ resultId: r.result_id, sessionId: r.session_id, before: last?.score ?? null, after: after.scoreHundredths, capped: crit?.capped ?? false });
    }
    return { tier: 2, results };
  }

  /** Luật của ĐÚNG giảng viên này; không thì 404 — không lộ luật của người khác (T-POL-8). */
  async owned(m: EntityManager, teacherId: string, ruleId: string): Promise<ErrorRuleEntity> {
    const rule = await m.getRepository(ErrorRuleEntity).findOne({ where: { id: ruleId, teacherId } });
    if (!rule) throw new NotFoundException('Không tìm thấy luật');
    return rule;
  }

  private async listByState(teacherId: string, state: 'active' | 'proposed'): Promise<RuleListItem[]> {
    const rows: Record<string, unknown>[] = await this.ds.query(
      `WITH price AS (
         SELECT p.error_rule_id, p.deduction FROM examcollect.rule_price p
          WHERE p.price_table_version_id = (SELECT id FROM examcollect.price_table_version WHERE teacher_id = $1 ORDER BY version DESC LIMIT 1)),
       latest AS (
         SELECT DISTINCT ON (c.grading_result_id) c.grading_result_id, c.breakdown, s.exam_session_id
           FROM examcollect.score_computation c
           JOIN examcollect.grading_result g ON g.id = c.grading_result_id
           JOIN examcollect.submission s ON s.id = g.submission_id
           JOIN examcollect.exam_session es ON es.id = s.exam_session_id
          WHERE es.teacher_id = $1
          ORDER BY c.grading_result_id, c.created_at DESC),
       applied AS (
         SELECT e ->> 'ruleId' AS rule_id, l.grading_result_id, l.exam_session_id
           FROM latest l CROSS JOIN LATERAL jsonb_array_elements(l.breakdown -> 'errors') e
          WHERE e ->> 'counted' <> 'excluded'),
       mismatched AS (
         SELECT e ->> 'ruleId' AS rule_id, count(*)::int AS n
           FROM latest l CROSS JOIN LATERAL jsonb_array_elements(l.breakdown -> 'mismatchedRules') e
          GROUP BY 1)
       SELECT r.id, r.rule_key, r.state, r.origin,
              v.id AS revision_id, v.revision, v.name, v.description, v.criterion_key, v.predicate,
              price.deduction,
              (SELECT count(DISTINCT a.grading_result_id)::int FROM applied a WHERE a.rule_id = r.id::text) AS results,
              (SELECT count(DISTINCT a.exam_session_id)::int FROM applied a WHERE a.rule_id = r.id::text) AS sessions,
              COALESCE((SELECT n FROM mismatched mm WHERE mm.rule_id = r.id::text), 0) AS mismatched_in
         FROM examcollect.error_rule r
         JOIN examcollect.error_rule_revision v ON v.id = r.current_revision_id
         LEFT JOIN price ON price.error_rule_id = r.id
        WHERE r.teacher_id = $1 AND r.state = $2
        ORDER BY r.rule_key`,
      [teacherId, state],
    );
    return rows.map((r) => ({
      id: r.id as string,
      ruleKey: r.rule_key as string,
      state: r.state as string,
      origin: r.origin as string,
      revision: {
        id: r.revision_id as string, revision: r.revision as number, name: r.name as string, description: r.description as string,
        criterionKey: r.criterion_key as string, predicate: r.predicate as RulePredicate | null,
      },
      checkedBy: isMachineChecked(r.predicate as RulePredicate | null) ? 'machine' : 'model',
      deduction: r.deduction === null ? null : formatHundredths(parseHundredths(r.deduction as string)),
      appliedTo: { results: r.results as number, sessions: r.sessions as number },
      mismatchedIn: r.mismatched_in as number,
    }));
  }

  private insertRevision(m: EntityManager, ruleId: string, revision: number, input: Omit<RuleInput, 'ruleKey'>, actorId: string) {
    const repo = m.getRepository(ErrorRuleRevisionEntity);
    return repo.save(repo.create({
      errorRuleId: ruleId, revision, name: input.name, description: input.description,
      criterionKey: input.criterionKey, predicate: input.predicate, createdBy: actorId,
    }));
  }
}
```

- [ ] **Step 5: `PriceService`.**

```ts
// apps/api/src/grading/rules/price.service.ts
import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { parseHundredths } from '../scoring/hundredths';
import { RecomputeSummary, ScoreService } from '../scoring/score.service';
import { ErrorRuleService } from './error-rule.service';

export interface PricePreview {
  openSessions: { sessionId: string; name: string; affected: number; autoAfter: number; blockedByOtherUnpriced: number }[];
  /** Phiên đã chốt KHÔNG đổi theo (bảng giá ghim lúc chốt, §2.2) — chỉ "áp giá mới cho phiên đã chốt" mới đổi. */
  finalizedSessions: { sessionId: string; name: string; affected: number }[];
}

@Injectable()
export class PriceService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly rules: ErrorRuleService,
    private readonly scores: ScoreService,
  ) {}

  /** Một phiên bản bảng giá MỚI, chép cả bảng + giá đổi (§2.2), rồi tính lại — một transaction. */
  async setPrice(teacherId: string, ruleId: string, deduction: string | null, actorId: string): Promise<{ versionId: string; recompute: RecomputeSummary }> {
    return this.ds.transaction(async (m) => {
      await this.rules.owned(m, teacherId, ruleId);
      const [{ next }] = await m.query(
        `SELECT COALESCE(MAX(version), 0) + 1 AS next FROM examcollect.price_table_version WHERE teacher_id = $1`,
        [teacherId],
      );
      const [v] = await m.query(
        `INSERT INTO examcollect.price_table_version (teacher_id, version, created_by) VALUES ($1, $2, $3) RETURNING id`,
        [teacherId, next, actorId],
      );
      await m.query(
        `INSERT INTO examcollect.rule_price (price_table_version_id, error_rule_id, teacher_id, deduction)
         SELECT $1, p.error_rule_id, p.teacher_id, p.deduction
           FROM examcollect.rule_price p
           JOIN examcollect.price_table_version pv ON pv.id = p.price_table_version_id
          WHERE pv.teacher_id = $2 AND pv.version = $3 AND p.error_rule_id <> $4`,
        [v.id, teacherId, next - 1, ruleId],
      );
      await m.query(
        `INSERT INTO examcollect.rule_price (price_table_version_id, error_rule_id, teacher_id, deduction) VALUES ($1, $2, $3, $4)`,
        [v.id, ruleId, teacherId, deduction],
      );
      const recompute = await this.scores.recomputeForTeacher(m, teacherId, 'price_change', actorId, { ruleId });
      return { versionId: v.id as string, recompute };
    });
  }

  async preview(teacherId: string, ruleId: string, deduction: string | null): Promise<PricePreview> {
    await this.rules.owned(this.ds.manager, teacherId, ruleId);
    const hundredths = deduction === null ? null : parseHundredths(deduction);
    const rows: { result_id: string; session_id: string; name: string; status: string }[] = await this.ds.query(
      `SELECT g.id AS result_id, es.id AS session_id, es.name, g.status
         FROM examcollect.grading_result g
         JOIN examcollect.submission s ON s.id = g.submission_id
         JOIN examcollect.exam_session es ON es.id = s.exam_session_id
        WHERE es.teacher_id = $1 AND g.pipeline = 'investigator'
          AND NOT EXISTS (SELECT 1 FROM examcollect.teacher_review t WHERE t.grading_result_id = g.id AND t.kind = 'manual_score')
          AND EXISTS (SELECT 1 FROM (SELECT c.breakdown FROM examcollect.score_computation c
                                      WHERE c.grading_result_id = g.id ORDER BY c.created_at DESC LIMIT 1) last
                       WHERE last.breakdown -> 'errors' @> jsonb_build_array(jsonb_build_object('ruleId', $2::text)))
        ORDER BY es.name, g.id`,
      [teacherId, ruleId],
    );
    const open = new Map<string, PricePreview['openSessions'][number]>();
    const closed = new Map<string, PricePreview['finalizedSessions'][number]>();
    for (const r of rows) {
      if (r.status === 'finalized' || r.status === 'exported') {
        const s = closed.get(r.session_id) ?? { sessionId: r.session_id, name: r.name, affected: 0 };
        s.affected++;
        closed.set(r.session_id, s);
        continue;
      }
      const s = open.get(r.session_id) ?? { sessionId: r.session_id, name: r.name, affected: 0, autoAfter: 0, blockedByOtherUnpriced: 0 };
      s.affected++;
      const out = await this.scores.preview(r.result_id, (rules) =>
        rules.map((x) => (x.ruleId === ruleId ? { ...x, deductionHundredths: hundredths } : x)),
      );
      if (out.outcome === 'auto') s.autoAfter++;
      else if (out.breakdown.errorFlags.some((f) => f.code === 'unpriced')) s.blockedByOtherUnpriced++;
      open.set(r.session_id, s);
    }
    return { openSessions: [...open.values()], finalizedSessions: [...closed.values()] };
  }
}
```

`grading.module.ts`: `ErrorRuleService`, `PriceService` vào `providers`.

- [ ] **Step 6:** `pnpm --filter api test -- rule-input` + `pnpm --filter api test:e2e -- rules-prices score-service` → PASS.
- [ ] **Step 7:** Commit `feat(rules): bảng lỗi có bản sửa, bảng giá có phiên bản, xem trước tác động của một giá và một luật; thay đổi và lượt tính lại commit cùng nhau (§2.1, §2.2, T-RULEREV-1, T-VER-1, T-POL-5, T-POL-8)`.

---

### Task 6: Điểm hiện tại §14.2

**Files:** Create `apps/api/src/grading/scoring/current-score.ts`, test `current-score.spec.ts`; Modify `grading.service.ts` (`listForSession`, `GradingResultView`); Test `apps/api/test/grading-results-view.e2e-spec.ts` (mới).

**Interfaces — Produces:**
- `currentScore(x: CurrentScoreInput): CurrentScore` (thuần).
- `GradingResultView` thêm `pipeline`, `currentScore: number | null`, `currentScoreSource: CurrentScore['source']`. `finalScore` giữ nguyên nghĩa cũ (dòng review mang điểm mới nhất) để web hôm nay không vỡ.

```ts
// apps/api/src/grading/scoring/current-score.ts
import type { TeacherReviewKind } from '../grading-model.types';

export interface CurrentScoreInput {
  pipeline: 'one_shot' | 'investigator';
  aiTotalScore: string | null;
  /** Dòng `teacher_review` MANG điểm mới nhất (review | manual_score | bulk_accept). */
  latestScoredReview: { kind: TeacherReviewKind; finalScore: string } | null;
  latestManualScore: string | null;
  finalized: boolean;
  finalizedComputationScore: string | null;
  latestComputationScore: string | null;
}
export interface CurrentScore {
  value: number | null;
  source: 'manual' | 'review' | 'finalized' | 'computation' | 'ai' | 'none';
}

/** §14.2 — MỌI chỗ đọc điểm đi qua đúng hàm này. `ai_total_score` không bao giờ là điểm hiện tại của đường investigator. */
export function currentScore(x: CurrentScoreInput): CurrentScore {
  if (x.pipeline === 'one_shot') {
    if (x.latestScoredReview) return { value: Number(x.latestScoredReview.finalScore), source: 'review' };
    return x.aiTotalScore === null ? { value: null, source: 'none' } : { value: Number(x.aiTotalScore), source: 'ai' };
  }
  if (x.latestManualScore !== null) return { value: Number(x.latestManualScore), source: 'manual' };
  if (x.finalized && x.finalizedComputationScore !== null) return { value: Number(x.finalizedComputationScore), source: 'finalized' };
  if (x.latestComputationScore !== null) return { value: Number(x.latestComputationScore), source: 'computation' };
  return { value: null, source: 'none' };
}
```

- [ ] **Step 1: Test đỏ (unit).**

```ts
// apps/api/src/grading/scoring/current-score.spec.ts
import { currentScore, CurrentScoreInput } from './current-score';

const base: CurrentScoreInput = {
  pipeline: 'investigator', aiTotalScore: '8.50', latestScoredReview: null, latestManualScore: null,
  finalized: false, finalizedComputationScore: null, latestComputationScore: null,
};

describe('currentScore §14.2', () => {
  it('one_shot: review mang điểm mới nhất, không thì ai_total_score', () => {
    expect(currentScore({ ...base, pipeline: 'one_shot', latestScoredReview: { kind: 'review', finalScore: '6.00' } })).toEqual({ value: 6, source: 'review' });
    expect(currentScore({ ...base, pipeline: 'one_shot' })).toEqual({ value: 8.5, source: 'ai' });
  });
  it('investigator: chấm tay thắng cả phiên đã chốt', () => {
    expect(currentScore({ ...base, latestManualScore: '5.00', finalized: true, finalizedComputationScore: '9.00', latestComputationScore: '9.50' }))
      .toEqual({ value: 5, source: 'manual' });
  });
  it('investigator đã chốt: lượt tính ĐÃ CHỐT, không phải lượt mới nhất', () => {
    expect(currentScore({ ...base, finalized: true, finalizedComputationScore: '9.00', latestComputationScore: '9.50' }))
      .toEqual({ value: 9, source: 'finalized' });
  });
  it('investigator chưa chốt: lượt tính mới nhất', () => {
    expect(currentScore({ ...base, latestComputationScore: '7.25' })).toEqual({ value: 7.25, source: 'computation' });
  });
  it('investigator chưa có lượt tính: null, KHÔNG ai_total_score', () => {
    expect(currentScore(base)).toEqual({ value: null, source: 'none' });
  });
  it('investigator: dòng review / bulk_accept không phải điểm hiện tại', () => {
    expect(currentScore({ ...base, latestScoredReview: { kind: 'bulk_accept', finalScore: '1.00' }, latestComputationScore: '7.00' }))
      .toEqual({ value: 7, source: 'computation' });
  });
});
```

- [ ] **Step 2: Test đỏ (e2e)** — `grading-results-view.e2e-spec.ts` (khuôn `beforeAll` và `world()` của Task 4): ba bài cùng phiên — (a) `computeInitial` rồi `seedPrices` đổi `sai_bien` thành `'2.00'` + `recomputeForTeacher(price_change)` → `listForSession` trả `currentScore = 8`, `currentScoreSource = 'computation'`, `aiTotalScore` vẫn 8.5; (b) `computeInitial` rồi chèn thẳng `teacher_review` (`kind = 'manual_score'`, `final_score = 4`) → `currentScore = 4`, `'manual'`; (c) một bài `one_shot` (`seedResult` + `scoreResult`) → `currentScore = 7`, `'ai'`. Gọi `app.get(GradingService).listForSession(ctx.sessionId)`.
- [ ] **Step 3:** `listForSession`: thêm `tr.kind AS "kind"` vào truy vấn review có sẵn; thêm MỘT truy vấn lô cho mọi `ids`:

```sql
SELECT g.id AS "resultId",
       (SELECT c.score FROM examcollect.score_computation c
         WHERE c.grading_result_id = g.id ORDER BY c.created_at DESC LIMIT 1) AS "latestComputationScore",
       fc.score AS "finalizedComputationScore",
       (SELECT t.final_score FROM examcollect.teacher_review t
         WHERE t.grading_result_id = g.id AND t.kind = 'manual_score' ORDER BY t.reviewed_at DESC LIMIT 1) AS "latestManualScore"
  FROM examcollect.grading_result g
  LEFT JOIN examcollect.score_computation fc ON fc.id = g.finalized_computation_id
 WHERE g.id = ANY($1)
```

rồi `currentScore()` từng dòng; `finalized` = trạng thái `finalized` / `exported`.
- [ ] **Step 4:** PASS (unit + e2e; `grading-results`-liên quan e2e cũ vẫn xanh) → commit `feat(scoring): điểm hiện tại §14.2 — một hàm, danh sách kết quả đọc qua nó`.

---

### Task 7: Ngoại lệ cấp lỗi và chấm tay; đường duyệt một-phát từ chối bài đường điều tra

**Files:** Create `apps/api/src/grading/review/error-exception.service.ts`; Modify `teacher-review.service.ts` (`review()` và `isReviewable()`), `grading.module.ts`; Test `apps/api/test/error-exception.e2e-spec.ts`.

**Interfaces — Produces:**
- `ErrorExceptionService.setErrorException(teacherId, resultId, ruleId, direction: 'exclude' | 'include'): Promise<{ scoreHundredths: number | null; status: string }>`:
  1. `GradingService.findResultForOwner(resultId, teacherId)` (404 / 403 như route review); trong transaction: `ErrorRuleService.owned(m, teacherId, ruleId)` (404).
  2. `lockTeacherScoring(m, teacherId)`; `SELECT … FOR UPDATE` dòng kết quả; bài phải là `investigator`, ở `auto_approved | flagged_for_review | teacher_reviewed` (409 ngoài ra — `audit_pending` là việc của nhận xét kiểm mẫu, 3e; bài đã chốt thì không), có lượt tính mới nhất, và luật phải có trong `breakdown.errors` của lượt đó (400 *"Lỗi này không có trong lượt tính mới nhất của bài"*).
  3. Ghi `teacher_review` `kind = 'error_exception'`, `final_score = null`, `error_rule_id`, `direction`, `edited_criteria = []`.
  4. `ScoreService.recomputeOne(m, resultId, 'error_exception', teacherId)`.
  5. `advanceStatus(m, resultId, ['auto_approved', 'flagged_for_review'], 'teacher_reviewed', { flagForReview: false })` — không đổi gì nếu đã `teacher_reviewed` (§14.3: có người đã nhìn bài này).
- `ErrorExceptionService.setManualScore(teacherId, resultId, score: string): Promise<{ score: string; status: string }>` — cả hai đường; trạng thái `auto_approved | flagged_for_review | teacher_reviewed` (409 ngoài ra); `parseHundredths(score)` hợp lệ và `≤ tổng trần rubric của bài` (400); cùng khoá; ghi `teacher_review` `kind = 'manual_score'`, `final_score = score`, `edited_criteria = []`; dời `teacher_reviewed`. Bài không chấm được lớp `submission` (§2.2 *"Dùng cho bài không chấm được lớp `submission`"*) đi đường này: `ck_grading_result_ungradable` không đụng tới vì `ai_total_score` vẫn null. Từ đó `recomputeForTeacher` bỏ qua bài này (Task 4 đã lọc).
- `TeacherReviewService.isReviewable(result)` → `false` với `pipeline = 'investigator'` (duyệt hàng loạt BỎ QUA bài đó); `review()` ném `ConflictException('Bài chấm theo bảng lỗi — sửa điểm bằng bỏ lỗi hoặc chấm tay, không bằng sửa tiêu chí')` với bài `investigator`. Lý do: `review()` tính điểm từ verdict từng tiêu chí của `criterion_results` — khuôn `one_shot`, bài đường điều tra không có — và dòng `review` không phải điểm hiện tại của đường đó (§14.2), nên bài sẽ sang `teacher_reviewed` với một con số không ai đọc.

- [ ] **Step 1: Test đỏ** — `error-exception.e2e-spec.ts`, khuôn `beforeAll` và `world()` của Task 4:
  - (a) T-POL-6 + T-REVIEW-1: bài có luật `bien_2` chưa giá → gắn cờ → `setErrorException(sai_bien, 'exclude')` → điểm lượt mới = trước + 1,50; trạng thái `teacher_reviewed`; đúng MỘT dòng `teacher_review` `error_exception`, `final_score` null; số dòng `error_rule` của giảng viên KHÔNG đổi.
  - (a') T-REVIEW-1 cạnh còn lại: bài tự quyết (`auto_approved`) bỏ `ten_bien` → lượt tính thoả công thức → vẫn `teacher_reviewed`, KHÔNG `auto_approved`.
  - (b) T-EXC-1: sau (a), `PriceService.setPrice(sai_bien, '3.00')` → lượt tính mới của bài, điểm KHÔNG đổi; `setPrice(ten_bien, '1.00')` → điểm giảm 0,50.
  - (c) T-EXC-2: `include` sau `exclude` → lỗi tính lại vào điểm.
  - (d) chấm tay `'4.00'` → `listForSession` trả `currentScore = 4`, `'manual'`; `setPrice` sau đó không sinh lượt tính cho bài đó.
  - (e) bài đã chốt → 409; bài `audit_pending` → 409.
  - (f) luật của giảng viên khác → 404; luật không có trong lượt tính mới nhất → 400; chấm tay vượt trần rubric (`'10.01'`) → 400.
  - (g) `TeacherReviewService.review()` trên bài `investigator` → 409; `isReviewable` → false.
- [ ] **Step 2:** service + sửa `TeacherReviewService` → PASS; `teacher-review`, `bulk-review` e2e vẫn xanh.
- [ ] **Step 3:** Commit `feat(review): bỏ / giữ một lỗi cho riêng một bài và chấm tay — một dòng teacher_review, không sinh luật, bài sang teacher_reviewed; đường duyệt một-phát từ chối bài đường điều tra (§2.2, T-EXC-1/2, T-POL-6, T-REVIEW-1)`.

---

### Task 8: Đánh dấu "tiêu chí không có luật trừ"

**Files:** Create `apps/api/src/grading/rules/criterion-waiver.service.ts`; Modify `grading.module.ts`; Test `apps/api/test/criterion-waiver.e2e-spec.ts`.

**Interfaces — Produces:**
- `CriterionWaiverService.set(teacherId, rubricId, criterionKey): Promise<{ waiverId: string; recompute: RecomputeSummary | null }>` — rubric của giảng viên (`rubric.teacher_id`; 404 khác); tiêu chí phải có trong rubric (400 *"Tiêu chí … không có trong rubric này"* — kiểm trước, không trông vào lỗi khoá ngoại); đã có đánh dấu còn hiệu lực → trả nó, `recompute = null`, không ghi thêm (bấm hai lần là chuyện thường).
- `CriterionWaiverService.revoke(teacherId, waiverId): Promise<{ recompute: RecomputeSummary }>` — đánh dấu thuộc rubric của giảng viên (404 khác); đã gỡ → 409.
- `CriterionWaiverService.list(teacherId, rubricId): Promise<{ id: string; criterionKey: string; setAt: Date }[]>` — đánh dấu còn hiệu lực.
- `set` và `revoke`: CÙNG transaction → `ScoreService.recomputeForTeacher(m, t, 'criterion_waiver', t, { rubricId })`.

- [ ] **Step 1: Test đỏ** (T-WAIVER-1 đầy đủ): phiên của `world()` thêm tiêu chí `hieu_nang` (trần 1, `seedCriterion`) TRƯỚC khi chấm → `computeInitial` → bài gắn cờ `criterion_without_rules`; đánh dấu giữa lô (rubric đã có kết quả chấm — `guard_rubric_criteria_immutable` không bắn) → ghi được, một lượt tính lý do `criterion_waiver`, bài lên `auto_approved`; gỡ → bài về `flagged_for_review`; đánh dấu lần hai khi đang có hiệu lực → không dòng mới; rubric của giảng viên khác → 404; `criterionKey` không có trong rubric → 400.
- [ ] **Step 2:** service → PASS → commit `feat(rules): đánh dấu tiêu chí không có luật trừ giữa lô — tính lại tầng luật (§4.2, T-WAIVER-1)`.

---

### Task 9: Chốt điểm đường điều tra, ghim giá, áp giá mới cho phiên đã chốt

**Files:** Modify `apps/api/src/grading/teacher-review.service.ts` (`finalizeGrades`), `apps/api/src/grading/scoring/score.service.ts` (`reapplyFinalizedSession`, constructor nhận `AuditLogService`); Test `apps/api/test/finalize-investigator.e2e-spec.ts`.

**Interfaces — Produces:**
- `finalizeGrades` — thêm, trong transaction có sẵn (không đổi constructor của `TeacherReviewService`: chỉ gọi hàm của `score-inputs.ts`):
  - Đầu tiên `lockTeacherScoring(manager, teacherId của phiên)`: không lượt tính lại nào chen giữa lúc đọc lượt tính và lúc chốt.
  - Bài `investigator` ở `auto_approved` → THẲNG `finalized` (không ghi `teacher_review`, §14.2) kèm `finalizedComputationId` = `latestComputationRow(…).id` + `FinalizeStamp`; không có lượt tính → `ConflictException` (bài tự quyết mà không có lượt tính là dữ liệu hỏng, không chốt im lặng).
  - Bài `investigator` ở `teacher_reviewed` → `finalized` kèm `finalizedComputationId` = lượt tính mới nhất (null nếu bài chỉ có chấm tay).
  - Đường `one_shot`: giữ nguyên.
  - Sau vòng lặp: `exam_session.pinned_price_version_id` = `currentPriceVersion(manager, teacherId của phiên)?.id ?? null`.
  - `FinalizeGradesOutcome` thêm `finalizedDirectly: number`.
- `ScoreService.reapplyFinalizedSession(sessionId, teacherId): Promise<{ changed: number }>` — một transaction, `lockTeacherScoring`:
  - Phiên phải đã chốt (có kết quả, và mọi kết quả `finalized` / `exported`) — không thì `ConflictException('Phiên chưa chốt — giá mới đã tự áp cho phiên chưa chốt')`.
  - Với mỗi bài `investigator` `finalized` / `exported`, có lượt chấm `graded`, không chấm tay (`ORDER BY g.id FOR UPDATE OF g`): tính theo giá HIỆN HÀNH; điểm khác lượt tính đã chốt → ghi `score_computation` `finalized_reapply` (`created_by` = người bấm), cập nhật `finalized_computation_id`, và MỘT dòng `audit_log` qua `AuditLogService.recordUserAction(…, m)`: `action = 'grading_result.score_reapplied_after_finalize'`, `targetType = 'grading_result'`, `oldValue = { score, priceTableVersionId, computationId }`, `newValue = { score, priceTableVersionId, computationId, changedRules: [{ ruleId, ruleKey, oldDeduction, newDeduction }] }` — `changedRules` là lỗi `counted` của hai `breakdown` có mức trừ khác nhau (Security rule 4; §2.2 *"người bấm, luật, giá cũ, giá mới, điểm cũ, điểm mới"*).
  - Cuối cùng `pinned_price_version_id` = phiên bản hiện hành.
  - `AuditLogService` đến từ `AdminModule`, GradingModule đã import nó.

- [ ] **Step 1: Test đỏ** — `finalize-investigator.e2e-spec.ts`. Dựng MỘT giảng viên với hai phiên: `A = await seedSession(ds, 'fin-a')`, `B = await seedSession(ds, 'fin-b', { teacherId: A.teacherId, startHoursAgo: 10 })`; `seedInvestigatorSession` cho cả hai; luật `sai_bien`, `ten_bien` và bảng giá v1 của giảng viên đó (một lần); mỗi phiên hai bài `seedInvestigatorResult` + `computeInitial` (đều `auto_approved`).
  - (a) T-FIN-2: `finalizeGrades(A)` → mọi bài của A `finalized`, `finalized_by` = giảng viên; KHÔNG có dòng `teacher_review` mới; `finalized_computation_id` trỏ lượt tính mới nhất; kết quả `finalizedDirectly = 2`.
  - (b) T-VER-2: `score_computation.price_table_version_id` của `finalized_computation_id` = v1; `exam_session.pinned_price_version_id` của A = v1.
  - (c) T-PIN-1: `PriceService.setPrice(sai_bien, '2.00')` → mỗi bài của B có lượt tính mới, bài của A không; không dòng `audit_log` nào có `action = 'grading_result.score_reapplied_after_finalize'`; `PriceService.preview(sai_bien, '2.50')` trả A trong `finalizedSessions` (`affected = 2`) và B trong `openSessions`.
  - (d) T-FIN-1: `reapplyFinalizedSession(A)` → `changed = 2`; đúng 2 dòng `audit_log` với `actor_id` = giảng viên, `old_value.score = '8.50'`, `new_value.score = '8.00'`; `pinned_price_version_id` của A = v2; gọi lần hai → `changed = 0`, không dòng log nào thêm.
  - (e) `reapplyFinalizedSession(B)` (chưa chốt) → 409.
- [ ] **Step 2:** sửa `finalizeGrades` + `reapplyFinalizedSession` → PASS; `teacher-review`, `bulk-review`, `grading-lifecycle-v2` vẫn xanh.
- [ ] **Step 3:** Commit `feat(grading): chốt điểm đường điều tra ghi lượt tính đã chốt và ghim bảng giá; áp giá mới cho phiên đã chốt có audit từng bài (§2.2, §14.2, T-FIN-1/2, T-PIN-1, T-VER-2)`.

---

### Task 10: Route cho 3f

**Files:** Create `apps/api/src/grading/rules/rules.controller.ts`, `rules/dto/rule-body.dto.ts`, `rules/dto/price-body.dto.ts`, `rules/dto/rule-state.dto.ts`, `rules/dto/criterion-waiver.dto.ts`, `review/dto/error-exception.dto.ts`, `review/dto/manual-score.dto.ts`; Modify `grading.module.ts` (`controllers`, `providers` thêm `ErrorExceptionService`, `CriterionWaiverService`), `grading.controller.ts` (hai route trên kết quả, một trên phiên); Test `apps/api/test/rules-routes.e2e-spec.ts`.

| Route | Gọi |
|---|---|
| `GET /rules` | `ErrorRuleService.list` |
| `GET /rules/missing` | `ErrorRuleService.missing` |
| `POST /rules` | `parseRuleInput(body)` → `create` |
| `POST /rules/preview` | `parseRuleInput(body)` + `parseDeduction(body.deduction ?? null)` → `ErrorRuleService.preview` — KHÔNG ghi |
| `PATCH /rules/:id` | `parseRuleChanges(body)` → `revise` |
| `POST /rules/:id/state` | `setState` — body `{ state: 'active' \| 'dismissed' \| 'retired' }` (`@IsIn`) |
| `POST /rules/:id/price/preview` | `parseDeduction(body.deduction)` → `PriceService.preview` — KHÔNG ghi |
| `PUT /rules/:id/price` | `parseDeduction(body.deduction)` → `PriceService.setPrice` |
| `GET /rubrics/:id/criterion-waivers` | `CriterionWaiverService.list` |
| `POST /rubrics/:id/criterion-waivers` | `set` — body `{ criterionKey }` |
| `POST /criterion-waivers/:id/revoke` | `revoke` |
| `POST /grading-results/:id/error-exceptions` | `ErrorExceptionService.setErrorException` — body `{ ruleId, direction }` (`@IsUUID`, `@IsIn`) |
| `POST /grading-results/:id/manual-score` | `setManualScore` — body `{ score }` |
| `POST /exam-sessions/:id/reapply-prices` | `ExamSessionService.findEntityForOwner` rồi `ScoreService.reapplyFinalizedSession` |

- Mọi route `@Roles('teacher')` dưới `@UseGuards(JwtAuthGuard, RolesGuard)`, `teacherId = req.user!.sub`; không route nào nhận `teacherId` từ body; `:id` qua `ParseUUIDPipe`.
- `ValidationPipe({ whitelist: true })` bỏ mọi trường không có decorator. DTO luật khai từng trường: `ruleKey`, `name`, `description`, `criterionKey` `@IsOptional() @IsString()`; `predicate` `@IsOptional() @Allow()`; `deduction` `@IsOptional() @Allow()` — rồi controller gọi `parseRuleInput` / `parseRuleChanges` / `parseDeduction` (Task 5): MỘT chỗ kiểm cho cả route lẫn service. Giá, điểm là chuỗi — `@Allow()` rồi `parseDeduction` / `parseHundredths` ném 400 với `number` — cùng lý do §13.2.
- Route tĩnh `rules/missing`, `rules/preview` khai TRƯỚC `rules/:id` trong controller.

Test HTTP (khuôn `session-rubric.e2e-spec.ts`: `createTestAccount`, token): (a) `POST /rules` → 201, `GET /rules` thấy nó; trùng `ruleKey` → 409; (b) `POST /rules/:id/price/preview` không sinh phiên bản giá nào, `PUT /rules/:id/price` sinh đúng một; (c) giảng viên B `PUT /rules/{luật của A}/price` → 404; (d) `predicate: {kind:'eval_code'}` → 400; (e) `manual-score` với `"7.555"` → 400, với `7.5` (number) → 400; (f) không token → 401.

- [ ] Steps: test đỏ → DTO + controller → PASS → commit `feat(rules): route bảng lỗi, bảng giá, đánh dấu tiêu chí, ngoại lệ, chấm tay, áp giá cho phiên đã chốt`.

---

### Task 11: Kiểm cuối

- [ ] `pnpm --filter api test`; `pnpm --filter api test:e2e` (ca đỏ sẵn `exam-authoring-attach` *"phiên chưa tới giờ thi"* ghi nhận, không sửa); `pnpm --filter api build`; `pnpm --filter api exec eslint "src/**/*.ts" "test/**/*.ts"`; `pnpm --filter web build`.
- [ ] `entity-schema` e2e vẫn xanh.
- [ ] Commit nếu có sửa lặt vặt; ledger ghi kết quả.
