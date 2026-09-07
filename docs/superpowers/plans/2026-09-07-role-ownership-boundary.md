# Ranh giới sở hữu giữa ba tier — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Áp một quy tắc sở hữu duy nhất lên ba tier — tài nguyên cấp trường thuộc Phòng Đào tạo, tài nguyên của khoa thuộc Trưởng khoa, tài khoản và hệ thống thuộc Admin — và vá ba lỗ hở thật lộ ra khi làm việc đó.

**Architecture:** Không có migration. Thay đổi gồm: `@Roles` trên 7 endpoint, hai bước kiểm mới trong `CourseService`, một endpoint được tái dụng thành danh mục môn, và việc di chuyển hai trang web sang area khác. Việc siết kiểu cho `Roles` decorator đi đầu vì mọi task sau đều viết `@Roles`.

**Tech Stack:** NestJS 11 + TypeORM + PostgreSQL 16.15 · Next.js 15 App Router + TanStack Query + shadcn/ui · Jest (API unit + e2e) · Vitest (web) · openapi-typescript/openapi-fetch codegen

**Spec:** `docs/superpowers/specs/2026-09-07-role-ownership-boundary-design.md`

## Global Constraints

- **Không có migration nào trong plan này.** `course.department_head_id` đã nullable; enum `account_role` đã đủ 4 giá trị (`admin`, `teacher`, `academic_affairs`, `department_admin`). Nếu bạn thấy mình cần migration, bạn đã đi lệch spec — dừng và hỏi.
- **Giá trị enum role là `academic_affairs`.** `super_admin` **không tồn tại** trong DB (đo lúc viết spec: enum có đúng 4 nhãn; 19 tài khoản mang `academic_affairs`, 0 mang `super_admin`). Đừng gõ `super_admin` ở bất kỳ code mới nào.
- **Mọi ranh giới quyền phải có test hai vế**: một test khẳng định role đúng làm được, một test khẳng định role cũ **403**. Chỉ vế thứ nhất thì một lần nới quyền quá tay sẽ đi qua xanh.
- **Ownership không bao giờ đến từ request body.** `CreateCourseDto` không có `departmentHeadId` và không được thêm.
- **Audit log là append-only** (`trg_audit_log_immutable`). Mọi ghi audit đi qua `AuditLogService.recordUserAction`, không `INSERT` thô.
- **Repo dùng CRLF** (`core.autocrlf=true`). Sửa file bằng script node thì phải ghi lại CRLF; Python không dùng được trên máy này.
- **Backtick trong Bash** đã nhiều lần làm hỏng nội dung (command substitution). Commit message dài thì ghi ra file rồi `git commit -F <file>`.

### Điều kiện tiên quyết trước khi chạy e2e

```bash
docker compose up -d postgres minio
# Bucket `examcollect-submissions` PHẢI tồn tại — thiếu nó cho ra lỗi trông
# như bug nghiệp vụ, không như lỗi hạ tầng.
```

### Lệnh dùng suốt plan

```bash
# API unit
cd apps/api && npm test
# API e2e — một file
cd apps/api && npx jest --config ./test/jest-e2e.json <ten-file> --runInBand
# Web
cd apps/web && npm test && npx tsc --noEmit && npm run lint && npm run build
# Codegen client (sau MỌI thay đổi API mà web phải thấy)
cd packages/shared && npm run generate:api-client
```

**Codegen không đáng tin theo cách đã biết:** `node`'s `fetch` trong script này có lúc ném `ResolveError: fetch failed` dù `curl` tới đúng URL đó trả 200. Đường vòng đã dùng được:

```bash
curl -s http://localhost:4000/api-docs-json -o /tmp/openapi.json
cd packages/shared && API_URL="file:///tmp/openapi.json" npm run generate:api-client
```

Script in `Wrote ...` **kể cả khi nội dung không đổi**, nên xác minh phải bằng `grep -c` trên `packages/shared/src/api/schema.d.ts`, không bằng dòng log.

---

## File Structure

**API — sửa**

| File | Trách nhiệm sau plan |
|---|---|
| `apps/api/src/auth/roles.decorator.ts` | `Roles` nhận `AccountRole[]` — chặn typo role ở compile-time |
| `apps/api/src/auth/roles.guard.ts` | Đọc metadata với kiểu `AccountRole[]` |
| `apps/api/src/course/course.service.ts` | Thêm `findCatalog`, `createForActor`, `updateForActor`, `removeForActor`; sửa `assignOwner`; **xoá** `findUnowned`, `findAll` |
| `apps/api/src/course/course.controller.ts` | `GET /courses` thành danh mục; `POST/PATCH/DELETE` nhận hai vai; **xoá** `GET /courses/unowned` |
| `apps/api/src/course/course.types.ts` | Thêm `CourseCatalogView`; **xoá** `CourseView` |
| `apps/api/src/course/dto/course-catalog.dto.ts` | **Tạo** — query DTO cho danh mục |
| `apps/api/src/room/room.controller.ts` | Ghi phòng thi đổi sang `academic_affairs` |
| `apps/api/src/accounts/accounts.service.ts` | `remove` trả 409 tách phụ thuộc giải được / vĩnh viễn |
| `apps/api/test/helpers/create-account.ts` | Dùng `AccountRole`, xoá danh sách chép tay |
| `apps/api/test/department-resources.e2e-spec.ts` | Sửa fallout phòng thi + môn chưa chủ |
| `apps/api/test/course-catalog.e2e-spec.ts` | **Tạo** — danh mục, tạo môn hai vai, sửa/xoá theo vai |
| `apps/api/test/course-assign-owner.e2e-spec.ts` | **Tạo** — kiểm vai người nhận + audit |
| `apps/api/test/account-delete-dependencies.e2e-spec.ts` | **Tạo** — 409 tách hai loại |

**Web — sửa / tạo / xoá**

| File | Trách nhiệm sau plan |
|---|---|
| `apps/web/src/lib/nav-config.ts` | Quy tắc sở hữu (block comment) + ba mảng nav đổi |
| `apps/web/src/lib/api/department.ts` | `listCourseCatalog`; **xoá** `listUnownedCourses` |
| `apps/web/src/hooks/useDepartment.ts` | `useCourseCatalog`; **xoá** `useUnownedCourses` |
| `apps/web/src/app/academic/courses/page.tsx` | **Tạo** — danh mục môn theo kỳ + phân công |
| `apps/web/src/app/academic/rooms/page.tsx` | **Tạo** (dời từ `department/rooms`) |
| `apps/web/src/app/department/rooms/` | **Xoá** |
| `apps/web/src/app/admin/unowned-courses/` | **Xoá** |
| `apps/web/src/app/department/dashboard/page.tsx` | Sửa `missingLink`; thẻ Phòng thi thành read-only |
| `apps/web/src/lib/account-roles.ts` | `getRoleDisplay` cho role lạ |

---

## Task 1: `Roles` decorator phải có kiểu

Đây là task đi đầu vì mọi task sau đều viết `@Roles`. Hiện `@Roles()` nhận `string[]` ở **43 call site**: một typo cho ra endpoint khóa chết **im lặng** — không lỗi biên dịch (decorator nhận string), không lỗi runtime (guard chỉ trả `false`).

**Files:**
- Modify: `apps/api/src/auth/roles.decorator.ts`
- Modify: `apps/api/src/auth/roles.guard.ts`

**Interfaces:**
- Consumes: `AccountRole` từ `apps/api/src/identity/entities/account.entity.ts` (đã tồn tại: `'admin' | 'teacher' | 'academic_affairs' | 'department_admin'`)
- Produces: `Roles(...roles: AccountRole[])` — mọi task sau gọi nó với giá trị đã được tsc kiểm

- [ ] **Step 1: Viết "test" đỏ — một typo phải làm tsc đỏ**

Đây là thay đổi thuần kiểu, nên vòng đỏ–xanh chạy bằng `tsc`, không bằng Jest. Thêm tạm một typo vào cuối `apps/api/src/auth/roles.decorator.ts`:

```ts
// TẠM THỜI — bước 4 sẽ xoá.
const _typoProbe = Roles('academic_affair');
void _typoProbe;
```

- [ ] **Step 2: Chạy để xác nhận nó KHÔNG đỏ (đây là lỗ hở)**

```bash
cd apps/api && npx tsc --noEmit
```

Expected: **PASS** — không lỗi nào. Đó chính là bug: `'academic_affair'` (thiếu `s`) được nhận. Ghi lại kết quả này; nó là "test đỏ" của task.

- [ ] **Step 3: Siết kiểu**

`apps/api/src/auth/roles.decorator.ts` — thay toàn bộ nội dung:

```ts
import { SetMetadata } from '@nestjs/common';
import type { AccountRole } from '../identity/entities/account.entity';

export const ROLES_KEY = 'roles';

/**
 * `AccountRole[]`, không phải `string[]`.
 *
 * Trước đây tham số là `string[]`, và đó là một cái bẫy fail-CLOSED: gõ
 * `@Roles('academic_affair')` thiếu một chữ `s` thì biên dịch sạch, guard so
 * sánh không bao giờ khớp, và endpoint bị khóa với đúng role cần dùng nó —
 * không lỗi biên dịch, không lỗi runtime, không log. Chỉ một 403 không ai
 * giải thích được.
 *
 * `import type` để không tạo phụ thuộc runtime từ auth sang identity.
 */
export const Roles = (...roles: AccountRole[]) => SetMetadata(ROLES_KEY, roles);
```

`apps/api/src/auth/roles.guard.ts` — sửa đúng một dòng, cộng import:

```ts
import type { AccountRole } from '../identity/entities/account.entity';
```

```ts
    const requiredRoles = this.reflector.getAllAndOverride<AccountRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
```

- [ ] **Step 4: Chạy lại — giờ typo phải đỏ, rồi xoá probe**

```bash
cd apps/api && npx tsc --noEmit
```

Expected: **FAIL**, đại ý `Argument of type '"academic_affair"' is not assignable to parameter of type 'AccountRole'`.

Xoá hai dòng `_typoProbe` ở Step 1, rồi chạy lại:

```bash
cd apps/api && npx tsc --noEmit
```

Expected: **PASS**. Nếu có call site nào đỏ, đó là một typo thật đã tồn tại — sửa nó và **ghi vào commit message**, vì đó là một endpoint đang khóa chết trong production.

- [ ] **Step 5: Chạy full test + lint**

```bash
cd apps/api && npm test && npm run lint
```

Expected: PASS. Task này không đổi hành vi runtime nào.

- [ ] **Step 6: Commit**

```bash
cd "/c/Users/Admin/Main/Desktop/HKI 2026-2027/KLTN/CINE"
git add apps/api/src/auth/roles.decorator.ts apps/api/src/auth/roles.guard.ts
git commit -m "fix(api): Roles decorator nhan AccountRole[] thay string[]"
```

---

## Task 2: `TestAccountRole` hết là danh sách chép tay

`apps/api/test/helpers/create-account.ts` đang khai lại đúng bốn giá trị của `AccountRole` — hai danh sách thì trôi được, và bản chép tay là chỗ một giá trị đã nghỉ có thể sống sót.

**Files:**
- Modify: `apps/api/test/helpers/create-account.ts`

**Interfaces:**
- Consumes: `AccountRole` (Task 1 đã dùng cùng type)
- Produces: `TestAccountRole` giờ là alias của `AccountRole` — mọi e2e spec import nó tiếp tục biên dịch không cần sửa

- [ ] **Step 1: Viết test đỏ — một role không tồn tại phải bị DB bác**

Tạo `apps/api/test/helpers/create-account.spec.ts`... **KHÔNG.** Helper này cần `DataSource` thật, và cái ta muốn khẳng định là *"enum của Postgres là lưới chắn"* — đó là khẳng định e2e. Thay vào đó thêm test vào `apps/api/test/accounts.e2e-spec.ts`, trong `describe` ngoài cùng:

```ts
  it('enum cua Postgres bac mot role khong ton tai — day la luoi chan cho @Roles', async () => {
    // createTestAccount INSERT thang vao bang that, nen enum account_role tu
    // bac gia tri la (22P02). Day la ly do cac e2e spec la luoi bat chinh cho
    // viec go dung ten role: neu ca code lan test cung dung sai mot gia tri,
    // DB van do — khong nhu unit test co mock.
    await expect(
      dataSource.query(
        `INSERT INTO examcollect.account (name, email, password_hash, role)
         VALUES ('X', $1, 'aaaaaaaaaaaaaaaaaaaaaaaa', 'super_admin')`,
        [`stale_role_${Date.now()}@example.com`],
      ),
    ).rejects.toThrow(/super_admin/);
  });
```

- [ ] **Step 2: Chạy để xác nhận nó PASS ngay**

```bash
cd apps/api && npx jest --config ./test/jest-e2e.json accounts.e2e-spec.ts --runInBand
```

Expected: **PASS**. Test này là *tài liệu hoá một bảo đảm đã có*, không phải vá một lỗi — nên nó xanh từ đầu là đúng. Nếu nó ĐỎ, tức enum vẫn còn `super_admin` và toàn bộ tiền đề của plan sai: **dừng và báo**.

- [ ] **Step 3: Xoá danh sách chép tay**

`apps/api/test/helpers/create-account.ts` — sửa phần đầu:

