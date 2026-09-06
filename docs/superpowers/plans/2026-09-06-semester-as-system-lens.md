# Học kỳ là ống kính của cả hệ thống — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lịch học kỳ chuyển về một tier cấp trường, "kỳ hiện hành" thành cờ tường minh, và mọi màn hình danh sách lọc theo học kỳ với cùng một control.

**Architecture:** Thêm `semester.is_current` (cờ, không suy từ ngày) do role `academic_affairs` — area mới `/academic`, nhãn "Phòng Đào tạo" — gạt qua `PUT /semesters/:id/current`. Bốn endpoint danh sách nhận thêm `semesterId` như một **bộ lọc AND thêm vào điều kiện sở hữu sẵn có**, không bao giờ thay thế nó. Frontend dùng một `useSemesterFilter()` mang sẵn logic seed-once, và một `<SemesterFilter>` đặt trên 5 trang.

**Tech Stack:** NestJS 11 + TypeORM + PostgreSQL 16 (partial unique index), Next.js 15 App Router + TanStack Query + shadcn/ui, Jest (e2e, `--runInBand`) + Vitest (web).

**Spec:** `docs/superpowers/specs/2026-09-06-semester-as-system-lens-design.md`

## Global Constraints

- **Task 0–4 là MỘT lần merge.** Không tách PR. Giữa task 3 và 4, `department_admin` đã mất quyền sửa học kỳ mà `academic_affairs` chưa có area để đăng nhập — tách ra là tạo một khoảng thời gian thật sự không ai sửa được lịch học kỳ. Spec §9.1.
- **`semesterId` là bộ lọc, không bao giờ là phạm vi.** Mọi query giữ nguyên `.where(<điều kiện sở hữu>)` rồi mới `.andWhere('... semesterId = :semesterId')`. Không bao giờ viết thành nhánh if/else. Spec §5.1.
- **Không backfill `is_current` trong migration.** Spec §9.2 giải thích vì sao, và nói rõ không thêm về sau.
- Giá trị enum DB đổi `academic_affairs` → `academic_affairs` (Task 0); nhãn hiển thị "Phòng Đào tạo". Spec §3.2.
- Audit đi qua `AuditLogService.recordUserAction`, không `INSERT` thô. Spec §4.2.
- File TypeScript trong repo dùng **CRLF**; `core.autocrlf=true` nên git tự chuẩn hoá — viết bằng editor bình thường là được.
- Chạy e2e cần Postgres (cổng 5442) + MinIO (9010) đang chạy và bucket `examcollect-submissions` tồn tại.
- Lệnh: e2e `cd apps/api && npx jest --config ./test/jest-e2e.json --runInBand`; unit api `npx jest`; web `cd apps/web && npx vitest run`. **`turbo run` hỏng trên máy này** (thiếu pnpm 9.12.0) — build/lint chạy trực tiếp: `npx nest build`, `npx next build`, `npx next lint`.

---

## File Structure

**API**
- `apps/api/src/database/migrations/<ts>-AddSemesterIsCurrent.ts` — mới
- `apps/api/src/course/entities/semester.entity.ts` — thêm cột + partial unique index
- `apps/api/src/course/semester.service.ts` — `setCurrent`, chặn xoá kỳ hiện hành
- `apps/api/src/course/semester.controller.ts` — `PUT :id/current`, đổi `@Roles`
- `apps/api/src/admin/audit-log.service.ts` — nhận optional `EntityManager`
- `apps/api/src/course/class.service.ts` — `semesterId` cho `findForTeacher`/`findForHead`
- `apps/api/src/course/course.service.ts` — `semesterId` cho `findForHead`
- `apps/api/src/course/class.controller.ts`, `course.controller.ts` — nhận query
- `apps/api/src/course/dto/semester-scope.dto.ts` — mới, dùng chung 3 endpoint
- `apps/api/src/exam-session/dto/search-exam-sessions.dto.ts` — thêm `semesterId`
- `apps/api/src/exam-session/exam-session.service.ts` — `.andWhere` cho semester
- `apps/api/src/course/course.types.ts` — `TeachingClassView` thêm học kỳ

**Web**
- `apps/web/src/lib/role-areas.ts`, `lib/nav-config.ts`, `lib/account-roles.ts`
- `apps/web/src/components/layout/app-shell.tsx`
- `apps/web/src/app/academic/layout.tsx`, `app/academic/semesters/page.tsx` — mới (dời từ `/department/semesters`)
- `apps/web/src/hooks/useSemesterFilter.ts` — mới
- `apps/web/src/components/layout/semester-filter.tsx` — mới
- 5 trang danh sách + `lib/submission-filters.ts` (xoá `pickDefaultSemester`)

---

### Task 0: Đổi tên role `super_admin` → `academic_affairs`

Phải đi TRƯỚC Task 3 — đó là chỗ đầu tiên viết `@Roles(...)` cho tier này. Làm
sớm nhất trong khối để không có bước trung gian nào viết tên cũ rồi phải sửa lại.

**Files:**
- Create: `apps/api/src/database/migrations/1788690000000-RenameSuperAdminToAcademicAffairs.ts`
- Modify: `apps/api/src/identity/entities/account.entity.ts`
- Modify: `apps/api/src/accounts/dto/create-account.dto.ts`, `search-accounts.dto.ts`, `update-account.dto.ts`
- Modify: `apps/api/test/helpers/create-account.ts`
- Modify: `apps/web/src/lib/account-roles.ts`, `lib/api/accounts.ts`, `app/unassigned-role/page.tsx`
- Regenerate: `packages/shared/src/api/schema.d.ts`

**Interfaces:**
- Produces: `AccountRole = 'admin' | 'teacher' | 'academic_affairs' | 'department_admin'`

- [ ] **Step 1: Viết test đỏ**

Thêm vào `apps/api/test/accounts.e2e-spec.ts`:

```typescript
  // Tên role mô tả công việc, không phải thứ bậc. 'super_admin' nói "quyền
  // cao nhất" trong khi việc của nó là giữ lịch học kỳ — và cái tên đó nên để
  // dành cho một tier siêu quản trị thật, nếu sau này cần.
  it('nhận role academic_affairs, và từ chối tên cũ', async () => {
    const created = await request(app.getHttpServer())
      .post('/accounts')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Phòng Đào tạo',
        email: `academic_${Date.now()}@example.com`,
        password: 'correct-horse-battery',
        role: 'academic_affairs',
      });
    expect(created.status).toBe(201);
    expect(created.body.role).toBe('academic_affairs');

    await request(app.getHttpServer())
      .post('/accounts')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Cũ',
        email: `old_${Date.now()}@example.com`,
        password: 'correct-horse-battery',
        role: 'super_admin',
      })
      .expect(400);
  }, 30_000);
```

- [ ] **Step 2: Chạy để thấy nó đỏ**

Run: `cd apps/api && npx jest --config ./test/jest-e2e.json --runInBand --testPathPattern accounts`
Expected: FAIL — `academic_affairs` bị `@IsIn` từ chối (400), còn `super_admin` vẫn được nhận (201).

- [ ] **Step 3: Migration**

Create `apps/api/src/database/migrations/1788690000000-RenameSuperAdminToAcademicAffairs.ts`:

```typescript
import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `super_admin` là tên thứ bậc gán cho một công việc cụ thể: giữ lịch học kỳ
 * cấp trường. Đổi thành tên công việc, cùng lý do area đặt là /academic chứ
 * không /super-admin — và để trả lại cái tên cho một tier siêu quản trị thật
 * nếu sau này cần.
 *
 * RENAME VALUE chỉ sửa catalog, không rewrite bảng (Postgres 10+). An toàn
 * với dữ liệu đang có: mọi row mang giá trị cũ tự động đọc ra tên mới.
 */
export class RenameSuperAdminToAcademicAffairs1788690000000 implements MigrationInterface {
  name = 'RenameSuperAdminToAcademicAffairs1788690000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "examcollect"."account_role" RENAME VALUE 'super_admin' TO 'academic_affairs'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "examcollect"."account_role" RENAME VALUE 'academic_affairs' TO 'super_admin'`,
    );
  }
}
```

- [ ] **Step 4: Đổi tên trong source**

`account.entity.ts` — cả type alias, `enum:` array trong `@Column`, và doc comment
đầu file (đang nói `super_admin`/`department_admin` chưa có tiering):

```typescript
export type AccountRole = 'admin' | 'teacher' | 'academic_affairs' | 'department_admin';
```

Ba DTO (`create`/`search`/`update`) — đổi trong mảng `ACCOUNT_ROLES`.

`apps/api/test/helpers/create-account.ts`, `apps/web/src/lib/api/accounts.ts`,
`apps/web/src/app/unassigned-role/page.tsx` — đổi chuỗi.

**Không** sửa `1787766223206-InitialSchema.ts`: migration đã chạy là lịch sử, sửa
nó làm chữ ký khác đi trên máy đã migrate.

- [ ] **Step 5: Chạy migration + test**

Run: `cd apps/api && npm run migration:run && npx jest --config ./test/jest-e2e.json --runInBand`
Expected: migration chạy sạch; mọi suite pass.

- [ ] **Step 6: Regenerate schema + commit**

```bash
cd apps/api && npm run dev   # nền, chờ /api-docs-json trả 200
cd packages/shared && node scripts/generate-api-client.mjs
# dừng API dev
git add apps/api/src apps/api/test apps/web/src packages/shared/src/api/schema.d.ts
git commit -m "refactor(identity): role academic_affairs, tên theo công việc chứ không thứ bậc"
```

---

### Task 1: Cột `is_current` + partial unique index

**Files:**
- Modify: `apps/api/src/course/entities/semester.entity.ts`
- Create: `apps/api/src/database/migrations/1788700000000-AddSemesterIsCurrent.ts`
- Test: `apps/api/test/semester-current.e2e-spec.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `SemesterEntity.isCurrent: boolean`; constraint name `uq_semester_single_current`

