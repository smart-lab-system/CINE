# Plan B — Trang đọc `audit_log` của admin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cho admin đọc được `audit_log`: một route `GET /audit-log` có lọc và phân trang, và trang `/admin/audit-log` thay `PlaceholderPage`, đọc mỗi dòng bằng một câu tiếng Việt.

**Architecture:** Một service **đọc** tách khỏi `AuditLogService` (service ghi giữ nguyên là "cách DUY NHẤT để ghi", không có phương thức đọc). Phần dựng mệnh đề `WHERE` là một hàm thuần để test không cần DB; truy vấn là SQL tham số hoá, cắt hai giá trị jsonb ở 4 KB ngay trong SQL. Phía web: lớp `lib/api` → hook → trang, cộng một bộ mô tả hành động (registry, mỗi plan sau thêm câu mô tả cho hành động của nó).

**Tech Stack:** NestJS 10 + TypeORM 0.3 + class-validator, Postgres 16 (`starts_with`, `octet_length`), Next.js 15 / React 19, TanStack Query 5, vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-04-master-data-restoration-design.md` §4.2, T-AUD-2, T-AUD-3, T-AUD-4; §13 mục 11.

## Global Constraints

- `GET /audit-log` chỉ `admin` đọc được; teacher → 403, không token → 401 (spec §4.2 "Chỉ `admin` đọc được").
- Sắp xếp theo `occurred_at` **giảm dần**, hoà thì theo `id` giảm dần (spec §4.2 "phân trang theo `occurred_at` giảm dần").
- Hai giá trị jsonb **cắt ở 4 KB mỗi trường** trong danh sách (spec §4.2): hằng `AUDIT_VALUE_CAP_BYTES = 4096`.
- Lọc `action`: "khớp chính xác hoặc theo tiền tố, ví dụ `room.`" (spec §4.2). Quy ước của plan này: mục kết thúc bằng `.` là **tiền tố**, còn lại là khớp **chính xác**. `action` nhận nhiều mục (lặp tham số hoặc ngăn bằng dấu phẩy), tối đa 10.
- Chỉ mục có sẵn đủ dùng; **không thêm chỉ mục** cho truy vấn chỉ theo khoảng ngày (spec §13 mục 11).
- **Không sửa `AuditLogService`** và **không** thêm phương thức đọc vào nó (bất biến trong `admin.module.ts`: "repository stays private so nothing outside can bypass `recordUserAction`").
- `audit_log` là append-only bằng trigger: e2e **không xoá được** dòng đã ghi. Test tự cô lập bằng tài khoản người thực hiện và tiền tố hành động duy nhất cho mỗi lần chạy.
- Route mới ⇒ phải regenerate `packages/shared/src/api/schema.d.ts` từ một API đang chạy (Task 3), nếu không `apps/web` không qua typecheck.
- Web theo luật phân lớp: **trang → hook → `lib/api`**, trang không gọi `apiClient`.
- Trang này phục vụ **điều tra sự cố**, không phải biện pháp kiểm soát quyền (spec §4.2 "Nói thẳng về giá trị"): mô tả trong giao diện không được gọi nó là đối trọng.

## Review Focus

1. **Ký tự đại diện trong bộ lọc hành động.** Tên hành động chứa `_` (`reassign_teacher`); nếu dùng `LIKE` thì `_` khớp mọi ký tự và `%` khớp mọi thứ. → khớp tiền tố bằng `starts_with`, không `LIKE`; e2e ép `room_` và `%` phải ra 0 dòng (Task 2).
2. **Hai dòng cùng `occurred_at`.** Phân trang offset trên khoá không duy nhất làm một dòng xuất hiện hai lần hoặc biến mất giữa hai trang. → thêm `id` làm khoá phụ; e2e ghi 7 dòng cùng giây, đọc ba trang, kiểm hợp các trang là đúng 7 id khác nhau (Task 2).
3. **Giá trị jsonb khổng lồ.** Một dòng với `new_value` vài MB làm trang chậm hoặc vỡ. → cắt trong SQL (không tải rồi cắt ở Node), trả `null` kèm cờ `…Truncated`; e2e ghi một dòng 5.000 ký tự (Task 2).
4. **`from`/`to` ngược hoặc rác.** `to ≤ from` không được trả 200 rỗng im lặng. → 400 với câu nói rõ; e2e (Task 2).
5. **Dòng của "hệ thống"** (không người thực hiện, `actor_id` NULL) phải hiện được, không làm sập phép nối. → LEFT JOIN, `actor: null`, giao diện ghi "Hệ thống"; e2e và test mô tả (Task 2, Task 4).

---

## File Structure

| File | Việc |
|---|---|
| `apps/api/src/admin/audit-log-query.ts` | **Mới.** Hàm thuần `buildAuditWhere` + hằng `AUDIT_VALUE_CAP_BYTES`. |
| `apps/api/src/admin/audit-log-query.spec.ts` | **Mới.** Unit test hàm trên. |
| `apps/api/src/admin/audit-log.types.ts` | **Mới.** Lớp mô tả phản hồi (để plugin Swagger sinh schema). |
| `apps/api/src/admin/dto/search-audit-log.dto.ts` | **Mới.** DTO query. |
| `apps/api/src/admin/audit-log-reader.service.ts` | **Mới.** Truy vấn + ánh xạ dòng. |
| `apps/api/src/admin/audit-log.controller.ts` | **Mới.** `GET /audit-log`, `@Roles('admin')`. |
| `apps/api/src/admin/admin.module.ts` | Thêm controller và reader. |
| `apps/api/src/app.module.ts` | Import `AdminModule` tường minh. |
| `apps/api/test/audit-log-reader.e2e-spec.ts` | **Mới.** T-AUD-2/3/4 trên DB thật. |
| `packages/shared/src/api/schema.d.ts` | Sinh lại. |
| `apps/web/src/lib/api/audit-log.ts` | **Mới.** Kiểu + `searchAuditLog`. |
| `apps/web/src/hooks/useAuditLog.ts` | **Mới.** `useAuditLog`. |
| `apps/web/src/lib/audit-describe.ts` (+ `.test.ts`) | **Mới.** Registry mô tả hành động. |
| `apps/web/src/lib/audit-filters.ts` (+ `.test.ts`) | **Mới.** Nhóm hành động, khoảng ngày, dựng tham số. |
| `apps/web/src/app/admin/audit-log/_components/AuditFilters.tsx` | **Mới.** Thanh lọc. |
| `apps/web/src/app/admin/audit-log/_components/AuditTable.tsx` | **Mới.** Bảng + dòng mở rộng. |
| `apps/web/src/app/admin/audit-log/page.tsx` (+ `page.test.tsx`) | Thay `PlaceholderPage`. |

Không migration, không đụng `AuditLogService`, không đụng `nav-config.ts` (mục "Audit log" đã có).

---

### Task 1: Hàm dựng mệnh đề `WHERE` (thuần) và test

**Files:**
- Create: `apps/api/src/admin/audit-log-query.ts`
- Test: `apps/api/src/admin/audit-log-query.spec.ts`

**Interfaces:**
- Produces:

```ts
export const AUDIT_VALUE_CAP_BYTES = 4096;
export interface AuditLogFilters {
  actions?: string[];   // mục kết thúc bằng '.' = tiền tố, còn lại = chính xác
  actorId?: string;
  targetType?: string;
  targetId?: string;
  from?: Date;          // bao gồm
  to?: Date;            // KHÔNG bao gồm
}
export interface BuiltWhere { clause: string; params: unknown[]; }
export function buildAuditWhere(filters: AuditLogFilters): BuiltWhere;
```

- [ ] **Step 1: Viết test (đỏ)**

Create `apps/api/src/admin/audit-log-query.spec.ts`:

```ts
import { AUDIT_VALUE_CAP_BYTES, buildAuditWhere } from './audit-log-query';

describe('buildAuditWhere', () => {
  it('không có bộ lọc thì không có mệnh đề WHERE', () => {
    expect(buildAuditWhere({})).toEqual({ clause: '', params: [] });
  });

  it('một hành động chính xác dùng so bằng, không LIKE', () => {
    const built = buildAuditWhere({ actions: ['room.update'] });
    expect(built.clause).toBe('WHERE (a.action = $1)');
    expect(built.params).toEqual(['room.update']);
  });

  it('mục kết thúc bằng dấu chấm là tiền tố, dùng starts_with', () => {
    const built = buildAuditWhere({ actions: ['room.'] });
    expect(built.clause).toBe('WHERE (starts_with(a.action, $1))');
    expect(built.params).toEqual(['room.']);
  });

  it('nhiều mục nối bằng OR trong một cặp ngoặc, đánh số theo thứ tự', () => {
    const built = buildAuditWhere({ actions: ['semester.', 'class.create', 'room.'] });
    expect(built.clause).toBe(
      'WHERE (starts_with(a.action, $1) OR a.action = $2 OR starts_with(a.action, $3))',
    );
    expect(built.params).toEqual(['semester.', 'class.create', 'room.']);
  });

  it('mọi bộ lọc nối bằng AND và đánh số liên tục', () => {
    const from = new Date('2026-10-01T00:00:00.000Z');
    const to = new Date('2026-10-02T00:00:00.000Z');
    const built = buildAuditWhere({
      actions: ['room.'],
      actorId: '11111111-1111-4111-8111-111111111111',
      targetType: 'room',
      targetId: '22222222-2222-4222-8222-222222222222',
      from,
      to,
    });
    expect(built.clause).toBe(
      'WHERE (starts_with(a.action, $1)) AND a.actor_id = $2 AND a.target_type = $3 ' +
        'AND a.target_id = $4 AND a.occurred_at >= $5 AND a.occurred_at < $6',
    );
    expect(built.params).toEqual([
      'room.',
      '11111111-1111-4111-8111-111111111111',
      'room',
      '22222222-2222-4222-8222-222222222222',
      from,
      to,
    ]);
  });

  it('không bao giờ nội suy giá trị người dùng vào câu SQL, kể cả ký tự đại diện LIKE', () => {
    const built = buildAuditWhere({ actions: ["room.%", "x_y.", "'; DROP TABLE audit_log; --"] });
    expect(built.clause).not.toMatch(/LIKE/i);
    expect(built.clause).not.toContain('DROP');
    expect(built.clause).not.toContain('%');
    expect(built.params).toEqual(["room.%", "x_y.", "'; DROP TABLE audit_log; --"]);
  });

  it('mảng hành động rỗng không sinh mệnh đề rỗng "()"', () => {
    expect(buildAuditWhere({ actions: [] })).toEqual({ clause: '', params: [] });
  });
});

