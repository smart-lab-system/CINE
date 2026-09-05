# "Quản lý bài thu" Triage Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thay trục mức độ chết (2/3 mức không thể xảy ra) bằng trục dựa trên attendance, thêm phạm vi học kỳ + bộ lọc facet + archive/khép, và đổi bố cục từ hai section chồng dọc sang cột lọc + một bảng thẳng cột.

**Architecture:** Backend thêm 2 cột vòng đời trên `exam_session` và một CTE `attended` vào truy vấn roll-up (quan hệ một-nhiều **thứ tư** — phải pre-aggregate). Frontend tách thành 4 đơn vị: logic mức độ thuần hàm, logic facet thuần hàm, bảng, và cột lọc — `page.tsx` chỉ còn điều phối. Mọi bộ lọc chạy client-side trên một payload không phân trang.

**Tech Stack:** NestJS 10 + TypeORM 0.3 + Postgres (schema từ `dataSource.options.schema`) · Next.js 15 App Router + React 19 + TanStack Query 5 + Tailwind · Jest (api) · Vitest + Testing Library (web) · openapi-typescript sinh `packages/shared/src/api/schema.d.ts`

**Spec:** `docs/superpowers/specs/2026-09-05-submissions-triage-layout-design.md` — plan này lập luận từ spec đó; executor phải đọc cả hai. Mọi `§N` bên dưới trỏ vào spec.

**Nhánh:** `feature/submissions-triage-layout`, đã tạo từ `main`, spec đã commit ở `d99caf2`.

## Global Constraints

- **Schema Postgres** lấy từ `dataSource.options.schema ?? 'examcollect'`. Raw SQL **không hardcode** `examcollect.`.
- **Fan-out:** `exam_session` giờ có **BỐN** quan hệ một-nhiều (`submission`, `enrollment`, `required_deliverable`, `agent_connection_event`). Mọi thứ phải pre-aggregate bằng CTE. `DISTINCT` trong CTE `attended` là thứ chặn fan-out — một SV có thể có hàng chục event connect/disconnect trong một phiên.
- **Bất biến:** `fullySubmittedCount + partialCount + attendedNoSubmissionCount + neverAttendedCount === expectedCount` khi `requiredDeliverableCount > 0`.
- **Định nghĩa roster bất biến** (khớp `AttendanceService.buildView`): `enrollment WHERE course_id = session.course_id AND home_class_id = session.class_id`. Bảng `enrollment` **không có** cột `class_id`.
- **`universe` KHÔNG hợp thêm `attended`** — §3.4. Đây là lỗ hổng có chủ đích, đã ghi trong spec. Đừng "sửa" nó.
- **`student_mssv` là `citext`** ở `submission`, `enrollment` và `agent_connection_event` → so sánh SQL tự case-insensitive, **không** thêm `LOWER()`.
- **Phạm vi teacher:** mọi truy vấn khoá bằng `exam_session.teacher_id`, kể cả bên trong CTE.
- **`COUNT`/`SUM` trả `string`** qua node-postgres; NULL nghĩa là "không có dòng nào". Phải `Number(...)` trước khi rời service.
- **`invalidFileCount` NGỦ** — vẫn trả về từ API, UI **không render**, không sinh lý do (§4.4).
- **Ô trống bị cấm** ở cột Tình trạng (§4.2) — ô trống trông giống lỗi hơn là tin tốt.
- **Copy tiếng Việt** dùng nguyên văn spec §4.1, §4.2, §5.5.
- **File backend < 500 dòng, file page frontend < 500 dòng.**
- **Không đụng trang lobby** `(exam-live)/exam-sessions/[id]` — test của nó phải pass không sửa.
- **Lệnh:** api unit `pnpm --filter api test` · api e2e `pnpm --filter api test:e2e` (**cần `docker compose up -d`**) · web `pnpm --filter web test` · lint `pnpm --filter <pkg> lint`.

---

## File Structure

**Backend — tạo mới**
| File | Trách nhiệm |
|---|---|
| `apps/api/src/database/migrations/1788610800000-AddSessionLifecycleColumns.ts` | 2 cột `archived_at`, `attention_closed_at` |
| `apps/api/src/exam-session/session-lifecycle.service.ts` | Đúng 4 việc: archive/unarchive/close/reopen. Tách riêng vì `exam-session.service.ts` đã 454 dòng — thêm vào đó là vượt ngưỡng 500 |
| `apps/api/test/session-lifecycle.e2e-spec.ts` | E2E cho 4 endpoint |
| `apps/api/test/submission-overview-attendance.e2e-spec.ts` | E2E cho trục mức độ mới + chống fan-out |

**Backend — sửa**
| File | Sửa gì |
|---|---|
| `apps/api/src/exam-session/entities/exam-session.entity.ts` | 2 cột mới |
| `apps/api/src/exam-session/exam-session.controller.ts` | 4 route mới |
| `apps/api/src/exam-session/exam-session.module.ts` | Provide `SessionLifecycleService` |
| `apps/api/src/submission/submission-overview.types.ts` | +6 field, −1 field |
| `apps/api/src/submission/submission-overview.service.ts` | CTE `attended`, join `semester`, phân loại mới |

**Frontend — tạo mới**
| File | Trách nhiệm |
|---|---|
| `apps/web/src/components/ui/tooltip.tsx` | Wrapper Radix, theo đúng pattern shadcn của các file ui khác |
| `apps/web/src/lib/submission-filters.ts` | **Toàn bộ logic facet thuần hàm.** Zero React |
| `apps/web/src/lib/submission-filters.test.ts` | |
| `apps/web/src/app/teacher/submissions/_components/SessionTable.tsx` | Một `<table>`, dòng nhóm, cột Tình trạng, 4 nút icon |
| `apps/web/src/app/teacher/submissions/_components/SessionTable.test.tsx` | |
| `apps/web/src/app/teacher/submissions/_components/FilterRail.tsx` | Cột lọc |
| `apps/web/src/app/teacher/submissions/_components/FilterRail.test.tsx` | |
| `apps/web/src/app/teacher/submissions/_components/RoomFailureBanner.tsx` | Dải cảnh báo hỏng-theo-phòng |

**Frontend — sửa**
| File | Sửa gì |
|---|---|
| `apps/web/package.json` | +`@radix-ui/react-tooltip` |
| `packages/shared/src/api/schema.d.ts` | **Sinh lại**, không sửa tay |
| `apps/web/src/lib/api/submissions.ts` | Type mirror + 4 hàm vòng đời |
| `apps/web/src/hooks/useSubmissionOverview.ts` | 2 hook mutation |
| `apps/web/src/lib/submission-attention.ts` | Viết lại `AttentionReason` + `getAttentionReasons` |
| `apps/web/src/lib/submission-attention.test.ts` | Cập nhật theo trục mới |
| `apps/web/src/app/teacher/submissions/page.tsx` | Rút gọn thành điều phối |
| `apps/web/src/app/teacher/submissions/page.test.tsx` | Cập nhật |

---

## Task 1: Migration + cột vòng đời + 4 endpoint

**Files:**
- Create: `apps/api/src/database/migrations/1788610800000-AddSessionLifecycleColumns.ts`
- Create: `apps/api/src/exam-session/session-lifecycle.service.ts`
- Create: `apps/api/test/session-lifecycle.e2e-spec.ts`
- Modify: `apps/api/src/exam-session/entities/exam-session.entity.ts`
- Modify: `apps/api/src/exam-session/exam-session.controller.ts`
- Modify: `apps/api/src/exam-session/exam-session.module.ts`

**Interfaces:**
- Consumes: `ExamSessionService.findEntityForOwner(id, teacherId): Promise<ExamSessionEntity>` (đã có, dòng 389).
- Produces: `class SessionLifecycleService` với 4 method `archive/unarchive/closeAttention/reopenAttention(id: string, teacherId: string): Promise<void>`; 4 route dưới `/exam-sessions/:id`.

- [ ] **Step 1: Viết migration**

`apps/api/src/database/migrations/1788610800000-AddSessionLifecycleColumns.ts`:

