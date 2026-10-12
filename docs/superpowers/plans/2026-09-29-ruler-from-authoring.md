# G2 — Thước và nguồn tài liệu chấm (nối Soạn đề → gói test) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Every task is TDD: write the failing test, watch it fail **for the right reason**, implement, watch it pass, typecheck, lint the touched files, commit.

**Goal:** Unbreak `POST /exam-authoring/attach` (it builds two `.docx` files and never uploads them, so every call 400s — a regression from a lost merge, not a design choice), carry the test bundle the authoring flow already produced into the session as an approved-and-pinned bundle (otherwise a session with code deliverables cannot start grading at all), give the teacher a real review table for a bundle's cases, and say out loud where each piece of grading material came from.

**Architecture:** (1) **Restore** `StorageService.putObject` verbatim from `de779e8` (with its two unit tests) so `AttachExamService` can write the two documents it just built; cleanup on failure is per-stage. (2) A pure module `authoring-bundle.ts` flattens every question's `testBundle` into one bundle's cases, turning a model-written name into a `case_key` that satisfies the DB `CHECK`; `TestBundleService.adoptFromAuthoring` inserts that bundle with `origin='generated'`, approves and pins it **only when the session has no pinned bundle yet**, as the **last** step of `attach`. (3) `TestBundleService.get` returns `constraintQuote`, and a new `drop-case` route creates a *new bundle version* (the cases table is append-only). (4) A migration adds `grading_reference.model_answer_set_at`; `readiness` gains a `sources` block that `ReferenceForm` renders as provenance lines. (5) One neutral line about the session's ruler appears on the list page and inside the code-result dossier.

**Tech Stack:** NestJS 11 + TypeORM (raw SQL — `grading_test_bundle`/`grading_test_case` are append-only at the DB) + Jest (unit `*.spec.ts`, e2e `test/*.e2e-spec.ts`, serial, local Postgres:5442 / Redis:6390 / MinIO:9010 via `.env.test`); Next.js 15 + TanStack Query + Vitest/RTL; `openapi-fetch` client generated into `packages/shared`.

**Spec:** `docs/superpowers/specs/2026-09-29-ruler-from-authoring-design.md` (revision 2). Parent specs: `2026-09-20-grading-agent-investigator-design.md` (§2.1 *Khi giảng viên chỉ có đề*, §14.1, §14.3), `2026-09-23-grading-ui-rebuild-design.md` (§3.7, T-UI-17, T-UI-18).

## Decisions to veto at plan review

1. **We restore a byte-writing method on `StorageService`.** Security rule 5 says file uploads never pass through the NestJS server. `putObject` was added in `de779e8` with that exact reasoning (the two `.docx` files are *generated inside this process*; rule 5 is about files a *user* pushes), was reviewed by `code-reviewer`, and then vanished from `storage.service.ts` — the tree at `4e06f00^` has zero occurrences while `attach` still called it. `4e06f00` ("remove redundant tests for putObject method") then deleted the two callers and two tests instead of restoring the method, which is why `attach` silently does nothing. **If you disagree with the exception, say so before Task 1** — the alternative is `fetch(uploadUrl)` against our own presigned URL, roughly three lines, and Task 1 Steps 2 and 4 disappear.
2. **A bundle adopted from authoring is auto-approved and auto-pinned — unless the session already has a pinned bundle, in which case it is created unapproved.** UI spec §3.7 says attaching counts as approval. **Consequence you should weigh:** because attach = approval, the gold *"đáp án chưa kiểm chứng"* band almost never appears on the Soạn đề path (it switches off once a bundle is pinned), and *Bỏ ca này* is unavailable for that bundle (approved → 409). Both are live only for teacher-typed bundles, a second attach's bundle, and (later) G2b's generated bundle. The opposite choice — attach creates an **unapproved** bundle so the band and the review table are exercised — costs the teacher one click and deviates from §3.7. *This is the decision most worth a veto.*
3. **The test bundle is written last in `attach`.** If it fails after the paper and answer key are in, `attach` returns 500 while the paper/answer are already attached and the session has no ruler; re-attaching creates a second paper (delete it in the session screen). We do not reorder because writing the bundle *before* `references.upsert` could pin the ruler of an attach that then fails — a silently wrong ruler is worse than a missing one.
4. **New column `model_answer_set_at`** rather than reusing `updated_at`. Honest scope: `upsert` treats a *note* as part of the answer, so editing the note **does** move it; what it does not move on is a write that is not an answer — chiefly **choosing a different question file**. `created_at` is wrong from the second write onward. One column, one migration, no index. If you would rather not migrate, say "cập nhật lúc `updated_at`" and drop the word "tải lên".
5. **"Drop this case" creates a new bundle version.** `grading_test_case` has `guard_append_only` on UPDATE and DELETE, so there is no in-place path. Dropping from an approved bundle is refused with 409.
6. **The ruler-provenance line renders once per page, not once per row, and not on the essay page.** `grading_result` does not carry `test_bundle_id`; essays are graded against the rubric, not a test bundle. UI spec §3.7's *"every row"* is satisfied by the line being present on every page that shows code results (list page, and `InvestigatorDossier`).

## Global Constraints

- **Branch:** `feat/grading-g2-ruler`, branched from `feat/grading-gaps-g1-g5` (= `main` + 16 G1 commits). Do **not** push, open a PR, or merge without the user.
- **Work from the worktree** `C:\Users\Admin\Main\Desktop\HKI 2026-2027\KLTN\CINE\.claude\worktrees\grading-g2-ruler`; the shell cwd resets between calls — `cd` in every command. Do not `cd` to the original repo root.
- **Per-package infrastructure** (from `docs/superpowers/plans/2026-09-29-g2-g5-parallel-execution.md`): database `examcollect_g2`, `REDIS_DB=12`, `PORT=4002`. `apps/api/.env.test` is locked with `git update-index --skip-worktree apps/api/.env.test` and edited to `DATABASE_URL=…:5442/examcollect_g2` + `REDIS_DB=12`. **The `examcollect` schema is created by `docker/postgres-init/001-create-schema.sql`, not by any migration** — run `psql -h localhost -p 5442 -U <user from .env.test> -d examcollect_g2 -c "CREATE SCHEMA IF NOT EXISTS examcollect"` once, then `DATABASE_URL=<same as .env.test> DATABASE_SSL=false pnpm --filter api migration:run`. Never run migrations or e2e against `apps/api/.env` (points at Supabase). Docker Desktop must be running.
- **CLAUDE.md:** run GitNexus `impact` on a symbol **before** editing it (`repo` must be the absolute path `C:\Users\Admin\Main\Desktop\HKI 2026-2027\KLTN\CINE` — two repos share the name); report HIGH/CRITICAL risk to the user **before** editing; run `detect_changes()` before every commit. The GitNexus index may be stale — confirm with grep.
- **e2e suite runs serially** (`maxWorkers: 1`); never raise it. Kill stray `node`/`jest` workers from other sessions first (they eat BullMQ jobs from a shared Redis).
- **New code goes in new files** where the file-ownership matrix allows. `useTestBundle.ts` and `lib/api/test-bundle.ts` are shared, so review code goes in new files; `TestBundleService`, `grading-reference.service.ts`, `ReferenceForm.tsx`, `TestBundleCard.tsx`, `attach-exam.service.ts` are G2-exclusive.
- **Do not edit** `[resultId]/page.tsx` (G4 branches there), `SessionHeader.tsx` (G3), `FinalizePanel.tsx` (G4/G5), `exam-session-response.dto.ts`.
- **Existing tests that must change are listed per task** (spec §3, table "Test có sẵn"). Never weaken an assertion to make it pass: either the behaviour it states was deliberately changed (say so in a `Ruling:` line and replace it), or the code is wrong.
- **Copy is Vietnamese.** *môi trường chạy bài* (never "sandbox"), *không chấm được*. Every mutation error renders the server's message **verbatim** in a destructive `Alert`.
- **A control with no backing route stays `disabled` + `<NeedsBackend />` and sends no request.** This plan removes that treatment only from the two `ReferenceForm` lines it now backs. The three buttons in `PreparePanel` (*Sinh đáp án mẫu và gói test từ đề* / *Sinh gói test từ đáp án của bạn* / *Chạy thử đáp án mẫu với gói test*) keep it — they are G2b.
- **Commits:** write the message to a file with the Write tool, then `git commit -F <file>`; it ends with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. PowerShell 5.1 splits inline multi-line `-m`; the bash tool mangles backticks — patch scripts go in the scratchpad and run with `node file`.
- **Tests:** `pnpm --filter api exec jest <path>`, `pnpm --filter api exec jest --config ./test/jest-e2e.json <path>`, `pnpm --filter web exec vitest run <path>`, `pnpm --filter web exec tsc --noEmit`. Known unrelated tsc noise on the base branch: 7 lines, all in `src/lib/read-workbook.test.ts`.
- **Indentation of code blocks in this plan:** blocks inside numbered steps may carry two extra leading spaces from the list. Match the file's real indentation (2 spaces per level). When an Edit anchor fails on whitespace, re-read the file and copy its exact text — never loosen the anchor into a fuzzy match.
- **Ledger:** `.superpowers/sdd/2026-09-29-ruler-from-authoring/progress.md` (gitignored); record a `Ruling:` line for every deviation from this plan.

## Review Focus

Inputs and conditions the obvious tests would not exercise. Each is pinned by a test in the task that owns the code.

1. **A failed attach must not leave an `exam_material` row pointing at a deleted object** (the exam paper would be released to students as a dead link). A cleanup that only calls `deleteObject` does exactly that; `materials.remove` removes row and object. → Task 1 (test 3).
2. **A model-written case name with Vietnamese diacritics, spaces and punctuation** must yield a `case_key` that satisfies `CHECK (case_key ~ '^[A-Za-z0-9_-]{1,64}$')`. → Task 2 (property test over junk names).
3. **Two cases with the same model-written name** — `uq_grading_test_case_key (bundle_id, case_key)` turns the second INSERT into a 500 that takes the whole attach down. → Task 2 (duplicates) and Task 3 (two-question attach).
4. **A second `attach` on a session that already has a pinned bundle** must create a *new, unapproved* bundle and leave `test_bundle_id` on the old one. → Task 3.
5. **`model_answer_set_at` must not move when only the question file is re-chosen**, and must move when the note is rewritten (a note is an answer). → Task 4.
6. **Dropping a case from an *approved* bundle** must be 409, not a silent new version, because approving is the moment the teacher vouches for the contents. → Task 6.

Not changed, recorded so nobody thinks it was missed: `grading-run.service.ts:212` only blocks a **start**; §14.3's floor (*a bundle that never ran → ungradable*) stays unenforced for an already-graded session. And `StorageService.putObject` is **not** an upload path for user files — no route may pass client bytes to it.

---

## File Structure

**Backend (`apps/api`)**
- Modify `src/storage/storage.service.ts` — restore `putObject`; correct the class header comment.
- Modify `src/storage/storage.service.spec.ts` — restore the two `putObject` tests.
- Modify `src/exam-authoring/attach-exam.service.ts` — write both objects, per-stage cleanup, adopt the bundle, `AttachResult.testBundle`.
- Create `src/exam-authoring/authoring-bundle.ts` + `authoring-bundle.spec.ts` — pure `flattenAuthoringCases`.
- Modify `src/grading/test-bundle/test-bundle.service.ts` — `adoptFromAuthoring`, `origin` in `list`, `constraintQuote` in `get`, `dropCase`, private `nextVersion`/`insertCases`.
- Modify `src/grading/test-bundle/test-bundle.controller.ts`; create `dto/drop-test-case.dto.ts`.
- Modify `src/grading/grading.module.ts` — `TestBundleService` into `exports` (one item).
- Create `src/database/migrations/1789500000000-AddModelAnswerSetAt.ts`.
- Modify `src/grading/entities/grading-reference.entity.ts`, `src/grading/grading-reference.service.ts` — `modelAnswerSetAt`, `sources`.
- Tests: modify `test/exam-authoring-attach.e2e-spec.ts`, `test/test-bundle.e2e-spec.ts`, `test/grading-reference.e2e-spec.ts`.

**Web (`apps/web/src`)**
- Modify `lib/api/grading.ts` (`GradingSourceInfo`, `sources?`), `lib/api/test-bundle.ts` (`origin`, `constraintQuote`).
- Create `lib/api/test-bundle-review.ts`, `hooks/useTestBundleDetail.ts`.
- Create `app/teacher/grading/_components/TestBundleList.tsx` (+ test), `RulerOriginNote.tsx` (+ test).
- Modify `_components/TestBundleCard.tsx` (+ its test: one mock line), `_components/ReferenceForm.tsx` (+ test), `_components/PreparePanel.tsx` (+ test), `page.tsx` (+ test: one mock line), `[resultId]/_components/investigator/InvestigatorDossier.tsx` (+ test).
- Regenerate `packages/shared/src/api/schema.d.ts` (Task 7, **after** every route exists).

## Parallel execution

- Branch `feat/grading-g2-ruler` · worktree `grading-g2-ruler` · database `examcollect_g2` · `REDIS_DB=12` · `PORT=4002` · migration `1789500000000`.

### Shared-file touch points

Additive only; each is shared with another stream.

| File | G2 adds (exact anchor) | Who else touches it |
|---|---|---|
| `apps/api/src/grading/grading.module.ts` | `TestBundleService` as a new item in the `exports:` array (line 188) | G3 adds `RegradeController`/`RegradeService` to `controllers`/`providers` |
| `apps/web/src/app/teacher/grading/page.tsx` | `<RulerOriginNote sessionId={sessionId} />` on the line **right after** `<SessionHeader … />` (line 114) | G3 must place its band **after** the `results.isError` block (lines 116-123) and **before** `{loading ? …` (line 125); stream S replaces `SessionPicker` in the `!sessionId` branch (lines 47-49) |
| `apps/web/src/app/teacher/grading/_components/PreparePanel.tsx` | one prop on `<ReferenceForm …>` (line 87) | G4 edits the audit group, G5 replaces the gradebook block — other regions |
| `apps/web/src/app/teacher/grading/[resultId]/_components/investigator/InvestigatorDossier.tsx` | `<RulerOriginNote sessionId={sessionId} />` right after `{header(d.status, d.ungradableReason)}` in the **final** return (line 133) | G3 edits `UngradableView` (a different file and the `d.ungradableClass` branch at lines 116-129) |
| `packages/shared/src/api/schema.d.ts` | regenerated in Task 7 | regenerated again by G3/G4/G5 — take the union when merging |

Nothing else in this plan is shared.

---

### Task 1: restore `putObject` and make `attach` actually write

**Files:** `apps/api/src/storage/storage.service.ts`, `apps/api/src/storage/storage.service.spec.ts`, `apps/api/src/exam-authoring/attach-exam.service.ts`, `apps/api/test/exam-authoring-attach.e2e-spec.ts` (all modify).

**Interfaces**
- Consumes: `StorageService.buildMaterialKey(examSessionId, examMaterialId): string`, `.objectExists(key)`, `.deleteObject(key)`, `.getObject(key)`; `GradingReferenceService.requestAnswerKeyUpload(session): Promise<{ storageKey; uploadUrl; expiresIn }>`, `.upsert(session, dto, teacherId, origin)`; `ExamMaterialService.create(session, dto): Promise<ExamMaterialView>`, `.remove(session, id): Promise<void>`.
- Produces: `StorageService.putObject(key: string, body: Buffer, contentType: string): Promise<void>`.

- [ ] **Step 1: Confirm the history and record it in the ledger.**

  ```bash
  cd "C:/Users/Admin/Main/Desktop/HKI 2026-2027/KLTN/CINE/.claude/worktrees/grading-g2-ruler"
  git show 4e06f00^:apps/api/src/storage/storage.service.ts | grep -c putObject
  git show de779e8:apps/api/src/storage/storage.service.ts | sed -n '256,283p'
  ```

  Expected: `0`, then the original `putObject` (with `ContentLength: body.length`). If the first prints anything other than `0` the history in the spec is wrong — stop and report.

- [ ] **Step 2: RED — restore the two unit tests.**

  In `apps/api/src/storage/storage.service.spec.ts`, insert this block **immediately before** the line `  describe('configuration', () => {` (it currently follows the closing `  });` of the `getObjectSize` describe; `sendMock` and `s3Error` already exist in the file):

  ```ts
    describe('putObject', () => {
      it('gửi đúng bucket, key, body và content-type', async () => {
        sendMock.mockResolvedValue({});
        const body = Buffer.from('noi dung docx');

        await service.putObject('materials/s/m', body, 'application/vnd.docx');

        expect(sendMock.mock.calls[0][0].input).toEqual({
          Bucket: 'test-bucket',
          Key: 'materials/s/m',
          Body: body,
          ContentType: 'application/vnd.docx',
          ContentLength: body.length,
        });
      });

      // Không nuốt lỗi: chỗ gọi cần biết để dọn thứ đã ghi dở, chứ không
      // được đi tiếp rồi ghi một dòng DB trỏ vào object không tồn tại.
      it('ném khi kho lưu trữ từ chối', async () => {
        sendMock.mockRejectedValue(s3Error('InternalError', 500));
        await expect(service.putObject('materials/s/m', Buffer.from('x'), 'text/plain')).rejects.toThrow();
      });
    });

  ```

  ```bash
  pnpm --filter api exec jest src/storage/storage.service.spec.ts
  ```

  Expected: **RED** — `Property 'putObject' does not exist on type 'StorageService'` (ts-jest diagnostics) or `service.putObject is not a function`. Either is the right reason. Copy the output to the ledger.

