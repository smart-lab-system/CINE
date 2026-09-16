# Duyệt hàng loạt & can thiệp theo tiêu chí — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Một route ghi hàng loạt + màn Ma trận điều hành, để giảng viên xử lý 45 bài bị giữ lại trong 15 phút thay vì mở từng bài.

**Architecture:** Một route `POST /exam-sessions/:id/bulk-review` nhận một union bốn luật. Bốn luật là hàm thuần trong một file leaf. Máy móc duyệt (giao dịch, cổng trạng thái, audit) **dùng lại** `review()` qua một `reviewWithin(manager, …)` rút ra — một cài đặt, hai đường vào.

**Tech Stack:** NestJS 10 + TypeORM + Postgres (`apps/api`, jest) · Next.js 15 App Router + React 19 + TanStack Query + Tailwind (`apps/web`, vitest).

**Spec:** `docs/superpowers/specs/2026-09-16-bulk-review-design.md` (rev 2)

## Global Constraints

- **Nhánh nền:** `feature/grading-ui-waves-0-3` sau khi PR #33 merge. Tạo nhánh `feature/grading-bulk-review`.
- **Security rule 4 không có ngoại lệ cho thao tác hàng loạt.** Bài đã `finalized`/`exported` → **một dòng audit mỗi bài**, trong cùng giao dịch.
- **Security rule 6.** Không đường nào ghi đè `ai_total_score` / `criterion_results` / `advocate_opinion` / `context_used_*`.
- **`validateAndTotal` từ chối `points > maxPoints`** → mọi luật phải chặn trần, và phải phủ **đủ** mọi tiêu chí của rubric.
- **`main.ts` chạy `ValidationPipe({ whitelist: true })` KHÔNG kèm `forbidNonWhitelisted`** — trường chưa khai trong DTO bị cắt **im lặng** và request vẫn 2xx.
- **Chữ trên màn hình dùng ngôn ngữ khảo thí.** Bảng quy đổi ở spec giao diện §3.2: Advocate → *lượt phản biện*; Grader → *lượt chấm*.
- **Màu/chữ lấy từ token sẵn có.** Không literal; Inter; `<Badge>` và `<Button>` sẵn có, không tự vẽ pill.
- **File `< 500` dòng.** `teacher-review.service.ts` hiện 346 dòng — Task 3 không được đẩy nó qua 500. `bulk-review.service.ts` là file RIÊNG, theo đúng tiền lệ `GradingRunService` tách khỏi `GradingService`.
- **`pnpm check:cycles` phải in `0`.**
- **Ba chi tiết môi trường đã biết** (từ đợt 0→3): script dev của API là `pnpm dev` · e2e xác thực bằng `Authorization: Bearer` · repo **không có** `@testing-library/user-event`, dùng `fireEvent`.
- **Lỗi tsc CÓ SẴN trên nhánh nền:** `apps/web/src/lib/read-workbook.test.ts` có 2 lỗi `File` của buffer vs DOM, và `exam-sessions/new/page.tsx` có 1 cảnh báo lint `'z' unused`. Không thuộc phạm vi.
- **Sau mỗi task:** `npx tsc --noEmit`, chạy test của task, rồi commit.

---

## Cấu trúc file

**API**

| File | Trách nhiệm |
|---|---|
| `src/grading/bulk-rules.ts` (mới) | Bốn luật, hàm thuần. Chỉ import type + `pointsFor` |
| `src/grading/dto/bulk-review.dto.ts` (mới) | DTO + union luật, có `@ValidateNested` |
| `src/grading/bulk-review.service.ts` (mới) | Điều phối một lô: kiểm quyền, khoá hàng, gọi `reviewWithin` N lần |
| `src/grading/teacher-review.service.ts` (sửa) | Rút `reviewWithin(manager, …)` ra; `review()` thành vỏ mở giao dịch |
| `src/grading/entities/teacher-review.entity.ts` (sửa) | `+appliedRule` |
| `src/database/migrations/1789280000000-*.ts` (mới) | Cột `applied_rule jsonb NULL` |
| `src/grading/grading.controller.ts` (sửa) | `+POST bulk-review` |
| `src/grading/grading.module.ts` (sửa) | `+BulkReviewService` |

**Web**

| File | Trách nhiệm |
|---|---|
| `src/lib/grading-triage.ts` (sửa) | `+deltaGroupOf`, `+DeltaGroup` |
| `src/lib/api/grading.ts` (sửa) | `+bulkReview` |
| `src/hooks/useGrading.ts` (sửa) | `+useBulkReview` |
| `src/app/teacher/grading/matrix/page.tsx` (mới) | Lắp màn |
| `.../matrix/_components/DeltaGroups.tsx` (mới) | Bốn nhóm, bấm để lọc |
| `.../matrix/_components/MatrixTable.tsx` (mới) | Bảng nén 7 cột + checkbox |
| `.../matrix/_components/BulkActionBar.tsx` (mới) | Thanh hành động + danh sách bỏ qua |
| `.../matrix/_components/CriterionAdjustPanel.tsx` (mới) | Cộng bù / cho điểm tối đa |

---

## Task 1: `bulk-rules.ts` — bốn luật, hàm thuần

**Files:**
- Create: `apps/api/src/grading/bulk-rules.ts`
- Test: `apps/api/src/grading/bulk-rules.spec.ts`

**Interfaces:**
- Consumes: `pointsFor(verdict, maxPoints)` và type `CriterionResult`, `CriterionVerdict` từ `./ai-provider/ai-grading-provider`; `AdvocateOpinion` từ `./ai-provider/advocate.types`
- Produces:
  ```ts
  export type BulkRule =
    | { kind: 'keep_ai' }
    | { kind: 'apply_advocate' }
    | { kind: 'criterion_full_marks'; criterionId: string }
    | { kind: 'criterion_bonus'; criterionId: string; points: number };
  export interface RuleCriterion { criterionId: string; verdict: CriterionVerdict; points: number }
  export interface RuleInput {
    rubricCriteria: { id: string; maxPoints: number }[];
    criterionResults: CriterionResult[];
    advocateOpinion: AdvocateOpinion | null;
  }
  export type RuleOutcome =
    | { ok: true; criteria: RuleCriterion[] }
    | { ok: false; reason: 'no_advocate' };
  export function applyRule(rule: BulkRule, input: RuleInput): RuleOutcome;
  ```

**Dùng lại `pointsFor` của server, KHÔNG chép lại.** Nó ở `ai-grading-provider.ts` — cũng là leaf — nên leaf-import-leaf không tạo vòng. Chép lại là tạo ra đúng thứ sẽ trôi khi ai đó đổi bậc `partially_met`.

- [ ] **Step 1: Viết test thất bại**

Tạo `apps/api/src/grading/bulk-rules.spec.ts`:

```ts
import { applyRule, type RuleInput } from './bulk-rules';
import type { AdvocateOpinion } from './ai-provider/advocate.types';

const RUBRIC = [
  { id: 'c1', maxPoints: 4 },
  { id: 'c2', maxPoints: 3 },
];

function input(over: Partial<RuleInput> = {}): RuleInput {
  return {
    rubricCriteria: RUBRIC,
    criterionResults: [
      { criterionId: 'c1', verdict: 'not_met', points: 0, evidence: 'a' },
      { criterionId: 'c2', verdict: 'partially_met', points: 1.5, evidence: 'b' },
    ],
    advocateOpinion: null,
    ...over,
  };
}

function opinion(over: Partial<AdvocateOpinion> = {}): AdvocateOpinion {
  return {
    isCorrect: 'yes',
    reasoning: 'Em ấy mô tả đúng cơ chế.',
    evidence: [],
    suggestedVerdicts: [],
    unverifiedEvidence: [],
    usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 },
    ...over,
  };
}

describe('applyRule — keep_ai', () => {
  it('chép nguyên mức đánh giá và điểm của AI', () => {
    const got = applyRule({ kind: 'keep_ai' }, input());
    expect(got).toEqual({
      ok: true,
      criteria: [
        { criterionId: 'c1', verdict: 'not_met', points: 0 },
        { criterionId: 'c2', verdict: 'partially_met', points: 1.5 },
      ],
    });
  });

  it('AI trả THIẾU một tiêu chí → output vẫn phủ ĐỦ rubric', () => {
    // `validateAndTotal` ném 400 nếu payload không phủ đủ. Duyệt theo đầu ra
    // AI thay vì theo rubric sẽ làm hỏng CẢ LÔ vì một bài.
    const got = applyRule(
      { kind: 'keep_ai' },
      input({ criterionResults: [{ criterionId: 'c1', verdict: 'met', points: 4, evidence: '' }] }),
    );
    expect(got.ok).toBe(true);
    expect((got as { criteria: unknown[] }).criteria).toHaveLength(2);
    expect((got as { criteria: { criterionId: string; points: number }[] }).criteria[1]).toEqual({
      criterionId: 'c2',
      verdict: 'not_met',
      points: 0,
    });
  });
});

describe('applyRule — apply_advocate', () => {
  it('KHÔNG BAO GIỜ làm tụt điểm — khẳng định trên MỌI tiêu chí', () => {
    // Kiến nghị c1 lên met (0 → 4) và c2 xuống not_met (1.5 → 0).
    // Vế thứ hai phải bị chặn: max từng tiêu chí, không ghi đè mù.
    const got = applyRule(
      { kind: 'apply_advocate' },
      input({
        advocateOpinion: opinion({
          suggestedVerdicts: [
            { criterionId: 'c1', suggestedVerdict: 'met', why: '' },
            { criterionId: 'c2', suggestedVerdict: 'not_met', why: '' },
          ],
        }),
      }),
    );
    expect(got.ok).toBe(true);
    const criteria = (got as { criteria: { criterionId: string; points: number }[] }).criteria;
    const ai = input().criterionResults;
    for (const row of criteria) {
      const before = ai.find((c) => c.criterionId === row.criterionId)!;
      expect(row.points).toBeGreaterThanOrEqual(before.points);
    }
    expect(criteria[0].points).toBe(4);
    expect(criteria[1].points).toBe(1.5);
  });

  it('không có ý kiến phản biện → no_advocate', () => {
    expect(applyRule({ kind: 'apply_advocate' }, input())).toEqual({
      ok: false,
      reason: 'no_advocate',
    });
  });
});

describe('applyRule — criterion_full_marks', () => {
  it('chỉ động vào tiêu chí đã nêu', () => {
    const got = applyRule({ kind: 'criterion_full_marks', criterionId: 'c1' }, input());
    const criteria = (got as { criteria: { criterionId: string; verdict: string; points: number }[] }).criteria;
    expect(criteria[0]).toEqual({ criterionId: 'c1', verdict: 'met', points: 4 });
    expect(criteria[1]).toEqual({ criterionId: 'c2', verdict: 'partially_met', points: 1.5 });
  });
});

describe('applyRule — criterion_bonus', () => {
  it('chặn TRẦN — không chặn là 400 cả lô', () => {
    const got = applyRule({ kind: 'criterion_bonus', criterionId: 'c2', points: 5 }, input());
    const criteria = (got as { criteria: { points: number; verdict: string }[] }).criteria;
    expect(criteria[1].points).toBe(3);
    expect(criteria[1].verdict).toBe('met');
  });

  it('suy nhãn TỪ điểm: giữa trần và 0 là partially_met', () => {
    const got = applyRule({ kind: 'criterion_bonus', criterionId: 'c1', points: 1 }, input());
    const criteria = (got as { criteria: { points: number; verdict: string }[] }).criteria;
    expect(criteria[0]).toEqual({ criterionId: 'c1', verdict: 'partially_met', points: 1 });
  });

  it('cộng 0 vào tiêu chí đang 0 thì vẫn là not_met', () => {
    const got = applyRule({ kind: 'criterion_bonus', criterionId: 'c1', points: 0 }, input());
    const criteria = (got as { criteria: { verdict: string }[] }).criteria;
    expect(criteria[0].verdict).toBe('not_met');
  });

  it('tiêu chí không có trong rubric → không đổi gì', () => {
    const got = applyRule({ kind: 'criterion_bonus', criterionId: 'c-la', points: 2 }, input());
    expect(got).toEqual(applyRule({ kind: 'keep_ai' }, input()));
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận nó ĐỎ**

Run: `cd apps/api && npx jest src/grading/bulk-rules.spec.ts`
Expected: FAIL — `Cannot find module './bulk-rules'`

- [ ] **Step 3: Cài đặt**

Tạo `apps/api/src/grading/bulk-rules.ts`:

```ts
import {
  pointsFor,
  type CriterionResult,
  type CriterionVerdict,
} from './ai-provider/ai-grading-provider';
import type { AdvocateOpinion } from './ai-provider/advocate.types';

