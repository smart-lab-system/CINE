# Lý do AI không chấm được — lưu vào DB & UI trung thực — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Khi AI không chấm được một bài, lý do phải nằm trong DB (không chỉ trong log terminal đã xoay vòng), và màn hình duyệt bài phải nói ra sự thật đó — cả để giảng viên biết tại sao, lẫn để họ chấm tay được thay vì gặp một danh sách trống không sửa nổi.

**Architecture:** Một cột `ungradable_reason` trên `grading_result`, ghi bởi `markUngradable()` — nơi DUY NHẤT tạo ra trạng thái này. Cột này chảy qua `GradingResultView` (đã có, không cần route mới) tới `GradingResult` ở web, và màn `grading/[resultId]` đọc nó để quyết định: (a) có cảnh báo AI hỏng không, và (b) rows để chấm dựng từ RUBRIC hay từ `criterionResults` của AI.

**Tech Stack:** NestJS 11 + TypeORM + Postgres (`apps/api`, jest) · Next.js 15 App Router + React 19 + TanStack Query + Tailwind (`apps/web`, vitest).

**Spec:** Không có spec doc riêng — hai việc này phát sinh trực tiếp từ điều tra sự cố 2026-09-17 (bài của HS24001, phiên "Thi cuối kỳ lập trình web 2026": tài khoản Anthropic hết credit → `markUngradable` chạy đúng thiết kế → nhưng lý do chỉ nằm trong log, và màn hình duyệt bài hiện "0/10" giả kèm danh sách tiêu chí rỗng không sửa được). Grounding nằm trong lịch sử hội thoại của phiên debug đó, không phải một file `docs/superpowers/specs/`.

## Global Constraints

- **Nhánh nền:** ba commit gần nhất (`e8f5187`, `47f4e33`, `919a45c`) đi thẳng lên `main`, khác quy ước PR mà lịch sử git của repo này dùng (`Merge pull request #NN`). Plan này tạo nhánh riêng `feature/grading-ungradable-reason` từ `main`, quay lại đúng quy ước.
- **Security rule 6 (bất biến output AI).** `ungradable_reason` KHÔNG được thêm vào danh sách cột bảo vệ của `guard_grading_result_ai_immutable` — và đó là chủ ý, không phải thiếu sót: guard chỉ khoá khi `OLD.ai_total_score IS NOT NULL`, còn `markUngradable` chỉ chạy khi `ai_total_score` CÒN NULL (nhánh loại trừ lẫn nhau ngay từ thiết kế). Không tạo ràng buộc DB mới cho một điều kiện app code đã đảm bảo (early-return theo `status !== 'ai_grading'`).
- **`reason` truyền vào `markUngradable` đã qua `describeError()` ở `grading.processor.ts` — AN TOÀN hiển thị thẳng cho giảng viên.** Với lỗi mang `.status` (mọi lỗi từ provider AI), nó ĐÃ redact thành `"HTTP {status} {type} (nội dung lỗi bị cắt — có thể chứa bài làm)"` — KHÔNG bao giờ là câu tiếng Anh gốc của provider. Plan này KHÔNG đổi mức độ redact đó — chỉ lưu và hiển thị nguyên văn những gì `describeError()` đã tạo ra. Đừng "cải thiện" độ chi tiết của message ở đâu trong plan này; đó là một quyết định bảo mật riêng, ngoài phạm vi.
- **`apps/web/src/lib/api/grading.ts`'s `GradingResult` không đi qua `@cine/shared`/OpenAPI schema** — nó bị ép kiểu `as unknown as GradingResult[]` ở `listGradingResults()`. Thêm trường mới vào response backend KHÔNG cần regenerate schema, KHÔNG cần chạy API trước khi build web.
- **`tsc --noEmit` ở `apps/web` bắt lỗi mà `vitest run`/`next build` bỏ qua** (đã xác nhận trong phiên debug hôm nay với `rosterFrozen`). Một trường bắt buộc mới trên `GradingResult` sẽ làm hỏng MỌI nơi dựng object literal đó — chạy `tsc --noEmit` là bước bắt buộc trước khi coi một task frontend là xong, không phải tuỳ chọn.
- **`ValidationPipe` không liên quan** — đây không phải DTO nhận từ client, là response đọc ra, nên không có nguy cơ "trường lạ bị cắt im lặng".

## File Structure

Backend:
- `apps/api/src/database/migrations/1789290000000-AddGradingUngradableReason.ts` — **tạo mới**. Một cột `text`, nullable.
- `apps/api/src/grading/entities/grading-result.entity.ts` — **sửa**. Thêm `ungradableReason: string | null`.
- `apps/api/src/grading/grading.service.ts` — **sửa**. `markUngradable()` ghi cột mới; `GradingResultView` + `listForSession()` trả nó ra.
- `apps/api/test/grading-lifecycle.e2e-spec.ts` — **sửa**. Mở rộng test T-B3 sẵn có.
- `apps/api/test/grading-results-view.e2e-spec.ts` — **sửa**. Thêm hai test cho `GET grading-results`.

Frontend:
- `apps/web/src/lib/api/grading.ts` — **sửa**. Thêm `ungradableReason: string | null` vào `GradingResult`.
- `apps/web/src/app/teacher/grading/[resultId]/page.tsx` — **sửa**. Banner cảnh báo + rows dựng từ rubric khi AI hỏng.
- `apps/web/src/app/teacher/grading/[resultId]/page.test.tsx` — **sửa**. Cập nhật fixture mặc định + hai test mới.
- `apps/web/src/app/teacher/grading/[resultId]/_components/ManualCriterionCard.tsx` — **tạo mới**. Thẻ chấm tay, không có gì của AI để hiện.
- `apps/web/src/app/teacher/grading/[resultId]/_components/ManualCriterionCard.test.tsx` — **tạo mới**.
- Năm chỗ khác dựng `GradingResult` object literal, chỉ cần thêm `ungradableReason: null` vào fixture mặc định (không có logic mới):
  - `apps/web/src/app/teacher/grading/matrix/_components/fixtures.ts`
  - `apps/web/src/lib/grading-triage.test.ts`
  - `apps/web/src/app/teacher/grading/_components/AnomalyPanel.test.tsx`
  - `apps/web/src/app/teacher/grading/_components/ConfidenceTiles.test.tsx`
  - `apps/web/src/app/teacher/grading/_components/ReviewWorkspace.test.tsx`

