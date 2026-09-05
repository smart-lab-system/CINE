# Session-Pinned Rubric — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ghim rubric vào phiên thi lúc tạo (`exam_session.rubric_id`) và khai tử `findActive(courseId)` — nghĩa là rubric dùng để chấm một phiên thi được **quyết định trước**, không tra cứu động tại thời điểm bấm "Bắt đầu chấm".

**Architecture:** Cột `rubric_id` và FK của nó đã tồn tại từ `InitialSchema` — **không có migration**. Backend chỉ học cách ghi/đọc nó: `create()` nhận `rubricId` tuỳ chọn và kiểm cùng môn; một endpoint hẹp `PATCH /exam-sessions/:id/rubric` cho phép sửa tới khi có `GradingResult` đầu tiên; `startGrading` đọc từ phiên. Frontend tách editor rubric sang trang riêng theo môn, thêm ô chọn vào form tạo phiên, và đổi nguồn danh sách của trang Chấm điểm sang `GET /submissions/overview` (vốn không phân trang và đã có `courseId`).

**Tech Stack:** NestJS 10 + TypeORM 0.3 + Postgres (schema `examcollect`) · Next.js 15 App Router + React 19 + TanStack Query 5 + Tailwind · Jest (api: `src/**/*.spec.ts` unit, `test/*.e2e-spec.ts` chạy DB thật) · Vitest + Testing Library (web) · `openapi-typescript` sinh `packages/shared/src/api/schema.d.ts`

**Spec:** `docs/superpowers/specs/2026-09-05-session-pinned-rubric-design.md` — plan này lập luận từ spec đó; executor phải đọc cả hai. Mọi tham chiếu `§N` bên dưới trỏ vào spec.

---

## Global Constraints

- **KHÔNG viết migration.** `exam_session.rubric_id` (uuid, nullable) và FK
  `-> rubric ON DELETE RESTRICT` đã có từ `InitialSchema` (spec §2). Ai định
  `migration:generate` là đang đi sai hướng.
- **Endpoint mới phải đặt ở `GradingController`, KHÔNG phải `ExamSessionController`.**
  `GradingModule` import `ExamSessionModule` (một chiều). Đặt route cần
  `RubricService` vào `ExamSessionController` sẽ tạo vòng lặp module và phải
  `forwardRef`. `GradingController` là `@Controller()` không prefix và **đã** khai
  `exam-sessions/:id/start-grading` theo đúng kiểu này — làm theo, đừng phát minh lại.
- **Rubric KHÔNG có chủ sở hữu** (spec §3.2.1, đã kiểm chứng bằng thực nghiệm).
  Phép kiểm duy nhất là `rubric.courseId === session.courseId`. **Đừng thêm kiểm
  quyền sở hữu rubric** — hai giảng viên cùng môn dùng chung rubric là chủ đích.
- **Đừng viết test mong 403** cho case "rubric của môn không dạy" — `findTaughtBy`
  đã chặn từ trước nên nó ra **400** (spec §8.2).
- **Trang Chấm điểm KHÔNG được ẩn phiên vì thiếu rubric** (spec §5.3). Đây là quy
  tắc quan trọng nhất của cả spec.
- **Trang Chấm điểm cũng KHÔNG lọc theo `archivedAt`.** Lưu trữ là khái niệm của
  luồng *thu bài* (trang triage); chấm điểm là pipeline riêng. Gắn hai thứ vào
  nhau nghĩa là giảng viên dọn dẹp màn thu bài thì âm thầm mất đường vào chấm —
  cùng loại lỗi §5.3 cấm.
- **`isActive` VẪN giữ trên DTO** (spec §7.2) — còn dùng để gợi ý bản mặc định ở
  ô chọn. Chỉ hai chỗ ở trang Chấm điểm là phải đi.
- **Schema Postgres:** raw SQL lấy schema từ `dataSource.options.schema`, không
  hardcode `examcollect.`.
- **`COUNT`/`SUM` của Postgres trả `string`** qua node-postgres → `Number(...)`
  trước khi trả ra API.
- **Chạy e2e cần Postgres + MinIO:** `docker compose up -d postgres minio`, và
  bucket `examcollect-submissions` phải tồn tại (repo không tự tạo):
  ```bash
  docker run --rm --network host --entrypoint sh minio/mc:latest -c \
    "mc alias set local http://localhost:9010 examcollect_admin examcollect_admin_password && \
     mc mb --ignore-existing local/examcollect-submissions"
  ```
- **E2E không được để lại hai phiên `active` trùng phòng/giờ** — constraint
  `ex_exam_session_room_overlap` sẽ chặn phiên tiếp theo, và migration dựng lại
  constraint sẽ fail. Mỗi phiên trong một spec dùng khung giờ riêng hoặc phòng riêng.
- **Lệnh:** api unit `pnpm --filter api test` · api e2e `pnpm --filter api test:e2e`
  · web `pnpm --filter web test` · lint `pnpm --filter api lint`,
  `pnpm --filter web lint` · build `pnpm --filter api build`, `pnpm --filter web build`
- **Sinh lại OpenAPI:** API phải đang chạy, rồi
  `API_URL=http://localhost:4000/api-docs-json pnpm --filter @cine/shared generate:api-client`

---

## File Structure

**Tạo mới — backend**

| File | Trách nhiệm |
|---|---|
| `apps/api/src/grading/dto/set-session-rubric.dto.ts` | `SetSessionRubricDto` — đúng một field `rubricId: string \| null` |
| `apps/api/test/session-rubric.e2e-spec.ts` | Toàn bộ e2e của spec này, kể cả test chốt §8.1 |

**Sửa — backend**

| File | Thay đổi |
|---|---|
| `apps/api/src/exam-session/dto/create-exam-session.dto.ts` | `+ rubricId?: string` |
| `apps/api/src/exam-session/dto/exam-session-response.dto.ts` | `+ rubricId`, `+ rubricVersion` |
| `apps/api/src/exam-session/exam-session.service.ts` | `create()` kiểm + ghi rubric; `findByIdForOwner` nạp quan hệ `rubric` |
| `apps/api/src/grading/rubric.service.ts` | `+ findById()`; đổi tên `findActive` → `findDefaultForCourse` |
| `apps/api/src/grading/grading.service.ts` | `startGrading` đọc `session.rubricId`; `+ hasResultsForSession()` |
| `apps/api/src/grading/grading.controller.ts` | `+ PATCH exam-sessions/:id/rubric` |
| `apps/api/src/submission/submission-overview.types.ts` | `+ rubricId`, `+ rubricVersion` |
| `apps/api/src/submission/submission-overview.service.ts` | JOIN `rubric`, map hai field mới |

**Tạo mới — frontend**

| File | Trách nhiệm |
|---|---|
| `apps/web/src/app/teacher/rubrics/page.tsx` | Trang quản lý rubric theo môn — nhà mới của editor |
| `apps/web/src/app/teacher/rubrics/page.test.tsx` | Test render + lưu phiên bản mới |
| `apps/web/src/app/teacher/exam-sessions/new/_components/RubricPicker.tsx` | Ô chọn rubric trên form tạo phiên (form đã 520 dòng, không nhồi thêm) |

**Sửa — frontend**

| File | Thay đổi |
|---|---|
| `apps/web/src/lib/api/grading.ts` | `+ setSessionRubric()` |
| `apps/web/src/hooks/useGrading.ts` | `+ useSetSessionRubric()` |
| `apps/web/src/lib/nav-config.ts` | `+ { label: 'Rubric', href: '/teacher/rubrics' }` |
| `apps/web/src/app/teacher/exam-sessions/new/schema.ts` | `+ rubricId` (optional) |
| `apps/web/src/app/teacher/exam-sessions/new/page.tsx` | Gắn `<RubricPicker />` |
| `apps/web/src/app/teacher/grading/page.tsx` | Gỡ `RubricCard`; nguồn danh sách; thẻ chặn; nút theo phiên; key fragment |
| `apps/web/src/app/teacher/grading/page.test.tsx` | Test mới cho ba hành vi trên |
| `packages/shared/src/api/schema.d.ts` | Sinh lại, không sửa tay |