describe('AUDIT_VALUE_CAP_BYTES', () => {
  it('là 4 KB theo spec §4.2', () => {
    expect(AUDIT_VALUE_CAP_BYTES).toBe(4096);
  });
});
```

- [ ] **Step 2: Chạy để thấy đỏ**

Run (từ `apps/api`): `npx jest src/admin/audit-log-query.spec.ts`
Expected: FAIL — `Cannot find module './audit-log-query'`.

- [ ] **Step 3: Viết hàm**

Create `apps/api/src/admin/audit-log-query.ts`:

```ts
/**
 * Dựng mệnh đề WHERE cho trang đọc `audit_log`.
 *
 * Hàm THUẦN, tách khỏi service để test mà không cần DB, và để có đúng một chỗ
 * trả lời "giá trị của người dùng đi vào câu SQL bằng cách nào": chỉ bằng
 * THAM SỐ ($1, $2, …), không bao giờ nội suy chuỗi.
 *
 * Khớp tiền tố dùng `starts_with`, không dùng `LIKE`. Tên hành động chứa dấu
 * gạch dưới (`reassign_teacher`, `access_granted`) và `_` là ký tự đại diện
 * của LIKE: `LIKE 'exam_session.%'` khớp luôn `examXsession.…`, còn một giá
 * trị người dùng có `%` thì khớp mọi thứ. `starts_with` không có ký tự đại
 * diện nào, nên không phải escape gì.
 */

/** Trần kích thước (tính bằng byte của dạng văn bản jsonb) của mỗi giá trị trong danh sách. */
export const AUDIT_VALUE_CAP_BYTES = 4096;

export interface AuditLogFilters {
  /**
   * Mỗi mục kết thúc bằng `.` là một TIỀN TỐ (`room.` khớp `room.create`,
   * `room.update`, …); mục khác khớp CHÍNH XÁC.
   */
  actions?: string[];
  actorId?: string;
  targetType?: string;
  targetId?: string;
  /** Bao gồm. */
  from?: Date;
  /** KHÔNG bao gồm — để hai khoảng liền kề không đếm một dòng hai lần. */
  to?: Date;
}

export interface BuiltWhere {
  /** Rỗng, hoặc bắt đầu bằng `WHERE `. Bảng được gọi là `a`. */
  clause: string;
  params: unknown[];
}

export function buildAuditWhere(filters: AuditLogFilters): BuiltWhere {
  const conditions: string[] = [];
  const params: unknown[] = [];
  const bind = (value: unknown): string => {
    params.push(value);
    return `$${params.length}`;
  };

  if (filters.actions && filters.actions.length > 0) {
    const parts = filters.actions.map((entry) =>
      entry.endsWith('.')
        ? `starts_with(a.action, ${bind(entry)})`
        : `a.action = ${bind(entry)}`,
    );
    conditions.push(`(${parts.join(' OR ')})`);
  }
  if (filters.actorId) conditions.push(`a.actor_id = ${bind(filters.actorId)}`);
  if (filters.targetType) conditions.push(`a.target_type = ${bind(filters.targetType)}`);
  if (filters.targetId) conditions.push(`a.target_id = ${bind(filters.targetId)}`);
  if (filters.from) conditions.push(`a.occurred_at >= ${bind(filters.from)}`);
  if (filters.to) conditions.push(`a.occurred_at < ${bind(filters.to)}`);

  return {
    clause: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
    params,
  };
}
```

- [ ] **Step 4: Chạy để thấy xanh**

Run: `npx jest src/admin/audit-log-query.spec.ts`
Expected: PASS, 8 test.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/admin/audit-log-query.ts apps/api/src/admin/audit-log-query.spec.ts
git commit -m "feat(audit): hàm dựng WHERE cho trang đọc audit_log (tham số hoá, starts_with)"
```

---

### Task 2: Service đọc, DTO, controller, nối module, e2e

**Files:**
- Create: `apps/api/src/admin/audit-log.types.ts`
- Create: `apps/api/src/admin/dto/search-audit-log.dto.ts`
- Create: `apps/api/src/admin/audit-log-reader.service.ts`
- Create: `apps/api/src/admin/audit-log.controller.ts`
- Modify: `apps/api/src/admin/admin.module.ts`
- Modify: `apps/api/src/app.module.ts`
- Test: `apps/api/test/audit-log-reader.e2e-spec.ts`

**Interfaces:**
- Consumes: `buildAuditWhere`, `AUDIT_VALUE_CAP_BYTES` (Task 1); `JwtAuthGuard`, `RolesGuard`, `Roles` (`apps/api/src/auth`).
- Produces:

```ts
// audit-log.types.ts
export class AuditLogActorView { id!: string; name!: string; email!: string; }
export class AuditLogEntryView {
  id!: string; occurredAt!: Date; actor!: AuditLogActorView | null;
  action!: string; targetType!: string; targetId!: string;
  oldValue!: Record<string, unknown> | null; oldValueTruncated!: boolean;
  newValue!: Record<string, unknown> | null; newValueTruncated!: boolean;
}
export class AuditLogPageView { items!: AuditLogEntryView[]; total!: number; page!: number; pageSize!: number; }
// audit-log-reader.service.ts
class AuditLogReaderService { search(query: SearchAuditLogDto): Promise<AuditLogPageView> }
// route
GET /audit-log?action=…&actorId=…&targetType=…&targetId=…&from=…&to=…&page=…&pageSize=…
```

- [ ] **Step 1: Viết e2e (đỏ)**

Create `apps/api/test/audit-log-reader.e2e-spec.ts`:

```ts
import { randomUUID } from 'crypto';
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';
import { AuditLogEntity } from '../src/admin/entities/audit-log.entity';
import { createTestAccount } from './helpers/create-account';

/**
 * Trang đọc audit_log. `audit_log` là append-only bằng trigger nên các dòng
 * test ghi ở đây KHÔNG xoá được: cô lập bằng tài khoản người thực hiện riêng và
 * tiền tố hành động duy nhất cho mỗi lần chạy, để dữ liệu thật hay lần chạy
 * trước không lọt vào kết quả.
 */
describe('GET /audit-log (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let adminToken: string;
  let teacherToken: string;
  let adminId: string;
  let otherActorId: string;

  const run = Date.now().toString(36);
  /** Mọi hành động của lần chạy này bắt đầu bằng `P`. `P` kết thúc bằng '.' nên cũng là một tiền tố hợp lệ. */
  const P = `zz${run}.`;
  const at = (iso: string) => new Date(iso);

  async function login(email: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'correct-horse-battery' });
    return response.body.accessToken;
  }

  async function put(entry: {
    action: string;
    actorId?: string | null;
    occurredAt: Date;
    oldValue?: Record<string, unknown>;
    newValue?: Record<string, unknown>;
  }) {
    const repo = dataSource.getRepository(AuditLogEntity);
    const actorId = entry.actorId === undefined ? adminId : entry.actorId;
    return repo.save(
      repo.create({
        actorType: actorId ? 'user' : 'system',
        actorId,
        action: entry.action,
        targetType: 'zz_probe',
        targetId: randomUUID(),
        oldValue: entry.oldValue ?? {},
        newValue: entry.newValue ?? {},
        occurredAt: entry.occurredAt,
      }),
    );
  }

  function get(path: string, token = adminToken) {
    return request(app.getHttpServer()).get(path).set('Authorization', `Bearer ${token}`);
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new PostgresExceptionFilter());
    await app.init();
    dataSource = app.get(DataSource);

    const adminEmail = `audit_reader_admin_${run}@example.com`;
    adminId = await createTestAccount(dataSource, {
      name: 'Admin Đọc Nhật Ký',
      email: adminEmail,
      password: 'correct-horse-battery',
      role: 'admin',
    });
    adminToken = await login(adminEmail);

    const teacherEmail = `audit_reader_teacher_${run}@example.com`;
    await createTestAccount(dataSource, {
      email: teacherEmail,
      password: 'correct-horse-battery',
      role: 'teacher',
    });
    teacherToken = await login(teacherEmail);

    otherActorId = await createTestAccount(dataSource, {
      email: `audit_reader_other_${run}@example.com`,
      password: 'correct-horse-battery',
      role: 'admin',
    });

    // Người thực hiện A (adminId)
    await put({ action: `${P}room.create`, occurredAt: at('2020-01-01T10:00:00.000Z') });
    await put({ action: `${P}room.update`, occurredAt: at('2020-01-02T10:00:00.000Z') });
    await put({ action: `${P}class.create`, occurredAt: at('2020-01-03T10:00:00.000Z') });
    // Người thực hiện B (otherActorId)
    await put({
      action: `${P}room.create`,
      actorId: otherActorId,
      occurredAt: at('2020-01-02T12:00:00.000Z'),
    });
    // Hệ thống: không người thực hiện
    await put({ action: `${P}system.tick`, actorId: null, occurredAt: at('2020-01-04T00:00:00.000Z') });
    // Bảy dòng CÙNG một thời điểm — phân trang phải vẫn ổn định
    for (let i = 0; i < 7; i++) {
      await put({ action: `${P}tie.row`, occurredAt: at('2020-02-01T00:00:00.000Z') });
    }
    // Một giá trị vượt 4 KB
    await put({
      action: `${P}big.write`,
      occurredAt: at('2020-03-01T00:00:00.000Z'),
      oldValue: { small: 1 },
      newValue: { blob: 'x'.repeat(5000) },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('T-AUD-3: không token là 401, giảng viên là 403', async () => {
    await request(app.getHttpServer()).get('/audit-log').expect(401);
    await get('/audit-log', teacherToken).expect(403);
  });

  it('T-AUD-2: khớp chính xác một hành động', async () => {
    const response = await get(
      `/audit-log?action=${encodeURIComponent(`${P}room.create`)}&actorId=${adminId}`,
    ).expect(200);
    expect(response.body.total).toBe(1);
    expect(response.body.items.map((e: { action: string }) => e.action)).toEqual([`${P}room.create`]);
  });

  it('T-AUD-2: không có actorId thì thấy cả hai người thực hiện', async () => {
    const response = await get(`/audit-log?action=${encodeURIComponent(`${P}room.create`)}`).expect(200);
    expect(response.body.total).toBe(2);
  });

  it('T-AUD-2: tiền tố kết thúc bằng dấu chấm, mới nhất trước', async () => {
    const response = await get(
      `/audit-log?action=${encodeURIComponent(`${P}room.`)}&actorId=${adminId}`,
    ).expect(200);
    expect(response.body.items.map((e: { action: string }) => e.action)).toEqual([
      `${P}room.update`,
      `${P}room.create`,
    ]);
  });

  it('T-AUD-2: danh sách nhiều mục, bằng cách lặp tham số hoặc ngăn bằng dấu phẩy', async () => {
    const a = encodeURIComponent(`${P}room.`);
    const b = encodeURIComponent(`${P}class.create`);
    const repeated = await get(`/audit-log?action=${a}&action=${b}&actorId=${adminId}`).expect(200);
    const commas = await get(`/audit-log?action=${a},${b}&actorId=${adminId}`).expect(200);
    expect(repeated.body.total).toBe(3);
    expect(commas.body.total).toBe(3);
  });

  it('không có ký tự đại diện: `_` và `%` được hiểu đúng nghĩa đen (Review Focus 1)', async () => {
    // Với LIKE, `_oom` khớp `room`; ở đây phải ra 0.
    const underscore = await get(
      `/audit-log?action=${encodeURIComponent(`${P}_oom.`)}&actorId=${adminId}`,
    ).expect(200);
    expect(underscore.body.total).toBe(0);
    // Một hành động chính xác có `%` cũng không được khớp gì.
    const percent = await get(
      `/audit-log?action=${encodeURIComponent(`${P}room.%`)}&actorId=${adminId}`,
    ).expect(200);
    expect(percent.body.total).toBe(0);
  });

  it('T-AUD-2: lọc theo người thực hiện không để dòng của người khác lọt vào', async () => {
    const response = await get(
      `/audit-log?action=${encodeURIComponent(P)}&actorId=${otherActorId}`,
    ).expect(200);
    expect(response.body.total).toBe(1);
    expect(response.body.items[0].actor.id).toBe(otherActorId);
  });

  it('T-AUD-2: `from` bao gồm, `to` không bao gồm', async () => {
    const base = `/audit-log?action=${encodeURIComponent(`${P}room.update`)}&actorId=${adminId}`;
    const exact = '2020-01-02T10:00:00.000Z';
    const includesFrom = await get(`${base}&from=${exact}`).expect(200);
    expect(includesFrom.body.total).toBe(1);
    const excludesTo = await get(`${base}&to=${exact}`).expect(200);
    expect(excludesTo.body.total).toBe(0);
  });

  it('T-AUD-2: hoà thời gian thì phân trang vẫn ổn định, không trùng không sót (Review Focus 2)', async () => {
    const base = `/audit-log?action=${encodeURIComponent(`${P}tie.row`)}&actorId=${adminId}&pageSize=3`;
    const pages = [
      await get(`${base}&page=1`).expect(200),
      await get(`${base}&page=2`).expect(200),
      await get(`${base}&page=3`).expect(200),
    ];
    expect(pages.map((p) => p.body.items.length)).toEqual([3, 3, 1]);
    for (const p of pages) expect(p.body.total).toBe(7);

    const ids = pages.flatMap((p) => p.body.items.map((e: { id: string }) => e.id));
    expect(new Set(ids).size).toBe(7);
    // Cùng thời điểm thì `id` giảm dần là thứ tự phụ.
    expect(ids).toEqual([...ids].sort().reverse());
  });

  it('T-AUD-4: giá trị vượt 4 KB bị cắt thành null kèm cờ, giá trị nhỏ giữ nguyên (Review Focus 3)', async () => {
    const response = await get(
      `/audit-log?action=${encodeURIComponent(`${P}big.write`)}&actorId=${adminId}`,
    ).expect(200);
    const [entry] = response.body.items;
    expect(entry.newValue).toBeNull();
    expect(entry.newValueTruncated).toBe(true);
    expect(entry.oldValue).toEqual({ small: 1 });
    expect(entry.oldValueTruncated).toBe(false);
  });

  it('trả người thực hiện kèm tên và email, và null cho dòng của hệ thống (Review Focus 5)', async () => {
    const human = await get(
      `/audit-log?action=${encodeURIComponent(`${P}class.create`)}&actorId=${adminId}`,
    ).expect(200);
    expect(human.body.items[0].actor).toEqual({
      id: adminId,
      name: 'Admin Đọc Nhật Ký',
      email: `audit_reader_admin_${run}@example.com`,
    });

    const system = await get(`/audit-log?action=${encodeURIComponent(`${P}system.tick`)}`).expect(200);
    expect(system.body.total).toBe(1);
    expect(system.body.items[0].actor).toBeNull();
  });

  it('từ chối đầu vào sai bằng 400 (Review Focus 4)', async () => {
    await get('/audit-log?page=0').expect(400);
    await get('/audit-log?pageSize=101').expect(400);
    await get('/audit-log?actorId=khong-phai-uuid').expect(400);
    await get('/audit-log?from=hom-qua').expect(400);
    await get(
      '/audit-log?from=2020-01-02T00:00:00.000Z&to=2020-01-02T00:00:00.000Z',
    ).expect(400);
    await get(
      '/audit-log?from=2020-01-03T00:00:00.000Z&to=2020-01-02T00:00:00.000Z',
    ).expect(400);
    const eleven = Array.from({ length: 11 }, (_, i) => `a${i}.`).join(',');
    await get(`/audit-log?action=${eleven}`).expect(400);
  });
});
```