---

### Task 0: Tạo nhánh

**Files:** không có.

- [ ] **Step 1: Tạo nhánh từ `main`**

```bash
git checkout main
git pull origin main
git checkout -b feature/grading-ungradable-reason
```

---

### Task 1: Backend — cột `ungradable_reason`, ghi bởi `markUngradable`

**Files:**
- Create: `apps/api/src/database/migrations/1789290000000-AddGradingUngradableReason.ts`
- Modify: `apps/api/src/grading/entities/grading-result.entity.ts`
- Modify: `apps/api/src/grading/grading.service.ts:158-172` (hàm `markUngradable`)
- Test: `apps/api/test/grading-lifecycle.e2e-spec.ts` (mở rộng test `T-B3` đã có)

**Interfaces:**
- Produces: `GradingResultEntity.ungradableReason: string | null` — Task 2 đọc trường này qua TypeORM, không qua raw SQL.

- [ ] **Step 1: Mở rộng test T-B3 đã có, viết assertion mới TRƯỚC**

Tìm khối này trong `apps/api/test/grading-lifecycle.e2e-spec.ts`:

```ts
  it('T-B3: markUngradable đưa bài hỏng ra khỏi ai_grading', async () => {
    // Migration mở cửa là chưa đủ — phải có ai ĐI QUA nó. Trước hàm này,
    // một job hết retry chỉ để lại một dòng log, còn dòng chấm nằm mãi ở
    // `ai_grading` và `progress()` đếm nó là `pending` vĩnh viễn.
    const id = await seedGradingResultAtAiGrading();
    const [row0] = await dataSource.query(
      `SELECT submission_id FROM examcollect.grading_result WHERE id = $1`,
      [id],
    );

    await app.get(GradingService).markUngradable(row0.submission_id, 'HTTP 503 overloaded_error');

    const [row] = await dataSource.query(
      `SELECT status, flag_for_review, confidence FROM examcollect.grading_result WHERE id = $1`,
      [id],
    );
    expect(row.status).toBe('flagged_for_review');
    expect(row.flag_for_review).toBe(true);
    // 0 điểm tin cậy, KHÔNG phải 0 điểm bài: không chấm được là sự thật về
    // hệ thống, không phải phán xét về bài làm.
    expect(Number(row.confidence)).toBe(0);
    const [scored] = await dataSource.query(
      `SELECT ai_total_score FROM examcollect.grading_result WHERE id = $1`,
      [id],
    );
    expect(scored.ai_total_score).toBeNull();
  });
```

Thay bằng (thêm `ungradable_reason` vào SELECT và một assertion mới, comment giải thích vì sao):

```ts
  it('T-B3: markUngradable đưa bài hỏng ra khỏi ai_grading', async () => {
    // Migration mở cửa là chưa đủ — phải có ai ĐI QUA nó. Trước hàm này,
    // một job hết retry chỉ để lại một dòng log, còn dòng chấm nằm mãi ở
    // `ai_grading` và `progress()` đếm nó là `pending` vĩnh viễn.
    const id = await seedGradingResultAtAiGrading();
    const [row0] = await dataSource.query(
      `SELECT submission_id FROM examcollect.grading_result WHERE id = $1`,
      [id],
    );

    await app.get(GradingService).markUngradable(row0.submission_id, 'HTTP 503 overloaded_error');

    const [row] = await dataSource.query(
      `SELECT status, flag_for_review, confidence, ungradable_reason
         FROM examcollect.grading_result WHERE id = $1`,
      [id],
    );
    expect(row.status).toBe('flagged_for_review');
    expect(row.flag_for_review).toBe(true);
    // 0 điểm tin cậy, KHÔNG phải 0 điểm bài: không chấm được là sự thật về
    // hệ thống, không phải phán xét về bài làm.
    expect(Number(row.confidence)).toBe(0);
    // Trước cột này: lý do chỉ nằm trong log terminal của lần chạy đó.
    // Sự cố thật 2026-09-17 (tài khoản Anthropic hết credit) mất cả buổi
    // điều tra vì không có cách nào truy lại nó từ DB sau khi log xoay
    // vòng — đây là cột bịt đúng lỗ đó.
    expect(row.ungradable_reason).toBe('HTTP 503 overloaded_error');
    const [scored] = await dataSource.query(
      `SELECT ai_total_score FROM examcollect.grading_result WHERE id = $1`,
      [id],
    );
    expect(scored.ai_total_score).toBeNull();
  });
```

- [ ] **Step 2: Chạy test, xác nhận FAIL vì cột chưa tồn tại**

```bash
cd apps/api
npx jest --config ./test/jest-e2e.json grading-lifecycle -t "T-B3"
```

Kỳ vọng: lỗi Postgres `column "ungradable_reason" does not exist` (hoặc lỗi tương đương từ driver) — KHÔNG phải một assertion mismatch. Nếu test fail vì lý do khác (ví dụ lỗi kết nối DB), dừng lại và xử lý trước khi qua bước tiếp.

- [ ] **Step 3: Tạo migration**