- [ ] **Step 1: Viết test đỏ — DB phải chặn hai kỳ cùng gạt cờ**

Create `apps/api/test/semester-current.e2e-spec.ts`:

```typescript
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';

/**
 * Bất biến "tối đa MỘT kỳ hiện hành" ép ở tầng DB, không ở service: service
 * không phải thứ duy nhất ghi được bảng này, và một check trước UPDATE không
 * nhìn thấy row mà request khác đang ghi ngay lúc đó.
 */
describe('semester.is_current — ràng buộc DB (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let schema: string;
  const stamp = Date.now();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    dataSource = app.get(DataSource);
    schema = (dataSource.options as { schema?: string }).schema ?? 'examcollect';
  }, 60_000);

  afterAll(async () => {
    await dataSource.query(
      `DELETE FROM ${schema}.semester WHERE name LIKE $1`,
      [`Cur ${stamp}%`],
    );
    await app.close();
  });

  async function makeSemester(suffix: string, isCurrent: boolean): Promise<string> {
    const [row] = await dataSource.query(
      `INSERT INTO ${schema}.semester (name, start_date, end_date, is_current)
       VALUES ($1, '2026-09-01', '2027-01-15', $2) RETURNING id`,
      [`Cur ${stamp} ${suffix}`, isCurrent],
    );
    return row.id;
  }

  it('cho phép nhiều kỳ KHÔNG hiện hành', async () => {
    await makeSemester('a', false);
    await makeSemester('b', false);
    const [{ count }] = await dataSource.query(
      `SELECT count(*)::int FROM ${schema}.semester WHERE name LIKE $1`,
      [`Cur ${stamp}%`],
    );
    expect(count).toBeGreaterThanOrEqual(2);
  }, 30_000);

  it('từ chối kỳ hiện hành THỨ HAI', async () => {
    await makeSemester('first-current', true);
    await expect(makeSemester('second-current', true)).rejects.toThrow(
      /uq_semester_single_current/,
    );
  }, 30_000);
});
```

- [ ] **Step 2: Chạy để thấy nó đỏ**

Run: `cd apps/api && npx jest --config ./test/jest-e2e.json --runInBand --testPathPattern semester-current`
Expected: FAIL — `column "is_current" of relation "semester" does not exist`

- [ ] **Step 3: Thêm cột vào entity**

Modify `apps/api/src/course/entities/semester.entity.ts` — thêm import `Index` nếu chưa có, và thêm vào class:

```typescript
  /**
   * Kỳ đang hiện hành, do Phòng Đào tạo gạt tường minh — KHÔNG suy từ
   * start_date/end_date. Suy từ ngày cần một bảng luật tie-break cho ca chồng
   * lấn, và ở ca kỳ hè nó chọn kỳ hè làm mặc định cho toàn bộ giảng viên,
   * kể cả người không dạy hè. Xem spec §2.2.
   */
  @Column({ name: 'is_current', type: 'boolean', default: false })
  isCurrent!: boolean;
```

Và trên class, cạnh `@Check` sẵn có:

```typescript
// Tối đa MỘT kỳ hiện hành. Partial index chứ không unique thường: nhiều kỳ
// is_current = false là bình thường, chỉ `true` mới phải là duy nhất. Cho
// phép cả trạng thái KHÔNG kỳ nào hiện hành (DB vừa cài).
@Index('uq_semester_single_current', ['isCurrent'], {
  unique: true,
  where: '"is_current"',
})
```

- [ ] **Step 4: Sinh migration từ entity**

Run: `cd apps/api && npm run migration:generate -- src/database/migrations/AddSemesterIsCurrent`
Expected: sinh file chứa `ADD "is_current" boolean NOT NULL DEFAULT false` và `CREATE UNIQUE INDEX "uq_semester_single_current" ... WHERE "is_current"`.

Thêm doc comment vào đầu file vừa sinh:

```typescript
/**
 * "Kỳ hiện hành" là cờ tường minh, không suy từ ngày — spec §2.2.
 *
 * KHÔNG backfill. Sau migration không kỳ nào hiện hành cho tới khi Phòng Đào
 * tạo gạt. Backfill "kỳ nào chứa hôm nay" chính là heuristic spec đã loại,
 * chỉ chạy một lần; ở ca kỳ hè chồng kỳ chính nó vẫn chọn sai, chỉ khác là
 * sai IM LẶNG vì màn hình trông bình thường nên không ai đi kiểm. Không
 * backfill thì sai là ồn và sửa trong hai phút. Spec §9.2 — đừng thêm về sau.
 */
```

- [ ] **Step 5: Chạy migration và test**

Run: `cd apps/api && npm run migration:run && npx jest --config ./test/jest-e2e.json --runInBand --testPathPattern semester-current`
Expected: 2 passed.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/course/entities/semester.entity.ts apps/api/src/database/migrations apps/api/test/semester-current.e2e-spec.ts
git commit -m "feat(semester): cờ is_current, tối đa một kỳ hiện hành ép ở tầng DB"
```

---

### Task 2: `AuditLogService` ghi được trong transaction

**Files:**
- Modify: `apps/api/src/admin/audit-log.service.ts`
- Test: `apps/api/test/audit-log.e2e-spec.ts` (thêm một case)

**Interfaces:**
- Produces: `recordUserAction(input, manager?: EntityManager): Promise<void>`

- [ ] **Step 1: Viết test đỏ — audit phải cuốn theo rollback**

Thêm vào `apps/api/test/audit-log.e2e-spec.ts`, trong `describe` sẵn có:

```typescript
  // Đổi kỳ hiện hành ghi audit TRONG cùng transaction với việc gạt cờ. Nếu
  // ghi ngoài, một flip hỏng sau khi audit đã ghi sẽ để lại dòng audit nói
  // về việc chưa từng xảy ra.
  it('không để lại dòng audit khi transaction bao ngoài rollback', async () => {
    const targetId = randomUUID();
    await expect(
      dataSource.transaction(async (manager) => {
        await auditLog.recordUserAction(
          {
            actorId: teacherId,
            action: 'test.rolled_back',
            targetType: 'test',
            targetId,
          },
          manager,
        );
        throw new Error('force rollback');
      }),
    ).rejects.toThrow('force rollback');

    const rows = await dataSource.query(
      `SELECT 1 FROM ${schema}.audit_log WHERE target_id = $1`,
      [targetId],
    );
    expect(rows).toHaveLength(0);
  }, 30_000);
```

Thêm `import { randomUUID } from 'node:crypto';` ở đầu file, và lấy service trong `beforeAll`: `auditLog = app.get(AuditLogService);` (khai báo `let auditLog: AuditLogService;` và import từ `../src/admin/audit-log.service`).

- [ ] **Step 2: Chạy để thấy nó đỏ**

Run: `cd apps/api && npx jest --config ./test/jest-e2e.json --runInBand --testPathPattern audit-log`
Expected: FAIL — `recordUserAction` chỉ nhận một tham số, dòng audit vẫn còn sau rollback.

- [ ] **Step 3: Cho service nhận EntityManager**

Modify `apps/api/src/admin/audit-log.service.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { AuditLogEntity } from './entities/audit-log.entity';
```

và đổi thân method:

```typescript
  /**
   * `manager` cho phép ghi audit TRONG transaction của caller. Không truyền
   * thì ghi bằng repository riêng, đúng như trước.
   *
   * Cần thiết vì có hành động mà audit phải sống chết cùng nó: đổi kỳ hiện
   * hành đổi thứ mọi giảng viên nhìn thấy, nên một dòng audit nói về việc đã
   * rollback còn tệ hơn không có dòng nào.
   *
   * Luôn đi qua repository (`create` + `save`) chứ không INSERT thô: entity
   * có PK phức hợp (occurred_at, id) trên bảng partition, và
   * @BeforeInsert stampOccurredAt() giữ cho JS Date và Postgres không lệch
   * độ chính xác. Insert thô ghi ra dòng không tìm lại được bằng chính khoá
   * của nó.
   */
  async recordUserAction(
    input: {
      actorId: string;
      action: string;
      targetType: string;
      targetId: string;
      oldValue?: Record<string, unknown>;
      newValue?: Record<string, unknown>;
    },
    manager?: EntityManager,
  ): Promise<void> {
    const repo = manager ? manager.getRepository(AuditLogEntity) : this.entries;
    await repo.save(
      repo.create({
        actorType: 'user',
        actorId: input.actorId,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId,
        oldValue: input.oldValue ?? {},
        newValue: input.newValue ?? {},
      }),
    );
  }
```

- [ ] **Step 4: Chạy lại**

Run: `cd apps/api && npx jest --config ./test/jest-e2e.json --runInBand --testPathPattern audit-log`
Expected: tất cả pass, kể cả case mới.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/admin/audit-log.service.ts apps/api/test/audit-log.e2e-spec.ts
git commit -m "feat(audit): ghi được trong transaction của caller"
```

---

### Task 3: `PUT /semesters/:id/current` + chuyển quyền sang `academic_affairs`