/**
 * Bốn cách biến một kết quả AI thành một lượt duyệt của giảng viên.
 *
 * FILE LEAF về mặt nghiệp vụ: chỉ import type và `pointsFor` — bản thân
 * `ai-grading-provider.ts` cũng là leaf, nên không có vòng nào. `pointsFor`
 * được DÙNG LẠI chứ không chép: chép nó là tạo ra đúng thứ sẽ trôi khỏi bản
 * gốc khi ai đó đổi bậc `partially_met`.
 */
export type BulkRule =
  | { kind: 'keep_ai' }
  | { kind: 'apply_advocate' }
  | { kind: 'criterion_full_marks'; criterionId: string }
  | { kind: 'criterion_bonus'; criterionId: string; points: number };

export interface RuleCriterion {
  criterionId: string;
  verdict: CriterionVerdict;
  points: number;
}

export interface RuleInput {
  /**
   * Nguồn sự thật cho "phải có tiêu chí nào" — KHÔNG phải `criterionResults`.
   *
   * `validateAndTotal` ném 400 nếu payload không phủ đủ mọi tiêu chí của
   * rubric. Nếu AI trả thiếu một tiêu chí (guard G3 chặn, nhưng phòng thủ
   * vẫn rẻ) thì duyệt theo đầu ra AI sinh payload thiếu và làm hỏng CẢ LÔ.
   */
  rubricCriteria: { id: string; maxPoints: number }[];
  criterionResults: CriterionResult[];
  advocateOpinion: AdvocateOpinion | null;
}

export type RuleOutcome =
  | { ok: true; criteria: RuleCriterion[] }
  | { ok: false; reason: 'no_advocate' };

/**
 * Nhãn suy TỪ điểm, không ngược lại.
 *
 * `pointsFor()` chỉ có ba bậc, còn chấm thật cần 3/5. `ReviewCriterionDto` đã
 * ghi rõ giảng viên sửa ĐIỂM trực tiếp và `verdict` là nhãn định tính đi kèm,
 * và `validateAndTotal` không kiểm hai thứ khớp nhau.
 */
function verdictForPoints(points: number, maxPoints: number): CriterionVerdict {
  if (points >= maxPoints) return 'met';
  if (points <= 0) return 'not_met';
  return 'partially_met';
}

/** Điểm AI đã cho tiêu chí này, 0 nếu AI không nói gì về nó. */
function aiPointsOf(input: RuleInput, criterionId: string): number {
  return input.criterionResults.find((row) => row.criterionId === criterionId)?.points ?? 0;
}

function aiVerdictOf(input: RuleInput, criterionId: string): CriterionVerdict {
  return input.criterionResults.find((row) => row.criterionId === criterionId)?.verdict ?? 'not_met';
}

export function applyRule(rule: BulkRule, input: RuleInput): RuleOutcome {
  if (rule.kind === 'apply_advocate' && !input.advocateOpinion) {
    return { ok: false, reason: 'no_advocate' };
  }

  const suggested = new Map(
    (input.advocateOpinion?.suggestedVerdicts ?? []).map((s) => [s.criterionId, s.suggestedVerdict]),
  );

  // Duyệt theo RUBRIC, không theo đầu ra AI — xem `RuleInput.rubricCriteria`.
  const criteria = input.rubricCriteria.map<RuleCriterion>((criterion) => {
    const aiPoints = aiPointsOf(input, criterion.id);

    switch (rule.kind) {
      case 'keep_ai':
        return {
          criterionId: criterion.id,
          verdict: aiVerdictOf(input, criterion.id),
          points: aiPoints,
        };

      case 'apply_advocate': {
        const verdict = suggested.get(criterion.id);
        if (verdict === undefined) {
          return {
            criterionId: criterion.id,
            verdict: aiVerdictOf(input, criterion.id),
            points: aiPoints,
          };
        }
        // MAX theo từng tiêu chí, không ghi đè mù. Đây là thứ mua được bảo
        // đảm "áp kiến nghị phản biện không bao giờ làm tụt điểm", và nó an
        // toàn kể cả khi phản biện lỡ kiến nghị một mức thấp hơn.
        const points = Math.max(aiPoints, pointsFor(verdict, criterion.maxPoints));
        return {
          criterionId: criterion.id,
          verdict: verdictForPoints(points, criterion.maxPoints),
          points,
        };
      }

      case 'criterion_full_marks':
        if (criterion.id !== rule.criterionId) {
          return {
            criterionId: criterion.id,
            verdict: aiVerdictOf(input, criterion.id),
            points: aiPoints,
          };
        }
        return { criterionId: criterion.id, verdict: 'met', points: criterion.maxPoints };

      case 'criterion_bonus': {
        if (criterion.id !== rule.criterionId) {
          return {
            criterionId: criterion.id,
            verdict: aiVerdictOf(input, criterion.id),
            points: aiPoints,
          };
        }
        // Chặn trần, im lặng. Không chặn thì một bài đã ở điểm tối đa nhận
        // `+2` sẽ vượt `maxPoints` và 400 CẢ LÔ. Nhãn trên UI nói ra trần.
        const points = Math.min(aiPoints + rule.points, criterion.maxPoints);
        return {
          criterionId: criterion.id,
          verdict: verdictForPoints(points, criterion.maxPoints),
          points,
        };
      }
    }
  });

  return { ok: true, criteria };
}
```

- [ ] **Step 4: Chạy test để xác nhận nó XANH**

Run: `cd apps/api && npx jest src/grading/bulk-rules.spec.ts && node ../../scripts/find-import-cycles.js src`
Expected: PASS, và số vòng lặp in ra là `0`

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/grading/bulk-rules.ts apps/api/src/grading/bulk-rules.spec.ts
git commit -m "feat(grading): bốn luật duyệt hàng loạt, hàm thuần"
```

---

## Task 2: Cột `applied_rule` — luật đã áp phải đọc lại được từ chính dòng ấy

**Files:**
- Create: `apps/api/src/database/migrations/1789280000000-AddTeacherReviewAppliedRule.ts`
- Modify: `apps/api/src/grading/entities/teacher-review.entity.ts`

**Interfaces:**
- Produces: `TeacherReviewEntity.appliedRule: BulkRule | null`

**Vì sao cột này tồn tại:** audit chỉ bắn khi bài **đã công bố**. Với ca thường gặp nhất — duyệt hàng loạt **trước** khi chốt — luật đã áp không được ghi ở đâu cả, nên câu trả lời cho sinh viên khiếu nại không tái dựng được từ dữ liệu.

- [ ] **Step 1: Viết migration**

```ts
import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Luật hàng loạt nào đã sinh ra dòng duyệt này.
 *
 * `null` = duyệt tay từng bài (đường đã có). Khác `null` = do một luật hàng
 * loạt sinh ra, và luật đó đọc lại được từ chính dòng ấy.
 *
 * VÌ SAO KHÔNG DỰA VÀO AUDIT: `review()` chỉ ghi audit khi bài đã công bố
 * (`PUBLISHED.includes(result.status)`). Duyệt hàng loạt TRƯỚC khi chốt điểm
 * — ca thường gặp nhất — không sinh dòng audit nào, nên luật đã áp sẽ biến
 * mất. Khi sinh viên hỏi "vì sao em được điểm này", câu trả lời trung thực
 * "hệ thống lấy mức cao hơn giữa hai lượt chấm trên từng tiêu chí" phải tái
 * dựng được từ dữ liệu, không phải từ trí nhớ của giảng viên.
 *
 * VÌ SAO KHÔNG NHÉT VÀO `edited_criteria`: cột đó đang lưu MẢNG tiêu chí (ép
 * kiểu qua `as unknown as Record<string, unknown>`), nên thêm một khoá anh em
 * sẽ đổi hình dạng của mọi dòng đã có.
 *
 * Không trigger nào bắn trên `teacher_review` — ba trigger bất biến ở
 * `grading_result`, `rubric_criterion` và `submission`.
 */
export class AddTeacherReviewAppliedRule1789280000000 implements MigrationInterface {
  name = 'AddTeacherReviewAppliedRule1789280000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "examcollect"."teacher_review"
        ADD COLUMN "applied_rule" jsonb NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "examcollect"."teacher_review" DROP COLUMN "applied_rule"
    `);
  }
}
```

- [ ] **Step 2: Thêm cột vào entity**

Trong `apps/api/src/grading/entities/teacher-review.entity.ts`, thêm sau `studentFeedback`:

```ts
  /**
   * Luật hàng loạt đã sinh ra dòng này. `null` = duyệt tay từng bài.
   *
   * Đây là thứ trả lời được "vì sao em được điểm này" cho một dòng bất kỳ,
   * kể cả dòng chưa bao giờ đi qua audit (audit chỉ bắn sau khi chốt điểm).
   */
  @Column({ name: 'applied_rule', type: 'jsonb', nullable: true })
  appliedRule!: BulkRule | null;
```

và import ở đầu file:

```ts
import type { BulkRule } from '../bulk-rules';
```

- [ ] **Step 3: Chạy migration và typecheck**

Run:
```bash
cd apps/api && pnpm migration:run && npx tsc --noEmit
```
Expected: `Migration AddTeacherReviewAppliedRule1789280000000 has been executed successfully`, tsc sạch

- [ ] **Step 4: Xác nhận cột có thật**

Run:
```bash
docker exec cine-postgres-1 psql -U postgres -d examcollect -c "\d examcollect.teacher_review" | grep applied_rule
```
Expected: một dòng có `applied_rule | jsonb`

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/database/migrations apps/api/src/grading/entities/teacher-review.entity.ts
git commit -m "feat(grading): teacher_review ghi lại luật hàng loạt đã sinh ra nó"
```