- [ ] **Step 2: Chạy để thấy đỏ**

Run (từ `apps/api`): `npx jest --config ./test/jest-e2e.json test/audit-log-reader.e2e-spec.ts`
Expected: FAIL — các request trả 404 (route chưa có).

- [ ] **Step 3: Viết kiểu phản hồi**

Create `apps/api/src/admin/audit-log.types.ts`:

```ts
/**
 * Hình dạng của một dòng nhật ký như trang admin đọc. Là CLASS, không phải
 * interface: plugin Swagger của Nest chỉ sinh schema OpenAPI từ class, và
 * `apps/web` lấy kiểu route từ schema đó.
 */
export class AuditLogActorView {
  id!: string;
  name!: string;
  email!: string;
}

export class AuditLogEntryView {
  id!: string;
  occurredAt!: Date;
  /** `null` = dòng của hệ thống (`actor_type = 'system'`), không có người thực hiện. */
  actor!: AuditLogActorView | null;
  action!: string;
  targetType!: string;
  targetId!: string;
  /** `null` khi giá trị vượt `AUDIT_VALUE_CAP_BYTES` — xem `oldValueTruncated`. */
  oldValue!: Record<string, unknown> | null;
  oldValueTruncated!: boolean;
  newValue!: Record<string, unknown> | null;
  newValueTruncated!: boolean;
}

export class AuditLogPageView {
  items!: AuditLogEntryView[];
  total!: number;
  page!: number;
  pageSize!: number;
}
```

- [ ] **Step 4: Viết DTO query**

Create `apps/api/src/admin/dto/search-audit-log.dto.ts`:

```ts
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
} from 'class-validator';

/**
 * Bộ lọc của trang đọc `audit_log`. Mọi trường tuỳ chọn; vắng mặt là "không lọc".
 */
export class SearchAuditLogDto {
  /**
   * Một hoặc nhiều hành động. Mục kết thúc bằng `.` là TIỀN TỐ (`room.`), mục
   * khác khớp CHÍNH XÁC. Nhận cả `?action=a&action=b` lẫn `?action=a,b`.
   */
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string'
      ? value
          .split(',')
          .map((item) => item.trim())
          .filter((item) => item !== '')
      : value,
  )
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @Length(1, 80, { each: true })
  action?: string[];

  @IsOptional()
  @IsUUID()
  actorId?: string;

  @IsOptional()
  @IsString()
  @Length(1, 80)
  targetType?: string;

  /** Dùng chỉ mục `(target_type, target_id, occurred_at)`: "ai đã đổi đối tượng này". */
  @IsOptional()
  @IsUUID()
  targetId?: string;

  /** Bao gồm. */
  @IsOptional()
  @IsISO8601()
  from?: string;

  /** KHÔNG bao gồm. */
  @IsOptional()
  @IsISO8601()
  to?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = 50;
}
```

- [ ] **Step 5: Viết service đọc**

Create `apps/api/src/admin/audit-log-reader.service.ts`:

```ts
import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AUDIT_VALUE_CAP_BYTES, buildAuditWhere } from './audit-log-query';
import { SearchAuditLogDto } from './dto/search-audit-log.dto';
import { AuditLogEntryView, AuditLogPageView } from './audit-log.types';

interface AuditRow {
  id: string;
  occurredAt: Date;
  action: string;
  targetType: string;
  targetId: string;
  actorId: string | null;
  actorName: string | null;
  actorEmail: string | null;
  oldValue: Record<string, unknown> | null;
  oldValueTruncated: boolean;
  newValue: Record<string, unknown> | null;
  newValueTruncated: boolean;
}

/**
 * Phía ĐỌC của nhật ký. Cố ý tách khỏi `AuditLogService`: service đó là "cách
 * duy nhất để ghi" và không có phương thức đọc nào, nên không ai ghi một dòng
 * không có người thực hiện qua nó. Gộp hai việc vào một lớp là mời một phương
 * thức `update` hay `delete` vào đó một ngày nào đó.
 *
 * Truy vấn là SQL thô tham số hoá thay vì QueryBuilder vì hai lý do: bảng được
 * phân vùng nên TypeORM không thêm gì ở đây, và việc CẮT giá trị jsonb phải xảy
 * ra ở Postgres (`CASE WHEN octet_length(...)`), không ở Node — tải về vài MB
 * rồi mới cắt thì cái trần không bảo vệ được gì.
 *
 * Thứ tự `occurred_at DESC, id DESC`: `id` là khoá phụ để hai dòng cùng thời
 * điểm không đổi chỗ giữa các trang.
 */
@Injectable()
export class AuditLogReaderService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async search(query: SearchAuditLogDto): Promise<AuditLogPageView> {
    const from = query.from ? new Date(query.from) : undefined;
    const to = query.to ? new Date(query.to) : undefined;
    if (from && to && !(to > from)) {
      // Không trả 200 rỗng: một khoảng ngược chiều đọc ra như "chưa ai làm gì".
      throw new BadRequestException('`to` phải sau `from`.');
    }

    const { clause, params } = buildAuditWhere({
      actions: query.action,
      actorId: query.actorId,
      targetType: query.targetType,
      targetId: query.targetId,
      from,
      to,
    });

    const cap = `$${params.length + 1}`;
    const limit = `$${params.length + 2}`;
    const offset = `$${params.length + 3}`;

    const rows: AuditRow[] = await this.dataSource.query(
      `SELECT a.id,
              a.occurred_at AS "occurredAt",
              a.action,
              a.target_type AS "targetType",
              a.target_id   AS "targetId",
              a.actor_id    AS "actorId",
              acc.name      AS "actorName",
              acc.email     AS "actorEmail",
              CASE WHEN octet_length(a.old_value::text) > ${cap} THEN NULL ELSE a.old_value END AS "oldValue",
              octet_length(a.old_value::text) > ${cap} AS "oldValueTruncated",
              CASE WHEN octet_length(a.new_value::text) > ${cap} THEN NULL ELSE a.new_value END AS "newValue",
              octet_length(a.new_value::text) > ${cap} AS "newValueTruncated"
         FROM examcollect.audit_log a
         LEFT JOIN examcollect.account acc ON acc.id = a.actor_id
         ${clause}
        ORDER BY a.occurred_at DESC, a.id DESC
        LIMIT ${limit} OFFSET ${offset}`,
      [...params, AUDIT_VALUE_CAP_BYTES, query.pageSize, (query.page - 1) * query.pageSize],
    );

    const [{ total }] = await this.dataSource.query(
      `SELECT count(*)::int AS total FROM examcollect.audit_log a ${clause}`,
      params,
    );

    return {
      items: rows.map((row) => this.toView(row)),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  private toView(row: AuditRow): AuditLogEntryView {
    return {
      id: row.id,
      occurredAt: row.occurredAt,
      actor: row.actorId
        ? { id: row.actorId, name: row.actorName ?? '', email: row.actorEmail ?? '' }
        : null,
      action: row.action,
      targetType: row.targetType,
      targetId: row.targetId,
      oldValue: row.oldValue,
      oldValueTruncated: row.oldValueTruncated,
      newValue: row.newValue,
      newValueTruncated: row.newValueTruncated,
    };
  }
}
```