---

## Task 1: Ghi rubric lúc tạo phiên thi

**Files:**
- Modify: `apps/api/src/exam-session/dto/create-exam-session.dto.ts`
- Modify: `apps/api/src/exam-session/dto/exam-session-response.dto.ts`
- Modify: `apps/api/src/exam-session/exam-session.service.ts`
- Test: `apps/api/test/session-rubric.e2e-spec.ts` (tạo mới)

**Interfaces:**
- Consumes: `ExamSessionService.create(teacherId, dto)` hiện có;
  `ClassService.findTaughtBy(classId, teacherId)` trả entity có `.id`, `.courseId`
- Produces: `CreateExamSessionDto.rubricId?: string`;
  `ExamSessionResponseDto.rubricId: string | null`,
  `.rubricVersion: number | null`

- [ ] **Step 1: Viết e2e thất bại**

Tạo `apps/api/test/session-rubric.e2e-spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';
import { createTestAccount } from './helpers/create-account';

describe('Session-pinned rubric (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  const stamp = Date.now();
  let tokenA: string;
  let idA: string;
  let tokenB: string;
  let courseId: string;
  let classAId: string;
  let otherCourseId: string;
  let otherClassId: string;
  let roomId: string;

  // Mỗi phiên một ngày riêng: hai phiên chưa kết thúc không được trùng
  // phòng (ex_exam_session_room_overlap) — xem Global Constraints.
  let dayCursor = 0;
  function freshWindow() {
    dayCursor += 1;
    const start = new Date();
    start.setUTCDate(start.getUTCDate() + dayCursor);
    start.setUTCHours(8, 0, 0, 0);
    const end = new Date(start);
    end.setUTCHours(10);
    return { startTime: start.toISOString(), endTime: end.toISOString() };
  }

  function createSession(token: string, body: Record<string, unknown>) {
    return request(app.getHttpServer())
      .post('/exam-sessions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: `Phiên ${stamp}`,
        roomId,
        examType: 'TK',
        requiredFilenames: ['Cau1.docx'],
        ...freshWindow(),
        ...body,
      });
  }

  async function saveRubric(token: string, forCourseId: string, label: string) {
    const response = await request(app.getHttpServer())
      .post(`/courses/${forCourseId}/rubrics`)
      .set('Authorization', `Bearer ${token}`)
      .send({ criteria: [{ description: label, maxPoints: 10 }] });
    expect(response.status).toBe(201);
    return response.body as { id: string; version: number };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new PostgresExceptionFilter());
    await app.init();
    dataSource = app.get(DataSource);

    async function teacher(tag: string) {
      const email = `pinned_${tag}_${stamp}@example.com`;
      const id = await createTestAccount(dataSource, {
        email,
        password: 'correct-horse-battery',
        role: 'teacher',
      });
      const login = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password: 'correct-horse-battery' });
      return { id, token: login.body.accessToken as string };
    }

    const a = await teacher('a');
    const b = await teacher('b');
    idA = a.id;
    tokenA = a.token;
    tokenB = b.token;

    const [semester] = await dataSource.query(
      `INSERT INTO examcollect.semester (name, start_date, end_date)
       VALUES ($1, '2026-01-01', '2026-06-01') RETURNING id`,
      [`Pinned Semester ${stamp}`],
    );
    const [course] = await dataSource.query(
      `INSERT INTO examcollect.course (code, name, semester_id)
       VALUES ($1, 'Môn ghim rubric', $2) RETURNING id`,
      [`PIN${stamp}`.slice(0, 20), semester.id],
    );
    courseId = course.id;
    const [otherCourse] = await dataSource.query(
      `INSERT INTO examcollect.course (code, name, semester_id)
       VALUES ($1, 'Môn khác', $2) RETURNING id`,
      [`OTH${stamp}`.slice(0, 20), semester.id],
    );
    otherCourseId = otherCourse.id;

    const [room] = await dataSource.query(
      `INSERT INTO examcollect.room (name, capacity) VALUES ($1, 30) RETURNING id`,
      [`Phòng ghim ${stamp}`],
    );
    roomId = room.id;

    // A và B cùng dạy `courseId` (hai lớp khác nhau) — nền cho §3.2.1.
    const [classA] = await dataSource.query(
      `INSERT INTO examcollect.class (course_id, name, teacher_id)
       VALUES ($1, $2, $3) RETURNING id`,
      [courseId, `Nhóm A ${stamp}`, a.id],
    );
    classAId = classA.id;
    await dataSource.query(
      `INSERT INTO examcollect.class (course_id, name, teacher_id) VALUES ($1, $2, $3)`,
      [courseId, `Nhóm B ${stamp}`, b.id],
    );
    // A cũng dạy môn khác, để dựng case "rubric khác môn".
    const [otherClass] = await dataSource.query(
      `INSERT INTO examcollect.class (course_id, name, teacher_id)
       VALUES ($1, $2, $3) RETURNING id`,
      [otherCourseId, `Nhóm môn khác ${stamp}`, a.id],
    );
    otherClassId = otherClass.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('ghim rubric vào phiên và trả lại đúng phiên bản đã ghim', async () => {
    const rubric = await saveRubric(tokenA, courseId, 'Tiêu chí v1');

    const created = await createSession(tokenA, { classId: classAId, rubricId: rubric.id });

    expect(created.status).toBe(201);
    expect(created.body.rubricId).toBe(rubric.id);
    expect(created.body.rubricVersion).toBe(rubric.version);
  });

  it('tạo phiên không gắn rubric vẫn được — rubric là tuỳ chọn (§3.1)', async () => {
    const created = await createSession(tokenA, { classId: classAId });

    expect(created.status).toBe(201);
    expect(created.body.rubricId).toBeNull();
    expect(created.body.rubricVersion).toBeNull();
  });

  it('từ chối rubric của môn khác với 400', async () => {
    const foreign = await saveRubric(tokenA, otherCourseId, 'Rubric môn khác');

    const created = await createSession(tokenA, {
      classId: classAId,
      rubricId: foreign.id,
    });

    expect(created.status).toBe(400);
  });

  it('CHẤP NHẬN rubric do đồng nghiệp cùng môn soạn — rubric không có chủ (§3.2.1)', async () => {
    // B soạn, A dùng. Không phải lỗ hổng: rubric thuộc MÔN, và cả hai đều
    // dạy môn này. Test này tồn tại để không ai "sửa" nó thành 403.
    const byB = await saveRubric(tokenB, courseId, 'Do B soạn');

    const created = await createSession(tokenA, { classId: classAId, rubricId: byB.id });

    expect(created.status).toBe(201);
    expect(created.body.rubricId).toBe(byB.id);
  });
});
```

- [ ] **Step 2: Chạy để xác nhận fail đúng lý do**

```bash
docker compose up -d postgres minio
pnpm --filter api test:e2e -- session-rubric
```

Expected: FAIL. `rubricId` bị `ValidationPipe({ whitelist: true })` loại khỏi
body nên phiên tạo ra không có rubric → `created.body.rubricId` là `undefined`,
không phải id. Ca "môn khác" trả 201 thay vì 400.

- [ ] **Step 3: Thêm `rubricId` vào DTO**

Trong `apps/api/src/exam-session/dto/create-exam-session.dto.ts`, thêm vào class
`CreateExamSessionDto` (cạnh `roomId`):

```ts
  /**
   * Rubric dùng để chấm phiên này — quyết định lúc ra đề, không tra lại lúc
   * chấm (spec §1.2). Tuỳ chọn: §3.1 của kế hoạch tổng thể nói "gắn rubric
   * chấm điểm (nếu dùng AI chấm)", nên phiên không chấm bằng AI vẫn tạo,
   * thi và thu bài bình thường.
   */
  @IsOptional()
  @IsUUID()
  rubricId?: string;
```

Thêm `IsOptional` vào import `class-validator` ở đầu file.

- [ ] **Step 4: Thêm hai field vào response DTO**

