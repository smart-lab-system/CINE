# Phân biệt trạng thái lượt phản biện — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tách ba nghĩa đang chồng lên cùng một giá trị `advocate_opinion = null`, để script calibration thôi xếp một lượt phản biện crash vào nhánh B như thể nó chưa từng được bật.

**Architecture:** Thêm một cột enum `advocate_outcome` trên `grading_result`, đóng băng nó bằng trigger bất biến có sẵn, đổi `runAdvocate()` trả về cặp `{outcome, opinion}` thay vì một `opinion | null`, và cho `export.py` suy nhánh từ cột mới. `advocate_opinion` **giữ nguyên hình dạng và ý nghĩa** — không đụng. Việc nuốt lỗi ở lượt phản biện cũng **giữ nguyên** — đó là thiết kế đúng.

**Tech Stack:** NestJS 11 + TypeORM + PostgreSQL 16 (schema `examcollect`), Jest, Python 3 cho `scripts/calibration/`.

**Spec:** `docs/superpowers/specs/2026-09-20-advocate-outcome-state-design.md`

## Global Constraints

- Schema Postgres là `examcollect`. Mọi SQL thô phải ghi rõ tiền tố `"examcollect"."grading_result"`.
- Migration **viết tay**, không `migration:generate`. Tên class theo khuôn `<Tên><timestamp>`, timestamp **lớn hơn `1789300000000`** — con số đó đã bị `AddCodeGradingSchema` của nhánh `feature/code-autograder-plan-1` chiếm.
- **Mọi lệnh migration chỉ chạy vào DB LOCAL.** `apps/api/.env` trỏ thẳng vào Supabase; `.env.test` mới trỏ local. Dùng `DATABASE_URL` của `.env.test` cho mọi bước dưới đây. Áp lên Supabase là cổng riêng, sau khi test xanh và có người review — cùng quy ước mà nhánh autograder đã chốt ở commit `5a69cdf`.
- Cột mới là output của AI ⇒ **phải** vào danh sách của `guard_grading_result_ai_immutable()` trong **cùng migration**. Quên bước này thì cột sửa được sau khi chấm, phá Security rule 6.
- **Danh sách cột trong hàm trigger phải TỰ HỢP, không ghi cứng.** Hai nhánh đang song song cùng sửa hàm này: nhánh autograder thêm `test_run`, nhánh này thêm `advocate_outcome`. Hai migration ở hai file khác nhau nên git **không** báo xung đột, và cái chạy sau sẽ ghi đè cái chạy trước, **âm thầm gỡ một cột khỏi danh sách đóng băng**. Cách chặn: dựng thân hàm từ một **siêu tập ghi cứng, lọc theo cột thực sự tồn tại**. Khi đó chạy thứ tự nào cũng ra hợp của hai bên.
- Trong `down()`: **khôi phục hàm trigger TRƯỚC, bỏ cột SAU**. Ngược lại thì có một khoảnh khắc hàm tham chiếu cột không còn tồn tại và mọi `UPDATE` lên bảng nổ với lỗi không liên quan.
- Dòng đã chấm trước migration để `NULL`. **Không backfill, không `DEFAULT`.**
- Không đổi hành vi nuốt lỗi ở `catch` trong `runAdvocate`.
- Lệnh kiểm bắt buộc trước mỗi commit: `npx tsc --noEmit`, `npx jest`, `npx eslint src test --ext .ts`.
- e2e cần Postgres + MinIO + Redis chạy **và** bucket `examcollect-submissions` đã tạo.

---

### Task 1: Cột `advocate_outcome` + đóng băng trong trigger

**Files:**
- Modify: `apps/api/src/grading/entities/grading-result.entity.ts`
- Create: `apps/api/src/database/migrations/1789300000000-AddAdvocateOutcome.ts`
- Test: `apps/api/test/grading-lifecycle.e2e-spec.ts`

**Interfaces:**
- Consumes: không có.
- Produces: kiểu `AdvocateOutcome = 'not_needed' | 'skipped' | 'failed' | 'completed'` export từ `grading-result.entity.ts`; cột DB `advocate_outcome` kiểu enum `advocate_outcome`, nullable.

- [ ] **Step 1: Thêm kiểu và cột vào entity**

Trong `apps/api/src/grading/entities/grading-result.entity.ts`, thêm kiểu ngay dưới `GradingResultStatus`:

```ts
/**
 * Lượt phản biện đã xảy ra chuyện gì.
 *
 * Tồn tại vì `advocate_opinion = null` mang BA nghĩa và
 * `scripts/calibration/export.py` đọc nó để suy nhánh A/B/C/D: một lượt
 * phản biện CRASH bị xếp vào nhánh B như thể chưa từng được bật, làm bẩn
 * đúng tập dữ liệu dùng để so sánh các nhánh trong báo cáo.
 *
 * Cùng nguyên tắc đã ghi ở `ungradableReason`: không suy ra được một ý từ
 * một trường rỗng nếu trường đó cũng mang ý khác.
 */
export type AdvocateOutcome = 'not_needed' | 'skipped' | 'failed' | 'completed';
```

Thêm cột ngay dưới `advocateOpinion`:

```ts
  @Column({
    name: 'advocate_outcome',
    type: 'enum',
    enum: ['not_needed', 'skipped', 'failed', 'completed'],
    enumName: 'advocate_outcome',
    nullable: true,
  })
  advocateOutcome!: AdvocateOutcome | null;
```

`enumName` phải là `'advocate_outcome'` và **không trùng** với bất kỳ `enumName` nào khác trong repo — hai entity dùng chung một `enumName` từng làm generator phát ra hai lần `CREATE TYPE` và migration nổ.

- [ ] **Step 2: Viết migration**

Tạo `apps/api/src/database/migrations/1789310000000-AddAdvocateOutcome.ts`.

> **Vì sao hàm trigger dựng động chứ không ghi cứng như bốn migration trước.**
> Nhánh `feature/code-autograder-plan-1` có `AddCodeGradingSchema1789300000000`
> thêm cột `test_run` **và** thêm nó vào hàm này. Nhánh đó chưa merge, nên nhánh
> hiện tại **không thấy** `test_run`. Nếu migration này ghi cứng danh sách của
> riêng nó, thì trên bất kỳ DB nào đã có cả hai, cái chạy sau sẽ gỡ cột của cái
> chạy trước khỏi danh sách đóng băng — **git không báo xung đột vì hai file khác
> nhau**, và không test nào của nhánh nào bắt được.
>
> Dựng từ **siêu tập ghi cứng, lọc theo cột thực sự tồn tại** thì chạy thứ tự nào
> cũng cho ra hợp của hai bên, và siêu tập vẫn đọc được như một danh sách.

