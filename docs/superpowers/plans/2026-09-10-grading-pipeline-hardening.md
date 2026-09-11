# Grading Pipeline Hardening (§7.1 + A2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the grading half of ExamCollect from "a keyword stub running inline in an HTTP request" into the pipeline CLAUDE.md describes — queued, resumable, backed by a real model with a cost cascade — and close the four §7.1 data-integrity gaps that make the resulting grade sheet trustworthy (frozen roster, `absent` status, file limits, `semester_code`). Ends with `GradeExport`, the deliverable the whole system exists to produce.

**Architecture:** Grading moves out of the request thread onto a BullMQ queue backed by the Redis already in `docker-compose.yml`. `GradingService.gradeOne` becomes the body of a queue processor rather than a loop iteration — the shape it was already written for ("the change is where `gradeOne` is invoked from, not what it does", per its own doc comment). The `AIGradingProvider` seam stays exactly as-is; a real `ClaudeGradingProvider` is added behind it and selected by env var, with `KeywordGradingProvider` remaining the no-API-key/offline-demo default. The cascade reads `grading_pipeline_config`, whose table already exists and has never been read.

**Tech Stack:** NestJS 11, TypeORM, PostgreSQL, BullMQ + ioredis (new), `@anthropic-ai/sdk` (new), exceljs (browser-side for GradeExport upload/download).

**Spec:** `CLAUDE.md` §7.1 (Lõi backlog), §5.6/§5.7 (rubric reuse, AI-vs-human score separation), §1.1 (Sở hữu tier), "AI Grading Strategy" section (cascade, caching, batch), Security rules 3/4/5/6/7/9. Prior spec docs from the grading session: `docs/superpowers/specs/2026-09-05-session-pinned-rubric-design.md`, `docs/superpowers/specs/2026-09-05-teacher-review-design.md`.

## Trạng thái — rev 2 (2026-09-11)

> Bản gốc viết ngày 2026-09-10, TRƯỚC khi `feature/exam-collection-phase` tồn tại và trước một lượt review hạ tầng. Mục này ghi lại mọi chỗ bản gốc **sai hoặc lỗi thời**, tại đúng task của nó. Đọc plan này thì đọc cả các khối `> **Sửa ở rev 2**` — bản gốc còn nguyên bên dưới để đối chiếu, KHÔNG phải để làm theo.

| Task | Trạng thái |
| --- | --- |
| 1. Giới hạn file đầu vào | ✅ Xong — commit `ffa4372`, có một chỗ lệch plan, xem Task 1 |
| 2. `semester_name` snapshot | ✅ Xong — cột đổi tên thành `semester_name`, xem Task 2 |
| 3. Đóng băng roster + `absent` | ⛔ **CHẶN** — 2 quyết định chưa chốt, xem Task 3 |
| 4. BullMQ queue | Sẵn sàng — 7 điểm sửa + 1 thay đổi hợp đồng API, xem Task 4 |
| 5. Claude provider | ⛔ **CHẶN** — chưa có `ANTHROPIC_API_KEY`, và kiến trúc chấm AI chưa chốt |
| 6. Cascade | Phụ thuộc Task 5 |
| 7. GradeExport | Phụ thuộc Task 2 + Task 3 |

### Những gì bản review nêu mà tôi KHÔNG xác nhận được

Ghi ra để không ai đi "sửa" một thứ không hỏng:

- **"Gieo dòng submission làm `attendedNoSubmissionCount` trả 0 vĩnh viễn"** — sai với codebase này. `submission-overview.service.ts` đếm bằng `COUNT(*) FILTER (WHERE sub.status = 'collected')`, không đếm theo sự tồn tại dòng. Dòng gieo sẵn đóng góp 0 vào cả `collected_files` lẫn `invalid_files`, nên con số không đổi. `AttentionKind` dẫn xuất từ nó cũng không đổi.
- **"Một `PATCH /exam-sessions/:id` nhận cả object body rồi `repo.save()` sẽ ghi đè `semesterCode`"** — route đó không tồn tại; controller chỉ có `@Patch(':id/teacher')`. Vẫn thêm `{ update: false }` vì rẻ, nhưng tiền đề thì không đúng.
- **"`addManually` trùng MSSV sẽ ném 23505 thô lên client"** — sai. `PostgresExceptionFilter` đã map `23505 → ConflictException` toàn cục.

---

## Global Constraints

- **Model IDs are exact strings, never date-suffixed**: `claude-haiku-4-5`, `claude-sonnet-5`, `claude-opus-5`. CLAUDE.md's own "AI Grading Strategy" table mandates the cascade (cheap first pass → stronger model for the low-confidence remainder), which is why Haiku leads rather than Opus.
- **Thinking config differs by tier and getting it wrong is a 400**: `claude-haiku-4-5` takes `thinking: {type: "enabled", budget_tokens: N}` (min 1024, must be `< max_tokens`) or no thinking at all; `claude-sonnet-5` / `claude-opus-5` **reject `budget_tokens` with a 400** and take `thinking: {type: "adaptive"}`. Never send one tier's shape to the other.
- **`output_config: {format: ...}` — never the deprecated `output_format`.**
- **Security rule 6 is load-bearing**: `grading_result.ai_total_score` / `criterion_results` / `model_used` / `confidence` are written exactly once and never updated. `trg_grading_result_guard_ai_immutable` enforces it at DB level; a retry must therefore not re-`update` a row that already carries AI output (Task 4 Step 6 handles this).
- **Security rule 5**: no file upload passes through NestJS. GradeExport's template comes in as a presigned-URL upload + a callback, exactly like submissions.
- **Security rule 9**: GradeExport column mapping is always explicitly supplied by the teacher. Never infer a column from its header.
- **Never log student content or model output verbatim** — grading text is student work. Log ids, token counts, model names, durations.
- Run `pnpm --filter api build && pnpm --filter api test && pnpm --filter web build` after each task.
- **e2e phải chạy SERIAL**: `npx jest --config ./test/jest-e2e.json --runInBand`. Nhánh `fix/e2e-test-config` đặt `maxWorkers: 1` nhưng **chưa merge**; chạy song song cho ra fail giả hàng loạt (176/234 ở một lần đo).
- **Nhánh này chồng lên `feature/exam-collection-phase`** (12 commit, chưa merge), vì Task 3 đọc `completed_by` do nhánh đó thêm.

---

## Task 1: Reject oversized / unextractable files before they reach the model (§7.1.4)

> **✅ XONG — commit `ffa4372`.** Một chỗ làm KHÁC plan:
>
> Test ở Step 1 khẳng định `text.length <= 200_000`, nhưng `capChars` mà Step 4 đưa ra trả `slice(0, 200_000) + TRUNCATION_NOTICE` — **dài hơn** 200.000. Test đó đỏ như viết.
>
> Đã sửa theo hướng đúng hơn: `MAX_GRADING_INPUT_CHARS` là trần của thứ THẬT SỰ gửi đi, nên dòng thông báo nằm TRONG nó — `slice(0, MAX - NOTICE.length) + NOTICE`. Một giới hạn bị chính cái nhãn của nó đẩy vượt qua là đúng kiểu sai mà giới hạn không được phép mắc.
>
> Thêm 3 ca test ngoài plan: biên "đúng bằng giới hạn thì nhận", "nói ra là đã cắt", và chống hồi quy `.pdf` vẫn trả `''` chứ không biến thành lỗi.

**Files:**
- Modify: `apps/api/src/grading/grading.types.ts`
- Modify: `apps/api/src/grading/extract-text.ts`
- Modify: `apps/api/src/grading/grading.service.ts` (the `gradeOne` extraction block, currently lines ~186-206)
- Test: `apps/api/src/grading/extract-text.spec.ts` (create if absent — check first)

**Interfaces:**
- Consumes: nothing new.
- Produces: `MAX_GRADING_INPUT_BYTES` and `MAX_GRADING_INPUT_CHARS` in `grading.types.ts`; `extractText` throws `GradingInputTooLargeError` (exported from `extract-text.ts`) instead of silently handing 30 MB of `node_modules` to a paid model. Task 5 relies on content already being bounded before it builds a prompt.

- [x] **Step 1: Write the failing test**

```typescript
// apps/api/src/grading/extract-text.spec.ts
import { extractText, GradingInputTooLargeError } from './extract-text';
import { MAX_GRADING_INPUT_BYTES } from './grading.types';

describe('extractText input limits', () => {
  it('refuses a file larger than MAX_GRADING_INPUT_BYTES before parsing it', async () => {
    const tooBig = Buffer.alloc(MAX_GRADING_INPUT_BYTES + 1, 0x41);
    await expect(extractText(tooBig, 'Cau1.docx')).rejects.toThrow(GradingInputTooLargeError);
  });

  it('truncates extracted text at MAX_GRADING_INPUT_CHARS rather than sending it all', async () => {
    // A .txt is passed through verbatim by extractText, so this exercises the
    // char cap without needing a real docx fixture.
    const long = Buffer.from('x'.repeat(500_000), 'utf8');
    const text = await extractText(long, 'Cau1.txt');
    expect(text.length).toBeLessThanOrEqual(200_000);
    expect(text.endsWith('\n\n[...nội dung bị cắt do vượt giới hạn chấm tự động]')).toBe(true);
  });

  it('leaves a normal-sized file untouched', async () => {
    const text = await extractText(Buffer.from('Bài làm của em.', 'utf8'), 'Cau1.txt');
    expect(text).toBe('Bài làm của em.');
  });
});
```

- [x] **Step 2: Run to confirm failure**

Run: `pnpm --filter api test -- extract-text`
Expected: FAIL — `GradingInputTooLargeError` is not exported.

- [x] **Step 3: Add the constants**

Append to `apps/api/src/grading/grading.types.ts`:

```typescript
/**
 * Giới hạn đầu vào cho một lượt chấm (CLAUDE.md §7.1.4).
 *
 * Một bài `.zip` 30MB chứa `node_modules` vừa làm nghẽn cả lượt chấm vừa
 * đốt chi phí vô ích — và tệ hơn: nó KHÔNG phải bài làm, nên điểm chấm ra
 * từ nó là vô nghĩa. Chặn ở đây, không phải ở chỗ gọi model, để mọi provider
 * (kể cả provider mới thêm sau này) đều được bảo vệ cùng một chỗ.
 *
 * 10MB: một bài docx/txt thật của sinh viên gần như không bao giờ vượt 2MB;
 * 10MB đã rất rộng tay mà vẫn chặn được ca bệnh lý.
 */
export const MAX_GRADING_INPUT_BYTES = 10 * 1024 * 1024;

/**
 * Cắt theo KÝ TỰ sau khi extract, độc lập với giới hạn byte.
 *
 * Một file 2MB docx toàn chữ vẫn có thể ra hàng triệu ký tự — quá dài cho
 * context window và tốn tiền vô ích, trong khi phần vượt gần như chắc chắn
 * không phải nội dung cần chấm. 200k ký tự ≈ 50k token, thừa sức cho một
 * bài tự luận dài nhất.
 */
export const MAX_GRADING_INPUT_CHARS = 200_000;

export const TRUNCATION_NOTICE = '\n\n[...nội dung bị cắt do vượt giới hạn chấm tự động]';
```

- [x] **Step 4: Enforce them in `extract-text.ts`**

Read the file first, then add at the top of `extractText` (before any parsing branch) and at its return points:

```typescript
import {
  MAX_GRADING_INPUT_BYTES,
  MAX_GRADING_INPUT_CHARS,
  TRUNCATION_NOTICE,
} from './grading.types';

/**
 * File quá lớn để chấm tự động. KHÔNG phải điểm 0 — đây là sự thật về cái
 * file, không phải phán xét về bài làm, nên nó đi tới người chấm tay.
 */
export class GradingInputTooLargeError extends Error {
  constructor(readonly bytes: number) {
    super(`File ${bytes} bytes vượt giới hạn ${MAX_GRADING_INPUT_BYTES} bytes cho chấm tự động`);
    this.name = 'GradingInputTooLargeError';
  }
}

function capChars(text: string): string {
  if (text.length <= MAX_GRADING_INPUT_CHARS) {
    return text;
  }
  return text.slice(0, MAX_GRADING_INPUT_CHARS) + TRUNCATION_NOTICE;
}
```

At the very start of `extractText(bytes, requiredFilename)`:

```typescript
  if (bytes.byteLength > MAX_GRADING_INPUT_BYTES) {
    throw new GradingInputTooLargeError(bytes.byteLength);
  }
```

Wrap every `return` of extracted text in `capChars(...)`.

- [x] **Step 5: Run the tests**

Run: `pnpm --filter api test -- extract-text`
Expected: PASS.

- [x] **Step 6: Make `gradeOne` treat the new error as "unreadable", not as a crash**

In `apps/api/src/grading/grading.service.ts`, the existing `try/catch` around extraction already logs and leaves `content = ''`, which routes the submission to a human via the provider's zero-confidence path. `GradingInputTooLargeError` inherits that behaviour for free — but the log line must say which case it was, so add inside the existing `catch`:

```typescript
      this.logger.warn(
        error instanceof GradingInputTooLargeError
          ? `submission ${submission.id} bị bỏ qua chấm tự động: ${error.message}`
          : `could not read ${submission.storageKey} for grading: ${
              error instanceof Error ? error.message : String(error)
            }`,
      );
```

Import `GradingInputTooLargeError`. Note the log names the submission id, never the content.

- [x] **Step 7: Run the grading service's own tests**

Run: `pnpm --filter api test -- grading`
Expected: PASS (no behaviour change for existing cases).

- [x] **Step 8: Commit**