- [ ] **Step 3: RED — the e2e cases.**

  Confirm the pre-existing failure first:

  ```bash
  pnpm --filter api exec jest --config ./test/jest-e2e.json test/exam-authoring-attach.e2e-spec.ts
  ```

  Expected: 1 failed / 4 passed; the failure is `Chưa thấy file trên kho lưu trữ — hãy tải lên trước rồi xác nhận.` in `'phiên chưa tới giờ thi -> gắn được cả đề lẫn đáp án, đúng chỗ của từng thứ'`. **A different failure means something else is broken — stop and report.**

  In `apps/api/test/exam-authoring-attach.e2e-spec.ts` add to the imports:

  ```ts
  import { ExamMaterialService } from '../src/exam-session/exam-material.service';
  import { GradingReferenceService } from '../src/grading/grading-reference.service';
  import { StorageService } from '../src/storage/storage.service';
  ```

  Add next to `let otherToken: string;` (line 27): `let storage: StorageService;` and in `beforeAll`, right after `dataSource = app.get(DataSource);` (line 92): `storage = app.get(StorageService);`. The helpers `makeSession(token, classId)`, `attach(sessionId, json, token?)`, `materialsOf(sessionId)`, `referenceOf(sessionId)` and the variables `examJson`, `classId`, `teacherToken` already exist in this file. Append these four tests inside the `describe`, after the `examJson sai hình dạng -> 400` case:

  ```ts
    // Ca "phiên chưa tới giờ thi" chỉ kiểm DÒNG DB nên xanh cả khi bucket rỗng.
    // Ca này kiểm BYTE: `.docx` là một file zip nên mọi file đều mở đầu bằng "PK".
    it('gắn đề xong thì cả hai object thật sự nằm trên kho lưu trữ', async () => {
      const sessionId = await makeSession(teacherToken, classId);

      const res = await attach(sessionId, examJson);
      expect(res.status).toBe(201);
      const paperKey = `materials/${sessionId}/${res.body.examMaterialId as string}`;
      const answerKey = `grading-reference/${sessionId}/answer-key`;

      expect(await storage.objectExists(paperKey)).toBe(true);
      expect(await storage.objectExists(answerKey)).toBe(true);
      const paper = await storage.getObject(paperKey);
      const answer = await storage.getObject(answerKey);
      expect(paper.subarray(0, 2).toString()).toBe('PK');
      expect(answer.subarray(0, 2).toString()).toBe('PK');
    });

    // Khoá đáp án là khoá CỐ ĐỊNH theo phiên nên lần sau GHI ĐÈ — chủ ý.
    it('gắn đề lần thứ hai trên cùng phiên vẫn còn đáp án trên kho', async () => {
      const sessionId = await makeSession(teacherToken, classId);

      expect((await attach(sessionId, examJson)).status).toBe(201);
      expect((await attach(sessionId, examJson)).status).toBe(201);

      const answer = await storage.getObject(`grading-reference/${sessionId}/answer-key`);
      expect(answer.subarray(0, 2).toString()).toBe('PK');
    });

    // Review Focus #1. `upsert` hỏng SAU khi `materials.create` đã xong: dòng
    // `exam_material` phải biến mất cùng object, nếu không `listForAgent` phát
    // một URL chết cho sinh viên.
    it('upsert hỏng -> dọn cả dòng lẫn object của lần gắn hỏng, không đụng lần trước', async () => {
      const sessionId = await makeSession(teacherToken, classId);
      const first = await attach(sessionId, examJson);
      expect(first.status).toBe(201);
      const firstId = first.body.examMaterialId as string;

      const spy = jest
        .spyOn(app.get(GradingReferenceService), 'upsert')
        .mockRejectedValueOnce(new Error('hỏng giả lập ở upsert'));
      try {
        expect((await attach(sessionId, examJson)).status).toBe(500);
      } finally {
        spy.mockRestore();
      }

      const rows = await materialsOf(sessionId);
      expect(rows).toHaveLength(1);
      expect(rows[0].id).toBe(firstId);
      expect(await storage.objectExists(`materials/${sessionId}/${firstId}`)).toBe(true);
    });

    // `materials.create` hỏng thì CHƯA có dòng nào, chỉ có object đề vừa ghi.
    it('create hỏng -> object đề vừa ghi bị xoá, không có dòng nào', async () => {
      const sessionId = await makeSession(teacherToken, classId);

      const create = jest
        .spyOn(app.get(ExamMaterialService), 'create')
        .mockRejectedValueOnce(new Error('hỏng giả lập ở create'));
      const del = jest.spyOn(storage, 'deleteObject');
      try {
        expect((await attach(sessionId, examJson)).status).toBe(500);
        expect(del).toHaveBeenCalledTimes(1);
        const key = del.mock.calls[0][0];
        expect(key.startsWith(`materials/${sessionId}/`)).toBe(true);
        expect(await storage.objectExists(key)).toBe(false);
      } finally {
        create.mockRestore();
        del.mockRestore();
      }
      expect(await materialsOf(sessionId)).toHaveLength(0);
    });
  ```

  ```bash
  pnpm --filter api exec jest --config ./test/jest-e2e.json test/exam-authoring-attach.e2e-spec.ts
  ```

  Expected: 5 failed / 4 passed — the first three new cases fail because `attach` still 400s; the fourth because `deleteObject` is never called (the current `catch` only wraps `upsert`).

- [ ] **Step 4: GREEN — restore `putObject`, correct the class comment.**

  In `apps/api/src/storage/storage.service.ts`, insert the method at the end of the class. Anchor (unique) — the class's closing brace followed by the next doc comment:

  ```ts
    }
  }

  /**
   * Builds a Content-Disposition value safe to sign into a presigned URL.
  ```

  Replace with (the method is the `de779e8` text, unchanged):

  ```ts
    }

    /**
     * Ghi bytes thẳng từ tiến trình này lên kho.
     *
     * KHÔNG phải lỗ hổng của Security rule 5, cùng lý lẽ với `getObject`: rule
     * đó nói về file NGƯỜI DÙNG đẩy lên — một phòng thi cùng nộp một lúc mà đi
     * qua API là biến API thành nút thắt, và đã có presigned URL cho đúng việc
     * ấy. Ở đây file do CHÍNH SERVER sinh ra (đề và đáp án dựng từ `examJson`
     * ngay trong tiến trình): bytes đã nằm sẵn trong bộ nhớ, không có chuyến
     * đi nào để tiết kiệm. Ký một URL rồi tự PUT vào URL của chính mình chỉ
     * thêm hai chặng mạng và một cách hỏng mới.
     *
     * Một lượt gắn đề là một lần bấm nút của một giảng viên, không phải 40
     * agent cùng lúc.
     */
    async putObject(key: string, body: Buffer, contentType: string): Promise<void> {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
          ContentLength: body.length,
        }),
      );
    }
  }

  /**
   * Builds a Content-Disposition value safe to sign into a presigned URL.
  ```

  `PutObjectCommand` is already imported (line 6). Then fix the class header comment. Replace exactly:

  ```ts
   * CLAUDE.md Security rule 5: submission files NEVER pass through this
   * server. Everything here mints a scoped, expiring URL or asks storage a
   * yes/no question about an object — no method reads or writes bytes, and
   * none should ever be added. `generateDownloadUrl` is not an exception to
   * that rule: the signature lets the AGENT fetch the object directly, which
   * is the rule being obeyed rather than bent.
  ```

  with:

  ```ts
   * CLAUDE.md Security rule 5: files a USER uploads NEVER pass through this
   * server. Almost everything here mints a scoped, expiring URL or asks
   * storage a yes/no question about an object. Two methods do handle bytes
   * inside this process, and each says at its definition why it is not an
   * upload path: `getObject` (grading reads a submission after the exam) and
   * `putObject` (the server writes a file it generated itself). No method may
   * accept bytes that a client sent. `generateDownloadUrl` is not an
   * exception to the rule: the signature lets the AGENT fetch the object
   * directly, which is the rule being obeyed rather than bent.
  ```

- [ ] **Step 5: GREEN — rewrite the body of `AttachExamService.attach`.**

  In `apps/api/src/exam-authoring/attach-exam.service.ts` replace everything from the line `    const [paper, answerKey] = await Promise.all([` through the method's final `    };\n  }\n}` (the current `return { examMaterialId: material.id, … };`, closing the method and the class) with:

  ```ts
    const [paper, answerKey] = await Promise.all([
      buildExamPaperDocx(exam),
      buildAnswerKeyDocx(exam),
    ]);

    // Đáp án ĐI TRƯỚC, và nằm ở khoá cố định của phiên (prefix
    // `grading-reference/`, không bao giờ lọt vào `listForAgent`). Hỏi
    // `requestAnswerKeyUpload` để lấy khoá thay vì tự ghép chuỗi: cách ghép
    // khoá đó là cơ chế giữ đáp án khỏi tay sinh viên, và nó phải có đúng
    // một chỗ định nghĩa. URL ký kèm theo thì bỏ — bytes đã nằm trong bộ nhớ
    // tiến trình này rồi (xem `StorageService.putObject`).
    const { storageKey: answerKeyKey } =
      await this.references.requestAnswerKeyUpload(session);

    const examMaterialId = randomUUID();
    const paperKey = this.storage.buildMaterialKey(session.id, examMaterialId);

    // Chặng đã qua quyết định cách dọn khi hỏng — xem `catch`.
    let createdMaterialId: string | null = null;
    try {
      // Cả `materials.create` lẫn `references.upsert` đều HEAD-check storage,
      // nên phải có byte thật TRƯỚC khi gọi bất kỳ cái nào. Trước đây không
      // có lệnh ghi nào ở đây: mọi lượt gắn đề dừng ở 400 "Chưa thấy file
      // trên kho lưu trữ".
      await Promise.all([
        this.storage.putObject(paperKey, paper, DOCX_MIME),
        this.storage.putObject(answerKeyKey, answerKey, DOCX_MIME),
      ]);

      const material = await this.materials.create(session, {
        examMaterialId,
        storageKey: paperKey,
        fileName: PAPER_FILENAME,
        fileSize: paper.length,
      });
      createdMaterialId = material.id;

      await this.references.upsert(
        session,
        {
          questionMaterialId: material.id,
          modelAnswerStorageKey: answerKeyKey,
          modelAnswerFilename: ANSWER_KEY_FILENAME,
          // Đề do model sinh mà chưa chạy thử thì mang dấu — xem
          // `grading-reference.entity.ts`.
          modelAnswerUnverified: exam.verification.status !== 'passed',
        },
        teacherId,
        'authoring',
      );

      return {
        examMaterialId: material.id,
        paperFilename: PAPER_FILENAME,
        answerKeyFilename: ANSWER_KEY_FILENAME,
      };
    } catch (error) {
      // KHÔNG BAO GIỜ đụng object đáp án: khoá của nó là khoá CỐ ĐỊNH của
      // phiên, nên xoá nó là xoá luôn đáp án của lần gắn trước.
      //
      // - Đã có dòng `exam_material`: `materials.remove` xoá CẢ dòng lẫn object.
      //   Chỉ `deleteObject` thì để lại một dòng trỏ vào object đã xoá, và
      //   `listForAgent` sẽ phát URL chết cho sinh viên.
      // - Chưa có dòng nào: chỉ có object đề vừa ghi, xoá đúng nó.
      const cleanup: Promise<void> =
        createdMaterialId !== null
          ? this.materials.remove(session, createdMaterialId)
          : this.storage.deleteObject(paperKey);
      await cleanup.catch((cleanupError: unknown) => {
        this.logger.error(
          `Gắn đề hỏng và dọn ${createdMaterialId ?? paperKey} cũng hỏng — còn lại một mục mồ côi`,
          cleanupError instanceof Error ? cleanupError.stack : String(cleanupError),
        );
      });
      throw error;
    }
  }
}
  ```

  The block ends with the method's `  }` and the class's `}`. `ExamMaterialService.remove` stays (it has its own route).

- [ ] **Step 6: GREEN.**

  ```bash
  pnpm --filter api exec jest src/storage/storage.service.spec.ts
  pnpm --filter api exec jest --config ./test/jest-e2e.json test/exam-authoring-attach.e2e-spec.ts
  pnpm --filter api exec jest --config ./test/jest-e2e.json test/exam-material.e2e-spec.ts test/grading-reference.e2e-spec.ts
  pnpm --filter api exec tsc --noEmit
  pnpm check:cycles
  ```

  Expected: storage spec green (incl. the 2 restored); attach e2e **9 passed / 0 failed** (5 existing — the previously red *"phiên chưa tới giờ thi"* now green, **unmodified** — plus 4 new); neighbours green; `tsc` clean; `0 vòng lặp`.

- [ ] **Step 7: `detect_changes` and commit.**

  Title: `fix(attach): khôi phục putObject và ghi hai file .docx lên kho, dọn theo chặng khi hỏng`. Body: cite `de779e8` (added), `4e06f00` (removed callers+tests instead of restoring), and that the previously red e2e case is now green unmodified.

---

### Task 2: `flattenAuthoringCases` — make a model's case name survive the DB

**Files:** create `apps/api/src/exam-authoring/authoring-bundle.ts` and `apps/api/src/exam-authoring/authoring-bundle.spec.ts`.

**Interfaces**
- Consumes: `GeneratedQuestion { testBundle: TestCase[] }` from `../ai-provider/exam-authoring-provider`.
- Produces: `AuthoringCase { caseKey: string; group: string; input: string; expectedOutput: string }` and `flattenAuthoringCases(questions: GeneratedQuestion[]): AuthoringCase[]`. Both exported.

- [ ] **Step 1: RED — write the spec first.**

  `apps/api/src/exam-authoring/authoring-bundle.spec.ts`:

  ```ts
  import { flattenAuthoringCases } from './authoring-bundle';
  import type { GeneratedQuestion } from './ai-provider/exam-authoring-provider';

  function question(topic: string, cases: { name: string; group: string }[]): GeneratedQuestion {
    return {
      statement: `Câu hỏi về ${topic}`,
      points: 1,
      topic,
      requiredComplexity: null,
      modelAnswer: 'code',
      resemblesKnownProblem: null,
      testBundle: cases.map((c) => ({
        name: c.name,
        group: c.group,
        input: '1 2 3',
        expectedOutput: '6',
      })),
    };
  }

  describe('flattenAuthoringCases', () => {
    it('làm phẳng nhiều câu thành một danh sách, khoá mang số thứ tự câu', () => {
      const out = flattenAuthoringCases([
        question('nhị phân', [{ name: 'ca1', group: 'co_ban' }]),
        question('đồ thị', [{ name: 'ca1', group: 'co_ban' }]),
      ]);
      expect(out.map((c) => c.caseKey)).toEqual(['q1-ca1', 'q2-ca1']);
      expect(out.every((c) => c.group === 'co_ban')).toBe(true);
    });

    it('bỏ dấu tiếng Việt, khoảng trắng và dấu câu trong tên ca', () => {
      const out = flattenAuthoringCases([
        question('cân bằng', [{ name: 'Ca 1: cân bằng!', group: 'co_ban' }]),
      ]);
      expect(out[0].caseKey).toBe('q1-ca-1-can-bang');
    });

    it('chữ đ được đổi thành d, không bị bỏ mất', () => {
      const out = flattenAuthoringCases([question('đồ thị', [{ name: 'Đồ thị đầy đủ', group: 'co_ban' }])]);
      expect(out[0].caseKey).toBe('q1-do-thi-day-du');
    });

    it('tên rỗng hoặc toàn ký tự lạ -> rơi về q{n}-c{i}', () => {
      const out = flattenAuthoringCases([
        question('rỗng', [
          { name: '', group: 'co_ban' },
          { name: '!!!', group: 'co_ban' },
        ]),
      ]);
      expect(out.map((c) => c.caseKey)).toEqual(['q1-c0', 'q1-c1']);
    });

    // `uq_grading_test_case_key (bundle_id, case_key)` — hai ca trùng tên
    // trong một câu là một INSERT 500 và kéo theo cả lần gắn đề.
    it('hai ca trùng tên trong một câu -> khoá thứ hai có hậu tố', () => {
      const out = flattenAuthoringCases([
        question('trùng', [
          { name: 'x', group: 'co_ban' },
          { name: 'x', group: 'co_ban' },
          { name: 'x', group: 'co_ban' },
        ]),
      ]);
      expect(out.map((c) => c.caseKey)).toEqual(['q1-x', 'q1-x-2', 'q1-x-3']);
    });

    it('khoá dài quá 64 vẫn vượt qua CHECK của DB, kể cả khi có hậu tố', () => {
      const out = flattenAuthoringCases([
        question('dài', Array.from({ length: 12 }, () => ({ name: 'k'.repeat(60), group: 'g' }))),
      ]);
      for (const c of out) {
        expect(c.caseKey.length).toBeLessThanOrEqual(64);
        expect(c.caseKey).toMatch(/^[A-Za-z0-9_-]{1,64}$/);
      }
      expect(new Set(out.map((c) => c.caseKey)).size).toBe(out.length);
    });

    it('group rỗng hoặc quá dài -> "general", không cắt câm', () => {
      const out = flattenAuthoringCases([
        question('g', [
          { name: 'a', group: '   ' },
          { name: 'b', group: 'x'.repeat(150) },
          { name: 'c', group: 'nhom_bien' },
        ]),
      ]);
      expect(out.map((c) => c.group)).toEqual(['general', 'general', 'nhom_bien']);
    });

    // Đây là hình thức thật của luật: mọi tên do model viết đều phải qua
    // được regex của DB, không phải mấy tên mình chọn.
    it('mọi tên rác đều cho khoá hợp lệ và không trùng', () => {
      const junk = [
        '', '   ', '!!!', 'Câu 1: cân bằng BST', 'a/b\\c', 'null', '0', '-', '_',
        'Đề thi giữa kỳ — phần 2', 'case\u0000with\u0000nulls', '🎉', 'x'.repeat(300),
        'Case 1', 'case 1', 'CASE 1',
      ];
      const questions = junk.map((name, i) =>
        question(`q${i}`, Array.from({ length: 12 }, () => ({ name, group: name || 'g' }))),
      );
      const out = flattenAuthoringCases(questions);
      expect(out.length).toBe(junk.length * 12);
      for (const c of out) expect(c.caseKey).toMatch(/^[A-Za-z0-9_-]{1,64}$/);
      expect(new Set(out.map((c) => c.caseKey)).size).toBe(out.length);
    });

    it('câu không có ca nào -> không sinh dòng nào', () => {
      expect(flattenAuthoringCases([question('rỗng', [])])).toEqual([]);
    });
  });
  ```

  ```bash
  pnpm --filter api exec jest src/exam-authoring/authoring-bundle.spec.ts
  ```

  Expected: **RED** — `Cannot find module './authoring-bundle'`.