Trong `apps/api/src/exam-session/dto/exam-session-response.dto.ts`, class
`ExamSessionResponseDto`, sau `status`:

```ts
  /** Rubric đã ghim, hoặc null nếu phiên này không chấm bằng AI. */
  rubricId!: string | null;
  /** Phiên bản của rubric đã ghim — để UI nói "phiên bản N" mà không gọi thêm API. */
  rubricVersion!: number | null;
```

- [ ] **Step 5: Kiểm và ghi trong `create()`**

Trong `apps/api/src/exam-session/exam-session.service.ts`, ngay **sau**
`const klass = await this.classes.findTaughtBy(...)` và **trước**
`await this.scheduleConflicts.assertNone(...)`:

```ts
    // Rubric phải thuộc đúng môn của lớp này. Đây là phép kiểm DUY NHẤT —
    // rubric không có chủ sở hữu (spec §3.2.1, đã kiểm chứng thực nghiệm),
    // và findTaughtBy ở trên đã chứng minh giảng viên dạy môn này rồi, nên
    // kiểm thêm quyền là kiểm lại điều vừa chứng minh.
    //
    // Đặt trước assertNone vì đây là lỗi đầu vào (400), còn trùng lịch là
    // xung đột trạng thái (409) — báo lỗi đầu vào trước.
    let rubric: RubricEntity | null = null;
    if (dto.rubricId) {
      rubric = await this.rubrics.findById(dto.rubricId);
      if (!rubric || rubric.courseId !== klass.courseId) {
        throw new BadRequestException(
          'Rubric không thuộc môn học của lớp này — hãy chọn rubric của đúng môn.',
        );
      }
    }
```

Thêm `BadRequestException` vào import `@nestjs/common`, `RubricEntity` vào
import, và `private readonly rubrics: RubricService` vào constructor.

> ⚠️ `RubricService.findById` **chưa tồn tại** — Task 3 tạo nó. Để Task 1 chạy
> được ngay, tạo luôn ở đây (Task 3 chỉ dùng lại):
>
> ```ts
> // apps/api/src/grading/rubric.service.ts
> /** Tra thẳng theo id, KHÔNG kiểm scope — spec §3.4 giải thích vì sao an toàn. */
> async findById(rubricId: string): Promise<RubricEntity | null> {
>   return this.rubrics.findOne({ where: { id: rubricId } });
> }
> ```
>
> ⚠️ `ExamSessionModule` chưa import `GradingModule`, và **không được import** —
> `GradingModule` đã import `ExamSessionModule` (Global Constraints). Thay vào
> đó đăng ký `RubricEntity` vào `TypeOrmModule.forFeature` của
> `ExamSessionModule` và inject `Repository<RubricEntity>` thẳng:
>
> ```ts
> @InjectRepository(RubricEntity)
> private readonly rubrics: Repository<RubricEntity>,
> ```
>
> rồi trong `create()` dùng `this.rubrics.findOne({ where: { id: dto.rubricId } })`.
> Một truy vấn một dòng không đáng để bẻ chiều phụ thuộc module.

Trong khối `manager.create(ExamSessionEntity, {...})`, thêm:

```ts
              rubricId: rubric?.id ?? null,
```

- [ ] **Step 6: Trả hai field mới trong `toResponseDto`**

Tìm `toResponseDto` trong cùng file và thêm vào object trả về:

```ts
      rubricId: session.rubricId,
      rubricVersion: rubricVersion ?? null,
```

`toResponseDto` cần biết version. Đổi chữ ký thành
`toResponseDto(session, deliverables, rubricVersion?: number | null)` và ở
`create()` truyền `rubric?.version ?? null`. Với `findByIdForOwner`, nạp quan hệ:

```ts
    const session = await this.sessions.findOne({
      where: { id },
      relations: { rubric: true },
    });
```

rồi truyền `session.rubric?.version ?? null`.

- [ ] **Step 7: Chạy lại — phải xanh**

```bash
pnpm --filter api test:e2e -- session-rubric
```

Expected: PASS 4/4.

- [ ] **Step 8: Chạy toàn bộ e2e để chắc không vỡ chỗ khác**

```bash
pnpm --filter api test:e2e
```

Expected: tất cả PASS. Nếu `exam-session.e2e-spec.ts` fail vì `rubricId`/
`rubricVersion` thiếu trong assertion — sửa assertion, đừng sửa DTO.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/exam-session apps/api/src/grading/rubric.service.ts apps/api/test/session-rubric.e2e-spec.ts
git commit -m "feat(exam-session): pin a rubric to the session at creation time"
```

---

## Task 2: `PATCH /exam-sessions/:id/rubric`

**Files:**
- Create: `apps/api/src/grading/dto/set-session-rubric.dto.ts`
- Modify: `apps/api/src/grading/grading.controller.ts`
- Modify: `apps/api/src/grading/grading.service.ts`
- Modify: `apps/api/src/exam-session/exam-session.service.ts` (thêm `setRubric`)
- Test: `apps/api/test/session-rubric.e2e-spec.ts`

**Interfaces:**
- Consumes: `ExamSessionService.findEntityForOwner(id, teacherId)` (đã có, dùng
  bởi `GradingController.startGrading`)
- Produces: `GradingService.hasResultsForSession(examSessionId): Promise<boolean>`;
  `ExamSessionService.setRubric(session, rubricId): Promise<ExamSessionResponseDto>`

- [ ] **Step 1: Viết test thất bại**

Thêm vào `session-rubric.e2e-spec.ts`:

```ts
  describe('PATCH /exam-sessions/:id/rubric', () => {
    function setRubric(token: string, sessionId: string, rubricId: string | null) {
      return request(app.getHttpServer())
        .patch(`/exam-sessions/${sessionId}/rubric`)
        .set('Authorization', `Bearer ${token}`)
        .send({ rubricId });
    }

    it('gắn rubric cho phiên chưa chấm', async () => {
      const created = await createSession(tokenA, { classId: classAId });
      const rubric = await saveRubric(tokenA, courseId, 'Gắn sau');

      const patched = await setRubric(tokenA, created.body.id, rubric.id);

      expect(patched.status).toBe(200);
      expect(patched.body.rubricId).toBe(rubric.id);
      expect(patched.body.rubricVersion).toBe(rubric.version);
    });

    it('gỡ rubric bằng null', async () => {
      const rubric = await saveRubric(tokenA, courseId, 'Sẽ gỡ');
      const created = await createSession(tokenA, {
        classId: classAId,
        rubricId: rubric.id,
      });

      const patched = await setRubric(tokenA, created.body.id, null);

      expect(patched.status).toBe(200);
      expect(patched.body.rubricId).toBeNull();
    });

    it('từ chối rubric khác môn với 400', async () => {
      const created = await createSession(tokenA, { classId: classAId });
      const foreign = await saveRubric(tokenA, otherCourseId, 'Khác môn');

      const patched = await setRubric(tokenA, created.body.id, foreign.id);

      expect(patched.status).toBe(400);
    });

    it('từ chối người không sở hữu phiên với 403', async () => {
      const created = await createSession(tokenA, { classId: classAId });
      const rubric = await saveRubric(tokenA, courseId, 'Của A');

      const patched = await setRubric(tokenB, created.body.id, rubric.id);

      expect(patched.status).toBe(403);
    });

    it('từ chối với 409 khi phiên đã có kết quả chấm', async () => {
      const rubric = await saveRubric(tokenA, courseId, 'Đã chấm');
      const created = await createSession(tokenA, {
        classId: classAId,
        rubricId: rubric.id,
      });
      // Một GradingResult là đủ để khoá — không cần bài nộp thật.
      const [submission] = await dataSource.query(
        `INSERT INTO examcollect.submission
           (exam_session_id, required_deliverable_id, student_mssv,
            student_name_input, home_class_id, home_teacher_id, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'invalid') RETURNING id`,
        [
          created.body.id,
          created.body.requiredDeliverables[0].id,
          `SV${stamp}`.slice(0, 20),
          'SV Test',
          classAId,
          idA,
        ],
      );
      await dataSource.query(
        `INSERT INTO examcollect.grading_result
           (submission_id, rubric_id_version, grading_triggered_by, status)
         VALUES ($1, $2, $3, 'ai_grading')`,
        [submission.id, rubric.id, idA],
      );

      const other = await saveRubric(tokenA, courseId, 'Đổi sau khi chấm');
      const patched = await setRubric(tokenA, created.body.id, other.id);

      expect(patched.status).toBe(409);
    });
  });