```bash
git add apps/api/src/grading
git commit -m "feat(grading): bound the input a submission can send to a model

CLAUDE.md §7.1.4 — a 30MB zip of node_modules is not a submission, and
before this it would have been extracted, prompted, and billed. Too
large means 'goes to a human', never 'scores zero'.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Snapshot `semester_code` on `ExamSession` (§7.1.5)

> **Sửa ở rev 2 — ba điểm, đều đã kiểm bằng DB thật.**
>
> **(a) Đổi tên cột thành `semester_name`.** Bảng `semester` **không có cột `code`** — chỉ `name`, `start_date`, `end_date`. Nên `semester_code` là tên sai cho một giá trị vĩnh viễn chỉ có thể là name, và đây là cột bất biến nên tên phải đúng ngay lần đầu. Đổi tên trong entity, migration, DTO, và Task 7.
>
> **(b) Chặn UPDATE ở tầng TypeORM: `@Column({ ..., update: false })`.** JSDoc ghi "KHÔNG BAO GIỜ sửa" chỉ là lời hứa. Cùng lập luận mà Task 4 Step 6 dùng cho `ai_total_score` (bất biến ở tầng DB là thứ làm retry không âm thầm sai) áp thẳng vào đây. Khi một cột kỳ bị ghi đè, bảng điểm chỉ đơn giản ghi sai kỳ, mãi mãi, và không ai phát hiện.
>
> **(c) Backfill: đã kiểm, 0 dòng không giải được.** Bản gốc giả định quan hệ `exam_session → course → semester` luôn giải ra tên. Đã đếm trước khi viết migration:
>
> ```sql
> SELECT count(*) FROM examcollect.exam_session es
>   LEFT JOIN examcollect.course c ON c.id = es.course_id
>   LEFT JOIN examcollect.semester s ON s.id = c.semester_id
>  WHERE s.name IS NULL;   -- → 0
> ```
>
> Nên `SET NOT NULL` an toàn, không cần giá trị dự phòng. `max(length(name))` hiện là 42, `varchar(150)` thừa sức.

**Files:**
- Create: `apps/api/src/database/migrations/<timestamp>-AddExamSessionSemesterCode.ts`
- Modify: `apps/api/src/exam-session/entities/exam-session.entity.ts`
- Modify: `apps/api/src/exam-session/exam-session.service.ts` (the `create` method)
- Test: `apps/api/test/exam-session-semester-code.e2e-spec.ts` (new)

**Interfaces:**
- Consumes: `Course.semesterId` → `Semester.name` (read once, at session-create time).
- Produces: `ExamSessionEntity.semesterCode: string` — written once at creation, never updated. Task 7 (GradeExport) filters on it.

- [x] **Step 1: Write the failing e2e test**

```typescript
// apps/api/test/exam-session-semester-code.e2e-spec.ts
describe('exam_session.semester_code snapshot', () => {
  it('stamps the semester name at creation time', async () => {
    const teacher = await loginAs(app, 'teacher');
    const { klass, semester } = await seedClassForTeacher(app); // adapt to this suite's existing seed helpers

    const res = await request(app.getHttpServer())
      .post('/exam-sessions')
      .set('Authorization', `Bearer ${teacher.accessToken}`)
      .send({
        name: 'Thi thử',
        classId: klass.id,
        roomId: (await seedRoom(app)).id,
        examType: 'CK',
        startTime: new Date(Date.now() + 60_000).toISOString(),
        endTime: new Date(Date.now() + 60 * 60_000).toISOString(),
        requiredFilenames: ['Cau1.docx'],
      });

    expect(res.status).toBe(201);
    expect(res.body.semesterCode).toBe(semester.name);
  });

  it('does not change when the semester is later renamed', async () => {
    const admin = await loginAs(app, 'admin');
    const teacher = await loginAs(app, 'teacher');
    const { klass, semester } = await seedClassForTeacher(app);

    const created = await request(app.getHttpServer())
      .post('/exam-sessions')
      .set('Authorization', `Bearer ${teacher.accessToken}`)
      .send({ /* same body as above */ });

    await request(app.getHttpServer())
      .patch(`/semesters/${semester.id}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ name: `${semester.name} (đã đổi tên)` });

    const after = await request(app.getHttpServer())
      .get(`/exam-sessions/${created.body.id}`)
      .set('Authorization', `Bearer ${teacher.accessToken}`);
    expect(after.body.semesterCode).toBe(semester.name); // tên GỐC, không phải tên mới
  });
});
```

(The second test requires Plan B Task 1 to have landed — `PATCH /semesters/:id` is `admin`-only there and `department_admin`-only before it. If Plan B Task 1 has not landed on this branch, log in as `department_admin` for the rename instead.)

- [x] **Step 2: Run to confirm failure**

Run: `pnpm --filter api test:e2e -- exam-session-semester-code`
Expected: FAIL — `semesterCode` is `undefined`.

- [x] **Step 3: Add the column to the entity**

In `apps/api/src/exam-session/entities/exam-session.entity.ts`, after `examType`:

```typescript
  /**
   * Tên học kỳ, chụp một lần lúc tạo phiên, KHÔNG BAO GIỜ sửa (CLAUDE.md
   * §7.1.5).
   *
   * Vì sao không join qua `course.semester.name` mỗi lần cần: bảng điểm và
   * bài nộp phải tự khai được chúng thuộc kỳ nào, độc lập với mọi thay đổi
   * sau đó ở `Course`/`Semester` — môn đổi tên, lớp bị xoá, kỳ bị sửa ngày.
   * Export lọc thẳng `WHERE semester_code = ?` và đúng vĩnh viễn.
   *
   * Đây là snapshot có chủ đích, không phải denormalize để tối ưu.
   */
  @Column({ name: 'semester_code', type: 'varchar', length: 150 })
  semesterCode!: string;
```

- [x] **Step 4: Generate and inspect the migration**

```bash
cd apps/api
pnpm migration:generate src/database/migrations/AddExamSessionSemesterCode
```

The generated `up()` will contain `ADD "semester_code" character varying(150) NOT NULL`, which **fails on a table with existing rows**. Hand-edit it into the add → backfill → tighten sequence this codebase already uses (see `AddCourseRoomExamType`'s `up()` for the established pattern):

```typescript
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "examcollect"."exam_session" ADD "semester_code" character varying(150)`);
    // Backfill từ đường quan hệ hiện có — chỉ dùng một lần, tại đây. Sau
    // migration này không code nào được suy semester_code từ course nữa.
    await queryRunner.query(`
      UPDATE "examcollect"."exam_session" es
      SET "semester_code" = s."name"
      FROM "examcollect"."course" c
      JOIN "examcollect"."semester" s ON s."id" = c."semester_id"
      WHERE c."id" = es."course_id" AND es."semester_code" IS NULL
    `);
    await queryRunner.query(`ALTER TABLE "examcollect"."exam_session" ALTER COLUMN "semester_code" SET NOT NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "examcollect"."exam_session" DROP COLUMN "semester_code"`);
  }
```

- [x] **Step 5: Run the migration**

Run: `pnpm migration:run`
Expected: executed successfully. Verify with:
```bash
docker exec cine-postgres-1 psql -U examcollect_admin -d examcollect -c "SELECT count(*) FROM examcollect.exam_session WHERE semester_code IS NULL;"
```
Expected: `0`.

- [x] **Step 6: Populate it on create**

In `apps/api/src/exam-session/exam-session.service.ts`'s `create` method: the class → course lookup already happens there (`courseId` is derived from `classId`, per `CreateExamSessionDto`'s doc comment). Extend that same lookup to carry the semester name — one query, not a second round-trip:

```typescript
    // Cùng lượt tra lớp → môn đã có, thêm semester.name để chụp lại.
    const klass = await this.classes.findOne({
      where: { id: dto.classId },
      relations: { course: { semester: true } },
    });
    if (!klass) {
      throw new NotFoundException('Class not found');
    }
```

and set `semesterCode: klass.course.semester.name` in the `create({...})` call alongside `courseId: klass.courseId`.

Adapt to however `create` currently resolves the class — read the method in full first; if it already loads the class with `relations: { course: true }`, extend that relation object rather than adding a query.

- [x] **Step 7: Expose it in the response DTO**

Add `semesterCode: string` to whatever response shape `GET /exam-sessions/:id` and `POST /exam-sessions` return (`apps/api/src/exam-session/dto/exam-session-response.dto.ts`) and to the mapper that builds it.

- [x] **Step 8: Run the tests**

Run: `pnpm --filter api test:e2e -- exam-session`
Expected: PASS — including the pre-existing exam-session e2e specs, which must not regress.

- [x] **Step 9: Update CLAUDE.md**

§7.1.5: mark `✅ Đã làm (2026-09-10)`. §3.2 ownership matrix: `ExamSession`'s "Có `semester_id` riêng?" cell becomes "Không — vay qua `class_id` → `course_id`; **có `semester_code` snapshot** (§7.1.5)". This is the one deliberate exception to "`semester_id` xuất hiện đúng một lần" — say so there explicitly so it does not read as a violation of §3.2.

- [x] **Step 10: Commit**

```bash
git add apps/api/src/database/migrations apps/api/src/exam-session apps/api/test CLAUDE.md
git commit -m "feat(exam-session): snapshot semester_code at creation

CLAUDE.md §7.1.5 — a grade sheet has to say which term it belongs to
even after the course is renamed or the class deleted. Written once,
never updated; export filters on it directly.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Freeze the sitting list when a session opens, and give absence a row (§7.1.1 + §7.1.2)

> # ⛔ CHẶN — hai quyết định phải chốt TRƯỚC khi viết migration
>
> Cả hai đều đụng migration enum. Chọn sai thì phải viết migration thứ hai để sửa, nên không được vừa code vừa quyết.

### ⛔ D1 — `absent` một giá trị hay hai?

Bản gốc (Step 5) thêm **một** giá trị: `SubmissionStatus` + `'absent'`.

Spec `docs/superpowers/specs/2026-09-11-exam-collection-phase-design.md` §8.1 — ship ngày 2026-09-11, SAU khi plan này viết — hợp đồng **hai** giá trị:

| `completed_by` | Được kết luận gì |
| --- | --- |
| `NOT NULL` (người xác nhận) | được đánh **`vắng thi`** |
| `NULL` (quét dự phòng đóng) | giữ nguyên **`chưa nộp`** |

Lý do spec tách hai: `absent` là **phán xét học vụ**, `not_submitted` là **sự thật về dữ liệu**. Gieo phán xét lúc 7h00 khi phiên vừa mở nghĩa là bảng điểm xuất lúc 7h05 ghi cả lớp vắng thi. Và một `@Interval` 30 giây không phải thứ được phép tuyên bố một sinh viên vắng thi.

**Đề xuất:** theo spec — hai giá trị `not_submitted` → `absent`, transition đặt ở `POST /:id/confirm-end`, một migration enum duy nhất cho cả hai.

### ⛔ D2 — móc "đóng băng" vào đâu?

Bản gốc Step 1 đoán *"most likely nothing at all yet"* rồi tự tạo `POST /exam-sessions/:id/open`. **Đã tra: đoán sai, và thực tế tệ hơn.**

`exam-session.service.ts:151` — `create()` ghi thẳng `status: 'active'` **ngay lúc tạo phiên**. Không tồn tại transition `scheduled → active` nào trong codebase; scheduler chỉ làm `active → collecting`.

Nên cửa sổ hở không phải "giữa tick scheduler và lúc bấm open" — nó là **từ lúc tạo phiên tới lúc ai đó nhớ bấm**, có thể nhiều ngày. Trong cửa sổ đó `agent:join` cho vào (chỉ kiểm `status === 'active'`), sinh viên nộp được, `session_roster` rỗng. Đúng lỗ hổng §7.1.1 sinh ra để bịt, chỉ dịch sang chỗ khác.

Ba đường:

| | Cách | Đánh đổi |
| --- | --- | --- |
| (a) | Freeze ngay trong `create()` | Roster lớp có thể chưa import lúc đó |
| (b) | `agent:join` từ chối khi `session_roster` rỗng | Fail-safe, không có cửa hở — nhưng chặn mọi phiên ĐANG tồn tại |
| (c) | Freeze tự động ở lần `agent:join` đầu tiên | Không cửa hở, không chặn ai — nhưng biến một thao tác học vụ thành tác dụng phụ của một sinh viên kết nối |

**Đề xuất:** (b) kèm backfill trong chính migration — tự chốt roster cho mọi phiên `active`/`collecting` đang có, nên không phiên nào rơi vào trạng thái bị chặn.

---

> **Sửa ở rev 2 — bốn điểm kỹ thuật, không chặn.**
>
> **(e) Trigger `validate_submission_lifecycle` CHẶN cả hai đầu — đã đọc từ DB.** Bản gốc Step 8 bảo "đọc trigger, sửa nếu cần" và coi là chuyện nhỏ. Thực tế:
>
> ```
> INSERT: chỉ cho 'received' hoặc 'invalid'
> UPDATE: chỉ received→validated|invalid, validated→collected|invalid
> ```
>
> Nên **gieo dòng ở `absent` bị chặn ngay ở INSERT**, và nhánh else của `writeCollected` sẽ chạy `absent → collected` một bước — **cũng bị chặn**. (Lưu ý: lỗi là trigger từ chối, KHÔNG phải `storage_key` NULL như bản review đoán.) Trigger phải được mở rộng trong cùng migration này.
>
> **(f) `addManually` cần transaction + guard trạng thái phiên.** Hai `getRepository` gọi rời nhau. Và không có gì chặn thêm sinh viên sau khi phiên đã `completed` — spec §6.5 đã đặt tiền lệ đúng (route "Thu lại" trả 409 khi không ở `collecting`), áp cùng nguyên tắc ở đây.
>
> **(g) Insert phải phân lô `chunk: 100`.** `rows` là tích Descartes sinh viên × deliverable: 200 × 3 = 600 dòng trong một statement, mỗi dòng kiểm 3 FK RESTRICT. Quy mô đồ án không nổ, nhưng một tham số loại bỏ hẳn class lỗi này.
>
> **(h) Bỏ `frozenAt`, dùng `createdAt` của `BaseEntity`.** Hai cột cùng nghĩa, cùng `default now()`. Sau này sửa một cột quên cột kia thì chúng lệch và không ai biết cột nào đúng.

These two CLAUDE.md items are one task because §7.1.2 says so explicitly ("Kèm §7.1.1: lúc đóng băng, sinh sẵn một dòng bài nộp trạng thái `chưa nộp` cho mỗi sinh viên") — an `absent` status with no frozen list to enumerate has nothing to iterate over.

**Files:**
- Create: `apps/api/src/exam-session/entities/session-roster.entity.ts`
- Create: `apps/api/src/database/migrations/<timestamp>-AddSessionRosterAndAbsentStatus.ts`
- Create: `apps/api/src/exam-session/session-roster.service.ts`
- Modify: `apps/api/src/submission/entities/submission.entity.ts`
- Modify: `apps/api/src/exam-session/exam-session.module.ts`
- Modify: `apps/api/src/exam-session/exam-session.controller.ts`
- Modify: `apps/api/src/database/data-source.ts` (register the new entity)
- Test: `apps/api/test/session-roster-freeze.e2e-spec.ts` (new)

**Interfaces:**
- Consumes: `EnrollmentEntity` (`courseId`, `studentMssv`, `studentName`, `homeClassId`, `homeTeacherId`), `ExamSessionEntity.classId`/`courseId`.
- Produces: `SessionRosterEntity { id, examSessionId, studentMssv, studentName, homeClassId, homeTeacherId, source: 'frozen' | 'manual', frozenAt }`; `SessionRosterService.freeze(session): Promise<{ students: number; submissionsSeeded: number }>`; `SubmissionStatus` gains `'absent'`; `POST /exam-sessions/:id/open` (teacher-only) triggers the freeze. Task 7 (GradeExport) reads `session_roster` as the authoritative "who should appear on the grade sheet" list.

- [ ] **Step 1: Find where a session actually starts**

```bash
cd apps/api
grep -rn "'active'" src/exam-session/ | grep -v spec
grep -rn "status" src/exam-session/exam-session.scheduler.ts
```

Read what these return. You are looking for the transition into `status: 'active'` — whether it is a route a teacher calls, a scheduler tick, or (most likely, given `ExamSessionStatus`'s own comment says the list is *inferred* and unconfirmed) **nothing at all yet**. Record which of the three it is; the freeze hook goes at that exact point, and if it is "nothing yet", this task introduces `POST /exam-sessions/:id/open` as that point.

- [ ] **Step 2: Write the failing e2e test**

```typescript
// apps/api/test/session-roster-freeze.e2e-spec.ts
describe('POST /exam-sessions/:id/open — freeze the sitting list', () => {
  it('copies the class roster into session_roster and seeds one un-submitted row per student', async () => {
    const teacher = await loginAs(app, 'teacher');
    const { session, klass } = await seedSessionWithRoster(app, { students: 3 });

    const res = await request(app.getHttpServer())
      .post(`/exam-sessions/${session.id}/open`)
      .set('Authorization', `Bearer ${teacher.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ students: 3, submissionsSeeded: 3 });

    const frozen = await queryRows(app, `SELECT * FROM examcollect.session_roster WHERE exam_session_id = $1`, [session.id]);
    expect(frozen).toHaveLength(3);
    expect(frozen.every((r) => r.source === 'frozen')).toBe(true);
    expect(frozen.every((r) => r.home_class_id === klass.id)).toBe(true);
  });

  it('is immune to roster edits made after the freeze', async () => {
    const teacher = await loginAs(app, 'teacher');
    const { session, klass } = await seedSessionWithRoster(app, { students: 2 });

    await request(app.getHttpServer())
      .post(`/exam-sessions/${session.id}/open`)
      .set('Authorization', `Bearer ${teacher.accessToken}`);

    // Thêm sinh viên vào roster LỚP sau khi đã đóng băng.
    await request(app.getHttpServer())
      .post(`/classes/${klass.id}/roster/students`)
      .set('Authorization', `Bearer ${teacher.accessToken}`)
      .send({ mssv: 'SV999', name: 'Nguyễn Văn Muộn' });

    const frozen = await queryRows(app, `SELECT * FROM examcollect.session_roster WHERE exam_session_id = $1`, [session.id]);
    expect(frozen).toHaveLength(2); // KHÔNG phải 3 — ảnh chốt không đổi
  });

  it('is idempotent — opening twice does not double the frozen list', async () => {
    const teacher = await loginAs(app, 'teacher');
    const { session } = await seedSessionWithRoster(app, { students: 2 });

    await request(app.getHttpServer()).post(`/exam-sessions/${session.id}/open`).set('Authorization', `Bearer ${teacher.accessToken}`);
    const second = await request(app.getHttpServer()).post(`/exam-sessions/${session.id}/open`).set('Authorization', `Bearer ${teacher.accessToken}`);

    expect(second.status).toBe(200);
    expect(second.body).toMatchObject({ students: 2, submissionsSeeded: 0 });
    const frozen = await queryRows(app, `SELECT * FROM examcollect.session_roster WHERE exam_session_id = $1`, [session.id]);
    expect(frozen).toHaveLength(2);
  });

  it('a student added manually at exam time is recorded with source=manual and still gets in', async () => {
    const teacher = await loginAs(app, 'teacher');
    const { session } = await seedSessionWithRoster(app, { students: 1 });
    await request(app.getHttpServer()).post(`/exam-sessions/${session.id}/open`).set('Authorization', `Bearer ${teacher.accessToken}`);

    const res = await request(app.getHttpServer())
      .post(`/exam-sessions/${session.id}/roster/students`)
      .set('Authorization', `Bearer ${teacher.accessToken}`)
      .send({ mssv: 'SV777', name: 'Trần Thị Đăng Muộn' });

    expect(res.status).toBe(201);
    const frozen = await queryRows(app, `SELECT * FROM examcollect.session_roster WHERE exam_session_id = $1 ORDER BY source`, [session.id]);
    expect(frozen.map((r) => r.source)).toEqual(['frozen', 'manual']);
  });
});
```

The last test is CLAUDE.md §5.8's escape hatch surviving the freeze, which §7.1.1 marks **Bắt buộc giữ** — if the freeze blocked it, a legitimate late-registering student could not sit the exam at all.

- [ ] **Step 3: Run to confirm failure**

Run: `pnpm --filter api test:e2e -- session-roster-freeze`
Expected: FAIL — 404, no such route.

- [ ] **Step 4: Add the entity**

```typescript
// apps/api/src/exam-session/entities/session-roster.entity.ts
import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../shared/base.entity';
import { AccountEntity } from '../../identity/entities/account.entity';
import { ClassEntity } from '../../course/entities/class.entity';
import { ExamSessionEntity } from './exam-session.entity';