**Files:**
- Modify: `apps/api/src/course/semester.service.ts`
- Modify: `apps/api/src/course/semester.controller.ts`
- Modify: `apps/api/src/course/course.module.ts` (import `AdminModule` để có `AuditLogService`)
- Test: `apps/api/test/semester-current.e2e-spec.ts` (mở rộng)

**Interfaces:**
- Consumes: `SemesterEntity.isCurrent` (Task 1), `recordUserAction(input, manager?)` (Task 2)
- Produces: `SemesterService.setCurrent(id: string, actorId: string): Promise<SemesterEntity>`; route `PUT /semesters/:id/current` (`@Roles('academic_affairs')`)

- [ ] **Step 1: Viết test đỏ**

Thêm vào `apps/api/test/semester-current.e2e-spec.ts` (cần `request` từ supertest, và ba tài khoản: một `academic_affairs`, một `department_admin`, một `teacher` — dùng helper `createTestAccount` như các spec khác):

```typescript
  describe('PUT /semesters/:id/current', () => {
    it('gạt cờ, và gỡ cờ kỳ đang giữ', async () => {
      const a = await makeSemester('flip-a', false);
      const b = await makeSemester('flip-b', false);

      await request(app.getHttpServer())
        .put(`/semesters/${a}/current`)
        .set('Authorization', `Bearer ${academicToken}`)
        .expect(200);
      await request(app.getHttpServer())
        .put(`/semesters/${b}/current`)
        .set('Authorization', `Bearer ${academicToken}`)
        .expect(200);

      const rows = await dataSource.query(
        `SELECT id FROM ${schema}.semester WHERE is_current`,
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].id).toBe(b);
    }, 30_000);

    it('gạt lại chính kỳ đang hiện hành là hợp lệ và không đổi gì', async () => {
      const a = await makeSemester('idem', false);
      await request(app.getHttpServer())
        .put(`/semesters/${a}/current`)
        .set('Authorization', `Bearer ${academicToken}`)
        .expect(200);
      await request(app.getHttpServer())
        .put(`/semesters/${a}/current`)
        .set('Authorization', `Bearer ${academicToken}`)
        .expect(200);
    }, 30_000);

    it('ghi audit_log', async () => {
      const a = await makeSemester('audited', false);
      await request(app.getHttpServer())
        .put(`/semesters/${a}/current`)
        .set('Authorization', `Bearer ${academicToken}`)
        .expect(200);

      const rows = await dataSource.query(
        `SELECT action FROM ${schema}.audit_log WHERE target_id = $1`,
        [a],
      );
      expect(rows.map((r: { action: string }) => r.action)).toContain(
        'semester.current_changed',
      );
    }, 30_000);

    // Lịch học kỳ là quyết định cấp trường. Trưởng khoa tự đặt lịch riêng cho
    // khoa mình là đúng lỗi phân quyền mà thay đổi này sinh ra để sửa.
    it.each(['head', 'teacher'] as const)('từ chối role %s', async (who) => {
      const a = await makeSemester(`forbidden-${who}`, false);
      const token = who === 'head' ? headToken : teacherToken;
      await request(app.getHttpServer())
        .put(`/semesters/${a}/current`)
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    }, 30_000);

    it('404 cho id không tồn tại', async () => {
      await request(app.getHttpServer())
        .put(`/semesters/${randomUUID()}/current`)
        .set('Authorization', `Bearer ${academicToken}`)
        .expect(404);
    }, 30_000);
  });

  describe('DELETE /semesters/:id', () => {
    it('chặn xoá kỳ đang hiện hành, nói rõ phải chuyển cờ trước', async () => {
      const a = await makeSemester('undeletable', false);
      await request(app.getHttpServer())
        .put(`/semesters/${a}/current`)
        .set('Authorization', `Bearer ${academicToken}`)
        .expect(200);

      const res = await request(app.getHttpServer())
        .delete(`/semesters/${a}`)
        .set('Authorization', `Bearer ${academicToken}`)
        .expect(409);
      expect(res.body.message).toMatch(/hiện hành/);
    }, 30_000);
  });
```

- [ ] **Step 2: Chạy để thấy nó đỏ**

Run: `cd apps/api && npx jest --config ./test/jest-e2e.json --runInBand --testPathPattern semester-current`
Expected: FAIL — 404 trên `PUT .../current` (route chưa tồn tại).

- [ ] **Step 3: `setCurrent` trong service**

Modify `apps/api/src/course/semester.service.ts` — thêm import:

```typescript
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, QueryFailedError, Repository } from 'typeorm';
import { AuditLogService } from '../admin/audit-log.service';
```

thêm vào constructor: `private readonly dataSource: DataSource,` và `private readonly auditLog: AuditLogService,`

và thêm method:

```typescript
  /**
   * Gạt cờ hiện hành sang một kỳ khác.
   *
   * Một transaction: gỡ cờ kỳ cũ TRƯỚC rồi mới gắn kỳ mới — làm ngược thứ tự
   * sẽ có hai dòng is_current cùng lúc và đụng uq_semester_single_current.
   *
   * Audit ghi trong CÙNG transaction: đổi kỳ hiện hành đổi thứ mọi giảng viên
   * trong trường nhìn thấy, nên một dòng audit nói về việc đã rollback còn tệ
   * hơn không có dòng nào.
   */
  async setCurrent(id: string, actorId: string): Promise<SemesterEntity> {
    try {
      return await this.dataSource.transaction(async (manager) => {
        const repo = manager.getRepository(SemesterEntity);
        const target = await repo.findOne({ where: { id } });
        if (!target) {
          throw new NotFoundException('Semester not found');
        }
        if (target.isCurrent) {
          // Bấm hai lần không phải lỗi, và không có gì để ghi audit.
          return target;
        }

        const previous = await repo.findOne({ where: { isCurrent: true } });
        if (previous) {
          await repo.update(previous.id, { isCurrent: false });
        }
        await repo.update(id, { isCurrent: true });

        await this.auditLog.recordUserAction(
          {
            actorId,
            action: 'semester.current_changed',
            targetType: 'semester',
            targetId: id,
            oldValue: previous ? { id: previous.id, name: previous.name } : {},
            newValue: { id: target.id, name: target.name },
          },
          manager,
        );

        return { ...target, isCurrent: true };
      });
    } catch (error) {
      // PostgresExceptionFilter đã đổi 23505 thành 409, nhưng với câu chung
      // "This request conflicts with an existing record." — vô nghĩa với người
      // vừa bấm chuyển học kỳ. Bắt riêng để nói đúng chuyện.
      if (
        error instanceof QueryFailedError &&
        (error as QueryFailedError & { code?: string }).code === '23505'
      ) {
        throw new ConflictException(
          'Một yêu cầu khác vừa đổi kỳ hiện hành. Tải lại rồi thử lại.',
        );
      }
      throw error;
    }
  }
```

Và sửa `remove()` — thêm ngay sau khi tìm thấy `semester`:

```typescript
    if (semester.isCurrent) {
      throw new ConflictException(
        'Không xoá được học kỳ đang hiện hành. Chuyển cờ sang kỳ khác trước.',
      );
    }
```

- [ ] **Step 4: Route + đổi quyền**

Modify `apps/api/src/course/semester.controller.ts`:

```typescript
  @Put(':id/current')
  @Roles('academic_affairs')
  setCurrent(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    return this.semesters.setCurrent(id, req.user!.sub);
  }
```

Thêm `Put`, `Req` vào import từ `@nestjs/common`, và `import type { Request } from 'express';`.

Đổi `@Roles('department_admin')` thành `@Roles('academic_affairs')` trên `create`, `update`, `remove`. **Không** đụng `@Get()` — read vẫn mở cho mọi role, giảng viên cần danh sách để đổ vào bộ lọc.

Đổi doc comment đầu class:

```typescript
/**
 * Read mở cho mọi role (bộ lọc học kỳ ở mọi màn hình cần danh sách này);
 * write thuộc Phòng Đào tạo (`academic_affairs`).
 *
 * Trước đây write thuộc Trưởng khoa, và đó là sai tầng: lịch học kỳ là quyết
 * định cấp trường, công bố một lần cho toàn trường, không phải thứ mỗi khoa
 * tự đặt. `uq_semester_name` tồn tại chính vì hai Trưởng khoa có thể cùng tạo
 * "Học kỳ 1 2026-2027" với ngày khác nhau — vá triệu chứng; đây là sửa gốc.
 * Spec §2.1.
 */
```

- [ ] **Step 5: Wire module**

Modify `apps/api/src/course/course.module.ts`: thêm `AdminModule` vào `imports` (nơi `AuditLogService` được export). Nếu `AdminModule` chưa export `AuditLogService`, thêm nó vào `exports`.

- [ ] **Step 6: Chạy test**

Run: `cd apps/api && npx jest --config ./test/jest-e2e.json --runInBand --testPathPattern semester-current`
Expected: tất cả pass.

- [ ] **Step 7: Chạy toàn bộ e2e — đổi quyền có thể làm hỏng spec khác**