```ts
import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Hai trạng thái vòng đời do giảng viên đặt, tách bạch có chủ đích:
 *
 *  archived_at         — "phiên này không phải việc thật" (nháp, tạo thử).
 *                        Ẩn khỏi CẢ trang.
 *  attention_closed_at — "việc thật này đã xong". Rời mục cần chú ý, vẫn nằm
 *                        trong danh sách theo môn.
 *
 * Cột trên exam_session chứ không phải bảng nối: mỗi phiên có đúng một giảng
 * viên sở hữu (teacher_id), nên không có trạng thái per-user để tách ra.
 *
 * Cả hai nullable và ở nguyên vậy — phiên chưa lưu trữ/chưa khép là phiên bình
 * thường, và mọi phiên đang tồn tại đều thế.
 *
 * attention_closed_at cũng là chỗ module xuất điểm sẽ ghi vào khi nó ra đời —
 * cùng một cột, mọc thêm cò tự động, không phải cơ chế thứ hai (spec §1.3).
 */
export class AddSessionLifecycleColumns1788610800000 implements MigrationInterface {
    name = 'AddSessionLifecycleColumns1788610800000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "examcollect"."exam_session" ADD "archived_at" TIMESTAMP WITH TIME ZONE`);
        await queryRunner.query(`ALTER TABLE "examcollect"."exam_session" ADD "attention_closed_at" TIMESTAMP WITH TIME ZONE`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "examcollect"."exam_session" DROP COLUMN "attention_closed_at"`);
        await queryRunner.query(`ALTER TABLE "examcollect"."exam_session" DROP COLUMN "archived_at"`);
    }
}
```

- [ ] **Step 2: Thêm 2 cột vào entity**

Trong `apps/api/src/exam-session/entities/exam-session.entity.ts`, thêm cạnh `attendance_confirmed_at`:

```ts
  /** Xem AddSessionLifecycleColumns migration cho lý do tách hai cột. */
  @Column({ name: 'archived_at', type: 'timestamptz', nullable: true })
  archivedAt!: Date | null;

  @Column({ name: 'attention_closed_at', type: 'timestamptz', nullable: true })
  attentionClosedAt!: Date | null;
```

- [ ] **Step 3: Viết e2e test thất bại**

`apps/api/test/session-lifecycle.e2e-spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';
import { createTestAccount } from './helpers/create-account';

/**
 * Archive và attention-close: hai trạng thái độc lập, cùng một chủ sở hữu,
 * cùng một luật 404/403 như mọi route phiên thi khác.
 */
describe('Session lifecycle (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let schema: string;

  const stamp = Date.now();
  let token: string;
  let otherToken: string;
  let sessionId: string;

  async function readColumns(id: string) {
    const [row] = await dataSource.query(
      `SELECT archived_at, attention_closed_at FROM ${schema}.exam_session WHERE id = $1`,
      [id],
    );
    return row as { archived_at: Date | null; attention_closed_at: Date | null };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new PostgresExceptionFilter());
    await app.init();
    dataSource = app.get(DataSource);
    schema = (dataSource.options as { schema?: string }).schema ?? 'examcollect';

    const email = `lifecycle_${stamp}@example.com`;
    const teacherId = await createTestAccount(dataSource, {
      email, password: 'correct-horse-battery', role: 'teacher',
    });
    token = (await request(app.getHttpServer()).post('/auth/login')
      .send({ email, password: 'correct-horse-battery' })).body.accessToken;

    const otherEmail = `lifecycle_other_${stamp}@example.com`;
    await createTestAccount(dataSource, {
      email: otherEmail, password: 'correct-horse-battery', role: 'teacher',
    });
    otherToken = (await request(app.getHttpServer()).post('/auth/login')
      .send({ email: otherEmail, password: 'correct-horse-battery' })).body.accessToken;

    const [semester] = await dataSource.query(
      `INSERT INTO ${schema}.semester (name, start_date, end_date)
       VALUES ($1, '2026-01-01', '2026-06-01') RETURNING id`,
      [`Lifecycle Semester ${stamp}`],
    );
    const [course] = await dataSource.query(
      `INSERT INTO ${schema}.course (code, name, semester_id)
       VALUES ($1, 'Lifecycle Course', $2) RETURNING id`,
      [`LC${stamp}`.slice(0, 20), semester.id],
    );
    const [room] = await dataSource.query(
      `INSERT INTO ${schema}.room (name, capacity) VALUES ($1, 30) RETURNING id`,
      [`Lifecycle Room ${stamp}`],
    );
    const [klass] = await dataSource.query(
      `INSERT INTO ${schema}.class (course_id, name, teacher_id) VALUES ($1, 'N01', $2) RETURNING id`,
      [course.id, teacherId],
    );

    const created = await request(app.getHttpServer())
      .post('/exam-sessions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: `Lifecycle ${stamp}`,
        classId: klass.id,
        roomId: room.id,
        examType: 'TK',
        startTime: new Date(Date.now() - 7_200_000).toISOString(),
        endTime: new Date(Date.now() - 3_600_000).toISOString(),
        requiredFilenames: ['Cau1.docx'],
      });
    expect(created.status).toBe(201);
    sessionId = created.body.id;
  }, 60_000);

  afterAll(async () => { await app.close(); });

  it('archive đặt archived_at, unarchive xoá về NULL', async () => {
    const on = await request(app.getHttpServer())
      .post(`/exam-sessions/${sessionId}/archive`).set('Authorization', `Bearer ${token}`);
    expect(on.status).toBe(200);
    expect((await readColumns(sessionId)).archived_at).not.toBeNull();

    const off = await request(app.getHttpServer())
      .delete(`/exam-sessions/${sessionId}/archive`).set('Authorization', `Bearer ${token}`);
    expect(off.status).toBe(200);
    expect((await readColumns(sessionId)).archived_at).toBeNull();
  }, 30_000);

  it('attention-close đặt attention_closed_at, reopen xoá về NULL', async () => {
    await request(app.getHttpServer())
      .post(`/exam-sessions/${sessionId}/attention-close`).set('Authorization', `Bearer ${token}`);
    expect((await readColumns(sessionId)).attention_closed_at).not.toBeNull();

    await request(app.getHttpServer())
      .delete(`/exam-sessions/${sessionId}/attention-close`).set('Authorization', `Bearer ${token}`);
    expect((await readColumns(sessionId)).attention_closed_at).toBeNull();
  }, 30_000);

  it('hai trạng thái độc lập — khép không đụng tới archived và ngược lại', async () => {
    await request(app.getHttpServer())
      .post(`/exam-sessions/${sessionId}/archive`).set('Authorization', `Bearer ${token}`);
    await request(app.getHttpServer())
      .post(`/exam-sessions/${sessionId}/attention-close`).set('Authorization', `Bearer ${token}`);

    let cols = await readColumns(sessionId);
    expect(cols.archived_at).not.toBeNull();
    expect(cols.attention_closed_at).not.toBeNull();

    await request(app.getHttpServer())
      .delete(`/exam-sessions/${sessionId}/archive`).set('Authorization', `Bearer ${token}`);
    cols = await readColumns(sessionId);
    expect(cols.archived_at).toBeNull();
    expect(cols.attention_closed_at).not.toBeNull();

    await request(app.getHttpServer())
      .delete(`/exam-sessions/${sessionId}/attention-close`).set('Authorization', `Bearer ${token}`);
  }, 30_000);

  it('idempotent — archive hai lần vẫn 200 và vẫn chỉ một mốc', async () => {
    await request(app.getHttpServer())
      .post(`/exam-sessions/${sessionId}/archive`).set('Authorization', `Bearer ${token}`);
    const first = (await readColumns(sessionId)).archived_at;

    const again = await request(app.getHttpServer())
      .post(`/exam-sessions/${sessionId}/archive`).set('Authorization', `Bearer ${token}`);
    expect(again.status).toBe(200);
    // Mốc bị ghi đè bởi lần gọi thứ hai là chấp nhận được; điều phải đúng là
    // route không lỗi và cột vẫn không NULL.
    expect((await readColumns(sessionId)).archived_at).not.toBeNull();
    expect(first).not.toBeNull();

    await request(app.getHttpServer())
      .delete(`/exam-sessions/${sessionId}/archive`).set('Authorization', `Bearer ${token}`);
  }, 30_000);

  it('giảng viên khác không đụng được — 404', async () => {
    const res = await request(app.getHttpServer())
      .post(`/exam-sessions/${sessionId}/archive`).set('Authorization', `Bearer ${otherToken}`);
    expect(res.status).toBe(404);
    expect((await readColumns(sessionId)).archived_at).toBeNull();
  }, 30_000);
});
```

- [ ] **Step 4: Chạy test để xác nhận FAIL**

```bash
docker compose up -d
pnpm --filter api test:e2e -- session-lifecycle
```

Expected: FAIL — mọi test 404 ở route archive/attention-close vì chúng chưa tồn tại. (Test cuối cũng "pass vì lý do sai" ở vòng này — nó mong 404 và mọi route đều 404; đó là bình thường, nó chỉ có nghĩa sau khi route tồn tại.)

- [ ] **Step 5: Viết service**

`apps/api/src/exam-session/session-lifecycle.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ExamSessionEntity } from './entities/exam-session.entity';
import { ExamSessionService } from './exam-session.service';

/**
 * Hai trạng thái vòng đời giảng viên tự đặt cho phiên thi của mình.
 *
 * Tách khỏi ExamSessionService có chủ đích: file đó đã ~454 dòng và lo việc
 * tạo/tìm/chốt phiên; đây là bốn phép ghi cột đơn giản, gộp vào chỉ làm file
 * kia vượt ngưỡng 500 dòng của CLAUDE.md mà không được gì.
 *
 * Mọi method đi qua findEntityForOwner trước, nên luật 404/403 giống hệt mọi
 * route phiên thi khác — không có luật quyền riêng ở đây.
 */
@Injectable()
export class SessionLifecycleService {
  constructor(
    @InjectRepository(ExamSessionEntity)
    private readonly sessions: Repository<ExamSessionEntity>,
    private readonly examSessions: ExamSessionService,
  ) {}

  async archive(id: string, teacherId: string): Promise<void> {
    await this.setColumn(id, teacherId, 'archivedAt', new Date());
  }

  async unarchive(id: string, teacherId: string): Promise<void> {
    await this.setColumn(id, teacherId, 'archivedAt', null);
  }

  async closeAttention(id: string, teacherId: string): Promise<void> {
    await this.setColumn(id, teacherId, 'attentionClosedAt', new Date());
  }

  async reopenAttention(id: string, teacherId: string): Promise<void> {
    await this.setColumn(id, teacherId, 'attentionClosedAt', null);
  }

  /**
   * Kiểm quyền sở hữu trước, rồi mới ghi. Gọi lại lần hai trên cùng trạng thái
   * là hợp lệ (idempotent theo nghĩa "kết quả cuối giống nhau") — giảng viên
   * bấm hai lần không phải lỗi.
   */
  private async setColumn(
    id: string,
    teacherId: string,
    column: 'archivedAt' | 'attentionClosedAt',
    value: Date | null,
  ): Promise<void> {
    await this.examSessions.findEntityForOwner(id, teacherId);
    await this.sessions.update(id, { [column]: value });
  }
}
```

- [ ] **Step 6: Đăng ký service + thêm 4 route**

Trong `apps/api/src/exam-session/exam-session.module.ts`: thêm `SessionLifecycleService` vào `providers`.

Trong `apps/api/src/exam-session/exam-session.controller.ts`: thêm `private readonly lifecycle: SessionLifecycleService,` vào constructor, thêm `Delete` vào import từ `@nestjs/common` nếu chưa có, và thêm 4 handler **sau** `@Post(':id/finalize')`:

```ts
  /**
   * "Lưu trữ" — phiên nháp/tạo thử, ẩn khỏi cả trang "Quản lý bài thu".
   * Khác hẳn attention-close bên dưới: cái này nói "không phải việc thật",
   * cái kia nói "việc thật này đã xong". Xem spec §4.3.
   */
  @Post(':id/archive')
  @Roles('teacher')
  @HttpCode(200)
  async archive(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    await this.lifecycle.archive(id, req.user!.sub);
    return { ok: true };
  }

  @Delete(':id/archive')
  @Roles('teacher')
  @HttpCode(200)
  async unarchive(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    await this.lifecycle.unarchive(id, req.user!.sub);
    return { ok: true };
  }

  /**
   * "Khép" — phiên rời mục cần chú ý nhưng vẫn nằm trong danh sách theo môn.
   * Hôm nay chỉ giảng viên bấm; khi module xuất điểm ra đời nó ghi vào CÙNG
   * cột này tự động (spec §1.3).
   */
  @Post(':id/attention-close')
  @Roles('teacher')
  @HttpCode(200)
  async closeAttention(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    await this.lifecycle.closeAttention(id, req.user!.sub);
    return { ok: true };
  }

  @Delete(':id/attention-close')
  @Roles('teacher')
  @HttpCode(200)
  async reopenAttention(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    await this.lifecycle.reopenAttention(id, req.user!.sub);
    return { ok: true };
  }
```

- [ ] **Step 7: Chạy migration rồi chạy test**

```bash
pnpm --filter api migration:run
pnpm --filter api test:e2e -- session-lifecycle
```

Expected: PASS 5/5.

- [ ] **Step 8: Regression + lint + commit**

```bash
pnpm --filter api test
pnpm --filter api lint
git add apps/api/src/database/migrations/1788610800000-AddSessionLifecycleColumns.ts \
        apps/api/src/exam-session/session-lifecycle.service.ts \
        apps/api/src/exam-session/entities/exam-session.entity.ts \
        apps/api/src/exam-session/exam-session.controller.ts \
        apps/api/src/exam-session/exam-session.module.ts \
        apps/api/test/session-lifecycle.e2e-spec.ts
git commit -m "feat(api): archive and attention-close for exam sessions

Two independent lifecycle flags on the owning teacher's session. Archive
means 'not real work' and hides the session everywhere; attention-close
means 'this real work is done'. Grade export will later write the same
attention_closed_at column automatically."
```

---

## Task 2: Trục mức độ theo attendance + học kỳ trong roll-up

**Files:**
- Modify: `apps/api/src/submission/submission-overview.types.ts`
- Modify: `apps/api/src/submission/submission-overview.service.ts`
- Create: `apps/api/test/submission-overview-attendance.e2e-spec.ts`

**Interfaces:**
- Consumes: 2 cột từ Task 1.
- Produces: `SessionOverviewItem` với `semesterId`, `semesterName`, `attendedNoSubmissionCount`, `neverAttendedCount`, `archivedAt`, `attentionClosedAt`; **bỏ** `notSubmittedCount`.

- [ ] **Step 1: Cập nhật type**

Trong `apps/api/src/submission/submission-overview.types.ts`, **xoá** dòng `notSubmittedCount` và thêm:

```ts
  /** Học kỳ của môn — nguồn cho bộ lọc phạm vi (spec §4.3). */
  semesterId: string;
  semesterName: string;

  /**
   * Có ít nhất 1 agent_connection_event cho phiên này, và 0 bài nộp.
   * Mức 🔴: sinh viên có ngồi thi mà không gì về tới — bài có thể đã mất.
   * Đây là ca duy nhất mà lỗi có thể thuộc về hệ thống, không phải sinh viên.
   */
  attendedNoSubmissionCount: number;
  /** Không có event nào và 0 bài nộp. Mức 🟡: vắng thi, việc hành chính. */
  neverAttendedCount: number;

  /** ISO, hoặc null. Xem SessionLifecycleService. */
  archivedAt: string | null;
  attentionClosedAt: string | null;
```

- [ ] **Step 2: Viết e2e test thất bại**

`apps/api/test/submission-overview-attendance.e2e-spec.ts`. Seeding theo đúng pattern `submission-overview.e2e-spec.ts` đã có; phần khác là **thêm event kết nối**.

```ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';
import { createTestAccount } from './helpers/create-account';

/**
 * Trục mức độ mới: tách "chưa nộp" thành "đã vào phòng mà mất bài" (🔴) và
 * "chưa từng vào phòng" (🟡). Nguồn là agent_connection_event — quan hệ
 * một-nhiều THỨ TƯ của exam_session, nên có test riêng chống fan-out.
 */
describe('Submission overview — attendance tiers (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let schema: string;

  const stamp = Date.now();
  let token: string;
  let teacherId: string;
  let courseId: string;
  let classId: string;
  let roomId: string;

  const ROSTER = ['A', 'B', 'C', 'D'].map((s) => `AT${stamp}${s}`.slice(0, 20));

  async function createSession(name: string, filenames: string[]) {
    const res = await request(app.getHttpServer())
      .post('/exam-sessions').set('Authorization', `Bearer ${token}`)
      .send({
        name, classId, roomId, examType: 'TK',
        startTime: new Date(Date.now() - 7_200_000).toISOString(),
        endTime: new Date(Date.now() - 3_600_000).toISOString(),
        requiredFilenames: filenames,
      });
    expect(res.status).toBe(201);
    return {
      id: res.body.id as string,
      deliverableIds: (res.body.requiredDeliverables as { id: string }[]).map((d) => d.id),
    };
  }

  /** Trigger validate_submission_lifecycle cấm INSERT thẳng 'collected'. */
  async function collect(sessionId: string, deliverableId: string, mssv: string) {
    const [row] = await dataSource.query(
      `INSERT INTO ${schema}.submission
         (exam_session_id, required_deliverable_id, student_mssv, student_name_input,
          home_class_id, home_teacher_id, status)
       VALUES ($1,$2,$3,$4,$5,$6,'received') RETURNING id`,
      [sessionId, deliverableId, mssv, `SV ${mssv}`, classId, teacherId],
    );
    await dataSource.query(`UPDATE ${schema}.submission SET status='validated' WHERE id=$1`, [row.id]);
    await dataSource.query(`UPDATE ${schema}.submission SET status='collected' WHERE id=$1`, [row.id]);
  }

  async function connect(sessionId: string, mssv: string, times = 1) {
    for (let i = 0; i < times; i += 1) {
      await dataSource.query(
        `INSERT INTO ${schema}.agent_connection_event (exam_session_id, student_mssv, event_type)
         VALUES ($1, $2, $3)`,
        [sessionId, mssv, i % 2 === 0 ? 'connected' : 'disconnected'],
      );
    }
  }

  async function overview(id: string) {
    const res = await request(app.getHttpServer())
      .get('/submissions/overview').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const found = (res.body.items as Record<string, any>[]).find((i) => i.id === id);
    if (!found) throw new Error(`session ${id} missing from overview`);
    return found;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new PostgresExceptionFilter());
    await app.init();
    dataSource = app.get(DataSource);
    schema = (dataSource.options as { schema?: string }).schema ?? 'examcollect';

    const email = `attend_${stamp}@example.com`;
    teacherId = await createTestAccount(dataSource, {
      email, password: 'correct-horse-battery', role: 'teacher',
    });
    token = (await request(app.getHttpServer()).post('/auth/login')
      .send({ email, password: 'correct-horse-battery' })).body.accessToken;

    const [semester] = await dataSource.query(
      `INSERT INTO ${schema}.semester (name, start_date, end_date)
       VALUES ($1, '2026-09-01', '2027-01-15') RETURNING id`,
      [`Attend Semester ${stamp}`],
    );
    const [course] = await dataSource.query(
      `INSERT INTO ${schema}.course (code, name, semester_id)
       VALUES ($1, 'Attend Course', $2) RETURNING id`,
      [`AT${stamp}`.slice(0, 20), semester.id],
    );
    courseId = course.id;
    const [room] = await dataSource.query(
      `INSERT INTO ${schema}.room (name, capacity) VALUES ($1, 40) RETURNING id`,
      [`Attend Room ${stamp}`],
    );
    roomId = room.id;
    const [klass] = await dataSource.query(
      `INSERT INTO ${schema}.class (course_id, name, teacher_id) VALUES ($1, 'N01', $2) RETURNING id`,
      [courseId, teacherId],
    );
    classId = klass.id;

    for (const mssv of ROSTER) {
      await dataSource.query(
        `INSERT INTO ${schema}.enrollment
           (student_mssv, student_name, course_id, home_class_id, home_teacher_id)
         VALUES ($1,$2,$3,$4,$5)`,
        [mssv, `SV ${mssv}`, courseId, classId, teacherId],
      );
    }
  }, 60_000);

  afterAll(async () => { await app.close(); });

  it('SV có event và 0 bài → attendedNoSubmission, KHÔNG phải neverAttended', async () => {
    const s = await createSession(`Attended ${stamp}`, ['Cau1.docx']);
    await connect(s.id, ROSTER[0]);

    const item = await overview(s.id);
    expect(item.attendedNoSubmissionCount).toBe(1);
    expect(item.neverAttendedCount).toBe(3);
    expect(item.expectedCount).toBe(4);
  }, 30_000);

  it('SV không event và 0 bài → neverAttended', async () => {
    const s = await createSession(`NeverAttended ${stamp}`, ['Cau1.docx']);

    const item = await overview(s.id);
    expect(item.attendedNoSubmissionCount).toBe(0);
    expect(item.neverAttendedCount).toBe(4);
  }, 30_000);

  it('SV nộp thiếu → partial, bất kể có event hay không', async () => {
    const s = await createSession(`Partial ${stamp}`, ['Cau1.docx', 'Cau2.docx']);
    await connect(s.id, ROSTER[0]);
    await collect(s.id, s.deliverableIds[0], ROSTER[0]);   // có event, nộp 1/2
    await collect(s.id, s.deliverableIds[0], ROSTER[1]);   // không event, nộp 1/2

    const item = await overview(s.id);
    expect(item.partialCount).toBe(2);
    expect(item.attendedNoSubmissionCount).toBe(0);
    expect(item.neverAttendedCount).toBe(2);
  }, 30_000);

  it('CHỐNG FAN-OUT: 10 event của cùng 1 SV vẫn chỉ đếm là 1', async () => {
    const s = await createSession(`Fanout ${stamp}`, ['Cau1.docx']);
    await connect(s.id, ROSTER[0], 10);

    const item = await overview(s.id);
    // Không có DISTINCT trong CTE attended, universe sẽ nhân lên 10 lần và
    // expectedCount vọt lên 13 thay vì 4.
    expect(item.attendedNoSubmissionCount).toBe(1);
    expect(item.expectedCount).toBe(4);
    expect(item.neverAttendedCount).toBe(3);
  }, 30_000);

  it('bất biến: 4 nhóm cộng lại bằng expectedCount', async () => {
    const s = await createSession(`Invariant ${stamp}`, ['Cau1.docx', 'Cau2.docx']);
    await connect(s.id, ROSTER[0]);
    await collect(s.id, s.deliverableIds[0], ROSTER[1]);
    await collect(s.id, s.deliverableIds[1], ROSTER[1]);   // đủ 2/2
    await collect(s.id, s.deliverableIds[0], ROSTER[2]);   // thiếu 1/2

    const item = await overview(s.id);
    expect(item.fullySubmittedCount).toBe(1);
    expect(item.partialCount).toBe(1);
    expect(item.attendedNoSubmissionCount).toBe(1);
    expect(item.neverAttendedCount).toBe(1);
    expect(
      item.fullySubmittedCount + item.partialCount +
      item.attendedNoSubmissionCount + item.neverAttendedCount,
    ).toBe(item.expectedCount);
  }, 30_000);

  it('trả về học kỳ và hai cột vòng đời', async () => {
    const s = await createSession(`Meta ${stamp}`, ['Cau1.docx']);

    let item = await overview(s.id);
    expect(item.semesterName).toBe(`Attend Semester ${stamp}`);
    expect(item.semesterId).toEqual(expect.any(String));
    expect(item.archivedAt).toBeNull();
    expect(item.attentionClosedAt).toBeNull();
    expect(item.notSubmittedCount).toBeUndefined();

    await request(app.getHttpServer())
      .post(`/exam-sessions/${s.id}/archive`).set('Authorization', `Bearer ${token}`);
    item = await overview(s.id);
    // Lọc là việc của client — API vẫn trả phiên đã lưu trữ, kèm mốc.
    expect(item.archivedAt).toEqual(expect.any(String));
    expect(item.neverAttendedCount).toBe(4);
  }, 30_000);
});
```

- [ ] **Step 3: Chạy test để xác nhận FAIL**

```bash
pnpm --filter api test:e2e -- submission-overview-attendance
```

Expected: FAIL — `attendedNoSubmissionCount` là `undefined` vì service chưa trả field đó.

- [ ] **Step 4: Sửa truy vấn**

Trong `apps/api/src/submission/submission-overview.service.ts`:

Thêm vào `OverviewRawRow`:
```ts
  semester_id: string;
  semester_name: string;
  attended_no_submission: string | null;
  never_attended: string | null;
  archived_at: Date | null;
  attention_closed_at: Date | null;
```
và **xoá** `not_submitted`.

Thêm CTE `attended` **ngay sau** `roster_students`:

```sql
      attended AS (
        -- Một dòng mỗi (phiên, SV từng kết nối). DISTINCT ở đây là thứ chặn
        -- fan-out: một sinh viên có hàng chục event connect/disconnect trong
        -- một phiên, và agent_connection_event là quan hệ một-nhiều THỨ TƯ
        -- của exam_session.
        SELECT DISTINCT a.exam_session_id, a.student_mssv
        FROM ${schema}.agent_connection_event a
        JOIN ${schema}.exam_session s ON s.id = a.exam_session_id
        WHERE s.teacher_id = $1
      ),
```

Sửa `universe` — thêm `LEFT JOIN attended` ở đúng grain (phiên, SV), một-một nên không fan-out:

```sql
      universe AS (
        SELECT COALESCE(r.exam_session_id, p.exam_session_id) AS exam_session_id,
               COALESCE(p.collected_files, 0)                 AS collected_files,
               COALESCE(p.invalid_files, 0)                   AS invalid_files,
               (att.student_mssv IS NOT NULL)                 AS ever_attended
        FROM roster_students r
        FULL OUTER JOIN per_student p
          ON p.exam_session_id = r.exam_session_id
         AND p.student_mssv    = r.student_mssv
        LEFT JOIN attended att
          ON att.exam_session_id = COALESCE(r.exam_session_id, p.exam_session_id)
         AND att.student_mssv    = COALESCE(r.student_mssv,   p.student_mssv)
      ),
```

Trong `per_session`, **thay** dòng `not_submitted` bằng hai dòng:

```sql
               COUNT(*) FILTER (
                 WHERE u.collected_files = 0 AND u.invalid_files = 0
                   AND u.ever_attended
               ) AS attended_no_submission,
               COUNT(*) FILTER (
                 WHERE u.collected_files = 0 AND u.invalid_files = 0
                   AND NOT u.ever_attended
               ) AS never_attended,
```

Trong câu `SELECT` cuối: thêm `JOIN ${schema}.semester sem ON sem.id = c.semester_id` và các cột
`sem.id AS semester_id, sem.name AS semester_name, s.archived_at, s.attention_closed_at`.

Trong phần `.map(...)`: **bỏ** `notSubmittedCount`, thêm:

```ts
      semesterId: row.semester_id,
      semesterName: row.semester_name,
      attendedNoSubmissionCount: toCount(row.attended_no_submission),
      neverAttendedCount: toCount(row.never_attended),
      archivedAt: row.archived_at ? new Date(row.archived_at).toISOString() : null,
      attentionClosedAt: row.attention_closed_at
        ? new Date(row.attention_closed_at).toISOString() : null,
```

- [ ] **Step 5: Chạy test để xác nhận PASS**

```bash
pnpm --filter api test:e2e -- submission-overview-attendance
pnpm --filter api test:e2e -- submission-overview
```

Expected: file mới PASS 6/6. File cũ `submission-overview.e2e-spec.ts` sẽ **FAIL ở các assertion `notSubmittedCount`** — đó là đúng, field đó đã bị bỏ. Sửa các assertion đó sang `neverAttendedCount` (fixture cũ không tạo event nào, nên mọi "chưa nộp" cũ giờ là "chưa từng vào phòng"). Đây là **giá trị kỳ vọng đổi vì hành vi đổi có chủ đích**, không phải bẻ test cho pass — ghi rõ trong report.

- [ ] **Step 6: Regression + lint + commit**

```bash
pnpm --filter api test
pnpm --filter api lint
git add apps/api/src/submission/submission-overview.types.ts \
        apps/api/src/submission/submission-overview.service.ts \
        apps/api/test/submission-overview-attendance.e2e-spec.ts \
        apps/api/test/submission-overview.e2e-spec.ts
git commit -m "feat(api): split not-submitted into attended vs never-attended

agent_connection_event is exam_session's fourth one-to-many relation, so it
joins as a pre-aggregated DISTINCT CTE. A student who sat the exam and has no
files is a different problem from one who never showed up: the first may have
lost work to the agent, the second is an administrative absence."
```

---

## Task 3: Sinh lại schema + API client + hook vòng đời

**Files:**
- Modify: `packages/shared/src/api/schema.d.ts` (**sinh lại**)
- Modify: `apps/web/src/lib/api/submissions.ts`
- Modify: `apps/web/src/hooks/useSubmissionOverview.ts`

**Interfaces:**
- Produces: `SessionOverviewItem` (web mirror, 24 field); `archiveSession`, `unarchiveSession`, `closeAttention`, `reopenAttention` — tất cả `(examSessionId: string) => Promise<void>`; `useArchiveSession()`, `useCloseAttention()` trả `useMutation` với biến thể `{ id: string; on: boolean }`.

- [ ] **Step 1: Sinh lại schema (cần API chạy — verify trước, đừng tin)**

```bash
docker compose up -d
pnpm --filter api dev &          # đợi log "Nest application successfully started"
curl -s http://localhost:4000/api-docs-json | grep -c "attention-close"
```
Expected: `> 0`. Nếu `0` thì API chưa nhận route mới — kiểm tra lại Task 1 trước khi sinh.

```bash
pnpm --filter @cine/shared generate:api-client
```

Không sửa tay file này. Nếu diff chạm endpoint không liên quan thì đó là drift có sẵn — commit nguyên bản và ghi vào report.

- [ ] **Step 2: Cập nhật type mirror + thêm 4 hàm**

Trong `apps/web/src/lib/api/submissions.ts`, trong `interface SessionOverviewItem`: **xoá** `notSubmittedCount`, thêm 6 field khớp Task 2 (`semesterId`, `semesterName`, `attendedNoSubmissionCount`, `neverAttendedCount`, `archivedAt`, `attentionClosedAt` — tên và kiểu y hệt backend).

Thêm vào cuối file:

```ts
/**
 * Bốn thao tác vòng đời. Không hàm nào trả dữ liệu — trang gọi xong thì
 * invalidate query overview, vì mọi con số roll-up có thể đổi theo.
 */
async function lifecycle(path: string, method: 'POST' | 'DELETE', id: string): Promise<void> {
  const call = method === 'POST' ? apiClient.POST : apiClient.DELETE;
  const { error, response } = await call(`/exam-sessions/{id}/${path}` as never, {
    params: { path: { id } },
  } as never);
  throwIfFailed(error, response);
}

export const archiveSession = (id: string) => lifecycle('archive', 'POST', id);
export const unarchiveSession = (id: string) => lifecycle('archive', 'DELETE', id);
export const closeAttention = (id: string) => lifecycle('attention-close', 'POST', id);
export const reopenAttention = (id: string) => lifecycle('attention-close', 'DELETE', id);
```

- [ ] **Step 3: Thêm 2 hook mutation**

Trong `apps/web/src/hooks/useSubmissionOverview.ts`:

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  archiveSession, unarchiveSession, closeAttention, reopenAttention,
} from '@/lib/api/submissions';