export type SessionRosterSource = 'frozen' | 'manual';

/**
 * Ai ĐÁNG LẼ phải có mặt ở phiên thi này — chụp cứng lúc mở phiên
 * (CLAUDE.md §7.1.1).
 *
 * Vì sao không đọc `enrollment` trực tiếp lúc chấm/export: roster lớp sửa
 * được bất kỳ lúc nào, kể cả sau khi đã thi và đã chấm. Không có bảng này
 * thì không tồn tại bản ghi nào trả lời được "danh sách lúc thi trông ra
 * sao" — sinh viên rút môn sau kỳ thi làm điểm cũ biến mất khỏi bảng, và
 * "45 có mặt / 46 bài nộp" không kiểm chứng lại được.
 *
 * `home_class_id`/`home_teacher_id` copy theo, KHÔNG join lại: đây là định
 * tuyến tại thời điểm thi. Lớp đổi giảng viên sau đó không được đổi nơi bài
 * thi hôm ấy chảy về (cùng lý do `enrollment` giữ hai cột này).
 */
@Entity({ name: 'session_roster' })
@Index('uq_session_roster_session_student', ['examSessionId', 'studentMssv'], { unique: true })
@Check('ck_session_roster_mssv', "student_mssv ~ '^[A-Za-z0-9]{4,20}$'")
export class SessionRosterEntity extends BaseEntity {
  @Column({ name: 'exam_session_id', type: 'uuid' })
  examSessionId!: string;

  @ManyToOne(() => ExamSessionEntity, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'exam_session_id' })
  examSession!: ExamSessionEntity;

  @Column({ name: 'student_mssv', type: 'citext' })
  studentMssv!: string;

  @Column({ name: 'student_name', type: 'varchar', length: 150 })
  studentName!: string;

  @Column({ name: 'home_class_id', type: 'uuid' })
  homeClassId!: string;

  @ManyToOne(() => ClassEntity, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'home_class_id' })
  homeClass!: ClassEntity;

  @Column({ name: 'home_teacher_id', type: 'uuid' })
  homeTeacherId!: string;

  @ManyToOne(() => AccountEntity, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'home_teacher_id' })
  homeTeacher!: AccountEntity;

  /**
   * `frozen` = copy từ enrollment lúc mở phiên. `manual` = giảng viên thêm
   * tay tại phiên thi (§5.8). Cờ này là lý do đóng băng không phá vỡ đường
   * thoát hiểm đó: thêm tay vẫn được, nhưng đọc ra được là thêm tay.
   */
  @Column({
    type: 'enum',
    enum: ['frozen', 'manual'],
    enumName: 'session_roster_source',
    default: 'frozen',
  })
  source!: SessionRosterSource;

  @Column({ name: 'frozen_at', type: 'timestamptz', default: () => 'now()' })
  frozenAt!: Date;
}
```

- [ ] **Step 5: Add `'absent'` to `SubmissionStatus`**

In `apps/api/src/submission/entities/submission.entity.ts`:

```typescript
export type SubmissionStatus = 'received' | 'validated' | 'collected' | 'invalid' | 'absent';
```

and in the `@Column` enum array: `enum: ['received', 'validated', 'collected', 'invalid', 'absent'],`.

Add above the type:
```typescript
// `absent` (CLAUDE.md §7.1.2): sinh viên có trong ảnh chốt nhưng không nộp
// gì cả. Trước khi có nó, "không nộp" chỉ là sự VẮNG MẶT của một dòng, nên
// bảng điểm không phân biệt được vắng thi / đã nộp chưa chấm / 0 điểm —
// tức là hỏng đúng sản phẩm chính của hệ thống.
//
// Dòng `absent` được sinh sẵn lúc đóng băng (SessionRosterService.freeze),
// rồi chuyển sang `received` khi agent nộp file đầu tiên.
```

- [ ] **Step 6: Write the migration by hand**

`migration:generate` cannot express the enum-value addition safely (it drops and recreates the type, which fails while columns depend on it). Write it manually:

```typescript
// apps/api/src/database/migrations/<timestamp>-AddSessionRosterAndAbsentStatus.ts
export class AddSessionRosterAndAbsentStatus<timestamp> implements MigrationInterface {
  name = 'AddSessionRosterAndAbsentStatus<timestamp>';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ADD VALUE chỉ sửa catalog, không rewrite bảng — an toàn với dữ liệu
    // đang có (cùng cơ chế RenameSuperAdminToAcademicAffairs đã dùng).
    // IF NOT EXISTS để migration chạy lại được sau một lần rollback nửa vời.
    await queryRunner.query(`ALTER TYPE "examcollect"."submission_status" ADD VALUE IF NOT EXISTS 'absent'`);

    await queryRunner.query(`CREATE TYPE "examcollect"."session_roster_source" AS ENUM('frozen', 'manual')`);
    await queryRunner.query(`
      CREATE TABLE "examcollect"."session_roster" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "exam_session_id" uuid NOT NULL,
        "student_mssv" citext NOT NULL,
        "student_name" character varying(150) NOT NULL,
        "home_class_id" uuid NOT NULL,
        "home_teacher_id" uuid NOT NULL,
        "source" "examcollect"."session_roster_source" NOT NULL DEFAULT 'frozen',
        "frozen_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "ck_session_roster_mssv" CHECK (student_mssv ~ '^[A-Za-z0-9]{4,20}$'),
        CONSTRAINT "PK_session_roster" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_session_roster_session_student" ON "examcollect"."session_roster" ("exam_session_id", "student_mssv")`);
    await queryRunner.query(`ALTER TABLE "examcollect"."session_roster" ADD CONSTRAINT "FK_session_roster_session" FOREIGN KEY ("exam_session_id") REFERENCES "examcollect"."exam_session"("id") ON DELETE RESTRICT`);
    await queryRunner.query(`ALTER TABLE "examcollect"."session_roster" ADD CONSTRAINT "FK_session_roster_class" FOREIGN KEY ("home_class_id") REFERENCES "examcollect"."class"("id") ON DELETE RESTRICT`);
    await queryRunner.query(`ALTER TABLE "examcollect"."session_roster" ADD CONSTRAINT "FK_session_roster_teacher" FOREIGN KEY ("home_teacher_id") REFERENCES "examcollect"."account"("id") ON DELETE RESTRICT`);
    await queryRunner.query(`
      CREATE TRIGGER trg_session_roster_updated_at
      BEFORE UPDATE ON "examcollect"."session_roster"
      FOR EACH ROW EXECUTE FUNCTION examcollect.set_updated_at()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_session_roster_updated_at ON "examcollect"."session_roster"`);
    await queryRunner.query(`DROP TABLE "examcollect"."session_roster"`);
    await queryRunner.query(`DROP TYPE "examcollect"."session_roster_source"`);
    // Postgres KHÔNG xoá được một value khỏi enum. `absent` ở lại — vô hại
    // (không dòng nào dùng sau khi session_roster đi mất) và ghi ra đây để
    // người đọc sau không tưởng down() bị viết thiếu.
  }
}
```

**Note:** `ALTER TYPE ... ADD VALUE` cannot run inside a transaction block on PostgreSQL < 12. This project is on 16 (verified via `SELECT version()` in the migration runner output), where it is transaction-safe — no special handling needed.

- [ ] **Step 7: Register the entity and run the migration**

Add `SessionRosterEntity` to the `entities` array in `apps/api/src/database/data-source.ts` and to `TypeOrmModule.forFeature([...])` in `apps/api/src/exam-session/exam-session.module.ts`.

Run: `pnpm migration:run`
Expected: executed successfully.

- [ ] **Step 8: Write the freeze service**

```typescript
// apps/api/src/exam-session/session-roster.service.ts
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { EnrollmentEntity } from '../course/entities/enrollment.entity';
import { RequiredDeliverableEntity } from './entities/required-deliverable.entity';
import { SubmissionEntity } from '../submission/entities/submission.entity';
import { ExamSessionEntity } from './entities/exam-session.entity';
import { SessionRosterEntity } from './entities/session-roster.entity';

export interface FreezeResult {
  students: number;
  submissionsSeeded: number;
}