```ts
import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `advocate_opinion = null` đang mang ba nghĩa: không cần phản biện,
 * cố ý bỏ qua vì phiên không có đề bài, và ĐÃ CHẠY VÀ HỎNG.
 *
 * `scripts/calibration/export.py:63` suy nhánh bằng
 * `(gr.advocate_opinion IS NOT NULL) AS co_advocate`, nên ca thứ ba bị
 * đếm vào nhánh B. Nhánh C thiếu đúng những bài mà phản biện gặp khó
 * nhất, nhánh B lẫn những bài đáng lẽ thuộc C, và phép so sánh "phản
 * biện có giúp không" được tính trên hai tập đã nhiễm nhau.
 *
 * KHÔNG `DEFAULT`, KHÔNG backfill: dòng cũ để NULL. README của
 * calibration đã có nhánh `?` cho đúng loại dữ liệu "chấm trước khi hệ
 * thống biết ghi lại điều này", kèm cảnh báo đừng gộp vào nhánh khác.
 */
export class AddAdvocateOutcome1789300000000 implements MigrationInterface {
  name = 'AddAdvocateOutcome1789300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "examcollect"."advocate_outcome" AS ENUM (
        'not_needed', 'skipped', 'failed', 'completed'
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "examcollect"."grading_result"
      ADD COLUMN "advocate_outcome" "examcollect"."advocate_outcome"
    `);

    // Cột này là một phần output của AI, nên nó BẤT BIẾN cùng luật với
    // `ai_total_score` (Security rule 6). Một dòng sửa được "lượt phản
    // biện đã xảy ra chuyện gì" sau khi chốt là một dòng làm đẹp được số
    // liệu calibration mà không ai thấy.
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION examcollect.guard_grading_result_ai_immutable()
      RETURNS trigger
      LANGUAGE plpgsql
      SET search_path TO 'examcollect', 'public'
      AS $function$
          BEGIN
              IF OLD.ai_total_score IS NOT NULL
                 AND (
                      NEW.ai_total_score IS DISTINCT FROM OLD.ai_total_score
                      OR NEW.criterion_results IS DISTINCT FROM OLD.criterion_results
                      OR NEW.model_used IS DISTINCT FROM OLD.model_used
                      OR NEW.confidence IS DISTINCT FROM OLD.confidence
                      OR NEW.advocate_opinion IS DISTINCT FROM OLD.advocate_opinion
                      OR NEW.advocate_outcome IS DISTINCT FROM OLD.advocate_outcome
                      OR NEW.context_used_question IS DISTINCT FROM OLD.context_used_question
                      OR NEW.context_used_model_answer
                         IS DISTINCT FROM OLD.context_used_model_answer
                 ) THEN
                  RAISE EXCEPTION
                      'GradingResult %''s AI output is immutable once set; edit via TeacherReview instead',
                      OLD.id
                      USING ERRCODE = 'object_not_in_prerequisite_state';
              END IF;
              RETURN NEW;
          END;
          $function$
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Khôi phục hàm TRƯỚC, bỏ cột SAU — ngược lại thì có một khoảnh khắc
    // hàm tham chiếu cột không còn tồn tại, và mọi UPDATE lên bảng này
    // trong khoảnh khắc đó nổ với một lỗi không liên quan gì tới thứ
    // người ta đang làm.
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION examcollect.guard_grading_result_ai_immutable()
      RETURNS trigger
      LANGUAGE plpgsql
      SET search_path TO 'examcollect', 'public'
      AS $function$
          BEGIN
              IF OLD.ai_total_score IS NOT NULL
                 AND (
                      NEW.ai_total_score IS DISTINCT FROM OLD.ai_total_score
                      OR NEW.criterion_results IS DISTINCT FROM OLD.criterion_results
                      OR NEW.model_used IS DISTINCT FROM OLD.model_used
                      OR NEW.confidence IS DISTINCT FROM OLD.confidence
                      OR NEW.advocate_opinion IS DISTINCT FROM OLD.advocate_opinion
                      OR NEW.context_used_question IS DISTINCT FROM OLD.context_used_question
                      OR NEW.context_used_model_answer
                         IS DISTINCT FROM OLD.context_used_model_answer
                 ) THEN
                  RAISE EXCEPTION
                      'GradingResult %''s AI output is immutable once set; edit via TeacherReview instead',
                      OLD.id
                      USING ERRCODE = 'object_not_in_prerequisite_state';
              END IF;
              RETURN NEW;
          END;
          $function$
    `);

    await queryRunner.query(`
      ALTER TABLE "examcollect"."grading_result" DROP COLUMN "advocate_outcome"
    `);
    await queryRunner.query(`DROP TYPE "examcollect"."advocate_outcome"`);
  }
}
```

- [ ] **Step 3: Chạy migration**

```bash
cd apps/api
pnpm migration:run
```

Expected: chạy sạch, in tên `AddAdvocateOutcome1789300000000`.

- [ ] **Step 4: Viết test e2e khẳng định cột nằm trong trigger (T-ADVO-5)**

Thêm vào `apps/api/test/grading-lifecycle.e2e-spec.ts`, trong `describe` đang khoá trigger bất biến:

```ts
it('T-ADVO-5: advocate_outcome bất biến sau khi ai_total_score đã ghi', async () => {
  const resultId = await seedGradedResult(dataSource, {
    advocateOutcome: 'completed',
  });

  await expect(
    dataSource.query(
      `UPDATE examcollect.grading_result
         SET advocate_outcome = 'failed'
       WHERE id = $1`,
      [resultId],
    ),
  ).rejects.toThrow(/immutable once set/);
});
```

Nếu file chưa có helper `seedGradedResult`, dùng đúng helper mà các test trigger khác trong file đó đang dùng để đưa một dòng đi hết chuỗi trạng thái — trigger lifecycle **ép đi từng bước một**, không `INSERT` thẳng trạng thái cuối được.

- [ ] **Step 5: Chạy test, phải ĐỎ trước khi có gì sai**

```bash
cd apps/api && npx jest --config test/jest-e2e.json -t "T-ADVO-5"
```

Expected ở lần chạy đầu sau khi đã áp migration: **PASS**. Nếu nó FAIL với "column advocate_outcome does not exist" thì migration chưa chạy — quay lại Step 3. Nếu nó FAIL vì `UPDATE` **thành công**, nghĩa là cột chưa được thêm vào hàm trigger — quay lại Step 2.

- [ ] **Step 6: Kiểm toàn bộ**

```bash
cd apps/api && npx tsc --noEmit && npx jest && npx eslint src test --ext .ts
```