/**
 * `on: true` bật trạng thái, `false` gỡ. Một hook cho cả hai chiều vì nút trên
 * bảng cũng là một nút đảo trạng thái, không phải hai nút khác nhau.
 *
 * Invalidate cả overview: lưu trữ/khép đổi cả số đếm ở cột lọc lẫn danh sách.
 */
export function useArchiveSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, on }: { id: string; on: boolean }) =>
      on ? archiveSession(id) : unarchiveSession(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['submissions', 'overview'] });
    },
  });
}

export function useCloseAttention() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, on }: { id: string; on: boolean }) =>
      on ? closeAttention(id) : reopenAttention(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['submissions', 'overview'] });
    },
  });
}
```

- [ ] **Step 4: Typecheck + lint + commit**

```bash
pnpm --filter web exec tsc --noEmit
pnpm --filter web lint
```
Expected: lỗi ở `submission-attention.ts` và `page.tsx` vì chúng còn dùng `notSubmittedCount` — **đó là đúng**, Task 4 và 8 sửa. Ghi lại danh sách lỗi trong report. Lỗi có sẵn từ trước ở `read-workbook.test.ts` không tính.

```bash
git add packages/shared/src/api/schema.d.ts apps/web/src/lib/api/submissions.ts \
        apps/web/src/hooks/useSubmissionOverview.ts