```ts
import { DataSource } from 'typeorm';
import * as argon2 from 'argon2';
import type { AccountRole } from '../../src/identity/entities/account.entity';

/**
 * Alias, không phải bản chép. Trước đây đây là một union viết tay trùng nội
 * dung với `AccountRole` — và một danh sách chép tay là chỗ một giá trị đã
 * nghỉ (`super_admin`) có thể sống sót sau khi enum đã đổi.
 */
export type TestAccountRole = AccountRole;
```

Giữ nguyên phần còn lại của file.

- [ ] **Step 4: Chạy lại — cả suite e2e phải vẫn xanh**

```bash
cd apps/api && npx tsc --noEmit
cd apps/api && npx jest --config ./test/jest-e2e.json department-resources.e2e-spec.ts semester-filter.e2e-spec.ts accounts.e2e-spec.ts --runInBand
```

Expected: PASS cả ba. Chúng là các spec import `TestAccountRole`.

- [ ] **Step 5: Commit**

```bash
cd "/c/Users/Admin/Main/Desktop/HKI 2026-2027/KLTN/CINE"
git add apps/api/test/helpers/create-account.ts apps/api/test/accounts.e2e-spec.ts
git commit -m "test(api): TestAccountRole la alias cua AccountRole, khong phai ban chep"
```

---

## Task 3: `assignOwner` kiểm vai người nhận + ghi audit, một transaction

Hai lỗ hở thật, cùng một hàm.

**Lỗ 1 — không kiểm vai.** `AssignCourseOwnerDto` chỉ có `@IsUUID()`. FK là `RESTRICT`, nên nó bảo đảm tài khoản **tồn tại**, không bảo đảm **vai trò**. Gán được một môn cho `teacher`. Hậu quả nặng hơn "chưa có chủ": môn đó có `department_head_id IS NOT NULL` nên rời khỏi danh sách chưa-có-chủ, mà `/courses/mine` cũng không head nào trả về — **biến mất khỏi mọi màn hình, kể cả màn cứu hộ**, không đường sửa qua UI.

**Lỗ 2 — không ghi audit.** Phân công đổi quyền đọc của cả cây `course → class → exam_session → submission`. Đây là thao tác duy nhất trong hệ thống dịch chuyển được *ai đọc được bài thi của ai* mà không để lại vết.

**Files:**
- Modify: `apps/api/src/course/course.service.ts`
- Create: `apps/api/test/course-assign-owner.e2e-spec.ts`

**Interfaces:**
- Consumes: `AuditLogService.recordUserAction(input, manager?)` — `CourseModule` **đã** `imports: [AdminModule]` cho `SemesterService`, nên tiêm được ngay. `AccountEntity` **đã** có trong `TypeOrmModule.forFeature`, nên tiêm `Repository<AccountEntity>` được — **không** import `AccountsModule` (nó không export `AccountsService`, và import sẽ tạo phụ thuộc vòng không cần thiết).
- Produces: `assignOwner(id: string, departmentHeadId: string, actorId: string): Promise<CourseEntity>` — chú ý **tham số thứ ba mới**; Task 5 sẽ truyền `req.user!.sub` vào.

- [ ] **Step 1: Viết test đỏ**

Tạo `apps/api/test/course-assign-owner.e2e-spec.ts`:

```ts
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';
import { createTestAccount, type TestAccountRole } from './helpers/create-account';

describe('PATCH /courses/:id/owner', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let academicToken: string;
  let headId: string;
  let teacherId: string;
  let semesterId: string;

  async function makeAccount(prefix: string, role: TestAccountRole) {
    const email = `${prefix}_${Date.now()}${Math.random().toString(36).slice(2, 7)}@example.com`;
    const password = 'Password123!';
    const id = await createTestAccount(dataSource, { email, password, role });
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password });
    return { id, token: login.body.accessToken as string };
  }

  async function makeOrphanCourse() {
    const [row] = await dataSource.query(
      `INSERT INTO examcollect.course (code, name, semester_id)
       VALUES ($1, 'Môn mồ côi', $2) RETURNING id`,
      [`AO${Date.now()}${Math.random().toString(36).slice(2, 5)}`.slice(0, 20), semesterId],
    );
    return row.id as string;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new PostgresExceptionFilter());
    await app.init();
    dataSource = app.get(DataSource);

    academicToken = (await makeAccount('assign_academic', 'academic_affairs')).token;
    headId = (await makeAccount('assign_head', 'department_admin')).id;
    teacherId = (await makeAccount('assign_teacher', 'teacher')).id;

    const [semester] = await dataSource.query(
      `INSERT INTO examcollect.semester (name, start_date, end_date)
       VALUES ($1, '2026-09-01', '2027-01-15') RETURNING id`,
      [`Kỳ phân công ${Date.now()}`],
    );
    semesterId = semester.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('gán cho một Trưởng khoa thì thành công VÀ ghi một dòng audit', async () => {
    const courseId = await makeOrphanCourse();

    const res = await request(app.getHttpServer())
      .patch(`/courses/${courseId}/owner`)
      .set('Authorization', `Bearer ${academicToken}`)
      .send({ departmentHeadId: headId });

    expect(res.status).toBe(200);
    expect(res.body.departmentHeadId).toBe(headId);

    // Vết audit là điều kiện, không phải phần thêm: đây là thao tác duy nhất
    // dịch chuyển được "ai đọc được bài thi của ai".
    const entries = await dataSource.query(
      `SELECT action, target_type, target_id, old_value, new_value
         FROM examcollect.audit_log
        WHERE target_id = $1 AND target_type = 'course'`,
      [courseId],
    );
    expect(entries).toHaveLength(1);
    expect(entries[0].action).toBe('course.assign_owner');
    expect(entries[0].old_value.departmentHeadId).toBeNull();
    expect(entries[0].new_value.departmentHeadId).toBe(headId);
  });

  it('gán cho một giảng viên thì 400 — và KHÔNG ghi audit, KHÔNG đổi dữ liệu', async () => {
    const courseId = await makeOrphanCourse();

    const res = await request(app.getHttpServer())
      .patch(`/courses/${courseId}/owner`)
      .set('Authorization', `Bearer ${academicToken}`)
      .send({ departmentHeadId: teacherId });

    expect(res.status).toBe(400);

    // Gán cho teacher là ca tệ nhất: môn sẽ rời khỏi CẢ /courses/mine lẫn
    // danh sách chưa-có-chủ, tức biến mất khỏi mọi màn hình, không đường sửa.
    const [course] = await dataSource.query(
      `SELECT department_head_id FROM examcollect.course WHERE id = $1`,
      [courseId],
    );
    expect(course.department_head_id).toBeNull();

    const entries = await dataSource.query(
      `SELECT id FROM examcollect.audit_log WHERE target_id = $1`,
      [courseId],
    );
    expect(entries).toHaveLength(0);
  });

  it('gán cho một uuid không phải tài khoản nào thì 400, không phải 500', async () => {
    const courseId = await makeOrphanCourse();

    const res = await request(app.getHttpServer())
      .patch(`/courses/${courseId}/owner`)
      .set('Authorization', `Bearer ${academicToken}`)
      .send({ departmentHeadId: '00000000-0000-4000-8000-000000000000' });

    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Chạy để xác nhận nó đỏ**

```bash
cd apps/api && npx jest --config ./test/jest-e2e.json course-assign-owner.e2e-spec.ts --runInBand
```

Expected: **FAIL**. Test 1 đỏ ở `expect(entries).toHaveLength(1)` (nhận 0 — chưa ghi audit) **và** ở status 200 vs 403 (endpoint còn `@Roles('admin')` — Task 5 mới đổi; ở bước này dùng `adminToken` thay `academicToken` nếu muốn tách sạch hai mối lo, hoặc chấp nhận test đỏ vì cả hai lý do và đổi token ở Task 5). **Chọn cách đơn giản:** ở Task này, thay `academicToken` bằng một `adminToken` (thêm `adminToken = (await makeAccount('assign_admin', 'admin')).token;` vào `beforeAll`), rồi Task 5 đổi lại sang `academicToken`. Ghi chú đó vào một comment trong file để Task 5 biết phải sửa.

- [ ] **Step 3: Sửa `assignOwner`**

`apps/api/src/course/course.service.ts` — thêm import và hai dependency:

```ts
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import { AccountEntity } from '../identity/entities/account.entity';
import { AuditLogService } from '../admin/audit-log.service';
```

```ts
  constructor(
    @InjectRepository(CourseEntity)
    private readonly courses: Repository<CourseEntity>,
    @InjectRepository(ClassEntity)
    private readonly classes: Repository<ClassEntity>,
    @InjectRepository(AccountEntity)
    private readonly accounts: Repository<AccountEntity>,
    private readonly dataSource: DataSource,
    private readonly auditLog: AuditLogService,
  ) {}
```

Thay toàn bộ `assignOwner`:

```ts
  /**
   * Phân công một môn về một Trưởng khoa.
   *
   * Hai bước kiểm mà bản trước không có, và cả hai đều là lỗ hở thật:
   *
   * 1. Người nhận PHẢI có role `department_admin`. FK là RESTRICT nên nó chỉ
   *    bảo đảm tài khoản TỒN TẠI, không bảo đảm VAI TRÒ. Gán cho một
   *    `teacher` là ca tệ nhất có thể: môn đó có `department_head_id IS NOT
   *    NULL` nên rời khỏi danh sách chưa-có-chủ, mà `/courses/mine` cũng
   *    không head nào trả về — nó biến mất khỏi MỌI màn hình, kể cả màn cứu
   *    hộ dựng ra để cứu đúng tình huống này, và không có đường sửa qua UI.
   *
   * 2. Ghi audit, trong CÙNG transaction với `save`. Phân công đổi quyền đọc
   *    của cả cây course → class → exam_session → submission — thao tác duy
   *    nhất trong hệ thống dịch chuyển được "ai đọc được bài thi của ai". Vết
   *    audit không được sống sót qua một lần ghi thất bại, và ngược lại; cùng
   *    lý do `SemesterService.setCurrent` đã làm thế.
   */
  async assignOwner(
    id: string,
    departmentHeadId: string,
    actorId: string,
  ): Promise<CourseEntity> {
    const course = await this.courses.findOne({ where: { id } });
    if (!course) {
      throw new NotFoundException('Course not found');
    }

    const target = await this.accounts.findOne({
      where: { id: departmentHeadId },
      select: { id: true, role: true },
    });
    if (!target || target.role !== 'department_admin') {
      throw new BadRequestException('Chỉ gán được môn cho Trưởng khoa');
    }

    const previousOwner = course.departmentHeadId;

    return this.dataSource.transaction(async (manager) => {
      course.departmentHeadId = departmentHeadId;
      const saved = await manager.getRepository(CourseEntity).save(course);

      await this.auditLog.recordUserAction(
        {
          actorId,
          action: 'course.assign_owner',
          targetType: 'course',
          targetId: course.id,
          oldValue: { departmentHeadId: previousOwner },
          newValue: { departmentHeadId, code: course.code },
        },
        manager,
      );

      return saved;
    });
  }
```

`apps/api/src/course/course.controller.ts` — truyền actor vào:

```ts
  @Patch(':id/owner')
  @Roles('admin')
  assignOwner(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignCourseOwnerDto,
    @Req() req: Request,
  ) {
    return this.courses.assignOwner(id, dto.departmentHeadId, req.user!.sub);
  }
```

- [ ] **Step 4: Chạy lại**

```bash
cd apps/api && npx jest --config ./test/jest-e2e.json course-assign-owner.e2e-spec.ts --runInBand
```

Expected: PASS cả ba test.

- [ ] **Step 5: Chạy các suite có thể vỡ**

```bash
cd apps/api && npx tsc --noEmit
cd apps/api && npx jest --config ./test/jest-e2e.json department-resources.e2e-spec.ts audit-log.e2e-spec.ts --runInBand
cd apps/api && npm test
```

Expected: PASS. `department-resources` có một test `unowned courses` gọi `PATCH /courses/:id/owner` — nó gán cho một `department_admin` nên vẫn xanh; nếu đỏ, đọc kỹ vì nó có thể đang gán cho sai vai (một lỗi thật trong test cũ).

- [ ] **Step 6: Commit**

```bash
cd "/c/Users/Admin/Main/Desktop/HKI 2026-2027/KLTN/CINE"
git add apps/api/src/course/course.service.ts apps/api/src/course/course.controller.ts apps/api/test/course-assign-owner.e2e-spec.ts
git commit -m "fix(api): assignOwner kiem vai nguoi nhan va ghi audit trong mot transaction"
```

---

## Task 4: Phòng thi đổi sang `academic_affairs`

Phòng thi có **đúng tính chất của Học kỳ**: dùng chung toàn trường, `uq_room_name` unique **toàn cục**, mọi Trưởng khoa cùng ghi, không ai sở hữu. `uq_room_name` tồn tại vì cùng lý do `uq_semester_name` — một namespace chung không có chủ. Đây là chỗ sửa gốc thay vì giữ miếng vá.

**Files:**
- Modify: `apps/api/src/room/room.controller.ts`
- Modify: `apps/api/test/department-resources.e2e-spec.ts:203-217` (test `lets a head create a room, and refuses a teacher`)

**Interfaces:**
- Consumes: `Roles` đã có kiểu (Task 1)
- Produces: không có API surface mới; `GET /rooms` giữ nguyên mở, nên `useRooms()` ở web không đổi

- [ ] **Step 1: Viết test đỏ — sửa test cũ thành ba vế**

`apps/api/test/department-resources.e2e-spec.ts` — thay test phòng thi:

```ts
    // Phòng thi là tài nguyên CẤP TRƯỜNG, cùng lớp với Học kỳ: dùng chung
    // toàn trường, uq_room_name unique toàn cục, không khoa nào sở hữu. Trước
    // spec ranh-giới-sở-hữu, mọi Trưởng khoa đều ghi được — nên vế "head 403"
    // dưới đây là điều spec này thay đổi, không phải điều nó bảo toàn.
    it('Phòng Đào tạo tạo được phòng thi; Trưởng khoa và giảng viên thì không', async () => {
      const allowed = await request(app.getHttpServer())
        .post('/rooms')
        .set('Authorization', `Bearer ${academicToken}`)
        .send({ name: `Phòng máy ${Date.now()}`, capacity: 40 });
      expect(allowed.status).toBe(201);

      const refusedHead = await request(app.getHttpServer())
        .post('/rooms')
        .set('Authorization', `Bearer ${headToken}`)
        .send({ name: `Phòng máy ${Date.now()}h`, capacity: 40 });
      expect(refusedHead.status).toBe(403);

      const refusedTeacher = await request(app.getHttpServer())
        .post('/rooms')
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({ name: `Phòng máy ${Date.now()}t`, capacity: 40 });
      expect(refusedTeacher.status).toBe(403);
    });

    // GET vẫn mở: form tạo phiên thi của giảng viên cần danh sách phòng, và
    // đọc một danh sách phòng máy toàn trường không tiết lộ gì.
    it('mọi role đăng nhập vẫn đọc được danh sách phòng', async () => {
      for (const token of [academicToken, headToken, teacherToken]) {
        const res = await request(app.getHttpServer())
          .get('/rooms')
          .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(200);
      }
    });