- [ ] **Step 6: Viết controller và nối module**

Create `apps/api/src/admin/audit-log.controller.ts`:

```ts
import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { AuditLogReaderService } from './audit-log-reader.service';
import { SearchAuditLogDto } from './dto/search-audit-log.dto';
import { AuditLogPageView } from './audit-log.types';

/**
 * Đọc nhật ký — chỉ admin, và chỉ đọc: không có route ghi, sửa hay xoá nào.
 *
 * Với MỘT admin, người đọc nhật ký cũng là người bị ghi trong đó; trang này
 * phục vụ điều tra sự cố ("ai đổi phòng này, khi nào?") và đối chiếu khi giảng
 * viên với admin nói khác nhau, KHÔNG phải một biện pháp kiểm soát quyền.
 */
@Controller('audit-log')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class AuditLogController {
  constructor(private readonly reader: AuditLogReaderService) {}

  @Get()
  search(@Query() query: SearchAuditLogDto): Promise<AuditLogPageView> {
    return this.reader.search(query);
  }
}
```

Modify `apps/api/src/admin/admin.module.ts` — thay toàn bộ nội dung bằng:

```ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLogEntity } from './entities/audit-log.entity';
import { AuditLogService } from './audit-log.service';
import { AuditLogReaderService } from './audit-log-reader.service';
import { AuditLogController } from './audit-log.controller';

/**
 * CLAUDE.md's module map puts AuditLog here. Only the WRITER is exported —
 * the repository stays private so nothing outside can bypass
 * `recordUserAction` and write an entry with no actor. The reader and its
 * controller are internal: nothing but the admin route reads the trail.
 */
@Module({
  imports: [TypeOrmModule.forFeature([AuditLogEntity])],
  controllers: [AuditLogController],
  providers: [AuditLogService, AuditLogReaderService],
  exports: [AuditLogService],
})
export class AdminModule {}
```

Modify `apps/api/src/app.module.ts`: thêm `import { AdminModule } from './admin/admin.module';` cạnh các import module khác, và thêm `AdminModule,` vào cuối mảng `imports` (sau `CourseModule,`). `AdminModule` hôm nay chỉ được kéo vào gián tiếp qua các module dùng `AuditLogService`; nối tường minh để route của nó không phụ thuộc vào việc một module khác còn import nó.

- [ ] **Step 7: Chạy để thấy xanh**

Run (từ `apps/api`): `npx jest --config ./test/jest-e2e.json test/audit-log-reader.e2e-spec.ts`
Expected: PASS, 12 test. Rồi chạy lại hai bộ liên quan để chắc không vỡ gì:

```
npx jest --config ./test/jest-e2e.json test/audit-log.e2e-spec.ts
npx jest src/admin
```

Expected: cả hai xanh.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/admin apps/api/src/app.module.ts apps/api/test/audit-log-reader.e2e-spec.ts
git commit -m "feat(audit): GET /audit-log cho admin (lọc, phân trang ổn định, cắt giá trị 4 KB)"
```

---

### Task 3: Sinh lại client OpenAPI

**Files:**
- Modify: `packages/shared/src/api/schema.d.ts`

**Interfaces:**
- Produces: `paths['/audit-log']` với tham số query `action`, `actorId`, `targetType`, `targetId`, `from`, `to`, `page`, `pageSize` mà Task 4 gọi qua `apiClient.GET('/audit-log', …)`.

- [ ] **Step 1: Build API và chạy trên DB local**

```powershell
cd apps/api
pnpm build
$env:DOTENV_CONFIG_PATH = '.env.test'
Start-Process -FilePath node -ArgumentList '-r','dotenv/config','dist/src/main.js' -RedirectStandardOutput C:/tmp/api-gen.log -RedirectStandardError C:/tmp/api-gen.err -PassThru | Select-Object -ExpandProperty Id | Out-File C:/tmp/api-gen.pid
```

`DOTENV_CONFIG_PATH=.env.test` buộc API dùng hạ tầng local (không chạm Supabase). Đợi tới khi `curl.exe -s -o NUL -w "%{http_code}" http://localhost:4000/api-docs-json` in `200` (mất ~25 giây).

- [ ] **Step 2: Sinh và kiểm diff**

```powershell
cd ../../packages/shared
$env:API_URL = 'http://localhost:4000/api-docs-json'
pnpm generate:api-client
cd ../..
git diff --stat packages/shared/src/api/schema.d.ts
git diff packages/shared/src/api/schema.d.ts | Select-String -Pattern '^\+.*audit-log|^\+.*SearchAuditLog' | Select-Object -First 5
```

Expected: diff chỉ thêm đường `"/audit-log"` (và, nếu plugin sinh, các kiểu `AuditLog…View`). **Nếu diff có các hunk không liên quan** (vd route khác, đổi kiểu của route khác), schema ở nhánh nền đã lệch: **dừng**, tách các hunk đó thành một commit riêng `chore(shared): đồng bộ schema.d.ts` trước, rồi mới commit phần `/audit-log`.

- [ ] **Step 3: Tắt server đúng PID của mình**

```powershell
Stop-Process -Id (Get-Content C:/tmp/api-gen.pid)
```

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/api/schema.d.ts
git commit -m "chore(shared): sinh lại client OpenAPI cho GET /audit-log"
```

---

### Task 4: Lớp `lib/api`, hook, và bộ mô tả hành động (web)

**Files:**
- Create: `apps/web/src/lib/api/audit-log.ts`
- Create: `apps/web/src/hooks/useAuditLog.ts`
- Create: `apps/web/src/lib/audit-describe.ts`
- Test: `apps/web/src/lib/audit-describe.test.ts`

**Interfaces:**
- Consumes: `apiClient` (`@/lib/api-client`), `GET /audit-log` (Task 3).
- Produces:

```ts
// lib/api/audit-log.ts
export interface AuditLogActor { id: string; name: string; email: string }
export interface AuditLogEntry {
  id: string; occurredAt: string; actor: AuditLogActor | null;
  action: string; targetType: string; targetId: string;
  oldValue: Record<string, unknown> | null; oldValueTruncated: boolean;
  newValue: Record<string, unknown> | null; newValueTruncated: boolean;
}
export interface AuditLogPage { items: AuditLogEntry[]; total: number; page: number; pageSize: number }
export interface SearchAuditLogParams {
  action?: string[]; actorId?: string; targetType?: string; targetId?: string;
  from?: string; to?: string; page: number; pageSize: number;
}
export function searchAuditLog(params: SearchAuditLogParams): Promise<AuditLogPage>;
// hooks/useAuditLog.ts
export function useAuditLog(params: SearchAuditLogParams): UseQueryResult<AuditLogPage>;
// lib/audit-describe.ts
export interface DescribableEntry {
  action: string; targetType: string; targetId: string;
  oldValue: Record<string, unknown> | null; newValue: Record<string, unknown> | null;
}
export function describeAuditEntry(entry: DescribableEntry): string;
export const ACTOR_SYSTEM_LABEL = 'Hệ thống';
```

- [ ] **Step 1: Viết lớp API và hook**

Create `apps/web/src/lib/api/audit-log.ts`:

```ts
import { apiClient } from '@/lib/api-client';

// Mirrors AuditLogPageView (apps/api/src/admin/audit-log.types.ts).
export interface AuditLogActor {
  id: string;
  name: string;
  email: string;
}

export interface AuditLogEntry {
  id: string;
  occurredAt: string;
  /** `null` = dòng của hệ thống, không có người thực hiện. */
  actor: AuditLogActor | null;
  action: string;
  targetType: string;
  targetId: string;
  /** `null` khi giá trị vượt 4 KB — xem `oldValueTruncated`. */
  oldValue: Record<string, unknown> | null;
  oldValueTruncated: boolean;
  newValue: Record<string, unknown> | null;
  newValueTruncated: boolean;
}

export interface AuditLogPage {
  items: AuditLogEntry[];
  total: number;
  page: number;
  pageSize: number;
}

export interface SearchAuditLogParams {
  /** Mục kết thúc bằng `.` là tiền tố (`room.`), còn lại khớp chính xác. */
  action?: string[];
  actorId?: string;
  targetType?: string;
  targetId?: string;
  /** ISO 8601, bao gồm. */
  from?: string;
  /** ISO 8601, KHÔNG bao gồm. */
  to?: string;
  page: number;
  pageSize: number;
}

async function throwIfFailed(error: unknown, response: Response) {
  if (error || !response.ok) {
    const body = error as { message?: string | string[] } | undefined;
    const message = Array.isArray(body?.message) ? body!.message.join('; ') : body?.message;
    throw new Error(message ?? `Yêu cầu thất bại (HTTP ${response.status})`);
  }
}

export async function searchAuditLog(params: SearchAuditLogParams): Promise<AuditLogPage> {
  const { data, error, response } = await apiClient.GET('/audit-log', {
    params: { query: params },
  });
  await throwIfFailed(error, response);
  // Cast như lib/api/accounts.ts: kiểu phản hồi do plugin Swagger sinh có thể
  // lệch (Date vs string); JSON thật đúng hình dạng khai ở trên.
  return data as unknown as AuditLogPage;
}
```

Create `apps/web/src/hooks/useAuditLog.ts`:

```ts
'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { searchAuditLog, type SearchAuditLogParams } from '@/lib/api/audit-log';

/**
 * Nhật ký cho trang admin. Mọi tham số làm đổi tập kết quả đều nằm trong khoá.
 *
 * `keepPreviousData`: khi chuyển trang hay đổi bộ lọc, bảng giữ nguyên dòng cũ
 * cho tới khi dòng mới về, thay vì nháy sang khung xương mỗi lần bấm — nhật
 * ký là thứ người ta lật qua lại liên tục.
 */
export function useAuditLog(params: SearchAuditLogParams) {
  return useQuery({
    queryKey: ['audit-log', params],
    queryFn: () => searchAuditLog(params),
    placeholderData: keepPreviousData,
  });
}
```

- [ ] **Step 2: Viết test cho bộ mô tả (đỏ)**

Create `apps/web/src/lib/audit-describe.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ACTOR_SYSTEM_LABEL, describeAuditEntry } from './audit-describe';

const base = { targetType: 'exam_session', targetId: '12345678-aaaa-bbbb-cccc-1234567890ab' };