Run: `cd apps/api && npx jest --config ./test/jest-e2e.json --runInBand`
Expected: mọi suite pass. Spec nào đang tạo học kỳ bằng token `department_admin` sẽ đỏ — sửa chúng sang tài khoản `academic_affairs`, đừng nới quyền lại.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/course apps/api/test/semester-current.e2e-spec.ts
git commit -m "feat(semester): Phòng Đào tạo sở hữu lịch học kỳ, và gạt cờ kỳ hiện hành"
```

---

### Task 4: Tier `/academic` ở frontend

**Files:**
- Modify: `apps/web/src/lib/role-areas.ts`, `lib/nav-config.ts`, `lib/account-roles.ts`
- Modify: `apps/web/src/components/layout/app-shell.tsx`
- Create: `apps/web/src/app/academic/layout.tsx`
- Create: `apps/web/src/app/academic/semesters/page.tsx` (dời từ `app/department/semesters/page.tsx`)
- Delete: `apps/web/src/app/department/semesters/page.tsx`
- Modify: `apps/web/src/middleware.test.ts`

**Interfaces:**
- Consumes: `PUT /semesters/:id/current` (Task 3)
- Produces: area `/academic`; `ACADEMIC_NAV`; `ACCOUNT_ROLE_OPTIONS` gồm `academic_affairs`

- [ ] **Step 1: Viết test đỏ cho routing**

Thêm vào `apps/web/src/middleware.test.ts`:

```typescript
  it('đưa Phòng Đào tạo vào area của họ, không phải trang chưa-gán-vai-trò', async () => {
    const response = await middleware(
      makeRequest('/academic/semesters', fakeToken({ role: 'academic_affairs' })),
    );
    expect(response.status).not.toBe(307);
  });

  it('đẩy Phòng Đào tạo ra khỏi /department/*', async () => {
    const response = await middleware(
      makeRequest('/department/courses', fakeToken({ role: 'academic_affairs' })),
    );
    expect(new URL(response.headers.get('location')!).pathname).toBe(
      '/academic/semesters',
    );
  });

  it('đẩy Trưởng khoa ra khỏi /academic/*', async () => {
    const response = await middleware(
      makeRequest('/academic/semesters', fakeToken({ role: 'department_admin' })),
    );
    expect(new URL(response.headers.get('location')!).pathname).toBe(
      '/department/dashboard',
    );
  });
```

Test cũ `'sends a role with no area to the unassigned-role page'` dùng chuỗi
`'super_admin'` — **để nguyên**. Sau Task 0 giá trị đó không còn là role nào cả,
nên nó vẫn đúng là "role không map được phải về /unassigned-role", và giờ test
đó bảo vệ thêm một điều thật: một token cũ mang tên role trước khi đổi không
được lọt vào area nào.

- [ ] **Step 2: Chạy để thấy nó đỏ**

Run: `cd apps/web && npx vitest run src/middleware.test.ts`
Expected: FAIL — role `academic_affairs` vẫn bị đẩy về `/unassigned-role` (chưa có trong ROLE_AREAS).

- [ ] **Step 3: Đăng ký area**

Modify `apps/web/src/lib/role-areas.ts`:

```typescript
export const ROLE_AREAS = {
  admin: '/admin',
  department_admin: '/department',
  teacher: '/teacher',
  // Phòng Đào tạo. Tên role mô tả CÔNG VIỆC, không phải thứ bậc — area cũng
  // vậy (`/academic`, không phải `/super-admin`).
  academic_affairs: '/academic',
} as const;
```

Và `homeForRole`'s doc comment: đổi câu `academic_affairs` has no area today thành:

```typescript
/**
 * Where to send this role when they land somewhere that is not theirs.
 * A role still absent from ROLE_AREAS resolves to UNASSIGNED_ROLE_PATH,
 * which is the point.
 */
```

`homeForRole` trả `${area}/dashboard`, nhưng `/academic` không có dashboard. Sửa:

```typescript
/** Area nào có dashboard riêng. `/academic` chỉ có một trang, trang đó là nhà. */
const AREA_HOME: Record<string, string> = {
  '/academic': '/academic/semesters',
};

export function homeForRole(role: string | null): string {
  const area = areaForRole(role);
  if (!area) return UNASSIGNED_ROLE_PATH;
  return AREA_HOME[area] ?? `${area}/dashboard`;
}
```

- [ ] **Step 4: Nav + shell + nhãn role**

Modify `apps/web/src/lib/nav-config.ts`:

```typescript
// Phòng Đào tạo sở hữu đúng một thứ: quyển lịch học kỳ. Một tier một trang là
// hợp lý, không phải thiếu sót — spec §3.1.
export const ACADEMIC_NAV: NavItem[] = [
  { label: 'Học kỳ', href: '/academic/semesters', icon: CalendarRange },
];
```

Modify `apps/web/src/components/layout/app-shell.tsx`:

```typescript
  role: 'admin' | 'department' | 'teacher' | 'academic';
```

```typescript
    academic: { nav: ACADEMIC_NAV, home: '/academic/semesters', label: 'Phòng Đào tạo' },
```

(thêm `ACADEMIC_NAV` vào import từ `@/lib/nav-config`)

Modify `apps/web/src/lib/account-roles.ts`:

```typescript
// Bốn role hệ thống thực sự cài đặt. `academic_affairs` gia nhập danh sách khi
// nó có area (/academic), route chấp nhận nó (@Roles('academic_affairs') trên
// semester writes) và tài nguyên để sở hữu — trước đó, tạo một tài khoản như
// vậy sinh ra người đăng nhập được mà không làm được gì.
export const ACCOUNT_ROLE_OPTIONS = [
  'admin',
  'department_admin',
  'teacher',
  'academic_affairs',
] as const;
```

```typescript
export const ACCOUNT_ROLE_LABELS: Record<AccountRoleOption, string> = {
  admin: 'Quản trị',
  department_admin: 'Trưởng khoa',
  teacher: 'Giảng viên',
  academic_affairs: 'Phòng Đào tạo',
};
```

```typescript
export const ACCOUNT_ROLE_BADGE_VARIANT: Record<
  AccountRoleOption,
  'primary' | 'accent' | 'info' | 'warning'
> = {
  admin: 'primary',
  department_admin: 'info',
  teacher: 'accent',
  // Màu riêng: một bảng mà hai role trông giống nhau là bảng bị đọc nhầm.
  academic_affairs: 'warning',
};
```

Và trong `ROLE_DISPLAY`, đổi `academic_affairs: { label: 'Super Admin', ... }` thành `academic_affairs: { label: 'Phòng Đào tạo', variant: 'warning' }`.

- [ ] **Step 5: Layout + dời trang**

Create `apps/web/src/app/academic/layout.tsx`:

```tsx
import type { ReactNode } from 'react';
import { AppShell } from '@/components/layout/app-shell';

export default function AcademicLayout({ children }: { children: ReactNode }) {
  return <AppShell role="academic">{children}</AppShell>;
}
```

```bash
git mv apps/web/src/app/department/semesters/page.tsx apps/web/src/app/academic/semesters/page.tsx
```

Bỏ mục `{ label: 'Học kỳ', href: '/department/semesters', icon: CalendarRange }` khỏi `DEPARTMENT_NAV`, và sửa comment phía trên nó:

```typescript
// Trưởng khoa sở hữu cấu trúc học vụ mà một phiên thi dựng lên từ đó. Học kỳ
// KHÔNG còn ở đây — nó là lịch cấp trường, thuộc Phòng Đào tạo (/academic).
// Trưởng khoa vẫn ĐỌC được danh sách kỳ (bộ lọc cần), chỉ không sửa.
```

- [ ] **Step 6: Nút gạt cờ trên trang Học kỳ**

Trong `apps/web/src/app/academic/semesters/page.tsx`, thêm một cột và nút cho mỗi dòng. Kỳ đang hiện hành hiện badge thay vì nút:

```tsx
{semester.isCurrent ? (
  <Badge variant="success">Đang hiện hành</Badge>
) : (
  <Button
    variant="outline"
    size="sm"
    disabled={setCurrent.isPending}
    onClick={() => setCurrent.mutate(semester.id)}
  >
    Đặt làm hiện hành
  </Button>
)}
```

Thêm vào `apps/web/src/lib/api/department.ts`:

```typescript
export async function setCurrentSemester(id: string): Promise<Semester> {
  const { data, error, response } = await apiClient.PUT('/semesters/{id}/current', {
    params: { path: { id } },
  });
  await throwIfFailed(error, response);
  return data as unknown as Semester;
}
```

và `Semester` interface thêm `isCurrent: boolean;`.

Thêm vào `apps/web/src/hooks/useDepartment.ts`:

```typescript
export function useSetCurrentSemester() {
  return useInvalidating(DEPARTMENT_KEYS.semesters, setCurrentSemester);
}
```

- [ ] **Step 7: Nói ra khi chưa có tài khoản Phòng Đào tạo nào**

Spec §7.3. Sau migration, không kỳ nào hiện hành và chỉ Phòng Đào tạo gạt được
— nếu chưa ai có role đó thì **không ai trong hệ thống đặt được kỳ hiện hành**,
và mọi màn hình giảng viên đứng im mà không nói vì sao. Đây là hành vi đúng
nhưng phải hiện ra.

Trong `apps/web/src/app/admin/accounts/page.tsx`, thêm ngay dưới `PageHeader`:

```tsx
{!accounts.isLoading && !hasAcademicAccount && (
  <Alert variant="warning">
    <AlertDescription>
      Chưa có tài khoản Phòng Đào tạo nào. Không ai đặt được học kỳ hiện hành,
      nên mọi màn hình lọc theo học kỳ sẽ trống cho tới khi có một tài khoản
      với vai trò này.
    </AlertDescription>
  </Alert>
)}
```

với

```tsx
const hasAcademicAccount = (accounts.data?.items ?? []).some(
  (a) => a.role === 'academic_affairs',
);
```

Test trong `apps/web/src/app/admin/accounts/page.test.tsx`:

```typescript
it('cảnh báo khi chưa có tài khoản Phòng Đào tạo nào', async () => {
  useAccountsMock.mockReturnValue({
    data: { items: [{ id: '1', name: 'A', email: 'a@x.vn', role: 'teacher' }], total: 1 },
    isLoading: false,
    error: null,
  });
  render(<AccountsPage />);
  expect(screen.getByText(/Chưa có tài khoản Phòng Đào tạo nào/)).toBeInTheDocument();
});