```

- [ ] **Step 2: Chạy để xác nhận nó đỏ**

```bash
cd apps/api && npx jest --config ./test/jest-e2e.json department-resources.e2e-spec.ts --runInBand
```

Expected: **FAIL** — `allowed.status` là 403 (academic chưa được phép) và `refusedHead.status` là 201 (head vẫn được phép).

- [ ] **Step 3: Đổi `@Roles` trên ba handler ghi**

`apps/api/src/room/room.controller.ts` — sửa comment đầu class và ba decorator:

```ts
/**
 * Read is open — the create-exam-session form needs the list.
 *
 * Write là Phòng Đào tạo, không phải Trưởng khoa. Phòng máy là tài nguyên
 * CẤP TRƯỜNG: nhiều khoa xếp lịch vào cùng một phòng ở các ca khác nhau, tên
 * phòng unique TOÀN CỤC (`uq_room_name`), và không khoa nào sở hữu nó. Trước
 * đây mọi Trưởng khoa đều ghi được — cùng đúng cái lệch tầng mà Học kỳ đã
 * sửa, và `uq_room_name` tồn tại vì cùng lý do `uq_semester_name`: một
 * namespace chung không có chủ.
 *
 * Scope phòng theo khoa thì KHÔNG phải câu trả lời — nó phá ca bình thường
 * (nhiều khoa dùng chung một lab) chứ không bảo vệ gì.
 */
```

Ba handler `create` / `update` / `remove`: `@Roles('department_admin')` → `@Roles('academic_affairs')`.

- [ ] **Step 4: Chạy lại**

```bash
cd apps/api && npx jest --config ./test/jest-e2e.json department-resources.e2e-spec.ts --runInBand
```

Expected: PASS.

- [ ] **Step 5: Quét mọi e2e khác có tạo phòng bằng token head**

```bash
cd apps/api && grep -rln "post('/rooms')\|post(\`/rooms\`)" test/
```

Với mỗi file tìm được ngoài `department-resources`, đọc và đổi token sang một tài khoản `academic_affairs`. **Không nới quyền để test xanh** — nếu một test cần head tạo phòng, test đó đang mã hoá đúng cái lệch tầng ta vừa sửa.

```bash
cd apps/api && npx jest --config ./test/jest-e2e.json --runInBand
```

Expected: PASS toàn bộ. (Chạy full e2e ở đây có chủ đích: đây là task đầu tiên **lấy đi** một quyền, nên fallout có thể ở bất cứ đâu.)

- [ ] **Step 6: Commit**

```bash
cd "/c/Users/Admin/Main/Desktop/HKI 2026-2027/KLTN/CINE"
git add apps/api/src/room/room.controller.ts apps/api/test/
git commit -m "feat(api)!: ghi phong thi doi tu Truong khoa sang Phong Dao tao"
```

---

## Task 5: `GET /courses` thành danh mục môn, xoá `/courses/unowned`

`GET /courses` hiện **không có `@Roles`** (mọi user đăng nhập đọc được mọi môn toàn trường) và **không có consumer nào** ở `apps/web/src` — chỉ `POST /courses` được dùng. Đây là lỗ hở thứ ba cùng lớp với `GET /submissions`. Task này **tái dụng** nó làm endpoint danh mục thay vì thêm endpoint mới: đóng lỗ và mở đường cho §2.1 bằng cùng một thay đổi.

Gộp `/courses/unowned` vào đây thì `findUnowned()` bị **xoá**, nên lỗi thiếu lọc học kỳ của nó (157 môn trải 152 kỳ trong một danh sách phẳng) hết **theo cấu trúc** thay vì được vá.

**Files:**
- Create: `apps/api/src/course/dto/course-catalog.dto.ts`
- Modify: `apps/api/src/course/course.types.ts`
- Modify: `apps/api/src/course/course.service.ts`
- Modify: `apps/api/src/course/course.controller.ts`
- Modify: `apps/api/test/department-resources.e2e-spec.ts` (describe `unowned courses`)
- Create: `apps/api/test/course-catalog.e2e-spec.ts`

**Interfaces:**
- Consumes: `Roles` có kiểu (Task 1); `assignOwner(id, headId, actorId)` (Task 3)
- Produces:
  - `CourseCatalogView { id: string; code: string; name: string; semesterId: string; departmentHeadId: string | null; departmentHeadName: string | null; enrollmentCount: number }`
  - `CourseService.findCatalog(filter: { semesterId?: string; unowned?: boolean }): Promise<CourseCatalogView[]>`
  - `GET /courses?semesterId=<uuid>&unowned=true` — `@Roles('academic_affairs')`
  - **Xoá:** `CourseService.findAll`, `CourseService.findUnowned`, `CourseView`, `GET /courses/unowned`

- [ ] **Step 1: Viết test đỏ**

Tạo `apps/api/test/course-catalog.e2e-spec.ts`:

```ts
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';
import { createTestAccount, type TestAccountRole } from './helpers/create-account';

describe('GET /courses — danh mục môn', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let academicToken: string;
  let headToken: string;
  let headId: string;
  let teacherToken: string;
  let semesterA: string;
  let semesterB: string;
  let ownedCode: string;
  let orphanCode: string;

  async function makeAccount(prefix: string, role: TestAccountRole) {
    const email = `${prefix}_${Date.now()}${Math.random().toString(36).slice(2, 7)}@example.com`;
    const password = 'Password123!';
    const id = await createTestAccount(dataSource, { email, password, role });
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password });
    return { id, token: login.body.accessToken as string };
  }

  async function makeSemester(label: string) {
    const [row] = await dataSource.query(
      `INSERT INTO examcollect.semester (name, start_date, end_date)
       VALUES ($1, '2026-09-01', '2027-01-15') RETURNING id`,
      [`${label} ${Date.now()}${Math.random().toString(36).slice(2, 5)}`],
    );
    return row.id as string;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new PostgresExceptionFilter());
    await app.init();
    dataSource = app.get(DataSource);

    academicToken = (await makeAccount('cat_academic', 'academic_affairs')).token;
    const head = await makeAccount('cat_head', 'department_admin');
    headToken = head.token;
    headId = head.id;
    teacherToken = (await makeAccount('cat_teacher', 'teacher')).token;

    semesterA = await makeSemester('Kỳ danh mục A');
    semesterB = await makeSemester('Kỳ danh mục B');

    ownedCode = `CO${Date.now()}`.slice(0, 20);
    orphanCode = `CU${Date.now()}`.slice(0, 20);

    await dataSource.query(
      `INSERT INTO examcollect.course (code, name, semester_id, department_head_id)
       VALUES ($1, 'Môn có chủ', $2, $3)`,
      [ownedCode, semesterA, headId],
    );
    await dataSource.query(
      `INSERT INTO examcollect.course (code, name, semester_id)
       VALUES ($1, 'Môn chưa chủ', $2)`,
      [orphanCode, semesterA],
    );
    // Một môn ở kỳ B để chứng minh bộ lọc kỳ thật sự lọc.
    await dataSource.query(
      `INSERT INTO examcollect.course (code, name, semester_id)
       VALUES ($1, 'Môn kỳ khác', $2)`,
      [`CB${Date.now()}`.slice(0, 20), semesterB],
    );
  });

  afterAll(async () => {
    await app.close();
  });

  it('chỉ Phòng Đào tạo đọc được; Trưởng khoa và giảng viên bị 403', async () => {
    const allowed = await request(app.getHttpServer())
      .get('/courses')
      .set('Authorization', `Bearer ${academicToken}`);
    expect(allowed.status).toBe(200);

    // Trước spec này endpoint KHÔNG có @Roles nào: mọi user đăng nhập đọc
    // được mọi môn toàn trường. Hai vế dưới đây là lỗ hở được đóng.
    const refusedHead = await request(app.getHttpServer())
      .get('/courses')
      .set('Authorization', `Bearer ${headToken}`);
    expect(refusedHead.status).toBe(403);

    const refusedTeacher = await request(app.getHttpServer())
      .get('/courses')
      .set('Authorization', `Bearer ${teacherToken}`);
    expect(refusedTeacher.status).toBe(403);
  });

  it('trả kèm tên chủ, và null khi chưa có chủ', async () => {
    const res = await request(app.getHttpServer())
      .get('/courses')
      .query({ semesterId: semesterA })
      .set('Authorization', `Bearer ${academicToken}`);

    expect(res.status).toBe(200);
    const owned = res.body.find((c: { code: string }) => c.code === ownedCode);
    const orphan = res.body.find((c: { code: string }) => c.code === orphanCode);

    expect(owned.departmentHeadId).toBe(headId);
    expect(typeof owned.departmentHeadName).toBe('string');
    expect(orphan.departmentHeadId).toBeNull();
    expect(orphan.departmentHeadName).toBeNull();
  });

  it('lọc theo học kỳ — môn của kỳ khác không lọt vào', async () => {
    const res = await request(app.getHttpServer())
      .get('/courses')
      .query({ semesterId: semesterA })
      .set('Authorization', `Bearer ${academicToken}`);

    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    for (const course of res.body) {
      expect(course.semesterId).toBe(semesterA);
    }
  });

  it('unowned=true chỉ trả môn chưa có chủ', async () => {
    const res = await request(app.getHttpServer())
      .get('/courses')
      .query({ semesterId: semesterA, unowned: 'true' })
      .set('Authorization', `Bearer ${academicToken}`);

    expect(res.status).toBe(200);
    expect(res.body.map((c: { code: string }) => c.code)).toContain(orphanCode);
    expect(res.body.map((c: { code: string }) => c.code)).not.toContain(ownedCode);
    for (const course of res.body) {
      expect(course.departmentHeadId).toBeNull();
    }
  });

  it('unowned với giá trị lạ thì 400, không phải im lặng lọc sai', async () => {
    // ValidationPipe ở đây là { whitelist: true, transform: true } và KHÔNG bật
    // enableImplicitConversion, nên một boolean query param sẽ tới service
    // dưới dạng CHUỖI. Bẫy: "false" là truthy. @IsIn(['true']) đóng bẫy đó
    // bằng cách chỉ nhận đúng một giá trị hợp lệ.
    const res = await request(app.getHttpServer())
      .get('/courses')
      .query({ unowned: 'false' })
      .set('Authorization', `Bearer ${academicToken}`);

    expect(res.status).toBe(400);
  });

  it('GET /courses/unowned đã bị xoá', async () => {
    const res = await request(app.getHttpServer())
      .get('/courses/unowned')
      .set('Authorization', `Bearer ${academicToken}`);

    // 400 vì 'unowned' không parse được thành uuid cho route ':id', hoặc 404.
    // Cái không được xảy ra là 200.
    expect(res.status).not.toBe(200);
  });
});
```

- [ ] **Step 2: Chạy để xác nhận nó đỏ**

```bash
cd apps/api && npx jest --config ./test/jest-e2e.json course-catalog.e2e-spec.ts --runInBand
```

Expected: **FAIL** ở gần như mọi test — endpoint chưa có `@Roles`, chưa có filter, chưa trả `departmentHeadName`.

- [ ] **Step 3: Tạo query DTO**

Tạo `apps/api/src/course/dto/course-catalog.dto.ts`:

```ts
import { IsIn, IsOptional, IsUUID } from 'class-validator';