describe('describeAuditEntry — năm hành động đã có', () => {
  it('chuyển chủ phiên thi', () => {
    expect(
      describeAuditEntry({
        ...base,
        action: 'exam_session.reassign_teacher',
        oldValue: { teacherId: 'aaaaaaaa-1111-2222-3333-444444444444' },
        newValue: { teacherId: 'bbbbbbbb-1111-2222-3333-444444444444' },
      }),
    ).toBe('Chuyển phiên thi sang giảng viên khác (aaaaaaaa… → bbbbbbbb…)');
  });

  it('duyệt cho sinh viên vào phòng thi, kèm lý do', () => {
    expect(
      describeAuditEntry({
        ...base,
        action: 'exam_session.access_granted',
        oldValue: null,
        newValue: { studentMssv: 'SV0001', studentName: 'Nguyễn Văn A', reason: 'Thi bù do ốm' },
      }),
    ).toBe('Duyệt cho sinh viên Nguyễn Văn A (SV0001) vào phòng thi — lý do: Thi bù do ốm');
  });

  it('duyệt vào phòng thi khi không có lý do thì không để thừa dấu gạch', () => {
    expect(
      describeAuditEntry({
        ...base,
        action: 'exam_session.access_granted',
        oldValue: null,
        newValue: { studentMssv: 'SV0001', studentName: 'Nguyễn Văn A' },
      }),
    ).toBe('Duyệt cho sinh viên Nguyễn Văn A (SV0001) vào phòng thi');
  });

  it('ba kiểu sửa điểm sau khi công bố', () => {
    expect(
      describeAuditEntry({
        targetType: 'grading_result',
        targetId: base.targetId,
        action: 'grading_result.manual_score_after_finalize',
        oldValue: { score: '7,50' },
        newValue: { score: '8,00' },
      }),
    ).toBe('Sửa điểm sau khi đã công bố: 7,50 → 8,00');

    expect(
      describeAuditEntry({
        targetType: 'grading_result',
        targetId: base.targetId,
        action: 'grading_result.score_edited_after_finalize',
        oldValue: { finalScore: '6,00' },
        newValue: { finalScore: '6,50', privateNote: 'em xin phúc khảo' },
      }),
    ).toBe('Sửa điểm sau khi đã công bố: 6,00 → 6,50 (có ghi chú riêng)');

    expect(
      describeAuditEntry({
        targetType: 'grading_result',
        targetId: base.targetId,
        action: 'grading_result.score_reapplied_after_finalize',
        oldValue: { score: '5,00' },
        newValue: { score: '4,75' },
      }),
    ).toBe('Áp lại bảng giá cho bài đã công bố: 5,00 → 4,75');
  });

  it('không lộ nội dung ghi chú riêng của giảng viên', () => {
    const text = describeAuditEntry({
      targetType: 'grading_result',
      targetId: base.targetId,
      action: 'grading_result.score_edited_after_finalize',
      oldValue: { finalScore: '6,00' },
      newValue: { finalScore: '6,50', privateNote: 'BÍ MẬT' },
    });
    expect(text).not.toContain('BÍ MẬT');
  });

  it('điểm trước đó không có thì hiện dấu gạch ngang, không hiện "null"', () => {
    expect(
      describeAuditEntry({
        targetType: 'grading_result',
        targetId: base.targetId,
        action: 'grading_result.manual_score_after_finalize',
        oldValue: { score: null },
        newValue: { score: '8,00' },
      }),
    ).toBe('Sửa điểm sau khi đã công bố: — → 8,00');
  });
});

describe('describeAuditEntry — hành động chưa có mô tả riêng', () => {
  it('rơi về tên hành động, loại đối tượng và 8 ký tự đầu của id', () => {
    expect(
      describeAuditEntry({
        action: 'room.create',
        targetType: 'room',
        targetId: '9f8e7d6c-1111-2222-3333-444444444444',
        oldValue: {},
        newValue: {},
      }),
    ).toBe('room.create · room 9f8e7d6c…');
  });

  it('dùng targetLabel (quy ước cho hành động dữ liệu nền) thay cho id khi có', () => {
    expect(
      describeAuditEntry({
        action: 'room.update',
        targetType: 'room',
        targetId: '9f8e7d6c-1111-2222-3333-444444444444',
        oldValue: { capacity: 40 },
        newValue: { targetLabel: 'H3.03', capacity: 45 },
      }),
    ).toBe('room.update · room H3.03: sức chứa 40 → 45');
  });

  it('liệt kê mọi trường đổi, nhãn tiếng Việt cho trường quen thuộc, giữ nguyên tên trường lạ', () => {
    const text = describeAuditEntry({
      action: 'semester.update',
      targetType: 'semester',
      targetId: '9f8e7d6c-1111-2222-3333-444444444444',
      oldValue: { endDate: '2027-01-31', mysteryField: 1 },
      newValue: { targetLabel: 'HK1 2026-2027', endDate: '2027-02-15', mysteryField: 2 },
    });
    expect(text).toBe(
      'semester.update · semester HK1 2026-2027: ngày kết thúc 2027-01-31 → 2027-02-15; mysteryField 1 → 2',
    );
  });

  it('hiện kiểu luận lý bằng có/không và rút gọn uuid dài trong giá trị', () => {
    const text = describeAuditEntry({
      action: 'room.update',
      targetType: 'room',
      targetId: '9f8e7d6c-1111-2222-3333-444444444444',
      oldValue: { isActive: true },
      newValue: { targetLabel: 'H3.03', isActive: false, ownerId: 'abcdef01-1111-2222-3333-444444444444' },
    });
    expect(text).toContain('đang hoạt động có → không');
    expect(text).toContain('ownerId abcdef01…');
  });

  it('chỉ có giá trị mới (tạo) thì hiện giá trị, không có mũi tên', () => {
    const text = describeAuditEntry({
      action: 'room.create',
      targetType: 'room',
      targetId: '9f8e7d6c-1111-2222-3333-444444444444',
      oldValue: {},
      newValue: { targetLabel: 'H3.04', capacity: 30 },
    });
    expect(text).toBe('room.create · room H3.04: sức chứa 30');
  });

  it('chịu được giá trị null (bị cắt vì quá lớn) mà không ném', () => {
    expect(() =>
      describeAuditEntry({
        action: 'class.update',
        targetType: 'class',
        targetId: '9f8e7d6c-1111-2222-3333-444444444444',
        oldValue: null,
        newValue: null,
      }),
    ).not.toThrow();
  });
});

describe('ACTOR_SYSTEM_LABEL', () => {
  it('là "Hệ thống"', () => {
    expect(ACTOR_SYSTEM_LABEL).toBe('Hệ thống');
  });
});
```

- [ ] **Step 3: Chạy để thấy đỏ**

Run (từ `apps/web`): `pnpm vitest run src/lib/audit-describe.test.ts`
Expected: FAIL — không import được `./audit-describe`.

- [ ] **Step 4: Viết bộ mô tả**

Create `apps/web/src/lib/audit-describe.ts`:

```ts
/**
 * Biến một dòng `audit_log` thành MỘT câu tiếng Việt đọc được.
 *
 * Registry `DESCRIBERS` là chỗ các plan sau thêm câu cho hành động của mình
 * (`room.update`, `exam_session.cancel`, …): mỗi hành động mới ghi audit phải
 * thêm một mục ở đây cùng test của nó. Hành động chưa có mục nào vẫn đọc được
 * qua nhánh dự phòng — tên hành động, đối tượng, và danh sách trường đổi.
 *
 * Quy ước cho hành động dữ liệu nền: người ghi đặt `targetLabel` (tên người
 * đọc được của đối tượng: mã phòng, nhãn học kỳ…) vào `newValue` — hoặc vào
 * `oldValue` với hành động xoá. Audit chỉ lưu id của đối tượng, và một câu
 * "đổi phòng 9f8e7d6c…" không giúp ai điều tra gì.
 */

export const ACTOR_SYSTEM_LABEL = 'Hệ thống';

export interface DescribableEntry {
  action: string;
  targetType: string;
  targetId: string;
  /** `null` khi giá trị vượt 4 KB và bị cắt ở API. */
  oldValue: Record<string, unknown> | null;
  newValue: Record<string, unknown> | null;
}

type Describer = (entry: DescribableEntry) => string;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Nhãn tiếng Việt của các trường hay gặp; trường lạ giữ nguyên tên. */
const FIELD_LABELS: Record<string, string> = {
  name: 'tên',
  code: 'mã',
  capacity: 'sức chứa',
  isActive: 'đang hoạt động',
  startDate: 'ngày bắt đầu',
  endDate: 'ngày kết thúc',
  startTime: 'giờ bắt đầu',
  endTime: 'giờ kết thúc',
  examType: 'loại kỳ thi',
  groupName: 'nhóm',
  teacherName: 'giảng viên',
  roomName: 'phòng',
};

function short(id: unknown): string {
  return typeof id === 'string' ? `${id.slice(0, 8)}…` : '—';
}

function format(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'có' : 'không';
  if (typeof value === 'string') return UUID.test(value) ? `${value.slice(0, 8)}…` : value;
  if (typeof value === 'number') return String(value);
  const json = JSON.stringify(value);
  return json.length > 40 ? `${json.slice(0, 40)}…` : json;
}

/** Danh sách "nhãn cũ → mới" cho mọi trường khác `targetLabel`. */
function diff(oldValue: Record<string, unknown> | null, newValue: Record<string, unknown> | null): string {
  const before = oldValue ?? {};
  const after = newValue ?? {};
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(
    (key) => key !== 'targetLabel',
  );
  return keys
    .map((key) => {
      const label = FIELD_LABELS[key] ?? key;
      const hasOld = key in before;
      const hasNew = key in after;
      if (hasOld && hasNew) return `${label} ${format(before[key])} → ${format(after[key])}`;
      return `${label} ${format(hasNew ? after[key] : before[key])}`;
    })
    .join('; ');
}

const scoreChange = (prefix: string, oldScore: unknown, newScore: unknown, suffix = ''): string =>
  `${prefix}: ${format(oldScore)} → ${format(newScore)}${suffix}`;

/** Mô tả riêng cho từng hành động. Plan C, D, F thêm mục của mình vào đây. */
const DESCRIBERS: Record<string, Describer> = {
  'exam_session.reassign_teacher': (e) =>
    `Chuyển phiên thi sang giảng viên khác (${short(e.oldValue?.teacherId)} → ${short(e.newValue?.teacherId)})`,

  'exam_session.access_granted': (e) => {
    const name = format(e.newValue?.studentName);
    const mssv = format(e.newValue?.studentMssv);
    const reason = e.newValue?.reason;
    return (
      `Duyệt cho sinh viên ${name} (${mssv}) vào phòng thi` +
      (typeof reason === 'string' && reason !== '' ? ` — lý do: ${reason}` : '')
    );
  },

  'grading_result.manual_score_after_finalize': (e) =>
    scoreChange('Sửa điểm sau khi đã công bố', e.oldValue?.score, e.newValue?.score),

  // Ghi chú riêng của giảng viên là riêng tư: chỉ nói RẰNG có, không in nội dung.
  'grading_result.score_edited_after_finalize': (e) =>
    scoreChange(
      'Sửa điểm sau khi đã công bố',
      e.oldValue?.finalScore,
      e.newValue?.finalScore,
      e.newValue?.privateNote ? ' (có ghi chú riêng)' : '',
    ),

  'grading_result.score_reapplied_after_finalize': (e) =>
    scoreChange('Áp lại bảng giá cho bài đã công bố', e.oldValue?.score, e.newValue?.score),
};