---

## Task 3: Rút `reviewWithin` ra khỏi `review()` — refactor rủi ro cao nhất

**Files:**
- Modify: `apps/api/src/grading/teacher-review.service.ts:75-148`

**Interfaces:**
- Produces:
  ```ts
  async reviewWithin(
    manager: EntityManager,
    result: GradingResultEntity,
    teacherId: string,
    dto: SubmitReviewDto,
    appliedRule: BulkRule | null,
  ): Promise<{ finalScore: number; audited: boolean }>;
  ```

**Điều kiện nghiệm thu của task này:** **25 test của `teacher-review.e2e-spec.ts` phải xanh mà KHÔNG sửa một dòng nào.** Đây là refactor thuần — không hành vi nào được đổi.

**Cổng trạng thái ở lại `review()`.** `reviewWithin` giả định người gọi đã kiểm: `review()` **ném** khi không duyệt được, còn bulk thì **bỏ qua**. Hai cách xử lý ngược nhau cho cùng một điều kiện, nên điều kiện đó không thuộc về hàm dùng chung.

- [ ] **Step 1: Chạy test hiện có để có mốc so sánh**

Run: `cd apps/api && npx jest --config test/jest-e2e.json teacher-review`
Expected: `Tests: 25 passed, 25 total` — ghi lại con số này

- [ ] **Step 2: Rút hàm**

Thay toàn bộ thân `review()` (từ dòng `async review(` tới dấu `}` đóng hàm) bằng:

```ts
  async review(
    result: GradingResultEntity,
    teacherId: string,
    dto: SubmitReviewDto,
  ): Promise<ReviewOutcome> {
    if (!REVIEWABLE.includes(result.status)) {
      throw new ConflictException(
        'Bài này chưa chấm xong — chưa duyệt được. Hãy đợi AI chấm xong.',
      );
    }

    return this.dataSource.transaction(async (manager) => {
      const { finalScore } = await this.reviewWithin(manager, result, teacherId, dto, null);
      return { finalScore };
    });
  }

  /**
   * Một lượt duyệt, TRONG giao dịch của người gọi.
   *
   * Rút ra khỏi `review()` để `bulkReview()` dùng lại đúng máy móc này —
   * cùng nguyên tắc đã áp cho `verifyEvidence` / `locateEvidence`: một cài
   * đặt, hai đường vào. Gọi `review()` 45 lần là 45 giao dịch, và hỏng giữa
   * chừng để lại nửa lớp đã chỉnh.
   *
   * KHÔNG kiểm `REVIEWABLE` ở đây — có chủ đích. `review()` NÉM khi không
   * duyệt được; `bulkReview()` BỎ QUA. Hai cách xử lý ngược nhau cho cùng
   * một điều kiện, nên điều kiện đó không thuộc về hàm dùng chung.
   *
   * One transaction, for the same reason `finalizeGrades` is one, and a
   * sharper one: Security rule 4 says there is no path to a score edit that
   * skips the log. With the review row and the log entry committing on
   * separate connections there WAS such a path — the row lands, the log
   * write fails, and a published score has changed with nobody's name on
   * it, looking entirely ordinary in the table.
   */
  async reviewWithin(
    manager: EntityManager,
    result: GradingResultEntity,
    teacherId: string,
    dto: SubmitReviewDto,
    appliedRule: BulkRule | null,
  ): Promise<{ finalScore: number; audited: boolean }> {
    const finalScore = await this.validateAndTotal(result, dto, manager);

    // Read BEFORE the new row is written, or `currentFinalScore` returns the
    // score just saved and the audit entry says 10 became 10.
    const published = PUBLISHED.includes(result.status);
    const previousScore = published ? await this.currentFinalScore(result, manager) : null;

    const reviews = manager.getRepository(TeacherReviewEntity);
    await reviews.save(
      reviews.create({
        gradingResultId: result.id,
        teacherId,
        finalScore: String(finalScore),
        // Stored as sent, not as a diff against the AI. A review row has to
        // be readable on its own; reconstructing a score from a chain of
        // diffs is exactly what makes an edit history useless at the moment
        // it matters.
        editedCriteria: dto.criteria as unknown as Record<string, unknown>,
        // `?? null` chứ không `?? ''`: chuỗi rỗng đọc ra như "đã viết rồi
        // xoá", khác "chưa bao giờ viết". Trường ghi chú là chỗ người ta
        // đi tìm lý do sáu tháng sau, nên khác biệt đó có giá.
        privateNote: dto.privateNote ?? null,
        studentFeedback: dto.studentFeedback ?? null,
        appliedRule,
      }),
    );

    // `false` now carries exactly ONE meaning here: already past
    // teacher_reviewed, so this is a second edit.
    await this.advance(
      result.id,
      ['auto_approved', 'flagged_for_review'],
      'teacher_reviewed',
      manager,
    );

    if (published) {
      // Security rule 4. The status does not move — the lifecycle has no
      // exit from `finalized`, and it needs none: the current score is the
      // newest review row, and this is now it.
      //
      // `appliedRule` vào `newValue` để phân biệt 45 quyết định riêng lẻ với
      // một cú bấm ảnh hưởng 45 bài — khác biệt đó là thứ người đọc sổ sáu
      // tháng sau cần thấy. Tên hành động GIỮ NGUYÊN: câu hỏi thật của thanh
      // tra là "ai đổi điểm sau khi công bố", và tách làm hai tên buộc mọi
      // truy vấn sau này phải nhớ hỏi cả hai.
      await this.auditLog.recordUserAction(
        {
          actorId: teacherId,
          action: 'grading_result.score_edited_after_finalize',
          targetType: 'grading_result',
          targetId: result.id,
          oldValue: { finalScore: previousScore },
          newValue: {
            finalScore,
            ...(appliedRule ? { appliedRule } : {}),
            ...(dto.privateNote ? { privateNote: dto.privateNote } : {}),
          },
        },
        manager,
      );
    }

    return { finalScore, audited: published };
  }
```

Thêm import: `import type { BulkRule } from './bulk-rules';`

- [ ] **Step 3: Chạy lại CHÍNH bộ test đó, KHÔNG sửa nó**

Run: `cd apps/api && npx jest --config test/jest-e2e.json teacher-review && npx tsc --noEmit`
Expected: `Tests: 25 passed, 25 total` — đúng con số ở Step 1. Một test đỏ ở đây nghĩa là refactor đã đổi hành vi, và phải sửa code chứ **không** sửa test.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/grading/teacher-review.service.ts
git commit -m "refactor(grading): rút reviewWithin ra, review() thành vỏ mở giao dịch"
```

---

## Task 4: `BulkReviewDto`

**Files:**
- Create: `apps/api/src/grading/dto/bulk-review.dto.ts`

**Interfaces:**
- Produces: `BulkReviewDto { resultIds: string[]; rule: BulkRuleDto; privateNote?: string }`

**`class-validator` không validate union rời rạc.** Dùng một DTO phẳng với `kind` là `@IsIn`, và các trường phụ `@IsOptional` — rồi service thu hẹp về `BulkRule`. Cố ép union qua decorator sẽ cho ra một cây `@ValidateNested` mà không ai đọc nổi.

⚠️ **Mọi trường phải khai ở đây.** `ValidationPipe({ whitelist: true })` KHÔNG kèm `forbidNonWhitelisted` — trường chưa khai bị **cắt im lặng** và request vẫn 2xx.

- [ ] **Step 1: Viết DTO**

```ts
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export const BULK_RULE_KINDS = [
  'keep_ai',
  'apply_advocate',
  'criterion_full_marks',
  'criterion_bonus',
] as const;

export class BulkRuleDto {
  @IsIn(BULK_RULE_KINDS)
  kind!: (typeof BULK_RULE_KINDS)[number];

  /** Bắt buộc với `criterion_*`; service kiểm, không phải decorator. */
  @IsOptional()
  @IsUUID()
  criterionId?: string;

  /** Chỉ `criterion_bonus` dùng. Trần chặn ở tầng luật, không ở đây. */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  points?: number;
}

export class BulkReviewDto {
  /**
   * LUÔN tường minh, kể cả khi là cả phiên.
   *
   * Client đã có sẵn danh sách (nó vừa gọi `grading-results` để vẽ bảng), nên
   * 45 UUID tốn ~1,7KB. Đổi lại: server kiểm từng id có thuộc phiên không, nên
   * một client cũ không vô tình chạm vào những bài nó không biết là có.
   *
   * `ArrayMaxSize(500)`: một phiên thật là 40–50 bài. Trần này không phải để
   * chặn người dùng, mà để một payload dị dạng không mở một giao dịch vô hạn.
   */
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsUUID('4', { each: true })
  resultIds!: string[];

  @ValidateNested()
  @Type(() => BulkRuleDto)
  rule!: BulkRuleDto;

  /** Ghi chú cho chính giảng viên, nhân bản vào TỪNG dòng duyệt. */
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  privateNote?: string;
}
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/api && npx tsc --noEmit`
Expected: 0 lỗi

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/grading/dto/bulk-review.dto.ts
git commit -m "feat(grading): DTO cho duyệt hàng loạt"
```

---

## Task 5: `BulkReviewService` + route

**Files:**
- Create: `apps/api/src/grading/bulk-review.service.ts`
- Modify: `apps/api/src/grading/grading.controller.ts`
- Modify: `apps/api/src/grading/grading.module.ts`

**Interfaces:**
- Consumes: `applyRule` (Task 1), `reviewWithin` (Task 3), `BulkReviewDto` (Task 4)
- Produces:
  ```ts
  export interface BulkReviewOutcome {
    applied: number;
    skipped: { resultId: string; reason: 'not_reviewable' | 'no_advocate' | 'unchanged' }[];
    audited: number;
  }
  async bulkReview(session: ExamSessionEntity, teacherId: string, dto: BulkReviewDto): Promise<BulkReviewOutcome>
  ```

- [ ] **Step 1: Viết service**