```

- [ ] **Step 2: Chạy để xác nhận fail**

```bash
pnpm --filter api test:e2e -- session-rubric
```

Expected: FAIL — 404 cho mọi ca, vì route chưa tồn tại.

- [ ] **Step 3: Tạo DTO**

`apps/api/src/grading/dto/set-session-rubric.dto.ts`:

```ts
import { IsUUID, ValidateIf } from 'class-validator';

/**
 * Đúng một field. Cố ý KHÔNG phải một DTO sửa phiên thi tổng quát: mở
 * `PATCH /exam-sessions/:id` sẽ mở luôn đường sửa startTime/roomId, mà đó là
 * vùng ScheduleConflictService.assertNone chưa hỗ trợ (không nhận
 * excludeSessionId, nên một lệnh dời lịch sẽ báo phiên xung đột với chính
 * nó). Xem spec §3.3.
 */
export class SetSessionRubricDto {
  /** `null` nghĩa là gỡ rubric khỏi phiên. */
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  rubricId!: string | null;
}
```

- [ ] **Step 4: Thêm `hasResultsForSession` vào `GradingService`**

```ts
  /**
   * Phiên này đã có kết quả chấm nào chưa.
   *
   * KHÔNG dùng lại `RubricService.hasResults(rubricId)` — hàm đó đếm theo
   * PHIÊN BẢN RUBRIC trên toàn hệ thống, còn ở đây cần đếm theo PHIÊN THI.
   */
  async hasResultsForSession(examSessionId: string): Promise<boolean> {
    const count = await this.results
      .createQueryBuilder('g')
      .innerJoin('submission', 's', 's.id = g.submission_id')
      .where('s.exam_session_id = :id', { id: examSessionId })
      .limit(1)
      .getCount();
    return count > 0;
  }
```

- [ ] **Step 5: Thêm `setRubric` vào `ExamSessionService`**

```ts
  /**
   * Ghi rubric lên một phiên đã tạo. Người gọi đã chứng minh quyền sở hữu
   * (findEntityForOwner) và đã chứng minh phiên chưa có kết quả chấm — hai
   * việc đó thuộc controller, không phải chỗ này.
   */
  async setRubric(
    session: ExamSessionEntity,
    rubricId: string | null,
  ): Promise<ExamSessionResponseDto> {
    let rubric: RubricEntity | null = null;
    if (rubricId) {
      rubric = await this.rubrics.findOne({ where: { id: rubricId } });
      if (!rubric || rubric.courseId !== session.courseId) {
        throw new BadRequestException(
          'Rubric không thuộc môn học của phiên thi này.',
        );
      }
    }
    await this.sessions.update(session.id, { rubricId: rubric?.id ?? null });
    const deliverables = await this.listRequiredDeliverables(session.id);
    return this.toResponseDto(
      { ...session, rubricId: rubric?.id ?? null },
      deliverables,
      rubric?.version ?? null,
    );
  }
```

- [ ] **Step 6: Thêm route vào `GradingController`**

```ts
  /**
   * Đổi rubric của một phiên thi, tới khi bài đầu tiên được chấm.
   *
   * Nằm ở GradingController chứ không phải ExamSessionController vì
   * GradingModule import ExamSessionModule (một chiều) — xem plan Global
   * Constraints. Route path vẫn là exam-sessions/... giống
   * `start-grading` ngay dưới.
   */
  @Patch('exam-sessions/:id/rubric')
  @Roles('teacher')
  async setSessionRubric(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetSessionRubricDto,
    @Req() req: Request,
  ) {
    const session = await this.examSessions.findEntityForOwner(id, req.user!.sub);
    if (await this.grading.hasResultsForSession(session.id)) {
      throw new ConflictException(
        'Phiên thi này đã có kết quả chấm — không đổi được rubric nữa. ' +
          'Đổi rubric sau khi đã chấm là viết lại lịch sử chấm điểm.',
      );
    }
    return this.examSessions.setRubric(session, dto.rubricId);
  }
```

Thêm `Patch`, `ConflictException` vào import `@nestjs/common`, và
`SetSessionRubricDto` vào import.

- [ ] **Step 7: Chạy lại — phải xanh**

```bash
pnpm --filter api test:e2e -- session-rubric
```

Expected: PASS 9/9.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/grading apps/api/src/exam-session apps/api/test/session-rubric.e2e-spec.ts
git commit -m "feat(grading): let a teacher set the session's rubric until grading starts"
```

---

## Task 3: Khai tử `findActive` — task quan trọng nhất

**Files:**
- Modify: `apps/api/src/grading/rubric.service.ts`
- Modify: `apps/api/src/grading/grading.service.ts`
- Test: `apps/api/test/session-rubric.e2e-spec.ts`
- Test: `apps/api/test/grading.e2e-spec.ts` (sửa test hiện có)

**Interfaces:**
- Consumes: `RubricService.findById()` (Task 1)
- Produces: `RubricService.findDefaultForCourse(courseId)` thay cho `findActive`

- [ ] **Step 1: Viết test chốt (§8.1)**

Thêm vào `session-rubric.e2e-spec.ts`:

```ts
  it('CHỐT: chấm theo rubric ĐÃ GHIM, không theo bản active mới nhất (§8.1)', async () => {
    const v1 = await saveRubric(tokenA, courseId, 'Tiêu chí bản 1');
    const created = await createSession(tokenA, {
      classId: classAId,
      rubricId: v1.id,
    });

    // Bản 2 ra đời SAU khi phiên đã ghim v1, và trở thành bản active.
    const v2 = await saveRubric(tokenA, courseId, 'Tiêu chí bản 2');
    expect(v2.version).toBeGreaterThan(v1.version);

    // Một bài đã thu, để có cái mà chấm.
    const mssv = `SVP${stamp}`.slice(0, 20);
    const [submission] = await dataSource.query(
      `INSERT INTO examcollect.submission
         (exam_session_id, required_deliverable_id, student_mssv,
          student_name_input, home_class_id, home_teacher_id, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'received') RETURNING id`,
      [
        created.body.id,
        created.body.requiredDeliverables[0].id,
        mssv,
        'SV Ghim',
        classAId,
        idA,
      ],
    );
    // Trigger validate_submission_lifecycle chỉ cho INSERT ở 'received'/
    // 'invalid'; tới 'collected' phải đi qua UPDATE từng bước.
    await dataSource.query(
      `UPDATE examcollect.submission SET status = 'validated' WHERE id = $1`,
      [submission.id],
    );
    await dataSource.query(
      `UPDATE examcollect.submission SET status = 'collected' WHERE id = $1`,
      [submission.id],
    );

    const started = await request(app.getHttpServer())
      .post(`/exam-sessions/${created.body.id}/start-grading`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(started.status).toBe(200);
    // ĐÂY là khẳng định của cả spec.
    expect(started.body.rubricId).toBe(v1.id);
    expect(started.body.rubricVersion).toBe(v1.version);

    const [result] = await dataSource.query(
      `SELECT g.rubric_id_version FROM examcollect.grading_result g
       WHERE g.submission_id = $1`,
      [submission.id],
    );
    expect(result.rubric_id_version).toBe(v1.id);
  });

  it('từ chối chấm khi phiên chưa gắn rubric, và nói về PHIÊN THI', async () => {
    const created = await createSession(tokenA, { classId: classAId });

    const started = await request(app.getHttpServer())
      .post(`/exam-sessions/${created.body.id}/start-grading`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(started.status).toBe(400);
    expect(started.body.message).toContain('Phiên thi');
  });
```