function fallback(entry: DescribableEntry): string {
  const label = entry.newValue?.targetLabel ?? entry.oldValue?.targetLabel;
  const target = typeof label === 'string' && label !== '' ? label : short(entry.targetId);
  const head = `${entry.action} · ${entry.targetType} ${target}`;
  const changes = diff(entry.oldValue, entry.newValue);
  return changes ? `${head}: ${changes}` : head;
}

export function describeAuditEntry(entry: DescribableEntry): string {
  const describer = DESCRIBERS[entry.action];
  return describer ? describer(entry) : fallback(entry);
}
```

- [ ] **Step 5: Chạy để thấy xanh**

Run: `pnpm vitest run src/lib/audit-describe.test.ts`
Expected: PASS, 11 test.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/api/audit-log.ts apps/web/src/hooks/useAuditLog.ts apps/web/src/lib/audit-describe.ts apps/web/src/lib/audit-describe.test.ts
git commit -m "feat(web): lớp API, hook và bộ mô tả hành động cho trang audit log"
```

---

### Task 5: Bộ lọc — nhóm hành động, khoảng ngày, dựng tham số

**Files:**
- Create: `apps/web/src/lib/audit-filters.ts`
- Test: `apps/web/src/lib/audit-filters.test.ts`

**Interfaces:**
- Consumes: `SearchAuditLogParams` (Task 4).
- Produces:

```ts
export type AuditGroup = 'all' | 'master' | 'session' | 'grading';
export const AUDIT_GROUP_LABELS: Record<AuditGroup, string>;
export const AUDIT_GROUP_PREFIXES: Record<Exclude<AuditGroup, 'all'>, string[]>;
export interface AuditFilterState { group: AuditGroup; actorId: string | null; fromDay: string; toDay: string }
export const EMPTY_AUDIT_FILTERS: AuditFilterState;
export function hasActiveFilters(state: AuditFilterState): boolean;
export function dayRangeToIso(fromDay: string, toDay: string): { from?: string; to?: string };
export function toSearchParams(state: AuditFilterState, page: number, pageSize: number): SearchAuditLogParams;
```

- [ ] **Step 1: Viết test (đỏ)**

Create `apps/web/src/lib/audit-filters.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  AUDIT_GROUP_PREFIXES,
  EMPTY_AUDIT_FILTERS,
  dayRangeToIso,
  hasActiveFilters,
  toSearchParams,
} from './audit-filters';

describe('AUDIT_GROUP_PREFIXES', () => {
  it('nhóm "dữ liệu nền" phủ đủ bốn loại đối tượng admin quản lý', () => {
    expect(AUDIT_GROUP_PREFIXES.master).toEqual([
      'semester.',
      'room.',
      'class.',
      'administrative_class.',
    ]);
  });

  it('mọi tiền tố kết thúc bằng dấu chấm (nếu không API coi là khớp chính xác)', () => {
    for (const prefixes of Object.values(AUDIT_GROUP_PREFIXES)) {
      for (const prefix of prefixes) expect(prefix.endsWith('.')).toBe(true);
    }
  });
});

describe('dayRangeToIso', () => {
  it('chặn dưới là 00:00 giờ địa phương của ngày bắt đầu', () => {
    const { from } = dayRangeToIso('2026-10-01', '');
    expect(new Date(from!).getTime()).toBe(new Date(2026, 9, 1).getTime());
  });

  it('chặn trên là 00:00 của NGÀY SAU ngày kết thúc, để ngày kết thúc được tính trọn', () => {
    const { to } = dayRangeToIso('', '2026-10-03');
    expect(new Date(to!).getTime()).toBe(new Date(2026, 9, 4).getTime());
  });

  it('qua ranh giới tháng và năm', () => {
    expect(new Date(dayRangeToIso('', '2026-12-31').to!).getTime()).toBe(new Date(2027, 0, 1).getTime());
    expect(new Date(dayRangeToIso('', '2026-02-28').to!).getTime()).toBe(new Date(2026, 2, 1).getTime());
  });

  it('ô trống hoặc sai định dạng thì bỏ đầu đó, không ném', () => {
    expect(dayRangeToIso('', '')).toEqual({});
    expect(dayRangeToIso('hôm qua', '2026-13-45')).toEqual({});
  });
});

describe('toSearchParams', () => {
  it('bộ lọc rỗng chỉ có phân trang', () => {
    expect(toSearchParams(EMPTY_AUDIT_FILTERS, 1, 50)).toEqual({ page: 1, pageSize: 50 });
  });

  it('nhóm được dịch thành danh sách tiền tố, "all" thì không có action', () => {
    expect(toSearchParams({ ...EMPTY_AUDIT_FILTERS, group: 'session' }, 2, 50)).toEqual({
      action: ['exam_session.'],
      page: 2,
      pageSize: 50,
    });
    expect(toSearchParams({ ...EMPTY_AUDIT_FILTERS, group: 'all' }, 1, 50).action).toBeUndefined();
  });

  it('người thực hiện và khoảng ngày đi vào tham số', () => {
    const params = toSearchParams(
      { group: 'all', actorId: 'abc', fromDay: '2026-10-01', toDay: '2026-10-03' },
      1,
      20,
    );
    expect(params.actorId).toBe('abc');
    expect(params.from).toBeDefined();
    expect(params.to).toBeDefined();
  });
});

describe('hasActiveFilters', () => {
  it('đúng khi có bất kỳ bộ lọc nào khác mặc định', () => {
    expect(hasActiveFilters(EMPTY_AUDIT_FILTERS)).toBe(false);
    expect(hasActiveFilters({ ...EMPTY_AUDIT_FILTERS, group: 'master' })).toBe(true);
    expect(hasActiveFilters({ ...EMPTY_AUDIT_FILTERS, actorId: 'x' })).toBe(true);
    expect(hasActiveFilters({ ...EMPTY_AUDIT_FILTERS, fromDay: '2026-10-01' })).toBe(true);
    expect(hasActiveFilters({ ...EMPTY_AUDIT_FILTERS, toDay: '2026-10-01' })).toBe(true);
  });
});
```

- [ ] **Step 2: Chạy để thấy đỏ**

Run: `pnpm vitest run src/lib/audit-filters.test.ts`
Expected: FAIL — không import được `./audit-filters`.

- [ ] **Step 3: Viết module**

Create `apps/web/src/lib/audit-filters.ts`:

```ts
import type { SearchAuditLogParams } from '@/lib/api/audit-log';

/**
 * Ba nhóm hành động của trang audit log (spec §4.2): dữ liệu nền, phiên thi,
 * chấm điểm. Mỗi nhóm là một danh sách TIỀN TỐ gửi cho API; một hành động mới
 * thuộc nhóm nào thì tiền tố loại đối tượng của nó phải nằm ở đây.
 */
export type AuditGroup = 'all' | 'master' | 'session' | 'grading';

export const AUDIT_GROUP_LABELS: Record<AuditGroup, string> = {
  all: 'Tất cả hành động',
  master: 'Dữ liệu nền',
  session: 'Phiên thi',
  grading: 'Chấm điểm',
};

export const AUDIT_GROUP_PREFIXES: Record<Exclude<AuditGroup, 'all'>, string[]> = {
  master: ['semester.', 'room.', 'class.', 'administrative_class.'],
  session: ['exam_session.'],
  grading: ['grading_result.'],
};

export interface AuditFilterState {
  group: AuditGroup;
  /** `null` = mọi người thực hiện. */
  actorId: string | null;
  /** `yyyy-mm-dd` từ `<input type="date">`, hoặc rỗng. */
  fromDay: string;
  toDay: string;
}

export const EMPTY_AUDIT_FILTERS: AuditFilterState = {
  group: 'all',
  actorId: null,
  fromDay: '',
  toDay: '',
};

export function hasActiveFilters(state: AuditFilterState): boolean {
  return (
    state.group !== 'all' || state.actorId !== null || state.fromDay !== '' || state.toDay !== ''
  );
}

/** `yyyy-mm-dd` → Date lúc 00:00 giờ ĐỊA PHƯƠNG, hoặc null nếu sai định dạng/không có ngày đó. */
function localMidnight(day: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) return null;
  const [year, month, date] = [Number(match[1]), Number(match[2]) - 1, Number(match[3])];
  const result = new Date(year, month, date);
  // `new Date(2026, 12, 45)` không ném mà tràn sang năm sau; chặn các ngày không có thật.
  if (result.getFullYear() !== year || result.getMonth() !== month || result.getDate() !== date) {
    return null;
  }
  return result;
}

/**
 * Khoảng ngày người dùng chọn → khoảng thời điểm API nhận.
 *
 * `to` là 00:00 của NGÀY SAU ngày kết thúc: API coi `to` là KHÔNG bao gồm,
 * nên chọn "đến 03/10" phải gồm trọn ngày 03/10.
 */
export function dayRangeToIso(fromDay: string, toDay: string): { from?: string; to?: string } {
  const out: { from?: string; to?: string } = {};
  const from = localMidnight(fromDay);
  if (from) out.from = from.toISOString();
  const to = localMidnight(toDay);
  if (to) {
    to.setDate(to.getDate() + 1);
    out.to = to.toISOString();
  }
  return out;
}

export function toSearchParams(
  state: AuditFilterState,
  page: number,
  pageSize: number,
): SearchAuditLogParams {
  return {
    ...(state.group !== 'all' ? { action: AUDIT_GROUP_PREFIXES[state.group] } : {}),
    ...(state.actorId ? { actorId: state.actorId } : {}),
    ...dayRangeToIso(state.fromDay, state.toDay),
    page,
    pageSize,
  };
}
```

- [ ] **Step 4: Chạy để thấy xanh**

Run: `pnpm vitest run src/lib/audit-filters.test.ts`
Expected: PASS, 10 test.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/audit-filters.ts apps/web/src/lib/audit-filters.test.ts
git commit -m "feat(web): nhóm hành động và khoảng ngày cho bộ lọc audit log"
```

---

### Task 6: Trang `/admin/audit-log` (thay placeholder)

**Files:**
- Create: `apps/web/src/app/admin/audit-log/_components/AuditFilters.tsx`
- Create: `apps/web/src/app/admin/audit-log/_components/AuditTable.tsx`
- Modify: `apps/web/src/app/admin/audit-log/page.tsx`
- Test: `apps/web/src/app/admin/audit-log/page.test.tsx`

**Interfaces:**
- Consumes: `useAuditLog` (Task 4), `useAccounts` (`@/hooks/useAccounts`, trả `{ items: AccountView[]; total }`), `describeAuditEntry` / `ACTOR_SYSTEM_LABEL` (Task 4), `AuditFilterState`, `EMPTY_AUDIT_FILTERS`, `AUDIT_GROUP_LABELS`, `hasActiveFilters`, `toSearchParams` (Task 5).

- [ ] **Step 1: Viết test trang (đỏ)**

Create `apps/web/src/app/admin/audit-log/page.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import AuditLogPage from './page';

const useAuditLogMock = vi.fn();
const useAccountsMock = vi.fn();