/**
 * Đóng băng danh sách dự thi (CLAUDE.md §7.1.1) và sinh sẵn chỗ ngồi cho
 * sự vắng mặt (§7.1.2).
 *
 * Một transaction: ảnh chốt và các dòng `absent` phải cùng tồn tại hoặc
 * cùng không. Một ảnh chốt không có dòng submission nào để lại đúng cái lỗ
 * mà §7.1.2 sinh ra để bịt.
 */
@Injectable()
export class SessionRosterService {
  private readonly logger = new Logger(SessionRosterService.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async freeze(session: ExamSessionEntity): Promise<FreezeResult> {
    if (!session.classId) {
      // Phiên tạo trước khi class_id tồn tại (nullable vì lý do lịch sử —
      // xem comment trên cột). Không có lớp thì không có danh sách kỳ vọng.
      throw new BadRequestException(
        'Phiên thi này không gắn lớp nào nên không có danh sách dự thi để chốt.',
      );
    }

    return this.dataSource.transaction(async (manager) => {
      const rosterRepo = manager.getRepository(SessionRosterEntity);

      const already = await rosterRepo.count({ where: { examSessionId: session.id } });
      if (already > 0) {
        // Idempotent: bấm hai lần không phải lỗi, và KHÔNG được chốt lại —
        // chốt lại nghĩa là ảnh chốt đi theo roster hiện tại, tức mất đúng
        // tính chất khiến nó có giá trị.
        return { students: already, submissionsSeeded: 0 };
      }

      const enrolled = await manager.getRepository(EnrollmentEntity).find({
        where: { courseId: session.courseId, homeClassId: session.classId },
      });
      if (enrolled.length === 0) {
        throw new BadRequestException(
          'Lớp của phiên thi này chưa có sinh viên nào trong danh sách — nhập roster trước khi mở phiên.',
        );
      }

      await rosterRepo.insert(
        enrolled.map((row) => ({
          examSessionId: session.id,
          studentMssv: row.studentMssv,
          studentName: row.studentName,
          homeClassId: row.homeClassId,
          homeTeacherId: row.homeTeacherId,
          source: 'frozen' as const,
        })),
      );

      // Một dòng `absent` cho mỗi (sinh viên × file bắt buộc): "vắng" phải
      // có CHỖ NGỒI trong bảng điểm, không phải là sự thiếu một bản ghi.
      const deliverables = await manager.getRepository(RequiredDeliverableEntity).find({
        where: { examSessionId: session.id },
      });
      const rows = enrolled.flatMap((student) =>
        deliverables.map((deliverable) => ({
          examSessionId: session.id,
          requiredDeliverableId: deliverable.id,
          studentMssv: student.studentMssv,
          studentNameInput: student.studentName,
          homeClassId: student.homeClassId,
          homeTeacherId: student.homeTeacherId,
          status: 'absent' as const,
        })),
      );
      if (rows.length > 0) {
        await manager.getRepository(SubmissionEntity).insert(rows);
      }

      this.logger.log(
        `session ${session.id}: chốt ${enrolled.length} sinh viên, sinh ${rows.length} dòng absent`,
      );
      return { students: enrolled.length, submissionsSeeded: rows.length };
    });
  }

  /** Thêm một sinh viên vào ảnh chốt tại phiên thi — §5.8's escape hatch. */
  async addManually(
    session: ExamSessionEntity,
    student: { mssv: string; name: string },
  ): Promise<SessionRosterEntity> {
    const enrollment = await this.dataSource.getRepository(EnrollmentEntity).findOne({
      where: { courseId: session.courseId, studentMssv: student.mssv },
    });

    return this.dataSource.getRepository(SessionRosterEntity).save(
      this.dataSource.getRepository(SessionRosterEntity).create({
        examSessionId: session.id,
        studentMssv: student.mssv,
        studentName: student.name,
        // Nếu sinh viên có enrollment (thi bù lớp khác), giữ lớp/GV GỐC của
        // họ — đúng nguyên tắc định tuyến ở §3.3. Nếu không có enrollment
        // nào, họ thuộc lớp của phiên này.
        homeClassId: enrollment?.homeClassId ?? session.classId!,
        homeTeacherId: enrollment?.homeTeacherId ?? session.teacherId,
        source: 'manual',
      }),
    );
  }
}
```

The `submission_status` lifecycle trigger (`trg_submission_lifecycle`, from `InitialSchema`) validates transitions. Inserting directly at `absent` may violate it. **Before running the tests, read that trigger's function body**:
```bash
docker exec cine-postgres-1 psql -U examcollect_admin -d examcollect -c "\sf examcollect.validate_submission_lifecycle"
```
If it rejects an INSERT whose status is not `received`, extend it in this same migration to allow `received` **or** `absent` as an initial state, and to allow `absent → received` (the agent's first upload on a student who had been seeded absent). Add the new transitions to the trigger with the same `CREATE OR REPLACE FUNCTION` style the initial migration used — do not drop and recreate the trigger itself.

- [ ] **Step 9: Wire the route**

In `apps/api/src/exam-session/exam-session.controller.ts`:

```typescript
  @Post(':id/open')
  @Roles('teacher')
  @HttpCode(200)
  async open(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    const session = await this.examSessions.findEntityForOwner(id, req.user!.sub);
    return this.sessionRoster.freeze(session);
  }

  @Post(':id/roster/students')
  @Roles('teacher')
  async addRosterStudent(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RosterStudentDto,
    @Req() req: Request,
  ) {
    const session = await this.examSessions.findEntityForOwner(id, req.user!.sub);
    return this.sessionRoster.addManually(session, { mssv: dto.mssv, name: dto.name });
  }
```

Inject `SessionRosterService`, register it in `exam-session.module.ts` `providers`, and import `RosterStudentDto` from `../course/dto/roster.dto` (reuse — the validation rules are identical and duplicating the MSSV regex is how the two drift apart).

- [ ] **Step 10: Run the tests**

Run: `pnpm --filter api test:e2e -- session-roster-freeze`
Expected: PASS, all four.

- [ ] **Step 11: Run the whole api suite — this task changes a shared enum**

Run: `pnpm --filter api test && pnpm --filter api test:e2e`
Expected: PASS. Any spec asserting an exhaustive `SubmissionStatus` union or counting submission rows per session will need updating — that is expected fallout of adding a status, not a reason to revert.

- [ ] **Step 12: Update CLAUDE.md**

§7.1.1 and §7.1.2: mark both `✅ Đã làm (2026-09-10)`. §3.1 relations diagram: add `ExamSession ──1:n──> SessionRoster`. §3.2: add a `SessionRoster` row (`semester_id`: không — vay qua `exam_session`; chủ: không có cột chủ, đọc qua phiên).

- [ ] **Step 13: Commit**

```bash
git add apps/api/src apps/api/test CLAUDE.md
git commit -m "feat(exam-session): freeze the sitting list on open, seed absent rows

CLAUDE.md §7.1.1 + §7.1.2 — the roster was editable after the exam had
been sat and graded, and nothing recorded what it looked like at the
time. 'Absent' now has a row instead of being the absence of one, so a
grade sheet can tell absent from ungraded from zero. The §5.8 manual-add
escape hatch survives the freeze, flagged source=manual.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Move grading onto a BullMQ queue (A2a + §7.1.3)

> **Sửa ở rev 2 — bảy điểm. Kiến trúc lõi (một job một bài, payload chỉ chứa id, jobId dedupe, ném lỗi thay vì bắt, idempotent ở `gradeOneById`) GIỮ NGUYÊN — phần đó đúng.**
>
> **(a) Chính sách retry phải phân loại theo lỗi.** `attempts: 3` + backoff 5s, nhưng Task 5 ném trên **mọi** `APIError`. Một 400 — sai shape `thinking`, schema hỏng, model id sai — sẽ retry 5s→10s→20s rồi mới chết, trong lúc đó chiếm worker slot. Deploy sai một model id thì 40 bài × 3 lần = 120 lời gọi chắc chắn thất bại trước khi có ai biết. Cần: `RateLimitError`/5xx/timeout → retry; 4xx khác → `UnrecoverableError` của BullMQ, fail ngay.
>
> **(b) Thiếu `concurrency` và rate limit.** `WorkerHost` mặc định concurrency 1 → 40 bài × 10s ≈ 7 phút tuần tự. Đặt tường minh cạnh `attempts`/`backoff` vì chúng tương tác:
>
> ```ts
> @Processor(GRADING_QUEUE, { concurrency: 5, limiter: { max: 10, duration: 1000 } })
> ```
>
> **(c) Worker chạy CÙNG process với API — ghi ra là quyết định, không phải sơ suất.** Ở quy mô ~10 kết nối thì đúng. Hệ quả phải ghi: một lượt chấm nặng làm chậm request HTTP; restart API hủy job giữa chừng (BullMQ đưa về stalled rồi retry — an toàn nhờ idempotency ở Step 6, nhưng chỉ khi `stalledInterval` được cấu hình).
>
> **(d) Thiếu graceful shutdown.** Không có `OnModuleDestroy` gọi `worker.close()`. Ctrl-C giữa lượt chấm để job ở `active` tới hết stall timeout (mặc định 30s) — trong dev thì gây nhầm lẫn, trong demo thì tệ hơn.
>
> **(e) LỖ HỔNG LỚN NHẤT — không có gì quan sát được, và hợp đồng API đổi nghĩa.** `queued` đổi từ "đã chấm" thành "đã xếp hàng". Trang `apps/web/src/app/teacher/grading/page.tsx` hiện chỉ có `useStartGrading` + `useGradingResults`, **không có gì đọc tiến độ**. Sau Task 4, giảng viên bấm chấm rồi nhìn màn hình trống 7 phút — kỹ thuật đúng, trải nghiệm thụt lùi. Task này KHÔNG được coi là xong nếu thiếu:
>
> - `GET /exam-sessions/:id/grading-progress` đọc `queue.getJobCounts()` + đếm `grading_result` theo status
> - `@OnWorkerEvent('failed')` log job id + số lần thử
> - UI đọc tiến độ đó
>
> **(f) Không giới hạn số job một giảng viên tạo.** 3 phiên × 48 bài bấm liên tiếp = 144 job. Với model thật đó là tiền thật. Tối thiểu: log tổng số job kèm cảnh báo khi vượt ngưỡng.
>
> **(g) `.env` thiếu `REDIS_PASSWORD` và `REDIS_DB` (optional).** `getOrThrow` trên hai biến mà không có đường cấu hình auth nghĩa là chuyển sang Redis có mật khẩu phải sửa code.

**Files:**
- Modify: `apps/api/package.json` (add `bullmq`, `ioredis`, `@nestjs/bullmq`)
- Modify: `apps/api/.env.example`, `apps/api/.env`
- Modify: `docker-compose.yml` (nothing to add — Redis is already there on host port 6390; verify only)
- Create: `apps/api/src/grading/grading.queue.ts`
- Create: `apps/api/src/grading/grading.processor.ts`
- Modify: `apps/api/src/grading/grading.service.ts`
- Modify: `apps/api/src/grading/grading.module.ts`
- Modify: `apps/api/src/app.module.ts`
- Test: `apps/api/src/grading/grading.processor.spec.ts`
- Test: `apps/api/test/grading-queue.e2e-spec.ts` (new)

**Interfaces:**
- Consumes: `GradingService.gradeOne` (currently `private` — becomes `public` so the processor can call it; its signature is unchanged).
- Produces: queue name `'grading'`; job payload `GradeSubmissionJob { submissionId: string; requiredFilename: string; rubricId: string; teacherId: string }`; `GradingService.startGrading` returns the same `StartGradingResult` shape but `queued` now means *enqueued*, not *graded*. Tasks 5 and 6 change what happens **inside** `gradeOne`, never where it is called from.

- [ ] **Step 1: Verify Redis is reachable and add the env config**

```bash
docker compose up -d redis
docker exec cine-redis-1 redis-cli ping
```
Expected: `PONG`. (Container name may differ — `docker compose ps` to confirm.)

Append to `apps/api/.env.example` and the real `.env`:

```
# Redis — hàng đợi chấm điểm (BullMQ). CLAUDE.md: Redis dùng cho trạng thái
# sống và hàng đợi, KHÔNG dùng làm nơi lưu dữ liệu bền.
# Cổng 6390 là port host mà docker-compose map ra từ 6379 trong container.
REDIS_HOST=localhost
REDIS_PORT=6390
```

- [ ] **Step 2: Install the dependencies**

```bash
cd apps/api
pnpm add bullmq ioredis @nestjs/bullmq
```

- [ ] **Step 3: Write the failing processor unit test**

```typescript
// apps/api/src/grading/grading.processor.spec.ts
import { Test } from '@nestjs/testing';
import { GradingProcessor } from './grading.processor';
import { GradingService } from './grading.service';

describe('GradingProcessor', () => {
  const gradeOne = jest.fn();
  let processor: GradingProcessor;

  beforeEach(async () => {
    gradeOne.mockReset();
    const module = await Test.createTestingModule({
      providers: [
        GradingProcessor,
        { provide: GradingService, useValue: { gradeOneById: gradeOne } },
      ],
    }).compile();
    processor = module.get(GradingProcessor);
  });

  it('delegates one job to GradingService.gradeOneById', async () => {
    await processor.process({
      data: { submissionId: 's1', requiredFilename: 'Cau1.docx', rubricId: 'r1', teacherId: 't1' },
    } as never);

    expect(gradeOne).toHaveBeenCalledWith({
      submissionId: 's1',
      requiredFilename: 'Cau1.docx',
      rubricId: 'r1',
      teacherId: 't1',
    });
  });

  it('lets the error propagate so BullMQ retries the job', async () => {
    gradeOne.mockRejectedValue(new Error('model timeout'));
    await expect(
      processor.process({ data: { submissionId: 's1', requiredFilename: 'x', rubricId: 'r', teacherId: 't' } } as never),
    ).rejects.toThrow('model timeout');
  });
});
```

- [ ] **Step 4: Run to confirm failure**

Run: `pnpm --filter api test -- grading.processor`
Expected: FAIL — module does not exist.

- [ ] **Step 5: Add the queue definition and processor**

```typescript
// apps/api/src/grading/grading.queue.ts
export const GRADING_QUEUE = 'grading';

export interface GradeSubmissionJob {
  submissionId: string;
  /** Tên file đã khai báo — chỉ đuôi của nó được dùng để chọn extractor. */
  requiredFilename: string;
  rubricId: string;
  /** Ai bấm "Bắt đầu chấm" — ghi vào grading_result.grading_triggered_by. */
  teacherId: string;
}
```

```typescript
// apps/api/src/grading/grading.processor.ts
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { GradingService } from './grading.service';
import { GRADING_QUEUE, GradeSubmissionJob } from './grading.queue';

/**
 * Một job = một bài (CLAUDE.md §7.1.3).
 *
 * Vì sao không phải một job cho cả phiên: chấm 40+ bài bằng model thật mất
 * 3-15s/bài, tức 2-12 PHÚT — quá hạn mọi HTTP request, và nếu giảng viên
 * đóng tab giữa chừng thì một job nguyên khối mất sạch tiến độ. Per-bài
 * nghĩa là retry đúng bài lỗi, tiến độ đọc được từ DB, và chi phí AI không
 * bị tính hai lần cho cùng một bài.
 *
 * Lỗi được NÉM RA, không bắt: BullMQ cần thấy exception để retry. Bắt và
 * log ở đây là cách im lặng biến một bài chưa chấm thành một bài "đã xong".
 */
@Processor(GRADING_QUEUE)
export class GradingProcessor extends WorkerHost {
  private readonly logger = new Logger(GradingProcessor.name);

  constructor(private readonly grading: GradingService) {
    super();
  }

  async process(job: Job<GradeSubmissionJob>): Promise<void> {
    const started = Date.now();
    await this.grading.gradeOneById(job.data);
    // Không log nội dung bài làm hay output model — chỉ id và thời gian.
    this.logger.log(`graded submission ${job.data.submissionId} in ${Date.now() - started}ms`);
  }
}
```

- [ ] **Step 6: Refactor `GradingService` — enqueue instead of loop, and make the retry safe**

In `apps/api/src/grading/grading.service.ts`:

Replace the `for (const submission of todo) { await this.gradeOne(...) }` block with:

```typescript
    await this.queue.addBulk(
      todo.map((submission) => ({
        name: 'grade-submission',
        data: {
          submissionId: submission.id,
          requiredFilename: filenames.get(submission.requiredDeliverableId) ?? '',
          rubricId: rubric.id,
          teacherId,
        } satisfies GradeSubmissionJob,
        opts: {
          // jobId theo submission: BullMQ bỏ qua job trùng id, nên bấm
          // "Bắt đầu chấm" hai lần không tạo hai lượt chấm cho một bài —
          // tầng phòng thứ hai sau bộ lọc `alreadyGraded` ở trên.
          jobId: `grade:${submission.id}`,
          attempts: 3,
          backoff: { type: 'exponential', delay: 5_000 },
          removeOnComplete: 1_000,
          removeOnFail: false,
        },
      })),
    );
```

Inject the queue in the constructor:

```typescript
    @InjectQueue(GRADING_QUEUE) private readonly queue: Queue<GradeSubmissionJob>,
```

Add the by-id entry point the processor calls, wrapping the existing `gradeOne`:

```typescript
  /**
   * Điểm vào của hàng đợi. Tra lại submission theo id (job payload chỉ chứa
   * id — một entity serialize vào Redis là bản chụp có thể đã cũ).
   *
   * IDEMPOTENT Ở ĐÂY, không chỉ ở startGrading: một job retry sau khi model
   * đã trả lời nhưng trước khi transition cuối kịp ghi sẽ chạy lại hàm này.
   * `ai_total_score` là bất biến ở tầng DB (Security rule 6,
   * trg_grading_result_guard_ai_immutable), nên update lần hai KHÔNG âm thầm
   * sai — nó nổ. Thoát sớm là cách đúng để tránh cái nổ đó.
   */
  async gradeOneById(job: GradeSubmissionJob): Promise<void> {
    const existing = await this.results.findOne({
      where: { submissionId: job.submissionId },
      select: { id: true, status: true, aiTotalScore: true },
    });
    if (existing?.aiTotalScore !== null && existing?.aiTotalScore !== undefined) {
      this.logger.log(`submission ${job.submissionId} đã có điểm AI — bỏ qua job lặp`);
      return;
    }

    const submission = await this.submissions.findOne({ where: { id: job.submissionId } });
    if (!submission) {
      // Không throw: bài bị xoá giữa lúc chờ hàng đợi không phải lỗi cần
      // retry mãi. Ghi lại rồi coi job là xong.
      this.logger.warn(`submission ${job.submissionId} không còn tồn tại — bỏ job`);
      return;
    }

    const criteria = await this.criteria.find({
      where: { rubricId: job.rubricId },
      order: { createdAt: 'ASC' },
    });

    await this.gradeOne(
      submission,
      job.requiredFilename,
      job.rubricId,
      criteria,
      job.teacherId,
      existing?.id,
    );
  }
```

Change `gradeOne` from `private` to `public`, and give it an optional last parameter `existingResultId?: string` — when present it skips the initial `results.save(...)` and reuses that row (the retry case where the row was created but the model never answered).

Update `gradeOne`'s stale doc comment: the paragraph beginning "Run inline for now. The queue this becomes is a real piece of work..." is now wrong. Replace it with a line saying it runs as a BullMQ job per submission and pointing at `grading.processor.ts`.

- [ ] **Step 7: Register BullMQ in the modules**

In `apps/api/src/app.module.ts`, add to `imports`:

```typescript
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.getOrThrow<string>('REDIS_HOST'),
          port: Number(config.getOrThrow<string>('REDIS_PORT')),
        },
      }),
    }),
```

In `apps/api/src/grading/grading.module.ts`, add `BullModule.registerQueue({ name: GRADING_QUEUE })` to `imports` and `GradingProcessor` to `providers`.

- [ ] **Step 8: Run the processor test**

Run: `pnpm --filter api test -- grading.processor`
Expected: PASS.

- [ ] **Step 9: Write and run the queue e2e test**

```typescript
// apps/api/test/grading-queue.e2e-spec.ts
describe('POST /exam-sessions/:id/start-grading (queued)', () => {
  it('returns immediately with a queued count and grades asynchronously', async () => {
    const teacher = await loginAs(app, 'teacher');
    const { session } = await seedSessionWithCollectedSubmissions(app, { count: 3 }); // adapt to existing helper

    const started = Date.now();
    const res = await request(app.getHttpServer())
      .post(`/exam-sessions/${session.id}/start-grading`)
      .set('Authorization', `Bearer ${teacher.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.queued).toBe(3);
    // Trả về NGAY, không chờ chấm xong: đây là điểm khác biệt của A2a.
    expect(Date.now() - started).toBeLessThan(2_000);