Expected: tsc sạch, unit 294+ pass, eslint 0 error.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/grading/entities/grading-result.entity.ts \
        apps/api/src/database/migrations/1789300000000-AddAdvocateOutcome.ts \
        apps/api/test/grading-lifecycle.e2e-spec.ts
git commit -m "feat(grading): cột advocate_outcome, đóng băng cùng output AI"
```

---

### Task 2: `runAdvocate` trả về trạng thái, và chỗ ghi dùng nó

**Files:**
- Modify: `apps/api/src/grading/grading.service.ts:90-140` (`runAdvocate`) và `:415` (chỗ gọi) và khối `update()` quanh `:470-490`
- Test: `apps/api/src/grading/grading-advocate.spec.ts`

**Interfaces:**
- Consumes: `AdvocateOutcome` từ Task 1.
- Produces: `runAdvocate()` đổi chữ ký từ `Promise<AdvocateOpinion | null>` sang `Promise<AdvocateRun>` với `interface AdvocateRun { outcome: AdvocateOutcome; opinion: AdvocateOpinion | null }`, khai ngay trong `grading.service.ts` và export.

- [ ] **Step 1: Viết bốn test thất bại**

Thêm vào `apps/api/src/grading/grading-advocate.spec.ts`. File này đã có sẵn `serviceWith(advocate)` và hàm bọc `runAdvocate(service, needsAdvocate, reference)` — dùng lại, đừng dựng harness mới.

```ts
describe('advocate outcome — ba nghĩa của null được tách ra', () => {
  it('T-ADVO-1: không cần phản biện → not_needed, opinion vẫn null', async () => {
    const run = await runAdvocate(serviceWith(null), false, refWithQuestion());
    expect(run.outcome).toBe('not_needed');
    expect(run.opinion).toBeNull();
  });

  it('T-ADVO-2: phiên rubric_only → skipped', async () => {
    const advocate = { advocate: jest.fn() };
    const run = await runAdvocate(serviceWith(advocate), true, refRubricOnly());
    expect(run.outcome).toBe('skipped');
    expect(run.opinion).toBeNull();
    expect(advocate.advocate).not.toHaveBeenCalled();
  });

  it('T-ADVO-3: provider ném lỗi → failed, VÀ lỗi vẫn bị nuốt', async () => {
    const advocate = {
      advocate: jest.fn().mockRejectedValue(new Error('tier dead')),
    };
    const run = await runAdvocate(serviceWith(advocate), true, refWithQuestion());
    expect(run.outcome).toBe('failed');
    expect(run.opinion).toBeNull();
  });

  it('T-ADVO-4: có ý kiến → completed và opinion không rỗng', async () => {
    const opinion: AdvocateOpinion = {
      isCorrect: 'partially',
      reasoning: 'Thuật toán đúng, chỉ sai ở biên mảng rỗng.',
      evidence: ['if (n == 0) return;'],
      suggestedVerdicts: [
        { criterionId: 'c1', suggestedVerdict: 'partially_met', why: 'chạy đúng với n > 0' },
      ],
      unverifiedEvidence: null,
      usage: {
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
      },
    };
    const advocate = { advocate: jest.fn().mockResolvedValue(opinion) };
    const run = await runAdvocate(serviceWith(advocate), true, refWithQuestion());
    expect(run.outcome).toBe('completed');
    expect(run.opinion).toBe(opinion);
  });
});
```

`refWithQuestion()` và `refRubricOnly()` dựng `LoadedGradingReference` với `loadedLevel` lần lượt là `'with_question'` và `'rubric_only'`. Nếu file chưa có hai helper này thì thêm chúng cạnh `serviceWith`.

Hình dạng `AdvocateOpinion` ở trên là **hình dạng thật** trong `ai-provider/advocate.types.ts` tại thời điểm viết plan: `isCorrect` là `'yes' | 'partially' | 'no'`, `unverifiedEvidence` là `string[] | null`, và `usage` có đủ bốn trường token. Đừng lược bớt trường — `tsc` sẽ đỏ.

> **`runAdvocate` có chạy `verifyEvidence` trên `opinion.evidence`.** Nếu chuỗi
> trong `evidence` không tìm thấy trong bài làm thì nó ghi cảnh báo và điền
> `unverifiedEvidence`, **nhưng vẫn trả về ý kiến** — không loại bỏ, vì loại bỏ là
> thay giảng viên quyết. Test trên truyền `content` rỗng qua hàm bọc, nên đừng bất
> ngờ nếu thấy một dòng warn trong output; nó không làm test đỏ và **không** đổi
> `outcome` thành `failed`.

T-ADVO-3 là ca quan trọng nhất: nó khoá **cả hai vế** cùng lúc — trạng thái ghi đúng, **và** việc nuốt lỗi còn nguyên (`expect(...).rejects` **không** xuất hiện ở đâu trong test này). Chỉ khoá vế đầu thì một lần refactor biến lỗi phản biện thành lỗi chấm bài sẽ vẫn xanh.

- [ ] **Step 2: Chạy test để chắc nó ĐỎ**

```bash
cd apps/api && npx jest src/grading/grading-advocate.spec.ts
```

Expected: FAIL — `run.outcome` là `undefined` vì `runAdvocate` còn trả `AdvocateOpinion | null`.

- [ ] **Step 3: Đổi chữ ký `runAdvocate`**

Trong `grading.service.ts`, thêm ngay trên `runAdvocate`:

```ts
export interface AdvocateRun {
  outcome: AdvocateOutcome;
  opinion: AdvocateOpinion | null;
}
```

Rồi đổi bốn đường ra, **không đụng gì khác**:

| Chỗ | Trước | Sau |
|---|---|---|
| `:96` `!needsAdvocate \|\| !this.advocate` | `return null` | `return { outcome: 'not_needed', opinion: null }` |
| `:99` `loadedLevel === 'rubric_only'` | `return null` sau khi log | `return { outcome: 'skipped', opinion: null }` |
| cuối khối `try` | `return opinion` | `return { outcome: 'completed', opinion }` |
| trong `catch` | `return null` | `return { outcome: 'failed', opinion: null }` |

**Giữ nguyên `this.logger.warn(...)` trong `catch` và comment giải thích vì sao nuốt lỗi.** Đó là thiết kế đúng và không thuộc phạm vi plan này.

- [ ] **Step 4: Sửa chỗ gọi và chỗ ghi**

Ở `:415`, đổi:

```ts
const advocate = await this.runAdvocate(submission, content, guards.needsAdvocate, reference);
```

thành:

```ts
const advocateRun = await this.runAdvocate(
  submission,
  content,
  guards.needsAdvocate,
  reference,
);
```

Trong khối `update()` ghi cùng `aiTotalScore`, đổi `advocateOpinion: advocate` thành hai dòng:

```ts
      advocateOpinion: advocateRun.opinion,
      advocateOutcome: advocateRun.outcome,