/**
 * Bộ lọc cho danh mục môn cấp trường.
 *
 * `unowned` là chuỗi `'true'`, KHÔNG phải boolean, và đó là quyết định tường
 * minh: `ValidationPipe` của app là `{ whitelist: true, transform: true }` và
 * KHÔNG bật `enableImplicitConversion`, nên một query param khai là `boolean`
 * sẽ tới service dưới dạng chuỗi. Bẫy im lặng ở đó là `"false"` cũng truthy —
 * `?unowned=false` sẽ lọc ngược ý người gọi mà không báo gì.
 *
 * `@IsIn(['true'])` đóng bẫy: chỉ một giá trị hợp lệ, mọi thứ khác ra 400.
 * Không có vế `owned` vì trang chỉ có một công tắc "Chỉ môn chưa có chủ":
 * tắt = tất cả, bật = chưa có chủ.
 */
export class CourseCatalogQueryDto {
  @IsOptional()
  @IsUUID()
  semesterId?: string;

  @IsOptional()
  @IsIn(['true'])
  unowned?: 'true';
}
```

- [ ] **Step 4: Thay `CourseView` bằng `CourseCatalogView`**

`apps/api/src/course/course.types.ts` — xoá `CourseView` và thay bằng:

```ts
/**
 * Một môn như Phòng Đào tạo thấy trong danh mục cấp trường.
 *
 * `departmentHeadName` là lý do view này tồn tại: một cột `departmentHeadId`
 * dạng uuid không nói được cho ai đọc màn hình biết môn đang thuộc khoa nào,
 * và bắt trang tự tra 1 tài khoản / 1 dòng là N+1 trên đúng màn hình có nhiều
 * dòng nhất.
 *
 * `null` ở cả hai trường nghĩa là CHƯA CÓ CHỦ — không phải "thuộc mọi người".
 * Một môn chưa có chủ không hiện trong màn hình của bất kỳ Trưởng khoa nào.
 */
export interface CourseCatalogView {
  id: string;
  code: string;
  name: string;
  semesterId: string;
  departmentHeadId: string | null;
  departmentHeadName: string | null;
  /** Sinh viên đã đăng ký (qua Enrollment) — Phòng Đào tạo cần nó để biết
   *  một môn đã có người học trước khi phân công hay xoá. */
  enrollmentCount: number;
}
```

- [ ] **Step 5: Thay `findAll` + `findUnowned` bằng `findCatalog`**

`apps/api/src/course/course.service.ts` — xoá **cả hai** hàm `findAll()` và `findUnowned()`, thay bằng:

```ts
  /**
   * Danh mục môn cấp trường, cho Phòng Đào tạo.
   *
   * Thay cho hai hàm trước đó: `findAll()` (không role, không lọc, không
   * consumer nào ở web) và `findUnowned()` (chỉ lọc `IS NULL`, KHÔNG lọc học
   * kỳ — đo được 157 môn chưa chủ trải 152 kỳ dồn vào một danh sách phẳng).
   * Gộp lại thì lỗi thiếu lọc kỳ hết theo CẤU TRÚC, không phải được vá: không
   * còn hàm nào đọc bảng này mà không đi qua `semesterId`.
   *
   * Một query (LEFT JOIN + GROUP BY), không phải một COUNT mỗi môn.
   */
  async findCatalog(filter: {
    semesterId?: string;
    unowned?: boolean;
  }): Promise<CourseCatalogView[]> {
    const qb = this.courses
      .createQueryBuilder('c')
      .leftJoin('enrollment', 'e', 'e.course_id = c.id')
      .leftJoin(AccountEntity, 'head', 'head.id = c.department_head_id')
      .addSelect('COUNT(e.id)', 'enrollmentCount')
      .addSelect('head.name', 'departmentHeadName')
      .groupBy('c.id')
      .addGroupBy('head.name')
      .orderBy('c.code', 'ASC');

    if (filter.semesterId) {
      qb.andWhere('c.semester_id = :semesterId', { semesterId: filter.semesterId });
    }
    if (filter.unowned) {
      qb.andWhere('c.department_head_id IS NULL');
    }

    const { entities, raw } = await qb.getRawAndEntities<{
      enrollmentCount: string;
      departmentHeadName: string | null;
    }>();

    return entities.map((course, index) => ({
      id: course.id,
      code: course.code,
      name: course.name,
      semesterId: course.semesterId,
      departmentHeadId: course.departmentHeadId,
      departmentHeadName: raw[index].departmentHeadName ?? null,
      enrollmentCount: parseInt(raw[index].enrollmentCount, 10),
    }));
  }
```

Sửa import ở đầu file: bỏ `IsNull` khỏi `typeorm` nếu không còn dùng, bỏ `CourseView` và thêm `CourseCatalogView`.

- [ ] **Step 6: Sửa controller**

`apps/api/src/course/course.controller.ts` — thay handler `findAll` và **xoá** `findUnowned`:

```ts
  /**
   * Danh mục môn cấp trường. Chỉ Phòng Đào tạo — trước đây handler này KHÔNG
   * có @Roles nào, tức mọi user đăng nhập đọc được mọi môn toàn trường, và
   * không màn hình nào ở web dùng nó.
   *
   * KHÁC `GET /courses/mine`: cái đó là danh sách môn CỦA MỘT KHOA, dành cho
   * Trưởng khoa, scope bằng `department_head_id`. Hai endpoint độc lập, tên
   * gần giống nhau, không giao nhau — đừng gộp.
   */
  @Get()
  @Roles('academic_affairs')
  findCatalog(@Query() query: CourseCatalogQueryDto) {
    return this.courses.findCatalog({
      semesterId: query.semesterId,
      unowned: query.unowned === 'true',
    });
  }
```

Thêm import `CourseCatalogQueryDto`. Xoá khối `@Get('unowned')` cùng doc comment của nó.

- [ ] **Step 7: Chạy lại**

```bash
cd apps/api && npx tsc --noEmit
cd apps/api && npx jest --config ./test/jest-e2e.json course-catalog.e2e-spec.ts --runInBand
```

Expected: PASS.

- [ ] **Step 8: Sửa `department-resources.e2e-spec.ts` describe `unowned courses`**

Describe đó gọi `GET /courses/unowned` bằng `adminToken` — endpoint không còn tồn tại và role đã đổi. Viết lại nó để dùng `GET /courses?unowned=true` với `academicToken`, và đổi `adminToken` → `academicToken` trong lời gọi `PATCH /courses/:id/owner`. Đồng thời đổi lại token trong `course-assign-owner.e2e-spec.ts` từ `adminToken` sang `academicToken` (Task 3 Step 2 đã ghi chú), và đổi `@Roles('admin')` → `@Roles('academic_affairs')` trên `assignOwner` ở controller.

```bash
cd apps/api && npx jest --config ./test/jest-e2e.json department-resources.e2e-spec.ts course-assign-owner.e2e-spec.ts --runInBand
```

Expected: PASS.

- [ ] **Step 9: Chạy full e2e + unit**

```bash
cd apps/api && npm test
cd apps/api && npx jest --config ./test/jest-e2e.json --runInBand
```

Expected: PASS toàn bộ.

- [ ] **Step 10: Commit**

```bash
cd "/c/Users/Admin/Main/Desktop/HKI 2026-2027/KLTN/CINE"
git add apps/api/src/course apps/api/test
git commit -m "feat(api)!: GET /courses thanh danh muc cho Phong Dao tao, xoa /courses/unowned"
```

---

## Task 6: `POST /courses` nhận hai vai, chủ suy từ vai người gọi

Đây là mắt nối còn thiếu của §2.1: trước task này Phòng Đào tạo mở được học kỳ nhưng **không công bố được gì bên trong nó** — một quyển lịch rỗng.

**Files:**
- Modify: `apps/api/src/course/course.service.ts`
- Modify: `apps/api/src/course/course.controller.ts`
- Modify: `apps/api/test/course-catalog.e2e-spec.ts`

**Interfaces:**
- Consumes: `CourseCatalogView`, `findCatalog` (Task 5)
- Produces: `CourseService.createForActor(actor: { id: string; role: 'department_admin' | 'academic_affairs' }, dto: CreateCourseDto): Promise<CourseEntity>` — **thay** `createForHead`

- [ ] **Step 1: Viết test đỏ**

Thêm vào `apps/api/test/course-catalog.e2e-spec.ts`:

```ts
  describe('POST /courses — hai vai, hai nghĩa', () => {
    it('Trưởng khoa tạo môn thì chủ là chính mình', async () => {
      const res = await request(app.getHttpServer())
        .post('/courses')
        .set('Authorization', `Bearer ${headToken}`)
        .send({
          code: `HD${Date.now()}`.slice(0, 20),
          name: 'Môn của khoa',
          semesterId: semesterA,
        });

      expect(res.status).toBe(201);
      expect(res.body.departmentHeadId).toBe(headId);
    });

    it('Phòng Đào tạo tạo môn thì chủ để TRỐNG — công bố danh mục, chờ phân công', async () => {
      const res = await request(app.getHttpServer())
        .post('/courses')
        .set('Authorization', `Bearer ${academicToken}`)
        .send({
          code: `AC${Date.now()}`.slice(0, 20),
          name: 'Môn công bố',
          semesterId: semesterA,
        });

      expect(res.status).toBe(201);
      expect(res.body.departmentHeadId).toBeNull();
    });

    it('giảng viên không tạo được môn', async () => {
      const res = await request(app.getHttpServer())
        .post('/courses')
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({
          code: `TC${Date.now()}`.slice(0, 20),
          name: 'Môn giảng viên',
          semesterId: semesterA,
        });

      expect(res.status).toBe(403);
    });

    it('departmentHeadId trong body bị BỎ QUA, không được dùng để gán chủ', async () => {
      // whitelist: true strip nó, nhưng test này khẳng định INVARIANT chứ
      // không khẳng định cấu hình pipe: một Trưởng khoa không được tạo môn
      // thuộc về Trưởng khoa khác, bằng bất cứ đường nào.
      const res = await request(app.getHttpServer())
        .post('/courses')
        .set('Authorization', `Bearer ${academicToken}`)
        .send({
          code: `BD${Date.now()}`.slice(0, 20),
          name: 'Môn có body bẩn',
          semesterId: semesterA,
          departmentHeadId: headId,
        });

      expect(res.status).toBe(201);
      expect(res.body.departmentHeadId).toBeNull();
    });
  });
```

- [ ] **Step 2: Chạy để xác nhận nó đỏ**

```bash
cd apps/api && npx jest --config ./test/jest-e2e.json course-catalog.e2e-spec.ts --runInBand
```

Expected: **FAIL** — test "Phòng Đào tạo tạo môn" ra 403 (endpoint còn `@Roles('department_admin')`).

- [ ] **Step 3: Thay `createForHead` bằng `createForActor`**

`apps/api/src/course/course.service.ts` — xoá `createForHead`, thay bằng:

```ts
  /**
   * Chủ của môn mới suy từ VAI của người gọi, không bao giờ từ request body.
   * `CreateCourseDto` không có `departmentHeadId` và không được thêm: nhận nó
   * ở body thì phải chặn `department_admin` set nó (nếu không, một head tạo
   * môn thuộc về head khác) — một bài toán phân quyền theo trường body mà ta
   * không cần mở ra.
   */
  async createForActor(
    actor: { id: string; role: 'department_admin' | 'academic_affairs' },
    dto: CreateCourseDto,
  ): Promise<CourseEntity> {
    return this.courses.save(
      this.courses.create({
        code: dto.code,
        name: dto.name,
        semesterId: dto.semesterId,
        departmentHeadId: ownerOnCreate(actor.role, actor.id),
      }),
    );
  }
```

Thêm hàm module-level ở cuối file (ngoài class):

```ts
/**
 * RolesGuard đã hẹp về đúng hai vai trước khi tới đây. Viết dạng exhaustive
 * để vai thứ ba thêm vào `@Roles` sau này nổ ở compile-time, chứ không âm
 * thầm sinh ra môn không chủ.
 *
 * Tham số hẹp hơn `AccountRole` có chủ đích: hàm này KHÔNG nhận `'admin'` hay
 * `'teacher'`, nên không cần nhánh nào cho chúng, và không thể gọi sai chỗ.
 */
function ownerOnCreate(
  actorRole: 'department_admin' | 'academic_affairs',
  actorId: string,
): string | null {
  switch (actorRole) {
    case 'department_admin':
      return actorId; // head tự tạo môn của khoa mình — như cũ
    case 'academic_affairs':
      return null; // công bố danh mục, chờ phân công
    default: {
      // Không phải phòng hộ thừa: tham số hẹp là LỜI HỨA của RolesGuard, và
      // đây là chỗ lời hứa đó bị kiểm. Thêm vai thứ ba vào @Roles mà quên chỗ
      // này thì `never` không nhận được nó và tsc đỏ ngay.
      const unreachable: never = actorRole;
      throw new Error(`Vai không xử lý được khi tạo môn: ${String(unreachable)}`);
    }
  }
}
```

- [ ] **Step 4: Sửa controller**

`apps/api/src/course/course.controller.ts`:

```ts
  @Post()
  @Roles('department_admin', 'academic_affairs')
  create(@Body() dto: CreateCourseDto, @Req() req: Request) {
    return this.courses.createForActor(
      {
        id: req.user!.sub,
        // RolesGuard đã bảo đảm chỉ hai vai này tới được đây.
        role: req.user!.role as 'department_admin' | 'academic_affairs',
      },
      dto,
    );
  }