vi.mock('@/hooks/useAuditLog', () => ({
  useAuditLog: (...args: unknown[]) => useAuditLogMock(...args),
}));
vi.mock('@/hooks/useAccounts', () => ({
  useAccounts: (...args: unknown[]) => useAccountsMock(...args),
}));

const ENTRY = {
  id: 'e1',
  occurredAt: '2026-10-05T03:15:00.000Z',
  actor: { id: 'u1', name: 'Admin A', email: 'a@x.vn' },
  action: 'exam_session.reassign_teacher',
  targetType: 'exam_session',
  targetId: '12345678-aaaa-bbbb-cccc-1234567890ab',
  oldValue: { teacherId: 'aaaaaaaa-1111-2222-3333-444444444444' },
  oldValueTruncated: false,
  newValue: { teacherId: 'bbbbbbbb-1111-2222-3333-444444444444' },
  newValueTruncated: false,
};

function page(items: unknown[], total = items.length) {
  return { data: { items, total, page: 1, pageSize: 50 }, error: null, isLoading: false, isFetching: false, refetch: vi.fn() };
}

beforeEach(() => {
  useAuditLogMock.mockReset();
  useAccountsMock.mockReset();
  useAccountsMock.mockReturnValue({
    data: {
      items: [
        { id: 'u1', name: 'Admin A', email: 'a@x.vn', role: 'admin' },
        { id: 'u2', name: 'GV B', email: 'b@x.vn', role: 'teacher' },
      ],
      total: 2,
    },
  });
});