    // Chờ worker xử lý xong rồi mới kiểm kết quả.
    await waitFor(async () => {
      const results = await queryRows(app, `SELECT status FROM examcollect.grading_result gr JOIN examcollect.submission s ON s.id = gr.submission_id WHERE s.exam_session_id = $1`, [session.id]);
      expect(results).toHaveLength(3);
      expect(results.every((r) => r.status !== 'ai_grading')).toBe(true);
    }, { timeout: 30_000 });
  });

  it('clicking twice does not produce two results for one submission', async () => {
    const teacher = await loginAs(app, 'teacher');
    const { session } = await seedSessionWithCollectedSubmissions(app, { count: 2 });

    await request(app.getHttpServer()).post(`/exam-sessions/${session.id}/start-grading`).set('Authorization', `Bearer ${teacher.accessToken}`);
    const second = await request(app.getHttpServer()).post(`/exam-sessions/${session.id}/start-grading`).set('Authorization', `Bearer ${teacher.accessToken}`);

    expect(second.body.queued + second.body.alreadyGraded).toBe(2);
    await waitFor(async () => {
      const rows = await queryRows(app, `SELECT gr.submission_id, count(*) AS n FROM examcollect.grading_result gr JOIN examcollect.submission s ON s.id = gr.submission_id WHERE s.exam_session_id = $1 GROUP BY gr.submission_id`, [session.id]);
      expect(rows.every((r) => Number(r.n) === 1)).toBe(true);
    }, { timeout: 30_000 });
  });
});
```

Write `waitFor(fn, {timeout})` as a small local helper in the test file if the suite has no equivalent (poll every 500ms until `fn` resolves without throwing or the timeout elapses).

Run: `pnpm --filter api test:e2e -- grading-queue`
Expected: PASS. The e2e run needs Redis up — add that to the e2e prerequisites note in `apps/api/test/README.md` if one exists, or to `DEMO-RUNBOOK.md`.

- [ ] **Step 10: Update CLAUDE.md**

§7.1.3: mark `✅ Đã làm (2026-09-10)`. In the Tech Stack section, the "Queue: BullMQ — Grading Queue (one job per submission)" line is now true rather than aspirational — no edit needed, but verify it says exactly that.

- [ ] **Step 11: Commit**

```bash
git add apps/api/package.json apps/api/pnpm-lock.yaml apps/api/.env.example apps/api/src apps/api/test CLAUDE.md
git commit -m "feat(grading): grade on a BullMQ queue, one job per submission

CLAUDE.md §7.1.3 + the grading session's own A2a finding — grading ran
inline in the HTTP request, which a real model (3-15s/bài × 40 bài)
would have turned into a guaranteed timeout. Per-submission jobs with
jobId dedupe, 3 attempts, exponential backoff; gradeOneById exits early
when AI output already exists, since Security rule 6 makes a second
write an error rather than a silent overwrite.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: A real Claude grading provider (A2b)

**Files:**
- Modify: `apps/api/package.json` (add `@anthropic-ai/sdk`)
- Modify: `apps/api/.env.example`, `apps/api/.env`
- Create: `apps/api/src/grading/ai-provider/claude-grading.provider.ts`
- Create: `apps/api/src/grading/ai-provider/claude-grading.provider.spec.ts`
- Modify: `apps/api/src/grading/grading.module.ts`
- Modify: `apps/api/src/grading/grading.types.ts`

**Interfaces:**
- Consumes: the existing `AIGradingProvider` interface, `GradingRequest`, `GradingOutcome`, `CriterionVerdict`, `pointsFor` — all unchanged. **This task adds an implementation; it does not touch the seam.**
- Produces: `ClaudeGradingProvider` (name: `` `claude:${model}` ``), selected when `GRADING_PROVIDER=claude`; `GRADING_MODEL_PRIMARY` env (default `claude-haiku-4-5`). Task 6 wraps this class rather than modifying it.

- [ ] **Step 1: Install the SDK and add env config**

```bash
cd apps/api
pnpm add @anthropic-ai/sdk
```

Append to `.env.example` (and set real values in `.env`):

```
# AI chấm điểm. `keyword` (mặc định) là provider đối chiếu từ khoá chạy
# offline — dùng cho test, CI và demo không có mạng. `claude` gọi model thật.
GRADING_PROVIDER=keyword
ANTHROPIC_API_KEY=
# Model lượt đầu của cascade (CLAUDE.md "Model cascade"). Haiku vì lượt đầu
# chấm phần lớn bài rõ ràng; case mơ hồ mới leo thang (xem GRADING_MODEL_ESCALATION).
GRADING_MODEL_PRIMARY=claude-haiku-4-5
```

- [ ] **Step 2: Write the failing unit test with a mocked SDK**

```typescript
// apps/api/src/grading/ai-provider/claude-grading.provider.spec.ts
import { ClaudeGradingProvider } from './claude-grading.provider';
import type { GradingRequest } from './ai-grading-provider';

const create = jest.fn();
jest.mock('@anthropic-ai/sdk', () => ({
  __esModule: true,
  default: class {
    messages = { create };
  },
}));

const request: GradingRequest = {
  studentMssv: 'SV001',
  content: 'Em trình bày thuật toán sắp xếp nổi bọt...',
  deliverableType: 'document',
  criteria: [
    { id: 'c1', description: 'Nêu đúng ý tưởng thuật toán', maxPoints: 4 },
    { id: 'c2', description: 'Phân tích độ phức tạp', maxPoints: 6 },
  ],
};

describe('ClaudeGradingProvider', () => {
  beforeEach(() => create.mockReset());

  it('maps the model verdicts onto points via pointsFor, never trusting a model-supplied score', async () => {
    create.mockResolvedValue({
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            criteria: [
              { criterionId: 'c1', verdict: 'met', evidence: 'Đoạn 2 nêu đúng ý tưởng đổi chỗ.', points: 999 },
              { criterionId: 'c2', verdict: 'partially_met', evidence: 'Có nói O(n^2) nhưng không giải thích.' },
            ],
            confidence: 0.9,
          }),
        },
      ],
      usage: { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 0 },
      stop_reason: 'end_turn',
      model: 'claude-haiku-4-5',
    });

    const provider = new ClaudeGradingProvider('fake-key', 'claude-haiku-4-5');
    const outcome = await provider.grade(request);

    // points bị TÍNH LẠI từ verdict — 999 của model bị bỏ.
    expect(outcome.criterionResults[0].points).toBe(4);
    expect(outcome.criterionResults[1].points).toBe(3); // 50% của 6
    expect(outcome.totalScore).toBe(7);
    expect(outcome.modelUsed).toBe('claude:claude-haiku-4-5');
    expect(outcome.confidence).toBe(0.9);
  });

  it('returns zero confidence when the content is empty rather than calling the model', async () => {
    const provider = new ClaudeGradingProvider('fake-key', 'claude-haiku-4-5');
    const outcome = await provider.grade({ ...request, content: '' });

    expect(create).not.toHaveBeenCalled();
    expect(outcome.confidence).toBe(0);
    expect(outcome.totalScore).toBe(0);
    expect(outcome.criterionResults.every((r) => r.verdict === 'not_met')).toBe(true);
  });

  it('returns zero confidence when the model refuses, rather than scoring the work', async () => {
    create.mockResolvedValue({
      content: [],
      stop_reason: 'refusal',
      stop_details: { type: 'refusal', category: 'cyber', explanation: 'x' },
      usage: { input_tokens: 10, output_tokens: 0 },
      model: 'claude-haiku-4-5',
    });

    const provider = new ClaudeGradingProvider('fake-key', 'claude-haiku-4-5');
    const outcome = await provider.grade(request);
    expect(outcome.confidence).toBe(0);
    expect(outcome.criterionResults[0].evidence).toContain('từ chối');
  });

  it('puts the rubric before the student answer so the cached prefix is the rubric', async () => {
    create.mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify({ criteria: [], confidence: 0.5 }) }],
      usage: { input_tokens: 1, output_tokens: 1 },
      stop_reason: 'end_turn',
      model: 'claude-haiku-4-5',
    });

    const provider = new ClaudeGradingProvider('fake-key', 'claude-haiku-4-5');
    await provider.grade(request);

    const params = create.mock.calls[0][0];
    // system chứa rubric và được đánh dấu cache; bài làm nằm trong messages.
    const systemText = JSON.stringify(params.system);
    expect(systemText).toContain('Nêu đúng ý tưởng thuật toán');
    expect(systemText).toContain('ephemeral');
    expect(JSON.stringify(params.messages)).toContain('sắp xếp nổi bọt');
    expect(JSON.stringify(params.messages)).not.toContain('Nêu đúng ý tưởng thuật toán');
  });
});
```