- [ ] **Step 2: Chạy để xác nhận fail**

```bash
pnpm --filter api test:e2e -- session-rubric
```

Expected: FAIL — `started.body.rubricId` là **v2**, không phải v1. Đó chính là
bug spec này tồn tại để sửa.

- [ ] **Step 3: Đổi tên `findActive`**

Trong `apps/api/src/grading/rubric.service.ts`:

```ts
  /**
   * Bản rubric gợi ý sẵn khi TẠO phiên thi mới — KHÔNG phải bản mà lượt chấm
   * sẽ dùng. Lượt chấm đọc `exam_session.rubric_id` đã ghim (spec §3.4).
   *
   * Tên cũ `findActive` mang nghĩa cũ đó và đã bị bỏ; đổi tên để nghĩa cũ
   * không bò ngược lại qua một call-site mới.
   */
  async findDefaultForCourse(courseId: string): Promise<RubricEntity | null> {
    return this.rubrics.findOne({ where: { courseId, isActive: true } });
  }
```

Sửa luôn comment ở `saveNewVersion` đang nhắc `findActive`.

- [ ] **Step 4: Chạy build — lỗi biên dịch là TÍN HIỆU TỐT**

```bash
pnpm --filter api build
```

Expected: FAIL ở `grading.service.ts:75` — `findActive` không còn tồn tại.
**Đừng `@ts-ignore`.** Đó là cách bước này chứng minh không còn caller nào sót.

- [ ] **Step 5: Sửa `startGrading` đọc từ phiên**

Trong `apps/api/src/grading/grading.service.ts`, thay khối resolve rubric:

```ts
    // Rubric của phiên này được quyết định lúc ra đề, không tra lại ở đây.
    // Đó là toàn bộ điểm khác biệt so với findActive() cũ: sửa rubric giữa
    // hai kỳ thi cùng môn KHÔNG được đổi cách chấm kỳ đã ghim bản cũ.
    if (!session.rubricId) {
      throw new BadRequestException(
        'Phiên thi này chưa gắn rubric — hãy gắn rubric trước khi chấm.',
      );
    }
    const rubric = await this.rubrics.findById(session.rubricId);
    if (!rubric) {
      throw new BadRequestException('Rubric của phiên thi này không còn tồn tại.');
    }
```

- [ ] **Step 6: Build lại + chạy test**

```bash
pnpm --filter api build && pnpm --filter api test:e2e -- session-rubric
```

Expected: build PASS, test PASS 11/11.

- [ ] **Step 7: Sửa test cũ trong `grading.e2e-spec.ts`**

Test `'says so instead of grading when the course has no rubric'` (dòng ~324) nói
về **môn**, giờ hành vi là về **phiên**. Đổi tên test thành
`'says so instead of grading when the SESSION has no rubric'` và sửa assertion
thông báo. Các test khác trong `describe('the boundary between collecting and
grading')` tạo phiên rồi chấm — chúng cần **gắn rubric lúc tạo** thì mới chấm
được; thêm `rubricId` vào body tạo phiên của chúng.

- [ ] **Step 8: Chạy toàn bộ e2e**

```bash
pnpm --filter api test:e2e
```

Expected: tất cả PASS.

- [ ] **Step 9: Xác nhận không còn resolve-động nào ở backend**

```bash
grep -rn "findActive" apps/ packages/ --include=*.ts --include=*.tsx
```

Expected: **0 kết quả**. (Frontend còn `isActive` — Task 8 xử lý; đây chỉ soát
backend.)

- [ ] **Step 10: Commit**

```bash
git add apps/api/src/grading apps/api/test
git commit -m "feat(grading): grade against the session's pinned rubric, retiring findActive"
```

---

## Task 4: `GET /submissions/overview` mang theo rubric

**Files:**
- Modify: `apps/api/src/submission/submission-overview.types.ts`
- Modify: `apps/api/src/submission/submission-overview.service.ts`
- Test: `apps/api/test/submission-overview.e2e-spec.ts`

**Interfaces:**
- Produces: `SessionOverviewItem.rubricId: string | null`,
  `.rubricVersion: number | null`

- [ ] **Step 1: Viết test thất bại (§8.3 tầng backend)**

Thêm vào `apps/api/test/submission-overview.e2e-spec.ts`:

```ts
  it('phiên có bài thu mà CHƯA gắn rubric vẫn nằm trong overview, rubricId null', async () => {
    // Bảo vệ spec §5.3: endpoint không được lọc bỏ phiên vì thiếu rubric —
    // bài thi thật của SV đang nằm trong đó.
    const session = await createSession(`NoRubric ${stamp}`, ['Cau1.docx'], {
      startOffsetMs: -7_200_000,
      endOffsetMs: -3_600_000,
    });
    await insertSubmission(session.id, session.deliverableIds[0], ROSTER[0], 'collected');

    const item = bySessionId(await fetchOverview(), session.id);

    expect(item.rubricId).toBeNull();
    expect(item.rubricVersion).toBeNull();
    expect(item.fullySubmittedCount).toBe(1);
  });
```

- [ ] **Step 2: Chạy để xác nhận fail**

```bash
pnpm --filter api test:e2e -- submission-overview
```

Expected: FAIL — `item.rubricId` là `undefined`, không phải `null`.

- [ ] **Step 3: Thêm field vào type**

Trong `apps/api/src/submission/submission-overview.types.ts`, thêm vào
`SessionOverviewItem`:

```ts
  /** Rubric đã ghim cho phiên này — null nghĩa là chưa chấm được (spec §5). */
  rubricId: string | null;
  rubricVersion: number | null;
```

Và vào `OverviewRawRow`:

```ts
  rubric_id: string | null;
  rubric_version: number | null;
```

- [ ] **Step 4: JOIN rubric trong truy vấn**

Trong `apps/api/src/submission/submission-overview.service.ts`, ở SELECT ngoài
cùng thêm `s.rubric_id, rb.version AS rubric_version`, và thêm join:

```sql
      LEFT JOIN ${schema}.rubric rb ON rb.id = s.rubric_id
```

`LEFT JOIN` chứ không phải `JOIN`: phiên chưa gắn rubric **phải** còn trong kết
quả — xem §5.3.

Rồi map:

```ts
      rubricId: row.rubric_id,
      rubricVersion: row.rubric_version === null ? null : Number(row.rubric_version),
```

`Number(...)` vì node-postgres trả integer dạng string ở một số kiểu — theo đúng
quy ước đã có trong file.

- [ ] **Step 5: Chạy lại — phải xanh**

```bash
pnpm --filter api test:e2e -- submission-overview
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/submission apps/api/test/submission-overview.e2e-spec.ts
git commit -m "feat(api): carry the session's pinned rubric on the submissions overview"
```

---

## Task 5: Sinh lại OpenAPI + API client + hook

**Files:**
- Modify: `packages/shared/src/api/schema.d.ts` (sinh, không sửa tay)
- Modify: `apps/web/src/lib/api/grading.ts`
- Modify: `apps/web/src/hooks/useGrading.ts`

**Interfaces:**
- Consumes: `PATCH /exam-sessions/{id}/rubric` (Task 2)
- Produces: `setSessionRubric(examSessionId, rubricId)`;
  `useSetSessionRubric(examSessionId)`

- [ ] **Step 1: Sinh lại schema**

```bash
pnpm --filter api dev   # cửa sổ riêng, chờ "Nest application successfully started"
API_URL=http://localhost:4000/api-docs-json pnpm --filter @cine/shared generate:api-client
```

- [ ] **Step 2: Xác nhận route mới có trong schema**

```bash
grep -n "exam-sessions/{id}/rubric" packages/shared/src/api/schema.d.ts
```

Expected: có kết quả. Nếu không: API chưa chạy lại sau Task 2, hoặc route thiếu
decorator.

- [ ] **Step 3: Thêm client**

Trong `apps/web/src/lib/api/grading.ts`:

```ts
/** Đổi rubric của phiên. `null` để gỡ. 409 khi phiên đã có kết quả chấm. */
export async function setSessionRubric(
  examSessionId: string,
  rubricId: string | null,
): Promise<void> {
  const { error, response } = await apiClient.PATCH('/exam-sessions/{id}/rubric', {
    params: { path: { id: examSessionId } },
    body: { rubricId },
  });
  if (error || !response.ok) throw fail(error, response);
}
```

- [ ] **Step 4: Thêm hook**

Trong `apps/web/src/hooks/useGrading.ts`:

```ts
/**
 * Invalidate cả overview: danh sách phiên ở trang Chấm điểm lấy từ đó, và
 * trạng thái "chưa gắn rubric" của phiên vừa đổi nằm trong chính payload ấy.
 */
export function useSetSessionRubric(examSessionId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (rubricId: string | null) => setSessionRubric(examSessionId!, rubricId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['submissions', 'overview'] });
    },
  });
}
```

Thêm `setSessionRubric` vào import ở đầu file.

- [ ] **Step 5: Typecheck**

```bash
pnpm --filter web exec tsc --noEmit
```

Expected: không có lỗi mới. (Hai lỗi có sẵn ở `src/lib/read-workbook.test.ts` về
`Buffer.File` vs DOM `File` là nợ cũ, không phải do task này.)

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/api/schema.d.ts apps/web/src/lib/api/grading.ts apps/web/src/hooks/useGrading.ts
git commit -m "feat(web): api client and hook for setting a session's rubric"
```

---

## Task 6: Trang `/teacher/rubrics`

**Files:**
- Create: `apps/web/src/app/teacher/rubrics/page.tsx`
- Create: `apps/web/src/app/teacher/rubrics/page.test.tsx`
- Modify: `apps/web/src/lib/nav-config.ts`

**Interfaces:**
- Consumes: `useTeachingClasses()` → `{ courseId, courseName, ... }[]`;
  `useRubrics(courseId)`, `useSaveRubric(courseId)` (đã có)
- Produces: route `/teacher/rubrics`

- [ ] **Step 1: Viết test thất bại**

`apps/web/src/app/teacher/rubrics/page.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import RubricsPage from './page';

const teachingClasses = vi.hoisted(() => vi.fn());
const rubrics = vi.hoisted(() => vi.fn());
const saveRubric = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/useTeaching', () => ({ useTeachingClasses: teachingClasses }));
vi.mock('@/hooks/useGrading', () => ({
  useRubrics: rubrics,
  useSaveRubric: saveRubric,
}));