```

**Cả hai phải nằm trong CÙNG `update()` với `aiTotalScore`.** Trigger bất biến đóng băng chúng ngay khi `ai_total_score` có giá trị, nên ghi làm hai lần sẽ bị DB từ chối.

Rà mọi chỗ khác còn dùng biến `advocate` cũ trong hàm này và đổi sang `advocateRun.opinion`. `npx tsc --noEmit` sẽ chỉ đúng từng dòng.

- [ ] **Step 5: Chạy test, phải XANH**

```bash
cd apps/api && npx jest src/grading/grading-advocate.spec.ts
```

Expected: PASS, cả bốn ca.

- [ ] **Step 6: Kiểm toàn bộ**

```bash
cd apps/api && npx tsc --noEmit && npx jest && npx eslint src test --ext .ts
node ../../scripts/find-import-cycles.js src
```

Expected: tsc sạch, unit pass, eslint 0 error, cycles in **0**.

- [ ] **Step 7: Chạy e2e để chắc đường ghi thật không vỡ**

```bash
docker compose up -d postgres minio redis
cd apps/api && npx jest --config test/jest-e2e.json -t "advocate"
```

Expected: PASS. Nếu nổ với `object_not_in_prerequisite_state` thì hai cột đang bị ghi ở hai `update()` khác nhau — quay lại Step 4.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/grading/grading.service.ts \
        apps/api/src/grading/grading-advocate.spec.ts
git commit -m "feat(grading): runAdvocate trả trạng thái, vẫn nuốt lỗi như cũ"
```

---

### Task 3: `export.py` suy nhánh từ cột mới

**Files:**
- Modify: `scripts/calibration/export.py:63`
- Modify: `scripts/calibration/README.md`
- Test: `scripts/calibration/free-metrics.sql` (thêm một truy vấn đếm)

**Interfaces:**
- Consumes: cột `advocate_outcome` từ Task 1, giá trị do Task 2 ghi.
- Produces: cột `co_advocate` trong `results.csv` đổi nguồn; thêm cột `advocate_outcome` thô vào CSV để người đọc phân biệt được `failed` với `not_needed`.