git commit -m "feat(web): api client + hooks for session lifecycle"
```

---

## Task 4: Viết lại trục mức độ ở frontend

**Files:**
- Modify: `apps/web/src/lib/submission-attention.ts`
- Modify: `apps/web/src/lib/submission-attention.test.ts`

**Interfaces:**
- Consumes: `SessionOverviewItem` (Task 3).
- Produces: `type AttentionKind`; `AttentionReason { kind, count, label, tone, priority }`; `getAttentionReasons(item, now)`; giữ nguyên `SUBMISSION_GRACE_MS`, `SessionPhase`, `PHASE_LABELS`, `getSessionPhase`, `hasRatio`, `compareSessions`, `SessionGroup`, `groupByCourseClass`.

- [ ] **Step 1: Cập nhật test**

Trong `apps/web/src/lib/submission-attention.test.ts`: trong helper `make()`, **xoá** `notSubmittedCount`, thêm `attendedNoSubmissionCount: 0`, `neverAttendedCount: 0`, `semesterId: 'sem-1'`, `semesterName: 'Học kỳ 1 2026-2027'`, `archivedAt: null`, `attentionClosedAt: null`.

Thay describe `getAttentionReasons` bằng:

```ts
describe('getAttentionReasons', () => {
  it('phiên đủ bài không có lý do nào', () => {
    expect(getAttentionReasons(make(), NOW)).toEqual([]);
  });

  it('ba mức đúng thứ tự ưu tiên: vào phòng mất bài, thiếu file, vắng thi', () => {
    const item = make({
      attendedNoSubmissionCount: 2,
      partialCount: 3,
      neverAttendedCount: 5,
      fullySubmittedCount: 30,
    });
    const reasons = getAttentionReasons(item, NOW);

    expect(reasons.map((r) => r.kind)).toEqual([
      'attended-no-submission', 'partial', 'never-attended',
    ]);
    expect(reasons.map((r) => r.priority)).toEqual([1, 2, 3]);
    expect(reasons[0].label).toBe('2 sinh viên vào phòng nhưng không có bài');
    expect(reasons[1].label).toBe('3 sinh viên nộp thiếu file');
    expect(reasons[2].label).toBe('5 sinh viên vắng thi');
    expect(reasons.map((r) => r.tone)).toEqual(['danger', 'warning', 'caution']);
  });

  it('phiên đã lưu trữ không bao giờ có lý do, dù số liệu xấu', () => {
    const item = make({
      archivedAt: '2026-09-01T00:00:00.000Z',
      attendedNoSubmissionCount: 9,
      fullySubmittedCount: 0,
    });
    expect(getAttentionReasons(item, NOW)).toEqual([]);
  });

  it('phiên đã khép không bao giờ có lý do, dù số liệu xấu', () => {
    const item = make({
      attentionClosedAt: '2026-09-01T00:00:00.000Z',
      attendedNoSubmissionCount: 9,
      fullySubmittedCount: 0,
    });
    expect(getAttentionReasons(item, NOW)).toEqual([]);
  });

  it('trong grace period: không lý do nào', () => {
    const item = make({
      endTime: new Date(NOW - 60_000).toISOString(),
      neverAttendedCount: 5,
      fullySubmittedCount: 35,
    });
    expect(getAttentionReasons(item, NOW)).toEqual([]);
  });

  it('rosterKnown false: không lý do nào', () => {
    expect(getAttentionReasons(make({ rosterKnown: false }), NOW)).toEqual([]);
  });

  it('requiredDeliverableCount 0: không lý do nào', () => {
    expect(getAttentionReasons(make({ requiredDeliverableCount: 0 }), NOW)).toEqual([]);
  });

  it('draft và cancelled: không bao giờ có lý do', () => {
    const shape = { neverAttendedCount: 40, fullySubmittedCount: 0 };
    expect(getAttentionReasons(make({ status: 'draft', ...shape }), NOW)).toEqual([]);
    expect(getAttentionReasons(make({ status: 'cancelled', ...shape }), NOW)).toEqual([]);
  });

  it('invalidFileCount KHÔNG sinh lý do — nó đang ngủ', () => {
    const item = make({ invalidFileCount: 7, fullySubmittedCount: 40 });
    expect(getAttentionReasons(item, NOW)).toEqual([]);
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận FAIL**

```bash
pnpm --filter web test -- submission-attention
```
Expected: FAIL — nhãn cũ ("N sinh viên chưa nộp") và thiếu `tone`.

- [ ] **Step 3: Implement**

Trong `apps/web/src/lib/submission-attention.ts`, thay khối `AttentionReason` + `getAttentionReasons`:

```ts
export type AttentionKind = 'attended-no-submission' | 'partial' | 'never-attended';

export interface AttentionReason {
  kind: AttentionKind;
  count: number;
  label: string;
  /** Ánh xạ sang màu ở tầng UI. Không dùng BadgeProps nữa: bảng dùng chấm
   *  tròn + chữ, không dùng pill (spec §5.4). */
  tone: 'danger' | 'warning' | 'caution';
  /** 1 gấp nhất. Bảng ưu tiên spec §1.2. */
  priority: 1 | 2 | 3;
}

/**
 * Ba cổng chặn, theo đúng thứ tự:
 *  1. archived/closed  — giảng viên đã nói "đừng nhắc nữa" (spec §1.3)
 *  2. phải là `ended`  — grace period còn đang nhận file, kết luận lúc này là
 *                        báo động giả
 *  3. hasRatio         — không biết roster hoặc chưa khai file bắt buộc thì
 *                        không thể nói ai thiếu
 *
 * `invalidFileCount` KHÔNG sinh lý do: chưa luồng production nào tạo ra
 * status 'invalid' (TODO ở submission.service.ts). Đừng để giảng viên tin hệ
 * thống đang canh một thứ nó không canh — spec §4.4.
 */
export function getAttentionReasons(
  item: SessionOverviewItem,
  now: number,
): AttentionReason[] {
  if (item.archivedAt !== null || item.attentionClosedAt !== null) return [];
  if (getSessionPhase(item, now) !== 'ended') return [];
  if (!hasRatio(item)) return [];

  const reasons: AttentionReason[] = [];
  if (item.attendedNoSubmissionCount > 0) {
    reasons.push({
      kind: 'attended-no-submission',
      count: item.attendedNoSubmissionCount,
      label: `${item.attendedNoSubmissionCount} sinh viên vào phòng nhưng không có bài`,
      tone: 'danger',
      priority: 1,
    });
  }
  if (item.partialCount > 0) {
    reasons.push({
      kind: 'partial',
      count: item.partialCount,
      label: `${item.partialCount} sinh viên nộp thiếu file`,
      tone: 'warning',
      priority: 2,
    });
  }
  if (item.neverAttendedCount > 0) {
    reasons.push({
      kind: 'never-attended',
      count: item.neverAttendedCount,
      label: `${item.neverAttendedCount} sinh viên vắng thi`,
      tone: 'caution',
      priority: 3,
    });
  }
  return reasons;
}
```

Xoá `PHASE_VARIANTS` và import `BadgeProps` nếu không còn ai dùng (bảng dùng chữ, không dùng badge — spec §5.4). Nếu `PHASE_VARIANTS` còn được import ở đâu đó, để lại và ghi vào report.

- [ ] **Step 4: Chạy test + commit**

```bash
pnpm --filter web test -- submission-attention
pnpm --filter web lint
git add apps/web/src/lib/submission-attention.ts apps/web/src/lib/submission-attention.test.ts
git commit -m "feat(web): attention tiers keyed on attendance, not on 'not submitted'

Two of the three old tiers could never fire: nothing produces invalid
submissions, and 93% of sessions declare one required file so 'partial' is
impossible. The new axis asks whether the student was in the room."
```

---

## Task 5: Logic facet thuần hàm

**Files:**
- Create: `apps/web/src/lib/submission-filters.ts`
- Create: `apps/web/src/lib/submission-filters.test.ts`

**Interfaces:**
- Consumes: `SessionOverviewItem`, `getAttentionReasons`, `AttentionKind`.
- Produces:
  - `interface FilterState { semesterId: string | null; kinds: AttentionKind[]; complete: boolean; examTypes: string[]; rooms: string[]; showArchived: boolean; showClosed: boolean; }`
  - `const EMPTY_FILTERS: FilterState`
  - `pickDefaultSemester(items, now): string | null`
  - `applyFilters(items, filters, now): SessionOverviewItem[]`
  - `interface FacetOption { value: string; label: string; count: number }`
  - `buildFacets(items, filters, now): { semesters, kinds, examTypes, rooms, archivedCount, closedCount }`
  - `detectRoomFailure(items, now): { room: string; sessionCount: number; courseCount: number } | null`

- [ ] **Step 1: Viết test thất bại**

`apps/web/src/lib/submission-filters.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  EMPTY_FILTERS, applyFilters, buildFacets, detectRoomFailure, pickDefaultSemester,
} from './submission-filters';
import type { SessionOverviewItem } from './api/submissions';

const NOW = new Date('2026-09-05T10:00:00Z').getTime();
const HOUR = 3_600_000;

function make(o: Partial<SessionOverviewItem> = {}): SessionOverviewItem {
  return {
    id: 's1', name: 'Phiên', code: 'P1',
    courseId: 'c1', courseName: 'CSDL', classId: 'k1', className: 'N01',
    roomName: 'A3-01', examType: 'GK',
    startTime: new Date(NOW - 4 * HOUR).toISOString(),
    endTime: new Date(NOW - 2 * HOUR).toISOString(),
    status: 'completed',
    semesterId: 'sem-1', semesterName: 'Học kỳ 1 2026-2027',
    requiredDeliverableCount: 2, expectedCount: 10, rosterKnown: true,
    fullySubmittedCount: 10, partialCount: 0,
    attendedNoSubmissionCount: 0, neverAttendedCount: 0, invalidFileCount: 0,
    archivedAt: null, attentionClosedAt: null,
    ...o,
  };
}

describe('pickDefaultSemester', () => {
  it('chọn học kỳ đang chạy', () => {
    // Học kỳ suy ra từ chính các phiên: kỳ nào có phiên bao trùm hôm nay.
    const items = [
      make({ id: 'a', semesterId: 'cu', startTime: new Date(NOW - 200 * 24 * HOUR).toISOString(),
             endTime: new Date(NOW - 199 * 24 * HOUR).toISOString() }),
      make({ id: 'b', semesterId: 'nay' }),
    ];
    expect(pickDefaultSemester(items, NOW)).toBe('nay');
  });

  it('không kỳ nào đang chạy → kỳ gần nhất đã qua', () => {
    const items = [
      make({ id: 'a', semesterId: 'cu-hon', startTime: new Date(NOW - 400 * 24 * HOUR).toISOString(),
             endTime: new Date(NOW - 399 * 24 * HOUR).toISOString() }),
      make({ id: 'b', semesterId: 'gan-hon', startTime: new Date(NOW - 100 * 24 * HOUR).toISOString(),
             endTime: new Date(NOW - 99 * 24 * HOUR).toISOString() }),
    ];
    expect(pickDefaultSemester(items, NOW)).toBe('gan-hon');
  });

  it('rỗng → null', () => {
    expect(pickDefaultSemester([], NOW)).toBeNull();
  });
});

describe('applyFilters', () => {
  const base = [
    make({ id: 'a', roomName: 'A3-01', examType: 'GK', neverAttendedCount: 2, fullySubmittedCount: 8 }),
    make({ id: 'b', roomName: 'A3-02', examType: 'CK', attendedNoSubmissionCount: 1, fullySubmittedCount: 9 }),
    make({ id: 'c', roomName: 'A3-01', examType: 'GK' }),
    make({ id: 'd', roomName: 'A3-01', examType: 'TK', archivedAt: '2026-09-01T00:00:00.000Z' }),
    make({ id: 'e', roomName: 'A3-02', examType: 'TK', attentionClosedAt: '2026-09-01T00:00:00.000Z' }),
  ];

  it('mặc định: ẩn archived, HIỆN closed', () => {
    const ids = applyFilters(base, EMPTY_FILTERS, NOW).map((i) => i.id);
    expect(ids).not.toContain('d');
    expect(ids).toContain('e');
  });

  it('showArchived bật thì archived hiện lại', () => {
    const ids = applyFilters(base, { ...EMPTY_FILTERS, showArchived: true }, NOW).map((i) => i.id);
    expect(ids).toContain('d');
  });

  it('archived thắng closed: phiên vừa archived vừa closed vẫn bị ẩn', () => {
    const both = make({
      id: 'f', archivedAt: '2026-09-01T00:00:00.000Z',
      attentionClosedAt: '2026-09-01T00:00:00.000Z',
    });
    const ids = applyFilters([both], { ...EMPTY_FILTERS, showClosed: true }, NOW).map((i) => i.id);
    expect(ids).toEqual([]);
  });

  it('trong một nhóm là OR: hai phòng cùng lúc', () => {
    const ids = applyFilters(base, { ...EMPTY_FILTERS, rooms: ['A3-01', 'A3-02'] }, NOW)
      .map((i) => i.id);
    expect(ids.sort()).toEqual(['a', 'b', 'c', 'e']);
  });

  it('giữa các nhóm là AND: phòng A3-01 VÀ loại GK', () => {
    const ids = applyFilters(base, { ...EMPTY_FILTERS, rooms: ['A3-01'], examTypes: ['GK'] }, NOW)
      .map((i) => i.id);
    expect(ids.sort()).toEqual(['a', 'c']);
  });

  it('lọc theo mức độ dùng lý do thật, không dùng con số thô', () => {
    const ids = applyFilters(base, { ...EMPTY_FILTERS, kinds: ['attended-no-submission'] }, NOW)
      .map((i) => i.id);
    expect(ids).toEqual(['b']);
  });

  it('lọc "đã đủ" lấy phiên ended không lý do nào', () => {
    const ids = applyFilters(base, { ...EMPTY_FILTERS, complete: true }, NOW).map((i) => i.id);
    expect(ids).toContain('c');
    expect(ids).not.toContain('a');
  });
});

describe('buildFacets', () => {
  const base = [
    make({ id: 'a', roomName: 'A3-01', examType: 'GK', neverAttendedCount: 2, fullySubmittedCount: 8 }),
    make({ id: 'b', roomName: 'A3-02', examType: 'CK', partialCount: 1, fullySubmittedCount: 9 }),
  ];

  it('số đếm phản ánh các bộ lọc KHÁC đang bật', () => {
    const facets = buildFacets(base, { ...EMPTY_FILTERS, rooms: ['A3-01'] }, NOW);
    const partial = facets.kinds.find((k) => k.value === 'partial');
    expect(partial?.count).toBe(0);
    const never = facets.kinds.find((k) => k.value === 'never-attended');
    expect(never?.count).toBe(1);
  });

  it('số đếm của chính nhóm phòng KHÔNG bị chính nó thu hẹp', () => {
    // Nếu không, bật A3-01 sẽ làm A3-02 về 0 và không bao giờ chọn thêm được.
    const facets = buildFacets(base, { ...EMPTY_FILTERS, rooms: ['A3-01'] }, NOW);
    expect(facets.rooms.find((r) => r.value === 'A3-02')?.count).toBe(1);
  });

  it('nhóm chỉ có 1 giá trị trả về mảng rỗng để UI không render', () => {
    const one = [make({ id: 'x', roomName: 'A3-01' }), make({ id: 'y', roomName: 'A3-01' })];
    expect(buildFacets(one, EMPTY_FILTERS, NOW).rooms).toEqual([]);
  });
});

describe('detectRoomFailure', () => {
  const red = (id: string, room: string, courseId: string) =>
    make({ id, roomName: room, courseId, attendedNoSubmissionCount: 2, fullySubmittedCount: 8 });

  it('2 phiên đỏ cùng phòng, khác môn → cảnh báo', () => {
    const r = detectRoomFailure([red('a', 'A3-01', 'c1'), red('b', 'A3-01', 'c2')], NOW);
    expect(r).toEqual({ room: 'A3-01', sessionCount: 2, courseCount: 2 });
  });

  it('chỉ 1 phiên đỏ → KHÔNG cảnh báo', () => {
    expect(detectRoomFailure([red('a', 'A3-01', 'c1')], NOW)).toBeNull();
  });

  it('2 phiên đỏ cùng phòng nhưng CÙNG môn → KHÔNG cảnh báo', () => {
    expect(detectRoomFailure([red('a', 'A3-01', 'c1'), red('b', 'A3-01', 'c1')], NOW)).toBeNull();
  });

  it('phiên đỏ ở hai phòng khác nhau → KHÔNG cảnh báo', () => {
    expect(detectRoomFailure([red('a', 'A3-01', 'c1'), red('b', 'B1-05', 'c2')], NOW)).toBeNull();
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận FAIL**

```bash
pnpm --filter web test -- submission-filters
```
Expected: FAIL — `Failed to resolve import "./submission-filters"`.

- [ ] **Step 3: Implement**

`apps/web/src/lib/submission-filters.ts`:

```ts
import type { SessionOverviewItem } from './api/submissions';
import { getAttentionReasons, type AttentionKind } from './submission-attention';
import { EXAM_TYPE_LABELS } from './exam-session-display';

export interface FilterState {
  /** null = tất cả học kỳ. */
  semesterId: string | null;
  kinds: AttentionKind[];
  /** Lọc "đã đủ" — phiên ended không lý do nào. */
  complete: boolean;
  examTypes: string[];
  rooms: string[];
  showArchived: boolean;
  showClosed: boolean;
}

export const EMPTY_FILTERS: FilterState = {
  semesterId: null, kinds: [], complete: false,
  examTypes: [], rooms: [], showArchived: false, showClosed: true,
};

export interface FacetOption { value: string; label: string; count: number }

/**
 * Học kỳ mặc định, suy từ chính các phiên (payload không mang start/end của
 * học kỳ): kỳ nào có phiên bao trùm `now` thì đang chạy. Không có thì lấy kỳ
 * có phiên gần `now` nhất về phía quá khứ. Spec §4.3.
 */
export function pickDefaultSemester(items: SessionOverviewItem[], now: number): string | null {
  if (items.length === 0) return null;

  const running = items.find(
    (i) => new Date(i.startTime).getTime() <= now && now <= new Date(i.endTime).getTime(),
  );
  if (running) return running.semesterId;

  const past = items
    .filter((i) => new Date(i.endTime).getTime() < now)
    .sort((a, b) => new Date(b.endTime).getTime() - new Date(a.endTime).getTime());
  if (past.length > 0) return past[0].semesterId;

  return items[0].semesterId;
}

/** Ẩn/hiện theo vòng đời. `archived` thắng `closed` — spec §4.3. */
function passesLifecycle(item: SessionOverviewItem, f: FilterState): boolean {
  if (item.archivedAt !== null) return f.showArchived;
  if (item.attentionClosedAt !== null) return f.showClosed;
  return true;
}

/** Trong một nhóm: OR. Giữa các nhóm: AND. Nhóm rỗng = không lọc. */
function passesGroups(
  item: SessionOverviewItem,
  f: FilterState,
  now: number,
  skip?: 'kinds' | 'examTypes' | 'rooms',
): boolean {
  if (f.semesterId !== null && item.semesterId !== f.semesterId) return false;

  if (skip !== 'examTypes' && f.examTypes.length > 0 && !f.examTypes.includes(item.examType)) {
    return false;
  }
  if (skip !== 'rooms' && f.rooms.length > 0 && !f.rooms.includes(item.roomName)) {
    return false;
  }
  if (skip !== 'kinds' && (f.kinds.length > 0 || f.complete)) {
    const reasons = getAttentionReasons(item, now);
    const matchesKind = f.kinds.some((k) => reasons.some((r) => r.kind === k));
    const matchesComplete = f.complete && reasons.length === 0;
    if (!matchesKind && !matchesComplete) return false;
  }
  return true;
}

export function applyFilters(
  items: SessionOverviewItem[],
  f: FilterState,
  now: number,
): SessionOverviewItem[] {
  return items.filter((i) => passesLifecycle(i, f) && passesGroups(i, f, now));
}

function countBy(
  items: SessionOverviewItem[],
  key: (i: SessionOverviewItem) => string,
  label: (i: SessionOverviewItem) => string,
): FacetOption[] {
  const map = new Map<string, FacetOption>();
  for (const item of items) {
    const value = key(item);
    const found = map.get(value);
    if (found) found.count += 1;
    else map.set(value, { value, label: label(item), count: 1 });
  }
  return [...map.values()].sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * Số đếm của mỗi nhóm được tính với các bộ lọc KHÁC đang bật, nhưng KHÔNG
 * tính chính nhóm đó — nếu không, bật "A3-01" sẽ đưa "A3-02" về 0 và giảng
 * viên không bao giờ chọn thêm được phòng thứ hai.
 */
export function buildFacets(items: SessionOverviewItem[], f: FilterState, now: number) {
  const live = items.filter((i) => passesLifecycle(i, f));

  const forKinds = live.filter((i) => passesGroups(i, f, now, 'kinds'));
  const forTypes = live.filter((i) => passesGroups(i, f, now, 'examTypes'));
  const forRooms = live.filter((i) => passesGroups(i, f, now, 'rooms'));

  const KIND_LABELS: Record<AttentionKind, string> = {
    'attended-no-submission': 'Nghi mất bài',
    partial: 'Thiếu file',
    'never-attended': 'Vắng thi',
  };
  const kinds: FacetOption[] = (Object.keys(KIND_LABELS) as AttentionKind[]).map((kind) => ({
    value: kind,
    label: KIND_LABELS[kind],
    count: forKinds.filter((i) => getAttentionReasons(i, now).some((r) => r.kind === kind)).length,
  }));
  kinds.push({
    value: 'complete',
    label: 'Đã đủ',
    count: forKinds.filter((i) => getAttentionReasons(i, now).length === 0).length,
  });

  const examTypes = countBy(forTypes, (i) => i.examType, (i) => EXAM_TYPE_LABELS[i.examType] ?? i.examType);
  const rooms = countBy(forRooms, (i) => i.roomName, (i) => i.roomName);
  const semesters = countBy(items, (i) => i.semesterId, (i) => i.semesterName);

  // Một nhóm lọc chỉ có một lựa chọn là nhiễu — UI không render nó. Spec §4.3.
  const meaningful = (o: FacetOption[]) => (o.length > 1 ? o : []);

  return {
    semesters,
    kinds,
    examTypes: meaningful(examTypes),
    rooms: meaningful(rooms),
    archivedCount: items.filter((i) => i.archivedAt !== null).length,
    closedCount: items.filter((i) => i.archivedAt === null && i.attentionClosedAt !== null).length,
  };
}

/**
 * Cảnh báo hỏng-theo-phòng: mọi phiên 🔴 đang xem cùng một phòng, ≥2 phiên,
 * trải ≥2 môn. Điều kiện ≥2 môn để không kêu oan khi một môn thi nhiều ca ở
 * phòng cố định của nó. Spec §5.5.
 */
export function detectRoomFailure(
  items: SessionOverviewItem[],
  now: number,
): { room: string; sessionCount: number; courseCount: number } | null {
  const red = items.filter((i) =>
    getAttentionReasons(i, now).some((r) => r.kind === 'attended-no-submission'),
  );
  if (red.length < 2) return null;

  const rooms = new Set(red.map((i) => i.roomName));
  if (rooms.size !== 1) return null;

  const courses = new Set(red.map((i) => i.courseId));
  if (courses.size < 2) return null;

  return { room: red[0].roomName, sessionCount: red.length, courseCount: courses.size };
}
```

- [ ] **Step 4: Chạy test + commit**

```bash
pnpm --filter web test -- submission-filters
pnpm --filter web lint
git add apps/web/src/lib/submission-filters.ts apps/web/src/lib/submission-filters.test.ts
git commit -m "feat(web): faceted filtering for the submissions page

Facet counts exclude their own group, so selecting one room does not zero
out every other room and trap the teacher in a single choice."
```

---

## Task 6: Component Tooltip + bảng một-table

**Files:**
- Modify: `apps/web/package.json`
- Create: `apps/web/src/components/ui/tooltip.tsx`
- Create: `apps/web/src/app/teacher/submissions/_components/SessionTable.tsx`
- Create: `apps/web/src/app/teacher/submissions/_components/SessionTable.test.tsx`

**Interfaces:**
- Consumes: `SessionGroup` (từ `groupByCourseClass`), `getAttentionReasons`, `getSessionPhase`, `PHASE_LABELS`, `EXAM_TYPE_LABELS`.
- Produces: `<SessionTable groups onArchive onCloseAttention />` với
  `onArchive: (id: string, on: boolean) => void`, `onCloseAttention: (id: string, on: boolean) => void`.

- [ ] **Step 1: Cài dependency + tạo Tooltip**

```bash
pnpm --filter web add @radix-ui/react-tooltip
```

`apps/web/src/components/ui/tooltip.tsx` — theo đúng pattern các file `ui/*` khác (`dialog.tsx` là mẫu gần nhất):

```tsx
'use client';

import * as React from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { cn } from '@/lib/utils';

/**
 * Cần vì bảng "Quản lý bài thu" dùng 4 nút icon mỗi dòng: icon một mình không
 * phải nhãn đọc được. `aria-label` lo cho screen reader, tooltip lo cho người
 * dùng chuột và bàn phím.
 */
const TooltipProvider = TooltipPrimitive.Provider;
const Tooltip = TooltipPrimitive.Root;
const TooltipTrigger = TooltipPrimitive.Trigger;

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
  <TooltipPrimitive.Content
    ref={ref}
    sideOffset={sideOffset}
    className={cn(
      'z-50 overflow-hidden rounded-md border border-border bg-surface-1 px-2.5 py-1.5',
      'text-caption text-foreground shadow-md',
      className,
    )}
    {...props}
  />
));
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
```

- [ ] **Step 2: Viết test thất bại**

`apps/web/src/app/teacher/submissions/_components/SessionTable.test.tsx`:

```tsx
import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { SessionOverviewItem } from '@/lib/api/submissions';
import { groupByCourseClass } from '@/lib/submission-attention';
import { SessionTable } from './SessionTable';

const NOW = Date.now();
const HOUR = 3_600_000;

function make(o: Partial<SessionOverviewItem> = {}): SessionOverviewItem {
  return {
    id: 's1', name: 'Giữa kỳ #2', code: 'GK2',
    courseId: 'c1', courseName: 'Nhập môn lập trình', classId: 'k1', className: 'Nhóm 01',
    roomName: 'A3-01', examType: 'GK',
    startTime: new Date(NOW - 4 * HOUR).toISOString(),
    endTime: new Date(NOW - 2 * HOUR).toISOString(),
    status: 'completed',
    semesterId: 'sem-1', semesterName: 'Học kỳ 1 2026-2027',
    requiredDeliverableCount: 2, expectedCount: 22, rosterKnown: true,
    fullySubmittedCount: 22, partialCount: 0,
    attendedNoSubmissionCount: 0, neverAttendedCount: 0, invalidFileCount: 0,
    archivedAt: null, attentionClosedAt: null,
    ...o,
  };
}

const onArchive = vi.fn();
const onClose = vi.fn();
beforeEach(() => { onArchive.mockReset(); onClose.mockReset(); });

function renderTable(items: SessionOverviewItem[]) {
  return render(
    <SessionTable
      groups={groupByCourseClass(items, NOW)}
      now={NOW}
      onArchive={onArchive}
      onCloseAttention={onClose}
    />,
  );
}

describe('SessionTable — cấu trúc', () => {
  it('CẢ TRANG LÀ MỘT <table> — nhóm là dòng gộp cột bên trong', () => {
    const { container } = renderTable([
      make({ id: 'a' }),
      make({ id: 'b', courseId: 'c2', courseName: 'CTDL', classId: 'k2', className: 'N05' }),
    ]);
    // Nếu mỗi nhóm là một <table> riêng thì cột lệch nhau và toàn bộ lợi thế
    // quét mắt biến mất — đó là lý do chọn bảng. Test này khoá điều đó.
    expect(container.querySelectorAll('table')).toHaveLength(1);
  });

  it('tiêu đề nhóm hiện sĩ số, và KHÔNG dòng nào hiện tỉ lệ x/y', () => {
    renderTable([make({ expectedCount: 22 })]);
    expect(screen.getByText(/22 sinh viên/)).toBeInTheDocument();
    expect(screen.queryByText(/\d+\/\d+/)).not.toBeInTheDocument();
  });
});

describe('SessionTable — cột Tình trạng', () => {
  it('phiên đủ bài hiện ✓ Đủ, không để trống', () => {
    renderTable([make()]);
    expect(screen.getByText('✓ Đủ')).toBeInTheDocument();
  });

  it('phiên đang thu bài hiện tên pha, KHÔNG hiện lý do', () => {
    renderTable([make({
      endTime: new Date(NOW - 60_000).toISOString(),
      neverAttendedCount: 5, fullySubmittedCount: 17,
    })]);
    expect(screen.getByText('Đang thu bài')).toBeInTheDocument();
    expect(screen.queryByText(/vắng thi/)).not.toBeInTheDocument();
  });

  it('phiên đã kết thúc hiện đủ mọi lý do theo thứ tự ưu tiên', () => {
    renderTable([make({
      attendedNoSubmissionCount: 3, partialCount: 2, neverAttendedCount: 1,
      fullySubmittedCount: 16,
    })]);
    expect(screen.getByText('3 sinh viên vào phòng nhưng không có bài')).toBeInTheDocument();
    expect(screen.getByText('2 sinh viên nộp thiếu file')).toBeInTheDocument();
    expect(screen.getByText('1 sinh viên vắng thi')).toBeInTheDocument();
  });

  it('phiên đã khép hiện nhãn Đã khép', () => {
    renderTable([make({ attentionClosedAt: '2026-09-01T00:00:00.000Z' })]);
    expect(screen.getByText('Đã khép')).toBeInTheDocument();
  });
});

describe('SessionTable — thao tác', () => {
  it('bốn nút icon đều có aria-label', () => {
    renderTable([make()]);
    expect(screen.getByRole('button', { name: 'Xem chi tiết phiên' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Chấm điểm' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Khép phiên' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Lưu trữ phiên' })).toBeInTheDocument();
  });

  it('nhãn đảo khi phiên đã ở trạng thái đó', () => {
    renderTable([make({
      archivedAt: '2026-09-01T00:00:00.000Z',
      attentionClosedAt: '2026-09-01T00:00:00.000Z',
    })]);
    expect(screen.getByRole('button', { name: 'Bỏ lưu trữ' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mở lại phiên' })).toBeInTheDocument();
  });

  it('bấm Lưu trữ gọi onArchive với on=true', () => {
    renderTable([make({ id: 'abc' })]);
    fireEvent.click(screen.getByRole('button', { name: 'Lưu trữ phiên' }));
    expect(onArchive).toHaveBeenCalledWith('abc', true);
  });

  it('bấm Bỏ lưu trữ gọi onArchive với on=false', () => {
    renderTable([make({ id: 'abc', archivedAt: '2026-09-01T00:00:00.000Z' })]);
    fireEvent.click(screen.getByRole('button', { name: 'Bỏ lưu trữ' }));
    expect(onArchive).toHaveBeenCalledWith('abc', false);
  });
});
```

- [ ] **Step 3: Chạy test để xác nhận FAIL**

```bash
pnpm --filter web test -- SessionTable
```
Expected: FAIL — `Failed to resolve import "./SessionTable"`.

- [ ] **Step 4: Implement**

`apps/web/src/app/teacher/submissions/_components/SessionTable.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { Archive, ArchiveRestore, CircleCheck, ClipboardCheck, Eye, RotateCcw } from 'lucide-react';
import type { SessionOverviewItem } from '@/lib/api/submissions';
import {
  PHASE_LABELS, getAttentionReasons, getSessionPhase, type SessionGroup,
} from '@/lib/submission-attention';
import { EXAM_TYPE_LABELS } from '@/lib/exam-session-display';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

const TONE_DOT: Record<'danger' | 'warning' | 'caution', string> = {
  danger: 'bg-danger', warning: 'bg-warning', caution: 'bg-warning/60',
};
const TONE_TEXT: Record<'danger' | 'warning' | 'caution', string> = {
  danger: 'text-danger-strong', warning: 'text-warning-strong', caution: 'text-warning-strong/80',
};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('vi-VN', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

/** Icon một mình không phải nhãn đọc được — mỗi nút có aria-label VÀ tooltip. */
function IconAction({
  label, icon: Icon, onClick, href,
}: {
  label: string;
  icon: typeof Eye;
  onClick?: () => void;
  href?: string;
}) {
  const body = (
    <span
      className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border
                 text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
    </span>
  );
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {href ? (
          <Link href={href} aria-label={label}>{body}</Link>
        ) : (
          <button type="button" aria-label={label} onClick={onClick}>{body}</button>
        )}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

/**
 * Cột Tình trạng không bao giờ để trống: ô trống trông giống "chưa tính xong"
 * hơn là tin tốt. Phiên chưa kết thúc hiện tên pha thay vì kết luận — spec §4.2.
 */
function StatusCell({ item, now }: { item: SessionOverviewItem; now: number }) {
  if (item.attentionClosedAt !== null) {
    return <span className="text-caption text-muted-foreground">Đã khép</span>;
  }
  const phase = getSessionPhase(item, now);
  if (phase !== 'ended') {
    return <span className="text-muted-foreground">{PHASE_LABELS[phase]}</span>;
  }
  const reasons = getAttentionReasons(item, now);
  if (reasons.length === 0) {
    return (
      <span className="inline-flex items-center gap-1.5 font-medium text-success-strong">
        <span className="h-2 w-2 shrink-0 rounded-full bg-success" aria-hidden="true" />
        ✓ Đủ
      </span>
    );
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
      {reasons.map((reason, index) => (
        <span key={reason.kind} className={cn('inline-flex items-center gap-1.5 font-medium', TONE_TEXT[reason.tone])}>
          {index === 0 && (
            <span className={cn('h-2 w-2 shrink-0 rounded-full', TONE_DOT[reason.tone])} aria-hidden="true" />
          )}
          {reason.label}
        </span>
      ))}
    </span>
  );
}

interface SessionTableProps {
  groups: SessionGroup[];
  now: number;
  onArchive: (id: string, on: boolean) => void;
  onCloseAttention: (id: string, on: boolean) => void;
}

/**
 * MỘT <table> cho cả trang — tiêu đề nhóm là <tr> gộp cột BÊN TRONG bảng đó.
 * Nếu tách mỗi nhóm thành một <table> riêng thì cột lệch nhau giữa các nhóm và
 * toàn bộ lợi thế quét mắt biến mất, tức là mất luôn lý do chọn bảng. Spec §5.2.
 */
export function SessionTable({ groups, now, onArchive, onCloseAttention }: SessionTableProps) {
  return (
    <TooltipProvider delayDuration={200}>
      <div className="overflow-x-auto rounded-xl border border-border bg-surface-1">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-[36%]">Phiên thi</TableHead>
              <TableHead>Loại</TableHead>
              <TableHead>Thời gian</TableHead>
              <TableHead>Phòng</TableHead>
              <TableHead>Tình trạng</TableHead>
              <TableHead className="text-right">Thao tác</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {groups.map((group) => (
              <>
                <TableRow key={group.key} className="hover:bg-transparent">
                  <TableCell colSpan={6} className="bg-surface-2/60 font-semibold text-foreground">
                    {group.courseName}
                    {group.className ? ` — ${group.className}` : ' — không gắn lớp'}
                    <span className="ml-2 font-normal text-caption text-muted-foreground">
                      {group.sessions.length} phiên
                      {group.sessions[0] ? ` · ${group.sessions[0].expectedCount} sinh viên` : ''}
                      {group.attentionCount > 0 ? ` · ${group.attentionCount} cần chú ý` : ''}
                    </span>
                  </TableCell>
                </TableRow>
                {group.sessions.map((item) => (
                  <TableRow key={item.id} className={cn(item.attentionClosedAt !== null && 'opacity-60')}>
                    <TableCell className="font-medium text-foreground">{item.name}</TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {EXAM_TYPE_LABELS[item.examType] ?? item.examType}
                    </TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground">
                      {formatDateTime(item.startTime)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">{item.roomName}</TableCell>
                    <TableCell><StatusCell item={item} now={now} /></TableCell>
                    <TableCell className="whitespace-nowrap text-right">
                      <span className="inline-flex gap-1">
                        <IconAction label="Xem chi tiết phiên" icon={Eye}
                          href={`/teacher/submissions/${item.id}`} />
                        <IconAction label="Chấm điểm" icon={ClipboardCheck}
                          href={`/teacher/grading?sessionId=${item.id}`} />
                        <IconAction
                          label={item.attentionClosedAt !== null ? 'Mở lại phiên' : 'Khép phiên'}
                          icon={item.attentionClosedAt !== null ? RotateCcw : CircleCheck}
                          onClick={() => onCloseAttention(item.id, item.attentionClosedAt === null)} />
                        <IconAction
                          label={item.archivedAt !== null ? 'Bỏ lưu trữ' : 'Lưu trữ phiên'}
                          icon={item.archivedAt !== null ? ArchiveRestore : Archive}
                          onClick={() => onArchive(item.id, item.archivedAt === null)} />
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </>
            ))}
          </TableBody>
        </Table>
      </div>
    </TooltipProvider>
  );
}
```

> **Lưu ý khi implement:** `<>...</>` bọc hai `<TableRow>` trong `.map()` cần `key` trên fragment.
> Dùng `<React.Fragment key={group.key}>` thay cho `<>` và bỏ `key` khỏi `<TableRow>` nhóm.
> React sẽ cảnh báo nếu làm sai — output test phải sạch, cảnh báo là finding.

- [ ] **Step 5: Chạy test + commit**

```bash
pnpm --filter web test -- SessionTable
pnpm --filter web lint
git add apps/web/package.json pnpm-lock.yaml apps/web/src/components/ui/tooltip.tsx \
        "apps/web/src/app/teacher/submissions/_components/SessionTable.tsx" \
        "apps/web/src/app/teacher/submissions/_components/SessionTable.test.tsx"
git commit -m "feat(web): single aligned table for the submissions page

One <table> for the whole page with group headers as colspan rows — separate
tables per group would misalign the columns and lose the only reason to use a
table at all."
```

---

## Task 7: Cột lọc

**Files:**
- Create: `apps/web/src/app/teacher/submissions/_components/FilterRail.tsx`
- Create: `apps/web/src/app/teacher/submissions/_components/FilterRail.test.tsx`

**Interfaces:**
- Consumes: `FilterState`, `buildFacets` (Task 5).
- Produces: `<FilterRail facets filters onChange attentionTotal />` với `onChange: (next: FilterState) => void`.

- [ ] **Step 1: Viết test thất bại**

`apps/web/src/app/teacher/submissions/_components/FilterRail.test.tsx`:

```tsx
import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { EMPTY_FILTERS } from '@/lib/submission-filters';
import { FilterRail } from './FilterRail';

const facets = {
  semesters: [
    { value: 'sem-1', label: 'Học kỳ 1 2026-2027', count: 12 },
    { value: 'sem-0', label: 'Học kỳ 2 2025-2026', count: 8 },
  ],
  kinds: [
    { value: 'attended-no-submission', label: 'Nghi mất bài', count: 1 },
    { value: 'partial', label: 'Thiếu file', count: 2 },
    { value: 'never-attended', label: 'Vắng thi', count: 3 },
    { value: 'complete', label: 'Đã đủ', count: 6 },
  ],
  examTypes: [
    { value: 'GK', label: 'Giữa kỳ', count: 4 },
    { value: 'CK', label: 'Cuối kỳ', count: 3 },
  ],
  rooms: [
    { value: 'A3-01', label: 'A3-01', count: 5 },
    { value: 'A3-02', label: 'A3-02', count: 2 },
  ],
  archivedCount: 4,
  closedCount: 1,
};

const onChange = vi.fn();
beforeEach(() => onChange.mockReset());

describe('FilterRail', () => {
  it('hiện tổng số phiên cần chú ý', () => {
    render(<FilterRail facets={facets} filters={EMPTY_FILTERS} onChange={onChange} attentionTotal={6} />);
    expect(screen.getByText('6')).toBeInTheDocument();
  });

  it('bấm một mức gọi onChange với kind đó', () => {
    render(<FilterRail facets={facets} filters={EMPTY_FILTERS} onChange={onChange} attentionTotal={6} />);
    fireEvent.click(screen.getByRole('button', { name: /Nghi mất bài/ }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ kinds: ['attended-no-submission'] }),
    );
  });

  it('bấm lại mức đang bật thì gỡ nó ra', () => {
    render(
      <FilterRail
        facets={facets}
        filters={{ ...EMPTY_FILTERS, kinds: ['attended-no-submission'] }}
        onChange={onChange}
        attentionTotal={1}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Nghi mất bài/ }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ kinds: [] }));
  });

  it('nhóm rỗng (≤1 giá trị) KHÔNG được render', () => {
    render(
      <FilterRail
        facets={{ ...facets, rooms: [] }}
        filters={EMPTY_FILTERS}
        onChange={onChange}
        attentionTotal={6}
      />,
    );
    expect(screen.queryByText('Phòng thi')).not.toBeInTheDocument();
    expect(screen.getByText('Loại kỳ thi')).toBeInTheDocument();
  });

  it('link xoá bộ lọc chỉ hiện khi có bộ lọc đang bật', () => {
    const { rerender } = render(
      <FilterRail facets={facets} filters={EMPTY_FILTERS} onChange={onChange} attentionTotal={6} />,
    );
    expect(screen.queryByRole('button', { name: /Xoá tất cả bộ lọc/ })).not.toBeInTheDocument();

    rerender(
      <FilterRail facets={facets} filters={{ ...EMPTY_FILTERS, rooms: ['A3-01'] }}
        onChange={onChange} attentionTotal={5} />,
    );
    expect(screen.getByRole('button', { name: /Xoá tất cả bộ lọc/ })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận FAIL**

```bash
pnpm --filter web test -- FilterRail
```
Expected: FAIL — `Failed to resolve import "./FilterRail"`.

- [ ] **Step 3: Implement**

`apps/web/src/app/teacher/submissions/_components/FilterRail.tsx`:

```tsx
'use client';

import { X } from 'lucide-react';
import type { AttentionKind } from '@/lib/submission-attention';
import type { FacetOption, FilterState } from '@/lib/submission-filters';
import { EMPTY_FILTERS } from '@/lib/submission-filters';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

const KIND_DOT: Record<string, string> = {
  'attended-no-submission': 'bg-danger',
  partial: 'bg-warning',
  'never-attended': 'bg-warning/60',
  complete: 'bg-success',
};

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-4 border-t border-border pt-3 first:mt-0 first:border-0 first:pt-0">
      <p className="mb-1.5 text-caption font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      {children}
    </div>
  );
}

function FacetRow({
  label, count, active, dot, onClick,
}: { label: string; count: number; active: boolean; dot?: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-small transition-colors',
        active ? 'bg-foreground text-background' : 'hover:bg-surface-2',
      )}
    >
      {dot && <span className={cn('h-2 w-2 shrink-0 rounded-full', dot)} aria-hidden="true" />}
      <span className="truncate">{label}</span>
      <span className="ml-auto tabular-nums opacity-70">{count}</span>
    </button>
  );
}

interface FilterRailProps {
  facets: {
    semesters: FacetOption[];
    kinds: FacetOption[];
    examTypes: FacetOption[];
    rooms: FacetOption[];
    archivedCount: number;
    closedCount: number;
  };
  filters: FilterState;
  onChange: (next: FilterState) => void;
  attentionTotal: number;
}

/**
 * Bảng điều khiển, KHÔNG phải bản sao của danh sách bên phải. Đó là điểm khác
 * biệt so với bản trước — dải "Cần chú ý" cũ lặp lại chính những phiên nằm
 * trong nhóm bên dưới, và giảng viên đọc thành "đếm hai lần". Spec §5.1.
 */
export function FilterRail({ facets, filters, onChange, attentionTotal }: FilterRailProps) {
  const hasActive =
    filters.kinds.length > 0 || filters.complete ||
    filters.examTypes.length > 0 || filters.rooms.length > 0 ||
    filters.showArchived || !filters.showClosed;

  return (
    <aside className="flex flex-col gap-1 rounded-xl border border-border bg-surface-1 p-3 lg:sticky lg:top-4">
      {facets.semesters.length > 1 && (
        <Section title="Học kỳ">
          <Select
            value={filters.semesterId ?? 'all'}
            onValueChange={(v) => onChange({ ...filters, semesterId: v === 'all' ? null : v })}
          >
            <SelectTrigger aria-label="Lọc theo học kỳ"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả học kỳ</SelectItem>
              {facets.semesters.map((s) => (
                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Section>
      )}

      <Section title="Cần chú ý">
        <p className="mb-2 flex items-baseline gap-2">
          <span className="text-h2 font-bold text-danger-strong tabular-nums">{attentionTotal}</span>
          <span className="text-caption text-muted-foreground">phiên cần chú ý</span>
        </p>
        {facets.kinds.map((k) => (
          <FacetRow
            key={k.value}
            label={k.label}
            count={k.count}
            dot={KIND_DOT[k.value]}
            active={k.value === 'complete' ? filters.complete : filters.kinds.includes(k.value as AttentionKind)}
            onClick={() =>
              k.value === 'complete'
                ? onChange({ ...filters, complete: !filters.complete })
                : onChange({ ...filters, kinds: toggle(filters.kinds, k.value as AttentionKind) })
            }
          />
        ))}
      </Section>

      {facets.examTypes.length > 0 && (
        <Section title="Loại kỳ thi">
          {facets.examTypes.map((t) => (
            <FacetRow key={t.value} label={t.label} count={t.count}
              active={filters.examTypes.includes(t.value)}
              onClick={() => onChange({ ...filters, examTypes: toggle(filters.examTypes, t.value) })} />
          ))}
        </Section>
      )}

      {facets.rooms.length > 0 && (
        <Section title="Phòng thi">
          {facets.rooms.map((r) => (
            <FacetRow key={r.value} label={r.label} count={r.count}
              active={filters.rooms.includes(r.value)}
              onClick={() => onChange({ ...filters, rooms: toggle(filters.rooms, r.value) })} />
          ))}
        </Section>
      )}

      <Section title="Trạng thái">
        <FacetRow label="Hiện phiên đã khép" count={facets.closedCount}
          active={filters.showClosed}
          onClick={() => onChange({ ...filters, showClosed: !filters.showClosed })} />
        <FacetRow label="Hiện phiên đã lưu trữ" count={facets.archivedCount}
          active={filters.showArchived}
          onClick={() => onChange({ ...filters, showArchived: !filters.showArchived })} />
      </Section>

      {hasActive && (
        <button
          type="button"
          onClick={() => onChange({ ...EMPTY_FILTERS, semesterId: filters.semesterId })}
          className="mt-3 flex items-center gap-1 text-caption text-primary hover:underline"
        >
          <X className="h-3 w-3" aria-hidden="true" />
          Xoá tất cả bộ lọc
        </button>
      )}
    </aside>
  );
}
```

- [ ] **Step 4: Chạy test + commit**

```bash
pnpm --filter web test -- FilterRail
pnpm --filter web lint
git add "apps/web/src/app/teacher/submissions/_components/FilterRail.tsx" \
        "apps/web/src/app/teacher/submissions/_components/FilterRail.test.tsx"
git commit -m "feat(web): filter rail for the submissions page

A control panel, not a second copy of the list — the old pinned strip repeated
the very sessions shown below it, which teachers read as double counting."
```

---

## Task 8: Ghép trang + dải cảnh báo phòng

**Files:**
- Create: `apps/web/src/app/teacher/submissions/_components/RoomFailureBanner.tsx`
- Modify: `apps/web/src/app/teacher/submissions/page.tsx`
- Modify: `apps/web/src/app/teacher/submissions/page.test.tsx`

**Interfaces:**
- Consumes: tất cả Task 3–7.
- Produces: route `/teacher/submissions` hoàn chỉnh.

- [ ] **Step 1: Viết banner**

`apps/web/src/app/teacher/submissions/_components/RoomFailureBanner.tsx`:

```tsx
import { TriangleAlert } from 'lucide-react';

/**
 * Chỉ hiện khi dữ liệu đã tự nói ra kết luận: mọi phiên nghi-mất-bài đang xem
 * cùng một phòng, ≥2 phiên, trải ≥2 môn. Lúc đó vấn đề gần như chắc chắn là
 * máy/mạng của phòng, và bắt giảng viên tự ghép ba dòng lại để nhận ra là
 * bắt họ làm việc mà hệ thống làm được. Spec §5.5.
 */
export function RoomFailureBanner({
  room, sessionCount, courseCount,
}: { room: string; sessionCount: number; courseCount: number }) {
  return (
    <div
      role="status"
      className="flex items-start gap-2 rounded-lg border border-danger-subtle bg-danger-subtle/40 px-4 py-3 text-small text-danger-strong"
    >
      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span>
        Cả <strong>{sessionCount} phiên nghi mất bài</strong> trong phạm vi này đều ở phòng{' '}
        <strong>{room}</strong>, trải {courseCount} môn khác nhau — nhiều khả năng là sự cố
        máy/mạng của phòng, không phải do sinh viên.
      </span>
    </div>
  );
}
```

- [ ] **Step 2: Cập nhật test trang**

Trong `apps/web/src/app/teacher/submissions/page.test.tsx`: cập nhật helper `make()` như Task 4/5, rồi thay các describe cũ về "dải cần chú ý" bằng:

```tsx
describe('SubmissionsPage — bố cục mới', () => {
  it('KHÔNG còn dải "Cần chú ý" là danh sách riêng', () => {
    useSessionOverviewMock.mockReturnValue({
      data: [make({ id: 's1', neverAttendedCount: 2, fullySubmittedCount: 20 })],
      isLoading: false, error: null, refetch: vi.fn(),
    });
    render(<SubmissionsPage />);
    // Tên phiên xuất hiện đúng MỘT lần trên cả trang — đây là thứ chữa phàn
    // nàn "thấy cùng một phiên hai lần".
    expect(screen.getAllByText('Giữa kỳ #2')).toHaveLength(1);
  });

  it('hiện dải cảnh báo phòng khi mọi phiên đỏ cùng một phòng, khác môn', () => {
    useSessionOverviewMock.mockReturnValue({
      data: [
        make({ id: 'a', courseId: 'c1', roomName: 'A3-01', attendedNoSubmissionCount: 2, fullySubmittedCount: 20 }),
        make({ id: 'b', courseId: 'c2', courseName: 'CTDL', classId: 'k2', className: 'N05',
               roomName: 'A3-01', attendedNoSubmissionCount: 3, fullySubmittedCount: 19 }),
      ],
      isLoading: false, error: null, refetch: vi.fn(),
    });
    render(<SubmissionsPage />);
    expect(screen.getByText(/đều ở phòng/)).toBeInTheDocument();
  });

  it('KHÔNG hiện dải cảnh báo khi chỉ một phiên đỏ', () => {
    useSessionOverviewMock.mockReturnValue({
      data: [make({ id: 'a', attendedNoSubmissionCount: 2, fullySubmittedCount: 20 })],
      isLoading: false, error: null, refetch: vi.fn(),
    });
    render(<SubmissionsPage />);
    expect(screen.queryByText(/đều ở phòng/)).not.toBeInTheDocument();
  });
});
```

Giữ nguyên các describe về loading/error/empty và về search (Task 5 của plan trước) — chúng vẫn phải pass.

- [ ] **Step 3: Chạy test để xác nhận FAIL**

```bash
pnpm --filter web test -- teacher/submissions/page
```
Expected: FAIL — trang cũ vẫn render dải cần chú ý nên `getAllByText` ra 2 phần tử.

- [ ] **Step 4: Viết lại page.tsx**

Thay toàn bộ phần render kết quả (giữ nguyên ô search + luồng search của plan trước) bằng bố cục hai cột:

```tsx
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const now = Date.now();
  const items = useMemo(() => data ?? [], [data]);

  // Học kỳ mặc định chỉ chốt MỘT LẦN, khi dữ liệu về lần đầu — nếu tính lại
  // mỗi render thì lựa chọn của giảng viên sẽ bị ghi đè ngay lập tức.
  const seededRef = useRef(false);
  useEffect(() => {
    if (seededRef.current || items.length === 0) return;
    seededRef.current = true;
    setFilters((prev) => ({ ...prev, semesterId: pickDefaultSemester(items, now) }));
  }, [items, now]);

  const facets = useMemo(() => buildFacets(items, filters, now), [items, filters, now]);
  const visible = useMemo(() => applyFilters(items, filters, now), [items, filters, now]);
  const groups = useMemo(() => groupByCourseClass(visible, now), [visible, now]);
  const roomFailure = useMemo(() => detectRoomFailure(visible, now), [visible, now]);
  const attentionTotal = useMemo(
    () => visible.filter((i) => getAttentionReasons(i, now).length > 0).length,
    [visible, now],
  );

  const archive = useArchiveSession();
  const close = useCloseAttention();
```

và phần JSX:

```tsx
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
          <div className="lg:w-[205px] lg:shrink-0">
            <FilterRail
              facets={facets}
              filters={filters}
              onChange={setFilters}
              attentionTotal={attentionTotal}
            />
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            {roomFailure && <RoomFailureBanner {...roomFailure} />}
            {groups.length === 0 ? (
              <Card>
                <EmptyState
                  icon={Inbox}
                  title="Không có phiên thi nào khớp bộ lọc"
                  description="Thử bỏ bớt bộ lọc ở cột bên trái, hoặc đổi sang học kỳ khác."
                />
              </Card>
            ) : (
              <SessionTable
                groups={groups}
                now={now}
                onArchive={(id, on) => archive.mutate({ id, on })}
                onCloseAttention={(id, on) => close.mutate({ id, on })}
              />
            )}
          </div>
        </div>
```

- [ ] **Step 5: Chạy toàn bộ + commit**

```bash
pnpm --filter web test
pnpm --filter web exec tsc --noEmit
pnpm --filter web lint
```
Expected: toàn bộ web suite PASS; `tsc` chỉ còn lỗi có sẵn ở `read-workbook.test.ts`.

```bash
git add "apps/web/src/app/teacher/submissions/_components/RoomFailureBanner.tsx" \
        "apps/web/src/app/teacher/submissions/page.tsx" \
        "apps/web/src/app/teacher/submissions/page.test.tsx"
git commit -m "feat(web): two-column triage layout for the submissions page

The pinned attention strip is gone: a filter rail plus one table means no
session is ever rendered twice, which is what teachers read as double counting."
```

---

## Self-Review

**1. Spec coverage**

| Spec | Task |
|---|---|
| §1.2 trục ba mức mới | 2 (backend), 4 (frontend) |
| §1.3 khép + archive | 1 (backend), 6 (nút), 7 (bộ lọc) |
| §1.4 xoá bỏ lặp | 8 (test đếm 1 lần) |
| §3.1 migration | 1 |
| §3.2 type +6 −1 | 2, 3 |
| §3.3 CTE `attended`, join semester | 2 |
| §3.4 lỗ hổng thi ghép | không có task — đúng chủ đích, ghi trong Global Constraints |
| §3.5 4 endpoint | 1 |
| §3.6 không phân trang, lọc client | 5, 8 |
| §4.1 nhãn + 3 cổng chặn | 4 |
| §4.2 cột Tình trạng | 6 |
| §4.3 facet, mặc định, archived thắng closed | 5 (logic), 7 (UI) |
| §4.4 `invalidFileCount` ngủ | 4 (test khẳng định nó không sinh lý do) |
| §5.1 hai cột | 8 |
| §5.2 một `<table>` + sĩ số ở header | 6 |
| §5.3 4 icon + tooltip | 6 |
| §5.4 chữ thay pill | 6 |
| §5.5 dải cảnh báo phòng | 5 (logic), 8 (UI) |
| §5.6 màn hình hẹp | 6 (`overflow-x-auto`), 8 (`lg:flex-row`) |

Không mục nào của spec thiếu task.

**2. Placeholder scan** — không có "TBD"/"tương tự Task N". Hai chỗ cố ý ghi chú thay vì code im lặng:
Task 6 Step 4 (fragment cần `key` — bẫy React thật), và Task 2 Step 5 (test cũ sẽ fail và **phải** sửa
giá trị kỳ vọng, kèm lý do vì sao đó không phải bẻ test).

**3. Type consistency** — `SessionOverviewItem` giống nhau ở Task 2 (api) và Task 3 (web), 24 field.
`AttentionReason.tone` (Task 4) khớp `TONE_DOT`/`TONE_TEXT` (Task 6) và `KIND_DOT` (Task 7).
`FilterState` (Task 5) khớp props `FilterRail` (Task 7) và state `page.tsx` (Task 8).
`onArchive(id, on)` / `onCloseAttention(id, on)` khớp giữa Task 6 và Task 8, và khớp biến thể
`{ id, on }` của hook ở Task 3.

**Thứ tự phụ thuộc:** 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8. Task 4 và 5 độc lập nhau; 6 cần 4; 7 cần 5.