- [ ] **Step 2: GREEN — create `apps/api/src/exam-authoring/authoring-bundle.ts`.**

  ```ts
  import type { GeneratedQuestion } from './ai-provider/exam-authoring-provider';

  /**
   * Một ca của gói test, đã đi qua những ràng buộc mà DB đặt ra.
   *
   * Khớp từng trường một với `CreateTestBundleDto` (mục đích chính là sao
   * chép được) và với các `CHECK` của `grading_test_case` trong migration
   * `1789450000000-AttemptsBundlesScores.ts`.
   */
  export interface AuthoringCase {
    caseKey: string;
    group: string;
    input: string;
    expectedOutput: string;
  }

  /** `CHECK (case_key ~ '^[A-Za-z0-9_-]{1,64})` — viết lại đúng biểu thức đó. */
  const CASE_KEY_REGEX = /^[A-Za-z0-9_-]{1,64}$/;

  /** `CHECK (length("group") BETWEEN 1 AND 100)`. */
  const MAX_GROUP_LENGTH = 100;

  const MAX_CASE_KEY_LENGTH = 64;

  /**
   * Làm phẳng `testBundle` của MỌI câu trong đề thành các ca của MỘT gói
   * test của phiên.
   *
   * Hàm thuần: không chạm DB, không chạm storage, không đụng hệ thống tệp.
   * Nó là thứ duy nhất ở đây test được bằng unit, và mọi luật ràng buộc của
   * DB (regex, độ dài, khoá duy nhất) đều nên chết ở một test nhanh chứ
   * không phải ở một `INSERT` giữa e2e — nơi một việc sai làm hỏng cả một
   * lần gắn đề thành 500 mà không ai biết vì sao.
   *
   * Vì sao làm phẳng chứ không một gói mỗi câu: `exam_session` ghim được
   * đúng MỘT `test_bundle_id`, và §14.1 nói thước là của cả phiên. Số thứ
   * tự câu nằm trong tiền tố `q{n}-` nên vẫn truy ngược được ca nào kiểm
   * câu nào.
   */
  export function flattenAuthoringCases(questions: GeneratedQuestion[]): AuthoringCase[] {
    const used = new Set<string>();
    const out: AuthoringCase[] = [];

    questions.forEach((question, questionIndex) => {
      const questionNumber = questionIndex + 1;
      question.testBundle.forEach((testCase, caseIndex) => {
        const base = caseKeyFor(questionNumber, caseIndex, testCase.name);
        let key = base;
        // `uq_grading_test_case_key (bundle_id, case_key)`: trùng là 500.
        // Cắt base xuống 61 để hậu tố `-2` vẫn nằm trong 64.
        for (let n = 2; used.has(key); n += 1) {
          key = `${base.slice(0, MAX_CASE_KEY_LENGTH - 3)}-${n}`;
        }
        used.add(key);
        out.push({
          caseKey: key,
          group: groupFor(testCase.group),
          input: testCase.input,
          expectedOutput: testCase.expectedOutput,
        });
      });
    });

    return out;
  }

  /**
   * `q{n}-{tên đã làm sạch}`, và rơi về `q{n}-c{i}` khi tên rỗng hoặc toàn
   * ký tự mà `slug` xoá hết.
   *
   * Giữ lại tên ca là chủ ý: đây là cột giảng viên đọc trong bảng duyệt
   * (UI spec §3.7), và một danh sách toàn `q3c0`, `q3c1` không giúp họ
   * nhận ra ca nào là ca nào.
   */
  function caseKeyFor(questionNumber: number, caseIndex: number, name: string): string {
    const prefix = `q${questionNumber}-`;
    const slug = slugify(name);
    const candidate = slug
      ? `${prefix}${slug}`.slice(0, MAX_CASE_KEY_LENGTH)
      : `${prefix}c${caseIndex}`;
    // Cắt có thể tạo lại một khoá rỗng hoặc kết thúc bằng `-`; ép lại lần nữa.
    const fixed = candidate.replace(/^-+|-+$/g, '') || `${prefix}c${caseIndex}`;
    return CASE_KEY_REGEX.test(fixed) ? fixed : `${prefix}c${caseIndex}`;
  }

  /**
   * Bỏ dấu tiếng Việt, hạ chữ thường, mọi ký tự ngoài `[A-Za-z0-9_-]` thành
   * `-`, gộp `-` liên tiếp.
   */
  function slugify(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      // 'đ' KHÔNG tách được bằng NFD (nó là một chữ cái riêng, không phải d + dấu) — bỏ qua bước này thì
      // "đồ thị" thành "o-thi", mất hẳn một chữ.
      .replace(/đ/g, 'd')
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/-{2,}/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  /**
   * `group` khớp `rubric_criterion.test_group` của nhánh autograder, nên nó
   * là một KHOÁ nối chứ không phải nhãn hiển thị: cắt câm giữa chừng là
   * biến một nhóm thành một nhóm khác hẳn. Vì vậy chỉ có hai cách — giữ
   * nguyên, hoặc thay bằng `general`.
   */
  function groupFor(group: string): string {
    const trimmed = group.trim();
    if (trimmed === '' || trimmed.length > MAX_GROUP_LENGTH) {
      return 'general';
    }
    return trimmed;
  }
  ```

  The `CASE_KEY_REGEX` guard in `caseKeyFor` is belt-and-braces after the slice: it guarantees the function can never return a key the DB rejects, whatever the input.

  ```bash
  pnpm --filter api exec jest src/exam-authoring/authoring-bundle.spec.ts
  ```

  Expected: 9 passed.

- [ ] **Step 3: commit.**

  Title: `feat(authoring): làm phẳng testBundle của đề thành ca của gói test (hàm thuần)`

---

### Task 3: `adoptFromAuthoring` — carry the authored test bundle into the session

**Files:** `apps/api/src/grading/test-bundle/test-bundle.service.ts`, `apps/api/src/grading/grading.module.ts`, `apps/api/src/exam-authoring/attach-exam.service.ts`, `apps/api/test/exam-authoring-attach.e2e-spec.ts`, `apps/api/test/test-bundle.e2e-spec.ts` (all modify).

**Interfaces**
- Consumes: `flattenAuthoringCases(questions: GeneratedQuestion[]): AuthoringCase[]` (Task 2); the `attach` body from Task 1 (`createdMaterialId`, the `try`/`catch`).
- Produces: `BundleCaseInput { caseKey: string; group: string; input: string; expectedOutput: string; constraintQuote?: string | null }` (exported from `test-bundle.service.ts`); `TestBundleService.adoptFromAuthoring(examSessionId: string, teacherId: string, cases: BundleCaseInput[], sessionAlreadyPinned: boolean): Promise<{ id: string; version: number; approvedAt: string | null; pinned: boolean }>`; `TestBundleService.list()` rows gain `origin: 'teacher' | 'from_model_answer' | 'generated'`; `AttachResult.testBundle: { id: string; version: number; approvedAt: string | null; pinned: boolean } | null`.

The stub authoring provider (used whenever `NODE_ENV=test`) gives **every question 3 cases**: `rong` (group `bien`), `mot-phan-tu` (`bien`), `co-ban` (`co-ban`) — so a 1-question `examJson` yields 3 cases keyed `q1-rong`, `q1-mot-phan-tu`, `q1-co-ban`.

- [ ] **Step 1: RED — fix the one existing assertion this changes, then add the cases.**

  In `apps/api/test/test-bundle.e2e-spec.ts` replace exactly:

  ```ts
      expect(list.body).toEqual([
        { id: bundleId, version: 1, approvedAt: null, caseCount: 1 },
      ]);
  ```

  with:

  ```ts
      expect(list.body).toEqual([
        { id: bundleId, version: 1, approvedAt: null, origin: 'teacher', caseCount: 1 },
      ]);
  ```

  (`toEqual` is exact, so adding `origin` to `list()` would otherwise turn this red. This is a deliberate change of a stated shape, not a loosened assertion — record a `Ruling:` line.)

  In `apps/api/test/exam-authoring-attach.e2e-spec.ts` add the import `import { TestBundleService } from '../src/grading/test-bundle/test-bundle.service';`, then add these helpers next to `referenceOf`:

  ```ts
    async function bundlesOf(sessionId: string) {
      return dataSource.query(
        `SELECT id, version, origin, approved_by, approved_at
           FROM examcollect.grading_test_bundle WHERE exam_session_id = $1 ORDER BY version`,
        [sessionId],
      );
    }

    async function caseKeysOf(bundleId: string): Promise<string[]> {
      const rows: { case_key: string }[] = await dataSource.query(
        `SELECT case_key FROM examcollect.grading_test_case WHERE bundle_id = $1 ORDER BY case_key`,
        [bundleId],
      );
      return rows.map((r) => r.case_key);
    }

    function authoredCaseCount(json: string): number {
      const exam = JSON.parse(json) as { questions: { testBundle: unknown[] }[] };
      return exam.questions.reduce((n, q) => n + q.testBundle.length, 0);
    }

    /** Một đề tuỳ chỉnh — `parseExamJson` chấp nhận, nên dựng được tên ca mà stub không sinh. */
    function customExam(questions: { cases: { name: string; group: string }[] }[]): string {
      return JSON.stringify({
        title: 'Đề tuỳ chỉnh',
        language: 'python',
        verification: { status: 'unverified', reason: 'sandbox_unavailable' },
        questions: questions.map((q) => ({
          statement: 'Câu hỏi',
          modelAnswer: 'print(1)',
          topic: 'thử',
          points: 1,
          testBundle: q.cases.map((c) => ({ ...c, input: '1', expectedOutput: '1' })),
        })),
      });
    }
  ```

  and append these tests inside the `describe`:

  ```ts
    it('gắn đề sinh ra gói test đã duyệt và đã ghim, đúng số ca của đề', async () => {
      const sessionId = await makeSession(teacherToken, classId);

      const res = await attach(sessionId, examJson);
      expect(res.status).toBe(201);
      expect(authoredCaseCount(examJson)).toBe(3);

      const bundles = await bundlesOf(sessionId);
      expect(bundles).toHaveLength(1);
      expect(bundles[0].origin).toBe('generated');
      expect(bundles[0].approved_by).toBe(teacherId);
      expect(bundles[0].approved_at).not.toBeNull();
      expect(await caseKeysOf(bundles[0].id)).toEqual(['q1-co-ban', 'q1-mot-phan-tu', 'q1-rong']);

      const [pinned] = await dataSource.query(
        `SELECT test_bundle_id FROM examcollect.exam_session WHERE id = $1`,
        [sessionId],
      );
      expect(pinned.test_bundle_id).toBe(bundles[0].id);
      expect(res.body.testBundle).toEqual({
        id: bundles[0].id,
        version: 1,
        approvedAt: expect.any(String),
        pinned: true,
      });
    });

    // Review Focus #4. Lần gắn thứ hai KHÔNG được đè gói giảng viên đã chọn;
    // gói mới vẫn được tạo (lịch sử không mất) nhưng chưa duyệt.
    it('gắn lần hai không đè gói đã ghim, và gói mới chưa duyệt', async () => {
      const sessionId = await makeSession(teacherToken, classId);

      const first = await attach(sessionId, examJson);
      expect(first.status).toBe(201);
      const second = await attach(sessionId, examJson);
      expect(second.status).toBe(201);

      const bundles = await bundlesOf(sessionId);
      expect(bundles).toHaveLength(2);
      expect(bundles[1].approved_at).toBeNull();
      expect(second.body.testBundle.pinned).toBe(false);
      expect(second.body.testBundle.approvedAt).toBeNull();

      const [row] = await dataSource.query(
        `SELECT test_bundle_id FROM examcollect.exam_session WHERE id = $1`,
        [sessionId],
      );
      expect(row.test_bundle_id).toBe(first.body.testBundle.id);
    });

    // Review Focus #2 + #3, đầu-cuối: tên có dấu/dấu câu và tên trùng trong một
    // câu phải cho ra khoá hợp lệ DUY NHẤT, không phải một lỗi 500 từ DB.
    it('tên ca có dấu và tên trùng -> vẫn gắn được, khoá hợp lệ và duy nhất', async () => {
      const sessionId = await makeSession(teacherToken, classId);
      const json = customExam([
        {
          cases: [
            { name: 'Ca 1: cân bằng!', group: 'co-ban' },
            { name: 'x', group: 'co-ban' },
            { name: 'x', group: 'co-ban' },
          ],
        },
      ]);

      const res = await attach(sessionId, json);
      expect(res.status).toBe(201);
      expect(await caseKeysOf(res.body.testBundle.id)).toEqual(['q1-ca-1-can-bang', 'q1-x', 'q1-x-2']);
    });

    it('đề không sinh ca nào -> không tạo gói rỗng', async () => {
      const sessionId = await makeSession(teacherToken, classId);

      const res = await attach(sessionId, customExam([{ cases: [] }]));

      expect(res.status).toBe(201);
      expect(res.body.testBundle).toBeNull();
      expect(await bundlesOf(sessionId)).toHaveLength(0);
    });

    // Ghi nhận HÀNH VI ĐÃ CHỌN (Decisions to veto #3), không phải hành vi lý
    // tưởng: gói test là bước CUỐI, nên khi nó hỏng thì đề và đáp án — đã ghi
    // hợp lệ và đang được `grading_reference` giữ bằng FK RESTRICT — ở lại.
    it('gói test hỏng sau khi đề và đáp án đã ghi -> 500, đề và đáp án vẫn nằm đó', async () => {
      const sessionId = await makeSession(teacherToken, classId);

      const spy = jest
        .spyOn(app.get(TestBundleService), 'adoptFromAuthoring')
        .mockRejectedValueOnce(new Error('hỏng giả lập ở gói test'));
      try {
        expect((await attach(sessionId, examJson)).status).toBe(500);
      } finally {
        spy.mockRestore();
      }

      expect(await materialsOf(sessionId)).toHaveLength(1);
      expect(await referenceOf(sessionId)).toBeDefined();
      expect(await bundlesOf(sessionId)).toHaveLength(0);
    });
  ```

  ```bash
  pnpm --filter api exec jest --config ./test/jest-e2e.json test/exam-authoring-attach.e2e-spec.ts test/test-bundle.e2e-spec.ts
  ```

  Expected: RED — the five new attach cases fail (`res.body.testBundle` is `undefined`; `adoptFromAuthoring` does not exist so `jest.spyOn` throws) and the `test-bundle` list case fails on the missing `origin`.

- [ ] **Step 2: GREEN — `TestBundleService`.**

  In `apps/api/src/grading/test-bundle/test-bundle.service.ts` change line 3 from `import { DataSource } from 'typeorm';` to:

  ```ts
  import { DataSource, EntityManager } from 'typeorm';
  ```

  Add, directly under the imports (before the class doc comment):

  ```ts
  /**
   * Một ca sẵn sàng ghi. Kiểu CẤU TRÚC, không import từ `exam-authoring`:
   * `grading` không được biết `exam-authoring` (module kia import module này,
   * không có chiều ngược lại).
   */
  export interface BundleCaseInput {
    caseKey: string;
    group: string;
    input: string;
    expectedOutput: string;
    constraintQuote?: string | null;
  }
  ```

  Replace `create` (currently lines 18-39, from `  async create(` through its closing `  }`) with:

  ```ts
    async create(examSessionId: string, teacherId: string, dto: CreateTestBundleDto) {
      return this.ds.transaction(async (manager) => {
        const version = await this.nextVersion(manager, examSessionId);
        const [bundle] = await manager.query(
          `INSERT INTO examcollect.grading_test_bundle (exam_session_id, version, origin, created_by)
           VALUES ($1, $2, 'teacher', $3) RETURNING id, version`,
          [examSessionId, version, teacherId],
        );
        await this.insertCases(manager, bundle.id, dto.cases);
        return { id: bundle.id as string, version: bundle.version as number };
      });
    }

    /**
     * Nhận gói test mà luồng soạn đề ĐÃ sinh sẵn, vào đúng gói của phiên này.
     *
     * `origin='generated'` vì các ca do MÔ HÌNH viết, không phải giảng viên —
     * dù chính giảng viên đã đọc nó ở màn soạn đề. Cột `origin` trả lời "ai
     * viết ca", không phải "ai bấm nút".
     *
     * `sessionAlreadyPinned` là điều kiện DUY NHẤT quyết định có tự duyệt và
     * tự ghim không. Nó đọc `exam_session.test_bundle_id` chứ không đọc
     * `origin`, nên một gói giảng viên tự tay duyệt rồi ghim cũng chặn đúng —
     * đè lên nó là xoá mất lựa chọn họ đã cố ý làm.
     */
    async adoptFromAuthoring(
      examSessionId: string,
      teacherId: string,
      cases: BundleCaseInput[],
      sessionAlreadyPinned: boolean,
    ): Promise<{ id: string; version: number; approvedAt: string | null; pinned: boolean }> {
      return this.ds.transaction(async (manager) => {
        const version = await this.nextVersion(manager, examSessionId);
        const [bundle] = await manager.query(
          `INSERT INTO examcollect.grading_test_bundle (exam_session_id, version, origin, created_by)
           VALUES ($1, $2, 'generated', $3) RETURNING id, version`,
          [examSessionId, version, teacherId],
        );
        await this.insertCases(manager, bundle.id, cases);

        if (sessionAlreadyPinned) {
          return { id: bundle.id as string, version: bundle.version as number, approvedAt: null, pinned: false };
        }

        // Duyệt rồi ghim trong CÙNG transaction: ghim gói chưa duyệt thì
        // `pin` từ chối, và duyệt xong mà rollback thì để lại một gói đã
        // duyệt không ai dùng.
        const [approved] = await manager.query(
          `UPDATE examcollect.grading_test_bundle SET approved_by = $1, approved_at = now()
            WHERE id = $2 RETURNING approved_at`,
          [teacherId, bundle.id],
        );
        await manager.query(`UPDATE examcollect.exam_session SET test_bundle_id = $1 WHERE id = $2`, [
          bundle.id,
          examSessionId,
        ]);
        return {
          id: bundle.id as string,
          version: bundle.version as number,
          approvedAt: approved.approved_at as string,
          pinned: true,
        };
      });
    }
  ```

  Replace `list` (currently lines 70-80) with:

  ```ts
    async list(examSessionId: string) {
      const rows: { id: string; version: number; approved_at: string | null; origin: string; case_count: number }[] =
        await this.ds.query(
          `SELECT b.id, b.version, b.approved_at, b.origin, COUNT(c.id)::int AS case_count
             FROM examcollect.grading_test_bundle b
             LEFT JOIN examcollect.grading_test_case c ON c.bundle_id = b.id AND c.auto_dropped_reason IS NULL
            WHERE b.exam_session_id = $1
            GROUP BY b.id, b.version, b.approved_at, b.origin ORDER BY b.version DESC`,
          [examSessionId],
        );
      return rows.map((r) => ({
        id: r.id,
        version: r.version,
        approvedAt: r.approved_at,
        origin: r.origin,
        caseCount: r.case_count,
      }));
    }
  ```

  (`GROUP BY` gains the newly selected columns — Postgres rejects an ungrouped non-aggregate.) Insert the two private helpers immediately before the line `  /** Gói phải thuộc ĐÚNG phiên được truyền vào (Review Focus #3). */`:

  ```ts
    /**
     * Số phiên bản kế tiếp, đọc BÊN TRONG transaction cùng lúc với `INSERT`:
     * `uq_grading_test_bundle_version` là UNIQUE nên hai lần tạo song song
     * (bấm hai lần) sẽ đụng nhau nếu đọc `MAX(version)` bên ngoài.
     */
    private async nextVersion(manager: EntityManager, examSessionId: string): Promise<number> {
      const [{ next_version }] = await manager.query(
        `SELECT COALESCE(MAX(version), 0) + 1 AS next_version
           FROM examcollect.grading_test_bundle WHERE exam_session_id = $1`,
        [examSessionId],
      );
      return next_version as number;
    }

    /** `constraint_quote` vắng khi tạo tay và khi nhận từ Soạn đề (đề sinh không kèm trích dẫn). */
    private async insertCases(manager: EntityManager, bundleId: string, cases: BundleCaseInput[]): Promise<void> {
      for (const c of cases) {
        await manager.query(
          `INSERT INTO examcollect.grading_test_case (bundle_id, case_key, "group", input, expected_output, constraint_quote)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [bundleId, c.caseKey, c.group, c.input, c.expectedOutput, c.constraintQuote ?? null],
        );
      }
    }
  ```

- [ ] **Step 3: GREEN — export `TestBundleService`.** In `apps/api/src/grading/grading.module.ts` change line 188 from

  ```ts
  exports: [GradingService, GradingRunService, GradingReferenceService, RubricService, ScoreService],
  ```

  to

  ```ts
  exports: [GradingService, GradingRunService, GradingReferenceService, RubricService, ScoreService, TestBundleService],
  ```

  `ExamAuthoringModule` already imports `GradingModule` (its own comment at `exam-authoring.module.ts:51` guarantees no cycle). Do not touch `exam-authoring.module.ts`.

- [ ] **Step 4: GREEN — wire it into `AttachExamService`.**

  Add imports:

  ```ts
  import { TestBundleService } from "../grading/test-bundle/test-bundle.service";
  import { flattenAuthoringCases } from "./authoring-bundle";
  ```

  Replace the `AttachResult` interface (currently lines 61-65) with:

  ```ts
  export interface AttachResult {
    examMaterialId: string;
    paperFilename: string;
    answerKeyFilename: string;
    /**
     * Gói test lấy từ chính đề vừa soạn; `null` khi đề không sinh ca nào.
     * `grading-run.service.ts` chặn bắt đầu chấm khi phiên có bài code mà chưa
     * ghim gói test — nên đây là điều kiện để phiên đó chấm được, không phải
     * tiện lợi.
     */
    testBundle: { id: string; version: number; approvedAt: string | null; pinned: boolean } | null;
  }
  ```

  Add the dependency as the last constructor parameter (after `private readonly storage: StorageService,`): `    private readonly bundles: TestBundleService,`.

  In the `attach` body (Task 1's text) replace exactly:

  ```ts
      // Chặng đã qua quyết định cách dọn khi hỏng — xem `catch`.
      let createdMaterialId: string | null = null;
      try {
  ```

  with:

  ```ts
      // Chặng đã qua quyết định cách dọn khi hỏng — xem `catch`.
      let createdMaterialId: string | null = null;
      let referenceWritten = false;
      try {
  ```

  Replace exactly:

  ```ts
          teacherId,
          'authoring',
        );

        return {
          examMaterialId: material.id,
          paperFilename: PAPER_FILENAME,
          answerKeyFilename: ANSWER_KEY_FILENAME,
        };
      } catch (error) {
  ```

  with:

  ```ts
          teacherId,
          'authoring',
        );
        referenceWritten = true;

        // Gói test là bước CUỐI, có chủ ý: đặt trước `upsert` thì một lần gắn
        // hỏng ở `upsert` vẫn để lại gói đã GHIM — phiên bị đóng dấu bằng thước
        // của một lượt gắn thất bại, tệ hơn một đề thiếu thước.
        const authoredCases = flattenAuthoringCases(exam.questions);
        const testBundle =
          authoredCases.length > 0
            ? await this.bundles.adoptFromAuthoring(
                session.id,
                teacherId,
                authoredCases,
                session.testBundleId !== null,
              )
            : null;

        return {
          examMaterialId: material.id,
          paperFilename: PAPER_FILENAME,
          answerKeyFilename: ANSWER_KEY_FILENAME,
          testBundle,
        };
      } catch (error) {
        if (referenceWritten) {
          // Đề và đáp án đã ghi hợp lệ, và `grading_reference` đang giữ
          // material bằng FK RESTRICT nên `materials.remove` sẽ từ chối. Chỉ
          // gói test thiếu — nói thẳng thay vì dọn dở.
          this.logger.error(
            `Gắn đề vào phiên ${session.id}: đề và đáp án đã ghi nhưng gói test hỏng — phiên chưa có thước từ đề này`,
            error instanceof Error ? error.stack : String(error),
          );
          throw error;
        }
  ```

  `session.testBundleId` is the column on `ExamSessionEntity` (`exam-session.entity.ts:255`), loaded by `findEntityForOwner`.

- [ ] **Step 5: GREEN.**

  ```bash
  pnpm --filter api exec jest --config ./test/jest-e2e.json test/exam-authoring-attach.e2e-spec.ts test/test-bundle.e2e-spec.ts
  pnpm --filter api exec tsc --noEmit
  pnpm check:cycles
  ```

  Expected: attach **14 passed** (9 from Task 1 + 5), `test-bundle` all green with the corrected `toEqual`; `tsc` clean; `0 vòng lặp`.

- [ ] **Step 6: `detect_changes` and commit.** Title: `feat(attach): mang gói test của đề vào phiên, tự duyệt và ghim khi phiên chưa chọn thước`.

---

### Task 4: `model_answer_set_at` — when the answer was actually set

**Files:** create `apps/api/src/database/migrations/1789500000000-AddModelAnswerSetAt.ts`; modify `apps/api/src/grading/entities/grading-reference.entity.ts`, `apps/api/src/grading/grading-reference.service.ts`, `apps/api/test/grading-reference.e2e-spec.ts`.

**Interfaces**
- Consumes: `GradingReferenceService.upsert` (its `answerSent` / `hasAnswer` locals).
- Produces: `GradingReferenceEntity.modelAnswerSetAt: Date | null`, set by `upsert` in lockstep with `modelAnswerOrigin`.

Semantics, so nobody re-derives them wrongly: `upsert` treats a **note as part of the answer** (`answerSent = storageKey !== undefined || note !== undefined`), so writing a note moves this column. What it must not move on is a write that carries **no answer** — chiefly re-choosing the question file.

- [ ] **Step 1: RED — the e2e cases.** In `apps/api/test/grading-reference.e2e-spec.ts` add the helpers next to `readiness(...)` (line 144):

  ```ts
    async function referenceRow(sessionId: string): Promise<{ model_answer_set_at: Date | null }> {
      const [row] = await dataSource.query(
        `SELECT model_answer_set_at FROM examcollect.grading_reference WHERE exam_session_id = $1`,
        [sessionId],
      );
      return row;
    }
    const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  ```

  and inside the top-level `describe` append (`seedSession()`, `setReference()` are the file's own helpers; `session.materialId` is the seeded `DeThi.pdf`):

  ```ts
    it('viết đáp án (ghi chú) -> model_answer_set_at có giá trị', async () => {
      const session = await seedSession();
      await setReference(session.id, { modelAnswerNote: 'chấp nhận cách A' }).expect(200);

      expect((await referenceRow(session.id)).model_answer_set_at).not.toBeNull();
    });

    // Review Focus #5 (nửa thứ nhất): chọn lại ĐỀ BÀI không phải là ghi đáp án,
    // nên dấu thời gian của đáp án đứng yên — đây là thứ `updated_at` không làm được.
    it('chỉ chọn lại đề bài -> model_answer_set_at đứng yên', async () => {
      const session = await seedSession();
      await setReference(session.id, { modelAnswerNote: 'A' }).expect(200);
      const before = await referenceRow(session.id);

      await pause(30);
      await setReference(session.id, { questionMaterialId: session.materialId }).expect(200);

      const after = await referenceRow(session.id);
      expect(after.model_answer_set_at!.getTime()).toBe(before.model_answer_set_at!.getTime());
    });

    // Review Focus #5 (nửa thứ hai): ghi chú LÀ một dạng đáp án.
    it('viết lại ghi chú -> model_answer_set_at đi tiếp', async () => {
      const session = await seedSession();
      await setReference(session.id, { modelAnswerNote: 'A' }).expect(200);
      const before = await referenceRow(session.id);

      await pause(30);
      await setReference(session.id, { modelAnswerNote: 'B' }).expect(200);

      const after = await referenceRow(session.id);
      expect(after.model_answer_set_at!.getTime()).toBeGreaterThan(before.model_answer_set_at!.getTime());
    });

    it('bỏ đáp án (gửi null) -> model_answer_set_at về NULL', async () => {
      const session = await seedSession();
      await setReference(session.id, { modelAnswerNote: 'sẽ bỏ' }).expect(200);

      await setReference(session.id, { modelAnswerNote: null }).expect(200);

      expect((await referenceRow(session.id)).model_answer_set_at).toBeNull();
    });
  ```

  ```bash
  pnpm --filter api exec jest --config ./test/jest-e2e.json test/grading-reference.e2e-spec.ts
  ```

  Expected: RED — `column "model_answer_set_at" does not exist`.

- [ ] **Step 2: Migration.** Create `apps/api/src/database/migrations/1789500000000-AddModelAnswerSetAt.ts`:

  ```ts
  import { MigrationInterface, QueryRunner } from 'typeorm';

  /**
   * Lúc đáp án mẫu được ĐẶT — một cột riêng, không dùng `updated_at`.
   *
   * `grading_reference` là bảng MỘT DÒNG mỗi phiên và `upsert` là UPDATE trên
   * chính dòng đó, nên `updated_at` đổi cả khi giảng viên chỉ chọn lại đề bài.
   * Dòng nguồn của đáp án sẽ khi ấy nói "bạn tải lên lúc 16:40" cho một lần
   * chọn đề lúc 16:40. (Ghi chú thì KHÁC: nó là một dạng đáp án, nên viết ghi
   * chú có đổi cột này — cùng nhịp với `model_answer_origin`.)
   *
   * Một cột, một câu lệnh, không index: mỗi phiên một dòng, ghi vài lần.
   */
  export class AddModelAnswerSetAt1789500000000 implements MigrationInterface {
    name = 'AddModelAnswerSetAt1789500000000';

    public async up(q: QueryRunner): Promise<void> {
      await q.query(`ALTER TABLE "examcollect"."grading_reference" ADD COLUMN "model_answer_set_at" timestamptz NULL`);
    }

    public async down(q: QueryRunner): Promise<void> {
      await q.query(`ALTER TABLE "examcollect"."grading_reference" DROP COLUMN "model_answer_set_at"`);
    }
  }
  ```

  Run it against **this package's** database (`.env.test` value, never `apps/api/.env`):

  ```bash
  DATABASE_URL="<the DATABASE_URL line from apps/api/.env.test>" DATABASE_SSL=false pnpm --filter api migration:run
  ```

- [ ] **Step 3: GREEN — entity and `upsert`.** In `grading-reference.entity.ts` insert after the `modelAnswerOrigin` property:

  ```ts
    /**
     * LÚC ĐÁP ÁN MẪU ĐƯỢC ĐẶT — khác `updated_at` có chủ đích: `updated_at` cũng
     * đổi khi chỉ chọn lại đề bài. Cột này đổi ở đúng lúc khoá đáp án hoặc ghi
     * chú được gửi lên, cùng nhịp với `modelAnswerOrigin` ở `upsert`.
     */
    @Column({ name: 'model_answer_set_at', type: 'timestamptz', nullable: true })
    modelAnswerSetAt!: Date | null;
  ```

  In `grading-reference.service.ts` replace exactly

  ```ts
      row.modelAnswerOrigin = !hasAnswer ? null : answerSent ? origin : (existing?.modelAnswerOrigin ?? origin);
      return this.references.save(row);
  ```

  with

  ```ts
      row.modelAnswerOrigin = !hasAnswer ? null : answerSent ? origin : (existing?.modelAnswerOrigin ?? origin);
      // Dấu thời gian đi CÙNG nhịp với nguồn gốc: cả hai trả lời "đáp án của bản ghi này đến từ đâu, từ lúc nào".
      row.modelAnswerSetAt = !hasAnswer ? null : answerSent ? new Date() : (existing?.modelAnswerSetAt ?? new Date());
      return this.references.save(row);
  ```

  ```bash
  pnpm --filter api exec jest --config ./test/jest-e2e.json test/grading-reference.e2e-spec.ts
  pnpm --filter api exec jest src/grading
  pnpm --filter api exec tsc --noEmit
  ```

  Expected: green; the unit run and `tsc` show no regression (an entity literal typed as `GradingReferenceEntity` somewhere would now miss the field — fix the literal, do not make the property optional).

- [ ] **Step 4: commit.** Title: `feat(grading-reference): cột model_answer_set_at để dòng nguồn nói đúng lúc đặt đáp án`.

---

### Task 5: `readiness.sources` — say where each piece of grading material came from

**Files:** `apps/api/src/grading/grading-reference.service.ts` (modify), `apps/api/test/grading-reference.e2e-spec.ts`, `apps/api/test/exam-authoring-attach.e2e-spec.ts` (modify).

**Interfaces**
- Consumes: `GradingReferenceEntity.modelAnswerSetAt` (Task 4); the `questionMaterial` relation (`ExamMaterialEntity.fileName`, `.uploadedAt`).
- Produces: `GradingSourceInfo { present: boolean; kind: 'teacher_upload' | 'authoring'; fileName: string | null; setAt: string | null }`; `GradingReadiness.sources: { question: GradingSourceInfo; modelAnswer: GradingSourceInfo & { unverified: boolean } }`.

- [ ] **Step 1: RED.** In `test/grading-reference.e2e-spec.ts` append inside the top-level `describe`:

  ```ts
    it('sources: phiên chưa có tài liệu -> cả hai đều không có mặt', async () => {
      const session = await seedSession();

      const res = await readiness(session.id).expect(200);

      expect(res.body.sources.question).toEqual({ present: false, kind: 'teacher_upload', fileName: null, setAt: null });
      expect(res.body.sources.modelAnswer).toEqual({
        present: false,
        kind: 'teacher_upload',
        fileName: null,
        setAt: null,
        unverified: false,
      });
    });

    it('sources: đề giảng viên tải lên -> tên file và mốc tải lên', async () => {
      const session = await seedSession();
      await setReference(session.id, { questionMaterialId: session.materialId }).expect(200);

      const res = await readiness(session.id).expect(200);

      expect(res.body.sources.question).toEqual({
        present: true,
        kind: 'teacher_upload',
        fileName: 'DeThi.pdf',
        setAt: expect.any(String),
      });
    });

    it('sources: đáp án ghi tay -> tự khai, không có tên file, không mang cờ chưa kiểm chứng', async () => {
      const session = await seedSession();
      await setReference(session.id, { modelAnswerNote: 'chấp nhận cả quy hoạch động' }).expect(200);

      const res = await readiness(session.id).expect(200);

      expect(res.body.sources.modelAnswer).toEqual({
        present: true,
        kind: 'teacher_upload',
        fileName: null,
        setAt: expect.any(String),
        unverified: false,
      });
    });
  ```

  and in `test/exam-authoring-attach.e2e-spec.ts` append:

  ```ts
    it('sau khi gắn từ Soạn đề, readiness nói nguồn là Soạn đề và đáp án chưa kiểm chứng', async () => {
      const sessionId = await makeSession(teacherToken, classId);
      expect((await attach(sessionId, examJson)).status).toBe(201);

      const res = await request(app.getHttpServer())
        .get(`/exam-sessions/${sessionId}/grading-readiness`)
        .set('Authorization', `Bearer ${teacherToken}`);

      expect(res.status).toBe(200);
      expect(res.body.sources.modelAnswer).toEqual({
        present: true,
        kind: 'authoring',
        fileName: 'dap-an-va-test.docx',
        setAt: expect.any(String),
        unverified: true,
      });
      expect(res.body.sources.question.fileName).toBe('de-thi.docx');
    });
  ```

  ```bash
  pnpm --filter api exec jest --config ./test/jest-e2e.json test/grading-reference.e2e-spec.ts test/exam-authoring-attach.e2e-spec.ts
  ```

  Expected: RED — `res.body.sources` is `undefined`.

- [ ] **Step 2: GREEN.** In `grading-reference.service.ts` add after `GradingReadiness` (lines 22-28), and extend the interface:

  ```ts
  /**
   * Một tài liệu chấm và nó đến từ đâu. `present: false` thì UI bỏ cả dòng —
   * không có tài liệu thì không có nguồn để nói.
   */
  export interface GradingSourceInfo {
    present: boolean;
    /**
     * `teacher_upload` = giảng viên tự đưa vào (kể cả một câu ghi chú).
     * `authoring` = do luồng soạn đề sinh ra rồi gắn vào (cả `origin='generated'`:
     * mô hình viết, không phải tay giảng viên — đó là điều màn này cần nói).
     */
    kind: 'teacher_upload' | 'authoring';
    fileName: string | null;
    /** ISO-8601, hoặc `null` khi không đo được. */
    setAt: string | null;
  }
  ```

  ```ts
  export interface GradingReadiness {
    level: GradingReadinessLevel;
    /** `null` khi đủ tài liệu. Chuỗi này để UI hiện nguyên văn. */
    warning: string | null;
    hasQuestion: boolean;
    hasModelAnswer: boolean;
    sources: {
      question: GradingSourceInfo;
      modelAnswer: GradingSourceInfo & { unverified: boolean };
    };
  }
  ```

  Replace the whole `readiness` method (currently lines 184-208, `async readiness(examSessionId: string): Promise<GradingReadiness> {` through its closing `  }`) with:

  ```ts
    async readiness(examSessionId: string): Promise<GradingReadiness> {
      // `relations`: dòng nguồn của ĐỀ cần tên file và lúc tải lên, mà cả hai nằm ở `exam_material`.
      const row = await this.references.findOne({
        where: { examSessionId },
        relations: { questionMaterial: true },
      });
      const hasQuestion = Boolean(row?.questionMaterialId);
      const hasModelAnswer = Boolean(row?.modelAnswerStorageKey || row?.modelAnswerNote);
      const sources: GradingReadiness['sources'] = {
        question: {
          present: hasQuestion,
          // Đề luôn do giảng viên tự tải lên: `ExamMaterialService.requestUpload` là đường duy nhất tạo `exam_material`.
          kind: 'teacher_upload',
          fileName: row?.questionMaterial?.fileName ?? null,
          setAt: row?.questionMaterial?.uploadedAt?.toISOString() ?? null,
        },
        modelAnswer: {
          present: hasModelAnswer,
          // `'generated'` cũng là "không phải tay giảng viên" — chưa có đường nào đặt nó, nhưng khi có thì đọc vẫn đúng.
          kind:
            row?.modelAnswerOrigin === 'authoring' || row?.modelAnswerOrigin === 'generated'
              ? 'authoring'
              : 'teacher_upload',
          fileName: row?.modelAnswerFilename ?? null,
          setAt: row?.modelAnswerSetAt?.toISOString() ?? null,
          unverified: row?.modelAnswerUnverified ?? false,
        },
      };

      if (!hasQuestion) {
        return {
          level: 'rubric_only',
          hasQuestion,
          hasModelAnswer,
          sources,
          warning:
            'Chưa chọn đề bài — AI chỉ đối chiếu rubric và KHÔNG phát hiện được ' +
            'bài làm đúng theo hướng khác.',
        };
      }
      if (!hasModelAnswer) {
        return {
          level: 'with_question',
          hasQuestion,
          hasModelAnswer,
          sources,
          warning: 'Chưa có đáp án mẫu — AI đánh giá theo đề, chưa biết cách chấm của thầy.',
        };
      }
      return { level: 'with_model_answer', hasQuestion, hasModelAnswer, sources, warning: null };
    }
  ```

  `kind` for an answer row whose `origin` is `NULL` (rows from before the column existed) reads `teacher_upload` — the only reading that does not accuse the system of writing something it did not.

  ```bash
  pnpm --filter api exec jest --config ./test/jest-e2e.json test/grading-reference.e2e-spec.ts test/exam-authoring-attach.e2e-spec.ts
  pnpm --filter api exec tsc --noEmit
  ```

  Expected: green.

- [ ] **Step 3: commit.** Title: `feat(grading-readiness): khối sources nói nguồn và mốc thời gian của từng tài liệu chấm`.

---

### Task 6: `constraintQuote` in `get`, and "drop this case" as a new version

**Files:** create `apps/api/src/grading/test-bundle/dto/drop-test-case.dto.ts`; modify `apps/api/src/grading/test-bundle/test-bundle.service.ts`, `apps/api/src/grading/test-bundle/test-bundle.controller.ts`, `apps/api/test/test-bundle.e2e-spec.ts`.

**Interfaces**
- Consumes: `findOwnedBundle`, `nextVersion`, `insertCases`, `BundleCaseInput` (Task 3).
- Produces: `TestBundleService.dropCase(examSessionId, bundleId, caseKey): Promise<{ id: string; version: number }>`; `TestBundleService.get` cases gain `constraintQuote: string | null`; `POST exam-sessions/:id/test-bundles/:bundleId/drop-case` body `{ caseKey }` → 201 `{ id, version }`.

- [ ] **Step 1: RED.** In `apps/api/test/test-bundle.e2e-spec.ts` replace exactly

  ```ts
        cases: [
          { caseKey: 'ca1', group: 'public', input: '1\n', expectedOutput: '1\n', autoDroppedReason: null },
        ],
  ```

  with

  ```ts
        cases: [
          { caseKey: 'ca1', group: 'public', input: '1\n', expectedOutput: '1\n', constraintQuote: null, autoDroppedReason: null },
        ],
  ```

  (again a deliberate shape change to an exact `toEqual`; record a `Ruling:` line). Then append inside the `describe` (helpers `login`, `as`, `seedSession` are the file's own; the file's tests build sessions with `seedSession(ds, '<label>', { teacherId, deliverableType: 'code_project', language: 'cpp' })` and read `.sessionId`):

  ```ts
    async function makeBundle(token: string, sessionId: string, cases: object[]) {
      const res = await request(app.getHttpServer())
        .post(`/exam-sessions/${sessionId}/test-bundles`)
        .set(as(token))
        .send({ cases });
      expect(res.status).toBe(201);
      return res.body as { id: string; version: number };
    }
    const two = [
      { caseKey: 'ca1', group: 'public', input: '1\n', expectedOutput: '1\n', constraintQuote: 'Cho 1 ≤ n ≤ 100' },
      { caseKey: 'ca2', group: 'public', input: '2\n', expectedOutput: '2\n' },
    ];

    it('get trả constraintQuote khi giảng viên đã trích, và null khi không', async () => {
      const owner = await login('d1');
      const session = await seedSession(ds, 'bundle-d1', { teacherId: owner.id, deliverableType: 'code_project', language: 'cpp' });
      const bundle = await makeBundle(owner.token, session.sessionId, two);

      const res = await request(app.getHttpServer())
        .get(`/exam-sessions/${session.sessionId}/test-bundles/${bundle.id}`)
        .set(as(owner.token));

      expect(res.status).toBe(200);
      expect(res.body.cases.map((c: { caseKey: string; constraintQuote: string | null }) => [c.caseKey, c.constraintQuote])).toEqual([
        ['ca1', 'Cho 1 ≤ n ≤ 100'],
        ['ca2', null],
      ]);
    });

    it('bỏ ca khỏi gói chưa duyệt -> sinh phiên bản mới, đủ ca trừ một, giữ nguyên origin', async () => {
      const owner = await login('d2');
      const session = await seedSession(ds, 'bundle-d2', { teacherId: owner.id, deliverableType: 'code_project', language: 'cpp' });
      const bundle = await makeBundle(owner.token, session.sessionId, two);

      const res = await request(app.getHttpServer())
        .post(`/exam-sessions/${session.sessionId}/test-bundles/${bundle.id}/drop-case`)
        .set(as(owner.token))
        .send({ caseKey: 'ca2' });

      expect(res.status).toBe(201);
      expect(res.body.version).toBe(bundle.version + 1);
      const detail = await request(app.getHttpServer())
        .get(`/exam-sessions/${session.sessionId}/test-bundles/${res.body.id}`)
        .set(as(owner.token));
      expect(detail.body.cases.map((c: { caseKey: string }) => c.caseKey)).toEqual(['ca1']);
      expect(detail.body.approvedAt).toBeNull();
      // Gói cũ còn nguyên: bảng là append-only, "bỏ" là phiên bản mới.
      const list = await request(app.getHttpServer())
        .get(`/exam-sessions/${session.sessionId}/test-bundles`)
        .set(as(owner.token));
      expect(list.body.map((b: { id: string; origin: string }) => [b.id, b.origin]).sort()).toEqual(
        [[bundle.id, 'teacher'], [res.body.id, 'teacher']].sort(),
      );
    });

    // Review Focus #6: duyệt là lúc giảng viên đứng ra bảo lưng nội dung gói.
    it('bỏ ca khỏi gói ĐÃ duyệt -> 409, không sinh phiên bản', async () => {
      const owner = await login('d3');
      const session = await seedSession(ds, 'bundle-d3', { teacherId: owner.id, deliverableType: 'code_project', language: 'cpp' });
      const bundle = await makeBundle(owner.token, session.sessionId, two);
      await request(app.getHttpServer())
        .post(`/exam-sessions/${session.sessionId}/test-bundles/${bundle.id}/approve`)
        .set(as(owner.token))
        .expect(201);

      const res = await request(app.getHttpServer())
        .post(`/exam-sessions/${session.sessionId}/test-bundles/${bundle.id}/drop-case`)
        .set(as(owner.token))
        .send({ caseKey: 'ca1' });

      expect(res.status).toBe(409);
      expect(res.body.message).toContain('đã được duyệt');
      const list = await request(app.getHttpServer())
        .get(`/exam-sessions/${session.sessionId}/test-bundles`)
        .set(as(owner.token));
      expect(list.body).toHaveLength(1);
    });

    it('bỏ một ca không thuộc gói -> 404', async () => {
      const owner = await login('d4');
      const session = await seedSession(ds, 'bundle-d4', { teacherId: owner.id, deliverableType: 'code_project', language: 'cpp' });
      const bundle = await makeBundle(owner.token, session.sessionId, two);

      const res = await request(app.getHttpServer())
        .post(`/exam-sessions/${session.sessionId}/test-bundles/${bundle.id}/drop-case`)
        .set(as(owner.token))
        .send({ caseKey: 'khong_ton_tai' });

      expect(res.status).toBe(404);
    });

    it('bỏ ca của gói thuộc phiên KHÁC -> 404, và caseKey sai khuôn -> 400', async () => {
      const owner = await login('d5');
      const sessionA = await seedSession(ds, 'bundle-d5a', { teacherId: owner.id, deliverableType: 'code_project', language: 'cpp' });
      const sessionB = await seedSession(ds, 'bundle-d5b', { teacherId: owner.id, deliverableType: 'code_project', language: 'cpp', startHoursAgo: 10 });
      const bundle = await makeBundle(owner.token, sessionA.sessionId, two);

      const other = await request(app.getHttpServer())
        .post(`/exam-sessions/${sessionB.sessionId}/test-bundles/${bundle.id}/drop-case`)
        .set(as(owner.token))
        .send({ caseKey: 'ca1' });
      expect(other.status).toBe(404);

      const bad = await request(app.getHttpServer())
        .post(`/exam-sessions/${sessionA.sessionId}/test-bundles/${bundle.id}/drop-case`)
        .set(as(owner.token))
        .send({ caseKey: 'có dấu cách' });
      expect(bad.status).toBe(400);
    });
  ```

  ```bash
  pnpm --filter api exec jest --config ./test/jest-e2e.json test/test-bundle.e2e-spec.ts
  ```

  Expected: RED — the corrected `detail` assertion fails on the missing `constraintQuote`, and every `drop-case` call returns 404 (no such route).

- [ ] **Step 2: GREEN — the DTO.** Create `apps/api/src/grading/test-bundle/dto/drop-test-case.dto.ts`:

  ```ts
  import { IsString, Matches } from 'class-validator';
  import { CASE_KEY_REGEX } from './create-test-bundle.dto';

  /**
   * `case_key` là khoá của `grading_test_case`, không phải tên tự do — dùng
   * CHÍNH regex mà `TestCaseDto` và `CHECK` của DB dùng, để ba nơi không lệch
   * nhau. Không có nó, một `caseKey` rác đi thẳng vào `WHERE` và ra 404 với
   * thông báo sai nguyên nhân.
   */
  export class DropTestCaseDto {
    @IsString()
    @Matches(CASE_KEY_REGEX, { message: 'caseKey chỉ gồm chữ, số, "_", "-", tối đa 64 ký tự' })
    caseKey!: string;
  }
  ```

- [ ] **Step 3: GREEN — `dropCase` and `get` in the service.** In `test-bundle.service.ts` extend `findOwnedBundle`'s SELECT (currently `SELECT id, version, approved_at FROM examcollect.grading_test_bundle`) to:

  ```ts
      `SELECT id, version, origin, created_by, approved_at FROM examcollect.grading_test_bundle
        WHERE id = $1 AND exam_session_id = $2`,
  ```

  Insert after `pin` (which ends `return { testBundleId: bundleId };\n  }`):

  ```ts
    /**
     * Bỏ một ca khỏi gói — bằng cách tạo PHIÊN BẢN MỚI không chép ca đó.
     *
     * Không có đường nào khác: `grading_test_case` mang `guard_append_only` trên
     * UPDATE **và** DELETE, và đó là chủ ý — một `score_computation` đã ghi
     * `test_bundle_id` phải đọc lại được đúng những ca nó đã đo.
     *
     * Gói đã duyệt thì từ chối: duyệt là lúc giảng viên bảo lưng nội dung, và
     * đổi nó sau đó là đổi thước dưới chân những bài đã chấm.
     */
    async dropCase(examSessionId: string, bundleId: string, caseKey: string) {
      const bundle = await this.findOwnedBundle(examSessionId, bundleId);
      if (bundle.approved_at) {
        throw new ConflictException(
          `Gói test ${bundleId} đã được duyệt lúc ${bundle.approved_at} — không bỏ ca được nữa. ` +
            'Hãy tạo một gói mới chỉ với những ca bạn còn giữ.',
        );
      }

      return this.ds.transaction(async (manager) => {
        const rows: { case_key: string; group: string; input: string; expected_output: string; constraint_quote: string | null }[] =
          await manager.query(
            `SELECT case_key, "group", input, expected_output, constraint_quote
               FROM examcollect.grading_test_case WHERE bundle_id = $1 ORDER BY case_key`,
            [bundleId],
          );
        const kept = rows.filter((r) => r.case_key !== caseKey);
        if (kept.length === rows.length) {
          // "Không có ca đó" khác "bỏ được rồi": giảng viên cần biết là cái nào.
          throw new NotFoundException(`Gói test ${bundleId} không có ca nào tên "${caseKey}".`);
        }

        const version = await this.nextVersion(manager, examSessionId);
        const [next] = await manager.query(
          `INSERT INTO examcollect.grading_test_bundle (exam_session_id, version, origin, created_by)
           VALUES ($1, $2, $3, $4) RETURNING id, version`,
          [examSessionId, version, bundle.origin, bundle.created_by],
        );
        await this.insertCases(
          manager,
          next.id,
          kept.map((r) => ({
            caseKey: r.case_key,
            group: r.group,
            input: r.input,
            expectedOutput: r.expected_output,
            constraintQuote: r.constraint_quote,
          })),
        );
        return { id: next.id as string, version: next.version as number };
      });
    }
  ```

  Change `get`'s query and mapping (currently lines 84-101): the row type gains `constraint_quote: string | null`, the SELECT becomes

  ```ts
        `SELECT case_key, "group", input, expected_output, constraint_quote, auto_dropped_reason
           FROM examcollect.grading_test_case WHERE bundle_id = $1 ORDER BY case_key`,
  ```

  and the mapped object gains `constraintQuote: r.constraint_quote,` between `expectedOutput` and `autoDroppedReason`.

- [ ] **Step 4: GREEN — the route.** In `test-bundle.controller.ts` add `import { DropTestCaseDto } from './dto/drop-test-case.dto';` and, after the `pin` handler:

  ```ts
    @Post('exam-sessions/:id/test-bundles/:bundleId/drop-case')
    @Roles('teacher')
    @HttpCode(201)
    async dropCase(
      @Param('id', ParseUUIDPipe) id: string,
      @Param('bundleId', ParseUUIDPipe) bundleId: string,
      @Body() dto: DropTestCaseDto,
      @Req() req: Request,
    ) {
      const session = await this.examSessions.findEntityForOwner(id, req.user!.sub);
      return this.bundles.dropCase(session.id, bundleId, dto.caseKey);
    }
  ```

  ```bash
  pnpm --filter api exec jest --config ./test/jest-e2e.json test/test-bundle.e2e-spec.ts
  pnpm --filter api exec tsc --noEmit
  pnpm check:cycles
  ```

  Expected: green (5 new + the existing 5), `tsc` clean, `0 vòng lặp`.

- [ ] **Step 5: commit.** Title: `feat(test-bundle): get trả constraint_quote và bỏ ca bằng phiên bản gói mới`.

---

### Task 7: regenerate the OpenAPI schema and mirror the types on the web

**Files:** `packages/shared/src/api/schema.d.ts` (regenerate), `apps/web/src/lib/api/grading.ts` (modify), `apps/web/src/lib/api/test-bundle.ts` (modify).

**Interfaces**
- Consumes: `GradingSourceInfo` (Task 5); `TestBundleService.list` rows with `origin` (Task 3); the `drop-case` route and `constraintQuote` (Task 6).
- Produces: web-side `GradingSourceInfo`; `GradingReadiness.sources?`; `TestBundleSummary.origin`.

- [ ] **Step 1: Build and run the API, then regenerate.**

  Run this only **after Task 6**: Task 8 calls `apiClient.POST('/exam-sessions/{id}/test-bundles/{bundleId}/drop-case')`, which only typechecks once that route is in the generated schema.

  The schema is generated from a **running** API (`packages/shared/scripts/generate-api-client.mjs` fetches `API_URL`, default `http://localhost:4000/api-docs-json`), so it must be this package's own server on port 4002, started from `.env.test` — **never** a bare `node -r dotenv/config …`, which would load `apps/api/.env` and connect to the remote Supabase database.

  ```bash
  cd "C:/Users/Admin/Main/Desktop/HKI 2026-2027/KLTN/CINE/.claude/worktrees/grading-g2-ruler/apps/api"
  pnpm build
  PORT=4002 DOTENV_CONFIG_PATH=.env.test node -r dotenv/config dist/src/main.js   # run in the background
  until [ "$(curl -s -o /dev/null -w '%{http_code}' http://localhost:4002/api-docs-json)" = "200" ]; do sleep 2; done
  cd ../../packages/shared && API_URL=http://localhost:4002/api-docs-json pnpm generate:api-client
  ```

  Expected: `Wrote packages/shared/src/api/schema.d.ts`. Stop the server afterwards (`TaskStop`). The startup command is the one recorded and tried in `docs/superpowers/plans/2026-09-29-g2-g5-parallel-execution.md` §2.

  If the swagger output cannot express `sources` (it is built from an interface the controller does not annotate), keep the **web-side mirror types** in `lib/api/grading.ts` as the source of truth for the UI, and record in a `Ruling:` line that the generated schema types this field as `Record<string, never>` — the same situation G1 hit for `RequiredDeliverableResponseDto.pipeline`.

- [ ] **Step 2: Mirror the types on the web.**

  In `apps/web/src/lib/api/grading.ts`, find `GradingReadiness` and add:

  ```ts
  /**
   * Mirror `GradingSourceInfo` ở `apps/api/src/grading/grading-reference.service.ts`.
   *
   * `sources` là **tuỳ chọn** (`?`) vì `useGradingReadiness` phải chạy được với
   * một API chưa regenerate — nếu không, mọi màn chuẩn bị vỡ ngay lúc deploy
   * lệch phiên bản.
   */
  export interface GradingSourceInfo {
    present: boolean;
    kind: 'teacher_upload' | 'authoring';
    fileName: string | null;
    setAt: string | null;
  }
  ```

  and extend `GradingReadiness` with:

  ```ts
    sources?: {
      question: GradingSourceInfo;
      modelAnswer: GradingSourceInfo & { unverified: boolean };
    };
  ```

  In `apps/web/src/lib/api/test-bundle.ts`, extend `TestBundleSummary` with:

  ```ts
    /** `examcollect.test_bundle_origin` — ai viết các ca trong gói này. */
    origin: 'teacher' | 'from_model_answer' | 'generated';
  ```

  and extend `TestBundleCase` with:

  ```ts
    /** Trích nguyên văn ràng buộc trong đề mà ca này kiểm. `null` khi giảng viên tự gõ. */
    constraintQuote: string | null;
  ```

  ```bash
  pnpm --filter web exec tsc --noEmit
  ```

  Expected: only the 7 known `read-workbook.test.ts` lines. A `TestBundleCase` missing `constraintQuote` in an existing test literal is a real error — fix the literal, do not make the field optional.

- [ ] **Step 3: commit.**

  Title: `chore(api): regenerate schema và mirror kiểu sources/origin/constraintQuote ở web`

---

### Task 8: the review table on the web

**Files:** create `apps/web/src/lib/api/test-bundle-review.ts`, `apps/web/src/hooks/useTestBundleDetail.ts`, `apps/web/src/app/teacher/grading/_components/TestBundleList.tsx`, `apps/web/src/app/teacher/grading/_components/TestBundleList.test.tsx`; modify `apps/web/src/app/teacher/grading/_components/TestBundleCard.tsx`, `apps/web/src/app/teacher/grading/_components/TestBundleCard.test.tsx`.

**Interfaces**
- Consumes: `TestBundleSummary.origin` and `TestBundleCase.constraintQuote` (Task 7); the generated route `/exam-sessions/{id}/test-bundles/{bundleId}/drop-case` (Task 7 regenerates the schema **after** Task 6 added it); `useTestBundles`, `useApproveTestBundle`, `usePinTestBundle` (existing, `hooks/useTestBundle.ts`); `getTestBundle(examSessionId, bundleId): Promise<TestBundleDetail>` (existing, `lib/api/test-bundle.ts`).
- Produces: `dropTestBundleCase(examSessionId: string, bundleId: string, caseKey: string): Promise<{ id: string; version: number }>`; `useTestBundleDetail(examSessionId: string | undefined, bundleId: string | null)`; `useDropTestBundleCase(examSessionId: string | undefined)` with `mutate({ bundleId, caseKey })`; component `TestBundleList({ sessionId, pinnedBundleId })`.

- [ ] **Step 1: The two thin wrapper files** (exercised through the component test with the hooks mocked; they have no branching to test on their own).

  `apps/web/src/lib/api/test-bundle-review.ts`:

  ```ts
  import { apiClient } from '@/lib/api-client';

  /**
   * Bỏ một ca khỏi gói CHƯA duyệt — server sinh một phiên bản gói mới không
   * chép ca đó (`grading_test_case` là append-only). Gói đã duyệt thì server
   * trả 409 và UI không hiện nút này.
   *
   * File RIÊNG, không thêm vào `lib/api/test-bundle.ts`: file đó dùng chung
   * với các luồng khác đang chạy song song.
   */
  export async function dropTestBundleCase(
    examSessionId: string,
    bundleId: string,
    caseKey: string,
  ): Promise<{ id: string; version: number }> {
    const { data, error, response } = await apiClient.POST('/exam-sessions/{id}/test-bundles/{bundleId}/drop-case', {
      params: { path: { id: examSessionId, bundleId } },
      body: { caseKey },
    });
    if (error || !response.ok) {
      const body = error as { message?: string | string[] } | undefined;
      const message = Array.isArray(body?.message) ? body!.message.join('; ') : body?.message;
      throw new Error(message ?? `Yêu cầu thất bại (HTTP ${response.status})`);
    }
    return data as unknown as { id: string; version: number };
  }
  ```

  `apps/web/src/hooks/useTestBundleDetail.ts`:

  ```ts
  'use client';

  import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
  import { getTestBundle } from '@/lib/api/test-bundle';
  import { dropTestBundleCase } from '@/lib/api/test-bundle-review';

  /**
   * Khoá chi tiết nằm DƯỚI khoá danh sách (`['exam-sessions', id, 'test-bundles']`)
   * một cấp — TanStack Query khớp theo tiền tố, nên mọi `invalidateQueries` của
   * danh sách (duyệt, ghim, tạo) làm mới luôn chi tiết.
   */
  export function useTestBundleDetail(examSessionId: string | undefined, bundleId: string | null) {
    return useQuery({
      queryKey: ['exam-sessions', examSessionId, 'test-bundles', bundleId],
      queryFn: () => getTestBundle(examSessionId!, bundleId!),
      enabled: Boolean(examSessionId) && Boolean(bundleId),
    });
  }

  export function useDropTestBundleCase(examSessionId: string | undefined) {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: ({ bundleId, caseKey }: { bundleId: string; caseKey: string }) =>
        dropTestBundleCase(examSessionId!, bundleId, caseKey),
      onSuccess: () =>
        void queryClient.invalidateQueries({ queryKey: ['exam-sessions', examSessionId, 'test-bundles'] }),
    });
  }
  ```

- [ ] **Step 2: RED — the component test.** Create `TestBundleList.test.tsx`:

  ```tsx
  import { beforeEach, describe, expect, it, vi } from 'vitest';
  import { fireEvent, render, screen, within } from '@testing-library/react';
  import '@testing-library/jest-dom/vitest';
  import { TestBundleList } from './TestBundleList';

  const h = vi.hoisted(() => ({
    bundles: { data: [] as unknown[], isLoading: false },
    detail: { data: undefined as unknown, isLoading: false, isError: false, error: null as Error | null },
    drop: { mutate: vi.fn(), isPending: false, isError: false, error: null as Error | null },
    approve: vi.fn(),
    pin: vi.fn(),
  }));

  vi.mock('@/hooks/useTestBundle', () => ({
    useTestBundles: () => h.bundles,
    useApproveTestBundle: () => ({ mutate: h.approve, isPending: false }),
    usePinTestBundle: () => ({ mutate: h.pin, isPending: false }),
  }));
  vi.mock('@/hooks/useTestBundleDetail', () => ({
    useTestBundleDetail: () => h.detail,
    useDropTestBundleCase: () => h.drop,
  }));

  const summary = (over: Record<string, unknown> = {}) => ({
    id: 'b1', version: 2, approvedAt: null as string | null, origin: 'teacher', caseCount: 2, ...over,
  });
  const detail = (approvedAt: string | null = null) => ({
    data: {
      id: 'b1', version: 2, approvedAt,
      cases: [
        { caseKey: 'ca1', group: 'co_ban', input: '1 2 3', expectedOutput: '6', constraintQuote: 'Cho 1 ≤ n ≤ 100', autoDroppedReason: null },
        { caseKey: 'ca2', group: 'bien', input: '4 5', expectedOutput: '9', constraintQuote: null, autoDroppedReason: 'đề không ràng buộc số phần tử' },
        { caseKey: 'ca3', group: 'bien', input: '7', expectedOutput: '7', constraintQuote: null, autoDroppedReason: null },
      ],
    },
    isLoading: false, isError: false, error: null,
  });

  beforeEach(() => {
    h.bundles = { data: [summary()], isLoading: false };
    h.detail = detail();
    h.drop = { mutate: vi.fn(), isPending: false, isError: false, error: null };
    h.approve.mockReset();
    h.pin.mockReset();
  });

  const renderList = (pinnedBundleId: string | null = null) =>
    render(<TestBundleList sessionId="s1" pinnedBundleId={pinnedBundleId} />);
  const open = () => fireEvent.click(screen.getByRole('button', { name: 'Xem bộ ca' }));

  describe('TestBundleList (UI spec §3.7, T-UI-18)', () => {
    it('expanding a bundle shows the five columns', () => {
      renderList();
      open();
      for (const name of ['Nhóm', 'Input', 'Output mong đợi', 'Câu trong đề mà ca này kiểm', 'Thao tác']) {
        expect(screen.getByRole('columnheader', { name })).toBeInTheDocument();
      }
    });

    it('shows the quoted constraint when there is one and "—" when there is not', () => {
      renderList();
      open();
      expect(screen.getByText('“Cho 1 ≤ n ≤ 100”')).toBeInTheDocument();
      const ca3 = screen.getByText('7', { selector: 'td.font-mono' }).closest('tr')!;
      expect(within(ca3).getByText('—')).toBeInTheDocument();
    });

    it('a case the system dropped is struck through with its reason, and has no drop button', () => {
      renderList();
      open();
      const row = screen.getByText(/Hệ thống đã bỏ ca này/).closest('tr')!;
      expect(row.className).toContain('line-through');
      expect(within(row).getByText(/đề không ràng buộc số phần tử/)).toBeInTheDocument();
      expect(within(row).queryByRole('button')).not.toBeInTheDocument();
    });

    it('an APPROVED bundle offers no "Bỏ ca này" anywhere — the server would answer 409', () => {
      h.bundles = { data: [summary({ approvedAt: '2026-09-29T08:00:00.000Z' })], isLoading: false };
      h.detail = detail('2026-09-29T08:00:00.000Z');
      renderList();
      open();
      expect(screen.queryAllByRole('button', { name: 'Bỏ ca này' })).toHaveLength(0);
    });

    it('clicking "Bỏ ca này" sends the bundle id and the case key — one request', () => {
      renderList();
      open();
      const buttons = screen.getAllByRole('button', { name: 'Bỏ ca này' });
      expect(buttons).toHaveLength(2); // ca1 and ca3; ca2 was dropped by the system
      fireEvent.click(buttons[0]);
      expect(h.drop.mutate).toHaveBeenCalledTimes(1);
      expect(h.drop.mutate).toHaveBeenCalledWith({ bundleId: 'b1', caseKey: 'ca1' });
    });

    it('shows the server refusal verbatim', () => {
      h.drop = {
        mutate: vi.fn(), isPending: false, isError: true,
        error: new Error('Gói test b1 đã được duyệt lúc 2026-09-29 — không bỏ ca được nữa.'),
      };
      renderList();
      expect(screen.getByRole('alert')).toHaveTextContent('Gói test b1 đã được duyệt lúc 2026-09-29 — không bỏ ca được nữa.');
    });

    it('always states the limit: matching each other is not the same as being right', () => {
      renderList();
      expect(screen.getByText(/khớp nhau chưa chắc là đúng/)).toBeInTheDocument();
    });

    it('labels a system-made bundle, and only that — not a teacher bundle, not one with no origin', () => {
      h.bundles = {
        data: [
          summary({ id: 'b1', origin: 'generated' }),
          summary({ id: 'b2', origin: 'teacher' }),
          summary({ id: 'b3', origin: undefined }),
        ],
        isLoading: false,
      };
      renderList();
      expect(screen.getAllByText('Thước do hệ thống sinh')).toHaveLength(1);
    });

    it('an unapproved bundle can be approved from the list', () => {
      renderList();
      fireEvent.click(screen.getByRole('button', { name: 'Duyệt' }));
      expect(h.approve).toHaveBeenCalledWith('b1');
    });
  });
  ```

  ```bash
  pnpm --filter web exec vitest run src/app/teacher/grading/_components/TestBundleList.test.tsx
  ```

  Expected: **RED** — `Failed to resolve import "./TestBundleList"`.

- [ ] **Step 3: GREEN — the component.** Create `TestBundleList.tsx`. **Keep all four hook calls and the `useState` above the first early `return`** (rules of hooks):

  ```tsx
  'use client';

  import { useState } from 'react';
  import { Alert, AlertDescription } from '@/components/ui/alert';
  import { Badge } from '@/components/ui/badge';
  import { Button } from '@/components/ui/button';
  import { useApproveTestBundle, usePinTestBundle, useTestBundles } from '@/hooks/useTestBundle';
  import { useDropTestBundleCase, useTestBundleDetail } from '@/hooks/useTestBundleDetail';

  const formatMoment = (iso: string | null) => (iso ? new Date(iso).toLocaleString('vi-VN') : 'không rõ lúc');

  /**
   * Danh sách gói test + bảng duyệt bộ ca (UI spec §3.7, T-UI-18).
   *
   * Năm cột đúng như spec. Cột "câu trong đề mà ca này kiểm" đọc
   * `constraint_quote` — KHÔNG suy từ `group` (Security rule 9: cột nào kiểm
   * cái gì phải được nói thẳng, không đoán), nên ca giảng viên tự gõ hiện "—".
   *
   * Ca hệ thống đã tự bỏ vẫn hiện, gạch ngang, kèm lý do. Nó KHÔNG tính vào
   * `caseCount` (`TestBundleService.list` đã loại sẵn), nên con số ở đây là
   * số ca THẬT sự chạy.
   */
  export function TestBundleList({ sessionId, pinnedBundleId }: { sessionId: string; pinnedBundleId: string | null }) {
    const bundles = useTestBundles(sessionId);
    const approveBundle = useApproveTestBundle(sessionId);
    const pinBundle = usePinTestBundle(sessionId);
    const dropCase = useDropTestBundleCase(sessionId);
    const [expanded, setExpanded] = useState<string | null>(null);

    if (bundles.isLoading) return <p className="text-muted-foreground">Đang tải…</p>;
    if ((bundles.data?.length ?? 0) === 0) {
      return (
        <p className="rounded-md border border-dashed border-border px-4 py-3 text-small text-muted-foreground">
          Chưa có gói test nào — bài code không chấm được cho tới khi có một gói đã duyệt và ghim (§14.3).
        </p>
      );
    }

    return (
      <div className="flex flex-col gap-3">
        {bundles.data!.map((bundle) => {
          // Chỉ hai giá trị này mới là "hệ thống sinh"; `origin` vắng (API cũ) KHÔNG bị tính là hệ thống sinh.
          const systemMade = bundle.origin === 'generated' || bundle.origin === 'from_model_answer';
          return (
            <div key={bundle.id} className="rounded-md border border-border bg-surface p-3 text-small">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">Phiên bản {bundle.version}</span>
                <span className="text-caption text-muted-foreground">{bundle.caseCount} ca</span>
                {systemMade && <Badge variant="warning">Thước do hệ thống sinh</Badge>}
                {bundle.id === pinnedBundleId ? (
                  <Badge variant="accent">Đang dùng</Badge>
                ) : bundle.approvedAt ? (
                  <Button type="button" size="sm" variant="outline" onClick={() => pinBundle.mutate(bundle.id)}>
                    Ghim
                  </Button>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    loading={approveBundle.isPending}
                    onClick={() => approveBundle.mutate(bundle.id)}
                  >
                    Duyệt
                  </Button>
                )}
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  aria-expanded={expanded === bundle.id}
                  onClick={() => setExpanded((current) => (current === bundle.id ? null : bundle.id))}
                >
                  {expanded === bundle.id ? 'Ẩn bộ ca' : 'Xem bộ ca'}
                </Button>
              </div>
              {bundle.approvedAt && (
                <p className="text-caption text-muted-foreground">Đã duyệt lúc {formatMoment(bundle.approvedAt)}</p>
              )}
              {expanded === bundle.id && (
                <CaseTable sessionId={sessionId} bundleId={bundle.id} approved={bundle.approvedAt !== null} drop={dropCase} />
              )}
            </div>
          );
        })}

        {dropCase.isError && (
          <Alert variant="destructive">
            <AlertDescription>{dropCase.error.message}</AlertDescription>
          </Alert>
        )}

        {/* Giới hạn mà spec §3.7 đòi nói thẳng — luôn bật, kể cả khi gói do giảng viên tự gõ. */}
        <p className="rounded-md border border-dashed border-border px-3 py-2 text-caption text-muted-foreground">
          Đáp án và gói test cùng do hệ thống viết thì <strong>khớp nhau chưa chắc là đúng</strong>. Bộ ca chỉ thành
          thước khi bạn duyệt.
        </p>
      </div>
    );
  }

  function CaseTable({
    sessionId,
    bundleId,
    approved,
    drop,
  }: {
    sessionId: string;
    bundleId: string;
    approved: boolean;
    drop: ReturnType<typeof useDropTestBundleCase>;
  }) {
    const detail = useTestBundleDetail(sessionId, bundleId);
    if (detail.isLoading) return <p className="mt-2 text-caption text-muted-foreground">Đang tải bộ ca…</p>;
    if (detail.isError) {
      return (
        <Alert variant="destructive" className="mt-2">
          <AlertDescription>{detail.error?.message}</AlertDescription>
        </Alert>
      );
    }

    return (
      <table className="mt-3 w-full table-fixed text-left text-small">
        <caption className="sr-only">Bộ ca của gói test phiên bản này</caption>
        <thead>
          <tr className="text-caption text-muted-foreground">
            <th scope="col" className="w-24 py-1">Nhóm</th>
            <th scope="col" className="w-40 py-1">Input</th>
            <th scope="col" className="w-40 py-1">Output mong đợi</th>
            <th scope="col" className="py-1">Câu trong đề mà ca này kiểm</th>
            <th scope="col" className="w-28 py-1"><span className="sr-only">Thao tác</span></th>
          </tr>
        </thead>
        <tbody>
          {detail.data?.cases.map((c) => (
            <tr key={c.caseKey} className={c.autoDroppedReason ? 'text-muted-foreground line-through' : ''}>
              <td className="py-1 pr-2 align-top">{c.group}</td>
              <td className="py-1 pr-2 align-top font-mono text-caption">{c.input}</td>
              <td className="py-1 pr-2 align-top font-mono text-caption">{c.expectedOutput}</td>
              <td className="py-1 pr-2 align-top">
                {c.autoDroppedReason ? (
                  <span>Hệ thống đã bỏ ca này: {c.autoDroppedReason}</span>
                ) : c.constraintQuote ? (
                  <span className="italic text-muted-foreground">“{c.constraintQuote}”</span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </td>
              <td className="py-1 align-top">
                {!c.autoDroppedReason && !approved && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    loading={drop.isPending}
                    onClick={() => drop.mutate({ bundleId, caseKey: c.caseKey })}
                  >
                    Bỏ ca này
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
  ```

- [ ] **Step 4: `TestBundleCard` delegates the list.** Replace the whole file `TestBundleCard.tsx` with:

  ```tsx
  'use client';

  import { useState } from 'react';
  import { Button } from '@/components/ui/button';
  import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
  import { Input } from '@/components/ui/input';
  import { Label } from '@/components/ui/label';
  import { useCreateTestBundle } from '@/hooks/useTestBundle';
  import type { TestBundleCaseInput } from '@/lib/api/test-bundle';
  import { TestBundleList } from './TestBundleList';

  type DraftCase = TestBundleCaseInput;

  const EMPTY_ROW: DraftCase = { caseKey: '', group: '', input: '', expectedOutput: '' };

  /**
   * Gói test của một phiên (§14.1) — chỉ hiện trên trang Chấm điểm khi phiên có ít nhất một deliverable
   * `code_project` (kiểm ở `PreparePanel`, nơi gọi component này). Danh sách gói và bảng duyệt bộ ca nằm ở
   * `TestBundleList`; ở đây còn khối giảng viên tự tay gõ ca.
   */
  export function TestBundleCard({ sessionId, pinnedBundleId }: { sessionId: string; pinnedBundleId: string | null }) {
    const createBundle = useCreateTestBundle(sessionId);
    const [rows, setRows] = useState<DraftCase[]>([{ ...EMPTY_ROW }]);

    function updateRow(index: number, patch: Partial<DraftCase>) {
      setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
    }

    function submitDraft() {
      const cases = rows.filter((row) => row.caseKey.trim() !== '');
      if (cases.length === 0) return;
      createBundle.mutate(cases, {
        onSuccess: () => setRows([{ ...EMPTY_ROW }]),
      });
    }

    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-h3">Gói test</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <TestBundleList sessionId={sessionId} pinnedBundleId={pinnedBundleId} />

          <div className="flex flex-col gap-2 rounded-md border border-dashed border-border p-3">
            <p className="text-small font-medium">Tạo phiên bản mới</p>
            {rows.map((row, index) => (
              <div key={index} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <div>
                  <Label htmlFor={`case-key-${index}`} className="sr-only">
                    Tên ca
                  </Label>
                  <Input
                    id={`case-key-${index}`}
                    placeholder="Tên ca (vd: ca1)"
                    value={row.caseKey}
                    onChange={(e) => updateRow(index, { caseKey: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor={`case-group-${index}`} className="sr-only">
                    Nhóm
                  </Label>
                  <Input
                    id={`case-group-${index}`}
                    placeholder="Nhóm (vd: co_ban)"
                    value={row.group}
                    onChange={(e) => updateRow(index, { group: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor={`case-input-${index}`} className="sr-only">
                    Input
                  </Label>
                  <Input
                    id={`case-input-${index}`}
                    placeholder="Input"
                    value={row.input}
                    onChange={(e) => updateRow(index, { input: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor={`case-expected-${index}`} className="sr-only">
                    Output mong đợi
                  </Label>
                  <Input
                    id={`case-expected-${index}`}
                    placeholder="Output mong đợi"
                    value={row.expectedOutput}
                    onChange={(e) => updateRow(index, { expectedOutput: e.target.value })}
                  />
                </div>
              </div>
            ))}
            <div className="flex gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => setRows((current) => [...current, { ...EMPTY_ROW }])}>
                Thêm ca
              </Button>
              <Button type="button" size="sm" loading={createBundle.isPending} onClick={submitDraft}>
                Tạo gói
              </Button>
            </div>
            {createBundle.isError && (
              <p className="text-small font-medium text-danger-strong">{createBundle.error.message}</p>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }
  ```

  In `TestBundleCard.test.tsx` replace exactly the line

  ```tsx
  let useTestBundlesMock = () => ({ data: [] as unknown[], isLoading: false });
  ```

  with

  ```tsx
  // `TestBundleList` (nằm trong card) gọi thêm hai hook này; không mock thì `useMutation` không có QueryClientProvider.
  vi.mock('@/hooks/useTestBundleDetail', () => ({
    useTestBundleDetail: () => ({ data: undefined, isLoading: false, isError: false, error: null }),
    useDropTestBundleCase: () => ({ mutate: vi.fn(), isPending: false, isError: false, error: null }),
  }));

  let useTestBundlesMock = () => ({ data: [] as unknown[], isLoading: false });
  ```

  **Do not change any assertion in that file** — they all still hold because the real `TestBundleList` is rendered inside the card.

- [ ] **Step 5: GREEN.**

  ```bash
  pnpm --filter web exec vitest run src/app/teacher/grading/_components/TestBundleList.test.tsx src/app/teacher/grading/_components/TestBundleCard.test.tsx src/app/teacher/grading/_components/PreparePanel.test.tsx
  pnpm --filter web exec tsc --noEmit
  pnpm --filter web exec eslint src/app/teacher/grading/_components/TestBundleList.tsx src/app/teacher/grading/_components/TestBundleCard.tsx src/hooks/useTestBundleDetail.ts src/lib/api/test-bundle-review.ts
  ```

  Expected: `TestBundleList` 9 passed; `TestBundleCard` 6 passed **unchanged**; `PreparePanel` unchanged (it mocks `./TestBundleCard`); `tsc` only the 7 known `read-workbook.test.ts` lines; eslint 0 errors.

- [ ] **Step 6: commit.** Title: `feat(grading): bảng duyệt bộ ca với cột trích dẫn đề và nút Bỏ ca này`.

---

### Task 9: the provenance lines and the gold band in `ReferenceForm`

**Files:** `apps/web/src/app/teacher/grading/_components/ReferenceForm.tsx`, `ReferenceForm.test.tsx`, `PreparePanel.tsx`, `PreparePanel.test.tsx` (all modify).

**Interfaces**
- Consumes: `GradingReadiness.sources?` and `GradingSourceInfo` (Task 7 mirror); `detail.data?.testBundleId` already read in `PreparePanel` (line 39, `useExamSessionDetail(sessionId)`).
- Produces: `ReferenceForm` gains the required prop `hasPinnedBundle: boolean` (a pinned bundle is by definition an approved one — `TestBundleService.pin` refuses an unapproved bundle — so no bundle data is needed).

- [ ] **Step 1: RED — `ReferenceForm.test.tsx`.**

  Replace exactly

  ```tsx
  const renderForm = (over: Partial<React.ComponentProps<typeof ReferenceForm>> = {}) => {
    const onDirtyChange = vi.fn();
    render(<ReferenceForm sessionId="s1" readiness={readiness} onDirtyChange={onDirtyChange} {...over} />);
  ```

  with

  ```tsx
  const renderForm = (over: Partial<React.ComponentProps<typeof ReferenceForm>> = {}) => {
    const onDirtyChange = vi.fn();
    render(<ReferenceForm sessionId="s1" readiness={readiness} onDirtyChange={onDirtyChange} hasPinnedBundle={false} {...over} />);
  ```

  Replace exactly the test

  ```tsx
    it('the "where did this come from" line has no data behind it yet — labelled "cần backend"', () => {
      renderForm();
      expect(screen.getAllByText('cần backend').length).toBeGreaterThan(0);
    });
  ```

  with the block below. Record a `Ruling:` line: the removed test stated the pre-G2 behaviour ("no data yet"), which G2 deliberately changes; it is replaced, not loosened.

  ```tsx
    describe('where each document came from (G2 §4.4)', () => {
      const stamp = (iso: string) => new Date(iso).toLocaleString('vi-VN');
      const sources = (over: Record<string, unknown> = {}) => ({
        question: { present: true, kind: 'teacher_upload' as const, fileName: 'de-thi-cuoi-ky.pdf', setAt: '2026-09-29T01:14:00.000Z' },
        modelAnswer: { present: true, kind: 'authoring' as const, fileName: 'dap-an-va-test.docx', setAt: '2026-09-29T01:05:00.000Z', unverified: true },
        ...over,
      });
      const withSources = (s = sources()) => ({ ...readiness, hasQuestion: true, hasModelAnswer: true, sources: s });

      it('no "cần backend" badge is left on this form', () => {
        renderForm({ readiness: withSources() });
        expect(screen.queryByText('cần backend')).not.toBeInTheDocument();
      });

      it('says who supplied the question file, when, and its name', () => {
        renderForm({ readiness: withSources() });
        expect(screen.getByText(`Nguồn: bạn tải lên lúc ${stamp('2026-09-29T01:14:00.000Z')} (de-thi-cuoi-ky.pdf).`)).toBeInTheDocument();
      });

      it('an answer key attached from Soạn đề says so', () => {
        renderForm({ readiness: withSources(), hasPinnedBundle: true });
        expect(screen.getByText(`Nguồn: gắn từ Soạn đề lúc ${stamp('2026-09-29T01:05:00.000Z')} (dap-an-va-test.docx).`)).toBeInTheDocument();
      });

      it('an unverified answer key with no pinned bundle gets the gold band, with the consequence', () => {
        renderForm({ readiness: withSources(), hasPinnedBundle: false });
        expect(screen.getByRole('status')).toHaveTextContent(/chưa từng chạy thử/);
        expect(screen.getByRole('status')).toHaveTextContent(/thước bạn chưa đọc/);
      });

      it('once a bundle is pinned the band is gone and only the neutral line remains', () => {
        renderForm({ readiness: withSources(), hasPinnedBundle: true });
        expect(screen.queryByText(/chưa từng chạy thử/)).not.toBeInTheDocument();
        expect(screen.getByText(/Nguồn: gắn từ Soạn đề lúc/)).toBeInTheDocument();
      });

      it('a note is not called an upload', () => {
        renderForm({
          readiness: withSources(sources({
            modelAnswer: { present: true, kind: 'teacher_upload' as const, fileName: null, setAt: '2026-09-29T02:00:00.000Z', unverified: false },
          })),
        });
        expect(screen.getByText(`Nguồn: bạn ghi chú lúc ${stamp('2026-09-29T02:00:00.000Z')}.`)).toBeInTheDocument();
      });

      it('an API without `sources` still renders — no source lines, nothing thrown', () => {
        renderForm({ readiness });
        expect(screen.queryByText(/^Nguồn:/)).not.toBeInTheDocument();
      });
    });
  ```

  ```bash
  pnpm --filter web exec vitest run src/app/teacher/grading/_components/ReferenceForm.test.tsx
  ```

  Expected: **RED** — the new cases fail (`Nguồn: …` lines and the band do not exist; the "no cần backend" case fails because two badges are still rendered) and `tsc` would flag the missing prop.

- [ ] **Step 2: GREEN — `ReferenceForm.tsx`.** Change the imports: remove `import { NeedsBackend } from '@/components/needs-backend';` and change

  ```tsx
  import { requestAnswerKeyUpload, type GradingReadiness } from '@/lib/api/grading';
  ```

  to

  ```tsx
  import { requestAnswerKeyUpload, type GradingReadiness, type GradingSourceInfo } from '@/lib/api/grading';
  ```

  Replace the last two lines of the doc comment

  ```tsx
   * "Nguồn của từng tài liệu" (bạn tải lên lúc nào / gắn từ Soạn đề) chưa có trong `grading-readiness`, nên mang
   * nhãn *cần backend*.
   */
  ```

  with

  ```tsx
   * "Nguồn của từng tài liệu" (bạn tải lên lúc nào / gắn từ Soạn đề) đọc từ `readiness.sources`. Băng vàng "đáp án
   * chưa kiểm chứng" hiện cho tới khi phiên có một gói test đã ghim (`hasPinnedBundle` — đã ghim thì theo định
   * nghĩa đã duyệt), sau đó chỉ còn dòng nguồn trung tính.
   */
  ```

  Replace the signature

  ```tsx
  export function ReferenceForm({
    sessionId,
    readiness,
    onDirtyChange,
  }: {
    sessionId: string;
    readiness: GradingReadiness | undefined;
    onDirtyChange: (dirty: boolean) => void;
  }) {
  ```

  with

  ```tsx
  export function ReferenceForm({
    sessionId,
    readiness,
    onDirtyChange,
    hasPinnedBundle,
  }: {
    sessionId: string;
    readiness: GradingReadiness | undefined;
    onDirtyChange: (dirty: boolean) => void;
    hasPinnedBundle: boolean;
  }) {
  ```

  Replace exactly

  ```tsx
        <p className="text-caption text-muted-foreground">
          Nguồn của tài liệu (tải lên lúc nào, hay gắn từ Soạn đề): <NeedsBackend />
        </p>
  ```

  with

  ```tsx
        {readiness?.sources?.question.present && (
          <p className="text-caption text-muted-foreground">{sourceLine(readiness.sources.question)}</p>
        )}
  ```

  Replace exactly

  ```tsx
        <p className="text-caption text-muted-foreground">
          Nguồn của đáp án mẫu: <NeedsBackend />
        </p>
  ```

  with

  ```tsx
        {readiness?.sources?.modelAnswer.present && readiness.sources.modelAnswer.unverified && !hasPinnedBundle && (
          <Alert variant="warning" role="status">
            <AlertDescription>
              Đáp án mẫu này do hệ thống soạn đề sinh ra và <strong>chưa từng chạy thử</strong>. Cả phiên sẽ được đo
              bằng một cái thước bạn chưa đọc — hãy kiểm tra đáp án và duyệt gói test ở khối bên dưới.
            </AlertDescription>
          </Alert>
        )}
        {readiness?.sources?.modelAnswer.present && (
          <p className="text-caption text-muted-foreground">{sourceLine(readiness.sources.modelAnswer)}</p>
        )}
  ```

  Append at the end of the file:

  ```tsx
  /** Một câu nguồn: ai đưa tài liệu và lúc nào. Một câu ghi chú không được gọi là "tải lên". */
  function sourceLine(source: GradingSourceInfo): string {
    const when = source.setAt ? new Date(source.setAt).toLocaleString('vi-VN') : 'thời điểm không ghi nhận';
    const named = source.fileName ? ` (${source.fileName})` : '';
    if (source.kind === 'authoring') return `Nguồn: gắn từ Soạn đề lúc ${when}${named}.`;
    return source.fileName ? `Nguồn: bạn tải lên lúc ${when}${named}.` : `Nguồn: bạn ghi chú lúc ${when}.`;
  }
  ```

- [ ] **Step 3: `PreparePanel` passes the prop.** In `PreparePanel.tsx` replace exactly

  ```tsx
            <ReferenceForm sessionId={sessionId} readiness={readiness.data} onDirtyChange={setDirty} />
  ```

  with

  ```tsx
            <ReferenceForm
              sessionId={sessionId}
              readiness={readiness.data}
              onDirtyChange={setDirty}
              hasPinnedBundle={Boolean(detail.data?.testBundleId)}
            />
  ```

  In `PreparePanel.test.tsx` replace the `ReferenceForm` mock

  ```tsx
  vi.mock('./ReferenceForm', () => ({
    ReferenceForm: ({ onDirtyChange }: { onDirtyChange: (d: boolean) => void }) => (
      <button type="button" onClick={() => onDirtyChange(true)}>
        mô phỏng thay đổi chưa lưu
      </button>
    ),
  }));
  ```

  with

  ```tsx
  vi.mock('./ReferenceForm', () => ({
    ReferenceForm: ({ onDirtyChange, hasPinnedBundle }: { onDirtyChange: (d: boolean) => void; hasPinnedBundle: boolean }) => (
      <button type="button" data-pinned={String(hasPinnedBundle)} onClick={() => onDirtyChange(true)}>
        mô phỏng thay đổi chưa lưu
      </button>
    ),
  }));
  ```

  and add inside `describe('PreparePanel — start button (spec §3.7)'`, right after its first `it`:

  ```tsx
    it('tells ReferenceForm whether the session already has a pinned test bundle', () => {
      const { unmount } = renderPanel();
      expect(screen.getByRole('button', { name: 'mô phỏng thay đổi chưa lưu' })).toHaveAttribute('data-pinned', 'false');
      unmount();

      h.detail = detail({ testBundleId: 'b1' });
      renderPanel();
      expect(screen.getByRole('button', { name: 'mô phỏng thay đổi chưa lưu' })).toHaveAttribute('data-pinned', 'true');
    });
  ```

- [ ] **Step 4: GREEN.**

  ```bash
  pnpm --filter web exec vitest run src/app/teacher/grading/_components/ReferenceForm.test.tsx src/app/teacher/grading/_components/PreparePanel.test.tsx
  pnpm --filter web exec tsc --noEmit
  pnpm --filter web exec eslint src/app/teacher/grading/_components/ReferenceForm.tsx src/app/teacher/grading/_components/PreparePanel.tsx
  ```

  Expected: green; `tsc` only the 7 known lines; eslint 0 errors.

- [ ] **Step 5: commit.** Title: `feat(prepare): hai dòng nguồn tài liệu chấm và băng vàng đáp án chưa kiểm chứng`.

---

### Task 10: one neutral line about the session's ruler

**Files:** create `apps/web/src/app/teacher/grading/_components/RulerOriginNote.tsx`, `RulerOriginNote.test.tsx`; modify `apps/web/src/app/teacher/grading/page.tsx`, `page.test.tsx`, `apps/web/src/app/teacher/grading/[resultId]/_components/investigator/InvestigatorDossier.tsx`, `InvestigatorDossier.test.tsx`.

**Interfaces**
- Consumes: `useExamSessionDetail(id)` (`hooks/useExamSession.ts:80`, key `['exam-session', id]`, `data.testBundleId`); `useTestBundles(sessionId)` rows with `origin` and `approvedAt` (Task 7).
- Produces: `RulerOriginNote({ sessionId }: { sessionId: string })`.

- [ ] **Step 1: RED — the component test.** Create `RulerOriginNote.test.tsx`:

  ```tsx
  import { beforeEach, describe, expect, it, vi } from 'vitest';
  import { render } from '@testing-library/react';
  import { screen } from '@testing-library/react';
  import '@testing-library/jest-dom/vitest';
  import { RulerOriginNote } from './RulerOriginNote';

  const h = vi.hoisted(() => ({
    detail: { data: undefined as unknown },
    bundles: { data: undefined as unknown },
  }));
  vi.mock('@/hooks/useExamSession', () => ({ useExamSessionDetail: () => h.detail }));
  vi.mock('@/hooks/useTestBundle', () => ({ useTestBundles: () => h.bundles }));

  const bundle = (over: Record<string, unknown> = {}) => ({
    id: 'b1', version: 1, approvedAt: '2026-09-29T01:05:00.000Z', origin: 'generated', caseCount: 3, ...over,
  });

  beforeEach(() => {
    h.detail = { data: { testBundleId: 'b1' } };
    h.bundles = { data: [bundle()] };
  });

  describe('RulerOriginNote (UI spec T-UI-17)', () => {
    it('says the ruler was made by the system, and when the teacher approved it', () => {
      render(<RulerOriginNote sessionId="s1" />);
      expect(screen.getByText(
        `Thước do hệ thống sinh — bạn duyệt lúc ${new Date('2026-09-29T01:05:00.000Z').toLocaleString('vi-VN')}.`,
      )).toBeInTheDocument();
    });

    it('also covers a bundle built from the system model answer', () => {
      h.bundles = { data: [bundle({ origin: 'from_model_answer' })] };
      render(<RulerOriginNote sessionId="s1" />);
      expect(screen.getByText(/Thước do hệ thống sinh/)).toBeInTheDocument();
    });

    it('says nothing when the teacher wrote the bundle', () => {
      h.bundles = { data: [bundle({ origin: 'teacher' })] };
      const { container } = render(<RulerOriginNote sessionId="s1" />);
      expect(container).toBeEmptyDOMElement();
    });

    it('says nothing when there is no pinned bundle', () => {
      h.detail = { data: { testBundleId: null } };
      const { container } = render(<RulerOriginNote sessionId="s1" />);
      expect(container).toBeEmptyDOMElement();
    });

    it('says nothing while data is loading, and when the API gives no origin — never a guess', () => {
      h.detail = { data: undefined };
      expect(render(<RulerOriginNote sessionId="s1" />).container).toBeEmptyDOMElement();

      h.detail = { data: { testBundleId: 'b1' } };
      h.bundles = { data: [bundle({ origin: undefined })] };
      expect(render(<RulerOriginNote sessionId="s1" />).container).toBeEmptyDOMElement();
    });
  });
  ```

  ```bash
  pnpm --filter web exec vitest run src/app/teacher/grading/_components/RulerOriginNote.test.tsx
  ```

  Expected: **RED** — `Failed to resolve import "./RulerOriginNote"`.

- [ ] **Step 2: GREEN — the component.** Create `RulerOriginNote.tsx`:

  ```tsx
  'use client';

  import { useExamSessionDetail } from '@/hooks/useExamSession';
  import { useTestBundles } from '@/hooks/useTestBundle';

  /**
   * Một DÒNG trung tính về nguồn gốc thước của phiên — không phải cảnh báo (UI spec §3.7, T-UI-17).
   *
   * MỘT lần mỗi trang, không mỗi dòng bài: `grading_result` không mang `test_bundle_id`, nên đẩy xuống từng dòng là
   * N lần lặp một câu không đổi và N request thừa. Câu này có mặt ở mọi trang hiển thị kết quả bài CODE (danh sách
   * và hồ sơ) — đó là cách thoả "mọi dòng" của spec. Bài tự luận chấm theo rubric, không dùng gói test, nên không
   * có dòng này ở màn tự luận.
   *
   * Không nói gì khi gói do giảng viên tự viết, khi chưa có gói ghim, khi đang tải, hoặc khi API không trả `origin`
   * — không bao giờ đoán.
   */
  export function RulerOriginNote({ sessionId }: { sessionId: string }) {
    const detail = useExamSessionDetail(sessionId);
    const bundles = useTestBundles(sessionId);

    const pinnedId = detail.data?.testBundleId ?? null;
    const pinned = pinnedId ? bundles.data?.find((b) => b.id === pinnedId) : undefined;
    if (!pinned || (pinned.origin !== 'generated' && pinned.origin !== 'from_model_answer')) return null;

    return (
      <p className="text-caption text-muted-foreground">
        Thước do hệ thống sinh — bạn duyệt lúc{' '}
        {pinned.approvedAt ? new Date(pinned.approvedAt).toLocaleString('vi-VN') : 'không rõ lúc'}.
      </p>
    );
  }
  ```

  Both hooks run before the early `return null`, so hook order is stable.

  ```bash
  pnpm --filter web exec vitest run src/app/teacher/grading/_components/RulerOriginNote.test.tsx
  ```

  Expected: 5 passed.

- [ ] **Step 3: RED → GREEN — mount it on the list page.** In `page.test.tsx` add the mock next to the other `_components` mocks (after the `BulkAcceptEssays` mock):

  ```tsx
  vi.mock('./_components/RulerOriginNote', () => ({
    RulerOriginNote: ({ sessionId }: { sessionId: string }) => <div data-testid="ruler-note" data-session={sessionId} />,
  }));
  ```

  and add a new `describe` after the `'/teacher/grading — without a session: the picker'` block:

  ```tsx
  describe('ruler origin note (G2 §4.5)', () => {
    it('is mounted on the session screen, for the chosen session', () => {
      render(<GradingPage />);
      expect(screen.getByTestId('ruler-note')).toHaveAttribute('data-session', 's1');
    });

    it('is not part of the session picker', () => {
      search = '';
      render(<GradingPage />);
      expect(screen.queryByTestId('ruler-note')).not.toBeInTheDocument();
    });
  });
  ```

  Run it — **RED** (`Unable to find an element by: [data-testid="ruler-note"]`) — then in `page.tsx` add `import { RulerOriginNote } from './_components/RulerOriginNote';` (after the `PreparePanel` import) and replace exactly

  ```tsx
        <SessionHeader session={session} sessionId={sessionId} resultCount={list.length} systemFailed={counts.ungradable} />

        {results.isError && (
  ```

  with

  ```tsx
        <SessionHeader session={session} sessionId={sessionId} resultCount={list.length} systemFailed={counts.ungradable} />
        <RulerOriginNote sessionId={sessionId} />

        {results.isError && (
  ```

  (stream S and G3 also edit this file — see the touch-point table; keep the new line directly under `SessionHeader`.)

- [ ] **Step 4: RED → GREEN — mount it in the code dossier.** In `InvestigatorDossier.test.tsx` add after the `useSessionOverview` mock:

  ```tsx
  vi.mock('@/app/teacher/grading/_components/RulerOriginNote', () => ({
    RulerOriginNote: () => <div data-testid="ruler-note" />,
  }));
  ```

  and add inside the top-level `describe`, after the `'renders the full dossier for a normal flagged result'` test:

  ```tsx
    it('shows the ruler-origin note in the full dossier, not in the ungradable view', () => {
      resultsMock = () => ({ data: [baseResult], isLoading: false, isError: false });
      detailMock = () => ({
        data: {
          pipeline: 'investigator', currentScore: 6, currentScoreSource: 'computation', status: 'flagged_for_review',
          ungradableClass: null, ungradableReason: null,
          breakdown: {
            errors: [], perCriterion: [{ key: 'tinh_dung', maxHundredths: 1000, deductedHundredths: 0, capped: false }],
            caseFlags: [], errorFlags: [], confidence: 1, mismatchedRules: [], notConsidered: [], ungradable: null,
          },
          investigation: { summary: 'x', verdict: { errors: [] }, replay: null, investigation: { toolCalls: [] } },
          challengeNotes: [], challengeVerdicts: [],
        },
        isLoading: false,
      });
      const { unmount } = render(<InvestigatorDossier resultId="r1" sessionId="s1" />);
      expect(screen.getByTestId('ruler-note')).toBeInTheDocument();
      unmount();

      resultsMock = () => ({ data: [{ ...baseResult, ungradableReason: 'x' }], isLoading: false, isError: false });
      detailMock = () => ({
        data: { pipeline: 'investigator', currentScore: null, currentScoreSource: 'none', status: 'flagged_for_review', ungradableClass: 'system', ungradableReason: 'x', breakdown: null, investigation: { summary: 's', investigation: { toolCalls: [] } }, challengeNotes: [], challengeVerdicts: [] },
        isLoading: false,
      });
      render(<InvestigatorDossier resultId="r1" sessionId="s1" />);
      expect(screen.queryByTestId('ruler-note')).not.toBeInTheDocument();
    });
  ```

  Run it — **RED** — then in `InvestigatorDossier.tsx` add `import { RulerOriginNote } from '@/app/teacher/grading/_components/RulerOriginNote';` (after the `useSessionOverview` import) and replace exactly

  ```tsx
        {header(d.status, d.ungradableReason)}
        {handGraded && (
  ```

  with

  ```tsx
        {header(d.status, d.ungradableReason)}
        <RulerOriginNote sessionId={sessionId} />
        {handGraded && (
  ```

  (that anchor is unique — the `UngradableView` branch has `{header(d.status, d.ungradableReason)}` followed by `<UngradableView`, and G3 edits that branch's file and lines, not this one.)

- [ ] **Step 5: GREEN.**

  ```bash
  pnpm --filter web exec vitest run src/app/teacher/grading
  pnpm --filter web exec tsc --noEmit
  pnpm --filter web exec eslint src/app/teacher/grading
  ```

  Expected: the whole `src/app/teacher/grading` tree green; `tsc` only the 7 known lines; eslint 0 errors.

- [ ] **Step 6: commit.** Title: `feat(grading): dòng nguồn gốc thước trên danh sách và hồ sơ bài code`.

---

### Task 11: full verification, ledger, and an honest report

**Files:** `docs/superpowers/ledgers/2026-09-29-ruler-from-authoring.md` (create, committed — unlike the in-progress ledger this one is a deliverable).

- [ ] **Step 1: Backend unit tests.**

  ```bash
  pnpm --filter api exec jest
  ```

  Expected: the whole suite green. Baseline on `feat/grading-gaps-g1-g5` is 1167 passing, 7 skipped (pre-existing). A number below that means a regression, not a flake — re-run before concluding.

- [ ] **Step 2: Backend e2e — this package's suites plus the neighbours.**

  Kill stray workers first (they eat BullMQ jobs from a shared Redis and poison later runs):

  ```bash
  # List jest workers; stop ONLY the ones whose command line shows THIS worktree's path, by PID (Stop-Process -Id <pid>).
  # Never `taskkill /IM node.exe`: it also kills the jest runs and dev servers of every other session on this machine.
  powershell.exe -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -match 'jest' } | Select-Object ProcessId, CommandLine"
  ```

  ```bash
  pnpm --filter api exec jest --config ./test/jest-e2e.json test/exam-authoring-attach.e2e-spec.ts test/test-bundle.e2e-spec.ts test/grading-reference.e2e-spec.ts
  pnpm --filter api exec jest --config ./test/jest-e2e.json test/exam-material.e2e-spec.ts test/grading.e2e-spec.ts test/deliverable-language.e2e-spec.ts
  ```

  Expected: all green. Then the full e2e suite:

  ```bash
  pnpm --filter api exec jest --config ./test/jest-e2e.json
  ```

  Expected: 10 suites green (G1's baseline), plus whatever this package added. **Compare against the G1 baseline recorded in `.superpowers/sdd/2026-09-29-grading-truth-debts/progress.md`** — read it rather than guessing.

- [ ] **Step 3: Web tests and typecheck.**

  ```bash
  pnpm --filter web exec vitest run
  pnpm --filter web exec tsc --noEmit
  ```

  Expected: tsc output is **byte-identical** to the baseline — 7 lines, all in `src/lib/read-workbook.test.ts`. Any other line is a regression from this package. Capture both into files and diff them:

  ```bash
  pnpm --filter web exec tsc --noEmit > tsc-g2.txt 2>&1
  ```

  and compare with the G1 baseline file.

- [ ] **Step 4: Lint, cycles, build.**

  ```bash
  pnpm --filter web exec eslint src
  pnpm --filter api exec eslint src
  pnpm check:cycles
  ```

  Expected: 0 errors; `0 vòng lặp`.

  ```bash
  pnpm --filter web run build
  ```

  **One** `next build`, not one per task.

- [ ] **Step 5: A real smoke against the built API, on this package's port.**

  Start the API on `PORT=4002` with the `.env.test` environment, then walk the flow end to end with a fresh teacher account:

  1. `POST /exam-authoring/generate` (prompt, 2 câu, `language: python`) — the test provider is a stub when `NODE_ENV=test`; for a real smoke, generate against the stub anyway and check the *shape*, because the money is in the wiring, not the model.
  2. `POST /exam-sessions` with a future window.
  3. `POST /exam-authoring/attach` → expect 201, `testBundle.pinned === true`.
  4. `GET /grading-readiness` → `sources.modelAnswer.kind === 'authoring'`, `unverified === true`, both `setAt` non-null.
  5. `GET /test-bundles` → the new bundle, `origin: 'generated'`, `approvedAt` non-null, `caseCount > 0`.
  6. `GET /test-bundles/:id` → every case has a `constraintQuote` key (possibly `null`) — the field must be **present**, not missing.
  7. Attach again on the same session → `testBundle.pinned === false`, and `test_bundle_id` unchanged.
  8. `GET /grading-readiness` again → `modelAnswer.setAt` is **later** than at step 4 (a second attach re-sends the answer key, which counts as setting the answer again). Then `PUT /exam-sessions/:id/grading-reference` with **only** `questionMaterialId` and read it once more: `setAt` must **not** move this time.

  Report the pass count honestly; do not claim a step that was not run.

- [ ] **Step 6: Write the ledger.**

  Create `docs/superpowers/ledgers/2026-09-29-ruler-from-authoring.md` with, per task: the commit hash, the exact test command and its result, and every `Ruling:` line from the in-progress ledger with the reason. Also record the `git show 4e06f00 --stat` finding from Task 1 Step 1.

  ```bash
  git add docs/superpowers/ledgers/2026-09-29-ruler-from-authoring.md && git commit -F <message-file>
  ```

  Title: `docs: ledger thực thi G2 (thước và nguồn tài liệu chấm)`

- [ ] **Step 7: Report — and say this plainly.**

  The report must state, in these words or closer:

  > **Chưa có VERDICT của `code-reviewer`.** Người dùng đã hoãn phần review tới **một lượt review chung cho G1→G5**, nên gói này bàn giao ở trạng thái "đã qua test, chưa qua review độc lập".

  And it must list: the files changed, the test totals, the migration timestamp, the `Ruling:` lines, the known gaps left open (the half-attached state when the bundle step fails, the answer key being overwritten before the DB commits, the unenforced §14.3 floor, G2b's three buttons), and the shared-file touch points that G3/G4/G5/S will need to reconcile.

  Do **not** run `finishing-a-development-branch`. Do not push, do not open a PR, do not merge. The branch and the ledger stay in place for the common review.