```ts
import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `markUngradable` (grading.service.ts) chỉ LOG lý do AI không chấm
 * được — chưa từng ghi vào DB. Sự cố thật 2026-09-17 (tài khoản
 * Anthropic hết credit, bài của HS24001 phiên "Thi cuối kỳ lập trình
 * web 2026") mất cả buổi điều tra vì câu trả lời duy nhất nằm trong log
 * terminal của đúng lần chạy đó — không truy lại được sau khi log xoay
 * vòng, và không ai nhớ chính xác thời điểm để đi tìm log cũ.
 *
 * `TEXT`, không giới hạn độ dài như `model_used varchar(100)`: đây là
 * một câu mô tả lỗi (đã qua `describeError()`, an toàn hiển thị), không
 * phải một mã định danh ngắn.
 *
 * KHÔNG thêm vào `guard_grading_result_ai_immutable`: guard đó chỉ khoá
 * khi `OLD.ai_total_score IS NOT NULL`, còn `markUngradable` chỉ chạy
 * khi `ai_total_score` CÒN NULL (early-return theo `status !==
 * 'ai_grading'` chặn mọi lần gọi lại sau đó) — hai nhánh loại trừ lẫn
 * nhau ngay từ code, không cần thêm ràng buộc DB cho một điều đã đúng.
 */
export class AddGradingUngradableReason1789290000000 implements MigrationInterface {
  name = 'AddGradingUngradableReason1789290000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "examcollect"."grading_result"
      ADD COLUMN "ungradable_reason" text
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "examcollect"."grading_result"
      DROP COLUMN "ungradable_reason"
    `);
  }
}
```

- [ ] **Step 4: Chạy migration**

```bash
cd apps/api
pnpm migration:run
```

Xác nhận output liệt kê `AddGradingUngradableReason1789290000000` đã chạy, không lỗi.

- [ ] **Step 5: Thêm cột vào entity**

Trong `apps/api/src/grading/entities/grading-result.entity.ts`, tìm:

```ts
  @Column({ name: 'flag_for_review', type: 'boolean', default: false })
  flagForReview!: boolean;
```

Thêm ngay sau (giữ nguyên đoạn trên):

```ts
  @Column({ name: 'flag_for_review', type: 'boolean', default: false })
  flagForReview!: boolean;

  /**
   * Vì sao AI KHÔNG chấm được bài này — chỉ khác `null` khi
   * `GradingService.markUngradable` chạy.
   *
   * `NULL` với MỌI dòng khác, kể cả dòng chấm bình thường: không suy ra
   * được "không có lỗi" từ một trường rỗng nếu trường đó cũng có thể có
   * nghĩa "chưa từng chạy tới nhánh này" — hai ý khác nhau, và cột này
   * chỉ mang MỘT ý.
   *
   * Nội dung đã qua `describeError()` ở `grading.processor.ts` trước
   * khi tới đây — KHÔNG bao giờ chứa bài làm của sinh viên hay khoá API
   * gốc, an toàn hiển thị thẳng cho giảng viên.
   */
  @Column({ name: 'ungradable_reason', type: 'text', nullable: true })
  ungradableReason!: string | null;
```

- [ ] **Step 6: `markUngradable` ghi cột mới**

Trong `apps/api/src/grading/grading.service.ts`, tìm:

```ts
  async markUngradable(submissionId: string, reason: string): Promise<void> {
    const result = await this.results.findOne({ where: { submissionId } });
    if (!result || result.status !== 'ai_grading') {
      // Đã đi tiếp rồi (chấm xong, hoặc một lần gọi trước đã đánh dấu).
      // Im lặng bỏ qua: hàm này được gọi từ một event handler có thể bắn
      // nhiều lần.
      return;
    }
    await this.results.update(result.id, {
      status: 'flagged_for_review',
      flagForReview: true,
      confidence: '0',
    });
    this.logger.error(`submission ${submissionId}: AI không chấm được — ${reason}`);
  }
```

Thay bằng:

```ts
  async markUngradable(submissionId: string, reason: string): Promise<void> {
    const result = await this.results.findOne({ where: { submissionId } });
    if (!result || result.status !== 'ai_grading') {
      // Đã đi tiếp rồi (chấm xong, hoặc một lần gọi trước đã đánh dấu).
      // Im lặng bỏ qua: hàm này được gọi từ một event handler có thể bắn
      // nhiều lần.
      return;
    }
    await this.results.update(result.id, {
      status: 'flagged_for_review',
      flagForReview: true,
      confidence: '0',
      ungradableReason: reason,
    });
    this.logger.error(`submission ${submissionId}: AI không chấm được — ${reason}`);
  }
```

- [ ] **Step 7: Chạy test, xác nhận PASS**

```bash
cd apps/api
npx jest --config ./test/jest-e2e.json grading-lifecycle
```

Kỳ vọng: toàn bộ file pass, không chỉ test vừa sửa — `seedGradingResultAtAiGrading` và các test khác trong file không được đổi hành vi.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/database/migrations/1789290000000-AddGradingUngradableReason.ts \
        apps/api/src/grading/entities/grading-result.entity.ts \
        apps/api/src/grading/grading.service.ts \
        apps/api/test/grading-lifecycle.e2e-spec.ts
git commit -m "feat(grading): lưu lý do AI không chấm được vào DB, không chỉ log"
```

---

### Task 2: Backend — surface `ungradableReason` qua `GET grading-results`

**Files:**
- Modify: `apps/api/src/grading/grading.service.ts` (interface `GradingResultView` + hàm `listForSession`)
- Test: `apps/api/test/grading-results-view.e2e-spec.ts`

**Interfaces:**
- Consumes: `GradingResultEntity.ungradableReason` (Task 1).
- Produces: `GradingResultView.ungradableReason: string | null` — Task 3 (frontend) đọc trường JSON `ungradableReason` từ response của `GET /exam-sessions/:id/grading-results`.

- [ ] **Step 1: Viết hai test mới TRƯỚC, trong `grading-results-view.e2e-spec.ts`**

Thêm vào cuối `describe` block, ngay trước dấu đóng `});` cuối file (sau test `'cổng phản biện không kích hoạt thì trả null, không phải object rỗng'`):