```ts
import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource, EntityManager, In } from 'typeorm';
import { ExamSessionEntity } from '../exam-session/entities/exam-session.entity';
import { RubricCriterionEntity } from './entities/rubric-criterion.entity';
import { GradingResultEntity } from './entities/grading-result.entity';
import { TeacherReviewEntity } from './entities/teacher-review.entity';
import { TeacherReviewService } from './teacher-review.service';
import { applyRule, type BulkRule, type RuleCriterion } from './bulk-rules';
import { BulkReviewDto } from './dto/bulk-review.dto';
import type { CriterionResult } from './ai-provider/ai-grading-provider';

/** Trạng thái duyệt được — cùng danh sách `review()` dùng. */
const REVIEWABLE = ['auto_approved', 'flagged_for_review', 'teacher_reviewed'];

export type SkipReason = 'not_reviewable' | 'no_advocate' | 'unchanged';

export interface BulkReviewOutcome {
  applied: number;
  skipped: { resultId: string; reason: SkipReason }[];
  /** Bài đã công bố — mỗi bài một dòng nhật ký. */
  audited: number;
}

/**
 * Áp một luật cho nhiều bài, trong MỘT giao dịch.
 *
 * File riêng khỏi `TeacherReviewService` theo đúng tiền lệ `GradingRunService`
 * tách khỏi `GradingService`: điều phối một lô là trách nhiệm khác với duyệt
 * một bài. Nhưng máy móc duyệt thì DÙNG LẠI — `reviewWithin` — chứ không
 * viết lại.
 */
@Injectable()
export class BulkReviewService {
  // KHÔNG `@InjectRepository`: mọi truy vấn ở đây chạy TRONG giao dịch, nên
  // chúng đi qua `manager` chứ không qua repository mặc định. Tiêm một
  // repository rồi không dùng là mời người sau dùng nhầm — và một câu đọc
  // ngoài giao dịch ở giữa lô sẽ không thấy những gì lô vừa ghi.
  constructor(
    private readonly teacherReviews: TeacherReviewService,
    private readonly dataSource: DataSource,
  ) {}

  async bulkReview(
    session: ExamSessionEntity,
    teacherId: string,
    dto: BulkReviewDto,
  ): Promise<BulkReviewOutcome> {
    const rule = this.narrowRule(dto);

    return this.dataSource.transaction(async (manager) => {
      const rows = await manager
        .createQueryBuilder(GradingResultEntity, 'g')
        .innerJoin('submission', 's', 's.id = g.submission_id')
        .where('s.exam_session_id = :sessionId', { sessionId: session.id })
        .andWhere('g.id IN (:...ids)', { ids: dto.resultIds })
        // Thứ tự khoá hàng phải XÁC ĐỊNH, cùng `ORDER BY g.id` mà
        // `finalizeGrades` dùng. Hai giao dịch chạm cùng tập hàng theo hai
        // thứ tự khác nhau sẽ ôm chết nhau, và "duyệt cả nhóm rồi bấm chốt
        // ngay sau" là chuyện rất thật.
        .orderBy('g.id')
        .getMany();

      // Id không thuộc phiên → 400 và KHÔNG làm gì. Đây là bug hoặc tấn
      // công, không phải tình huống vận hành — khác hẳn trạng thái không
      // duyệt được, thứ chỉ bị bỏ qua.
      if (rows.length !== dto.resultIds.length) {
        throw new BadRequestException(
          'Có bài không thuộc phiên thi này — không áp gì cả.',
        );
      }

      const rubricCriteria = await this.rubricCriteriaOf(rows, manager);
      if (
        (rule.kind === 'criterion_full_marks' || rule.kind === 'criterion_bonus') &&
        !rubricCriteria.some((c) => c.id === rule.criterionId)
      ) {
        throw new BadRequestException('Tiêu chí được chọn không thuộc rubric của phiên này.');
      }

      const skipped: { resultId: string; reason: SkipReason }[] = [];
      let applied = 0;
      let audited = 0;

      for (const result of rows) {
        if (!REVIEWABLE.includes(result.status)) {
          skipped.push({ resultId: result.id, reason: 'not_reviewable' });
          continue;
        }

        const outcome = applyRule(rule, {
          rubricCriteria,
          criterionResults: (result.criterionResults ?? []) as CriterionResult[],
          advocateOpinion: result.advocateOpinion,
        });
        if (!outcome.ok) {
          skipped.push({ resultId: result.id, reason: outcome.reason });
          continue;
        }

        if (await this.isUnchanged(result, outcome.criteria, dto.privateNote, manager)) {
          skipped.push({ resultId: result.id, reason: 'unchanged' });
          continue;
        }

        const written = await this.teacherReviews.reviewWithin(
          manager,
          result,
          teacherId,
          { criteria: outcome.criteria, privateNote: dto.privateNote },
          rule,
        );
        applied += 1;
        if (written.audited) audited += 1;
      }

      return { applied, skipped, audited };
    });
  }

  /**
   * Áp luật này có đổi gì so với lần duyệt MỚI NHẤT không.
   *
   * Giảng viên bấm "áp cho cả nhóm", mạng chậm, bấm lại. Mô hình append-only
   * nên lần hai sẽ ghi thêm 45 dòng (điểm vẫn đúng — dòng mới nhất thắng) và
   * nếu bài đã `finalized` thì thêm 45 dòng audit — 90 dòng sổ cho một ý
   * định. Bỏ qua ở đây biến một lần ghi trùng âm thầm thành một câu trả lời.
   *
   * So sánh gồm CẢ `privateNote`: cùng điểm nhưng ghi chú mới thì đó là thay
   * đổi có thật, và dòng mới phải được ghi.
   */
  private async isUnchanged(
    result: GradingResultEntity,
    criteria: RuleCriterion[],
    privateNote: string | undefined,
    manager: EntityManager,
  ): Promise<boolean> {
    const latest = await manager.getRepository(TeacherReviewEntity).findOne({
      where: { gradingResultId: result.id },
      order: { reviewedAt: 'DESC' },
    });
    if (!latest) return false;

    const before = latest.editedCriteria as unknown as RuleCriterion[];
    if (!Array.isArray(before) || before.length !== criteria.length) return false;

    const byId = new Map(before.map((row) => [row.criterionId, row]));
    const sameCriteria = criteria.every((row) => {
      const was = byId.get(row.criterionId);
      return was !== undefined && was.points === row.points && was.verdict === row.verdict;
    });

    return sameCriteria && (latest.privateNote ?? null) === (privateNote ?? null);
  }

  /**
   * Tiêu chí của rubric mà phiên này đã chấm bằng.
   *
   * Kiểm MỘT lần cho cả phiên, không từng bài: mọi kết quả trong một phiên
   * dùng chung một `rubric_id_version` (`startGrading` đóng băng rubric một
   * lần, `setSessionRubric` trả 409 khi đã có kết quả). Bất biến đó được một
   * test e2e riêng khẳng định — xem `bulk-review.e2e-spec.ts`.
   */
  private async rubricCriteriaOf(
    rows: GradingResultEntity[],
    manager: EntityManager,
  ): Promise<{ id: string; maxPoints: number }[]> {
    const versions = new Set(rows.map((row) => row.rubricIdVersion));
    if (versions.size !== 1) {
      throw new BadRequestException(
        'Các bài trong phiên đang dùng nhiều phiên bản rubric khác nhau — không áp hàng loạt được.',
      );
    }
    const found = await manager.getRepository(RubricCriterionEntity).find({
      where: { rubricId: In([...versions]) },
    });
    // `max_points` là cột `numeric`, nên TypeORM trao về CHUỖI. Quên `Number`
    // ở đây thì `Math.min(aiPoints + 1, '4')` cho ra `NaN` lặng lẽ, và
    // `validateAndTotal` từ chối cả lô với một thông báo nói về điều khác.
    return found.map((row) => ({ id: row.id, maxPoints: Number(row.maxPoints) }));
  }

  /** DTO phẳng → union đã thu hẹp. Decorator không diễn đạt được union rời rạc. */
  private narrowRule(dto: BulkReviewDto): BulkRule {
    const { kind, criterionId, points } = dto.rule;
    if (kind === 'keep_ai' || kind === 'apply_advocate') {
      return { kind };
    }
    if (!criterionId) {
      throw new BadRequestException(`Luật "${kind}" cần chỉ rõ tiêu chí.`);
    }
    if (kind === 'criterion_full_marks') {
      return { kind, criterionId };
    }
    if (points === undefined) {
      throw new BadRequestException('Cộng bù cần số điểm cộng thêm.');
    }
    return { kind: 'criterion_bonus', criterionId, points };
  }
}
```

- [ ] **Step 2: Nối route**

Trong `apps/api/src/grading/grading.controller.ts`, thêm vào constructor `private readonly bulkReviews: BulkReviewService,`, thêm import, và route đặt ngay sau `submitReview`:

```ts
  /**
   * Áp một luật cho nhiều bài cùng lúc.
   *
   * MỘT route cho cả duyệt hàng loạt lẫn can thiệp theo tiêu chí: chúng là
   * cùng một phép toán ở hai độ mịn, và tách đôi thì phần khó (giao dịch,
   * khoá hàng, cổng trạng thái, audit) bị nhân đôi còn phần dễ thì không.
   */
  @Post('exam-sessions/:id/bulk-review')
  @Roles('teacher')
  @HttpCode(200)
  async bulkReview(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: BulkReviewDto,
    @Req() req: Request,
  ) {
    const session = await this.examSessions.findEntityForOwner(id, req.user!.sub);
    return this.bulkReviews.bulkReview(session, req.user!.sub, dto);
  }
```

Trong `grading.module.ts`, thêm `BulkReviewService` vào `providers` và import nó.

- [ ] **Step 3: Typecheck, lint, vòng lặp import**

Run:
```bash
cd apps/api && npx tsc --noEmit && npx eslint src/grading --ext .ts && node ../../scripts/find-import-cycles.js src
```
Expected: sạch, và `0` vòng lặp

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/grading/bulk-review.service.ts apps/api/src/grading/grading.controller.ts apps/api/src/grading/grading.module.ts
git commit -m "feat(grading): route duyệt hàng loạt — một giao dịch, dùng lại reviewWithin"
```

---

## Task 6: E2E — giao dịch, bỏ qua, audit, idempotency, bất biến rubric

**Files:**
- Create: `apps/api/test/bulk-review.e2e-spec.ts`

**Điều kiện chạy:** Postgres + MinIO + Redis đang chạy **và** bucket `examcollect-submissions` đã tạo. Thiếu bucket cho ra lỗi trông y hệt lỗi nghiệp vụ.

Dựng fixture theo khuôn `apps/api/test/grading-results-view.e2e-spec.ts` (đã có sẵn từ đợt 0): tạo giảng viên + login lấy `accessToken`, seed semester/course/room/class/enrollment, tạo rubric qua API, rồi `INSERT` bài nộp và `grading_result` bằng SQL đi từng bước theo trigger vòng đời.

**Helper phải dựng trước, vì cả 11 ca dùng chung** — khai đủ ở đây để không ai phải đoán:

```ts
let app: INestApplication;
let dataSource: DataSource;
let token: string;
/** Tiêu chí ĐẦU TIÊN của rubric fixture. Dùng cho mọi luật `criterion_*`. */
let criterionId: string;

/** Gửi một lời gọi bulk-review đã gắn token. e2e xác thực bằng Bearer, không phải cookie. */
function bulk(sessionId: string, body: Record<string, unknown>) {
  return request(app.getHttpServer())
    .post(`/exam-sessions/${sessionId}/bulk-review`)
    .set('Authorization', `Bearer ${token}`)
    .send(body);
}

/**
 * Một phiên với `n` bài đã ở `flagged_for_review`, MỖI BÀI có ý kiến phản
 * biện. Rubric 2 tiêu chí; AI cho `not_met` tiêu chí 1 và `partially_met`
 * tiêu chí 2, nên mọi luật đều có chỗ để thay đổi — nếu AI đã cho điểm tối
 * đa sẵn thì `criterion_full_marks` trả `unchanged` và test đo nhầm thứ.
 * Trả `{ sessionId, resultIds }`, `resultIds` sắp theo `id` ASC cho khớp
 * thứ tự khoá hàng của service.
 */