```

- [ ] **Step 5: Chạy lại**

```bash
cd apps/api && npx tsc --noEmit
cd apps/api && npx jest --config ./test/jest-e2e.json course-catalog.e2e-spec.ts department-resources.e2e-spec.ts --runInBand
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
cd "/c/Users/Admin/Main/Desktop/HKI 2026-2027/KLTN/CINE"
git add apps/api/src/course apps/api/test/course-catalog.e2e-spec.ts
git commit -m "feat(api): Phong Dao tao cong bo duoc danh muc mon voi chu de trong"
```

---

## Task 7: `PATCH`/`DELETE /courses/:id` cho Phòng Đào tạo, chỉ trên môn chưa có chủ

Phòng Đào tạo công bố môn thì phải sửa được lỗi chính tả của mình. Nhưng **một khi môn đã có chủ, nó thuộc khoa** — sai sót sau phân công là việc của khoa. Đây là ranh giới, không phải một quyền chung.

**Files:**
- Modify: `apps/api/src/course/course.service.ts`
- Modify: `apps/api/src/course/course.controller.ts`
- Modify: `apps/api/test/course-catalog.e2e-spec.ts`

**Interfaces:**
- Consumes: `createForActor`, `ownerOnCreate` (Task 6)
- Produces:
  - `CourseService.updateForActor(id: string, actor: { id: string; role: 'department_admin' | 'academic_affairs' }, dto: UpdateCourseDto): Promise<CourseEntity>`
  - `CourseService.removeForActor(id: string, actor: { id: string; role: 'department_admin' | 'academic_affairs' }): Promise<void>`
  - **Thay** `updateForHead` / `removeForHead`

- [ ] **Step 1: Viết test đỏ**

Thêm vào `apps/api/test/course-catalog.e2e-spec.ts`:

```ts
  describe('PATCH/DELETE /courses/:id — ai sửa được cái gì', () => {
    async function makeOrphan() {
      const [row] = await dataSource.query(
        `INSERT INTO examcollect.course (code, name, semester_id)
         VALUES ($1, 'Môn chờ phân công', $2) RETURNING id`,
        [`PO${Date.now()}${Math.random().toString(36).slice(2, 5)}`.slice(0, 20), semesterA],
      );
      return row.id as string;
    }

    it('Phòng Đào tạo sửa được môn CHƯA có chủ', async () => {
      const id = await makeOrphan();
      const res = await request(app.getHttpServer())
        .patch(`/courses/${id}`)
        .set('Authorization', `Bearer ${academicToken}`)
        .send({ name: 'Tên đã sửa' });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Tên đã sửa');
    });

    it('Phòng Đào tạo KHÔNG sửa được môn ĐÃ có chủ — đó là việc của khoa', async () => {
      const id = await makeOrphan();
      await request(app.getHttpServer())
        .patch(`/courses/${id}/owner`)
        .set('Authorization', `Bearer ${academicToken}`)
        .send({ departmentHeadId: headId })
        .expect(200);

      const res = await request(app.getHttpServer())
        .patch(`/courses/${id}`)
        .set('Authorization', `Bearer ${academicToken}`)
        .send({ name: 'Không được đổi' });

      expect(res.status).toBe(403);
    });

    it('Phòng Đào tạo xoá được môn chưa có chủ', async () => {
      const id = await makeOrphan();
      await request(app.getHttpServer())
        .delete(`/courses/${id}`)
        .set('Authorization', `Bearer ${academicToken}`)
        .expect(204);
    });

    it('Trưởng khoa vẫn chỉ sửa được môn của mình, và KHÔNG sửa được môn chưa có chủ', async () => {
      const orphan = await makeOrphan();
      const refused = await request(app.getHttpServer())
        .patch(`/courses/${orphan}`)
        .set('Authorization', `Bearer ${headToken}`)
        .send({ name: 'Head cướp môn' });

      // Môn chưa có chủ không thuộc head nào — nhận nó qua PATCH là một đường
      // vòng qua assignOwner, tức vòng qua kiểm vai và vòng qua audit log.
      expect(refused.status).toBe(403);
    });
  });
```

- [ ] **Step 2: Chạy để xác nhận nó đỏ**

```bash
cd apps/api && npx jest --config ./test/jest-e2e.json course-catalog.e2e-spec.ts --runInBand
```

Expected: **FAIL** — hai test đầu ra 403 (endpoint còn `@Roles('department_admin')`).

- [ ] **Step 3: Thay `updateForHead` / `removeForHead`**

`apps/api/src/course/course.service.ts` — xoá hai hàm đó và `findOwnedBy`, thay bằng:

```ts
  async updateForActor(
    id: string,
    actor: { id: string; role: 'department_admin' | 'academic_affairs' },
    dto: UpdateCourseDto,
  ): Promise<CourseEntity> {
    const course = await this.findWritableBy(id, actor);
    Object.assign(course, dto);
    return this.courses.save(course);
  }

  async removeForActor(
    id: string,
    actor: { id: string; role: 'department_admin' | 'academic_affairs' },
  ): Promise<void> {
    const course = await this.findWritableBy(id, actor);
    // Mọi FK vào course là ON DELETE RESTRICT, nên một môn còn lớp, phiên thi
    // hay đăng ký sẽ từ chối đi và PostgresExceptionFilter biến 23503 thành
    // 409 thay vì 500.
    await this.courses.remove(course);
  }

  /**
   * 404 khi không tồn tại, 403 khi không phải của người gọi — hai bước giống
   * `ExamSessionService.findByIdForOwner`, để quyền sở hữu đọc giống nhau ở
   * mọi chỗ trong codebase này.
   *
   * Hai vai có hai định nghĩa "của mình", và đó là toàn bộ ranh giới:
   *
   * - Trưởng khoa: môn có `department_head_id` bằng chính mình. Môn CHƯA có
   *   chủ KHÔNG phải của họ — nhận nó qua PATCH là một đường vòng qua
   *   `assignOwner`, tức vòng qua kiểm vai (§4.1) và vòng qua audit (§4.2).
   * - Phòng Đào tạo: môn chưa có chủ, tức thứ chính họ vừa công bố. Một khi
   *   môn đã có chủ, nó thuộc khoa — sai sót sau phân công là việc của khoa.
   */
  private async findWritableBy(
    id: string,
    actor: { id: string; role: 'department_admin' | 'academic_affairs' },
  ): Promise<CourseEntity> {
    const course = await this.courses.findOne({ where: { id } });
    if (!course) {
      throw new NotFoundException('Course not found');
    }

    const writable =
      actor.role === 'department_admin'
        ? course.departmentHeadId === actor.id
        : course.departmentHeadId === null;

    if (!writable) {
      throw new ForbiddenException(
        actor.role === 'department_admin'
          ? 'You do not own this course'
          : 'Môn này đã có chủ — chỉ Trưởng khoa phụ trách sửa được',
      );
    }
    return course;
  }
```

- [ ] **Step 4: Sửa controller**

`apps/api/src/course/course.controller.ts`:

```ts
  @Patch(':id')
  @Roles('department_admin', 'academic_affairs')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCourseDto,
    @Req() req: Request,
  ) {
    return this.courses.updateForActor(
      id,
      {
        id: req.user!.sub,
        role: req.user!.role as 'department_admin' | 'academic_affairs',
      },
      dto,
    );
  }

  @Delete(':id')
  @Roles('department_admin', 'academic_affairs')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    return this.courses.removeForActor(id, {
      id: req.user!.sub,
      role: req.user!.role as 'department_admin' | 'academic_affairs',
    });
  }