describe('AuditLogPage trạng thái tải', () => {
  it('hiện khung xương khi đang tải, chưa có bảng', () => {
    useAuditLogMock.mockReturnValue({ data: undefined, error: null, isLoading: true, refetch: vi.fn() });
    render(<AuditLogPage />);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('hiện lỗi kèm nút thử lại thay vì một bảng rỗng', () => {
    const refetch = vi.fn();
    useAuditLogMock.mockReturnValue({ data: undefined, error: new Error('403'), isLoading: false, refetch });
    render(<AuditLogPage />);
    expect(screen.getByText(/không tải được nhật ký/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /thử lại/i }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('hiện trạng thái rỗng khi không có dòng nào', () => {
    useAuditLogMock.mockReturnValue(page([]));
    render(<AuditLogPage />);
    expect(screen.getByText('Không có bản ghi nào khớp bộ lọc')).toBeInTheDocument();
  });
});

describe('AuditLogPage hiển thị', () => {
  it('đọc mỗi dòng bằng một câu tiếng Việt kèm tên người thực hiện', () => {
    useAuditLogMock.mockReturnValue(page([ENTRY]));
    render(<AuditLogPage />);
    const row = screen.getByRole('row', { name: /Admin A/ });
    expect(within(row).getByText(/Chuyển phiên thi sang giảng viên khác/)).toBeInTheDocument();
  });

  it('dòng không có người thực hiện ghi "Hệ thống"', () => {
    useAuditLogMock.mockReturnValue(page([{ ...ENTRY, id: 'e2', actor: null }]));
    render(<AuditLogPage />);
    expect(screen.getByText('Hệ thống')).toBeInTheDocument();
  });

  it('mở rộng một dòng để xem giá trị cũ và mới', () => {
    useAuditLogMock.mockReturnValue(page([ENTRY]));
    render(<AuditLogPage />);
    expect(screen.queryByText(/"teacherId"/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /xem chi tiết/i }));
    expect(screen.getAllByText(/"teacherId"/).length).toBe(2);
  });

  it('giá trị bị cắt thì nói rõ thay vì hiện null', () => {
    useAuditLogMock.mockReturnValue(
      page([{ ...ENTRY, newValue: null, newValueTruncated: true }]),
    );
    render(<AuditLogPage />);
    fireEvent.click(screen.getByRole('button', { name: /xem chi tiết/i }));
    expect(screen.getByText(/quá lớn/i)).toBeInTheDocument();
  });
});

describe('AuditLogPage bộ lọc', () => {
  it('lần gọi đầu không lọc gì, trang 1', () => {
    useAuditLogMock.mockReturnValue(page([ENTRY]));
    render(<AuditLogPage />);
    expect(useAuditLogMock).toHaveBeenCalledWith({ page: 1, pageSize: 50 });
  });

  it('chọn nhóm "Dữ liệu nền" gửi bốn tiền tố và về trang 1', () => {
    useAuditLogMock.mockReturnValue(page([ENTRY], 120));
    render(<AuditLogPage />);
    fireEvent.click(screen.getByRole('button', { name: /trang sau/i }));
    fireEvent.click(screen.getByRole('combobox', { name: 'Lọc theo nhóm hành động' }));
    fireEvent.click(screen.getByRole('option', { name: 'Dữ liệu nền' }));
    expect(useAuditLogMock).toHaveBeenLastCalledWith({
      action: ['semester.', 'room.', 'class.', 'administrative_class.'],
      page: 1,
      pageSize: 50,
    });
  });

  it('chọn một người thực hiện gửi actorId', () => {
    useAuditLogMock.mockReturnValue(page([ENTRY]));
    render(<AuditLogPage />);
    fireEvent.click(screen.getByRole('combobox', { name: 'Lọc theo người thực hiện' }));
    fireEvent.click(screen.getByRole('option', { name: /GV B/ }));
    expect(useAuditLogMock).toHaveBeenLastCalledWith(expect.objectContaining({ actorId: 'u2', page: 1 }));
  });

  it('đặt khoảng ngày gửi from/to', () => {
    useAuditLogMock.mockReturnValue(page([ENTRY]));
    render(<AuditLogPage />);
    fireEvent.change(screen.getByLabelText('Từ ngày'), { target: { value: '2026-10-01' } });
    fireEvent.change(screen.getByLabelText('Đến ngày'), { target: { value: '2026-10-03' } });
    const last = useAuditLogMock.mock.calls.at(-1)![0];
    expect(new Date(last.from).getTime()).toBe(new Date(2026, 9, 1).getTime());
    expect(new Date(last.to).getTime()).toBe(new Date(2026, 9, 4).getTime());
  });

  it('"Xoá bộ lọc" chỉ hiện khi có bộ lọc và đưa mọi thứ về mặc định', () => {
    useAuditLogMock.mockReturnValue(page([ENTRY]));
    render(<AuditLogPage />);
    expect(screen.queryByRole('button', { name: 'Xoá bộ lọc' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Từ ngày'), { target: { value: '2026-10-01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Xoá bộ lọc' }));
    expect(useAuditLogMock).toHaveBeenLastCalledWith({ page: 1, pageSize: 50 });
  });
});

describe('AuditLogPage phân trang', () => {
  it('"Trang sau" bị khoá ở trang cuối và "Trang trước" ở trang đầu', () => {
    useAuditLogMock.mockReturnValue(page([ENTRY], 1));
    render(<AuditLogPage />);
    expect(screen.getByRole('button', { name: /trang trước/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /trang sau/i })).toBeDisabled();
  });

  it('có nhiều trang thì "Trang sau" tăng page', () => {
    useAuditLogMock.mockReturnValue(page([ENTRY], 120));
    render(<AuditLogPage />);
    fireEvent.click(screen.getByRole('button', { name: /trang sau/i }));
    expect(useAuditLogMock).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 }));
  });
});
```

- [ ] **Step 2: Chạy để thấy đỏ**

Run: `pnpm vitest run src/app/admin/audit-log/page.test.tsx`
Expected: FAIL — trang hiện còn là `PlaceholderPage`.

- [ ] **Step 3: Viết `AuditFilters`**

Create `apps/web/src/app/admin/audit-log/_components/AuditFilters.tsx`:

```tsx
'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AUDIT_GROUP_LABELS,
  hasActiveFilters,
  type AuditFilterState,
  type AuditGroup,
} from '@/lib/audit-filters';

export interface ActorOption {
  id: string;
  name: string;
  role: string;
}

interface AuditFiltersProps {
  value: AuditFilterState;
  onChange: (next: AuditFilterState) => void;
  onClear: () => void;
  actors: ActorOption[];
}

const ALL_ACTORS = 'all';

/**
 * Thanh lọc của trang audit log. Điều khiển được (controlled): trang giữ trạng
 * thái để đổi bộ lọc luôn kéo trang về 1 ở đúng một chỗ.
 */
export function AuditFilters({ value, onChange, onClear, actors }: AuditFiltersProps) {
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
      <Select
        value={value.group}
        onValueChange={(next) => onChange({ ...value, group: next as AuditGroup })}
      >
        <SelectTrigger className="lg:w-52" aria-label="Lọc theo nhóm hành động">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(Object.keys(AUDIT_GROUP_LABELS) as AuditGroup[]).map((group) => (
            <SelectItem key={group} value={group}>
              {AUDIT_GROUP_LABELS[group]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={value.actorId ?? ALL_ACTORS}
        onValueChange={(next) => onChange({ ...value, actorId: next === ALL_ACTORS ? null : next })}
      >
        <SelectTrigger className="lg:w-64" aria-label="Lọc theo người thực hiện">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_ACTORS}>Tất cả người thực hiện</SelectItem>
          {actors.map((actor) => (
            <SelectItem key={actor.id} value={actor.id}>
              {actor.name} · {actor.role === 'admin' ? 'Quản trị viên' : 'Giảng viên'}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <label className="flex flex-col gap-1 text-small text-muted-foreground">
        Từ ngày
        <Input
          type="date"
          aria-label="Từ ngày"
          value={value.fromDay}
          onChange={(event) => onChange({ ...value, fromDay: event.target.value })}
          className="lg:w-44"
        />
      </label>
      <label className="flex flex-col gap-1 text-small text-muted-foreground">
        Đến ngày
        <Input
          type="date"
          aria-label="Đến ngày"
          value={value.toDay}
          onChange={(event) => onChange({ ...value, toDay: event.target.value })}
          className="lg:w-44"
        />
      </label>

      {hasActiveFilters(value) && (
        <Button type="button" variant="ghost" onClick={onClear}>
          Xoá bộ lọc
        </Button>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Viết `AuditTable`**

Create `apps/web/src/app/admin/audit-log/_components/AuditTable.tsx`:

```tsx
'use client';

import { Fragment, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { AuditLogEntry } from '@/lib/api/audit-log';
import { ACTOR_SYSTEM_LABEL, describeAuditEntry } from '@/lib/audit-describe';

const DATE_TIME = new Intl.DateTimeFormat('vi-VN', {
  timeZone: 'Asia/Ho_Chi_Minh',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

function Value({
  title,
  value,
  truncated,
}: {
  title: string;
  value: Record<string, unknown> | null;
  truncated: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      <p className="text-small font-semibold text-foreground">{title}</p>
      {truncated ? (
        <p className="text-small italic text-muted-foreground">
          Giá trị quá lớn (hơn 4 KB) nên không hiển thị trong danh sách.
        </p>
      ) : (
        <pre className="max-h-64 overflow-auto rounded-md bg-surface-2 p-3 text-caption">
          {JSON.stringify(value ?? {}, null, 2)}
        </pre>
      )}
    </div>
  );
}

export function AuditTable({ entries }: { entries: AuditLogEntry[] }) {
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());

  function toggle(id: string) {
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead scope="col" className="w-44">Thời gian</TableHead>
            <TableHead scope="col" className="w-56">Người thực hiện</TableHead>
            <TableHead scope="col">Nội dung</TableHead>
            <TableHead scope="col" className="w-12 text-right">
              <span className="sr-only">Chi tiết</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.map((entry) => {
            const expanded = open.has(entry.id);
            return (
              <Fragment key={entry.id}>
                <TableRow>
                  <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground">
                    {DATE_TIME.format(new Date(entry.occurredAt))}
                  </TableCell>
                  <TableCell>
                    {entry.actor ? (
                      <div className="flex flex-col">
                        <span className="font-medium text-foreground">{entry.actor.name}</span>
                        <span className="text-small text-muted-foreground">{entry.actor.email}</span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">{ACTOR_SYSTEM_LABEL}</span>
                    )}
                  </TableCell>
                  <TableCell>{describeAuditEntry(entry)}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-expanded={expanded}
                      aria-label={expanded ? 'Ẩn chi tiết' : 'Xem chi tiết'}
                      onClick={() => toggle(entry.id)}
                    >
                      {expanded ? (
                        <ChevronDown className="h-4 w-4" aria-hidden="true" />
                      ) : (
                        <ChevronRight className="h-4 w-4" aria-hidden="true" />
                      )}
                    </Button>
                  </TableCell>
                </TableRow>
                {expanded && (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={4}>
                      <div className="flex flex-col gap-3 sm:flex-row">
                        <Value title="Trước" value={entry.oldValue} truncated={entry.oldValueTruncated} />
                        <Value title="Sau" value={entry.newValue} truncated={entry.newValueTruncated} />
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
```

- [ ] **Step 5: Viết trang**

Replace `apps/web/src/app/admin/audit-log/page.tsx` bằng:

```tsx
'use client';

import { useState } from 'react';
import { ScrollText } from 'lucide-react';
import { useAccounts } from '@/hooks/useAccounts';
import { useAuditLog } from '@/hooks/useAuditLog';
import { EmptyState } from '@/components/layout/empty-state';
import { PageHeader } from '@/components/layout/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  EMPTY_AUDIT_FILTERS,
  toSearchParams,
  type AuditFilterState,
} from '@/lib/audit-filters';
import { AuditFilters } from './_components/AuditFilters';
import { AuditTable } from './_components/AuditTable';

const PAGE_SIZE = 50;

/**
 * Đọc `audit_log`: ai đổi gì, khi nào. Chỉ đọc — nhật ký không sửa hay xoá được.
 *
 * Trang này để điều tra sự cố và đối chiếu khi giảng viên với quản trị viên nói
 * khác nhau. Nó KHÔNG phải một biện pháp kiểm soát quyền: với một quản trị
 * viên duy nhất, người đọc nhật ký cũng là người bị ghi trong đó (spec §4.2).
 */
export default function AuditLogPage() {
  const [filters, setFilters] = useState<AuditFilterState>(EMPTY_AUDIT_FILTERS);
  const [page, setPage] = useState(1);

  // Người thực hiện là mọi tài khoản có thể ghi nhật ký. Lỗi ở đây không được
  // chặn trang: bộ lọc chỉ mất danh sách người, bảng vẫn dùng được.
  const accounts = useAccounts({ page: 1, pageSize: 100 });
  const actors = (accounts.data?.items ?? []).map((account) => ({
    id: account.id,
    name: account.name,
    role: account.role,
  }));

  const { data, error, isLoading, refetch } = useAuditLog(toSearchParams(filters, page, PAGE_SIZE));

  function changeFilters(next: AuditFilterState) {
    setFilters(next);
    // Đổi bộ lọc khi đang ở trang 3 sẽ rơi vào một trang 3 không tồn tại của
    // tập kết quả mới, và bảng hiện ra rỗng.
    setPage(1);
  }

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Audit log"
        description="Ai đã đổi gì, vào lúc nào. Chỉ đọc: nhật ký không thể sửa hay xoá. Dùng để điều tra khi có sự cố hoặc khi hai bên nói khác nhau."
      />

      <div data-animate className="flex flex-col gap-4">
        <AuditFilters
          value={filters}
          onChange={changeFilters}
          onClear={() => changeFilters(EMPTY_AUDIT_FILTERS)}
          actors={actors}
        />

        {isLoading ? (
          <Card>
            <CardContent className="flex flex-col gap-3 p-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </CardContent>
          </Card>
        ) : error ? (
          <Alert variant="destructive">
            <AlertDescription className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
              <span>Không tải được nhật ký. Hãy thử lại.</span>
              <Button type="button" variant="outline" size="sm" onClick={() => refetch()}>
                Thử lại
              </Button>
            </AlertDescription>
          </Alert>
        ) : (data?.items.length ?? 0) === 0 ? (
          <Card>
            <EmptyState
              icon={ScrollText}
              title="Không có bản ghi nào khớp bộ lọc"
              description="Thử nới khoảng ngày hoặc chọn «Tất cả hành động»."
              tone="muted"
            />
          </Card>
        ) : (
          <>
            <Card className="overflow-hidden">
              <CardContent className="p-0">
                <AuditTable entries={data!.items} />
              </CardContent>
            </Card>
            <div className="flex items-center justify-between gap-3">
              <p className="text-small text-muted-foreground">
                Trang {page} / {totalPages} · {total} bản ghi
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Trang trước
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Trang sau
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Chạy để thấy xanh, rồi chạy cả bộ web**

Run (từ `apps/web`): `pnpm vitest run src/app/admin/audit-log src/lib/audit-describe.test.ts src/lib/audit-filters.test.ts`
Expected: PASS (page: 12 test).

Rồi cả bộ web và kiểm kiểu:

```powershell
pnpm test 2>&1 | Out-File C:/tmp/web-after-b.txt
Select-String C:/tmp/web-after-b.txt -Pattern '^ *Tests |Test Files '
pnpm exec tsc --noEmit
pnpm lint
```

Expected: không test nào đỏ; `tsc` không lỗi (nếu lỗi ở `apiClient.GET('/audit-log'`, schema chưa được sinh lại — quay về Task 3); `lint` không lỗi.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/admin/audit-log
git commit -m "feat(web): trang audit log của admin (lọc, phân trang, câu mô tả tiếng Việt)"
```

---

### Task 7: Kiểm bằng mắt trên trình duyệt thật

**Files:** không sửa file.

Test tự động không chạy được thứ mà người dùng thấy: Radix Select trong trình duyệt thật, bố cục ở màn nhỏ, tiếng Việt có dấu trong ô ngày. Một lượt xem tay là bắt buộc trước khi gọi plan này xong.

- [ ] **Step 1: Chạy API và web cục bộ trên hạ tầng local**

```powershell
cd apps/api
$env:DOTENV_CONFIG_PATH = '.env.test'
Start-Process node -ArgumentList '-r','dotenv/config','dist/src/main.js' -PassThru | Select-Object -ExpandProperty Id | Out-File C:/tmp/api-b.pid
cd ../web
$env:NEXT_PUBLIC_API_URL = 'http://localhost:4000'
pnpm dev
```

Cần một tài khoản admin trong DB local: dùng `apps/api/scripts/make-admin-sql.mjs` (in câu SQL tạo admin) hoặc tài khoản `audit_reader_admin_*@example.com` do e2e vừa tạo (mật khẩu `correct-horse-battery`).

- [ ] **Step 2: Đi qua danh sách kiểm**

Đăng nhập admin, mở `/admin/audit-log`, rồi xác nhận từng điều:
1. Có dòng (e2e Task 2 vừa ghi) và mỗi dòng đọc được thành một câu; dòng `zz…` đọc theo nhánh dự phòng.
2. Chọn "Phiên thi" rồi "Chấm điểm": bảng đổi, số trang về 1.
3. Chọn một người thực hiện; chọn khoảng ngày; "Xoá bộ lọc" đưa về mặc định.
4. Mở rộng một dòng: hai khối "Trước" / "Sau"; dòng `…big.write` báo "Giá trị quá lớn".
5. Thu cửa sổ về ~375 px: bảng cuộn ngang, thanh lọc xếp dọc, không vỡ chữ.
6. Đăng nhập một giảng viên rồi gõ thẳng `/admin/audit-log`: bị chặn (middleware/role), không thấy dữ liệu.

- [ ] **Step 3: Tắt tiến trình của mình**

```powershell
Stop-Process -Id (Get-Content C:/tmp/api-b.pid)
```
và dừng `pnpm dev` (Ctrl+C). Ghi kết quả (đạt/không đạt từng mục) vào mô tả PR.

---

## Tự kiểm lại plan so với spec

- §4.2 `GET /audit-log` (lọc `action` chính xác/tiền tố, `actorId`, `targetType`, `from`, `to`; phân trang giảm dần; trả `{id, occurredAt, actor{id,name,email}, action, targetType, targetId, oldValue, newValue}`; cắt 4 KB; chỉ admin): Task 1–2. **Hai bổ sung nhỏ ngoài spec:** tham số `targetId` (rẻ, có chỉ mục `(target_type, target_id, occurred_at)`, để các trang sau nối "ai đã đổi đối tượng này") và cờ `…Truncated` (giá trị bị cắt phải nói là bị cắt, không để trông như rỗng).
- §4.2 trang `/admin/audit-log` thay placeholder, lọc theo nhóm (dữ liệu nền / phiên thi / chấm điểm), người thực hiện, khoảng ngày; mỗi dòng đọc bằng tiếng Việt: Task 4–6. Chỉ năm hành động đã có được mô tả riêng; hành động mới thêm mục vào `DESCRIBERS` trong plan của chúng, kèm quy ước `targetLabel`.
- §4.2 "không có chỉ mục riêng cho truy vấn chỉ theo ngày, chấp nhận": không thêm chỉ mục (Global Constraints).
- T-AUD-2, T-AUD-3: Task 2. **T-AUD-4 đổi mức từ unit sang e2e**: phép cắt xảy ra trong SQL nên chỉ DB thật mới chứng minh được (Review Focus 3).
- T-AUD-1 ("mỗi thao tác ghi dữ liệu nền để lại đúng một dòng audit") **không** thuộc plan này: nó kiểm các service ghi, nằm ở plan C (semester/room/lớp danh nghĩa), D (lớp) và F (sửa/huỷ phiên).
- Placeholder scan: không có "TBD"/"tương tự Task N"; mọi bước mã có nội dung đầy đủ. Kiểu nhất quán: `AuditLogEntry` (web) khớp `AuditLogEntryView` (API) từng trường; `SearchAuditLogParams.action` là `string[]` ở cả hai đầu; `AUDIT_GROUP_PREFIXES.master` trùng bốn tiền tố mà plan C, D dùng khi đặt tên hành động (`semester.`, `room.`, `class.`, `administrative_class.`).