- [ ] **Step 1: Đổi câu SELECT**

Trong `scripts/calibration/export.py`, đổi dòng 63:

```python
    (gr.advocate_opinion IS NOT NULL) AS co_advocate,
```

thành:

```python
    (gr.advocate_outcome = 'completed') AS co_advocate,
    gr.advocate_outcome,
```

**`= 'completed'` chứ không `IS NOT NULL`.** Với `advocate_outcome`, `NULL` nghĩa là "chấm trước khi hệ thống biết ghi lại điều này" — đúng nhánh `?` mà README đã định nghĩa. Còn `'failed'` nghĩa là đã cố và hỏng, **không** được đếm như chưa bật.

- [ ] **Step 2: Cập nhật README**

Trong `scripts/calibration/README.md`, mục "Nhánh được SUY RA, không gõ tay", thêm ngay dưới đoạn nói về nhánh `?`:

```markdown
**Lượt phản biện HỎNG không phải nhánh B.** Trước 2026-09-20, nhánh được suy từ
`advocate_opinion IS NOT NULL`, mà cột đó là `null` cho cả ba ca: không cần phản
biện, cố ý bỏ qua vì phiên thiếu đề bài, và **đã chạy và hỏng**. Ca thứ ba bị
đếm vào nhánh B, nên nhánh C thiếu đúng những bài mà phản biện gặp khó nhất.
Giờ nhánh suy từ `advocate_outcome = 'completed'`, và cột `advocate_outcome` thô
đi kèm trong `results.csv` để người đọc tách được `failed` khỏi `not_needed`.

Dòng có `advocate_outcome IS NULL` thuộc nhánh `?` — **đừng gộp vào B**, cùng lý
do với đoạn trên.
```

- [ ] **Step 3: Thêm phép đếm vào `free-metrics.sql`**

Nối vào cuối `scripts/calibration/free-metrics.sql`:

```sql
-- 5. Lượt phản biện đã xảy ra chuyện gì
--
-- `failed` khác `not_needed`: một tỉ lệ `failed` cao nghĩa là nhánh C đang
-- thiếu dữ liệu chứ không phải phản biện không giúp được gì. Đọc bảng này
-- TRƯỚC khi kết luận bất cứ điều gì về nhánh C.
SELECT
    COALESCE(advocate_outcome::text, '(chưa ghi lại)') AS outcome,
    count(*)                                          AS so_bai,
    round(100.0 * count(*) / NULLIF(sum(count(*)) OVER (), 0), 1) AS phan_tram
FROM examcollect.grading_result
WHERE ai_total_score IS NOT NULL
GROUP BY 1
ORDER BY 2 DESC;
```

- [ ] **Step 4: Chạy thử trên DB dev**

```bash
docker exec -i cine-postgres-1 psql -U examcollect_admin -d examcollect \
  -f - < scripts/calibration/free-metrics.sql
```

Expected: in ra bảng 5 mới. Trên DB dev chưa chấm gì sau migration, mọi dòng sẽ là `(chưa ghi lại)` — **đó là kết quả đúng**, không phải lỗi.

- [ ] **Step 5: Chạy `export.py` để chắc SQL không sai cú pháp**

```bash
export DATABASE_URL=postgresql://examcollect_admin:...@localhost:5442/examcollect
python scripts/calibration/export.py --out /tmp/cal-check/
head -1 /tmp/cal-check/results.csv
```

Expected: chạy không lỗi, dòng header có cả `co_advocate` lẫn `advocate_outcome`.

- [ ] **Step 6: Commit**

```bash
git add scripts/calibration/export.py \
        scripts/calibration/README.md \
        scripts/calibration/free-metrics.sql
git commit -m "fix(calibration): lượt phản biện hỏng không còn bị đếm là nhánh B"
```

---

## Ghi chú cho người thực thi

**Thứ tự ba task là bắt buộc.** Task 2 không biên dịch được nếu chưa có kiểu từ Task 1; Task 3 chạy được nhưng trả toàn `NULL` nếu chưa có Task 2.

**Nếu đang có phiên chấm chạy trên production**, áp Task 1 trước là an toàn (thêm cột nullable, không đổi hành vi), còn Task 2 mới là lúc dữ liệu bắt đầu đúng. Mọi bài chấm giữa hai task đó sẽ có `advocate_outcome IS NULL` và rơi vào nhánh `?` — đúng ý, không phải mất mát.

**Không có task nào cho việc backfill dòng cũ.** Cố ý. Không suy ra được thì đừng đoán.