it('im lặng khi đã có', async () => {
  useAccountsMock.mockReturnValue({
    data: { items: [{ id: '1', name: 'P', email: 'p@x.vn', role: 'academic_affairs' }], total: 1 },
    isLoading: false,
    error: null,
  });
  render(<AccountsPage />);
  expect(screen.queryByText(/Chưa có tài khoản Phòng Đào tạo nào/)).not.toBeInTheDocument();
});
```

Lưu ý: danh sách có phân trang, nên `some()` chỉ nhìn trang hiện tại. Chấp nhận
được — cảnh báo sai-âm ở trang 2 chỉ làm mất một lời nhắc, không làm hỏng gì;
gọi thêm một query đếm role chỉ để hiện một dòng là không đáng.

- [ ] **Step 8: Regenerate OpenAPI schema**

Route mới cần có trong `packages/shared/src/api/schema.d.ts` để `apiClient.PUT('/semesters/{id}/current')` type-check.

```bash
cd apps/api && npm run dev    # nền, chờ tới khi /api-docs-json trả 200
cd packages/shared && node scripts/generate-api-client.mjs
# rồi dừng API dev
```

- [ ] **Step 9: Chạy test + build**

Run: `cd apps/web && npx vitest run && npx tsc --noEmit && npx next build`
Expected: test pass; tsc chỉ còn 2 lỗi `buffer.File` sẵn có trong `read-workbook.test.ts`; build sạch.

- [ ] **Step 10: Commit**

```bash
git add apps/web/src packages/shared/src/api/schema.d.ts
git commit -m "feat(web): tier Phòng Đào tạo, và trang Học kỳ dời khỏi khoa"
```

> **Đây là điểm merge.** Task 0–4 đi cùng nhau lên main. Không mở PR riêng cho từng task.

---

### Task 5: `semesterId` cho hai endpoint lớp học

**Files:**
- Create: `apps/api/src/course/dto/semester-scope.dto.ts`
- Modify: `apps/api/src/course/class.service.ts`, `class.controller.ts`, `course.types.ts`
- Test: `apps/api/test/semester-filter.e2e-spec.ts` (mới)

**Interfaces:**
- Produces: `SemesterScopeDto { semesterId?: string }`; `findForTeacher(teacherId, semesterId?)`; `findForHead(headId, semesterId?)`; `TeachingClassView` thêm `semesterId`, `semesterName`

- [ ] **Step 1: Viết test đỏ — bộ lọc KHÔNG được thay thế phạm vi**

Create `apps/api/test/semester-filter.e2e-spec.ts`. Fixture là trọng tâm: hai
Trưởng khoa cùng dùng **một** học kỳ, mỗi người một môn và một lớp. Nếu hai
khoa nằm ở hai học kỳ khác nhau thì bài test vô nghĩa — bộ lọc sẽ tách họ ra
kể cả khi điều kiện sở hữu đã bị thay thế.

```typescript
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';
import { createTestAccount } from './helpers/create-account';