```ts
  it('không chấm được thì trả lý do, không phải để trống', async () => {
    // `gradedResult()` seed một dòng chấm THÀNH CÔNG — ca hỏng cần seed
    // riêng vì nó đi qua `markUngradable`, không qua `gradeOne`.
    const { sessionId, submissionId } = await sessionWithCollectedSubmission();
    const [result] = await dataSource.query(
      `INSERT INTO examcollect.grading_result
         (submission_id, rubric_id_version, grading_triggered_by, status)
       VALUES ($1, $2, $3, 'ai_grading') RETURNING id`,
      [submissionId, rubricId, idA],
    );
    await dataSource.query(
      `UPDATE examcollect.grading_result
          SET status = 'flagged_for_review', flag_for_review = true, confidence = 0,
              ungradable_reason = $2
        WHERE id = $1`,
      [
        result.id,
        'HTTP 400 invalid_request_error (nội dung lỗi bị cắt — có thể chứa bài làm)',
      ],
    );

    const res = await listResults(sessionId).expect(200);
    expect(res.body[0].ungradableReason).toBe(
      'HTTP 400 invalid_request_error (nội dung lỗi bị cắt — có thể chứa bài làm)',
    );
  });

  it('dòng chấm bình thường trả ungradableReason là null, không phải undefined', async () => {
    // Một trường bị BỎ QUÊN trong mapping của `listForSession` sẽ khiến
    // JSON không có key này — `undefined` ở client — khác `null` ở mọi
    // chỗ khác đọc "chưa chấm hỏng". Khẳng định rõ ràng đây LÀ `null`.
    const { sessionId } = await gradedResult({
      advocate: null,
      contextQuestion: null,
      contextModelAnswer: null,
    });

    const res = await listResults(sessionId).expect(200);
    expect(res.body[0].ungradableReason).toBeNull();
  });
```

- [ ] **Step 2: Chạy test, xác nhận FAIL**

```bash
cd apps/api
npx jest --config ./test/jest-e2e.json grading-results-view
```

Kỳ vọng: hai test mới fail — test đầu vì `res.body[0].ungradableReason` là `undefined` (không khớp chuỗi mong đợi), test sau vì `expect(undefined).toBeNull()` cũng fail (`undefined` không phải `null`). Các test khác trong file vẫn pass.

- [ ] **Step 3: Thêm trường vào interface và mapping**

Trong `apps/api/src/grading/grading.service.ts`, tìm interface:

```ts
export interface GradingResultView {
  id: string;
  submissionId: string;
  studentMssv: string;
  studentName: string;
  status: string;
  modelUsed: string | null;
  aiTotalScore: number | null;
  confidence: number | null;
  flagForReview: boolean;
  criterionResults: unknown[];
```

Thêm `ungradableReason` ngay sau `flagForReview`:

```ts
export interface GradingResultView {
  id: string;
  submissionId: string;
  studentMssv: string;
  studentName: string;
  status: string;
  modelUsed: string | null;
  aiTotalScore: number | null;
  confidence: number | null;
  flagForReview: boolean;
  /**
   * Vì sao AI KHÔNG chấm được — `null` với mọi dòng chấm bình thường.
   * Xem docblock của cột cùng tên ở `grading-result.entity.ts`.
   */
  ungradableReason: string | null;
  criterionResults: unknown[];
```

Tìm khối `return` trong `listForSession`:

```ts
      return {
        id: entity.id,
        submissionId: entity.submissionId,
        studentMssv: rows.raw[index].studentMssv,
        studentName: rows.raw[index].studentName,
        status: entity.status,
        modelUsed: entity.modelUsed,
        aiTotalScore: entity.aiTotalScore === null ? null : Number(entity.aiTotalScore),
        confidence: entity.confidence === null ? null : Number(entity.confidence),
        flagForReview: entity.flagForReview,
        criterionResults: entity.criterionResults,
```

Thêm `ungradableReason` ngay sau `flagForReview`:

```ts
      return {
        id: entity.id,
        submissionId: entity.submissionId,
        studentMssv: rows.raw[index].studentMssv,
        studentName: rows.raw[index].studentName,
        status: entity.status,
        modelUsed: entity.modelUsed,
        aiTotalScore: entity.aiTotalScore === null ? null : Number(entity.aiTotalScore),
        confidence: entity.confidence === null ? null : Number(entity.confidence),
        flagForReview: entity.flagForReview,
        ungradableReason: entity.ungradableReason,
        criterionResults: entity.criterionResults,
```

- [ ] **Step 4: Chạy test, xác nhận PASS**

```bash
cd apps/api
npx jest --config ./test/jest-e2e.json grading-results-view
```

- [ ] **Step 5: Chạy toàn bộ test API, xác nhận không có regression**

```bash
cd apps/api
npx jest
npx jest --config ./test/jest-e2e.json --runInBand
```

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/grading/grading.service.ts apps/api/test/grading-results-view.e2e-spec.ts
git commit -m "feat(grading): trả ungradableReason qua GET grading-results"
```

---

### Task 3: Frontend — type mới + banner trung thực (không sửa số điểm giả — Task 4 làm)

**Files:**
- Modify: `apps/web/src/lib/api/grading.ts`
- Modify: `apps/web/src/app/teacher/grading/[resultId]/page.tsx`
- Modify: `apps/web/src/app/teacher/grading/[resultId]/page.test.tsx`
- Modify (chỉ thêm field mặc định vào fixture, không đổi logic):
  - `apps/web/src/app/teacher/grading/matrix/_components/fixtures.ts`
  - `apps/web/src/lib/grading-triage.test.ts`
  - `apps/web/src/app/teacher/grading/_components/AnomalyPanel.test.tsx`
  - `apps/web/src/app/teacher/grading/_components/ConfidenceTiles.test.tsx`
  - `apps/web/src/app/teacher/grading/_components/ReviewWorkspace.test.tsx`

**Interfaces:**
- Consumes: JSON `ungradableReason` từ `GET /exam-sessions/:id/grading-results` (Task 2).
- Produces: `GradingResult.ungradableReason: string | null` — Task 4 dùng nó để quyết định render `ManualCriterionCard` hay `CriterionCard`.

- [ ] **Step 1: Viết test banner TRƯỚC, trong `page.test.tsx`**

Thêm test mới ngay trước dấu đóng `});` cuối file describe block (sau test `'không tìm thấy bài thì chỉ đường quay lại, không hiện trang trống'`):

```ts
  it('AI không chấm được thì nói rõ lý do, không phải im lặng', async () => {
    resultsData = [
      result({
        ungradableReason:
          'HTTP 400 invalid_request_error (nội dung lỗi bị cắt — có thể chứa bài làm)',
        criterionResults: [],
        aiTotalScore: null,
      }),
    ];
    await page();

    expect(await screen.findByText(/AI không chấm được bài này/)).toBeInTheDocument();
    // Không phải một câu chung chung — đúng lý do đã lưu, để giảng viên/
    // quản trị viên biết cần làm gì (ở đây: nạp lại quota).
    expect(screen.getByText(/nội dung lỗi bị cắt/)).toBeInTheDocument();
  });