describe('RubricsPage', () => {
  beforeEach(() => {
    rubrics.mockReturnValue({ data: [], isLoading: false });
    saveRubric.mockReturnValue({ mutate: vi.fn(), isPending: false, isError: false });
  });

  it('gộp hai lớp cùng môn thành MỘT môn', () => {
    // Rubric thuộc MÔN, không thuộc lớp — hai lớp cùng môn phải hiện một
    // dòng, nếu không giảng viên tưởng có hai rubric khác nhau.
    teachingClasses.mockReturnValue({
      data: [
        { id: 'c1', courseId: 'course-1', courseName: 'Lập trình Web', name: 'N01' },
        { id: 'c2', courseId: 'course-1', courseName: 'Lập trình Web', name: 'N02' },
        { id: 'c3', courseId: 'course-2', courseName: 'Cơ sở dữ liệu', name: 'N01' },
      ],
      isLoading: false,
    });

    render(<RubricsPage />);

    expect(screen.getAllByText('Lập trình Web')).toHaveLength(1);
    expect(screen.getByText('Cơ sở dữ liệu')).toBeInTheDocument();
  });

  it('nói rõ khi giảng viên chưa dạy lớp nào', () => {
    teachingClasses.mockReturnValue({ data: [], isLoading: false });

    render(<RubricsPage />);

    expect(screen.getByText(/chưa dạy lớp nào/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Chạy để xác nhận fail**

```bash
pnpm --filter web test -- rubrics
```

Expected: FAIL — không resolve được `./page`.

- [ ] **Step 3: Tạo trang**

`apps/web/src/app/teacher/rubrics/page.tsx` — chuyển `RubricCard` từ
`teacher/grading/page.tsx` (dòng ~265-417) sang đây **nguyên hành vi**, bọc trong
danh sách môn:

```tsx
'use client';

import { useMemo } from 'react';
import { PageHeader } from '@/components/layout/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useTeachingClasses } from '@/hooks/useTeaching';
import { RubricEditor } from './_components/RubricEditor';

/**
 * Rubric thuộc MÔN HỌC, không thuộc lớp và không thuộc phiên thi.
 *
 * Trước đây editor sống trong trang Chấm điểm, nên muốn sửa rubric của một
 * môn thì phải chọn một phiên thi của môn đó trước. Sau khi rubric được ghim
 * lúc TẠO phiên thi, thứ tự đó thành vô lý: rubric phải soạn xong trước khi
 * có phiên thi nào để chọn.
 */
export default function RubricsPage() {
  const classes = useTeachingClasses();

  // Hai lớp cùng môn dùng CHUNG một rubric — gộp lại, nếu không giảng viên
  // tưởng mỗi lớp có rubric riêng.
  const courses = useMemo(() => {
    const seen = new Map<string, string>();
    for (const klass of classes.data ?? []) {
      if (!seen.has(klass.courseId)) seen.set(klass.courseId, klass.courseName);
    }
    return [...seen].map(([courseId, courseName]) => ({ courseId, courseName }));
  }, [classes.data]);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Rubric"
        description="Tiêu chí chấm của từng môn bạn dạy. Mỗi lần lưu tạo một phiên bản mới; phiên thi đã gắn phiên bản cũ vẫn giữ nguyên bản đó."
      />

      {!classes.isLoading && courses.length === 0 && (
        <Alert variant="info">
          <AlertDescription>
            Bạn chưa dạy lớp nào, nên chưa có môn nào để soạn rubric.
          </AlertDescription>
        </Alert>
      )}

      {courses.map((course) => (
        <RubricEditor
          key={course.courseId}
          courseId={course.courseId}
          courseName={course.courseName}
        />
      ))}
    </div>
  );
}
```

Tạo `apps/web/src/app/teacher/rubrics/_components/RubricEditor.tsx` bằng cách
**cắt** `RubricCard` từ `teacher/grading/page.tsx`, đổi tên thành `RubricEditor`,
nhận thêm prop `courseName` để hiện tên môn ở `CardTitle`, và bỏ nhánh
`!courseId` (ở đây `courseId` luôn có).

- [ ] **Step 4: Chạy lại — phải xanh**

```bash
pnpm --filter web test -- rubrics
```

Expected: PASS 2/2.

- [ ] **Step 5: Thêm vào nav**

Trong `apps/web/src/lib/nav-config.ts`, thêm vào `TEACHER_NAV` ngay **trước**
'Chấm điểm' (rubric soạn trước, chấm sau):

```ts
  { label: 'Rubric', href: '/teacher/rubrics', icon: ListChecks },
```

Thêm `ListChecks` vào import `lucide-react`.

- [ ] **Step 6: Chạy toàn bộ web test + lint**

```bash
pnpm --filter web test && pnpm --filter web lint
```

Expected: tất cả PASS, lint sạch.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/teacher/rubrics apps/web/src/lib/nav-config.ts
git commit -m "feat(web): a per-course rubric screen, out of the grading page"
```

---

## Task 7: Ô chọn rubric trên form tạo phiên thi

**Files:**
- Create: `apps/web/src/app/teacher/exam-sessions/new/_components/RubricPicker.tsx`
- Modify: `apps/web/src/app/teacher/exam-sessions/new/schema.ts`
- Modify: `apps/web/src/app/teacher/exam-sessions/new/page.tsx`
- Test: `apps/web/src/app/teacher/exam-sessions/new/schema.test.ts`

**Interfaces:**
- Consumes: `useRubrics(courseId)`; `CreateExamSessionFormValues`
- Produces: `createExamSessionSchema` có `rubricId: z.string().uuid().optional()`

- [ ] **Step 1: Viết test thất bại**

Thêm vào `apps/web/src/app/teacher/exam-sessions/new/schema.test.ts`:

```ts
describe('createExamSessionSchema — rubric', () => {
  const VALID_UUID = '11111111-1111-4111-8111-111111111111';

  function baseValues(extra: Record<string, unknown> = {}) {
    const start = new Date();
    start.setDate(start.getDate() + 1);
    start.setHours(8, 0, 0, 0);
    const end = new Date(start.getTime() + 60 * 60_000);
    return {
      name: 'Kiểm tra giữa kỳ',
      classId: VALID_UUID,
      roomId: VALID_UUID,
      examType: 'GK' as const,
      startTime: toLocalInput(start),
      endTime: toLocalInput(end),
      requiredFilenames: [{ value: 'Cau1.docx' }],
      ...extra,
    };
  }

  it('cho phép bỏ trống rubric — rubric là tuỳ chọn', () => {
    expect(createExamSessionSchema.safeParse(baseValues()).success).toBe(true);
  });

  it('nhận rubricId hợp lệ', () => {
    const result = createExamSessionSchema.safeParse(
      baseValues({ rubricId: '22222222-2222-4222-8222-222222222222' }),
    );
    expect(result.success).toBe(true);
  });

  it('coi chuỗi rỗng là "không chọn", không phải uuid hỏng', () => {
    // <Select> trả '' khi chưa chọn gì. Nếu schema không xử lý, form hợp lệ
    // vẫn bị chặn bằng lỗi "uuid không hợp lệ" mà người dùng không hiểu.
    const result = createExamSessionSchema.safeParse(baseValues({ rubricId: '' }));
    expect(result.success).toBe(true);
  });
});
```

- [ ] **Step 2: Chạy để xác nhận fail**

```bash
pnpm --filter web test -- schema.test
```

Expected: ca thứ ba FAIL (`''` không phải uuid). Hai ca đầu có thể PASS sẵn vì
zod bỏ qua key lạ — vẫn phải chạy để thấy ca ba đỏ.

- [ ] **Step 3: Thêm vào schema**

Trong `apps/web/src/app/teacher/exam-sessions/new/schema.ts`, thêm vào
`z.object({...})`:

```ts
    /**
     * `<Select>` trả '' khi chưa chọn — chuyển thành undefined để "không
     * chọn rubric" là hợp lệ, thay vì hiện lỗi uuid mà người dùng không
     * hiểu. Rubric tuỳ chọn: §3.1 kế hoạch tổng thể.
     */
    rubricId: z
      .string()
      .transform((value) => (value === '' ? undefined : value))
      .pipe(z.string().uuid('Rubric không hợp lệ').optional())
      .optional(),
```

- [ ] **Step 4: Chạy lại — phải xanh**

```bash
pnpm --filter web test -- schema.test
```

Expected: PASS.

- [ ] **Step 5: Tạo `RubricPicker`**

`apps/web/src/app/teacher/exam-sessions/new/_components/RubricPicker.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { Controller, useFormContext } from 'react-hook-form';
import { FormField } from '@/components/ui/form-field';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useRubrics } from '@/hooks/useGrading';
import type { CreateExamSessionFormValues } from '../schema';

/**
 * Rubric của phiên thi được chọn ở ĐÂY, lúc ra đề — không tra lại lúc chấm.
 *
 * Tuỳ chọn: phiên không chấm bằng AI vẫn tạo, thi và thu bài bình thường;
 * chỉ "Bắt đầu chấm" là bị chặn tới khi có rubric.
 */
export function RubricPicker({ courseId }: { courseId: string | undefined }) {
  const form = useFormContext<CreateExamSessionFormValues>();
  const rubrics = useRubrics(courseId);
  const options = rubrics.data ?? [];

  return (
    <FormField
      label="Rubric chấm điểm"
      hint="Không bắt buộc. Có thể gắn sau, tới khi bài đầu tiên được chấm."
      error={form.formState.errors.rubricId?.message}
    >
      <Controller
        control={form.control}
        name="rubricId"
        render={({ field }) => (
          <Select
            value={field.value ?? ''}
            onValueChange={field.onChange}
            disabled={!courseId || rubrics.isLoading || options.length === 0}
          >
            <SelectTrigger id="rubricId">
              <SelectValue placeholder={courseId ? 'Chưa chọn rubric' : 'Chọn lớp trước'} />
            </SelectTrigger>
            <SelectContent>
              {options.map((rubric) => (
                <SelectItem key={rubric.id} value={rubric.id}>
                  Phiên bản {rubric.version} — {rubric.totalPoints} điểm
                  {rubric.isActive ? ' (mới nhất)' : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      />
      {courseId && !rubrics.isLoading && options.length === 0 && (
        <Alert variant="info">
          <AlertDescription>
            Môn này chưa có rubric nào.{' '}
            <Link href="/teacher/rubrics" className="font-semibold underline">
              Soạn rubric
            </Link>{' '}
            rồi quay lại — hoặc cứ tạo phiên thi và gắn sau.
          </AlertDescription>
        </Alert>
      )}
    </FormField>
  );
}
```

- [ ] **Step 6: Gắn vào form**

Trong `apps/web/src/app/teacher/exam-sessions/new/page.tsx`, đặt `<RubricPicker
courseId={selectedClass?.courseId} />` ngay sau ô chọn phòng thi, và thêm
`rubricId: values.rubricId` vào body của `createExamSession.mutate(...)` trong
`onSubmit`. Thêm `rubricId: undefined` vào `EMPTY_FORM`.

- [ ] **Step 7: Chạy web test + build**

```bash
pnpm --filter web test && pnpm --filter web build
```

Expected: tất cả PASS, build thành công.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/app/teacher/exam-sessions/new
git commit -m "feat(web): choose the rubric when creating the exam session"
```

---

## Task 8: Trang Chấm điểm — đổi nguồn, thẻ chặn, gỡ editor

**Files:**
- Modify: `apps/web/src/app/teacher/grading/page.tsx`
- Test: `apps/web/src/app/teacher/grading/page.test.tsx`

**Interfaces:**
- Consumes: `useSessionOverview()` (đã có), `useSetSessionRubric()` (Task 5),
  `useRubrics(courseId)`, `useGradingResults()`, `useStartGrading()`

- [ ] **Step 1: Viết test thất bại**

Thêm vào `apps/web/src/app/teacher/grading/page.test.tsx`:

```tsx
  it('KHÔNG ẩn phiên có bài thu mà chưa gắn rubric (spec §5.3)', () => {
    // Đây là test quan trọng nhất của trang này. Ẩn phiên thiếu rubric là
    // giấu mất bài thi thật của sinh viên vì một field mà hệ thống chưa
    // từng hỏi giảng viên.
    sessionOverview.mockReturnValue({
      data: [
        {
          id: 's1',
          name: 'Phiên thiếu rubric',
          courseId: 'course-1',
          courseName: 'Lập trình Web',
          rubricId: null,
          rubricVersion: null,
          fullySubmittedCount: 3,
          partialCount: 0,
          archivedAt: null,
        },
      ],
      isLoading: false,
    });

    render(<GradingPage />);

    expect(screen.getByText(/Phiên thiếu rubric/)).toBeInTheDocument();
    expect(screen.getByText(/chưa gắn rubric/i)).toBeInTheDocument();
  });

  it('ẩn phiên chưa có bài nộp nào — không có gì để chấm', () => {
    sessionOverview.mockReturnValue({
      data: [
        {
          id: 's2',
          name: 'Phiên chưa ai nộp',
          courseId: 'course-1',
          courseName: 'Lập trình Web',
          rubricId: 'r1',
          rubricVersion: 1,
          fullySubmittedCount: 0,
          partialCount: 0,
          archivedAt: null,
        },
      ],
      isLoading: false,
    });

    render(<GradingPage />);

    expect(screen.queryByText(/Phiên chưa ai nộp/)).not.toBeInTheDocument();
  });
```

Thêm mock ở đầu file:

```tsx
const sessionOverview = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/useSubmissionOverview', () => ({ useSessionOverview: sessionOverview }));
```

- [ ] **Step 2: Chạy để xác nhận fail**

```bash
pnpm --filter web test -- grading
```

Expected: FAIL — trang vẫn dùng `useExamSessions`, chưa đọc overview.

- [ ] **Step 3: Đổi nguồn danh sách**

Trong `GradingPageContent`, thay:

```tsx
  const sessions = useExamSessions({ page: 1, pageSize: 50 });
  const classes = useTeachingClasses();
  const session = sessions.data?.items.find((item) => item.id === sessionId);
  const courseId = useMemo(() => { /* khớp tên môn */ }, []);
```

bằng:

```tsx
  // Nguồn là overview chứ không phải GET /exam-sessions: nó không phân trang
  // (GET /exam-sessions bị trần cứng 50), đã mang sẵn courseId (chấm dứt trò
  // suy courseId bằng cách khớp TÊN môn — hai môn cùng tên khác học kỳ khớp
  // nhầm), và đã có số liệu bài nộp lẫn rubric đã ghim.
  const overview = useSessionOverview();

  // Chỉ phiên có bài để chấm. KHÔNG lọc theo rubric (§5.3: phiên thiếu
  // rubric phải hiện ra kèm trạng thái chặn), và KHÔNG lọc theo archivedAt
  // (lưu trữ là khái niệm của luồng thu bài, không phải của chấm điểm).
  const gradable = useMemo(
    () =>
      (overview.data ?? []).filter(
        (item) => item.fullySubmittedCount + item.partialCount > 0,
      ),
    [overview.data],
  );

  const session = gradable.find((item) => item.id === sessionId);
  const courseId = session?.courseId;
```

Trong `<SelectItem>` của ô chọn phiên, thêm hậu tố khi thiếu rubric:

```tsx
  {item.name} — {item.courseName}
  {item.rubricId ? '' : ' — chưa gắn rubric'}
```

- [ ] **Step 4: Thẻ chặn + hiển thị rubric đã ghim**

Thay `<RubricCard courseId={courseId} />` bằng:

```tsx
  {session && !session.rubricId ? (
    <MissingRubricCard session={session} />
  ) : session ? (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-4 py-4">
        <p className="text-small">
          Phiên thi này chấm theo{' '}
          <span className="font-semibold">rubric phiên bản {session.rubricVersion}</span>.
        </p>
        <ChangeRubricButton session={session} hasResults={(results.data?.length ?? 0) > 0} />
      </CardContent>
    </Card>
  ) : null}
```

`MissingRubricCard` hiện thông báo chặn + ô chọn rubric tại chỗ (dùng
`useRubrics(session.courseId)` + `useSetSessionRubric(session.id)`), và link
`/teacher/rubrics` khi môn chưa có rubric nào. `ChangeRubricButton` disabled khi
`hasResults`, kèm `title` nêu lý do.

- [ ] **Step 5: Nút "Bắt đầu chấm" theo phiên, không theo `isActive`**

Thay `disabled={!active}` bằng `disabled={!session?.rubricId}`, và xoá dòng
`const active = rubrics.data?.find((rubric) => rubric.isActive);` khỏi
`GradingPageContent`. Thay `<Alert>` "Môn này chưa có rubric đang dùng" bằng
`MissingRubricCard` ở Step 4.

- [ ] **Step 6: Sửa key của fragment**

Trong `ResultsTable`:

```tsx
  {results.map((result) => (
-   <>
-     <TableRow key={result.id}>
+   <Fragment key={result.id}>
+     <TableRow>
```

Thêm `Fragment` vào import `react`. Đóng bằng `</Fragment>`.

- [ ] **Step 7: Chạy lại — phải xanh**

```bash
pnpm --filter web test -- grading
```

Expected: PASS, và **không còn warning `unique "key" prop`** trong output.

- [ ] **Step 8: Soát không còn resolve-động ở client (spec §7.1)**

```bash
grep -rn "isActive" apps/web/src/app/teacher/grading/
```

Expected: **0 kết quả**. `isActive` chỉ còn được dùng ở `RubricPicker` (Task 7)
để đánh dấu "(mới nhất)" — đó là công dụng hợp lệ duy nhất còn lại.

- [ ] **Step 9: Toàn bộ verification**

```bash
pnpm --filter web test && pnpm --filter web lint && pnpm --filter web build
pnpm --filter api test && pnpm --filter api test:e2e && pnpm --filter api lint && pnpm --filter api build
```

Expected: tất cả PASS.

- [ ] **Step 10: Commit**

```bash
git add apps/web/src/app/teacher/grading
git commit -m "feat(web): grade against the session's own rubric, and never hide a session for lacking one"
```

---

## Self-Review

**Spec coverage — mọi mục có task thực thi:**

| Spec | Task |
|---|---|
| §2 không migration | Global Constraints |
| §3.1 `rubricId` tuỳ chọn | Task 1 |
| §3.2 kiểm cùng môn, một phép kiểm | Task 1 Step 5 |
| §3.2.1 rubric không có chủ | Task 1 Step 1 (test), Global Constraints |
| §3.3 PATCH hẹp | Task 2 |
| §3.4 `startGrading` đọc từ phiên + `findById` | Task 1 Step 5 (findById), Task 3 Step 5 |
| §3.5 đổi tên `findActive` | Task 3 Steps 3-4 |
| §3.6 DTO thêm rubricId/Version, không thêm courseId | Task 1 Step 4, Task 4 Step 3 |
| §4.1 `/teacher/rubrics` | Task 6 |
| §4.2 ô chọn ở form tạo | Task 7 |
| §4.3 trang Chấm điểm | Task 8 |
| §5 trạng thái chặn, không ẩn | Task 4 Step 1 (backend), Task 8 Steps 1, 4 |
| §6 khiếm khuyết #1 | Task 8 Step 3 (xoá đoạn khớp tên môn) |
| §6 khiếm khuyết #2 | Task 8 Step 6 |
| §6 khiếm khuyết #3 | Task 8 Step 3 (đổi nguồn, hết trần 50) |
| §6 khiếm khuyết #4 | Task 1 + 3 |
| §7.1 rename + grep | Task 3 Steps 4, 9; Task 8 Step 8 |
| §7.2 giữ `isActive` | Task 7 Step 5, Task 8 Step 8 |
| §8.1 test chốt | Task 3 Step 1 |
| §8.2 test backend | Task 1, 2, 3 |
| §8.3 chống ẩn, hai tầng | Task 4 Step 1 + Task 8 Step 1 |
| §8.4 test web | Task 6, 7, 8 |

**Đã sửa khi tự soát:**

1. §3.2.1 nói rubric không có chủ, nhưng Task 1 ban đầu định inject
   `RubricService` vào `ExamSessionService` — sẽ tạo vòng lặp module. Đổi sang
   inject `Repository<RubricEntity>` thẳng, ghi rõ ở Task 1 Step 5.
2. `findById` được dùng ở Task 1 nhưng spec đặt nó ở §3.4 (Task 3). Chuyển việc
   tạo hàm sang Task 1 để mỗi task chạy được độc lập; Task 3 chỉ dùng lại.
3. `toResponseDto` phải đổi chữ ký để mang `rubricVersion` — ban đầu bỏ sót, đã
   thêm Task 1 Step 6.
4. Task 3 Step 7 ban đầu chỉ nói "sửa test cũ". Nói rõ: các test trong
   `describe('the boundary between collecting and grading')` phải **gắn rubric
   lúc tạo phiên**, nếu không `startGrading` sẽ 400 và cả nhóm đỏ.
5. `rubricId: ''` từ `<Select>` — ban đầu không xử lý, sẽ chặn form hợp lệ bằng
   lỗi uuid khó hiểu. Đã thêm test và `transform` ở Task 7.

**Ngoài phạm vi (spec §9), không task nào đụng:** TeacherReview, GradeExport,
chấm lẻ/chấm lại, BullMQ, provider LLM thật, calibration, trang lobby.