- [ ] **Step 3: Run to confirm failure**

Run: `pnpm --filter api test -- claude-grading`
Expected: FAIL — module does not exist.

- [ ] **Step 4: Implement the provider**

```typescript
// apps/api/src/grading/ai-provider/claude-grading.provider.ts
import Anthropic from '@anthropic-ai/sdk';
import { Logger } from '@nestjs/common';
import {
  AIGradingProvider,
  CriterionResult,
  CriterionVerdict,
  GradingOutcome,
  GradingRequest,
  pointsFor,
} from './ai-grading-provider';

/**
 * Schema kết quả chấm. `strict` + `additionalProperties: false` là điều kiện
 * để structured output bảo đảm parse được — không có nó, một lần model trả
 * JSON hơi khác là một bài không chấm được.
 *
 * KHÔNG có field `points` trong schema: điểm được TÍNH từ verdict bằng
 * `pointsFor()` ở phía ta. Để model tự cho điểm là mở đường cho hai bài cùng
 * verdict ra hai điểm khác nhau — và `pointsFor` tồn tại chính để một verdict
 * luôn ra một điểm, ở một chỗ duy nhất.
 */
const GRADING_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['criteria', 'confidence'],
  properties: {
    criteria: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['criterionId', 'verdict', 'evidence'],
        properties: {
          criterionId: { type: 'string' },
          verdict: { type: 'string', enum: ['met', 'partially_met', 'not_met'] },
          evidence: {
            type: 'string',
            description: 'Trích dẫn NGUYÊN VĂN từ bài làm chứng minh cho verdict, tối đa 300 ký tự.',
          },
        },
      },
    },
    confidence: {
      type: 'number',
      minimum: 0,
      maximum: 1,
      description:
        'Mức độ tự tin của chính bạn vào kết quả chấm này. Thấp khi bài mơ hồ, viết tay khó đọc, hoặc tiêu chí không áp được vào nội dung.',
    },
  },
} as const;

const SYSTEM_INSTRUCTIONS = `Bạn là trợ lý chấm bài thi, chấm theo rubric có cấu trúc.

Nguyên tắc bắt buộc:
- Với mỗi tiêu chí, đưa ra MỘT verdict: met / partially_met / not_met. Không cho điểm số.
- Mỗi verdict phải kèm evidence là trích dẫn NGUYÊN VĂN từ bài làm. Không suy diễn, không viết lại.
- Nếu bài làm không có nội dung liên quan tới tiêu chí, verdict là not_met và evidence nói rõ là không tìm thấy.
- Nếu bài quá mơ hồ để kết luận, hạ confidence xuống thấp thay vì đoán — người chấm sẽ xem lại.
- Bạn ĐỀ XUẤT, không quyết định. Giảng viên là người chốt điểm cuối cùng.`;

interface ModelGradingResponse {
  criteria: Array<{ criterionId: string; verdict: CriterionVerdict; evidence: string }>;
  confidence: number;
}

export class ClaudeGradingProvider implements AIGradingProvider {
  private readonly logger = new Logger(ClaudeGradingProvider.name);
  private readonly client: Anthropic;
  readonly name: string;

  constructor(
    apiKey: string,
    private readonly model: string,
  ) {
    this.client = new Anthropic({ apiKey });
    // Tên mang theo model cụ thể: CalibrationRun so "AI vs người" là vô
    // nghĩa nếu không nói được AI nào (xem GradingOutcome.modelUsed).
    this.name = `claude:${model}`;
  }

  async grade(request: GradingRequest): Promise<GradingOutcome> {
    if (request.content.trim() === '') {
      // Không đọc được nội dung → không gọi model (không tốn tiền), không
      // cho điểm 0 (đó là phán xét về bài làm, không phải về file).
      return this.unreadable(request, 'Không đọc được nội dung bài làm — cần giảng viên chấm tay.');
    }

    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 8_000,
        // Rubric + hướng dẫn đứng TRƯỚC và được cache: chúng giống hệt nhau
        // giữa mọi bài trong cùng một phiên thi, chỉ bài làm là khác. Đây là
        // toàn bộ lý do chi phí chấm 40 bài không phải 40× chi phí một bài.
        system: [
          { type: 'text', text: SYSTEM_INSTRUCTIONS },
          {
            type: 'text',
            text: `Rubric:\n${request.criteria
              .map((c) => `- [${c.id}] (tối đa ${c.maxPoints} điểm) ${c.description}`)
              .join('\n')}`,
            cache_control: { type: 'ephemeral' },
          },
        ],
        messages: [
          {
            role: 'user',
            content: `Bài làm của sinh viên ${request.studentMssv} (loại: ${request.deliverableType}):\n\n${request.content}`,
          },
        ],
        output_config: {
          format: { type: 'json_schema', schema: GRADING_SCHEMA },
        },
      });

      if (response.stop_reason === 'refusal') {
        this.logger.warn(
          `model từ chối chấm bài của ${request.studentMssv}: ${response.stop_details?.category ?? 'unknown'}`,
        );
        return this.unreadable(request, 'Model từ chối chấm bài này — cần giảng viên chấm tay.');
      }

      const text = response.content.find((block) => block.type === 'text');
      if (!text || text.type !== 'text') {
        return this.unreadable(request, 'Model không trả về kết quả đọc được — cần giảng viên chấm tay.');
      }

      const parsed = JSON.parse(text.text) as ModelGradingResponse;
      const byId = new Map(parsed.criteria.map((row) => [row.criterionId, row]));

      // Lặp theo RUBRIC, không theo output của model: tiêu chí model bỏ sót
      // phải thành not_met có ghi chú, không phải biến mất khỏi bảng điểm.
      const criterionResults: CriterionResult[] = request.criteria.map((criterion) => {
        const row = byId.get(criterion.id);
        if (!row) {
          return {
            criterionId: criterion.id,
            verdict: 'not_met',
            points: 0,
            evidence: 'Model không chấm tiêu chí này — cần giảng viên xem lại.',
          };
        }
        return {
          criterionId: criterion.id,
          verdict: row.verdict,
          points: pointsFor(row.verdict, criterion.maxPoints),
          evidence: row.evidence.slice(0, 300),
        };
      });

      const missing = request.criteria.length - byId.size;
      const totalScore = criterionResults.reduce((sum, r) => sum + r.points, 0);

      this.logger.log(
        `graded ${request.studentMssv} on ${this.model}: in=${response.usage.input_tokens} out=${response.usage.output_tokens} cached=${response.usage.cache_read_input_tokens ?? 0}`,
      );

      return {
        modelUsed: this.name,
        criterionResults,
        totalScore: Math.round(totalScore * 100) / 100,
        // Thiếu tiêu chí là dấu hiệu kết quả không đáng tin — kéo confidence
        // xuống 0 để bài đó chắc chắn tới tay người.
        confidence: missing > 0 ? 0 : Math.max(0, Math.min(1, parsed.confidence)),
      };
    } catch (error) {
      if (error instanceof Anthropic.RateLimitError) {
        // NÉM RA: BullMQ retry với backoff là cách xử lý đúng, không phải
        // trả về điểm 0 cho một bài chưa ai chấm.
        throw error;
      }
      if (error instanceof Anthropic.APIError) {
        this.logger.error(`Anthropic API ${error.status} khi chấm ${request.studentMssv}: ${error.message}`);
        throw error;
      }
      // JSON.parse thất bại — output không dùng được, nhưng không phải lỗi
      // hạ tầng nên retry cũng vô ích. Đưa bài tới người.
      this.logger.error(
        `không parse được output model cho ${request.studentMssv}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return this.unreadable(request, 'Kết quả chấm tự động không đọc được — cần giảng viên chấm tay.');
    }
  }

  /** Mọi tiêu chí not_met, 0 điểm, confidence 0 — tức chắc chắn tới tay người. */
  private unreadable(request: GradingRequest, reason: string): GradingOutcome {
    return {
      modelUsed: this.name,
      criterionResults: request.criteria.map((criterion) => ({
        criterionId: criterion.id,
        verdict: 'not_met' as CriterionVerdict,
        points: 0,
        evidence: reason,
      })),
      totalScore: 0,
      confidence: 0,
    };
  }
}
```

**Thinking config is deliberately omitted.** `claude-haiku-4-5` would need `thinking: {type: "enabled", budget_tokens: N}`, while `claude-sonnet-5` / `claude-opus-5` **reject `budget_tokens` with a 400** and want `{type: "adaptive"}`. Sending one tier's shape to the other is a hard error, and a per-criterion verdict against a supplied rubric does not need extended reasoning at the primary tier. Task 6 adds `thinking: {type: 'adaptive'}` only on the escalation path, where the model is Sonnet/Opus.

- [ ] **Step 5: Run the tests**

Run: `pnpm --filter api test -- claude-grading`
Expected: PASS, all four.

- [ ] **Step 6: Wire provider selection in the module**

In `apps/api/src/grading/grading.module.ts`, replace the current unconditional `KeywordGradingProvider` binding:

```typescript
    {
      provide: AI_GRADING_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService): AIGradingProvider => {
        const kind = config.get<string>('GRADING_PROVIDER') ?? 'keyword';
        if (kind !== 'claude') {
          return new KeywordGradingProvider();
        }
        const apiKey = config.get<string>('ANTHROPIC_API_KEY');
        if (!apiKey) {
          // Cấu hình sai thì nói ra lúc khởi động, không phải lúc giảng viên
          // bấm chấm và nhận 500.
          throw new Error('GRADING_PROVIDER=claude nhưng thiếu ANTHROPIC_API_KEY');
        }
        return new ClaudeGradingProvider(
          apiKey,
          config.get<string>('GRADING_MODEL_PRIMARY') ?? 'claude-haiku-4-5',
        );
      },
    },
```

- [ ] **Step 7: Verify against the real API once, by hand**

This is the only step in either plan that spends money. With `GRADING_PROVIDER=claude` and a real key in `.env`, run one session's grading end-to-end through the UI on a seeded 2-submission session, then check:

```bash
docker exec cine-postgres-1 psql -U examcollect_admin -d examcollect -c "SELECT model_used, ai_total_score, confidence, status FROM examcollect.grading_result ORDER BY created_at DESC LIMIT 2;"
```

Expected: `model_used` = `claude:claude-haiku-4-5`, a real score, a real confidence, status `auto_approved` or `flagged_for_review`. Then run it a second time on another session and confirm the log line reports `cached=` greater than zero on the second and later submissions — that is prompt caching working, and its absence means the rubric prefix is being invalidated.

- [ ] **Step 8: Update CLAUDE.md**

Add to the "AI Grading Strategy" section a line recording that `GRADING_PROVIDER` selects between `keyword` (offline default) and `claude`, and that the primary model is `claude-haiku-4-5` per the cascade. Mark the grading session's A2b `✅ Đã làm (2026-09-10)` wherever the §7 backlog references it.

- [ ] **Step 9: Commit**

```bash
git add apps/api/package.json apps/api/pnpm-lock.yaml apps/api/.env.example apps/api/src/grading CLAUDE.md
git commit -m "feat(grading): a real Claude provider behind the existing seam

CLAUDE.md AI Grading Strategy — the keyword stub hardcodes confidence
0.2 against a 0.85 threshold, so nothing has ever actually been
auto-approved by a model. Rubric goes in the cached system prefix, the
answer in messages; points are recomputed from verdicts via pointsFor
rather than trusted from the model; refusal, missing criteria and
unparseable output all mean confidence 0, never a score of zero.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Model cascade driven by `grading_pipeline_config` (A2c)

**Files:**
- Create: `apps/api/src/grading/ai-provider/cascade-grading.provider.ts`
- Create: `apps/api/src/grading/ai-provider/cascade-grading.provider.spec.ts`
- Create: `apps/api/src/admin/grading-pipeline-config.service.ts`
- Create: `apps/api/src/admin/dto/grading-pipeline-config.dto.ts`
- Modify: `apps/api/src/admin/admin.controller.ts` (or create `grading-pipeline-config.controller.ts` if the admin module has no controller yet — check)
- Modify: `apps/api/src/grading/grading.module.ts`, `apps/api/src/grading/grading.service.ts`
- Modify: `apps/api/.env.example`

**Interfaces:**
- Consumes: `ClaudeGradingProvider` (Task 5) — instantiated twice, once per tier; `GradingPipelineConfigEntity` (`primaryModel`, `escalationModel`, `confidenceThreshold`, `scopeType`, `scopeId`, `deliverableType`).
- Produces: `CascadeGradingProvider implements AIGradingProvider` — one `grade()` call may make two model calls; `GradingPipelineConfigService.resolve(courseId, deliverableType): Promise<ResolvedPipelineConfig>` (course row wins over global row, `AUTO_APPROVE_CONFIDENCE` is the fallback threshold). `GradingRequest` gains an optional `courseId` so the cascade can resolve per-course config.

- [ ] **Step 1: Write the failing cascade test**