describe('Bộ lọc học kỳ không được thay thế phạm vi sở hữu (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let schema: string;
  const stamp = Date.now();

  let headAToken: string, teacherAToken: string;
  let sharedSemesterId: string, otherSemesterId: string;
  let courseOfA: string, courseOfB: string;
  let classOfA: string, classOfB: string;
  let sessionOfTeacherA: string, sessionOfTeacherB: string;

  async function login(email: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'correct-horse-battery' });
    return res.body.accessToken;
  }

  async function makeAccount(prefix: string, role: string): Promise<[string, string]> {
    const email = `${prefix}_${stamp}@example.com`;
    const id = await createTestAccount(dataSource, {
      email, password: 'correct-horse-battery', role,
    });
    return [id, await login(email)];
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new PostgresExceptionFilter());
    await app.init();
    dataSource = app.get(DataSource);
    schema = (dataSource.options as { schema?: string }).schema ?? 'examcollect';

    const [headAId, tokenHeadA] = await makeAccount('sf_head_a', 'department_admin');
    const [headBId] = await makeAccount('sf_head_b', 'department_admin');
    const [teacherAId, tokenTeacherA] = await makeAccount('sf_teacher_a', 'teacher');
    const [teacherBId] = await makeAccount('sf_teacher_b', 'teacher');
    headAToken = tokenHeadA;
    teacherAToken = tokenTeacherA;

    const [shared] = await dataSource.query(
      `INSERT INTO ${schema}.semester (name, start_date, end_date)
       VALUES ($1, '2026-09-01', '2027-01-15') RETURNING id`,
      [`SF Shared ${stamp}`],
    );
    sharedSemesterId = shared.id;
    const [other] = await dataSource.query(
      `INSERT INTO ${schema}.semester (name, start_date, end_date)
       VALUES ($1, '2027-02-01', '2027-06-30') RETURNING id`,
      [`SF Other ${stamp}`],
    );
    otherSemesterId = other.id;

    // Hai môn, hai chủ khoa khác nhau, CÙNG một học kỳ. Đây là điểm mấu chốt.
    const mkCourse = async (code: string, headId: string) => {
      const [row] = await dataSource.query(
        `INSERT INTO ${schema}.course (code, name, semester_id, department_head_id)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [code, 'SF Course', sharedSemesterId, headId],
      );
      return row.id as string;
    };
    courseOfA = await mkCourse(`SFA${stamp}`.slice(0, 20), headAId);
    courseOfB = await mkCourse(`SFB${stamp}`.slice(0, 20), headBId);

    const mkClass = async (courseId: string, teacherId: string) => {
      const [row] = await dataSource.query(
        `INSERT INTO ${schema}.class (course_id, name, teacher_id)
         VALUES ($1, 'N01', $2) RETURNING id`,
        [courseId, teacherId],
      );
      return row.id as string;
    };
    classOfA = await mkClass(courseOfA, teacherAId);
    classOfB = await mkClass(courseOfB, teacherBId);

    const [room] = await dataSource.query(
      `INSERT INTO ${schema}.room (name, capacity) VALUES ($1, 40) RETURNING id`,
      [`SF Room ${stamp}`],
    );

    // Mỗi giảng viên một phiên, khung giờ lệch nhau để không đụng
    // ex_exam_session_room_overlap.
    const mkSession = async (courseId: string, classId: string, teacherId: string, offsetMin: number) => {
      const start = new Date(Date.now() + offsetMin * 60_000);
      const [row] = await dataSource.query(
        `INSERT INTO ${schema}.exam_session
           (name, code, course_id, class_id, room_id, exam_type, teacher_id, start_time, end_time, status)
         VALUES ($1, $2, $3, $4, $5, 'TK', $6, $7, $8, 'active') RETURNING id`,
        [
          'SF Session', `SF${offsetMin}${stamp}`.slice(0, 20),
          courseId, classId, room.id, teacherId,
          start.toISOString(), new Date(start.getTime() + 15 * 60_000).toISOString(),
        ],
      );
      return row.id as string;
    };
    sessionOfTeacherA = await mkSession(courseOfA, classOfA, teacherAId, 5);
    sessionOfTeacherB = await mkSession(courseOfB, classOfB, teacherBId, 30);
  }, 60_000);

  afterAll(async () => { await app.close(); });
```

Rồi các `it` dưới đây nằm trong cùng `describe`:

```typescript
  // Đây là lớp lỗi mà test này tồn tại để bắt: một bộ lọc optional thêm sau
  // rất dễ bị viết thành nhánh ("có semesterId thì where theo semester, không
  // thì where theo owner") thay vì AND thêm vào điều kiện sở hữu. Viết sai
  // kiểu đó, Trưởng khoa A truyền semesterId hợp lệ là thấy lớp của B.
  it('Trưởng khoa A truyền semesterId trỏ tới dữ liệu của B → vẫn rỗng', async () => {
    const res = await request(app.getHttpServer())
      .get('/classes/mine')
      .query({ semesterId: sharedSemesterId })
      .set('Authorization', `Bearer ${headAToken}`)
      .expect(200);

    const ids = (res.body as { id: string }[]).map((k) => k.id);
    expect(ids).toContain(classOfA);
    expect(ids).not.toContain(classOfB);
  }, 30_000);

  it('giảng viên truyền semesterId của kỳ mình không dạy → rỗng, không phải lớp người khác', async () => {
    const res = await request(app.getHttpServer())
      .get('/classes/teaching')
      .query({ semesterId: otherSemesterId })
      .set('Authorization', `Bearer ${teacherAToken}`)
      .expect(200);
    expect(res.body).toHaveLength(0);
  }, 30_000);

  it('không truyền semesterId thì trả mọi kỳ, như cũ', async () => {
    const res = await request(app.getHttpServer())
      .get('/classes/teaching')
      .set('Authorization', `Bearer ${teacherAToken}`)
      .expect(200);
    expect((res.body as unknown[]).length).toBeGreaterThanOrEqual(2);
  }, 30_000);

  it('semesterId không phải uuid → 400', async () => {
    await request(app.getHttpServer())
      .get('/classes/teaching')
      .query({ semesterId: 'khong-phai-uuid' })
      .set('Authorization', `Bearer ${teacherAToken}`)
      .expect(400);
  }, 30_000);

  it('trả kèm tên học kỳ để phân biệt hai lớp N01 khác kỳ', async () => {
    const res = await request(app.getHttpServer())
      .get('/classes/teaching')
      .set('Authorization', `Bearer ${teacherAToken}`)
      .expect(200);
    expect(res.body[0]).toHaveProperty('semesterName');
  }, 30_000);
```

- [ ] **Step 2: Chạy để thấy nó đỏ**

Run: `cd apps/api && npx jest --config ./test/jest-e2e.json --runInBand --testPathPattern semester-filter`
Expected: FAIL — `semesterName` undefined, và `semesterId` bị `whitelist: true` loại nên không lọc gì.

- [ ] **Step 3: DTO dùng chung**

Create `apps/api/src/course/dto/semester-scope.dto.ts`:

```typescript
import { IsOptional, IsUUID } from 'class-validator';

/**
 * Bộ lọc học kỳ dùng chung cho các danh sách học vụ.
 *
 * LỌC, không phải PHẠM VI. Service AND nó vào điều kiện sở hữu sẵn có và
 * không bao giờ thay thế — xem spec §5.1 và semester-filter.e2e-spec.ts.
 */
export class SemesterScopeDto {
  @IsOptional()
  @IsUUID()
  semesterId?: string;
}
```

- [ ] **Step 4: Service**

Modify `apps/api/src/course/class.service.ts` — `findForTeacher`:

```typescript
  async findForTeacher(
    teacherId: string,
    semesterId?: string,
  ): Promise<TeachingClassView[]> {
    const qb = this.classes
      .createQueryBuilder('k')
      .innerJoinAndSelect('k.course', 'course')
      .innerJoinAndSelect('course.semester', 'semester')
      .leftJoin('enrollment', 'e', 'e.home_class_id = k.id')
      .addSelect('COUNT(e.id)', 'studentCount')
      // Điều kiện sở hữu đứng ở .where và ở nguyên đó. Bộ lọc bên dưới chỉ
      // được AND thêm — không bao giờ thay thế.
      .where('k.teacherId = :teacherId', { teacherId });

    if (semesterId) {
      qb.andWhere('course.semesterId = :semesterId', { semesterId });
    }

    const { entities, raw } = await qb
      .groupBy('k.id')
      .addGroupBy('course.id')
      .addGroupBy('semester.id')
      .orderBy('course.code', 'ASC')
      .addOrderBy('k.name', 'ASC')
      .getRawAndEntities<{ studentCount: string }>();

    return entities.map((klass, index) => ({
      id: klass.id,
      name: klass.name,
      courseId: klass.courseId,
      courseCode: klass.course.code,
      courseName: klass.course.name,
      semesterId: klass.course.semesterId,
      semesterName: klass.course.semester.name,
      studentCount: parseInt(raw[index].studentCount, 10),
    }));
  }
```

`findForHead` — thêm điều kiện vào `where` object:

```typescript
  async findForHead(headId: string, semesterId?: string): Promise<ClassEntity[]> {
    const owned = await this.courses.find({
      where: {
        departmentHeadId: headId,
        ...(semesterId ? { semesterId } : {}),
      },
      select: { id: true },
    });
    if (owned.length === 0) {
      return [];
    }
    return this.classes.find({
      where: { courseId: In(owned.map((c) => c.id)) },
      order: { name: 'ASC' },
    });
  }
```

Lưu ý vì sao an toàn: `departmentHeadId` vẫn nằm trong cùng object `where`, nên nó là AND. `semesterId` chỉ thu hẹp tập môn học **đã** thuộc về head này.

Modify `apps/api/src/course/course.types.ts` — `TeachingClassView` thêm:

```typescript
  /** Học kỳ của môn — thứ duy nhất phân biệt N01 của HK1 với N01 của HK2. */
  semesterId: string;
  semesterName: string;
```

- [ ] **Step 5: Controller**

Modify `apps/api/src/course/class.controller.ts`:

```typescript
  @Get('mine')
  @Roles('department_admin')
  findMine(@Query() query: SemesterScopeDto, @Req() req: Request) {
    return this.classes.findForHead(req.user!.sub, query.semesterId);
  }

  @Get('teaching')
  @Roles('teacher')
  findTeaching(@Query() query: SemesterScopeDto, @Req() req: Request) {
    return this.classes.findForTeacher(req.user!.sub, query.semesterId);
  }
```

Thêm `Query` vào import `@nestjs/common` và import `SemesterScopeDto`.

- [ ] **Step 6: Chạy test**

Run: `cd apps/api && npx jest --config ./test/jest-e2e.json --runInBand --testPathPattern semester-filter`
Expected: tất cả pass.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/course apps/api/test/semester-filter.e2e-spec.ts
git commit -m "feat(course): lọc lớp theo học kỳ, AND vào điều kiện sở hữu"
```

---

### Task 6: `semesterId` cho môn học và phiên thi

**Files:**
- Modify: `apps/api/src/course/course.service.ts`, `course.controller.ts`
- Modify: `apps/api/src/exam-session/dto/search-exam-sessions.dto.ts`, `exam-session.service.ts`
- Test: `apps/api/test/semester-filter.e2e-spec.ts` (mở rộng)

**Interfaces:**
- Consumes: `SemesterScopeDto` (Task 5)
- Produces: `CourseService.findForHead(headId, semesterId?)`; `SearchExamSessionsDto.semesterId`

- [ ] **Step 1: Viết test đỏ**

Thêm vào `apps/api/test/semester-filter.e2e-spec.ts`:

```typescript
  it('GET /courses/mine lọc theo học kỳ mà vẫn giữ phạm vi khoa', async () => {
    const res = await request(app.getHttpServer())
      .get('/courses/mine')
      .query({ semesterId: sharedSemesterId })
      .set('Authorization', `Bearer ${headAToken}`)
      .expect(200);
    const ids = (res.body as { id: string }[]).map((c) => c.id);
    expect(ids).toContain(courseOfA);
    expect(ids).not.toContain(courseOfB);
  }, 30_000);

  it('GET /exam-sessions lọc theo học kỳ mà vẫn giữ phạm vi giảng viên', async () => {
    const res = await request(app.getHttpServer())
      .get('/exam-sessions')
      .query({ semesterId: sharedSemesterId })
      .set('Authorization', `Bearer ${teacherAToken}`)
      .expect(200);
    const ids = (res.body.items as { id: string }[]).map((s) => s.id);
    expect(ids).toContain(sessionOfTeacherA);
    expect(ids).not.toContain(sessionOfTeacherB);
  }, 30_000);
```

Fixture thêm: mỗi giảng viên một phiên thi trong `sharedSemesterId`.

- [ ] **Step 2: Chạy để thấy nó đỏ**

Run: `cd apps/api && npx jest --config ./test/jest-e2e.json --runInBand --testPathPattern semester-filter`
Expected: FAIL — cả hai phiên/môn đều trả về vì `semesterId` bị loại.

- [ ] **Step 3: Course service + controller**

```typescript
  async findForHead(headId: string, semesterId?: string): Promise<CourseEntity[]> {
    return this.courses.find({
      where: {
        departmentHeadId: headId,
        ...(semesterId ? { semesterId } : {}),
      },
      order: { code: 'ASC' },
    });
  }
```

```typescript
  @Get('mine')
  @Roles('department_admin')
  findMine(@Query() query: SemesterScopeDto, @Req() req: Request) {
    return this.courses.findForHead(req.user!.sub, query.semesterId);
  }
```

- [ ] **Step 4: Exam session DTO + service**

Thêm vào `SearchExamSessionsDto`:

```typescript
  /** Lọc, không phải phạm vi — service AND nó vào s.teacherId. Spec §5.1. */
  @IsOptional()
  @IsUUID()
  semesterId?: string;
```

(thêm `IsUUID` vào import `class-validator`)

Trong `findAllForOwner`, sau các `if` sẵn có:

```typescript
    if (query.semesterId) {
      // Qua course, vì exam_session không mang semester_id — nó thừa hưởng
      // học kỳ từ môn. `course` đã leftJoin ở trên.
      qb.andWhere('course.semesterId = :semesterId', { semesterId: query.semesterId });
    }
```

- [ ] **Step 5: Chạy test + toàn bộ e2e**

Run: `cd apps/api && npx jest --config ./test/jest-e2e.json --runInBand`
Expected: mọi suite pass.

- [ ] **Step 6: Regenerate schema + commit**

```bash
cd apps/api && npm run dev   # nền
cd packages/shared && node scripts/generate-api-client.mjs
# dừng API dev
git add apps/api/src packages/shared/src/api/schema.d.ts apps/api/test/semester-filter.e2e-spec.ts
git commit -m "feat(api): lọc môn học và phiên thi theo học kỳ"
```

---

### Task 7: `useSemesterFilter()` + `<SemesterFilter>`

**Files:**
- Create: `apps/web/src/hooks/useSemesterFilter.ts`
- Create: `apps/web/src/hooks/useSemesterFilter.test.ts`
- Create: `apps/web/src/components/layout/semester-filter.tsx`
- Modify: `apps/web/src/lib/api/department.ts` (`Semester.isCurrent`)

**Interfaces:**
- Produces: `useSemesterFilter(scopeKey: string): { semesterId: string | null; setSemesterId: (v: string | null) => void; semesters: Semester[]; current: Semester | null; isLoading: boolean; isStale: boolean; staleDays: number }`; `<SemesterFilter value onChange semesters current isStale staleDays />`

- [ ] **Step 1: Viết test đỏ cho seed-once**

Create `apps/web/src/hooks/useSemesterFilter.test.ts`:

```typescript
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const useSemestersMock = vi.fn();
vi.mock('@/hooks/useDepartment', () => ({
  useSemesters: () => useSemestersMock(),
}));

import { useSemesterFilter } from './useSemesterFilter';

const SEMESTERS = [
  { id: 's1', name: 'HK1', startDate: '2026-09-01', endDate: '2027-01-15', isCurrent: false },
  { id: 's2', name: 'HK2', startDate: '2027-02-01', endDate: '2027-06-30', isCurrent: true },
];

beforeEach(() => {
  useSemestersMock.mockReturnValue({ data: SEMESTERS, isLoading: false });
});

describe('useSemesterFilter', () => {
  it('mặc định là kỳ đang gạt cờ', async () => {
    const { result } = renderHook(() => useSemesterFilter('classes'));
    await waitFor(() => expect(result.current.semesterId).toBe('s2'));
  });

  // Nếu gieo lại mỗi render, lựa chọn của giảng viên bị ghi đè ngay lập tức —
  // đúng cái bẫy mà trang Quản lý bài thu đã phải học bằng seededRef.
  it('KHÔNG ghi đè lựa chọn của người dùng khi dữ liệu về lại', async () => {
    const { result, rerender } = renderHook(() => useSemesterFilter('classes'));
    await waitFor(() => expect(result.current.semesterId).toBe('s2'));

    act(() => result.current.setSemesterId('s1'));
    expect(result.current.semesterId).toBe('s1');

    useSemestersMock.mockReturnValue({ data: [...SEMESTERS], isLoading: false });
    rerender();
    expect(result.current.semesterId).toBe('s1');
  });

  it('null nghĩa là "tất cả học kỳ", và giữ được null', async () => {
    const { result, rerender } = renderHook(() => useSemesterFilter('classes'));
    await waitFor(() => expect(result.current.semesterId).toBe('s2'));
    act(() => result.current.setSemesterId(null));
    rerender();
    expect(result.current.semesterId).toBeNull();
  });

  it('không kỳ nào gạt cờ → null, KHÔNG tự chọn đại một kỳ', async () => {
    useSemestersMock.mockReturnValue({
      data: SEMESTERS.map((s) => ({ ...s, isCurrent: false })),
      isLoading: false,
    });
    const { result } = renderHook(() => useSemesterFilter('classes'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.semesterId).toBeNull();
    expect(result.current.current).toBeNull();
  });

  it('báo cũ khi kỳ hiện hành đã qua end_date', async () => {
    vi.setSystemTime(new Date('2027-07-12T00:00:00Z'));
    const { result } = renderHook(() => useSemesterFilter('classes'));
    await waitFor(() => expect(result.current.isStale).toBe(true));
    expect(result.current.staleDays).toBe(12);
    vi.useRealTimers();
  });

  it('gieo lại khi đổi sang trang khác', async () => {
    const { result, rerender } = renderHook(({ k }) => useSemesterFilter(k), {
      initialProps: { k: 'classes' },
    });
    await waitFor(() => expect(result.current.semesterId).toBe('s2'));
    act(() => result.current.setSemesterId('s1'));

    // Ref reset theo ĐỊNH DANH TRANG, không theo dữ liệu trả về.
    rerender({ k: 'exam-sessions' });
    await waitFor(() => expect(result.current.semesterId).toBe('s2'));
  });
});
```

- [ ] **Step 2: Chạy để thấy nó đỏ**

Run: `cd apps/web && npx vitest run src/hooks/useSemesterFilter.test.ts`
Expected: FAIL — module chưa tồn tại.

- [ ] **Step 3: Viết hook**

Create `apps/web/src/hooks/useSemesterFilter.ts`:

```typescript
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
  /** Kỳ đang gạt cờ, hoặc null khi chưa ai gạt. */
  current: Semester | null;
  isLoading: boolean;
  /** Kỳ hiện hành đã quá end_date — cờ không tự sửa, phải nói ra. */
  isStale: boolean;
  staleDays: number;
}

/**
 * Bộ lọc học kỳ dùng chung cho mọi màn hình danh sách.
 *
 * Logic gieo-một-lần nằm Ở ĐÂY, không ở từng trang. Năm trang tự gieo là năm
 * biến thể hơi khác nhau, và cái bẫy thì chỉ cần sai một chỗ: tính lại mặc
 * định mỗi render sẽ ghi đè lựa chọn của giảng viên ngay khi query refetch.
 *
 * `scopeKey` là định danh TRANG, không phải dữ liệu. Ref reset theo nó, nên
 * điều hướng sang màn hình khác thì gieo lại từ kỳ hiện hành — còn dữ liệu về
 * lại trên cùng một trang thì không.
 */
export function useSemesterFilter(scopeKey: string): SemesterFilterState {
  const { data, isLoading } = useSemesters();
  const semesters = data ?? [];
  const current = semesters.find((s) => s.isCurrent) ?? null;

  const [semesterId, setSemesterId] = useState<string | null>(null);
  const seededFor = useRef<string | null>(null);

  useEffect(() => {
    if (isLoading || seededFor.current === scopeKey) {
      return;
    }
    seededFor.current = scopeKey;
    // Không kỳ nào gạt cờ → để null ("tất cả"), KHÔNG đoán một kỳ. Trang sẽ
    // nói "Chưa có học kỳ hiện hành" thay vì âm thầm hiện sai kỳ.
    setSemesterId(current?.id ?? null);
  }, [isLoading, scopeKey, current?.id]);

  const staleMs = current ? Date.now() - (new Date(current.endDate).getTime() + DAY_MS) : 0;
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

- [ ] **Step 4: Chạy test**

Run: `cd apps/web && npx vitest run src/hooks/useSemesterFilter.test.ts`
Expected: 6 passed. Nếu case `staleDays` lệch một ngày, sửa **công thức**, không sửa test — `endDate` là `date` (nửa đêm), một kỳ kết thúc 30/06 chưa "cũ" trong ngày 30/06.

- [ ] **Step 5: Component**

Create `apps/web/src/components/layout/semester-filter.tsx`:

```tsx
'use client';

import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
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
 * Một control cho mọi màn hình. "Tất cả học kỳ" luôn có mặt: nó là lối thoát
 * một click khi mặc định không phải thứ người dùng cần.
 */
export function SemesterFilter({
  value, onChange, semesters, current, isStale, staleDays,
}: SemesterFilterProps) {
  return (
    <div className="flex flex-col gap-1">
      <Select
        value={value ?? 'all'}
        onValueChange={(v) => onChange(v === 'all' ? null : v)}
      >
        <SelectTrigger className="sm:w-64" aria-label="Lọc theo học kỳ">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Tất cả học kỳ</SelectItem>
          {semesters.map((s) => (
            <SelectItem key={s.id} value={s.id}>
              {s.name}
              {s.isCurrent ? ' — đang hiện hành' : ''}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {current === null && (
        <span className="text-caption text-warning-strong">
          Chưa có học kỳ hiện hành — Phòng Đào tạo là người đặt.
        </span>
      )}
      {isStale && (
        <span className="text-caption text-muted-foreground">
          Học kỳ hiện hành đã kết thúc {staleDays} ngày trước.
        </span>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/hooks/useSemesterFilter.ts apps/web/src/hooks/useSemesterFilter.test.ts apps/web/src/components/layout/semester-filter.tsx apps/web/src/lib/api/department.ts
git commit -m "feat(web): bộ lọc học kỳ dùng chung, gieo một lần trong chính hook"
```

---

### Task 8: Gắn bộ lọc vào 5 trang, xoá `pickDefaultSemester`

**Files:**
- Modify: `apps/web/src/app/teacher/classes/page.tsx`, `app/department/classes/page.tsx`, `app/department/courses/page.tsx`, `app/teacher/exam-sessions/page.tsx`, `app/teacher/submissions/page.tsx`
- Modify: `apps/web/src/lib/submission-filters.ts` + test (xoá `pickDefaultSemester`)
- Modify: `apps/web/src/hooks/useTeaching.ts`, `lib/api/teaching.ts`

**Interfaces:**
- Consumes: `useSemesterFilter`, `<SemesterFilter>` (Task 7); `?semesterId=` (Task 5, 6)

- [ ] **Step 1: Viết test đỏ cho "Lớp của tôi"**

Create/modify `apps/web/src/app/teacher/classes/page.test.tsx`:

```typescript
  it('gọi API với kỳ hiện hành, không phải mọi kỳ', async () => {
    render(<TeacherClassesPage />);
    await waitFor(() =>
      expect(useTeachingClassesMock).toHaveBeenCalledWith('s2'),
    );
  });

  it('cột học kỳ chỉ hiện ở chế độ "Tất cả học kỳ"', async () => {
    render(<TeacherClassesPage />);
    await waitFor(() => expect(screen.queryByText('Học kỳ')).not.toBeInTheDocument());

    fireEvent.click(screen.getByLabelText('Lọc theo học kỳ'));
    fireEvent.click(screen.getByText('Tất cả học kỳ'));

    await waitFor(() => expect(screen.getByText('Học kỳ')).toBeInTheDocument());
  });
```

- [ ] **Step 2: Chạy để thấy nó đỏ**

Run: `cd apps/web && npx vitest run src/app/teacher/classes`
Expected: FAIL — hook chưa nhận tham số.

- [ ] **Step 3: Sửa hook + api teaching**

```typescript
export function useTeachingClasses(semesterId?: string | null) {
  return useQuery({
    queryKey: ['classes', 'teaching', semesterId ?? null],
    queryFn: () => listTeachingClasses(semesterId ?? undefined),
  });
}
```

```typescript
export async function listTeachingClasses(semesterId?: string): Promise<TeachingClass[]> {
  const { data, error, response } = await apiClient.GET('/classes/teaching', {
    params: { query: semesterId ? { semesterId } : {} },
  });
  if (error || !response.ok) {
    throw error ?? new Error(`Yêu cầu thất bại (HTTP ${response.status})`);
  }
  return data as unknown as TeachingClass[];
}
```

`TeachingClass` interface thêm `semesterId: string; semesterName: string;`.

- [ ] **Step 4: Gắn vào trang**

Trong `app/teacher/classes/page.tsx`:

```tsx
const filter = useSemesterFilter('teacher-classes');
const classes = useTeachingClasses(filter.semesterId);
const showSemesterColumn = filter.semesterId === null;
```

Trong `PageHeader` (props tường minh — spread cả `filter` sẽ truyền cả
`setSemesterId`/`isLoading` vốn không phải prop của component):

```tsx
<SemesterFilter
  value={filter.semesterId}
  onChange={filter.setSemesterId}
  semesters={filter.semesters}
  current={filter.current}
  isStale={filter.isStale}
  staleDays={filter.staleDays}
/>
```

và cột:

```tsx
{showSemesterColumn && <TableHead scope="col">Học kỳ</TableHead>}
...
{showSemesterColumn && <TableCell>{klass.semesterName}</TableCell>}
```

Cột học kỳ chỉ ở ba danh sách **không có mốc thời gian trên dòng**: Lớp của tôi, TK Lớp học, TK Môn học. **Không** thêm cho Quản lý kỳ thi và Quản lý bài thu — dòng của chúng đã có `startTime`.

- [ ] **Step 5: Bốn trang còn lại — mỗi trang một điểm khác**

**`app/department/classes/page.tsx`** — `useSemesterFilter('department-classes')`;
hook danh sách nhận `filter.semesterId` và đưa vào `?semesterId=`; **có** cột học
kỳ khi ở "Tất cả".

**`app/department/courses/page.tsx`** — `useSemesterFilter('department-courses')`;
**có** cột học kỳ khi ở "Tất cả". Lưu ý: form tạo môn đã có ô chọn học kỳ riêng
— đó là ô KHÁC, đừng nối nó vào bộ lọc.

**`app/teacher/exam-sessions/page.tsx`** — `useSemesterFilter('exam-sessions')`;
truyền `semesterId` vào query object sẵn có cạnh `search`/`status`/`examType`.
**Không** thêm cột học kỳ — dòng đã có `startTime`.

**`app/teacher/submissions/page.tsx`** — khác ba trang trên:

- Xoá `pickDefaultSemester` khỏi import.
- Xoá cả khối `seededRef` + `useEffect` gieo mặc định (dòng ~140).
- Thay bằng `const filter = useSemesterFilter('submissions');`
- Trong `setFilters`, lấy `semesterId` từ `filter.semesterId` thay vì state riêng.
- `<FilterRail>` bỏ mục "Học kỳ" của nó; `<SemesterFilter>` lên `PageHeader`.
- Lọc **vẫn chạy client** như cũ. Chỉ NGUỒN của mặc định đổi — không đổi
  `applyFilters`/`buildFacets`.
- **Không** thêm cột học kỳ.

Xoá hàm `pickDefaultSemester` khỏi `lib/submission-filters.ts` và các test của nó khỏi `lib/submission-filters.test.ts`. Nó là định nghĩa "hiện tại" thứ hai (suy từ giờ phiên thi), và để lại là để app tiếp tục có hai sự thật.

- [ ] **Step 6: Chạy toàn bộ web test + build**

Run: `cd apps/web && npx vitest run && npx tsc --noEmit && npx next build`
Expected: pass; tsc chỉ còn 2 lỗi `buffer.File` sẵn có.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): năm màn hình lọc theo học kỳ, và app hết hai định nghĩa 'hiện tại'"
```

---

### Task 9: Nhắc việc tồn đọng của kỳ trước *(cắt trước tiên nếu hết thời gian)*

**Files:**
- Modify: `apps/web/src/app/teacher/dashboard/page.tsx`
- Test: `apps/web/src/app/teacher/dashboard/page.test.tsx`

**Interfaces:**
- Consumes: `useSessionOverview()`, `getAttentionReasons` (đã có)

- [ ] **Step 1: Viết test đỏ**

```typescript
  it('nhắc khi kỳ TRƯỚC còn phiên cần chú ý', async () => {
    // Rollover đổi màn hình mặc định, và bài chưa chấm của kỳ cũ rời khỏi
    // tầm nhìn mà không có bước nào bắt người ta nhìn vào nó.
    render(<TeacherDashboardPage />);
    await waitFor(() =>
      expect(screen.getByText(/HK1 2026-2027 còn 3 phiên cần chú ý/)).toBeInTheDocument(),
    );
  });

  it('im lặng khi kỳ trước đã sạch', async () => {
    render(<TeacherDashboardPage />);
    await waitFor(() => expect(screen.queryByText(/còn .* phiên cần chú ý/)).not.toBeInTheDocument());
  });
```

- [ ] **Step 2: Chạy để thấy nó đỏ**

Run: `cd apps/web && npx vitest run src/app/teacher/dashboard`
Expected: FAIL.

- [ ] **Step 3: Implement**

Trong `apps/web/src/app/teacher/dashboard/page.tsx`:

```tsx
const overview = useSessionOverview();            // không tham số = mọi kỳ
const { current } = useSemesterFilter('dashboard');
const now = Date.now();

/**
 * Kỳ ĐÃ QUA gần nhất còn phiên cần chú ý.
 *
 * Chỉ một dòng, chỉ một kỳ: đây là lời nhắc, không phải bảng thứ hai. Gom
 * theo semesterId rồi lấy kỳ có phiên mới nhất — kỳ vừa xong là kỳ giảng viên
 * còn nhớ và còn xử lý được.
 */
const pending = useMemo(() => {
  const stale = (overview.data ?? []).filter(
    (item) =>
      item.semesterId !== current?.id &&
      getAttentionReasons(item, now).length > 0,
  );
  if (stale.length === 0) return null;

  const bySemester = new Map<string, { semesterId: string; semesterName: string; count: number; newest: number }>();
  for (const item of stale) {
    const entry = bySemester.get(item.semesterId);
    const startedAt = new Date(item.startTime).getTime();
    if (entry) {
      entry.count += 1;
      entry.newest = Math.max(entry.newest, startedAt);
    } else {
      bySemester.set(item.semesterId, {
        semesterId: item.semesterId,
        semesterName: item.semesterName,
        count: 1,
        newest: startedAt,
      });
    }
  }
  return [...bySemester.values()].sort((a, b) => b.newest - a.newest)[0];
}, [overview.data, current?.id, now]);
```

```tsx
{pending && (
  <Alert>
    <AlertDescription>
      <Link
        href={`/teacher/submissions?semesterId=${pending.semesterId}`}
        className="underline underline-offset-4"
      >
        {pending.semesterName} còn {pending.count} phiên cần chú ý
      </Link>
    </AlertDescription>
  </Alert>
)}
```

```tsx
{pending && (
  <Alert>
    <AlertDescription>
      <Link href={`/teacher/submissions?semesterId=${pending.semesterId}`}>
        {pending.semesterName} còn {pending.count} phiên cần chú ý
      </Link>
    </AlertDescription>
  </Alert>
)}
```

Và trong `app/teacher/submissions/page.tsx`, ưu tiên tham số URL hơn mặc định gieo:

```tsx
const fromUrl = useSearchParams().get('semesterId');
const filter = useSemesterFilter('submissions');
const semesterId = fromUrl ?? filter.semesterId;
```

Đọc thẳng từ URL mỗi render, **không** thêm một ref seed thứ hai — đúng khuôn
`?student=` mà trang chi tiết phiên đã dùng.

- [ ] **Step 4: Chạy test, build, commit**

```bash
cd apps/web && npx vitest run && npx next build
git add apps/web/src/app/teacher/dashboard
git commit -m "feat(web): nhắc việc tồn đọng của kỳ trước ở dashboard"
```

---

## Sau khi merge

Chạy bước vận hành §9.3 của spec trước khi demo:

1. `admin` tạo tài khoản Phòng Đào tạo (`POST /accounts`, role `academic_affairs`).
2. Đăng nhập, vào `/academic/semesters`, gạt cờ cho `Học kỳ 1 2026-2027`.
3. Mở một trang giảng viên, xác nhận bộ lọc hiện đúng kỳ đó.

Nếu DB đã tích nhiều rác e2e: `docker exec -i cine-postgres-1 psql -U examcollect_admin -d examcollect -v ON_ERROR_STOP=1 < scripts/reset-dev-data.sql`.

**Việc kế tiếp ngay sau:** `room` cũng đang bị mọi Trưởng khoa cùng sửa — cùng lớp lỗi, dùng lại bộ khung này, không cần khái niệm "hiện hành". Spec §8.