```

- [ ] **Step 2: Chạy test, xác nhận FAIL**

```bash
cd apps/web
npx vitest run "src/app/teacher/grading/[resultId]/page.test.tsx"
```

Kỳ vọng: fail vì `screen.findByText(/AI không chấm được bài này/)` không tìm thấy (banner chưa tồn tại). Có thể kèm cảnh báo TypeScript ở terminal về `ungradableReason` không tồn tại trên type — bỏ qua ở bước này, `vitest` (transpile-only) vẫn chạy được và fail đúng vì banner thiếu, không phải vì lỗi biên dịch chặn đứng.

- [ ] **Step 3: Thêm trường vào type**

Trong `apps/web/src/lib/api/grading.ts`, tìm:

```ts
  flagForReview: boolean;
  criterionResults: {
```

Thay bằng:

```ts
  flagForReview: boolean;
  /**
   * Vì sao AI KHÔNG chấm được bài này — `null` với mọi bài chấm bình
   * thường. Đã qua `describeError()` ở backend trước khi tới đây, an
   * toàn hiển thị thẳng: không chứa bài làm của sinh viên hay khoá API.
   */
  ungradableReason: string | null;
  criterionResults: {
```

- [ ] **Step 4: Cập nhật fixture mặc định ở `page.test.tsx`**

Trong `apps/web/src/app/teacher/grading/[resultId]/page.test.tsx`, tìm hàm `result()`:

```ts
function result(over: Partial<GradingResult> = {}): GradingResult {
  return {
    id: 'r1',
    submissionId: 's1',
    studentMssv: '2151010023',
    studentName: 'Nguyễn Minh Anh',
    status: 'flagged_for_review',
    modelUsed: 'keyword-match@1',
    aiTotalScore: 0,
    confidence: 0.42,
    flagForReview: true,
    criterionResults: [
```

Thêm `ungradableReason: null,` ngay sau `flagForReview: true,`:

```ts
function result(over: Partial<GradingResult> = {}): GradingResult {
  return {
    id: 'r1',
    submissionId: 's1',
    studentMssv: '2151010023',
    studentName: 'Nguyễn Minh Anh',
    status: 'flagged_for_review',
    modelUsed: 'keyword-match@1',
    aiTotalScore: 0,
    confidence: 0.42,
    flagForReview: true,
    ungradableReason: null,
    criterionResults: [
```

- [ ] **Step 5: Thêm banner ở `page.tsx`**

Tìm:

```tsx
      {readOnly && (
        <Alert variant="info">
          <AlertDescription>
            AI đang chấm bài này — chưa duyệt được. Tải lại sau ít phút.
          </AlertDescription>
        </Alert>
      )}
```

Thay bằng (thêm banner mới ngay sau, và biến `aiFailedToGrade` khai ngay trên):

```tsx
      {readOnly && (
        <Alert variant="info">
          <AlertDescription>
            AI đang chấm bài này — chưa duyệt được. Tải lại sau ít phút.
          </AlertDescription>
        </Alert>
      )}

      {aiFailedToGrade && (
        <Alert variant="warning">
          <AlertDescription>
            AI không chấm được bài này — {result.ungradableReason}. Chấm tay các tiêu chí bên
            dưới.
          </AlertDescription>
        </Alert>
      )}
```

Tìm dòng khai `readOnly`/`published`:

```ts
  const readOnly = IN_PROGRESS.includes(result.status);
  const published = PUBLISHED.includes(result.status);
```

Thêm ngay sau:

```ts
  const readOnly = IN_PROGRESS.includes(result.status);
  const published = PUBLISHED.includes(result.status);
  // AI hỏng hẳn — khác `readOnly` (đang chấm, hai trạng thái không bao
  // giờ cùng đúng: markUngradable đưa thẳng ai_grading → flagged_for_
  // review, bỏ qua ai_graded). `criterionResults` rỗng VĨNH VIỄN ở ca
  // này, không phải "chưa xong".
  const aiFailedToGrade = result.ungradableReason !== null;
```

- [ ] **Step 6: Chạy test, xác nhận PASS**

```bash
cd apps/web
npx vitest run "src/app/teacher/grading/[resultId]/page.test.tsx"
```

- [ ] **Step 7: Chạy `tsc --noEmit`, sửa MỌI fixture còn thiếu trường**

```bash
cd apps/web
npx tsc --noEmit
```

Kỳ vọng lỗi ở năm file (thêm `ungradableReason: null,` vào đúng vị trí tương tự Step 4, cạnh `flagForReview`/`contextUsedModelAnswer` trong mỗi fixture — xem nội dung hiện tại bằng `grep -n "contextUsedModelAnswer" <file>` trước khi sửa để tìm đúng chỗ):

- `apps/web/src/app/teacher/grading/matrix/_components/fixtures.ts`
- `apps/web/src/lib/grading-triage.test.ts`
- `apps/web/src/app/teacher/grading/_components/AnomalyPanel.test.tsx`
- `apps/web/src/app/teacher/grading/_components/ConfidenceTiles.test.tsx`
- `apps/web/src/app/teacher/grading/_components/ReviewWorkspace.test.tsx`

Lặp: sửa một file → chạy lại `npx tsc --noEmit` → còn lỗi ở file khác → sửa tiếp, cho tới khi sạch (không còn lỗi liên quan `GradingResult`/`ungradableReason`; lỗi có sẵn ở `read-workbook.test.ts` không liên quan, bỏ qua).

- [ ] **Step 8: Chạy toàn bộ vitest, xác nhận không regression**

```bash
cd apps/web
npx vitest run
```

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/lib/api/grading.ts \
        "apps/web/src/app/teacher/grading/[resultId]/page.tsx" \
        "apps/web/src/app/teacher/grading/[resultId]/page.test.tsx" \
        apps/web/src/app/teacher/grading/matrix/_components/fixtures.ts \
        apps/web/src/lib/grading-triage.test.ts \
        apps/web/src/app/teacher/grading/_components/AnomalyPanel.test.tsx \
        apps/web/src/app/teacher/grading/_components/ConfidenceTiles.test.tsx \
        apps/web/src/app/teacher/grading/_components/ReviewWorkspace.test.tsx
git commit -m "feat(grading): banner trung thực khi AI không chấm được bài"
```

---

### Task 4: Frontend — chấm tay khi AI không chấm được (gỡ ngõ cụt)

**Files:**
- Create: `apps/web/src/app/teacher/grading/[resultId]/_components/ManualCriterionCard.tsx`
- Create: `apps/web/src/app/teacher/grading/[resultId]/_components/ManualCriterionCard.test.tsx`
- Modify: `apps/web/src/app/teacher/grading/[resultId]/page.tsx`
- Modify: `apps/web/src/app/teacher/grading/[resultId]/page.test.tsx`

**Interfaces:**
- Consumes: `GradingResult.ungradableReason` (Task 3), `Rubric.criteria: {id, description, maxPoints}[]` (đã có).
- Produces: không có consumer khác trong plan này — đây là task cuối.

- [ ] **Step 1: Viết test component TRƯỚC — `ManualCriterionCard.test.tsx`**

```tsx
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { ManualCriterionCard } from './ManualCriterionCard';

function card(props: Record<string, unknown> = {}) {
  return render(
    <ManualCriterionCard
      index={0}
      description="Xử lý nhất quán dữ liệu"
      maxPoints={4}
      draft={{ criterionId: 'c1', verdict: 'not_met', points: 0 }}
      active={false}
      onActivate={vi.fn()}
      onChange={vi.fn()}
      {...props}
    />,
  );
}

describe('ManualCriterionCard', () => {
  it('không bịa phán đoán của AI — không có badge đạt/chưa đạt nào', () => {
    card();
    // CriterionCard (bài AI chấm được) LUÔN có một trong ba nhãn này.
    // Card này thì không — vì không có phán đoán nào để hiện.
    expect(screen.queryByText(/^Đạt$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Đạt một phần/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Chưa đạt/)).not.toBeInTheDocument();
    expect(screen.getByText(/AI chưa chấm tiêu chí này/i)).toBeInTheDocument();
  });

  it('bấm một mức điểm thì báo đúng điểm và đúng verdict suy ra', () => {
    const onChange = vi.fn();
    card({ maxPoints: 4, onChange });

    fireEvent.click(screen.getByRole('button', { name: '4' }));

    expect(onChange).toHaveBeenCalledWith({ points: 4, verdict: 'met' });
  });

  it('bấm 0 thì verdict là not_met', () => {
    const onChange = vi.fn();
    card({ maxPoints: 4, onChange });

    fireEvent.click(screen.getByRole('button', { name: '0' }));

    expect(onChange).toHaveBeenCalledWith({ points: 0, verdict: 'not_met' });
  });

  it('hiện mô tả tiêu chí và điểm tối đa từ rubric', () => {
    card({ description: 'Chiến lược chịu lỗi', maxPoints: 10 });

    expect(screen.getByText('Chiến lược chịu lỗi')).toBeInTheDocument();
    expect(screen.getByText(/Tối đa 10 điểm/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận FAIL**

```bash
cd apps/web
npx vitest run "src/app/teacher/grading/[resultId]/_components/ManualCriterionCard.test.tsx"
```

Kỳ vọng: fail vì module `./ManualCriterionCard` không tồn tại.

- [ ] **Step 3: Tạo component**

```tsx
'use client';

import { Badge } from '@/components/ui/badge';
import type { ReviewCriterion } from '@/lib/api/grading';

/**
 * Một tiêu chí khi AI KHÔNG chấm được bài (xem `ungradableReason` ở
 * `page.tsx`) — khác `CriterionCard` ở chỗ không có gì của AI để hiện:
 * không verdict, không trích dẫn, không độ tin cậy. Hiện những thứ đó
 * bằng dữ liệu bịa (`verdict: 'not_met'` mặc định của bản nháp ban đầu)
 * sẽ là đúng loại lời nói dối mà `ungradableReason` sinh ra để chặn —
 * một phán đoán TRÔNG NHƯ của AI mà AI chưa từng đưa ra.
 *
 * KHÔNG có `AdvocatePanel`: ý kiến phản biện chỉ sinh ra SAU khi Grader
 * chấm xong (`runAdvocate` ở `grading.service.ts` được gọi sau bước
 * chấm điểm) — nó không bao giờ chạy cho một bài AI chấm hỏng ngay từ
 * bước đầu. Hiện panel ở đây chỉ là "không có ý kiến" vẽ lại nhiều lần,
 * không mang thêm thông tin.
 */
export function ManualCriterionCard({
  index,
  description,
  maxPoints,
  draft,
  active,
  onActivate,
  onChange,
}: {
  index: number;
  description: string;
  maxPoints: number;
  draft: ReviewCriterion;
  active: boolean;
  onActivate: () => void;
  onChange: (next: Partial<ReviewCriterion>) => void;
}) {
  const steps = Array.from(new Set([0, Math.round(maxPoints * 50) / 100, maxPoints]));

  return (
    <article
      data-active={active}
      data-index={index}
      className={[
        'overflow-hidden rounded-lg border bg-surface transition-[border-color,box-shadow] duration-200 ease-smooth',
        active ? 'border-primary/50 shadow-[0_0_0_3px_hsl(var(--primary)/0.12)]' : 'border-border',
      ].join(' ')}
    >
      <button
        type="button"
        onClick={onActivate}
        className="flex w-full items-start gap-3 border-l-[3px] border-l-warning px-4 py-3.5 text-left hover:bg-surface-2"
      >
        <span className="min-w-0">
          <span className="block text-body font-semibold">{description}</span>
          <span className="mt-0.5 block text-caption text-muted-foreground">
            Tối đa {maxPoints} điểm · bấm để xem bài làm
          </span>
        </span>
        <span className="ml-auto shrink-0 text-right">
          <b className="text-h2 tabular-nums">{draft.points}</b>
          <span className="text-caption text-muted-foreground"> / {maxPoints}</span>
        </span>
      </button>

      <div className="flex flex-col gap-3.5 px-4 pb-4">
        <Badge variant="warning">AI chưa chấm tiêu chí này</Badge>

        <div className="flex flex-col gap-2">
          <span className="section-label">Chấm tay</span>
          <div className="flex flex-wrap items-center gap-2">
            {steps.map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={draft.points === value}
                onClick={() =>
                  onChange({
                    points: value,
                    verdict: value === maxPoints ? 'met' : value === 0 ? 'not_met' : 'partially_met',
                  })
                }
                className={[
                  'h-8 rounded-sm border px-3.5 text-small font-semibold tabular-nums transition-colors',
                  draft.points === value
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-surface hover:bg-surface-2',
                ].join(' ')}
              >
                {value}
              </button>
            ))}
          </div>
        </div>
      </div>
    </article>
  );
}
```

- [ ] **Step 4: Chạy test, xác nhận PASS**

```bash
cd apps/web
npx vitest run "src/app/teacher/grading/[resultId]/_components/ManualCriterionCard.test.tsx"
```

- [ ] **Step 5: Viết test wiring TRƯỚC, trong `page.test.tsx`**

Thêm ngay sau test `'AI không chấm được thì nói rõ lý do, không phải im lặng'` (đã thêm ở Task 3):

```ts
  it('AI không chấm được → chấm tay được, Lưu duyệt gửi đủ tiêu chí từ rubric', async () => {
    resultsData = [
      result({
        ungradableReason:
          'HTTP 400 invalid_request_error (nội dung lỗi bị cắt — có thể chứa bài làm)',
        criterionResults: [],
        aiTotalScore: null,
      }),
    ];
    await page();

    // Rubric của test có đúng một tiêu chí, maxPoints 4 (xem fixture
    // `rubric` ở đầu file) — nó phải hiện được dù `criterionResults` rỗng.
    await screen.findByText('Xử lý nhất quán dữ liệu');
    expect(screen.getByText(/AI chưa chấm tiêu chí này/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '4' }));
    fireEvent.click(screen.getByRole('button', { name: /^Lưu duyệt$/ }));

    expect(submitMock).toHaveBeenCalledWith(
      expect.objectContaining({
        criteria: [{ criterionId: 'c1', verdict: 'met', points: 4 }],
      }),
      expect.anything(),
    );
  });
```

- [ ] **Step 6: Chạy test, xác nhận FAIL**

```bash
cd apps/web
npx vitest run "src/app/teacher/grading/[resultId]/page.test.tsx"
```

Kỳ vọng: fail ở `screen.findByText('Xử lý nhất quán dữ liệu')` — không tìm thấy, vì `rows` vẫn rỗng (dựng từ `criterionResults` rỗng, chưa dựng từ rubric).

- [ ] **Step 7: Dựng `initial` từ rubric khi AI hỏng**

Trong `apps/web/src/app/teacher/grading/[resultId]/page.tsx`, tìm:

```ts
  // Điểm khởi đầu: bản giảng viên đã sửa nếu có, chưa thì bản AI đề xuất.
  const initial = useMemo<ReviewCriterion[]>(
    () =>
      result?.editedCriteria ??
      (result?.criterionResults ?? []).map((criterion) => ({
        criterionId: criterion.criterionId,
        verdict: criterion.verdict,
        points: criterion.points,
      })),
    [result],
  );
```

Thay bằng:

```ts
  // Điểm khởi đầu: bản giảng viên đã sửa nếu có; nếu AI không chấm được
  // (`ungradableReason` khác null) thì dựng từ RUBRIC, mỗi tiêu chí bắt
  // đầu ở 0đ/chưa đạt — `criterionResults` rỗng VĨNH VIỄN ở ca này, dựng
  // từ nó sẽ cho một danh sách trống không sửa được. Ca còn lại dựng từ
  // bản AI đề xuất như cũ.
  const initial = useMemo<ReviewCriterion[]>(() => {
    if (result?.editedCriteria) {
      return result.editedCriteria;
    }
    if (result?.ungradableReason != null) {
      return (rubric?.criteria ?? []).map((criterion) => ({
        criterionId: criterion.id,
        verdict: 'not_met' as const,
        points: 0,
      }));
    }
    return (result?.criterionResults ?? []).map((criterion) => ({
      criterionId: criterion.criterionId,
      verdict: criterion.verdict,
      points: criterion.points,
    }));
  }, [result, rubric]);
```

- [ ] **Step 8: Chạy test lại — kỳ vọng vẫn FAIL, nhưng vì lý do khác**

```bash
cd apps/web
npx vitest run "src/app/teacher/grading/[resultId]/page.test.tsx"
```

Kỳ vọng: `'Xử lý nhất quán dữ liệu'` giờ tìm thấy được (rows không còn rỗng), nhưng test fail ở bước sau — `screen.getByText(/AI chưa chấm tiêu chí này/i)` không tìm thấy, vì render loop vẫn dùng `CriterionCard` (đòi `criterion` từ `criterionResults`, luôn `undefined` ở ca này → `return null`) thay vì `ManualCriterionCard`. Nếu vẫn fail ở đúng chỗ cũ (không tìm thấy mô tả tiêu chí), dừng lại kiểm tra Step 7 trước khi qua Step 9.

- [ ] **Step 9: Render loop rẽ nhánh theo `aiFailedToGrade`**

Thêm import ở đầu `page.tsx`, cạnh các import `_components` khác:

```ts
import { ManualCriterionCard } from './_components/ManualCriterionCard';
```

Tìm:

```tsx
          <CardContent className="flex max-h-[64vh] flex-col gap-3 overflow-y-auto p-4 [scroll-padding-top:0.75rem]">
            {rows.map((row) => {
              const criterion = result.criterionResults.find(
                (item) => item.criterionId === row.criterionId,
              );
              const spec = rubric?.criteria.find((item) => item.id === row.criterionId);
              if (!criterion) return null;
              return (
                <CriterionCard
                  key={row.criterionId}
                  criterion={criterion}
                  index={criterionIndexOf(row.criterionId)}
                  description={spec?.description ?? 'Tiêu chí'}
                  maxPoints={spec?.maxPoints ?? 0}
                  confidence={result.confidence}
                  draft={row}
                  active={activeCriterionId === row.criterionId}
                  onActivate={() => setActive(row.criterionId)}
                  onChange={(patch) => update(row.criterionId, patch)}
                >
                  <AdvocatePanel
                    opinion={result.advocateOpinion}
                    criterionId={row.criterionId}
                    maxPoints={spec?.maxPoints ?? 0}
                    hasQuestion={readiness.data?.hasQuestion ?? false}
                    onApply={(next) => update(row.criterionId, next)}
                  />
                </CriterionCard>
              );
            })}
          </CardContent>
```

Thay bằng:

```tsx
          <CardContent className="flex max-h-[64vh] flex-col gap-3 overflow-y-auto p-4 [scroll-padding-top:0.75rem]">
            {aiFailedToGrade
              ? rows.map((row) => {
                  const spec = rubric?.criteria.find((item) => item.id === row.criterionId);
                  return (
                    <ManualCriterionCard
                      key={row.criterionId}
                      index={criterionIndexOf(row.criterionId)}
                      description={spec?.description ?? 'Tiêu chí'}
                      maxPoints={spec?.maxPoints ?? 0}
                      draft={row}
                      active={activeCriterionId === row.criterionId}
                      onActivate={() => setActive(row.criterionId)}
                      onChange={(patch) => update(row.criterionId, patch)}
                    />
                  );
                })
              : rows.map((row) => {
                  const criterion = result.criterionResults.find(
                    (item) => item.criterionId === row.criterionId,
                  );
                  const spec = rubric?.criteria.find((item) => item.id === row.criterionId);
                  if (!criterion) return null;
                  return (
                    <CriterionCard
                      key={row.criterionId}
                      criterion={criterion}
                      index={criterionIndexOf(row.criterionId)}
                      description={spec?.description ?? 'Tiêu chí'}
                      maxPoints={spec?.maxPoints ?? 0}
                      confidence={result.confidence}
                      draft={row}
                      active={activeCriterionId === row.criterionId}
                      onActivate={() => setActive(row.criterionId)}
                      onChange={(patch) => update(row.criterionId, patch)}
                    >
                      <AdvocatePanel
                        opinion={result.advocateOpinion}
                        criterionId={row.criterionId}
                        maxPoints={spec?.maxPoints ?? 0}
                        hasQuestion={readiness.data?.hasQuestion ?? false}
                        onApply={(next) => update(row.criterionId, next)}
                      />
                    </CriterionCard>
                  );
                })}
          </CardContent>
```

- [ ] **Step 10: Chạy test, xác nhận PASS**

```bash
cd apps/web
npx vitest run "src/app/teacher/grading/[resultId]/page.test.tsx"
```

- [ ] **Step 11: `tsc --noEmit` sạch, rồi chạy toàn bộ vitest**

```bash
cd apps/web
npx tsc --noEmit
npx vitest run
```

Kỳ vọng: không lỗi mới (chỉ còn lỗi có sẵn, không liên quan, ở `read-workbook.test.ts`); toàn bộ vitest pass.

- [ ] **Step 12: Lint + build cả hai app**

```bash
cd apps/api && npx eslint . && npx nest build
cd ../web && npx eslint . && npx next build
```

- [ ] **Step 13: Commit**

```bash
git add "apps/web/src/app/teacher/grading/[resultId]/_components/ManualCriterionCard.tsx" \
        "apps/web/src/app/teacher/grading/[resultId]/_components/ManualCriterionCard.test.tsx" \
        "apps/web/src/app/teacher/grading/[resultId]/page.tsx" \
        "apps/web/src/app/teacher/grading/[resultId]/page.test.tsx"
git commit -m "feat(grading): chấm tay được khi AI không chấm được bài"
```

---

## Self-Review

**Spec coverage:**
- "Lưu reason vào DB" → Task 1 (cột + ghi) + Task 2 (đọc ra qua API). ✓
- "UI nói thật (chấm tay = lưới an toàn cuối)" → Task 3 (banner nói lý do thật, không phải số 0 giả) + Task 4 (chấm tay THẬT SỰ dùng được, không phải danh sách trống). ✓

**Placeholder scan:** không còn `TBD`/"tương tự Task N"/mô tả suông — mọi step có code đầy đủ, kể cả các đoạn "before/after" copy nguyên văn từ file hiện tại.

**Type consistency:**
- `ungradableReason: string | null` — nhất quán giữa entity (Task 1), `GradingResultView` (Task 2), `GradingResult` (Task 3), và điều kiện `!== null` ở `page.tsx` (Task 3) / `!= null` ở `initial` (Task 4) — cả hai chỉ khác cú pháp, cùng ý nghĩa vì giá trị chỉ là `string | null` (không có `undefined` sau khi Task 2 đảm bảo JSON luôn có key này).
- `ManualCriterionCard` props (`index, description, maxPoints, draft, active, onActivate, onChange`) khớp đúng cách `page.tsx` gọi nó ở Task 4 Step 9, và khớp cách `ManualCriterionCard.test.tsx` (Task 4 Step 1) dựng nó — không có tên trường lệch giữa hai nơi.
- Rubric criterion shape `{id, description, maxPoints}` dùng nhất quán ở Task 4 Step 7 (`initial`) và Step 9 (render loop) — khớp `Rubric` interface đã có ở `grading.ts:10`.
