# Reference-Tier Hardening (§7.2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close every open item in `CLAUDE.md`'s "§7.2 Tham chiếu" backlog — `Semester`/`Room` write access, account deactivation, ownership-transfer escape hatches, the smart semester-filter default, and bulk Excel import for `Class` — without touching the Sở hữu tier (`ExamSession`/`Submission`/`GradingResult`) at all.

**Architecture:** Every task is additive to the existing NestJS + TypeORM + Next.js/TanStack Query stack, follows the codebase's existing patterns exactly (`@Roles` guard on controller methods, 404-then-403 ownership checks in services, `AuditLogService.recordUserAction` for any operation that moves who-can-read-what, `ResourceShell`/`ResourceFormDialog` for CRUD screens). No new libraries, no new modules — every change lands inside an existing module.

**Tech Stack:** NestJS 11, TypeORM, class-validator, PostgreSQL, Next.js App Router, TanStack Query, shadcn/ui, exceljs (browser-side, already the project's chosen Excel library per CLAUDE.md §7.1).

**Spec:** `CLAUDE.md` §7.2 (Tham chiếu backlog), §1.1/§1.4 (Tham chiếu vs Sở hữu boundary, cấp-trường-không-để-role-cấp-khoa-ghi), §2.2 (Semester/Room), §3.2 (ownership matrix), §5.3 (escape-hatch pattern this plan's Task 4 extends).

## Global Constraints

- Every new write endpoint that changes ownership/access (Task 4) MUST write to `audit_log` in the SAME transaction as the write — CLAUDE.md §7.2.6, Security rule 4's underlying principle.
- No `is_current`, no banner, no global state for semester — CLAUDE.md §1.2's test applies to every task here: the system must never *refuse* an action for a semester-related reason.
- Backend service file ≤ 500 lines (CLAUDE.md File Organization Rules) — if a modified file is already close to that, extract rather than append.
- Frontend: no `apiClient` calls inside a page/component body — always through `hooks/use<Domain>.ts` or `lib/api/<domain>.ts` (CLAUDE.md Frontend rules).
- Run `pnpm --filter api build && pnpm --filter web build` after each task (CLAUDE.md: "run tests/build manually after each task" — there is no CI here).

---

## Task 1: `Semester` / `Room` write access → `admin` only

**Files:**
- Modify: `apps/api/src/course/semester.controller.ts`
- Modify: `apps/api/src/room/room.controller.ts`
- Test: `apps/api/test/semester-current.e2e-spec.ts` (or wherever the existing semester-role e2e assertions live — Step 1 finds it)
- Test: any `room*.e2e-spec.ts` asserting `department_admin` can write rooms — Step 1 finds it

**Interfaces:**
- Consumes: nothing new.
- Produces: `POST/PATCH/DELETE /semesters` and `/rooms` now require `role: 'admin'`; `GET` on both stays open to every authenticated role. No signature changes to any service method — this is a guard-only change.

- [ ] **Step 1: Find the existing tests that assert `department_admin` can write semester/room**

```bash
cd apps/api
grep -rln "department_admin" test/*.e2e-spec.ts | xargs grep -l "semester\|room" -i
```

Read whatever files this returns. You are looking for e2e tests that log in as `department_admin` and expect `201`/`200` from `POST /semesters`, `PATCH /semesters/:id`, `DELETE /semesters/:id`, or the equivalent on `/rooms`. Note their exact test names — you will flip their expected status in Step 2 and add the mirror-image `admin`-succeeds case.

- [ ] **Step 2: Write the failing tests — `department_admin` now gets 403, `admin` gets 2xx**

In the file(s) found in Step 1, change every `department_admin`-writes-semester/room test to expect `403`, and add one new test per write endpoint (`POST`, `PATCH`, `DELETE` × `semesters`, `rooms` — 6 new tests) proving `admin` succeeds. Example shape (adapt to the existing test file's login/fixture helpers — do not invent new ones):

```typescript
it('admin creates a semester', async () => {
  const { accessToken } = await loginAs(app, 'admin');
  const res = await request(app.getHttpServer())
    .post('/semesters')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ name: `Test Semester ${Date.now()}`, startDate: '2026-09-01', endDate: '2027-01-15' });
  expect(res.status).toBe(201);
});

it('department_admin can no longer create a semester', async () => {
  const { accessToken } = await loginAs(app, 'department_admin');
  const res = await request(app.getHttpServer())
    .post('/semesters')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ name: `Test Semester ${Date.now()}`, startDate: '2026-09-01', endDate: '2027-01-15' });
  expect(res.status).toBe(403);
});
```

Repeat the pair for `PATCH /semesters/:id`, `DELETE /semesters/:id`, and the three `/rooms` equivalents.

- [ ] **Step 2b: Run the new/changed tests to confirm they fail as expected**

Run: `pnpm --filter api test:e2e -- semester` and `pnpm --filter api test:e2e -- room`
Expected: the `admin`-succeeds tests FAIL (still 403, guard not changed yet); the `department_admin`-now-403 tests FAIL (still succeeding, old guard).

- [ ] **Step 3: Flip the guards**

In `apps/api/src/course/semester.controller.ts`, change all three write decorators:

```typescript
@Post()
@Roles('admin')
create(@Body() dto: CreateSemesterDto) {

@Patch(':id')
@Roles('admin')
update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateSemesterDto) {

@Delete(':id')
@Roles('admin')
@HttpCode(204)
remove(@Param('id', ParseUUIDPipe) id: string) {
```

Update the class-doc comment above `SemesterController` (currently says "write thuộc Phòng Đào tạo... write thuộc Trưởng khoa" — both stale) to:

```typescript
/**
 * Read mở cho mọi role (bộ lọc học kỳ ở mọi màn hình cần danh sách này);
 * write thuộc `admin` — CLAUDE.md §1.4/§2.2: học kỳ là tài nguyên cấp
 * trường, không role cấp khoa nào được ghi lên nó.
 *
 * Không có ownership check: học kỳ là của toàn trường, không ai sở hữu riêng.
 */
```

Do the identical three-decorator change plus doc-comment update in `apps/api/src/room/room.controller.ts`.

- [ ] **Step 4: Run the tests again**

Run: `pnpm --filter api test:e2e -- semester` and `pnpm --filter api test:e2e -- room`
Expected: PASS, all of them.

- [ ] **Step 5: Update CLAUDE.md**

In `CLAUDE.md`, in the "Academic Structure & Ownership Model" section:
- §2 role table: change the `department_admin` row's "Hiện còn ghi được Semester và Room — đang chuyển về admin" sentence to state it is now `admin`-only.
- §2.2: remove the "Trạng thái hiện tại (`main`) CHƯA đúng như vậy" paragraph — it is now correct.
- §3.2 table: update the `Semester`/`Room` "Chủ sở hữu" cells to drop the "hiện tại vẫn là department_admin" qualifier.
- §7.2.2: mark the whole item `✅ Đã làm (2026-09-10)`, keep the reasoning paragraph as history.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/course/semester.controller.ts apps/api/src/room/room.controller.ts apps/api/test/*.e2e-spec.ts CLAUDE.md
git commit -m "feat(auth): Semester/Room write access moves to admin only

CLAUDE.md §1.4/§2.2: these are school-wide resources, and any
department_admin could create/edit/delete another department's terms
or rooms with no ownership check to stop them. Read stays open to
every role."
```

---

## Task 2: Account deactivation (`is_active`)

**Files:**
- Create: `apps/api/src/database/migrations/<timestamp>-AddAccountIsActive.ts`
- Modify: `apps/api/src/identity/entities/account.entity.ts`
- Modify: `apps/api/src/accounts/accounts.service.ts`
- Modify: `apps/api/src/accounts/accounts.controller.ts`
- Modify: `apps/api/src/accounts/dto/update-account.dto.ts`
- Modify: `apps/api/src/auth/auth.service.ts`
- Test: `apps/api/src/accounts/accounts.service.spec.ts`
- Test: `apps/api/test/auth.e2e-spec.ts`
- Modify: `apps/web/src/app/admin/accounts/page.tsx`
- Modify: `apps/web/src/lib/api/accounts.ts`, `apps/web/src/hooks/useAccounts.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `AccountEntity.isActive: boolean` (default `true`); `AccountsService.deactivate(id: string): Promise<void>` and `AccountsService.reactivate(id: string): Promise<void>`; `AuthService.login` throws `UnauthorizedException` for an inactive account. Task 4 (below) will read `account.isActive` when validating a reassignment target — plan around this column existing.

- [ ] **Step 1: Write the failing unit test for the login rejection**

In `apps/api/src/auth/auth.service.spec.ts` (read the existing file first to match its mocking style exactly — likely a mocked `Repository<AccountEntity>`):

```typescript
it('refuses login for a deactivated account', async () => {
  const inactiveAccount = { id: 'a1', email: 't@x.com', passwordHash: await argon2.hash('Password123!'), role: 'teacher', isActive: false };
  accountsRepo.findOne.mockResolvedValue(inactiveAccount);

  await expect(service.login({ email: 't@x.com', password: 'Password123!' })).rejects.toThrow(UnauthorizedException);
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `pnpm --filter api test -- auth.service.spec`
Expected: FAIL — `isActive` does not exist on the mock type / login does not check it.

- [ ] **Step 3: Add the migration**

```bash
cd apps/api
pnpm migration:generate src/database/migrations/AddAccountIsActive
```

First add the column to the entity (Step 4) — `migration:generate` diffs the entity against the live DB, so the entity change must exist before generating. Come back to this step after Step 4, then verify the generated migration contains exactly:

```typescript
await queryRunner.query(`ALTER TABLE "examcollect"."account" ADD "is_active" boolean NOT NULL DEFAULT true`);
```

in `up()`, and the matching `DROP COLUMN` in `down()`. Delete and re-generate if TypeORM added anything else (a stray index rename, etc. — diff against a fresh migration:generate run is not always minimal).

- [ ] **Step 4: Add the column to the entity**

In `apps/api/src/identity/entities/account.entity.ts`:

```typescript
  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;
```

Add above it:
```typescript
  // Xoá cứng một Account đã có audit log là bất khả (audit bất biến — xem
  // AccountsService.remove). Đây là công cụ thật cho nhân sự nghỉ việc:
  // vô hiệu hoá chặn đăng nhập ngay, không xoá gì, không phá vỡ FK nào
  // đang trỏ vào account này (course.department_head_id, class.teacher_id...).
```

- [ ] **Step 5: Run the migration against the dev DB**

Run: `pnpm migration:run` (from `apps/api`)
Expected: `AddAccountIsActive<timestamp> has been executed successfully.`

- [ ] **Step 6: Make the login test pass**

In `apps/api/src/auth/auth.service.ts`, find the `login` method's account-lookup block and add the check immediately after the password-verify succeeds (before issuing tokens):

```typescript
if (!account.isActive) {
  throw new UnauthorizedException('Tài khoản đã bị vô hiệu hoá.');
}
```

- [ ] **Step 7: Run the test again**

Run: `pnpm --filter api test -- auth.service.spec`
Expected: PASS.

- [ ] **Step 8: Write the failing e2e test for the deactivate/reactivate endpoints**

In `apps/api/test/auth.e2e-spec.ts` or a new `apps/api/test/accounts-deactivation.e2e-spec.ts` (check whether an `accounts.e2e-spec.ts` already exists first — extend it if so):

```typescript
it('admin deactivates a teacher, who can no longer log in', async () => {
  const admin = await loginAs(app, 'admin');
  const teacher = await createTestAccount(app, { role: 'teacher' }); // adapt to existing fixture helper

  const deactivateRes = await request(app.getHttpServer())
    .patch(`/accounts/${teacher.id}/deactivate`)
    .set('Authorization', `Bearer ${admin.accessToken}`);
  expect(deactivateRes.status).toBe(204);

  const loginRes = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ email: teacher.email, password: teacher.password });
  expect(loginRes.status).toBe(401);
});

it('admin reactivates a deactivated teacher', async () => {
  const admin = await loginAs(app, 'admin');
  const teacher = await createTestAccount(app, { role: 'teacher' });
  await request(app.getHttpServer())
    .patch(`/accounts/${teacher.id}/deactivate`)
    .set('Authorization', `Bearer ${admin.accessToken}`);

  const reactivateRes = await request(app.getHttpServer())
    .patch(`/accounts/${teacher.id}/reactivate`)
    .set('Authorization', `Bearer ${admin.accessToken}`);
  expect(reactivateRes.status).toBe(204);

  const loginRes = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ email: teacher.email, password: teacher.password });
  expect(loginRes.status).toBe(200);
});

it('teacher cannot deactivate accounts', async () => {
  const teacher = await loginAs(app, 'teacher');
  const other = await createTestAccount(app, { role: 'teacher' });
  const res = await request(app.getHttpServer())
    .patch(`/accounts/${other.id}/deactivate`)
    .set('Authorization', `Bearer ${teacher.accessToken}`);
  expect(res.status).toBe(403);
});
```

- [ ] **Step 9: Run to confirm failure**

Run: `pnpm --filter api test:e2e -- accounts`
Expected: FAIL — routes don't exist (404).

- [ ] **Step 10: Add the service methods**

In `apps/api/src/accounts/accounts.service.ts`, add after `remove()`:

```typescript
  async deactivate(id: string): Promise<void> {
    await this.findOrThrow(id);
    await this.accounts.update(id, { isActive: false });
  }

  async reactivate(id: string): Promise<void> {
    await this.findOrThrow(id);
    await this.accounts.update(id, { isActive: true });
  }
```

- [ ] **Step 11: Add the controller routes**

In `apps/api/src/accounts/accounts.controller.ts`, add (class already carries `@Roles('admin')`, so no per-route decorator needed — matches the existing `create`/`update`/`remove` routes on this controller):

```typescript
  @Patch(':id/deactivate')
  @HttpCode(204)
  async deactivate(@Param('id') id: string) {
    await this.accounts.deactivate(id);
  }

  @Patch(':id/reactivate')
  @HttpCode(204)
  async reactivate(@Param('id') id: string) {
    await this.accounts.reactivate(id);
  }
```

Declared after `update`/before `remove` — no ordering hazard since these are literal path segments (`:id/deactivate`), not competing with `:id` alone.

- [ ] **Step 12: Include `isActive` in `AccountView`**

In `apps/api/src/accounts/accounts.service.ts`, add `isActive: boolean` to the `AccountView` interface and to `toView()`'s return object (`isActive: account.isActive`) — the admin accounts list needs to show this.

- [ ] **Step 13: Run e2e tests again**

Run: `pnpm --filter api test:e2e -- accounts`
Expected: PASS.

- [ ] **Step 14: Frontend — show status + toggle on the admin accounts page**

Read `apps/web/src/app/admin/accounts/page.tsx` and `apps/web/src/lib/api/accounts.ts` first to match existing structure exactly.

In `apps/web/src/lib/api/accounts.ts`, add to `AccountView`: `isActive: boolean;`. Add two functions mirroring `deleteAccount`'s shape:

```typescript
export async function deactivateAccount(id: string): Promise<void> {
  const { error, response } = await apiClient.PATCH('/accounts/{id}/deactivate', { params: { path: { id } } });
  await throwIfFailed(error, response);
}

export async function reactivateAccount(id: string): Promise<void> {
  const { error, response } = await apiClient.PATCH('/accounts/{id}/reactivate', { params: { path: { id } } });
  await throwIfFailed(error, response);
}
```

In `apps/web/src/hooks/useAccounts.ts`, add `useDeactivateAccount`/`useReactivateAccount` mirroring `useDeleteAccount`'s exact shape (mutation + `invalidateQueries([ACCOUNTS_QUERY_KEY])`).

In `apps/web/src/app/admin/accounts/page.tsx`: add a "Trạng thái" column rendering a badge (`isActive ? 'Hoạt động' : 'Đã vô hiệu hoá'`), and a row action button toggling deactivate/reactivate based on current state — mirror the existing edit/delete row-action pattern in this file exactly (same button variant, same confirm-dialog pattern if delete uses one).

- [ ] **Step 15: Run web build**

Run: `pnpm --filter web build`
Expected: PASS, no type errors.

- [ ] **Step 16: Update CLAUDE.md**

§6 table: remove the "Xóa Account đã thao tác — chưa xây" row's "chưa xây" framing; §7.2.8: mark `✅ Đã làm (2026-09-10)`.

- [ ] **Step 17: Commit**

```bash
git add apps/api/src/database/migrations apps/api/src/identity/entities/account.entity.ts apps/api/src/accounts apps/api/src/auth/auth.service.ts apps/api/test apps/web/src/app/admin/accounts apps/web/src/lib/api/accounts.ts apps/web/src/hooks/useAccounts.ts CLAUDE.md
git commit -m "feat(accounts): deactivate/reactivate instead of hard delete

CLAUDE.md §7.2.8 — audit_log's immutability makes hard-deleting an
account that ever performed a logged action impossible (correctly).
This is the actual tool for staff leaving: blocks login, touches no
FK, no data loss."
```

---

## Task 3: `ExamSession` teacher-reassignment escape hatch

**Files:**
- Create: `apps/api/src/exam-session/dto/reassign-teacher.dto.ts`
- Modify: `apps/api/src/exam-session/exam-session.controller.ts`
- Modify: `apps/api/src/exam-session/exam-session.service.ts`
- Test: `apps/api/test/exam-session-reassign.e2e-spec.ts` (new)

**Interfaces:**
- Consumes: `AuditLogService.recordUserAction` (existing, `apps/api/src/admin/audit-log.service.ts`).
- Produces: `ExamSessionService.reassignTeacher(id: string, newTeacherId: string, actorId: string): Promise<ExamSessionEntity>` — `admin`-only, audited, old teacher loses access the instant the row is updated (every ownership check in this codebase reads `teacher_id` live, so no separate revoke step exists or is needed).

- [ ] **Step 1: Write the failing e2e test**

```typescript
// apps/api/test/exam-session-reassign.e2e-spec.ts
describe('PATCH /exam-sessions/:id/teacher', () => {
  it('admin reassigns a session to a different teacher', async () => {
    const admin = await loginAs(app, 'admin');
    const { session, originalTeacher } = await seedExamSessionOwnedByTeacher(app); // adapt to existing e2e seed helpers used by other exam-session e2e specs — read one for the exact fixture shape
    const newTeacher = await createTestAccount(app, { role: 'teacher' });

    const res = await request(app.getHttpServer())
      .patch(`/exam-sessions/${session.id}/teacher`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ teacherId: newTeacher.id });
    expect(res.status).toBe(200);
    expect(res.body.teacherId).toBe(newTeacher.id);

    // Old teacher loses access immediately — no grace period.
    const oldTeacherRes = await request(app.getHttpServer())
      .get(`/exam-sessions/${session.id}`)
      .set('Authorization', `Bearer ${originalTeacher.accessToken}`);
    expect(oldTeacherRes.status).toBe(403);

    // New teacher has access.
    const newTeacherRes = await request(app.getHttpServer())
      .get(`/exam-sessions/${session.id}`)
      .set('Authorization', `Bearer ${newTeacher.accessToken}`);
    expect(newTeacherRes.status).toBe(200);
  });

  it('writes an audit_log entry naming old and new teacher', async () => {
    const admin = await loginAs(app, 'admin');
    const { session } = await seedExamSessionOwnedByTeacher(app);
    const newTeacher = await createTestAccount(app, { role: 'teacher' });

    await request(app.getHttpServer())
      .patch(`/exam-sessions/${session.id}/teacher`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ teacherId: newTeacher.id });

    const entries = await queryAuditLog(app, { targetType: 'exam_session', targetId: session.id }); // adapt to however other e2e specs read audit_log — teacher-review.e2e-spec.ts's review test already does this, mirror it
    expect(entries).toContainEqual(expect.objectContaining({ action: 'exam_session.reassign_teacher' }));
  });

  it('department_admin cannot reassign', async () => {
    const head = await loginAs(app, 'department_admin');
    const { session } = await seedExamSessionOwnedByTeacher(app);
    const newTeacher = await createTestAccount(app, { role: 'teacher' });

    const res = await request(app.getHttpServer())
      .patch(`/exam-sessions/${session.id}/teacher`)
      .set('Authorization', `Bearer ${head.accessToken}`)
      .send({ teacherId: newTeacher.id });
    expect(res.status).toBe(403);
  });

  it('rejects a target that is not a teacher account', async () => {
    const admin = await loginAs(app, 'admin');
    const { session } = await seedExamSessionOwnedByTeacher(app);
    const notATeacher = await loginAs(app, 'department_admin');

    const res = await request(app.getHttpServer())
      .patch(`/exam-sessions/${session.id}/teacher`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ teacherId: notATeacher.accountId }); // adapt field name to loginAs's return shape
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `pnpm --filter api test:e2e -- exam-session-reassign`
Expected: FAIL — 404, route doesn't exist.

- [ ] **Step 3: Add the DTO**

```typescript
// apps/api/src/exam-session/dto/reassign-teacher.dto.ts
import { IsUUID } from 'class-validator';

/** Admin-only escape hatch — see ExamSessionService.reassignTeacher. */
export class ReassignTeacherDto {
  @IsUUID()
  teacherId!: string;
}
```

- [ ] **Step 4: Add the service method**

Read `apps/api/src/exam-session/exam-session.service.ts` in full first to match its constructor injections and existing patterns (it already injects `AccountEntity` repository or not — check before assuming; if not, inject it, matching how `class.service.ts.assertIsTeacher` does it). Add:

```typescript
  /**
   * Chuyển chủ một ExamSession sang giảng viên khác — admin-only escape
   * hatch cho lỗ hổng ở CLAUDE.md §5.5: Trưởng khoa đổi teacherId của Class
   * không kéo theo các ExamSession đã tạo trước đó.
   *
   * Nhạy cảm hơn Course.assignOwner (CLAUDE.md §7.2.6): ExamSession thuộc
   * tầng Sở hữu, nên đổi teacher_id đổi luôn ai đọc được bài nộp/điểm đã
   * thu — audit là bắt buộc, không phải tuỳ chọn. Giảng viên cũ mất quyền
   * đọc NGAY LẬP TỨC: mọi check sở hữu trong codebase này đọc teacher_id
   * trực tiếp (xem findEntityForOwner), nên đổi cột này là đủ, không cần
   * bước "thu hồi quyền" riêng.
   */
  async reassignTeacher(
    id: string,
    newTeacherId: string,
    actorId: string,
  ): Promise<ExamSessionEntity> {
    const session = await this.sessions.findOne({ where: { id } });
    if (!session) {
      throw new NotFoundException('Exam session not found');
    }

    const target = await this.accounts.findOne({
      where: { id: newTeacherId },
      select: { id: true, role: true, isActive: true },
    });
    if (!target || target.role !== 'teacher') {
      throw new BadRequestException('Chỉ chuyển được phiên thi cho tài khoản giảng viên');
    }
    if (!target.isActive) {
      throw new BadRequestException('Tài khoản giảng viên này đã bị vô hiệu hoá');
    }

    const previousTeacherId = session.teacherId;

    return this.dataSource.transaction(async (manager) => {
      session.teacherId = newTeacherId;
      const saved = await manager.getRepository(ExamSessionEntity).save(session);

      await this.auditLog.recordUserAction(
        {
          actorId,
          action: 'exam_session.reassign_teacher',
          targetType: 'exam_session',
          targetId: session.id,
          oldValue: { teacherId: previousTeacherId },
          newValue: { teacherId: newTeacherId },
        },
        manager,
      );

      return saved;
    });
  }
```

This depends on Task 2's `isActive` column existing on `AccountEntity` — if executing this plan's tasks out of order, add `isActive: true` as a literal in the `select`/check only after Task 2 lands, or drop that one line and re-add it once Task 2 is merged.

Add `AuditLogService` and `DataSource` to the constructor if not already present (check first — `CourseService.assignOwner` in `apps/api/src/course/course.service.ts` is the reference implementation for this exact pattern; copy its constructor injection style).

- [ ] **Step 5: Add the controller route**

In `apps/api/src/exam-session/exam-session.controller.ts`:

```typescript
  @Patch(':id/teacher')
  @Roles('admin')
  async reassignTeacher(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReassignTeacherDto,
    @Req() req: Request,
  ) {
    return this.examSessions.reassignTeacher(id, dto.teacherId, req.user!.sub);
  }
```

Import `ReassignTeacherDto`. This is the first `@Roles('admin')` route on this controller — the class-level guard stack (`@UseGuards(JwtAuthGuard, RolesGuard)`) already supports per-method `@Roles`, matching every other controller in this codebase.

- [ ] **Step 6: Run the tests**

Run: `pnpm --filter api test:e2e -- exam-session-reassign`
Expected: PASS.

- [ ] **Step 7: Update CLAUDE.md**

§5.5: append "— xem §7.2.6 cho escape hatch đã implement." §7.2.6: mark `✅ Đã làm (2026-09-10)`, keep the reasoning.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/exam-session apps/api/test CLAUDE.md
git commit -m "feat(exam-session): admin escape hatch to reassign a session's teacher

Closes the gap in CLAUDE.md §5.5 — a Class's teacherId changing did
not carry existing ExamSessions with it, and no role had a way to
fix an already-created session. Audited (this is a Sở hữu-tier
access change, not a Tham chiếu one) and revokes the old teacher's
access immediately."
```

---

## Task 4: Semester filter — smart default + `isStale` warning

**Files:**
- Create: `apps/web/src/hooks/useSemesterFilter.ts`
- Create: `apps/web/src/components/layout/semester-filter.tsx`
- Modify: `apps/api/src/course/dto/semester-scope.dto.ts` (create if it does not already exist on `main` — check first, `feat/role-ownership-boundary` had one but that branch's history is not `main`'s)
- Modify: `apps/api/src/course/class.controller.ts` (`findTeaching` route)
- Modify: `apps/api/src/course/class.service.ts` (`findForTeacher`)
- Modify: `apps/web/src/app/teacher/classes/page.tsx`
- Modify: `apps/web/src/lib/api/department.ts` / wherever `findForTeacher`'s frontend caller lives (check `apps/web/src/hooks/useDepartment.ts` for `useMyClasses`-equivalent for teachers — likely a separate hook since teacher and department_admin see different shapes)
- Test: `apps/web/src/hooks/useSemesterFilter.test.ts`
- Test: `apps/api/test/classes-teaching-semester-filter.e2e-spec.ts` (new)

**Interfaces:**
- Consumes: `GET /semesters` (existing, unchanged — returns `Semester[]` with `startDate`/`endDate`, no `isCurrent` field, it was removed in the 2026-09-10 revert and must not be reintroduced).
- Produces: `useSemesterFilter(scopeKey: string): { semesterId: string | null; setSemesterId: (v: string | null) => void; semesters: Semester[]; current: Semester | null; isLoading: boolean; isStale: boolean; staleDays: number }` — `current` here means "the smart default", not a stored flag. `GET /classes/teaching?semesterId=<uuid>` — optional query param, unfiltered when absent.

- [ ] **Step 1: Write the failing unit test for the smart-default computation**

```typescript
// apps/web/src/hooks/useSemesterFilter.test.ts
import { describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useSemesterFilter } from './useSemesterFilter';

vi.mock('./useDepartment', () => ({
  useSemesters: () => ({
    data: [
      { id: 's1', name: 'HK1 2025-2026', startDate: '2025-09-01', endDate: '2026-01-15' },
      { id: 's2', name: 'HK2 2025-2026', startDate: '2026-02-01', endDate: '2026-06-15' },
      { id: 's3', name: 'HK1 2026-2027', startDate: '2026-09-01', endDate: '2027-01-15' },
    ],
    isLoading: false,
  }),
}));

describe('useSemesterFilter default selection', () => {
  it('picks the most recently STARTED semester, not the one with the latest start_date', () => {
    vi.setSystemTime(new Date('2026-10-15')); // trong HK1 2026-2027, nhưng cũng sau khi HK1 đã start
    const { result } = renderHook(() => useSemesterFilter('test-page'));
    expect(result.current.current?.id).toBe('s3');
  });

  it('does NOT jump to a future semester whose start_date is later but has not started', () => {
    vi.setSystemTime(new Date('2026-08-15')); // trước khi HK1 2026-2027 bắt đầu, HK2 2025-2026 vẫn là kỳ gần nhất đã bắt đầu
    const { result } = renderHook(() => useSemesterFilter('test-page'));
    expect(result.current.current?.id).toBe('s2');
  });

  it('falls back to the SOONEST upcoming semester when none has started yet', () => {
    vi.setSystemTime(new Date('2025-01-01')); // trước tất cả 3 kỳ
    const { result } = renderHook(() => useSemesterFilter('test-page'));
    expect(result.current.current?.id).toBe('s1');
  });

  it('isStale is true when the default-picked semester already ended', () => {
    vi.setSystemTime(new Date('2026-01-20')); // 5 ngày sau endDate của s1 (2026-01-15)
    const { result } = renderHook(() => useSemesterFilter('test-page'));
    expect(result.current.current?.id).toBe('s1');
    expect(result.current.isStale).toBe(true);
    expect(result.current.staleDays).toBe(5);
  });

  it('isStale is false right on the end date (still counts as current that day)', () => {
    vi.setSystemTime(new Date('2026-01-15T23:00:00'));
    const { result } = renderHook(() => useSemesterFilter('test-page'));
    expect(result.current.isStale).toBe(false);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `pnpm --filter web test -- useSemesterFilter`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement the hook**

```typescript
// apps/web/src/hooks/useSemesterFilter.ts
'use client';

import { useEffect, useRef, useState } from 'react';
import { useSemesters } from '@/hooks/useDepartment';
import type { Semester } from '@/lib/api/department';

const DAY_MS = 86_400_000;

export interface SemesterFilterState {
  /** `null` = tất cả học kỳ. */
  semesterId: string | null;
  setSemesterId: (value: string | null) => void;
  semesters: Semester[];
  /**
   * Kỳ "hợp lý nhất hôm nay" — TÍNH TỪ NGÀY, không đọc cờ nào. KHÔNG phải
   * is_current quay lại: không lưu, không API set-current, không banner,
   * không chặn thao tác. CLAUDE.md §7.2.3.
   */
  current: Semester | null;
  isLoading: boolean;
  /** Kỳ mặc định đã quá `end_date` — không tự sửa, nên phải nói ra. */
  isStale: boolean;
  staleDays: number;
}

/**
 * Kỳ "hợp lý nhất hôm nay": ưu tiên kỳ ĐÃ BẮT ĐẦU gần hôm nay nhất; nếu
 * chưa kỳ nào bắt đầu (hệ thống mới cài), lấy kỳ SẮP TỚI gần nhất.
 *
 * KHÔNG dùng MAX(start_date) vô điều kiện: Trưởng khoa có thể tạo sẵn kỳ
 * sau trong khi cả trường vẫn ở kỳ hiện tại — MAX đơn giản sẽ nhảy sang kỳ
 * tương lai chưa ai có lớp. CLAUDE.md §7.2.3 giải thích đầy đủ.
 */
function pickDefaultSemester(semesters: Semester[]): Semester | null {
  const now = Date.now();
  const started = semesters
    .filter((s) => new Date(s.startDate).getTime() <= now)
    .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());
  if (started.length > 0) {
    return started[0];
  }
  const upcoming = semesters
    .filter((s) => new Date(s.startDate).getTime() > now)
    .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
  return upcoming[0] ?? null;
}

/**
 * Bộ lọc kỳ dùng chung cho mọi màn hình danh sách.
 *
 * Logic gieo-một-lần nằm Ở ĐÂY: tính lại mặc định mỗi render sẽ ghi đè
 * lựa chọn thủ công của người dùng ngay khi query refetch.
 *
 * `scopeKey` là định danh TRANG, không phải dữ liệu — điều hướng sang màn
 * hình khác thì gieo lại từ kỳ mặc định, dữ liệu về lại trên cùng trang
 * thì không.
 */
export function useSemesterFilter(scopeKey: string): SemesterFilterState {
  const { data, isLoading } = useSemesters();
  const semesters = data ?? [];
  const current = pickDefaultSemester(semesters);

  const [semesterId, setSemesterId] = useState<string | null>(null);
  const seededFor = useRef<string | null>(null);

  useEffect(() => {
    if (isLoading || seededFor.current === scopeKey) {
      return;
    }
    seededFor.current = scopeKey;
    setSemesterId(current?.id ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- gieo một lần theo scopeKey, không theo current (xem comment trên)
  }, [isLoading, scopeKey]);

  const staleFrom = current ? new Date(current.endDate).getTime() + DAY_MS : 0;
  const staleMs = current ? Date.now() - staleFrom : 0;
  const isStale = current !== null && staleMs > 0;

  return {
    semesterId,
    setSemesterId,
    semesters,
    current,
    isLoading,
    isStale,
    staleDays: isStale ? Math.floor(staleMs / DAY_MS) : 0,
  };
}
```

- [ ] **Step 4: Run the test again**

Run: `pnpm --filter web test -- useSemesterFilter`
Expected: PASS.

- [ ] **Step 5: Build the display component**

```typescript
// apps/web/src/components/layout/semester-filter.tsx
'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Semester } from '@/lib/api/department';

interface SemesterFilterProps {
  value: string | null;
  onChange: (value: string | null) => void;
  semesters: Semester[];
  current: Semester | null;
  isStale: boolean;
  staleDays: number;
}

/**
 * Một control cho mọi màn hình danh sách. "Tất cả học kỳ" luôn có mặt —
 * lối thoát một click khi mặc định không đúng ý người dùng.
 */
export function SemesterFilter({
  value,
  onChange,
  semesters,
  current,
  isStale,
  staleDays,
}: SemesterFilterProps) {
  return (
    <div className="flex flex-col gap-1">
      <Select value={value ?? 'all'} onValueChange={(next) => onChange(next === 'all' ? null : next)}>
        <SelectTrigger className="sm:w-64" aria-label="Lọc theo học kỳ">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Tất cả học kỳ</SelectItem>
          {semesters.map((semester) => (
            <SelectItem key={semester.id} value={semester.id}>
              {semester.name}
              {current?.id === semester.id ? ' — mặc định' : ''}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Chỉ hiện khi hệ thống TỰ chọn kỳ này làm mặc định — người dùng chủ
          động xem kỳ cũ không phải hệ thống đoán sai. */}
      {isStale && (
        <span className="text-caption text-muted-foreground">
          Học kỳ mặc định đã kết thúc {staleDays} ngày trước.
        </span>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Write the failing e2e test for the backend filter param**

Read `apps/api/src/course/class.controller.ts` and `class.service.ts` (already loaded this session) to confirm `SemesterScopeDto` does not exist on `main` yet — it does not (that DTO came from a branch never merged; `findForTeacher(teacherId: string)` currently takes no filter param).

```typescript
// apps/api/test/classes-teaching-semester-filter.e2e-spec.ts
describe('GET /classes/teaching?semesterId=', () => {
  it('filters to only classes whose course is in the given semester', async () => {
    const teacher = await loginAs(app, 'teacher');
    const { classInSemesterA, classInSemesterB, semesterA } = await seedTeacherWithTwoSemesters(app); // adapt to existing seed helper conventions in this test suite

    const res = await request(app.getHttpServer())
      .get(`/classes/teaching?semesterId=${semesterA.id}`)
      .set('Authorization', `Bearer ${teacher.accessToken}`);

    expect(res.status).toBe(200);
    const ids = res.body.map((c: { id: string }) => c.id);
    expect(ids).toContain(classInSemesterA.id);
    expect(ids).not.toContain(classInSemesterB.id);
  });

  it('with no semesterId, returns classes across all semesters (unchanged behavior)', async () => {
    const teacher = await loginAs(app, 'teacher');
    const { classInSemesterA, classInSemesterB } = await seedTeacherWithTwoSemesters(app);

    const res = await request(app.getHttpServer())
      .get('/classes/teaching')
      .set('Authorization', `Bearer ${teacher.accessToken}`);

    const ids = res.body.map((c: { id: string }) => c.id);
    expect(ids).toContain(classInSemesterA.id);
    expect(ids).toContain(classInSemesterB.id);
  });
});
```

- [ ] **Step 7: Run to confirm failure**

Run: `pnpm --filter api test:e2e -- classes-teaching-semester-filter`
Expected: FAIL — extra query param currently silently ignored, so the FIRST test fails (both classes returned).

- [ ] **Step 8: Add the DTO**

```typescript
// apps/api/src/course/dto/semester-scope.dto.ts
import { IsOptional, IsUUID } from 'class-validator';

export class SemesterScopeDto {
  @IsOptional()
  @IsUUID()
  semesterId?: string;
}
```

- [ ] **Step 9: Thread it through the controller and service**

In `apps/api/src/course/class.controller.ts`, change `findTeaching`:

```typescript
  @Get('teaching')
  @Roles('teacher')
  findTeaching(@Query() query: SemesterScopeDto, @Req() req: Request) {
    return this.classes.findForTeacher(req.user!.sub, query.semesterId);
  }
```

Import `SemesterScopeDto` and `Query`.

In `apps/api/src/course/class.service.ts`, change `findForTeacher`'s signature and add the filter — mirror the AND-not-branch pattern already used in `findForHead`'s comment ("`semesterId` AND vào `departmentHeadId`, không thay thế nó"):

```typescript
  async findForTeacher(
    teacherId: string,
    semesterId?: string,
  ): Promise<TeachingClassView[]> {
    const qb = this.classes
      .createQueryBuilder('k')
      .innerJoinAndSelect('k.course', 'course')
      .leftJoin('enrollment', 'e', 'e.home_class_id = k.id')
      .addSelect('COUNT(e.id)', 'studentCount')
      .where('k.teacherId = :teacherId', { teacherId });

    if (semesterId) {
      qb.andWhere('course.semesterId = :semesterId', { semesterId });
    }

    const { entities, raw } = await qb
      .groupBy('k.id')
      .addGroupBy('course.id')
      .orderBy('course.code', 'ASC')
      .addOrderBy('k.name', 'ASC')
      .getRawAndEntities<{ studentCount: string }>();

    return entities.map((klass, index) => ({
      id: klass.id,
      name: klass.name,
      courseId: klass.courseId,
      courseCode: klass.course.code,
      courseName: klass.course.name,
      studentCount: parseInt(raw[index].studentCount, 10),
    }));
  }
```

(This is the existing method with one `if` block inserted — do not otherwise restructure it.)

- [ ] **Step 10: Run the e2e tests again**

Run: `pnpm --filter api test:e2e -- classes-teaching-semester-filter`
Expected: PASS.

- [ ] **Step 11: Wire the filter into `/teacher/classes`**

Read `apps/web/src/app/teacher/classes/page.tsx` and whatever hook it currently uses to fetch classes (likely `useMyTeachingClasses` or similar in a teacher-scoped hooks file — find it via `grep -rn "classes/teaching" apps/web/src`). Add `semesterId` as a param to that hook's query (mirroring how `useCourseCatalog`/`useMyClasses` already accept filter params elsewhere in this codebase), render `<SemesterFilter>` above the class table using `useSemesterFilter('teacher-classes')`, and pass `semesterFilter.semesterId` into the classes query.

- [ ] **Step 12: Run web build and existing page tests**

Run: `pnpm --filter web build` and `pnpm --filter web test -- teacher/classes`
Expected: both PASS. Fix any existing snapshot/assertion in `teacher/classes/page.test.tsx` that assumed no filter UI was present.

- [ ] **Step 13: Update CLAUDE.md**

§5.4: remove "(sẽ có...)" hedge, state the formula is implemented, link to this plan file. §7.2.3: mark `✅ Đã làm (2026-09-10)`.

- [ ] **Step 14: Commit**

```bash
git add apps/web/src/hooks/useSemesterFilter.ts apps/web/src/hooks/useSemesterFilter.test.ts apps/web/src/components/layout/semester-filter.tsx apps/web/src/app/teacher/classes apps/api/src/course apps/api/test CLAUDE.md
git commit -m "feat(web): semester filter with a date-computed default, not a flag

CLAUDE.md §7.2.3 — default is 'most recently STARTED semester', not
MAX(start_date), so a head pre-creating next term's Semester row
doesn't strand the teacher's default view on an empty future term.
isStale is a display fact computed from end_date, never stored."
```

---

## Task 5: Read-only ownership counts on the department head's class list

**Files:**
- Modify: `apps/api/src/course/class.service.ts` (`findForHead`)
- Modify: `apps/api/src/course/course.types.ts` (the class-list view type)
- Modify: `apps/web/src/app/department/classes/page.tsx`
- Modify: `apps/web/src/lib/api/department.ts` (the `Klass` type)
- Test: `apps/api/src/course/class.service.spec.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `ClassService.findForHead(headId: string): Promise<ClassWithCountsView[]>` where `ClassWithCountsView` adds `rosterCount: number`, `examSessionCount: number`, `gradedCount: number` to the existing shape. **These are counts only — no submission/grade content crosses this boundary (CLAUDE.md §7.2.5).**

- [ ] **Step 1: Write the failing unit test**

Read `apps/api/src/course/class.service.spec.ts` first to match its existing mock/setup style for `findForHead` (or the closest analogous test in that file) exactly.

```typescript
it('findForHead includes roster/session/graded counts per class', async () => {
  // Seed: one course owned by headId, one class under it, 3 enrollment
  // rows (roster), 2 exam_session rows, 1 of those with a graded (i.e.
  // grading_result.status IN ('auto_approved','flagged_for_review',
  // 'teacher_reviewed','finalized','exported')) submission.
  const result = await service.findForHead(headId);
  expect(result[0]).toMatchObject({
    rosterCount: 3,
    examSessionCount: 2,
    gradedCount: 1,
  });
});
```

Adapt table/fixture names to whatever seeding helper this spec file already uses (unit specs in this codebase mock the repository directly rather than hitting a real DB — check the file's existing pattern before assuming an integration-style seed is even the right shape here; if `class.service.spec.ts` mocks `Repository<ClassEntity>.createQueryBuilder()`, write the test against a mocked query builder chain returning the raw counts instead of seeding real rows).

- [ ] **Step 2: Run to confirm failure**

Run: `pnpm --filter api test -- class.service.spec`
Expected: FAIL.

- [ ] **Step 3: Add the counts to `findForHead`**

In `apps/api/src/course/class.service.ts`, replace the current `findForHead` (a plain `this.classes.find(...)`) with a query-builder version carrying three `LEFT JOIN + COUNT DISTINCT`:

```typescript
  /**
   * Every class under every course this head owns, kèm 3 cột đếm read-only
   * (CLAUDE.md §7.2.5): sĩ số roster, số phiên thi, số bài đã chấm.
   *
   * CHỈ ĐẾM — không bao giờ trả nội dung bài nộp/điểm. Đây là lần đầu tiên
   * department_admin chạm tới tầng Sở hữu (CLAUDE.md §1.1), dù chỉ qua một
   * con số; ranh giới này giữ tường minh bằng cách không SELECT bất kỳ cột
   * nào của submission/grading_result ngoài COUNT().
   */
  async findForHead(headId: string): Promise<ClassWithCountsView[]> {
    const owned = await this.courses.find({
      where: { departmentHeadId: headId },
      select: { id: true },
    });
    if (owned.length === 0) {
      return [];
    }

    const { entities, raw } = await this.classes
      .createQueryBuilder('k')
      .leftJoin('enrollment', 'e', 'e.home_class_id = k.id')
      .leftJoin('exam_session', 'sess', 'sess.class_id = k.id')
      .leftJoin(
        'grading_result',
        'g',
        `g.submission_id IN (
           SELECT s.id FROM submission s WHERE s.exam_session_id = sess.id
         ) AND g.status IN ('auto_approved', 'flagged_for_review', 'teacher_reviewed', 'finalized', 'exported')`,
      )
      .addSelect('COUNT(DISTINCT e.id)', 'rosterCount')
      .addSelect('COUNT(DISTINCT sess.id)', 'examSessionCount')
      .addSelect('COUNT(DISTINCT g.id)', 'gradedCount')
      .where('k.courseId IN (:...courseIds)', { courseIds: owned.map((c) => c.id) })
      .groupBy('k.id')
      .orderBy('k.name', 'ASC')
      .getRawAndEntities<{ rosterCount: string; examSessionCount: string; gradedCount: string }>();

    return entities.map((klass, index) => ({
      id: klass.id,
      courseId: klass.courseId,
      name: klass.name,
      teacherId: klass.teacherId,
      rosterCount: parseInt(raw[index].rosterCount, 10),
      examSessionCount: parseInt(raw[index].examSessionCount, 10),
      gradedCount: parseInt(raw[index].gradedCount, 10),
    }));
  }
```

Add `ClassWithCountsView` to `apps/api/src/course/course.types.ts`:

```typescript
export interface ClassWithCountsView {
  id: string;
  courseId: string;
  name: string;
  teacherId: string;
  rosterCount: number;
  examSessionCount: number;
  gradedCount: number;
}
```

**Note on the correlated subquery**: the `g` join's `IN (SELECT ...)` is a correlated subquery against `sess.id`, re-evaluated per row of the outer join rather than a separate top-level join — this is deliberate here because `grading_result` has no direct `exam_session_id` column (it reaches one through `submission`), and expressing that as a plain `LEFT JOIN` chain would double-count rows once a session has multiple submissions with multiple grading criteria results. If this proves slow in practice at real data volumes (check with `EXPLAIN ANALYZE` once seeded with realistic data), the fallback is two separate `COUNT` subqueries in the `SELECT` list instead of joins — do not over-optimize before measuring.

- [ ] **Step 4: Run the test again**

Run: `pnpm --filter api test -- class.service.spec`
Expected: PASS.

- [ ] **Step 5: Update the controller's return type reference**

`apps/api/src/course/class.controller.ts`'s `findMine` route calls `this.classes.findForHead(...)` with no type annotation of its own — no change needed there, but grep for any other caller of `findForHead` that destructures the old shape and update it.

- [ ] **Step 6: Frontend — render the new columns**

In `apps/web/src/lib/api/department.ts`, add `rosterCount: number`, `examSessionCount: number`, `gradedCount: number` to the `Klass` interface.

In `apps/web/src/app/department/classes/page.tsx`, add three columns to the existing `columns` array (after "Giảng viên"):

```typescript
{ label: 'Sĩ số', tight: true, render: (k) => <span className="tabular-nums">{k.rosterCount}</span> },
{ label: 'Phiên thi', tight: true, render: (k) => <span className="tabular-nums">{k.examSessionCount}</span> },
{ label: 'Đã chấm', tight: true, render: (k) => <span className="tabular-nums">{k.gradedCount}</span> },
```

- [ ] **Step 7: Run web build**

Run: `pnpm --filter web build`
Expected: PASS.

- [ ] **Step 8: Update CLAUDE.md**

§7.2.5: mark the counts sub-bullet `✅ Đã làm (2026-09-10)`; keep the "Kèm theo" paragraph about the future GV→TK report feature untouched — that part is still not built.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/course apps/web/src/app/department/classes apps/web/src/lib/api/department.ts CLAUDE.md
git commit -m "feat(department): read-only roster/session/graded counts per class

CLAUDE.md §7.2.5 — without this a Trưởng khoa's visibility ends the
moment a class is created and a teacher assigned. Counts only, never
submission/grade content — first time department_admin touches the
Sở hữu tier, kept to COUNT() on purpose."
```

---

## Task 6: Excel import for `Class`

**Files:**
- Create: `apps/api/src/course/dto/import-classes.dto.ts`
- Modify: `apps/api/src/course/class.controller.ts`
- Modify: `apps/api/src/course/class.service.ts`
- Modify: `apps/api/src/course/course.types.ts`
- Create: `apps/web/src/app/department/classes/_components/import-classes-dialog.tsx`
- Modify: `apps/web/src/app/department/classes/page.tsx`
- Modify: `apps/web/src/lib/api/department.ts`, `apps/web/src/hooks/useDepartment.ts`
- Test: `apps/api/test/classes-import.e2e-spec.ts` (new)

**Interfaces:**
- Consumes: `exceljs` (already the project's chosen browser-side Excel library, per CLAUDE.md §7.1 — check `apps/web/package.json`; add it if genuinely absent, do not introduce a second library).
- Produces: `POST /classes/import` (`department_admin`-only) — body `{ rows: ImportClassRow[] }`, one row = `{ courseCode: string; courseName: string; className: string; teacherEmail: string }`. Upserts `Course` (by `code` + the head's current semester context — **caller must supply `semesterId` once per import batch, not per row**, since CLAUDE.md §3.2 forbids a form asking "which semester" anywhere but the Course-create form; here the whole import IS a course-create form, so it asks exactly once). Response: `{ coursesCreated: number; classesCreated: number; classesUpdated: number; errors: ImportClassError[] }`.

- [ ] **Step 1: Write the failing e2e test**

```typescript
// apps/api/test/classes-import.e2e-spec.ts
describe('POST /classes/import', () => {
  it('creates a new course and class, resolving the teacher by email', async () => {
    const head = await loginAs(app, 'department_admin');
    const semester = await seedSemester(app); // adapt to existing e2e seed helper
    const teacher = await createTestAccount(app, { role: 'teacher', email: 'gv1@truong.edu.vn' });

    const res = await request(app.getHttpServer())
      .post('/classes/import')
      .set('Authorization', `Bearer ${head.accessToken}`)
      .send({
        semesterId: semester.id,
        rows: [
          { courseCode: 'CS101', courseName: 'Nhập môn lập trình', className: 'Nhóm 01', teacherEmail: 'gv1@truong.edu.vn' },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ coursesCreated: 1, classesCreated: 1, classesUpdated: 0, errors: [] });
  });

  it('reuses an existing course in the same semester instead of duplicating it', async () => {
    const head = await loginAs(app, 'department_admin');
    const semester = await seedSemester(app);
    const teacherA = await createTestAccount(app, { role: 'teacher', email: 'a@truong.edu.vn' });
    const teacherB = await createTestAccount(app, { role: 'teacher', email: 'b@truong.edu.vn' });

    await request(app.getHttpServer())
      .post('/classes/import')
      .set('Authorization', `Bearer ${head.accessToken}`)
      .send({ semesterId: semester.id, rows: [
        { courseCode: 'CS101', courseName: 'Nhập môn lập trình', className: 'Nhóm 01', teacherEmail: 'a@truong.edu.vn' },
      ] });

    const res = await request(app.getHttpServer())
      .post('/classes/import')
      .set('Authorization', `Bearer ${head.accessToken}`)
      .send({ semesterId: semester.id, rows: [
        { courseCode: 'CS101', courseName: 'Nhập môn lập trình', className: 'Nhóm 02', teacherEmail: 'b@truong.edu.vn' },
      ] });

    expect(res.body).toMatchObject({ coursesCreated: 0, classesCreated: 1, classesUpdated: 0, errors: [] });
  });

  it('reports a row whose teacherEmail does not match a teacher account, without failing the whole batch', async () => {
    const head = await loginAs(app, 'department_admin');
    const semester = await seedSemester(app);

    const res = await request(app.getHttpServer())
      .post('/classes/import')
      .set('Authorization', `Bearer ${head.accessToken}`)
      .send({ semesterId: semester.id, rows: [
        { courseCode: 'CS102', courseName: 'Cấu trúc dữ liệu', className: 'Nhóm 01', teacherEmail: 'khong-ton-tai@truong.edu.vn' },
      ] });

    expect(res.status).toBe(201);
    expect(res.body.classesCreated).toBe(0);
    expect(res.body.errors).toEqual([
      expect.objectContaining({ row: 0, reason: expect.stringContaining('khong-ton-tai@truong.edu.vn') }),
    ]);
  });

  it('a course owned by a DIFFERENT head in the same semester+code is a conflict, not silently reused', async () => {
    const headA = await loginAs(app, 'department_admin');
    const headB = await loginAs(app, 'department_admin'); // adapt: needs a second distinct department_admin fixture
    const semester = await seedSemester(app);
    const teacher = await createTestAccount(app, { role: 'teacher' });

    await request(app.getHttpServer())
      .post('/classes/import')
      .set('Authorization', `Bearer ${headA.accessToken}`)
      .send({ semesterId: semester.id, rows: [
        { courseCode: 'CS101', courseName: 'Nhập môn lập trình', className: 'Nhóm 01', teacherEmail: teacher.email },
      ] });

    const res = await request(app.getHttpServer())
      .post('/classes/import')
      .set('Authorization', `Bearer ${headB.accessToken}`)
      .send({ semesterId: semester.id, rows: [
        { courseCode: 'CS101', courseName: 'Nhập môn lập trình', className: 'Nhóm 02', teacherEmail: teacher.email },
      ] });

    expect(res.body.errors).toEqual([
      expect.objectContaining({ row: 0, reason: expect.stringContaining('khoa khác') }),
    ]);
  });

  it('teacher cannot import classes', async () => {
    const teacher = await loginAs(app, 'teacher');
    const res = await request(app.getHttpServer())
      .post('/classes/import')
      .set('Authorization', `Bearer ${teacher.accessToken}`)
      .send({ semesterId: 'irrelevant', rows: [] });
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `pnpm --filter api test:e2e -- classes-import`
Expected: FAIL — 404.

- [ ] **Step 3: Add the DTO**

```typescript
// apps/api/src/course/dto/import-classes.dto.ts
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsString,
  IsUUID,
  Length,
  ValidateNested,
} from 'class-validator';

/**
 * Một dòng đã parse từ Excel ở browser (Security rule 5 — file không lên
 * server). Giảng viên xác định bằng EMAIL, không phải tên (tên trùng giữa
 * nhiều giảng viên; email là unique constraint có sẵn trên account).
 */
export class ImportClassRowDto {
  @IsString()
  @Length(2, 32)
  courseCode!: string;

  @IsString()
  @Length(1, 200)
  courseName!: string;

  @IsString()
  @Length(1, 100)
  className!: string;

  @IsEmail()
  teacherEmail!: string;
}

export class ImportClassesDto {
  /**
   * Kỳ ĐƯỢC HỎI TƯỜNG MINH đúng một lần cho cả batch — không suy từ filter
   * trang, không hỏi lại trên từng dòng (CLAUDE.md §3.2 hệ quả bắt buộc:
   * chỉ đúng một nơi hỏi "học kỳ nào", và màn import CHÍNH LÀ form tạo
   * Course ở đây).
   */
  @IsUUID()
  semesterId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => ImportClassRowDto)
  rows!: ImportClassRowDto[];
}
```

- [ ] **Step 4: Add the service method**

In `apps/api/src/course/class.service.ts`, add (needs `SemesterEntity`? No — only `semesterId` as a plain column value; needs `CourseEntity` repo, already injected):

```typescript
export interface ImportClassResult {
  coursesCreated: number;
  classesCreated: number;
  classesUpdated: number;
  errors: Array<{ row: number; reason: string }>;
}

  /**
   * Import Excel cho Class (CLAUDE.md §7.2.1). Upsert Course như tác dụng
   * phụ — Trưởng khoa vẫn là người bấm, không đụng phân quyền hiện có.
   *
   * Một dòng lỗi KHÔNG chặn cả batch (khác `RosterService.importForClass`,
   * nơi một dòng lỗi chặn tất cả) — lý do khác nhau có chủ đích: import
   * roster của MỘT lớp lỗi một dòng làm sĩ số sai lệch không phát hiện
   * được; import Class của CẢ khoa, một môn lỗi tên GV không được phép
   * chặn 49 môn còn lại nhập đúng. Lỗi được LIỆT KÊ, không âm thầm bỏ qua.
   */
  async importForHead(
    headId: string,
    dto: ImportClassesDto,
  ): Promise<ImportClassResult> {
    let coursesCreated = 0;
    let classesCreated = 0;
    let classesUpdated = 0;
    const errors: Array<{ row: number; reason: string }> = [];

    for (let i = 0; i < dto.rows.length; i++) {
      const row = dto.rows[i];
      try {
        let course = await this.courses.findOne({
          where: { code: row.courseCode, semesterId: dto.semesterId },
        });

        if (course && course.departmentHeadId !== headId) {
          errors.push({ row: i, reason: `Môn ${row.courseCode} đã có chủ ở khoa khác trong kỳ này` });
          continue;
        }

        if (!course) {
          course = await this.courses.save(
            this.courses.create({
              code: row.courseCode,
              name: row.courseName,
              semesterId: dto.semesterId,
              departmentHeadId: headId,
            }),
          );
          coursesCreated++;
        }

        const teacher = await this.accounts.findOne({
          where: { email: row.teacherEmail, role: 'teacher' },
        });
        if (!teacher) {
          errors.push({ row: i, reason: `Không tìm thấy tài khoản giảng viên với email ${row.teacherEmail}` });
          continue;
        }

        const existingClass = await this.classes.findOne({
          where: { courseId: course.id, name: row.className },
        });
        if (existingClass) {
          if (existingClass.teacherId !== teacher.id) {
            await this.classes.update(existingClass.id, { teacherId: teacher.id });
          }
          classesUpdated++;
        } else {
          await this.classes.save(
            this.classes.create({ courseId: course.id, name: row.className, teacherId: teacher.id }),
          );
          classesCreated++;
        }
      } catch (error) {
        errors.push({
          row: i,
          reason: error instanceof Error ? error.message : 'Lỗi không xác định',
        });
      }
    }

    return { coursesCreated, classesCreated, classesUpdated, errors };
  }
```

- [ ] **Step 5: Add the controller route**

In `apps/api/src/course/class.controller.ts`:

```typescript
  @Post('import')
  @Roles('department_admin')
  @HttpCode(201)
  async importClasses(@Body() dto: ImportClassesDto, @Req() req: Request) {
    return this.classes.importForHead(req.user!.sub, dto);
  }
```

Declared before the plain `@Post()` (there is no plain `POST /classes` — the closest existing route is fine either way since `import` is a literal path segment, not a `:id`). Import `ImportClassesDto` and `HttpCode`.

- [ ] **Step 6: Run the e2e tests**

Run: `pnpm --filter api test:e2e -- classes-import`
Expected: PASS.

- [ ] **Step 7: Frontend — parse-in-browser import dialog**

Check `apps/web/package.json` for `exceljs`; add it (`pnpm --filter web add exceljs`) if absent.

```typescript
// apps/web/src/app/department/classes/_components/import-classes-dialog.tsx
'use client';

import { useState } from 'react';
import ExcelJS from 'exceljs';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useImportClasses } from '@/hooks/useDepartment';
import type { ImportClassRow } from '@/lib/api/department';

interface ImportClassesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  semesterId: string;
}

/**
 * File .xlsx không bao giờ lên server (Security rule 5) — parse ở đây,
 * gửi JSON thường lên `/classes/import`. Cột: Mã môn | Tên môn | Tên lớp |
 * Email giảng viên, theo đúng thứ tự — không đoán cột từ header.
 */
export function ImportClassesDialog({ open, onOpenChange, semesterId }: ImportClassesDialogProps) {
  const [rows, setRows] = useState<ImportClassRow[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const importClasses = useImportClasses();

  async function handleFile(file: File) {
    setParseError(null);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await file.arrayBuffer());
    const sheet = workbook.worksheets[0];
    if (!sheet) {
      setParseError('File không có sheet nào.');
      return;
    }

    const parsed: ImportClassRow[] = [];
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // header
      const [, courseCode, courseName, className, teacherEmail] = row.values as unknown[];
      if (!courseCode) return; // dòng trống
      parsed.push({
        courseCode: String(courseCode).trim(),
        courseName: String(courseName ?? '').trim(),
        className: String(className ?? '').trim(),
        teacherEmail: String(teacherEmail ?? '').trim(),
      });
    });

    if (parsed.length === 0) {
      setParseError('Không đọc được dòng dữ liệu nào — kiểm tra lại thứ tự cột: Mã môn, Tên môn, Tên lớp, Email giảng viên.');
      return;
    }
    setRows(parsed);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import lớp học từ Excel</DialogTitle>
        </DialogHeader>

        <p className="text-small text-muted-foreground">
          Cột theo đúng thứ tự: Mã môn, Tên môn, Tên lớp, Email giảng viên. Dòng đầu là tiêu đề.
        </p>

        <input
          type="file"
          accept=".xlsx"
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
        />

        {parseError && (
          <Alert variant="destructive">
            <AlertDescription>{parseError}</AlertDescription>
          </Alert>
        )}

        {rows.length > 0 && (
          <p className="text-small">{rows.length} dòng sẵn sàng import.</p>
        )}

        {importClasses.data && (
          <Alert variant={importClasses.data.errors.length > 0 ? 'destructive' : 'default'}>
            <AlertDescription>
              Đã tạo {importClasses.data.coursesCreated} môn, {importClasses.data.classesCreated} lớp mới,
              cập nhật {importClasses.data.classesUpdated} lớp.
              {importClasses.data.errors.length > 0 && (
                <ul className="mt-2 list-disc pl-4">
                  {importClasses.data.errors.map((e) => (
                    <li key={e.row}>Dòng {e.row + 2}: {e.reason}</li>
                  ))}
                </ul>
              )}
            </AlertDescription>
          </Alert>
        )}

        <Button
          disabled={rows.length === 0 || importClasses.isPending}
          onClick={() => importClasses.mutate({ semesterId, rows })}
        >
          Import {rows.length > 0 ? `(${rows.length} dòng)` : ''}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
```

Add to `apps/web/src/lib/api/department.ts`:

```typescript
export interface ImportClassRow {
  courseCode: string;
  courseName: string;
  className: string;
  teacherEmail: string;
}

export interface ImportClassResult {
  coursesCreated: number;
  classesCreated: number;
  classesUpdated: number;
  errors: Array<{ row: number; reason: string }>;
}

export async function importClasses(body: { semesterId: string; rows: ImportClassRow[] }): Promise<ImportClassResult> {
  const { data, error, response } = await apiClient.POST('/classes/import', { body });
  await throwIfFailed(error, response);
  return data as unknown as ImportClassResult;
}
```

Add to `apps/web/src/hooks/useDepartment.ts`:

```typescript
export function useImportClasses() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: importClasses,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [CLASSES_QUERY_KEY] }), // match the exact key useMyClasses invalidates on create
  });
}
```

Wire the dialog into `apps/web/src/app/department/classes/page.tsx` behind a new "Import Excel" button next to the existing "Thêm lớp" button, passing `semesterFilter.semesterId` if Task 4 has landed on this branch already, or a semester picker of its own if Task 4 has not — check before assuming.

- [ ] **Step 8: Run web build**

Run: `pnpm --filter web build`
Expected: PASS.

- [ ] **Step 9: Update CLAUDE.md**

§7.2.1: mark `✅ Đã làm (2026-09-10)`.

- [ ] **Step 10: Commit**

```bash
git add apps/api/src/course apps/api/test apps/web/src/app/department/classes apps/web/src/lib/api/department.ts apps/web/src/hooks/useDepartment.ts apps/web/package.json CLAUDE.md
git commit -m "feat(department): bulk Excel import for Class, upserting Course

CLAUDE.md §7.2.1 — 50-150 classes per department per semester is not
hand-entry scale. Semester is asked exactly once for the whole batch
(the import IS the Course-create form here); a bad row is reported,
not fatal to the batch — different from roster import on purpose,
see the service method's doc comment."
```

---

## Self-Review Notes (completed during writing, not a separate pass)

- **Spec coverage**: all six CLAUDE.md §7.2 open items (7.2.1, 7.2.2, 7.2.3, 7.2.5, 7.2.6, 7.2.8) have a task. 7.2.4 and 7.2.7 are excluded — CLAUDE.md already marks both `✅ Đã có`, nothing to do.
- **Independence**: all 6 tasks touch disjoint files except Task 6's UI optionally reading Task 4's `semesterFilter` — noted inline as a check-before-assume, not a hard dependency (Task 6 works standalone with its own semester picker if executed first).
- **Type consistency checked**: `ClassWithCountsView` (Task 5) and `TeachingClassView` (Task 4) are different, non-overlapping return shapes for different callers (`findForHead` vs `findForTeacher`) — not accidentally merged.