async function sessionWithGradedResults(n: number): Promise<{ sessionId: string; resultIds: string[] }>;

/** Như trên, nhưng bài CUỐI dừng ở `ai_grading`. Trả thêm `gradingId` của bài đó. */
async function sessionWithOneStillGrading(): Promise<{ sessionId: string; resultIds: string[]; gradingId: string }>;

/**
 * Như `sessionWithGradedResults`, nhưng mỗi bài đi tiếp tới `finalized`
 * (`flagged_for_review → teacher_reviewed → finalized`, mỗi bước một UPDATE —
 * trigger `validate_grading_result_lifecycle` chỉ cho nhảy một bước).
 * Cần một dòng `teacher_review` trước khi chuyển sang `teacher_reviewed`, nếu
 * không `currentFinalScore` trả `null` và dòng audit nói `null → 7`.
 */
async function sessionWithFinalizedResults(n: number): Promise<{ sessionId: string; resultIds: string[] }>;
```

- [ ] **Step 1: Viết test**

Các ca bắt buộc — mỗi ca một `it`:

```ts
  it('N bài → N dòng teacher_review, trong MỘT giao dịch', async () => {
    const { sessionId, resultIds } = await sessionWithGradedResults(3);
    const res = await bulk(sessionId, { resultIds, rule: { kind: 'keep_ai' } }).expect(200);

    expect(res.body.applied).toBe(3);
    expect(res.body.skipped).toEqual([]);
    const [{ n }] = await dataSource.query(
      `SELECT count(*)::int AS n FROM examcollect.teacher_review WHERE grading_result_id = ANY($1)`,
      [resultIds],
    );
    expect(n).toBe(3);
  });

  it('bài đang chấm bị BỎ QUA kèm lý do, lô vẫn chạy', async () => {
    const { sessionId, resultIds, gradingId } = await sessionWithOneStillGrading();
    const res = await bulk(sessionId, { resultIds, rule: { kind: 'keep_ai' } }).expect(200);

    expect(res.body.applied).toBe(resultIds.length - 1);
    expect(res.body.skipped).toEqual([{ resultId: gradingId, reason: 'not_reviewable' }]);
  });

  it('id KHÔNG thuộc phiên → 400 và không ghi gì', async () => {
    const { sessionId, resultIds } = await sessionWithGradedResults(2);
    const other = await sessionWithGradedResults(1);

    await bulk(sessionId, {
      resultIds: [...resultIds, other.resultIds[0]],
      rule: { kind: 'keep_ai' },
    }).expect(400);

    const [{ n }] = await dataSource.query(
      `SELECT count(*)::int AS n FROM examcollect.teacher_review WHERE grading_result_id = ANY($1)`,
      [resultIds],
    );
    expect(n).toBe(0);
  });

  it('bài đã chốt → một dòng audit MỖI BÀI, và rule có trong newValue', async () => {
    const { sessionId, resultIds } = await sessionWithFinalizedResults(2);
    const res = await bulk(sessionId, {
      resultIds,
      rule: { kind: 'criterion_full_marks', criterionId },
    }).expect(200);

    expect(res.body.audited).toBe(2);
    const rows = await dataSource.query(
      `SELECT new_value FROM examcollect.audit_log
        WHERE action = 'grading_result.score_edited_after_finalize'
          AND target_id = ANY($1)`,
      [resultIds],
    );
    expect(rows).toHaveLength(2);
    expect(rows[0].new_value.appliedRule).toEqual({
      kind: 'criterion_full_marks',
      criterionId,
    });
  });

  it('audit hỏng → CẢ LÔ rollback', async () => {
    // Khuôn có sẵn ở teacher-review.e2e-spec.ts: spy lên AuditLogService.
    const { sessionId, resultIds } = await sessionWithFinalizedResults(2);
    const spy = jest
      .spyOn(app.get(AuditLogService), 'recordUserAction')
      .mockRejectedValueOnce(new Error('sổ hỏng'));
    try {
      await bulk(sessionId, { resultIds, rule: { kind: 'keep_ai' } }).expect(500);
    } finally {
      spy.mockRestore();
    }
    const [{ n }] = await dataSource.query(
      `SELECT count(*)::int AS n FROM examcollect.teacher_review WHERE grading_result_id = ANY($1)`,
      [resultIds],
    );
    // Không có chế độ "áp được bao nhiêu hay bấy nhiêu".
    expect(n).toBe(0);
  });

  it('bài đã teacher_reviewed vẫn sửa được lần hai', async () => {
    // `advance()` trả `false` ở đây vì `teacher_reviewed` không nằm trong tập
    // `from`. Đó là ĐÚNG, không phải lỗi: vòng đời không có bước nào từ
    // `teacher_reviewed` về chính nó, và dòng duyệt mới nhất mới là điểm
    // hiện hành. Coi `false` là lỗi sẽ chặn giảng viên sửa lại bài họ vừa sửa.
    const { sessionId, resultIds } = await sessionWithGradedResults(1);
    await bulk(sessionId, { resultIds, rule: { kind: 'keep_ai' } }).expect(200);

    const second = await bulk(sessionId, {
      resultIds,
      rule: { kind: 'criterion_full_marks', criterionId },
    }).expect(200);
    expect(second.body.applied).toBe(1);

    const [row] = await dataSource.query(
      `SELECT status FROM examcollect.grading_result WHERE id = $1`,
      [resultIds[0]],
    );
    expect(row.status).toBe('teacher_reviewed');
  });

  it('bấm HAI LẦN → lần hai trả unchanged cho mọi bài, không ghi thêm dòng nào', async () => {
    const { sessionId, resultIds } = await sessionWithGradedResults(3);
    await bulk(sessionId, { resultIds, rule: { kind: 'keep_ai' } }).expect(200);
    const second = await bulk(sessionId, { resultIds, rule: { kind: 'keep_ai' } }).expect(200);

    expect(second.body.applied).toBe(0);
    expect(second.body.skipped).toHaveLength(3);
    expect(second.body.skipped.every((s: { reason: string }) => s.reason === 'unchanged')).toBe(true);

    const [{ n }] = await dataSource.query(
      `SELECT count(*)::int AS n FROM examcollect.teacher_review WHERE grading_result_id = ANY($1)`,
      [resultIds],
    );
    expect(n).toBe(3);
  });

  it('cùng điểm nhưng ghi chú MỚI → VẪN ghi dòng mới', async () => {
    const { sessionId, resultIds } = await sessionWithGradedResults(1);
    await bulk(sessionId, { resultIds, rule: { kind: 'keep_ai' } }).expect(200);
    const second = await bulk(sessionId, {
      resultIds,
      rule: { kind: 'keep_ai' },
      privateNote: 'đề câu 3 in mờ',
    }).expect(200);

    expect(second.body.applied).toBe(1);
  });

  it('applied_rule có mặt kể cả khi bài CHƯA công bố', async () => {
    // Đây là ca mà audit KHÔNG bắn — và là lỗ mà cột này sinh ra để bịt.
    const { sessionId, resultIds } = await sessionWithGradedResults(1);
    await bulk(sessionId, { resultIds, rule: { kind: 'apply_advocate' } }).expect(200);

    const [row] = await dataSource.query(
      `SELECT applied_rule, private_note FROM examcollect.teacher_review
        WHERE grading_result_id = $1 ORDER BY reviewed_at DESC LIMIT 1`,
      [resultIds[0]],
    );
    expect(row.applied_rule).toEqual({ kind: 'apply_advocate' });
  });

  it('ghi chú nhân bản vào TỪNG dòng', async () => {
    const { sessionId, resultIds } = await sessionWithGradedResults(3);
    await bulk(sessionId, {
      resultIds,
      rule: { kind: 'keep_ai' },
      privateNote: 'đề câu 3 in mờ',
    }).expect(200);

    const rows = await dataSource.query(
      `SELECT private_note FROM examcollect.teacher_review WHERE grading_result_id = ANY($1)`,
      [resultIds],
    );
    expect(rows).toHaveLength(3);
    expect(rows.every((r: { private_note: string }) => r.private_note === 'đề câu 3 in mờ')).toBe(true);
  });

  it('BẤT BIẾN: mọi grading_result trong một phiên có cùng rubric_id_version', async () => {
    // Bất biến này đang ĐỠ một lối tắt: `criterionId` được kiểm một lần cho
    // cả phiên thay vì từng bài. Vỡ thì `criterion_full_marks` áp nhầm tiêu
    // chí trên những bài dùng rubric khác — sai ÂM THẦM, không lỗi, không log.
    const { sessionId } = await sessionWithGradedResults(3);
    const [row] = await dataSource.query(
      `SELECT count(DISTINCT g.rubric_id_version)::int AS versions
         FROM examcollect.grading_result g
         JOIN examcollect.submission s ON s.id = g.submission_id
        WHERE s.exam_session_id = $1`,
      [sessionId],
    );
    expect(row.versions).toBe(1);
  });