```

- [ ] **Step 5: Chạy lại + full e2e**

```bash
cd apps/api && npx tsc --noEmit && npm run lint
cd apps/api && npm test
cd apps/api && npx jest --config ./test/jest-e2e.json --runInBand
```

Expected: PASS toàn bộ. `department-resources.e2e-spec.ts` có test head sửa/xoá môn của mình — chúng phải vẫn xanh; nếu đỏ, đọc kỹ `findWritableBy`.

- [ ] **Step 6: Commit**

```bash
cd "/c/Users/Admin/Main/Desktop/HKI 2026-2027/KLTN/CINE"
git add apps/api/src/course apps/api/test/course-catalog.e2e-spec.ts
git commit -m "feat(api): Phong Dao tao sua duoc mon chua co chu, da co chu thi thuoc khoa"
```

---

## Task 8: `AccountsService.remove` trả 409 tách phụ thuộc giải được / vĩnh viễn

**10 bảng** trỏ vào `account`, tất cả `ON DELETE RESTRICT`, trong đó `audit_log.actor_id`. Và `audit_log` mang trigger `trg_audit_log_immutable` (`BEFORE UPDATE OR DELETE` → `prevent_append_only_mutation`), nên **các dòng chặn không thể xoá được để giải chặn**. Hệ quả:

> Một tài khoản đã từng thực hiện dù chỉ một thao tác được audit thì **không bao giờ xoá được nữa**.

Đó **không phải lỗi cần sửa** — audit log bất biến là yêu cầu bảo mật của dự án. Cái sai là UI đang hứa một thao tác hệ thống không thực hiện được, và trả về một 409 không nói được vì sao. Chỉ trả một con số tổng sẽ hàm ý *"gỡ hết rồi thử lại"* — lời khuyên không bao giờ chạy được, tức đúng loại thất bại âm thầm mà việc đếm sinh ra để diệt.

**Files:**
- Modify: `apps/api/src/accounts/accounts.service.ts`
- Create: `apps/api/test/account-delete-dependencies.e2e-spec.ts`

**Interfaces:**
- Consumes: `createTestAccount` (Task 2)
- Produces: `remove(id)` ném `ConflictException` với body `{ message, resolvable: { courses, classes, examSessions, rubrics }, permanent: { auditLogEntries } }`

- [ ] **Step 1: Viết test đỏ**

Tạo `apps/api/test/account-delete-dependencies.e2e-spec.ts`. Dùng cùng khuôn `beforeAll` như Task 3 (tạo app, `dataSource`, `makeAccount`), rồi:

```ts
  it('xoá một tài khoản chưa làm gì thì được', async () => {
    const spare = await makeAccount('del_spare', 'teacher');
    await request(app.getHttpServer())
      .delete(`/accounts/${spare.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(204);
  });

  it('xoá một head còn môn thì 409, và nói rõ MÔN là thứ giải được', async () => {
    const head = await makeAccount('del_head', 'department_admin');
    await dataSource.query(
      `INSERT INTO examcollect.course (code, name, semester_id, department_head_id)
       VALUES ($1, 'Môn chặn xoá', $2, $3)`,
      [`DL${Date.now()}`.slice(0, 20), semesterId, head.id],
    );

    const res = await request(app.getHttpServer())
      .delete(`/accounts/${head.id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(409);
    expect(res.body.resolvable.courses).toBe(1);
    expect(res.body.permanent.auditLogEntries).toBe(0);
  });

  it('một tài khoản đã có dòng audit thì VĨNH VIỄN không xoá được, và 409 phải nói thế', async () => {
    // Phân công một môn là thao tác được audit (Task 3), nên chính nó biến
    // tài khoản Phòng Đào tạo này thành không xoá được. Đó là hệ quả có chủ
    // đích của audit bất biến, không phải bug — nhưng thông báo PHẢI phân biệt
    // nó với thứ gỡ được, vì "gỡ hết rồi thử lại" ở đây là lời khuyên không
    // bao giờ chạy được.
    const actor = await makeAccount('del_actor', 'academic_affairs');
    const head = await makeAccount('del_target_head', 'department_admin');
    const [orphan] = await dataSource.query(
      `INSERT INTO examcollect.course (code, name, semester_id)
       VALUES ($1, 'Môn để phân công', $2) RETURNING id`,
      [`DA${Date.now()}`.slice(0, 20), semesterId],
    );
    await request(app.getHttpServer())
      .patch(`/courses/${orphan.id}/owner`)
      .set('Authorization', `Bearer ${actor.token}`)
      .send({ departmentHeadId: head.id })
      .expect(200);

    const res = await request(app.getHttpServer())
      .delete(`/accounts/${actor.id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(409);
    expect(res.body.permanent.auditLogEntries).toBeGreaterThan(0);
    expect(res.body.message).toMatch(/vô hiệu hoá|không xoá được/i);
  });
```

- [ ] **Step 2: Chạy để xác nhận nó đỏ**

```bash
cd apps/api && npx jest --config ./test/jest-e2e.json account-delete-dependencies.e2e-spec.ts --runInBand
```

Expected: **FAIL** — hiện `remove` chỉ để DB ném 23503 và filter biến thành 409 với message chung, không có `resolvable`/`permanent`.

- [ ] **Step 3: Đếm phụ thuộc trước khi xoá**

`apps/api/src/accounts/accounts.service.ts` — thay `remove`:

```ts
  /**
   * Xoá tài khoản gần như KHÔNG phải một thao tác có thật, và đây là chỗ nói ra.
   *
   * 10 bảng trỏ vào `account`, tất cả ON DELETE RESTRICT. Một trong đó là
   * `audit_log.actor_id`, và `audit_log` mang trigger `trg_audit_log_immutable`
   * (BEFORE UPDATE OR DELETE) — nên các dòng chặn KHÔNG THỂ xoá được để giải
   * chặn. Hệ quả: một tài khoản đã từng làm dù chỉ một thao tác được audit thì
   * vĩnh viễn không xoá được.
   *
   * Đó không phải lỗi cần sửa — audit bất biến là yêu cầu bảo mật, và một tài
   * khoản không dấu vết thì audit log mất nghĩa. Cái sai là trả về một 409
   * không nói được vì sao. Chỉ đếm tổng cũng chưa đủ: nó hàm ý "gỡ hết rồi thử
   * lại", một lời khuyên không bao giờ chạy được, tức đúng loại thất bại âm
   * thầm mà việc đếm sinh ra để diệt. Nên tách hai loại.
   *
   * Thứ hệ thống THẬT SỰ cần cho nhân sự nghỉ việc là vô hiệu hoá tài khoản —
   * `account` chưa có cột nào cho việc đó. Feature còn thiếu, không phải bug ở
   * đây; message dưới đây nói thẳng điều đó cho người đang bấm nút.
   */
  async remove(id: string): Promise<void> {
    await this.findOrThrow(id);

    const [counts] = await this.accounts.query(
      `SELECT
         (SELECT count(*) FROM examcollect.course        WHERE department_head_id = $1) AS courses,
         (SELECT count(*) FROM examcollect.class         WHERE teacher_id         = $1) AS classes,
         (SELECT count(*) FROM examcollect.exam_session  WHERE teacher_id         = $1) AS exam_sessions,
         (SELECT count(*) FROM examcollect.rubric_template WHERE created_by       = $1) AS rubrics,
         (SELECT count(*) FROM examcollect.audit_log     WHERE actor_id           = $1) AS audit_entries`,
      [id],
    );

    const resolvable = {
      courses: Number(counts.courses),
      classes: Number(counts.classes),
      examSessions: Number(counts.exam_sessions),
      rubrics: Number(counts.rubrics),
    };
    const auditLogEntries = Number(counts.audit_entries);
    const resolvableTotal = Object.values(resolvable).reduce((a, b) => a + b, 0);

    if (auditLogEntries > 0) {
      throw new ConflictException({
        message:
          'Tài khoản này đã có lịch sử trong audit log nên không xoá được — audit log là bất biến. ' +
          'Hệ thống chưa có chức năng vô hiệu hoá tài khoản; hãy đổi mật khẩu để chặn đăng nhập.',
        resolvable,
        permanent: { auditLogEntries },
      });
    }

    if (resolvableTotal > 0) {
      throw new ConflictException({
        message:
          'Tài khoản này còn dữ liệu học vụ phụ thuộc. Hãy phân công lại hoặc chuyển giao trước khi xoá.',
        resolvable,
        permanent: { auditLogEntries },
      });
    }

    // Hard delete. Kể cả sau hai lần kiểm trên, FK RESTRICT vẫn là chốt cuối —
    // đếm rồi xoá không phải một thao tác nguyên tử, và 23503 → 409 qua
    // PostgresExceptionFilter là hành vi đúng cho ca đua đó.
    await this.accounts.delete(id);
  }
```

Thêm `ConflictException` vào import từ `@nestjs/common`.

- [ ] **Step 4: Chạy lại**

```bash
cd apps/api && npx tsc --noEmit
cd apps/api && npx jest --config ./test/jest-e2e.json account-delete-dependencies.e2e-spec.ts accounts.e2e-spec.ts --runInBand
```

Expected: PASS.

- [ ] **Step 5: Chạy full**

```bash
cd apps/api && npm test && npm run lint
cd apps/api && npx jest --config ./test/jest-e2e.json --runInBand
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
cd "/c/Users/Admin/Main/Desktop/HKI 2026-2027/KLTN/CINE"
git add apps/api/src/accounts/accounts.service.ts apps/api/test/account-delete-dependencies.e2e-spec.ts
git commit -m "fix(api): 409 khi xoa tai khoan phai tach phu thuoc giai duoc khoi vinh vien"
```

---

## Task 9: Web — client + hook cho danh mục môn

**Files:**
- Modify: `apps/web/src/lib/api/department.ts`
- Modify: `apps/web/src/hooks/useDepartment.ts`
- Regenerate: `packages/shared/src/api/schema.d.ts`

**Interfaces:**
- Consumes: `GET /courses?semesterId=&unowned=true` (Task 5), `POST/PATCH/DELETE /courses` (Task 6, 7)
- Produces:
  - `CourseCatalogEntry { id, code, name, semesterId, departmentHeadId: string | null, departmentHeadName: string | null, enrollmentCount: number }`
  - `listCourseCatalog(params: { semesterId?: string; unowned?: boolean }): Promise<CourseCatalogEntry[]>`
  - `useCourseCatalog(params)` — query key `['courses', 'catalog', semesterId ?? null, unowned]`
  - **Xoá:** `listUnownedCourses`, `useUnownedCourses`

- [ ] **Step 1: Sinh lại API client**

Khởi API rồi sinh client. `node`'s `fetch` trong script này không đáng tin — dùng đường vòng qua curl:

```bash
cd apps/api && npm run dev   # để chạy ở terminal khác
curl -s http://localhost:4000/api-docs-json -o /tmp/openapi.json
cd packages/shared && API_URL="file:///tmp/openapi.json" npm run generate:api-client
```

- [ ] **Step 2: Xác minh schema thật sự đổi**

Script in `Wrote ...` **kể cả khi nội dung không đổi**, nên đừng tin dòng log:

```bash
cd "/c/Users/Admin/Main/Desktop/HKI 2026-2027/KLTN/CINE"
grep -c "departmentHeadName" packages/shared/src/api/schema.d.ts
grep -c "courses/unowned" packages/shared/src/api/schema.d.ts
```

Expected: dòng đầu **≥ 1**, dòng sau **0**. Nếu không đúng, codegen chưa chạy trên schema mới — không đi tiếp.

- [ ] **Step 3: Viết test đỏ cho hook**

Tạo `apps/web/src/hooks/useDepartment.catalog.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { listCourseCatalog } from '@/lib/api/department';

const get = vi.fn();
vi.mock('@/lib/api/client', () => ({ apiClient: { GET: (...a: unknown[]) => get(...a) } }));

describe('listCourseCatalog', () => {
  beforeEach(() => get.mockReset());

  it('không gửi tham số nào khi không lọc gì', async () => {
    get.mockResolvedValue({ data: [], error: undefined, response: { ok: true } });
    await listCourseCatalog({});
    expect(get).toHaveBeenCalledWith('/courses', { params: { query: {} } });
  });

  it('gửi unowned dưới dạng chuỗi "true", không phải boolean', async () => {
    // API dùng @IsIn(['true']) vì ValidationPipe không bật
    // enableImplicitConversion — gửi boolean true sẽ serialize thành "true"
    // ở đây, nhưng gửi false PHẢI bị bỏ hẳn chứ không thành "false" (400).
    get.mockResolvedValue({ data: [], error: undefined, response: { ok: true } });
    await listCourseCatalog({ semesterId: 'abc', unowned: true });
    expect(get).toHaveBeenCalledWith('/courses', {
      params: { query: { semesterId: 'abc', unowned: 'true' } },
    });
  });

  it('unowned: false thì KHÔNG gửi tham số — gửi "false" sẽ ra 400', async () => {
    get.mockResolvedValue({ data: [], error: undefined, response: { ok: true } });
    await listCourseCatalog({ unowned: false });
    expect(get).toHaveBeenCalledWith('/courses', { params: { query: {} } });
  });
});
```

- [ ] **Step 4: Chạy để xác nhận nó đỏ**

```bash
cd apps/web && npx vitest run src/hooks/useDepartment.catalog.test.ts
```

Expected: **FAIL** — `listCourseCatalog` chưa tồn tại.

- [ ] **Step 5: Thêm client function, xoá cái cũ**

`apps/web/src/lib/api/department.ts` — thêm type và hàm, **xoá** `listUnownedCourses`:

```ts
/** Một môn như Phòng Đào tạo thấy trong danh mục cấp trường. */
export interface CourseCatalogEntry {
  id: string;
  code: string;
  name: string;
  semesterId: string;
  departmentHeadId: string | null;
  departmentHeadName: string | null;
  enrollmentCount: number;
}

/**
 * Danh mục môn cấp trường. KHÁC `listMyCourses()` (`/courses/mine`), là danh
 * sách môn của MỘT khoa dành cho Trưởng khoa — hai endpoint độc lập, tên gần
 * giống nhau, đừng gộp.
 *
 * `unowned` gửi đi dưới dạng chuỗi `'true'`, và `false` thì BỎ HẲN tham số:
 * API dùng `@IsIn(['true'])` nên `?unowned=false` sẽ ra 400. Đó là cố ý ở phía
 * API — `"false"` là truthy, nên nhận nó là mở một cái bẫy im lặng.
 */
export async function listCourseCatalog(params: {
  semesterId?: string;
  unowned?: boolean;
}): Promise<CourseCatalogEntry[]> {
  const { data, error, response } = await apiClient.GET('/courses', {
    params: {
      query: {
        ...(params.semesterId ? { semesterId: params.semesterId } : {}),
        ...(params.unowned ? { unowned: 'true' as const } : {}),
      },
    },
  });
  await throwIfFailed(error, response);
  return data as unknown as CourseCatalogEntry[];
}
```

`apps/web/src/hooks/useDepartment.ts` — thêm key, thêm hook, **xoá** `useUnownedCourses`:

```ts
export const DEPARTMENT_KEYS = {
  semesters: ['semesters'] as const,
  rooms: ['rooms'] as const,
  courses: ['courses', 'mine'] as const,
  classes: ['classes', 'mine'] as const,
  // Danh mục cấp trường — KHÔNG dùng chung key với `courses` (`/courses/mine`),
  // vì hai endpoint trả hai tập dữ liệu khác nhau cho hai role khác nhau.
  catalog: ['courses', 'catalog'] as const,
};
```

```ts
export function useCourseCatalog(params: { semesterId?: string | null; unowned?: boolean }) {
  return useQuery({
    queryKey: [...DEPARTMENT_KEYS.catalog, params.semesterId ?? null, params.unowned ?? false],
    queryFn: () =>
      listCourseCatalog({
        semesterId: params.semesterId ?? undefined,
        unowned: params.unowned,
      }),
  });
}
```

`useAssignCourseOwner` phải invalidate `catalog` thay vì `unowned`:

```ts
export function useAssignCourseOwner() {
  return useInvalidating(
    DEPARTMENT_KEYS.catalog,
    (args: { id: string; departmentHeadId: string }) =>
      assignCourseOwner(args.id, args.departmentHeadId),
  );
}
```

Và thêm ba mutation cho danh mục (Phòng Đào tạo tạo/sửa/xoá môn), dùng lại `createCourse`/`updateCourse`/`deleteCourse` đã có nhưng invalidate `catalog`:

```ts
export function useCreateCatalogCourse() {
  return useInvalidating(DEPARTMENT_KEYS.catalog, createCourse);
}

export function useUpdateCatalogCourse() {
  return useInvalidating(
    DEPARTMENT_KEYS.catalog,
    (args: { id: string; body: Parameters<typeof updateCourse>[1] }) =>
      updateCourse(args.id, args.body),
  );
}

export function useDeleteCatalogCourse() {
  return useInvalidating(DEPARTMENT_KEYS.catalog, deleteCourse);
}
```

Xoá `unowned` khỏi `DEPARTMENT_KEYS`.

- [ ] **Step 6: Chạy lại**

```bash
cd apps/web && npx vitest run src/hooks/useDepartment.catalog.test.ts && npx tsc --noEmit
```

Expected: test PASS. `tsc` sẽ **đỏ** ở `app/admin/unowned-courses/page.tsx` vì `useUnownedCourses` đã bị xoá — đúng như dự kiến; Task 10 xoá trang đó. Ghi lại lỗi và đi tiếp.

- [ ] **Step 7: Commit**

```bash
cd "/c/Users/Admin/Main/Desktop/HKI 2026-2027/KLTN/CINE"
git add packages/shared/src/api/schema.d.ts apps/web/src/lib/api/department.ts apps/web/src/hooks/useDepartment.ts apps/web/src/hooks/useDepartment.catalog.test.ts
git commit -m "feat(web): client va hook cho danh muc mon cap truong"
```

---

## Task 10: Web — quy tắc sở hữu vào nav, dời trang, dựng `/academic/courses`

Task này để `tsc` xanh lại và là chỗ quy tắc §2 được viết vào code.

**Files:**
- Modify: `apps/web/src/lib/nav-config.ts`
- Create: `apps/web/src/app/academic/rooms/page.tsx` (dời từ `department/rooms/page.tsx`)
- Create: `apps/web/src/app/academic/courses/page.tsx`
- Create: `apps/web/src/app/academic/courses/page.test.tsx`
- Delete: `apps/web/src/app/department/rooms/` (cả test nếu có)
- Delete: `apps/web/src/app/admin/unowned-courses/` (cả test nếu có)

**Interfaces:**
- Consumes: `useCourseCatalog`, `useCreateCatalogCourse`, `useUpdateCatalogCourse`, `useDeleteCatalogCourse`, `useAssignCourseOwner` (Task 9); `useSemesterFilter`, `SemesterFilter` (đã có từ spec Học kỳ); `ResourceShell`, `ResourceFormDialog`, `ConfirmDeleteDialog` từ `@/components/resource/`
- Produces: không có export mới nào cho task sau

- [ ] **Step 1: Viết quy tắc + đổi ba mảng nav**

`apps/web/src/lib/nav-config.ts` — thêm block comment ngay trên `ADMIN_NAV`:

```ts
/**
 * QUY TẮC SỞ HỮU — chiếu vào đây trước khi thêm bất kỳ màn hình nào.
 *
 *   Tài nguyên CẤP TRƯỜNG  → Phòng Đào tạo (`/academic`)
 *   Tài nguyên CỦA KHOA    → Trưởng khoa   (`/department`)
 *   Tài khoản & hệ thống   → Admin         (`/admin`)
 *
 * Quy tắc này trước đây chưa từng được viết ra, nên mỗi màn hình được đặt
 * theo cảm tính của lúc dựng nó — và ba thứ đã nằm sai chỗ: Học kỳ và Phòng
 * thi ở Trưởng khoa, "Môn chưa có chủ" ở Admin. Cả ba là tài nguyên cấp
 * trường: dùng chung, tên unique toàn cục, không khoa nào sở hữu.
 *
 * Phép thử khi không chắc: nếu hai khoa cùng phải dùng một bản ghi và không
 * khoa nào được sửa nó của khoa kia, thì nó thuộc Phòng Đào tạo.
 */
```

`ADMIN_NAV` — xoá mục `Môn chưa có chủ` và comment của nó.

`ACADEMIC_NAV` — thay bằng:

```ts
// Phòng Đào tạo giữ ba thứ cấp trường: lịch kỳ, danh mục môn, và phòng máy.
// Trước đây đây là một tier MỘT trang — mỏng đến mức nhìn như một mảnh vụn
// cắt ra từ Trưởng khoa, và đó chính là điều làm người dùng hỏi "role Trưởng
// khoa có bị thừa không". Cả hai role đều cần thiết; ranh giới mới là chỗ sửa.
export const ACADEMIC_NAV: NavItem[] = [
  { label: 'Học kỳ', href: '/academic/semesters', icon: CalendarRange },
  { label: 'Môn học', href: '/academic/courses', icon: BookOpen },
  { label: 'Phòng thi', href: '/academic/rooms', icon: DoorOpen },
];
```

`DEPARTMENT_NAV` — xoá mục `Phòng thi`, sửa comment:

```ts
// Trưởng khoa sở hữu cấu trúc học vụ mà một phiên thi được dựng lên từ đó.
// Học kỳ và Phòng thi KHÔNG còn ở đây — cả hai là tài nguyên cấp trường,
// thuộc Phòng Đào tạo (`/academic`). Trưởng khoa vẫn ĐỌC được cả hai danh
// sách (bộ lọc và form tạo phiên thi cần), chỉ không sửa.
export const DEPARTMENT_NAV: NavItem[] = [
  { label: 'Dashboard', href: '/department/dashboard', icon: LayoutDashboard },
  { label: 'Môn học', href: '/department/courses', icon: BookOpen },
  { label: 'Lớp học', href: '/department/classes', icon: GraduationCap },
  // Read-only — ai đang dạy trong khoa này. Bản thân TÀI KHOẢN vẫn là việc
  // của admin (/admin/accounts).
  { label: 'Giảng viên', href: '/department/teachers', icon: Users },
];
```

- [ ] **Step 2: Dời trang phòng thi**

```bash
cd "/c/Users/Admin/Main/Desktop/HKI 2026-2027/KLTN/CINE"
mkdir -p apps/web/src/app/academic/rooms
git mv apps/web/src/app/department/rooms/page.tsx apps/web/src/app/academic/rooms/page.tsx
ls apps/web/src/app/department/rooms/ 2>/dev/null   # còn file nào thì git mv tiếp
```

Sửa `description` trong trang vừa dời để nói đúng ai sửa được:

```tsx
      description="Phòng máy dùng chung toàn trường — nhiều khoa xếp lịch thi vào cùng một phòng ở các ca khác nhau, nên phòng không thuộc về khoa nào. Chỉ Phòng Đào tạo sửa được; tên phòng không được trùng."
```

- [ ] **Step 3: Viết test đỏ cho trang danh mục**

Tạo `apps/web/src/app/academic/courses/page.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import CatalogPage from './page';

vi.mock('@/hooks/useDepartment', () => ({
  useCourseCatalog: () => ({
    data: [
      {
        id: 'c1',
        code: 'CS101',
        name: 'Nhập môn',
        semesterId: 's1',
        departmentHeadId: null,
        departmentHeadName: null,
        enrollmentCount: 0,
      },
      {
        id: 'c2',
        code: 'CS201',
        name: 'Cấu trúc dữ liệu',
        semesterId: 's1',
        departmentHeadId: 'h1',
        departmentHeadName: 'Trần Văn A',
        enrollmentCount: 42,
      },
    ],
    isLoading: false,
    isError: false,
    error: null,
  }),
  useCreateCatalogCourse: () => ({ mutateAsync: vi.fn(), isPending: false, error: null }),
  useUpdateCatalogCourse: () => ({ mutateAsync: vi.fn(), isPending: false, error: null }),
  useDeleteCatalogCourse: () => ({ mutateAsync: vi.fn(), isPending: false, error: null }),
  useAssignCourseOwner: () => ({ mutate: vi.fn(), isPending: false, error: null }),
  useSemesters: () => ({ data: [], isLoading: false }),
}));

vi.mock('@/hooks/useAccounts', () => ({
  useAccounts: () => ({ data: { items: [{ id: 'h1', name: 'Trần Văn A' }] }, isLoading: false }),
}));

vi.mock('@/hooks/useSemesterFilter', () => ({
  useSemesterFilter: () => ({
    semesterId: 's1',
    setSemesterId: vi.fn(),
    semesters: [],
    current: null,
    isLoading: false,
    isStale: false,
    staleDays: 0,
  }),
}));

describe('trang danh mục môn của Phòng Đào tạo', () => {
  it('nói rõ môn nào chưa có chủ, và tên chủ khi đã có', () => {
    render(<CatalogPage />);
    // "Chưa có chủ" là một TRẠNG THÁI cần đọc ra được, không phải một ô trống:
    // một môn chưa có chủ không hiện trong màn hình của bất kỳ Trưởng khoa nào.
    expect(screen.getByText('Chưa có chủ')).toBeInTheDocument();
    expect(screen.getByText('Trần Văn A')).toBeInTheDocument();
  });

  it('có công tắc lọc riêng môn chưa có chủ', () => {
    render(<CatalogPage />);
    expect(screen.getByLabelText(/chỉ môn chưa có chủ/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 4: Chạy để xác nhận nó đỏ**

```bash
cd apps/web && npx vitest run src/app/academic/courses/page.test.tsx
```

Expected: **FAIL** — trang chưa tồn tại.

- [ ] **Step 5: Dựng trang danh mục**

Tạo `apps/web/src/app/academic/courses/page.tsx`. Dùng `ResourceShell` như `/academic/semesters` và `/academic/rooms`, cộng `SemesterFilter` ở `actions` của header (khuôn `/teacher/submissions`), một `Checkbox` lọc `unowned`, và một cột `Chủ` chứa `Select` + nút `Gán` cho dòng chưa có chủ (khuôn trang `admin/unowned-courses` đang bị xoá — đọc nó trong git history nếu cần chi tiết JSX).

Điểm bắt buộc:

```tsx
  const semesterFilter = useSemesterFilter('academic-courses');
  const [onlyUnowned, setOnlyUnowned] = useState(false);
  const catalog = useCourseCatalog({
    semesterId: semesterFilter.semesterId,
    unowned: onlyUnowned,
  });
  const heads = useAccounts({ page: 1, pageSize: 100, role: 'department_admin' });
  const assign = useAssignCourseOwner();
```

Cột `Chủ`:

```tsx
        {
          label: 'Chủ',
          render: (c) =>
            c.departmentHeadId === null ? (
              // "Chưa có chủ" phải đọc ra được như một trạng thái, không phải
              // một ô trống: môn chưa có chủ không hiện trong màn hình của bất
              // kỳ Trưởng khoa nào, nên nó là việc cần làm, không phải thiếu dữ liệu.
              <span className="text-muted-foreground">Chưa có chủ</span>
            ) : (
              <span>{c.departmentHeadName}</span>
            ),
        },
```

Công tắc lọc, `id` phải khớp `getByLabelText` ở test:

```tsx
        <div className="flex items-center gap-2">
          <Checkbox
            id="only-unowned"
            checked={onlyUnowned}
            onCheckedChange={(v) => setOnlyUnowned(v === true)}
          />
          <Label htmlFor="only-unowned">Chỉ môn chưa có chủ</Label>
        </div>
```

Sửa/xoá **chỉ bật trên dòng chưa có chủ** — `ResourceShell` gọi `onEdit`/`onDelete` cho mọi dòng, nên chặn trong handler và nói rõ vì sao:

```tsx
  // Môn đã có chủ thuộc khoa: API trả 403 (findWritableBy), nên đừng mở dialog
  // rồi để người dùng ăn lỗi sau khi bấm Lưu.
  function openEdit(course: CourseCatalogEntry) {
    if (course.departmentHeadId !== null) return;
    ...
  }
```

- [ ] **Step 6: Xoá trang `unowned-courses`**

```bash
cd "/c/Users/Admin/Main/Desktop/HKI 2026-2027/KLTN/CINE"
git rm -r apps/web/src/app/admin/unowned-courses
```

- [ ] **Step 7: Chạy lại toàn bộ web**

```bash
cd apps/web && npx vitest run && npx tsc --noEmit && npm run lint && npm run build
```

Expected: PASS cả bốn. **`npm run build` là bước không được bỏ** — spec Học kỳ đã có một lần test xanh mà `next build` đỏ vì `useSearchParams` cần `Suspense`; chỉ build bắt được lớp lỗi đó. Nếu trang mới đọc `useSearchParams`, bọc `Suspense` như `/teacher/submissions` đã làm.

- [ ] **Step 8: Commit**

```bash
cd "/c/Users/Admin/Main/Desktop/HKI 2026-2027/KLTN/CINE"
git add apps/web/src
git commit -m "feat(web): quy tac so huu vao nav, danh muc mon va phong thi ve Phong Dao tao"
```

---

## Task 11: Web — sửa mảnh vụn ở dashboard Trưởng khoa

`department/dashboard/page.tsx` trỏ `/department/semesters` — **một route không còn tồn tại** (404) — kèm chỉ dẫn *"Tạo học kỳ ngay"* mà API trả 403. Và thẻ `Phòng thi` giờ cũng là read-only như thẻ `Học kỳ`.

**Files:**
- Modify: `apps/web/src/app/department/dashboard/page.tsx`
- Create: `apps/web/src/app/department/dashboard/page.test.tsx`

**Interfaces:**
- Consumes: `useSemesters`, `useMyCourses`, `useMyClasses`, `useRooms` (không đổi)
- Produces: không có

- [ ] **Step 1: Viết test đỏ**

Tạo `apps/web/src/app/department/dashboard/page.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import DashboardPage from './page';

function mockCounts(counts: { semesters: number; courses: number; classes: number }) {
  vi.doMock('@/hooks/useDepartment', () => ({
    useSemesters: () => ({ data: new Array(counts.semesters).fill({}), isError: false }),
    useMyCourses: () => ({ data: new Array(counts.courses).fill({}), isError: false }),
    useMyClasses: () => ({ data: new Array(counts.classes).fill({}), isError: false }),
    useRooms: () => ({ data: [], isError: false }),
  }));
}

describe('dashboard Trưởng khoa', () => {
  it('khi chưa có học kỳ: KHÔNG có link, và nói đó là việc của Phòng Đào tạo', async () => {
    vi.resetModules();
    mockCounts({ semesters: 0, courses: 0, classes: 0 });
    const { default: Page } = await import('./page');
    render(<Page />);

    // /department/semesters đã bị xoá ở spec Học kỳ. Link tới nó là 404, và
    // "Tạo học kỳ ngay" là chỉ dẫn mà API trả 403 — Trưởng khoa không tạo
    // được học kỳ nữa.
    expect(screen.queryByRole('link', { name: /tạo học kỳ/i })).not.toBeInTheDocument();
    expect(document.body.textContent).toMatch(/Phòng Đào tạo/);
  });

  it('khi có học kỳ nhưng chưa có môn: vẫn có link tự tạo môn', async () => {
    vi.resetModules();
    mockCounts({ semesters: 1, courses: 0, classes: 0 });
    const { default: Page } = await import('./page');
    render(<Page />);

    // Trưởng khoa VẪN tự tạo được môn của khoa mình — Phòng Đào tạo chỉ thêm
    // một đường thứ hai để môn tới tay họ, không thay thế đường cũ.
    expect(screen.getByRole('link', { name: /môn học/i })).toHaveAttribute(
      'href',
      '/department/courses',
    );
  });
});
```

- [ ] **Step 2: Chạy để xác nhận nó đỏ**

```bash
cd apps/web && npx vitest run src/app/department/dashboard/page.test.tsx
```

Expected: **FAIL** — test 1 đỏ vì link "Tạo học kỳ ngay" vẫn tồn tại.

- [ ] **Step 3: Sửa `missingLink`**

`apps/web/src/app/department/dashboard/page.tsx` — thay khối `missingLink` bằng một shape có `href` **nullable**:

```tsx
  /**
   * Mắt nối còn thiếu trong chuỗi: kỳ → môn → lớp → phiên thi. Nhưng chủ thể
   * của hai mắt đầu đã đổi ở spec ranh-giới-sở-hữu, nên câu chữ phải đổi theo.
   *
   * `href: null` cho nhánh học kỳ là điều quan trọng nhất ở đây: trước đây nó
   * trỏ `/department/semesters`, một route đã bị xoá (404), kèm chỉ dẫn "Tạo
   * học kỳ ngay" mà API trả 403. Một cái nút không làm được việc nó nói còn
   * tệ hơn không có nút.
   */
  const missingLink: { text: string; href: string | null; cta?: string } | null =
    (semesters.data?.length ?? 0) === 0
      ? {
          text: 'Phòng Đào tạo chưa tạo học kỳ nào — chưa tạo được môn học.',
          href: null,
        }
      : (courses.data?.length ?? 0) === 0
        ? {
            text: 'Chưa có môn học nào — chưa tạo được lớp học. Bạn có thể tự tạo, hoặc chờ Phòng Đào tạo phân công.',
            href: '/department/courses',
            cta: 'Tạo môn học ngay',
          }
        : (classes.data?.length ?? 0) === 0
          ? {
              text: 'Chưa có lớp học nào — chưa tạo được phiên thi.',
              href: '/department/classes',
              cta: 'Tạo lớp học ngay',
            }
          : null;
```

Và phần render:

```tsx
      {missingLink && (
        <Alert variant="info">
          <AlertDescription>
            {missingLink.text}
            {missingLink.href && (
              <>
                {' '}
                <Link href={missingLink.href} className="font-semibold underline">
                  {missingLink.cta}
                </Link>
              </>
            )}
          </AlertDescription>
        </Alert>
      )}
```

Sửa hint thẻ `Phòng thi` để nói đúng ai sửa được:

```tsx
          hint="Dùng chung toàn trường — Phòng Đào tạo quản lý"
```

Và `description` của `PageHeader`:

```tsx
        description="Tài nguyên học vụ của khoa bạn. Học kỳ và phòng thi do Phòng Đào tạo quản lý; môn học và lớp học thuộc riêng khoa bạn."
```

- [ ] **Step 4: Chạy lại**

```bash
cd apps/web && npx vitest run src/app/department/dashboard/page.test.tsx && npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd "/c/Users/Admin/Main/Desktop/HKI 2026-2027/KLTN/CINE"
git add apps/web/src/app/department/dashboard
git commit -m "fix(web): dashboard Truong khoa het tro toi route da xoa va het ra lenh 403"
```

---

## Task 12: Web — role lạ phải trông lạ

`getRoleDisplay` trả `{ label: role, variant: 'default' }` cho role không có trong map — in ra **chuỗi enum thô, badge xám**, trông y như một vai trò hợp lệ. Đây là cơ chế khiến người dùng đọc màn hình và kết luận hệ thống có **hai** role riêng biệt "Phòng Đào tạo" và `super_admin`: một tab giữ bundle cũ, hoặc một JWT phát trước migration rename, là đủ.

Doc comment hiện tại đã có ý đúng (*"say something true-but-ugly instead of silently mislabelling"*) — vấn đề là nó chưa **đủ** xấu để đọc ra là bất thường.

**Files:**
- Modify: `apps/web/src/lib/account-roles.ts`
- Modify: `apps/web/src/lib/account-roles.test.ts` (tạo nếu chưa có)

**Interfaces:**
- Consumes: không
- Produces: `getRoleDisplay(role)` cho role lạ trả `{ label: 'Vai trò không xác định (<role>)', variant: 'destructive' }`

- [ ] **Step 1: Viết test đỏ**

Thêm vào `apps/web/src/lib/account-roles.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { getRoleDisplay } from './account-roles';

describe('getRoleDisplay', () => {
  it('bốn role hợp lệ có nhãn tiếng Việt', () => {
    expect(getRoleDisplay('academic_affairs').label).toBe('Phòng Đào tạo');
    expect(getRoleDisplay('department_admin').label).toBe('Trưởng khoa');
    expect(getRoleDisplay('teacher').label).toBe('Giảng viên');
    expect(getRoleDisplay('admin').label).toBe('Quản trị');
  });

  it('role lạ KHÔNG được hiện như một vai trò hợp lệ', () => {
    // Đây là cơ chế thật khiến người dùng kết luận hệ thống có hai role riêng
    // biệt "Phòng Đào tạo" và "super_admin": một tab giữ bundle cũ, hoặc một
    // JWT phát trước migration rename, là đủ để badge in ra chuỗi enum thô
    // trong màu xám — nhìn y như một vai trò bình thường.
    const stale = getRoleDisplay('super_admin');
    expect(stale.label).not.toBe('super_admin');
    expect(stale.label).toMatch(/không xác định/i);
    expect(stale.label).toContain('super_admin');
    expect(stale.variant).toBe('destructive');
  });
});
```

- [ ] **Step 2: Chạy để xác nhận nó đỏ**

```bash
cd apps/web && npx vitest run src/lib/account-roles.test.ts
```

Expected: **FAIL** — `stale.label` đang là đúng `'super_admin'`.

- [ ] **Step 3: Sửa fallback**

`apps/web/src/lib/account-roles.ts`:

```ts
/**
 * Label + badge colour cho một role bất kỳ.
 *
 * Role không có trong map hiện ra như một CẢNH BÁO, không phải như một vai
 * trò. Bản trước trả `{ label: role, variant: 'default' }` với ý đúng — thà
 * nói một điều thật mà xấu hơn là dán nhãn sai âm thầm — nhưng chưa đủ xấu:
 * một chuỗi enum thô trong badge xám đọc y như một vai trò hợp lệ, và đó
 * chính là cách người dùng kết luận hệ thống có hai role riêng biệt "Phòng
 * Đào tạo" và `super_admin` (một tab giữ bundle cũ, hoặc một JWT phát trước
 * migration rename, là đủ).
 *
 * Cùng nguyên tắc `ROLE_AREAS` đã ghi: unmapped means visibly unmapped.
 * Vẫn in ra giá trị thô, vì đó là thứ duy nhất giúp chẩn đoán.
 */
export function getRoleDisplay(role: string): {
  label: string;
  variant: NonNullable<BadgeProps['variant']>;
} {
  return (
    ROLE_DISPLAY[role] ?? {
      label: `Vai trò không xác định (${role})`,
      variant: 'destructive',
    }
  );
}
```

- [ ] **Step 4: Chạy lại + toàn bộ web**

```bash
cd apps/web && npx vitest run && npx tsc --noEmit && npm run lint && npm run build
```

Expected: PASS cả bốn. Nếu một test cũ khẳng định badge in ra chuỗi thô, sửa test đó — nó đang mã hoá đúng hành vi vừa bị loại.

- [ ] **Step 5: Commit**

```bash
cd "/c/Users/Admin/Main/Desktop/HKI 2026-2027/KLTN/CINE"
git add apps/web/src/lib/account-roles.ts apps/web/src/lib/account-roles.test.ts
git commit -m "fix(web): role la hien nhu canh bao, khong nhu mot vai tro hop le"
```

---

## Task 13: Kiểm tra cuối + ghi chú vận hành

**Files:**
- Modify: `docs/superpowers/specs/2026-09-07-role-ownership-boundary-design.md` (đổi Trạng thái)

- [ ] **Step 1: Chạy tất cả**

```bash
cd "/c/Users/Admin/Main/Desktop/HKI 2026-2027/KLTN/CINE"
cd apps/api && npm test && npm run lint && npx tsc --noEmit
cd apps/api && npx jest --config ./test/jest-e2e.json --runInBand
cd ../web && npm test && npm run lint && npx tsc --noEmit && npm run build
```

Expected: PASS toàn bộ. Ghi lại số test của mỗi bên vào commit message cuối.

- [ ] **Step 2: Xác minh không còn tham chiếu chết**

```bash
cd "/c/Users/Admin/Main/Desktop/HKI 2026-2027/KLTN/CINE"
grep -rn "department/rooms\|admin/unowned-courses\|useUnownedCourses\|courses/unowned\|findUnowned\|createForHead\|updateForHead\|removeForHead\|CourseView" apps packages --include=*.ts --include=*.tsx | grep -v node_modules
```

Expected: **không dòng nào** (trừ file migration lịch sử nếu có). Mỗi dòng còn lại là một tham chiếu chết — sửa trước khi đóng.

- [ ] **Step 3: Kiểm tra thủ công bằng UI**

Cần một tài khoản `academic_affairs` và một `department_admin`. Đăng nhập lần lượt và xác nhận:

1. **Phòng Đào tạo** thấy ba mục nav: Học kỳ · Môn học · Phòng thi. Tạo được một môn (chủ để trống), thấy nó ở danh mục là "Chưa có chủ", phân công được về một Trưởng khoa, và sau khi phân công thì **không** sửa được nó nữa.
2. **Trưởng khoa** không còn mục Phòng thi. Dashboard thẻ Phòng thi vẫn có số, hint nói Phòng Đào tạo quản lý. `/academic/rooms` bị `middleware` đẩy về `/department/dashboard`.
3. **Admin** không còn mục "Môn chưa có chủ".
4. Môn vừa phân công **hiện ra** ở `/department/courses` của đúng Trưởng khoa đó.

- [ ] **Step 4: Đổi trạng thái spec + commit**

Sửa `**Trạng thái:** chờ duyệt` → `**Trạng thái:** đã thực hiện (2026-09-07)`.

```bash
cd "/c/Users/Admin/Main/Desktop/HKI 2026-2027/KLTN/CINE"
git add docs/superpowers/specs/2026-09-07-role-ownership-boundary-design.md
git commit -m "docs(spec): ranh gioi so huu ba tier da thuc hien"
```

- [ ] **Step 5: Ghi chú vận hành trước khi merge**

Không có migration, nên không có bước DB. Nhưng có **một thay đổi lấy đi quyền của người đang dùng**, phải nói trước khi deploy chứ không để họ phát hiện bằng một 403:

> **41 Trưởng khoa mất quyền tạo/sửa/xoá phòng thi.** Ai đang làm việc đó phải chuyển sang một tài khoản Phòng Đào tạo (hiện có 19).

Và hai bookmark sẽ 404: `/admin/unowned-courses`, `/department/rooms`. Để 404 có chủ đích — app chưa phát hành, và một redirect chéo area sẽ bị `middleware` bật lại về home của role, thành một vòng lặp khó hiểu hơn cả 404.

---

## Self-Review

**Spec coverage** — mọi mục của spec có task tương ứng:

| Spec | Task |
|---|---|
| §2 quy tắc sở hữu (vào `nav-config.ts`) | 10 |
| §2.1 vòng đời học kỳ (đường công bố môn) | 6 |
| §3.0 `Roles` decorator có kiểu | 1 |
| §3.1 rooms → `academic_affairs` | 4 |
| §3.1 `GET /courses` danh mục, xoá `/courses/unowned` | 5 |
| §3.1 `PATCH/DELETE /courses/:id` cho academic | 7 |
| §3.1 `assignOwner` → `academic_affairs` | 5 (Step 8) |
| §3.1 ghi chú `GET /courses` ≠ `/courses/mine` | 5 (doc comment) |
| §3.2 chủ suy từ vai, `never` check | 6 |
| §4.1 kiểm vai người nhận | 3 |
| §4.2 audit trong transaction | 3 |
| §4.3 xoá `findUnowned` | 5 |
| §5 `missingLink` dashboard | 11 |
| §6.1 nav ba mảng | 10 |
| §6.2 dời/xoá/tạo trang | 10 |
| §6.3 `getRoleDisplay` | 12 |
| §7 không migration | Global Constraints |
| §8 test hai vế | 3, 4, 5, 6, 7 |
| §8 `TestAccountRole` | 2 |
| §8 fallout `department-resources` | 4, 5 |
| §9.2 `remove` 409 tách hai loại | 8 |
| §10 sốc vận hành | 13 (Step 5) |

**Type consistency** đã đối chiếu qua các task: `CourseCatalogView` (API, Task 5) ↔ `CourseCatalogEntry` (web, Task 9) — tên khác nhau có chủ đích theo đúng thói của repo (`DepartmentTeacherView` ↔ `DepartmentTeacher`), cùng bộ trường. `assignOwner` ba tham số (Task 3) được Task 5 giữ nguyên khi đổi `@Roles`. `createForActor` / `updateForActor` / `removeForActor` cùng shape `actor: { id, role }` ở cả ba task 6–7. `DEPARTMENT_KEYS.catalog` được cả `useCourseCatalog` và bốn mutation dùng chung, nên phân công xong là danh mục tự refetch.

**Một chỗ đã sửa trong lúc soi:** Task 3 ban đầu viết test bằng `academicToken` trong khi `assignOwner` còn `@Roles('admin')` cho tới Task 5 — test sẽ đỏ vì hai lý do lẫn nhau, làm mất giá trị chẩn đoán của vòng đỏ. Đã đổi: Task 3 dùng `adminToken`, Task 5 Step 8 đổi sang `academicToken` cùng lúc đổi decorator.