```typescript
// apps/api/src/grading/ai-provider/cascade-grading.provider.spec.ts
import { CascadeGradingProvider } from './cascade-grading.provider';
import type { AIGradingProvider, GradingOutcome, GradingRequest } from './ai-grading-provider';

const request: GradingRequest = {
  studentMssv: 'SV001',
  content: 'nội dung bài làm',
  deliverableType: 'document',
  courseId: 'course-1',
  criteria: [{ id: 'c1', description: 'Tiêu chí', maxPoints: 10 }],
};

function stub(name: string, confidence: number, score: number): AIGradingProvider {
  return {
    name,
    grade: jest.fn(async (): Promise<GradingOutcome> => ({
      modelUsed: name,
      criterionResults: [{ criterionId: 'c1', verdict: 'met', points: score, evidence: 'e' }],
      totalScore: score,
      confidence,
    })),
  };
}

describe('CascadeGradingProvider', () => {
  it('keeps the primary result when its confidence clears the threshold', async () => {
    const primary = stub('primary', 0.95, 10);
    const escalation = stub('escalation', 0.99, 9);
    const cascade = new CascadeGradingProvider(primary, escalation, {
      resolve: async () => ({ confidenceThreshold: 0.85, escalationEnabled: true }),
    } as never);

    const outcome = await cascade.grade(request);
    expect(outcome.modelUsed).toBe('primary');
    expect(escalation.grade).not.toHaveBeenCalled();
  });

  it('escalates when the primary is below the threshold and returns the stronger result', async () => {
    const primary = stub('primary', 0.4, 10);
    const escalation = stub('escalation', 0.93, 8);
    const cascade = new CascadeGradingProvider(primary, escalation, {
      resolve: async () => ({ confidenceThreshold: 0.85, escalationEnabled: true }),
    } as never);

    const outcome = await cascade.grade(request);
    expect(outcome.modelUsed).toBe('escalation');
    expect(outcome.totalScore).toBe(8);
  });

  it('keeps the escalated result even when it is ALSO below threshold — the flag is the point', async () => {
    const primary = stub('primary', 0.2, 10);
    const escalation = stub('escalation', 0.3, 7);
    const cascade = new CascadeGradingProvider(primary, escalation, {
      resolve: async () => ({ confidenceThreshold: 0.85, escalationEnabled: true }),
    } as never);

    const outcome = await cascade.grade(request);
    expect(outcome.modelUsed).toBe('escalation');
    expect(outcome.confidence).toBe(0.3); // vẫn dưới ngưỡng → flagged_for_review
  });

  it('does not escalate a zero-confidence result — unreadable is not a hard case', async () => {
    const primary = stub('primary', 0, 0);
    const escalation = stub('escalation', 0.9, 9);
    const cascade = new CascadeGradingProvider(primary, escalation, {
      resolve: async () => ({ confidenceThreshold: 0.85, escalationEnabled: true }),
    } as never);

    const outcome = await cascade.grade(request);
    expect(escalation.grade).not.toHaveBeenCalled();
    expect(outcome.modelUsed).toBe('primary');
  });

  it('skips escalation entirely when config has no escalation model', async () => {
    const primary = stub('primary', 0.4, 10);
    const escalation = stub('escalation', 0.9, 9);
    const cascade = new CascadeGradingProvider(primary, escalation, {
      resolve: async () => ({ confidenceThreshold: 0.85, escalationEnabled: false }),
    } as never);

    const outcome = await cascade.grade(request);
    expect(escalation.grade).not.toHaveBeenCalled();
    expect(outcome.modelUsed).toBe('primary');
  });
});
```