```

- [ ] **Step 2: Chạy**

Run:
```bash
docker compose up -d postgres minio redis
cd apps/api && npx jest --config test/jest-e2e.json bulk-review
```
Expected: PASS toàn bộ

- [ ] **Step 3: Chạy CẢ bộ e2e — refactor Task 3 chạm đường duyệt đơn lẻ**

Run: `cd apps/api && npx jest --config test/jest-e2e.json`
Expected: mọi suite xanh, số test ≥ 360 (mốc sau đợt 0→3)

- [ ] **Step 4: Commit**

```bash
git add apps/api/test/bulk-review.e2e-spec.ts
git commit -m "test(grading): e2e duyệt hàng loạt — giao dịch, bỏ qua, audit, bấm hai lần, bất biến rubric"
```

---

## Task 7: Web — client, hook, và phân nhóm theo khoảng cách

**Files:**
- Modify: `apps/web/src/lib/api/grading.ts`
- Modify: `apps/web/src/hooks/useGrading.ts`
- Modify: `apps/web/src/lib/grading-triage.ts`
- Modify: `apps/web/src/lib/grading-triage.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // lib/api/grading.ts
  export type BulkRule = { kind: 'keep_ai' } | { kind: 'apply_advocate' }
    | { kind: 'criterion_full_marks'; criterionId: string }
    | { kind: 'criterion_bonus'; criterionId: string; points: number };
  export interface BulkReviewOutcome {
    applied: number;
    skipped: { resultId: string; reason: 'not_reviewable' | 'no_advocate' | 'unchanged' }[];
    audited: number;
  }
  export async function bulkReview(examSessionId: string, body: {
    resultIds: string[]; rule: BulkRule; privateNote?: string;
  }): Promise<BulkReviewOutcome>;

  // lib/grading-triage.ts
  export type DeltaGroup = 'zero' | 'small' | 'large' | 'no-advocate';
  export function deltaGroupOf(r: GradingResult, maxByCriterion: Map<string, number>): DeltaGroup;

  // hooks/useGrading.ts
  export function useBulkReview(examSessionId: string | undefined);
  ```

**Nhóm thứ TƯ là bổ sung so với spec §6.1.** Bài không có ý kiến phản biện **không tính được khoảng cách**, nên nhét nó vào nhóm "không lệch" là nói dối — hai lượt không hề đồng thuận, chỉ có một lượt lên tiếng. Nhóm riêng cũng đúng là chỗ `keep_ai` dùng tới.

- [ ] **Step 1: Viết test thất bại cho hàm thuần**

Thêm vào cuối `apps/web/src/lib/grading-triage.test.ts`:

```ts
describe('deltaGroupOf', () => {
  const max = new Map([['c1', 4]]);

  function withAdvocate(aiPoints: number, suggested: 'met' | 'partially_met' | 'not_met') {
    return result({
      aiTotalScore: aiPoints,
      criterionResults: [criterion({ criterionId: 'c1', verdict: 'not_met', points: aiPoints })],
      advocateOpinion: opinion({
        suggestedVerdicts: [{ criterionId: 'c1', suggestedVerdict: suggested, why: '' }],
      }),
    });
  }

  it('không có ý kiến phản biện → nhóm RIÊNG, không gộp vào "không lệch"', () => {
    // Gộp vào "không lệch" là nói dối: hai lượt không hề đồng thuận, chỉ có
    // một lượt lên tiếng.
    expect(deltaGroupOf(result({ advocateOpinion: null }), max)).toBe('no-advocate');
  });

  it('hai lượt cho cùng điểm → zero', () => {
    expect(deltaGroupOf(withAdvocate(0, 'not_met'), max)).toBe('zero');
  });

  it('lệch 1,5 → small; ĐÚNG ngưỡng vẫn thuộc nhóm dưới', () => {
    // AI 0.5, phản biện đề nghị met = 4 ⇒ lệch 3.5 (large).
    // AI 0.5, phản biện đề nghị partially_met = 2 ⇒ lệch 1.5 (small, biên).
    const atBoundary = result({
      aiTotalScore: 0.5,
      criterionResults: [criterion({ criterionId: 'c1', verdict: 'partially_met', points: 0.5 })],
      advocateOpinion: opinion({
        suggestedVerdicts: [{ criterionId: 'c1', suggestedVerdict: 'partially_met', why: '' }],
      }),
    });
    expect(deltaGroupOf(atBoundary, max)).toBe('small');
  });

  it('lệch trên 1,5 → large', () => {
    expect(deltaGroupOf(withAdvocate(0, 'met'), max)).toBe('large');
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận nó ĐỎ**

Run: `cd apps/web && npx vitest run src/lib/grading-triage.test.ts`
Expected: FAIL — `deltaGroupOf is not a function`

- [ ] **Step 3: Cài đặt ba chỗ**

Trong `apps/web/src/lib/grading-triage.ts`:

```ts
/**
 * Bốn nhóm của màn Ma trận.
 *
 * `no-advocate` là nhóm THỨ TƯ, không có trong spec: bài không có ý kiến
 * phản biện thì KHÔNG tính được khoảng cách, và nhét nó vào `zero` là nói
 * dối — hai lượt không hề đồng thuận, chỉ có một lượt lên tiếng.
 */
export type DeltaGroup = 'zero' | 'small' | 'large' | 'no-advocate';

/**
 * MỘT ngưỡng, không phải hai. Ba nhóm có khoảng cách được chia bởi đúng một
 * con số: bằng 0, tới 1,5, và trên 1,5. Đúng 1,5 thuộc nhóm DƯỚI — biên phải
 * nằm ở một phía cố định, không thì một bài lệch đúng 1,5 sẽ rơi vào nhóm
 * "cần đọc kỹ" hay không tuỳ thứ tự hai câu `if`.
 */
export const DELTA_SMALL_MAX = 1.5;

export function deltaGroupOf(
  result: GradingResult,
  maxByCriterion: Map<string, number>,
): DeltaGroup {
  const advocate = advocateScore(result, maxByCriterion);
  if (advocate === null || result.aiTotalScore === null) {
    return 'no-advocate';
  }
  const delta = Math.abs(advocate - result.aiTotalScore);
  if (delta === 0) return 'zero';
  return delta <= DELTA_SMALL_MAX ? 'small' : 'large';
}
```

Trong `apps/web/src/lib/api/grading.ts`, thêm type và hàm:

```ts
export type BulkRule =
  | { kind: 'keep_ai' }
  | { kind: 'apply_advocate' }
  | { kind: 'criterion_full_marks'; criterionId: string }
  | { kind: 'criterion_bonus'; criterionId: string; points: number };

export interface BulkReviewOutcome {
  applied: number;
  /** Lý do, không chỉ số đếm: `skipped: 3` bắt giảng viên tự đi tìm ba bài nào. */
  skipped: { resultId: string; reason: 'not_reviewable' | 'no_advocate' | 'unchanged' }[];
  audited: number;
}

/**
 * Áp một luật cho nhiều bài.
 *
 * `resultIds` LUÔN tường minh, kể cả khi là cả phiên — "cho điểm tối đa cả
 * lớp" là thao tác mà *cả lớp* phải do người gửi khai ra, không do server suy.
 */
export async function bulkReview(
  examSessionId: string,
  body: { resultIds: string[]; rule: BulkRule; privateNote?: string },
): Promise<BulkReviewOutcome> {
  const { data, error, response } = await apiClient.POST('/exam-sessions/{id}/bulk-review', {
    params: { path: { id: examSessionId } },
    body,
  });
  if (error || !response.ok) throw fail(error, response);
  return data as unknown as BulkReviewOutcome;
}
```

Trong `apps/web/src/hooks/useGrading.ts`:

```ts
/**
 * Duyệt hàng loạt. Invalidate danh sách kết quả — điểm và trạng thái của mọi
 * bài vừa áp đều nằm trong đó.
 */
export function useBulkReview(examSessionId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Parameters<typeof bulkReview>[1]) => bulkReview(examSessionId!, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['exam-sessions', examSessionId, 'grading-results'],
      });
    },
  });
}
```

- [ ] **Step 4: Sinh lại schema và typecheck**

Run:
```bash
cd apps/api && pnpm dev   # cửa sổ riêng, chờ "Nest application successfully started"
cd packages/shared && pnpm generate:api-client
cd apps/web && npx vitest run src/lib/grading-triage.test.ts && npx tsc --noEmit
```
Expected: test PASS; tsc chỉ còn 2 lỗi CÓ SẴN ở `read-workbook.test.ts`

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/api/schema.d.ts apps/web/src/lib apps/web/src/hooks
git commit -m "feat(web): client, hook và phân nhóm theo khoảng cách cho Ma trận"
```

---

## Task 8: `DeltaGroups` + `MatrixTable`

**Files:**
- Create: `apps/web/src/app/teacher/grading/matrix/_components/DeltaGroups.tsx`
- Create: `apps/web/src/app/teacher/grading/matrix/_components/DeltaGroups.test.tsx`
- Create: `apps/web/src/app/teacher/grading/matrix/_components/MatrixTable.tsx`
- Create: `apps/web/src/app/teacher/grading/matrix/_components/MatrixTable.test.tsx`

**Interfaces:**
- Consumes: `deltaGroupOf`, `advocateScore` (Task 7)
- Produces:
  - `<DeltaGroups results rubric active onChange />`
  - `<MatrixTable results rubric queueActive selectedIds onToggle onToggleAll />`

⚠️ `queueActive` là **prop bắt buộc**, không phải hằng `0`. `bucketOf` trả `'stuck'` khi `status === 'ai_grading' && queueActive === 0`; truyền cứng `0` sẽ dán nhãn *"đang kẹt"* lên mọi bài mà hàng đợi đang chấm bình thường. Cùng họ lỗi với `contextUsedQuestion` ở đợt 0→3: một câu **luôn đúng về triệu chứng và luôn sai về nguyên nhân**.

- [ ] **Step 1: Viết test thất bại**

`MatrixTable.test.tsx` — các ca:

```ts
it('cột "Phản biện" nói rõ đó là điểm QUY RA, không phải điểm ai đó chấm', () => {
  render(<MatrixTable results={[withAdvocate]} rubric={rubric} queueActive={2} selectedIds={[]} onToggle={vi.fn()} onToggleAll={vi.fn()} />);
  expect(screen.getByText(/quy ra từ các mức đánh giá/i)).toBeInTheDocument();
});

it('hiện một câu tóm tắt của lượt phản biện — nắm tình hình mà không mở bài', () => {
  render(<MatrixTable results={[withAdvocate]} rubric={rubric} queueActive={2} selectedIds={[]} onToggle={vi.fn()} onToggleAll={vi.fn()} />);
  expect(screen.getByText(/Em ấy mô tả đúng cơ chế bù trừ/)).toBeInTheDocument();
});

it('bài không có ý kiến phản biện hiện dấu gạch, không hiện 0', () => {
  // 0 đọc thành "phản biện chấm 0 điểm". Hai thứ khác nhau.
  render(<MatrixTable results={[noAdvocate]} rubric={rubric} queueActive={2} selectedIds={[]} onToggle={vi.fn()} onToggleAll={vi.fn()} />);
  expect(screen.getByTestId('advocate-score-r1')).toHaveTextContent('—');
});

it('tick ô đầu bảng chọn TẤT CẢ dòng đang hiện', () => {
  const onToggleAll = vi.fn();
  render(<MatrixTable results={[withAdvocate, noAdvocate]} rubric={rubric} queueActive={2} selectedIds={[]} onToggle={vi.fn()} onToggleAll={onToggleAll} />);
  fireEvent.click(screen.getByLabelText('Chọn tất cả'));
  expect(onToggleAll).toHaveBeenCalledWith(true);
});

it('hàng đợi đang chạy thì KHÔNG gọi bài đang chấm là "đang kẹt"', () => {
  // `queueActive={2}` — hàng đợi có việc. Một bài `ai_grading` lúc này là
  // bình thường, không phải sự cố.
  render(<MatrixTable results={[stillGrading]} rubric={rubric} queueActive={2} selectedIds={[]} onToggle={vi.fn()} onToggleAll={vi.fn()} />);
  expect(screen.queryByText(/kẹt/i)).not.toBeInTheDocument();
});

it('không dùng thuật ngữ nội bộ', () => {
  const { container } = render(<MatrixTable results={[withAdvocate]} rubric={rubric} queueActive={2} selectedIds={[]} onToggle={vi.fn()} onToggleAll={vi.fn()} />);
  expect(container.textContent).not.toMatch(/Advocate|Grader|flagged_for_review|keep_ai/i);
});
```

`DeltaGroups.test.tsx`:

```ts
it('đếm đúng bốn nhóm', () => {
  render(<DeltaGroups results={mixed} rubric={rubric} active="large" onChange={vi.fn()} />);
  expect(screen.getByRole('button', { name: /Lệch trên 1,5 điểm/ })).toHaveTextContent('1');
  expect(screen.getByRole('button', { name: /Chưa có ý kiến phản biện/ })).toHaveTextContent('1');
});

it('nhóm không lệch nói rõ vì sao bài vẫn bị giữ lại', () => {
  render(<DeltaGroups results={mixed} rubric={rubric} active="zero" onChange={vi.fn()} />);
  expect(screen.getByText(/lý do kỹ thuật, không phải vì hai bên bất đồng/i)).toBeInTheDocument();
});

it('bấm một nhóm thì báo ra ngoài', () => {
  const onChange = vi.fn();
  render(<DeltaGroups results={mixed} rubric={rubric} active="large" onChange={onChange} />);
  fireEvent.click(screen.getByRole('button', { name: /Không lệch/ }));
  expect(onChange).toHaveBeenCalledWith('zero');
});
```

- [ ] **Step 2: Chạy test để xác nhận nó ĐỎ**

Run: `cd apps/web && npx vitest run src/app/teacher/grading/matrix`
Expected: FAIL — module không tồn tại

- [ ] **Step 3: Cài đặt**

`DeltaGroups.tsx`: bốn `<button aria-pressed>` dùng đúng khuôn `ConfidenceTiles.tsx` đã có (viền trên 3px theo tông, `text-display tabular-nums`, `hover:-translate-y-0.5`). Nhãn và phụ đề:

| Nhóm | Nhãn | Phụ đề |
|---|---|---|
| `zero` | Không lệch — hai lượt đồng thuận | Giữ lại vì lý do kỹ thuật, không phải vì hai bên bất đồng về điểm. |
| `small` | Lệch tới 1,5 điểm | Chốt nhanh theo mức cao hơn cho cả nhóm. |
| `large` | Lệch trên 1,5 điểm — cần đọc kỹ | Chỉ nhóm này mới đáng mở bàn chấm chi tiết. |
| `no-advocate` | Chưa có ý kiến phản biện | Lượt phản biện không chạy cho những bài này — xác nhận điểm lượt chấm là đủ. |

`MatrixTable.tsx`: `<Table>` semantic (`TableHeader`/`TableBody`/`TableRow`/`TableCell`) bọc trong `overflow-x-auto`. Bảy cột, theo đúng thứ tự spec §6.1:

| # | Cột | Nguồn |
|---|---|---|
| 1 | checkbox chọn | `selectedIds.includes(result.id)` |
| 2 | Sinh viên | `result.studentName` — **tên**, không phải mã kết quả |
| 3 | Lượt chấm | `result.aiTotalScore`, `tabular-nums` |
| 4 | Phản biện | `advocateScore(result, maxByCriterion)`, `—` khi `null` |
| 5 | Lệch | hiệu hai cột trên, `—` khi không tính được |
| 6 | Lý do giữ lại | `bucketOf(result, queueActive)` — `queueActive` là **prop**, lấy từ `useGradingProgress` ở trang |
| 7 | Tóm tắt | câu đầu của `result.advocateOpinion?.reasoning`, cắt ở 120 ký tự |

Ô điểm phản biện mang `data-testid={'advocate-score-' + result.id}` và hiện `—` khi `advocateScore` trả `null`. Dưới bảng, một dòng cố định:

> Cột **Phản biện** là điểm **quy ra từ các mức đánh giá** mà lượt phản biện kiến nghị, tính lại theo đúng thang chấm — **không phải** điểm do nó đưa ra.

- [ ] **Step 4: Chạy test để xác nhận nó XANH**

Run: `cd apps/web && npx vitest run src/app/teacher/grading/matrix`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/teacher/grading/matrix
git commit -m "feat(web): bảng ma trận và phân nhóm bốn mức theo khoảng cách"
```

---

## Task 9: `BulkActionBar` — hai nút, và danh sách bỏ qua nêu TÊN

**Files:**
- Create: `apps/web/src/app/teacher/grading/matrix/_components/BulkActionBar.tsx`
- Create: `apps/web/src/app/teacher/grading/matrix/_components/BulkActionBar.test.tsx`

**Interfaces:**
- Produces: `<BulkActionBar selectedIds results outcome pending onApply />` với `onApply: (rule: BulkRule) => void`

**HAI nút, không ba.** "Lấy mức cao hơn" của mockup **là** `apply_advocate` — luật đó lấy max theo từng tiêu chí, nên hai nút gộp làm một.

- [ ] **Step 1: Viết test thất bại**

Fixture dùng chung cho cả file — `rows` phải có **tên thật**, vì thứ đang được khẳng định là danh sách bỏ qua nêu tên chứ không nêu mã:

```tsx
import type { GradingResult } from '@/lib/api/grading';

const rows = [
  { id: 'r1', studentName: 'Nguyễn Minh Anh', studentMssv: '21120001' },
  { id: 'r2', studentName: 'Trần Gia Bảo', studentMssv: '21120002' },
] as unknown as GradingResult[];
```

```tsx
it('không hiện gì khi chưa chọn dòng nào', () => {
  const { container } = render(<BulkActionBar selectedIds={[]} results={rows} outcome={undefined} pending={false} onApply={vi.fn()} />);
  expect(container).toBeEmptyDOMElement();
});

it('hai nút, và nút phản biện nói rõ nó lấy mức cao hơn trên TỪNG tiêu chí', () => {
  render(<BulkActionBar selectedIds={['r1']} results={rows} outcome={undefined} pending={false} onApply={vi.fn()} />);
  expect(screen.getByRole('button', { name: /Giữ điểm lượt chấm/ })).toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: /Áp kiến nghị phản biện — lấy mức cao hơn trên từng tiêu chí/ }),
  ).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /^Lấy mức cao hơn$/ })).not.toBeInTheDocument();
});

it('danh sách bỏ qua nêu TÊN, không nêu số đếm', () => {
  render(
    <BulkActionBar
      selectedIds={['r1']}
      results={rows}
      outcome={{ applied: 1, audited: 0, skipped: [{ resultId: 'r2', reason: 'not_reviewable' }] }}
      pending={false}
      onApply={vi.fn()}
    />,
  );
  // `skipped: 1` bắt giảng viên tự đi tìm bài nào.
  expect(screen.getByText(/Trần Gia Bảo/)).toBeInTheDocument();
  expect(screen.getByText(/đang được chấm lại/i)).toBeInTheDocument();
});

it('lý do "unchanged" nói rõ không có gì thay đổi', () => {
  render(
    <BulkActionBar
      selectedIds={['r1']}
      results={rows}
      outcome={{ applied: 0, audited: 0, skipped: [{ resultId: 'r1', reason: 'unchanged' }] }}
      pending={false}
      onApply={vi.fn()}
    />,
  );
  expect(screen.getByText(/không có gì thay đổi/i)).toBeInTheDocument();
});

it('nút khoá trong lúc request bay', () => {
  render(<BulkActionBar selectedIds={['r1']} results={rows} outcome={undefined} pending onApply={vi.fn()} />);
  expect(screen.getByRole('button', { name: /Giữ điểm lượt chấm/ })).toBeDisabled();
});
```

- [ ] **Step 2: Chạy test để xác nhận nó ĐỎ**

Run: `cd apps/web && npx vitest run src/app/teacher/grading/matrix/_components/BulkActionBar.test.tsx`
Expected: FAIL

- [ ] **Step 3: Cài đặt**

Thanh dính đáy, nền `bg-primary`, dùng `<Button variant="outline">` cho nút phụ và `<Button>` (teal) cho nút áp kiến nghị. Bản đồ lý do:

```ts
const SKIP_LABEL = {
  not_reviewable: 'đang được chấm lại',
  no_advocate: 'chưa có ý kiến phản biện',
  unchanged: 'không có gì thay đổi',
} as const;
```

Dòng kết quả ghép tên từ `results`:

> Đã áp cho **11 bài**. **3 bài bỏ qua**: Nguyễn Minh Anh, Lê Thanh Hà, Võ Hoàng Nam — đang được chấm lại.

- [ ] **Step 4: Chạy test để xác nhận nó XANH**

Run: `cd apps/web && npx vitest run src/app/teacher/grading/matrix`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/teacher/grading/matrix/_components/BulkActionBar.tsx apps/web/src/app/teacher/grading/matrix/_components/BulkActionBar.test.tsx
git commit -m "feat(web): thanh hành động hàng loạt — hai nút, danh sách bỏ qua nêu tên"
```

---

## Task 10: `CriterionAdjustPanel` — nhãn nói ra trần

**Files:**
- Create: `apps/web/src/app/teacher/grading/matrix/_components/CriterionAdjustPanel.tsx`
- Create: `apps/web/src/app/teacher/grading/matrix/_components/CriterionAdjustPanel.test.tsx`

**Interfaces:**
- Produces: `<CriterionAdjustPanel results rubric pending onApply />` với `onApply: (rule: BulkRule) => void`

- [ ] **Step 1: Viết test thất bại**

Fixture: rubric 2 tiêu chí (`c1` 4 điểm, `c2` 3 điểm), 3 bài — **2 trong 3 mất điểm ở `c1`**, đúng con số mà test tỉ lệ khẳng định:

```tsx
const rubric = {
  id: 'rub-1',
  criteria: [
    { id: 'c1', description: 'Mô tả cơ chế bù trừ', maxPoints: 4 },
    { id: 'c2', description: 'Dẫn ví dụ cụ thể', maxPoints: 3 },
  ],
} as unknown as Rubric;

const rows = [
  row('r1', [{ criterionId: 'c1', verdict: 'not_met', points: 0 }]),
  row('r2', [{ criterionId: 'c1', verdict: 'not_met', points: 0 }]),
  row('r3', [{ criterionId: 'c1', verdict: 'met', points: 4 }]),
];
```

```tsx
it('nhãn nói rõ "cho điểm tối đa", KHÔNG nói "huỷ tiêu chí"', () => {
  render(<CriterionAdjustPanel results={rows} rubric={rubric} pending={false} onApply={vi.fn()} />);
  // "Chia đều trọng số" bị server từ chối bằng 400; nhãn phải nói đúng thứ
  // nó làm.
  expect(screen.getByRole('button', { name: /Cho điểm tối đa cho cả lớp/ })).toBeInTheDocument();
  expect(screen.queryByText(/chia đều trọng số/i)).not.toBeInTheDocument();
});

it('nhãn cộng bù nói ra TRẦN', () => {
  render(<CriterionAdjustPanel results={rows} rubric={rubric} pending={false} onApply={vi.fn()} />);
  expect(screen.getByText(/tối đa \+1 điểm/i)).toBeInTheDocument();
});

it('hiện tỉ lệ bài mất điểm ở mỗi tiêu chí', () => {
  render(<CriterionAdjustPanel results={rows} rubric={rubric} pending={false} onApply={vi.fn()} />);
  expect(screen.getByText(/2\/3 bài mất điểm/)).toBeInTheDocument();
});

it('cho điểm tối đa phát ra đúng luật', () => {
  const onApply = vi.fn();
  render(<CriterionAdjustPanel results={rows} rubric={rubric} pending={false} onApply={onApply} />);
  fireEvent.click(screen.getAllByRole('button', { name: /Cho điểm tối đa cho cả lớp/ })[0]);
  expect(onApply).toHaveBeenCalledWith({ kind: 'criterion_full_marks', criterionId: 'c1' });
});
```

- [ ] **Step 2: Chạy test để xác nhận nó ĐỎ**

Run: `cd apps/web && npx vitest run src/app/teacher/grading/matrix/_components/CriterionAdjustPanel.test.tsx`
Expected: FAIL

- [ ] **Step 3: Cài đặt**

Một hàng mỗi tiêu chí của rubric: tên · `N/M bài mất điểm` · thanh tỉ lệ · nút `Cộng bù +1` (nhãn phụ *"tối đa +1 điểm"*) · nút `Cho điểm tối đa cho cả lớp`.

Trên panel, một dòng:

> Áp cho **mọi bài trong phiên**, không chỉ nhóm đang lọc.

- [ ] **Step 4: Chạy test để xác nhận nó XANH**

Run: `cd apps/web && npx vitest run src/app/teacher/grading/matrix`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/teacher/grading/matrix/_components/CriterionAdjustPanel.tsx apps/web/src/app/teacher/grading/matrix/_components/CriterionAdjustPanel.test.tsx
git commit -m "feat(web): can thiệp theo tiêu chí — nhãn nói đúng thứ nó làm"
```

---

## Task 11: Lắp màn Ma trận + đường vào từ màn Điều phối

**Files:**
- Create: `apps/web/src/app/teacher/grading/matrix/page.tsx`
- Create: `apps/web/src/app/teacher/grading/matrix/page.test.tsx`
- Modify: `apps/web/src/app/teacher/grading/page.tsx`

- [ ] **Step 1: Viết test thất bại**

Harness theo đúng khuôn `apps/web/src/app/teacher/grading/page.test.tsx` đã có — mock ở **tầng hook**, không ở `lib/api`:

```tsx
const bulkReviewMock = vi.fn().mockResolvedValue({ applied: 2, skipped: [], audited: 0 });
let searchParams = new URLSearchParams('sessionId=s1');

vi.mock('next/navigation', () => ({ useSearchParams: () => searchParams }));
// Mock phải liệt kê ĐỦ mọi export trang import — thiếu một cái thì lỗi đọc
// ra như "component không render". Đợt 0→3 đã va đúng chỗ này.
vi.mock('@/hooks/useGrading', () => ({
  useGradingResults: () => ({ data: allResults, isLoading: false }),
  useRubrics: () => ({ data: [rubricV3, rubricV5], isLoading: false }),
  useGradingProgress: () => ({ data: { pending: 0, queue: { active: 0 } } }),
  useBulkReview: () => ({ mutateAsync: bulkReviewMock, isPending: false }),
}));
vi.mock('@/hooks/useExamSession', () => ({
  useSessionOverview: () => ({
    data: [
      {
        id: 's1',
        courseId: 'course-1',
        rubricVersion: 3,
        fullySubmittedCount: 2,
        partialCount: 0,
      },
    ],
    isLoading: false,
  }),
}));

/**
 * `use(params)` / `useSearchParams` của Next 15 SUSPEND, nên cần CẢ hai:
 * một `<Suspense>` bọc ngoài VÀ `await act(...)`. Thiếu một trong hai thì
 * triệu chứng đọc ra như "component không render" — đợt 0→3 đã mất thời gian
 * đúng ở chỗ này.
 */
async function page() {
  await act(async () => {
    render(
      <Suspense fallback={null}>
        <MatrixPage />
      </Suspense>,
    );
  });
}
```

```tsx
it('áp luật cho ĐÚNG các dòng đang chọn', async () => {
  await page();
  fireEvent.click(screen.getByLabelText('Chọn tất cả'));
  fireEvent.click(screen.getByRole('button', { name: /Giữ điểm lượt chấm/ }));
  expect(bulkReviewMock).toHaveBeenCalledWith({
    resultIds: ['r1', 'r2'],
    rule: { kind: 'keep_ai' },
  });
});

it('can thiệp tiêu chí áp cho MỌI bài của phiên, không chỉ nhóm đang lọc', async () => {
  await page();
  fireEvent.click(screen.getAllByRole('button', { name: /Cho điểm tối đa cho cả lớp/ })[0]);
  expect(bulkReviewMock.mock.calls[0][0].resultIds).toHaveLength(allResults.length);
});

it('đổi nhóm thì bảng đổi theo và bỏ chọn hết', async () => {
  await page();
  fireEvent.click(screen.getByLabelText('Chọn tất cả'));
  fireEvent.click(screen.getByRole('button', { name: /Không lệch/ }));
  // Giữ lựa chọn qua một lần đổi nhóm sẽ áp luật cho những bài không còn
  // nhìn thấy trên màn hình.
  expect(screen.queryByRole('button', { name: /Giữ điểm lượt chấm/ })).not.toBeInTheDocument();
});

it('chưa chọn phiên thì chỉ đường quay lại', async () => {
  searchParams = new URLSearchParams();
  await page();
  expect(screen.getByText(/Chọn một phiên thi ở màn Điều phối/)).toBeInTheDocument();
});

it('can thiệp tiêu chí dùng rubric ĐÃ GHIM của phiên, không dùng bản mới nhất', async () => {
  // Phiên chấm bằng v3; môn đã có v5 với tiêu chí id khác hẳn. Lấy nhầm v5
  // thì server trả 400 "tiêu chí không thuộc rubric của phiên này" — may là
  // ồn ào. Nhưng nếu hai phiên bản TÌNH CỜ có chung một id thì nó áp đúng
  // route, sai tiêu chí, và không ai biết.
  await page();
  fireEvent.click(screen.getAllByRole('button', { name: /Cho điểm tối đa cho cả lớp/ })[0]);
  expect(bulkReviewMock.mock.calls[0][0].rule.criterionId).toBe(rubricV3.criteria[0].id);
});
```

- [ ] **Step 2: Chạy test để xác nhận nó ĐỎ**

Run: `cd apps/web && npx vitest run src/app/teacher/grading/matrix/page.test.tsx`
Expected: FAIL

- [ ] **Step 3: Cài đặt**

`matrix/page.tsx` đọc `?sessionId=` (bọc `<Suspense>` vì `useSearchParams`) và **dùng lại nguyên chuỗi phân giải rubric của màn Điều phối** — đây là đoạn đã trả giá một lần rồi, đừng dựng lại từ đầu:

```tsx
const overview = useSessionOverview();
const session = (overview.data ?? []).find((item) => item.id === sessionId);
const rubrics = useRubrics(session?.courseId);
// Rubric ĐÃ GHIM, không phải bản `isActive`. Hai lý do, mỗi lý do tự nó đủ:
// thang điểm dùng để quy kiến nghị phản biện phải là thang đã chấm; và id
// tiêu chí khác nhau giữa hai phiên bản, nên `criterion_full_marks` lấy từ
// bản mới sẽ áp nhầm tiêu chí.
const rubric = rubrics.data?.find((item) => item.version === session?.rubricVersion);
const maxByCriterion = useMemo(
  () => new Map((rubric?.criteria ?? []).map((c) => [c.id, c.maxPoints])),
  [rubric],
);
```

`courseId` lấy từ `useSessionOverview()`, **không** suy bằng cách khớp tên môn — hai môn trùng tên khác học kỳ đã khớp nhầm một lần, và hậu quả là sửa rubric của môn sai.

Rồi lọc theo `deltaGroupOf` và **bỏ chọn hết khi đổi nhóm**.

Panel gom cụm của bản mẫu **giữ lại**, dựng bằng `NotBuiltYetPanel` đã có ở `../_components/` (props: `title`, `missing`, `children`; nó tự bọc `children` trong `<fieldset disabled>`):

```tsx
<NotBuiltYetPanel
  title="Gom nhóm bài trả lời giống nhau"
  missing="Cần một đường đo độ tương đồng giữa các bài — chưa có. Hiện tại bạn lọc theo mức lệch giữa hai lượt chấm ở trên."
>
  <Button size="sm" variant="outline">Gom nhóm theo nội dung</Button>
</NotBuiltYetPanel>
```

Panel can thiệp tiêu chí thì **KHÔNG** bọc `NotBuiltYetPanel` — nó chạy thật từ Task 10.

Trong `apps/web/src/app/teacher/grading/page.tsx`, thêm nút dẫn sang, đặt cạnh "Mở bài đầu tiên":

```tsx
<Button variant="outline" size="sm" asChild>
  <Link href={`/teacher/grading/matrix?sessionId=${sessionId}`}>Mở ma trận điều hành</Link>
</Button>
```

- [ ] **Step 4: Chạy toàn bộ và kiểm tra chéo**

Run:
```bash
cd apps/web && npx vitest run && npx tsc --noEmit && npx eslint src && npx next build
```
Expected: mọi test xanh; tsc chỉ còn 2 lỗi CÓ SẴN; build xanh và có route `/teacher/grading/matrix`

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/teacher/grading
git commit -m "feat(web): màn Ma trận điều hành — lọc theo nhóm, áp luật hàng loạt"
```

---

## Task 12: Cập nhật tài liệu

**Files:**
- Modify: `docs/grading-system-guide.md`

- [ ] **Step 1: Sửa guide**

- §2 sơ đồ tầng 1: thêm `/teacher/grading/matrix` và ba component của nó
- §2 bảng route: thêm `POST exam-sessions/:id/bulk-review`
- §4 bản đồ file: thêm `bulk-rules.ts` (*"Bốn luật hàng loạt. Hàm thuần, dùng lại `pointsFor` chứ không chép"*) và `bulk-review.service.ts` (*"Một lô, một giao dịch. Máy móc duyệt dùng lại `reviewWithin`"*)
- §7.1 bảng: thêm `teacher_review.applied_rule` — *"luật hàng loạt nào sinh ra dòng này; `null` = duyệt tay. Tồn tại vì audit chỉ bắn sau khi chốt điểm"*
- §11: xoá dòng về thao tác hàng loạt nếu có

- [ ] **Step 2: Chạy toàn bộ lần cuối**

Run:
```bash
cd apps/api && npx tsc --noEmit && npx jest && npx jest --config test/jest-e2e.json && npx eslint src test --ext .ts && node ../../scripts/find-import-cycles.js src
cd ../web && npx vitest run && npx next build
```
Expected: tất cả xanh, `0` vòng lặp import

- [ ] **Step 3: Commit**

```bash
git add docs/grading-system-guide.md
git commit -m "docs(grading): guide phản ánh route duyệt hàng loạt và màn Ma trận"
```

---

## Kiểm tra sau khi xong

- [ ] Bấm "Giữ điểm lượt chấm" hai lần liên tiếp → lần hai báo *"không có gì thay đổi"*, không ghi thêm dòng nào
- [ ] `SELECT applied_rule FROM teacher_review WHERE applied_rule IS NOT NULL LIMIT 1` trả về một luật đọc được
- [ ] 25 test của `teacher-review.e2e-spec.ts` vẫn xanh **và chưa từng bị sửa** trong cả plan này
- [ ] Không màn hình nào lộ chữ `Advocate`, `Grader`, `keep_ai`, `apply_advocate`
- [ ] `node scripts/find-import-cycles.js apps/api/src` in `0`