The fourth test is the important one: a zero confidence from the primary means *the file was unreadable or the model refused* (Task 5's `unreadable()` path), not *this is a hard question*. Paying for a second model call on a file nothing could read is pure waste, and the result would be identically unreadable.

- [ ] **Step 2: Run to confirm failure**

Run: `pnpm --filter api test -- cascade-grading`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Add `courseId` to `GradingRequest`**

In `apps/api/src/grading/ai-provider/ai-grading-provider.ts`, add to `GradingRequest`:

```typescript
  /**
   * Môn của bài này, để cascade tra được cấu hình theo môn
   * (`grading_pipeline_config.scope_type = 'course'`). Optional: provider
   * không quan tâm tới cấu hình (keyword) bỏ qua nó.
   */
  courseId?: string;
```

In `apps/api/src/grading/grading.service.ts`'s `gradeOne`, add `courseId: submission.examSession?.courseId` to the `request` object — or, since `gradeOne` may not have the session loaded, pass the session's `courseId` down from `gradeOneById` (which can select it in one query alongside the submission). Prefer the latter: one query, no lazy relation.

- [ ] **Step 4: Add the config resolver**

```typescript
// apps/api/src/admin/grading-pipeline-config.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { GradingPipelineConfigEntity } from './entities/grading-pipeline-config.entity';
import { AUTO_APPROVE_CONFIDENCE } from '../grading/grading.types';

export interface ResolvedPipelineConfig {
  confidenceThreshold: number;
  escalationEnabled: boolean;
  primaryModel: string | null;
  escalationModel: string | null;
}

/**
 * Hiện thực hoá "model cascade" của CLAUDE.md thành cấu hình admin sửa
 * được, thay cho hằng số hardcode.
 *
 * Thứ tự ưu tiên: cấu hình theo MÔN thắng cấu hình TOÀN CỤC, không có cấu
 * hình nào thì rơi về `AUTO_APPROVE_CONFIDENCE` và không leo thang. Ngưỡng
 * mặc định giữ nguyên 0.85 có chủ đích — một hệ thống chưa ai cấu hình phải
 * hành xử đúng như trước khi có bảng này.
 */
@Injectable()
export class GradingPipelineConfigService {
  constructor(
    @InjectRepository(GradingPipelineConfigEntity)
    private readonly configs: Repository<GradingPipelineConfigEntity>,
  ) {}

  async resolve(
    courseId: string | undefined,
    deliverableType: string,
  ): Promise<ResolvedPipelineConfig> {
    const rows = await this.configs.find({
      where: [
        ...(courseId
          ? [{ scopeType: 'course' as const, scopeId: courseId, deliverableType: deliverableType as never }]
          : []),
        { scopeType: 'global' as const, scopeId: IsNull(), deliverableType: deliverableType as never },
      ],
    });

    const perCourse = rows.find((row) => row.scopeType === 'course');
    const global = rows.find((row) => row.scopeType === 'global');
    const chosen = perCourse ?? global;

    return {
      confidenceThreshold:
        chosen?.confidenceThreshold === null || chosen?.confidenceThreshold === undefined
          ? AUTO_APPROVE_CONFIDENCE
          : Number(chosen.confidenceThreshold),
      escalationEnabled: Boolean(chosen?.escalationModel),
      primaryModel: chosen?.primaryModel ?? null,
      escalationModel: chosen?.escalationModel ?? null,
    };
  }
}
```

- [ ] **Step 5: Implement the cascade provider**

```typescript
// apps/api/src/grading/ai-provider/cascade-grading.provider.ts
import { Logger } from '@nestjs/common';
import { AIGradingProvider, GradingOutcome, GradingRequest } from './ai-grading-provider';
import { GradingPipelineConfigService } from '../../admin/grading-pipeline-config.service';

/**
 * Cascade: model rẻ chấm lượt đầu, chỉ phần confidence thấp mới leo thang
 * lên model mạnh (CLAUDE.md "Model cascade").
 *
 * Điều kiện leo thang là `0 < confidence < threshold`. Ranh giới dưới quan
 * trọng: confidence = 0 nghĩa là KHÔNG ĐỌC ĐƯỢC bài hoặc model từ chối
 * (xem ClaudeGradingProvider.unreadable) — không phải "bài khó". Gọi model
 * mạnh cho một file không đọc được là trả tiền để nhận lại đúng câu trả lời
 * cũ.
 */
export class CascadeGradingProvider implements AIGradingProvider {
  private readonly logger = new Logger(CascadeGradingProvider.name);
  readonly name: string;

  constructor(
    private readonly primary: AIGradingProvider,
    private readonly escalation: AIGradingProvider,
    private readonly configs: GradingPipelineConfigService,
  ) {
    this.name = `cascade(${primary.name}→${escalation.name})`;
  }

  async grade(request: GradingRequest): Promise<GradingOutcome> {
    const config = await this.configs.resolve(request.courseId, request.deliverableType);
    const first = await this.primary.grade(request);

    const shouldEscalate =
      config.escalationEnabled && first.confidence > 0 && first.confidence < config.confidenceThreshold;

    if (!shouldEscalate) {
      return first;
    }

    this.logger.log(
      `escalating ${request.studentMssv}: ${first.confidence} < ${config.confidenceThreshold}`,
    );
    const second = await this.escalation.grade(request);

    // Kết quả model mạnh THẮNG, kể cả khi confidence của nó vẫn dưới ngưỡng
    // — lúc đó bài đi tới giảng viên (flagged_for_review), đúng thiết kế.
    // Không so điểm rồi chọn cái cao/thấp hơn: đó là ta tự chấm, không phải
    // model chấm.
    return second;
  }
}
```

- [ ] **Step 6: Run the tests**

Run: `pnpm --filter api test -- cascade-grading`
Expected: PASS, all five.

- [ ] **Step 7: Wire it into the module and add the escalation env var**

Append to `.env.example`:
```
# Model leo thang của cascade — chỉ chạy cho phần bài confidence thấp.
GRADING_MODEL_ESCALATION=claude-sonnet-5
```

In `grading.module.ts`'s factory, when `GRADING_PROVIDER=claude`, build the cascade instead of the bare provider:

```typescript
        const primary = new ClaudeGradingProvider(apiKey, config.get('GRADING_MODEL_PRIMARY') ?? 'claude-haiku-4-5');
        const escalationModel = config.get<string>('GRADING_MODEL_ESCALATION');
        if (!escalationModel) {
          return primary;
        }
        return new CascadeGradingProvider(
          primary,
          new ClaudeGradingProvider(apiKey, escalationModel),
          pipelineConfigs,
        );
```

Inject `GradingPipelineConfigService` into the factory (`inject: [ConfigService, GradingPipelineConfigService]`) and export it from `AdminModule` / import `AdminModule` into `GradingModule` — check the existing module graph first; `GradingModule` already imports `ExamSessionModule`, so follow whichever direction avoids a cycle. If `AdminModule` imports `GradingModule` already, move `GradingPipelineConfigService` into `GradingModule` instead rather than creating a circular import.

**Escalation-tier thinking:** `claude-sonnet-5` and `claude-opus-5` take `thinking: {type: 'adaptive'}` and **reject `budget_tokens` with a 400**. Add an optional third constructor arg to `ClaudeGradingProvider` — `useAdaptiveThinking = false` — and when true, include `thinking: { type: 'adaptive' }` in the request. Pass `true` only for the escalation instance. Do not enable it on Haiku.

- [ ] **Step 8: Add the admin CRUD for the config**

Give `admin` (and only `admin`) routes to read and upsert config rows: `GET /admin/grading-pipeline-config`, `PUT /admin/grading-pipeline-config` with body `{ scopeType, scopeId, deliverableType, primaryModel, escalationModel, confidenceThreshold }`, validated by a DTO mirroring the entity's constraints (`@IsIn(['global','course'])`, `@IsUUID() @IsOptional()` for `scopeId`, `@IsIn(['document','code_project','image'])`, `@IsNumber() @Min(0) @Max(1)` for the threshold, `@IsString() @Length(1,100)` for model names). Set `updatedBy` from `req.user!.sub`. The `ck_grading_pipeline_config_scope` check constraint already enforces the scope/scopeId pairing at DB level — surface its 23514 as a 400 via `PostgresExceptionFilter` rather than duplicating the rule in the service.

- [ ] **Step 9: Run the whole api suite**

Run: `pnpm --filter api test && pnpm --filter api build`
Expected: PASS.

- [ ] **Step 10: Update CLAUDE.md**

"AI Grading Strategy": record that the cascade is live, reads `grading_pipeline_config` (course row beats global, falls back to `AUTO_APPROVE_CONFIDENCE` = 0.85), and that escalation is skipped at confidence 0 by design. Mark A2c `✅ Đã làm (2026-09-10)`. Remove `grading.types.ts`'s stale line "A per-course threshold belongs on GradingPipelineConfig, whose table already exists and is deliberately not wired up in this slice" — it is wired up now.

- [ ] **Step 11: Commit**

```bash
git add apps/api/src apps/api/.env.example CLAUDE.md
git commit -m "feat(grading): model cascade reading grading_pipeline_config

CLAUDE.md AI Grading Strategy — cheap model first, escalate only the
low-confidence remainder, thresholds admin-configurable per course
instead of a hardcoded 0.85. Confidence 0 does NOT escalate: that means
unreadable or refused, not hard, and a second model returns the same
nothing at twice the price.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: `GradeExport` — write scores back into the teacher's own gradebook

**Files:**
- Create: `apps/api/src/grading/grade-export.service.ts`
- Create: `apps/api/src/grading/dto/grade-export.dto.ts`
- Create: `apps/api/src/grading/grade-export.controller.ts`
- Modify: `apps/api/src/grading/grading.module.ts`
- Create: `apps/web/src/app/teacher/grading/_components/ExportGradesDialog.tsx`
- Modify: `apps/web/src/lib/api/grading.ts`, `apps/web/src/hooks/useGrading.ts`
- Test: `apps/api/test/grade-export.e2e-spec.ts` (new)

**Interfaces:**
- Consumes: `SessionRosterEntity` (Task 3 — the authoritative list of who belongs on the sheet), `ExamSessionEntity.semesterCode` (Task 2), the latest `TeacherReview.finalScore` per `GradingResult` (the `DISTINCT ON` query already in `GradingService.listForSession`), `StorageService` (presigned URLs).
- Produces: `POST /exam-sessions/:id/grade-export/upload-url` → `{ uploadUrl, storageKey }`; `POST /exam-sessions/:id/grade-export` with `{ templateStorageKey, mssvColumn, scoreColumn, sheetName? }` → `{ downloadUrl, unmatchedMssvCount, unmatched: string[] }`.

- [ ] **Step 1: Write the failing e2e test**

```typescript
// apps/api/test/grade-export.e2e-spec.ts
describe('POST /exam-sessions/:id/grade-export', () => {
  it('fills the teacher-named score column, matching rows by the teacher-named MSSV column', async () => {
    const teacher = await loginAs(app, 'teacher');
    const { session, students } = await seedGradedSession(app, { count: 2 }); // 2 sinh viên đã chốt điểm

    // Template do GV upload: cột B là MSSV, cột D là nơi điền điểm.
    const template = await buildXlsxFixture([
      ['Họ tên', 'MSSV', 'Lớp', 'Điểm thi'],
      ['Nguyễn Văn A', students[0].mssv, 'N01', ''],
      ['Trần Thị B', students[1].mssv, 'N01', ''],
      ['Lê Văn C', 'SV_KHONG_THI', 'N01', ''],
    ]);
    const { storageKey } = await uploadViaPresignedUrl(app, teacher, session.id, template);

    const res = await request(app.getHttpServer())
      .post(`/exam-sessions/${session.id}/grade-export`)
      .set('Authorization', `Bearer ${teacher.accessToken}`)
      .send({ templateStorageKey: storageKey, mssvColumn: 'MSSV', scoreColumn: 'Điểm thi' });

    expect(res.status).toBe(201);
    expect(res.body.unmatchedMssvCount).toBe(1);
    expect(res.body.unmatched).toEqual(['SV_KHONG_THI']);

    const filled = await downloadAndParseXlsx(res.body.downloadUrl);
    expect(filled[1][3]).toBe(students[0].finalScore); // dòng 2, cột D
    expect(filled[2][3]).toBe(students[1].finalScore);
    expect(filled[3][3]).toBe(''); // sinh viên không thi: KHÔNG điền gì
    expect(filled[1][0]).toBe('Nguyễn Văn A'); // mọi cột khác giữ nguyên
  });

  it('refuses when the named MSSV column does not exist, instead of guessing one', async () => {
    const teacher = await loginAs(app, 'teacher');
    const { session } = await seedGradedSession(app, { count: 1 });
    const template = await buildXlsxFixture([['Họ tên', 'Mã SV'], ['A', 'SV001']]);
    const { storageKey } = await uploadViaPresignedUrl(app, teacher, session.id, template);

    const res = await request(app.getHttpServer())
      .post(`/exam-sessions/${session.id}/grade-export`)
      .set('Authorization', `Bearer ${teacher.accessToken}`)
      .send({ templateStorageKey: storageKey, mssvColumn: 'MSSV', scoreColumn: 'Điểm' });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('MSSV');
  });

  it('another teacher cannot export this session', async () => {
    const other = await loginAs(app, 'teacher', { fresh: true });
    const { session } = await seedGradedSession(app, { count: 1 });
    const res = await request(app.getHttpServer())
      .post(`/exam-sessions/${session.id}/grade-export`)
      .set('Authorization', `Bearer ${other.accessToken}`)
      .send({ templateStorageKey: 'x', mssvColumn: 'MSSV', scoreColumn: 'Điểm' });
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `pnpm --filter api test:e2e -- grade-export`
Expected: FAIL — 404.

- [ ] **Step 3: Add the DTO**

```typescript
// apps/api/src/grading/dto/grade-export.dto.ts
import { IsOptional, IsString, Length } from 'class-validator';

/**
 * Cột MSSV và cột điểm do GIẢNG VIÊN CHỈ ĐỊNH TƯỜNG MINH (Security rule 9).
 *
 * Không đoán từ header, kể cả header ghi đúng chữ "MSSV" — đoán sai nghĩa là
 * điền điểm vào cột khác trong file bảng điểm thật của giảng viên, và không
 * có cách nào phát hiện sau đó.
 */
export class CreateGradeExportDto {
  @IsString()
  templateStorageKey!: string;

  /** Tên header của cột chứa MSSV, đúng như trong file. */
  @IsString()
  @Length(1, 100)
  mssvColumn!: string;

  /** Tên header của cột cần điền điểm — có sẵn hoặc tạo mới. */
  @IsString()
  @Length(1, 100)
  scoreColumn!: string;

  /** Sheet nào. Bỏ trống = sheet đầu tiên. */
  @IsOptional()
  @IsString()
  @Length(1, 100)
  sheetName?: string;
}
```

- [ ] **Step 4: Implement the service**

```typescript
// apps/api/src/grading/grade-export.service.ts
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import ExcelJS from 'exceljs';
import { GradeExportEntity } from './entities/grade-export.entity';
import { ExamSessionEntity } from '../exam-session/entities/exam-session.entity';
import { StorageService } from '../storage/storage.service';
import { GradingService } from './grading.service';
import { CreateGradeExportDto } from './dto/grade-export.dto';

export interface GradeExportResult {
  downloadUrl: string;
  unmatchedMssvCount: number;
  unmatched: string[];
}

/**
 * Điền điểm ngược vào file bảng điểm CÓ SẴN của giảng viên (CLAUDE.md Phase
 * 5 step 20) — không phải xuất một file mới.
 *
 * Vì sao quan trọng: giảng viên đã có file danh sách của trường với đủ cột
 * họ cần. Một file mới bắt họ copy tay sang, tức là ta trả việc về cho họ
 * đúng ở bước cuối — trái nguyên tắc "không đẩy việc cho ai".
 *
 * File template đi qua object storage, KHÔNG qua server này (Security rule
 * 5): GV upload bằng presigned URL, ta đọc từ storage, ghi kết quả trở lại
 * storage, trả về presigned URL để tải.
 */
@Injectable()
export class GradeExportService {
  private readonly logger = new Logger(GradeExportService.name);

  constructor(
    @InjectRepository(GradeExportEntity)
    private readonly exports: Repository<GradeExportEntity>,
    private readonly storage: StorageService,
    private readonly grading: GradingService,
  ) {}

  async export(
    session: ExamSessionEntity,
    teacherId: string,
    dto: CreateGradeExportDto,
  ): Promise<GradeExportResult> {
    // Điểm CUỐI CÙNG (sau khi GV duyệt), không phải điểm AI thô. listForSession
    // đã trả về finalScore từ TeacherReview mới nhất — dùng lại, không viết
    // truy vấn thứ hai có thể lệch với màn hình GV vừa xem.
    const results = await this.grading.listForSession(session.id);
    const scoreByMssv = new Map(
      results
        .filter((row) => row.finalScore !== null)
        .map((row) => [row.studentMssv.toLowerCase(), row.finalScore as number]),
    );

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await this.storage.getObject(dto.templateStorageKey));
    const sheet = dto.sheetName ? workbook.getWorksheet(dto.sheetName) : workbook.worksheets[0];
    if (!sheet) {
      throw new BadRequestException('Không tìm thấy sheet trong file bảng điểm.');
    }

    const header = sheet.getRow(1);
    const columnIndex = (name: string): number => {
      for (let i = 1; i <= header.cellCount; i++) {
        if (String(header.getCell(i).value ?? '').trim() === name.trim()) {
          return i;
        }
      }
      return -1;
    };

    const mssvCol = columnIndex(dto.mssvColumn);
    if (mssvCol === -1) {
      // KHÔNG đoán cột thay thế (Security rule 9). Nói rõ cái gì không thấy.
      throw new BadRequestException(
        `Không tìm thấy cột "${dto.mssvColumn}" trong dòng tiêu đề của file.`,
      );
    }
    let scoreCol = columnIndex(dto.scoreColumn);
    if (scoreCol === -1) {
      // Cột điểm CHƯA CÓ thì tạo mới ở cuối — đây là ca hợp lệ và thường
      // gặp (bảng điểm chưa có cột cho kỳ thi này), khác hẳn cột MSSV không
      // tìm thấy (không có gì để match thì không làm gì được).
      scoreCol = header.cellCount + 1;
      header.getCell(scoreCol).value = dto.scoreColumn;
    }

    const unmatched: string[] = [];
    let filled = 0;
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const mssv = String(row.getCell(mssvCol).value ?? '').trim();
      if (mssv === '') return;
      const score = scoreByMssv.get(mssv.toLowerCase());
      if (score === undefined) {
        // Có trong file nhưng không có điểm ở phiên này (không thi, hoặc
        // chưa chốt điểm). KHÔNG điền 0 — liệt kê ra để GV tự xử lý.
        unmatched.push(mssv);
        return;
      }
      row.getCell(scoreCol).value = score;
      filled++;
    });

    const outputKey = `grade-exports/${session.id}/${Date.now()}.xlsx`;
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    await this.storage.putObject(outputKey, buffer, {
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

    await this.exports.save(
      this.exports.create({
        examSessionId: session.id,
        exportedBy: teacherId,
        templateStorageKey: dto.templateStorageKey,
        outputStorageKey: outputKey,
        mssvColumn: dto.mssvColumn,
        scoreColumn: dto.scoreColumn,
        unmatchedMssvCount: unmatched.length,
      }),
    );

    this.logger.log(
      `grade export session=${session.id} filled=${filled} unmatched=${unmatched.length}`,
    );

    return {
      downloadUrl: await this.storage.getPresignedDownloadUrl(outputKey),
      unmatchedMssvCount: unmatched.length,
      unmatched,
    };
  }
}
```

Check `StorageService`'s actual method names before writing this (`getObject` is used by `GradingService` so that one is confirmed; `putObject` / `getPresignedDownloadUrl` may be named differently — read `apps/api/src/storage/storage.service.ts` and use whatever exists, adding a method only if genuinely absent).

- [ ] **Step 5: Add the controller**

```typescript
// apps/api/src/grading/grade-export.controller.ts
@Controller('exam-sessions/:id/grade-export')
@UseGuards(JwtAuthGuard, RolesGuard)
export class GradeExportController {
  constructor(
    private readonly exports: GradeExportService,
    private readonly examSessions: ExamSessionService,
    private readonly storage: StorageService,
  ) {}

  /** Presigned URL để GV upload file bảng điểm — file KHÔNG đi qua server. */
  @Post('upload-url')
  @Roles('teacher')
  async uploadUrl(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    const session = await this.examSessions.findEntityForOwner(id, req.user!.sub);
    const storageKey = `grade-export-templates/${session.id}/${Date.now()}.xlsx`;
    return { storageKey, uploadUrl: await this.storage.getPresignedUploadUrl(storageKey) };
  }

  @Post()
  @Roles('teacher')
  async create(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateGradeExportDto,
    @Req() req: Request,
  ) {
    const session = await this.examSessions.findEntityForOwner(id, req.user!.sub);
    return this.exports.export(session, req.user!.sub, dto);
  }
}
```

Register `GradeExportController` in `grading.module.ts`'s `controllers` and `GradeExportService` in `providers`; add `GradeExportEntity` to its `TypeOrmModule.forFeature`.

- [ ] **Step 6: Run the tests**

Run: `pnpm --filter api test:e2e -- grade-export`
Expected: PASS. Requires MinIO up and the bucket created — see the e2e prerequisites (a missing bucket surfaces as an error that looks like a business bug).

- [ ] **Step 7: Frontend — the export dialog**

Build `ExportGradesDialog.tsx` under `apps/web/src/app/teacher/grading/_components/`: file picker → parse header row client-side with exceljs → **two dropdowns** letting the teacher pick which header is the MSSV column and which is the score column (never pre-selected by name matching — Security rule 9 is a UX rule here too, a pre-selected guess is a guess the teacher will accept without reading) → POST → show `unmatchedMssvCount` with the list, and a download button for `downloadUrl`.

Add `requestGradeExportUploadUrl` / `createGradeExport` to `apps/web/src/lib/api/grading.ts` and `useCreateGradeExport` to `apps/web/src/hooks/useGrading.ts`, mirroring the shapes already in those files. Wire the dialog behind an "Xuất bảng điểm" button on `apps/web/src/app/teacher/grading/page.tsx`.

- [ ] **Step 8: Run web build**

Run: `pnpm --filter web build`
Expected: PASS.

- [ ] **Step 9: Update CLAUDE.md**

§8.4 mục 2 (currently "Không áp dụng được — chưa có code để kiểm"): the feature now exists, so this open question becomes answerable — rewrite it as a live verification item: does the export gather a make-up student under their `home_class_id` when the two classes have different teachers? Note that `session_roster` (Task 3) now carries the point-in-time routing this depends on. Mark GradeExport itself as implemented in whatever §7 line references it.

- [ ] **Step 10: Commit**

```bash
git add apps/api/src/grading apps/api/test apps/web/src CLAUDE.md
git commit -m "feat(grading): GradeExport writes scores into the teacher's own file

CLAUDE.md Phase 5 step 20 — the point is not a new spreadsheet, it is
the teacher's existing gradebook coming back filled in. Column mapping
is chosen by the teacher, never inferred (Security rule 9), including
in the UI: no pre-selected guess. Unmatched MSSVs are listed, never
filled with zero. Template and output both move through object storage
(Security rule 5).

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review Notes

- **Spec coverage**: §7.1.1 (Task 3), §7.1.2 (Task 3), §7.1.3 (Task 4), §7.1.4 (Task 1), §7.1.5 (Task 2), A2a (Task 4), A2b (Task 5), A2c (Task 6), GradeExport (Task 7). Every item from the plan request has a task.
- **Ordering is a real dependency chain, not a preference**: Task 1 before Task 5 (bound the input before paying per token); Task 3 before Task 7 (the export needs the frozen roster to know who belongs on the sheet); Task 4 before Tasks 5-6 (a real model inside an HTTP request times out — queue first, then make the work expensive); Task 2 before Task 7 (export filters on `semester_code`). Tasks 1 and 2 are independent of everything and can go in either order.
- **Type consistency checked**: `GradingRequest` gains `courseId?` in Task 6 and is consumed by `CascadeGradingProvider` only; `ClaudeGradingProvider` (Task 5) ignores it. `GradeSubmissionJob` (Task 4) is the single job payload shape used by both `startGrading` and `gradeOneById`. `SessionRosterSource` values (`'frozen' | 'manual'`) match the Postgres enum created in Task 3's migration.
- **Security rules touched, and where they are honoured**: rule 5 (Task 7 — presigned both directions), rule 6 (Task 4 Step 6 — early exit rather than a second write to immutable AI output), rule 7 (untouched — the rubric-immutability trigger and the no-update-route design already enforce it, verified in `CLAUDE.md` §8.4-3), rule 9 (Task 7 — DTO, service, and the UI all refuse to guess a column).
- **Known open risk, deliberately left to execution**: Task 3 Step 8 depends on `validate_submission_lifecycle`'s exact transition table, which the plan instructs the implementer to read from the live DB rather than assume. That is the one place this plan cannot be certain in advance, and it is called out inline rather than papered over.
