# "Quản lý bài thu" Roll-up Page — Implementation Plan (Tầng 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thay bảng phẳng "Quản lý bài thu" (đã xoá) bằng một trang roll-up theo phiên thi: dải "Cần chú ý" ghim trên cùng, nhóm theo Môn/Lớp bên dưới, search theo MSSV dẫn tới đúng một sinh viên trong trang chi tiết phiên.

**Architecture:** Một endpoint roll-up mới (`GET /submissions/overview`) tính sẵn mọi con số bằng **một** truy vấn CTE pre-aggregate (chống join fan-out ba chiều). Frontend không phân trang: tải hết rồi nhóm ở client. Quy tắc "cần chú ý" là một module thuần hàm, test riêng, không dính component. Trang chi tiết phiên khôi phục từ git và nhận thêm `?student=<mssv>` để highlight + mở sẵn dialog của đúng SV đó.

**Tech Stack:** NestJS 10 + TypeORM 0.3 + Postgres (schema `examcollect`) · Next.js 15 App Router + React 19 + TanStack Query 5 + Tailwind · Jest (api, `*.spec.ts` + `test/*.e2e-spec.ts` chạy DB thật) · Vitest + Testing Library (web) · openapi-typescript sinh `packages/shared/src/api/schema.d.ts`

**Spec:** `docs/superpowers/specs/2026-09-03-submissions-rollup-page-design.md` — plan này lập luận từ spec đó; executor phải đọc cả hai. Mọi tham chiếu `§N` bên dưới trỏ vào spec.

## Global Constraints

- **Schema Postgres:** `process.env.DATABASE_SCHEMA ?? 'examcollect'`. Raw SQL **không được hardcode** `examcollect.` — lấy từ `dataSource.options.schema`.
- **Grace period:** `30 * 60_000` ms, tính từ **`endTime`** (không phải từ lúc chốt tay). Phải khớp `SUBMISSION_GRACE_PERIOD_MS` ở `apps/api/src/submission/submission.types.ts`.
- **Định nghĩa roster (bất biến, khớp `AttendanceService.buildView`):** `enrollment WHERE course_id = session.course_id AND home_class_id = session.class_id`. Bảng `enrollment` **không có** cột `class_id`.
- **`student_mssv` là `citext`** ở cả `submission` và `enrollment` → so sánh trong SQL tự động case-insensitive, **không** thêm `LOWER()`.
- **Phạm vi teacher:** mọi truy vấn khoá bằng `exam_session.teacher_id = :teacherId`, **không bao giờ** qua tham số của caller.
- **`COUNT`/`SUM` của Postgres trả về `string`** qua node-postgres (bigint/numeric). Mọi con số phải `Number(...)` trước khi trả ra API.
- **Không được sửa một dòng nào** trong `apps/web/src/app/(exam-live)/exam-sessions/[id]/page.test.tsx` và các test hiện có của `SubmissionStatusTable.test.tsx`. Chúng là regression check của Task 6/8.
- **Copy tiếng Việt** dùng nguyên văn spec §3.4, §4.1, §5.4 — không tự viết lại.
- **Không render nút trông sống mà bấm không ra gì** (§5.4).
- **Lệnh chạy test:** api unit `pnpm --filter api test`; api e2e `pnpm --filter api test:e2e` (**cần Postgres + MinIO đang chạy**: `docker compose up -d`); web `pnpm --filter web test`; lint `pnpm --filter <pkg> lint`.

---

## File Structure

**Tạo mới — backend**
| File | Trách nhiệm |
|---|---|
| `apps/api/src/submission/submission-overview.types.ts` | `SessionOverviewItem` — hình dạng một dòng roll-up trên wire |
| `apps/api/src/submission/submission-overview.service.ts` | Đúng một việc: chạy truy vấn CTE và map kiểu. Tách khỏi `submission.service.ts` (đã ~490 dòng, đang lo upload/confirm/storage — thêm vào đó là trộn hai trách nhiệm) |
| `apps/api/test/submission-overview.e2e-spec.ts` | E2E trên DB thật — nơi duy nhất bắt được fan-out |

**Tạo mới — frontend**
| File | Trách nhiệm |
|---|---|
| `apps/web/src/lib/api/submissions.ts` | API client: `listSessionOverview` + `listTeacherSubmissions` (khôi phục cho search) |
| `apps/web/src/hooks/useSubmissionOverview.ts` | Hai hook TanStack Query |
| `apps/web/src/lib/submission-attention.ts` | **Toàn bộ quy tắc §4.1–§4.3 dạng thuần hàm.** Zero import React |
| `apps/web/src/lib/submission-attention.test.ts` | Unit test cho module trên |
| `apps/web/src/app/teacher/submissions/page.tsx` | Trang roll-up (Task 4 + 5) |
| `apps/web/src/app/teacher/submissions/page.test.tsx` | |
| `apps/web/src/app/teacher/submissions/[sessionId]/page.tsx` | Trang chi tiết (khôi phục từ git + `?student=`) |
| `apps/web/src/app/teacher/submissions/[sessionId]/page.test.tsx` | |

**Sửa**
| File | Sửa gì |
|---|---|
| `apps/api/src/submission/submission.controller.ts` | *(không sửa — chỉ để tránh nhầm: route mới nằm ở file dưới)* |
| `apps/api/src/submission/teacher-submissions.controller.ts` | Thêm `@Get('overview')` |
| `apps/api/src/submission/submission.module.ts` | Provide `SubmissionOverviewService` |
| `packages/shared/src/api/schema.d.ts` | **Sinh lại**, không sửa tay |
| `apps/web/src/lib/nav-config.ts` | Thêm lại nav entry + import `Inbox` |
| `apps/web/src/app/(exam-live)/exam-sessions/[id]/_components/SubmissionStatusTable.tsx` | Hai prop optional: `focusStudentMssv`, `gradingByMssv` |
| `apps/web/src/app/(exam-live)/exam-sessions/[id]/_components/SubmissionStatusTable.test.tsx` | **Chỉ THÊM** describe block mới |
| `apps/web/src/lib/exam-session-display.ts` | Sửa docblock đã lỗi thời (§4.3) |

---

## Task 1: Truy vấn roll-up + service (phần rủi ro nhất)

Task này **chỉ** làm đúng số. Không route, không frontend. Lý do tách: nếu số sai thì mọi thứ phía trên vô nghĩa, và fan-out chỉ bắt được bằng DB thật.

**Files:**
- Create: `apps/api/src/submission/submission-overview.types.ts`
- Create: `apps/api/src/submission/submission-overview.service.ts`
- Create: `apps/api/test/submission-overview.e2e-spec.ts`
- Modify: `apps/api/src/submission/submission.module.ts`

**Interfaces:**
- Consumes: `DataSource` từ TypeORM; entity/bảng có sẵn (`exam_session`, `submission`, `enrollment`, `required_deliverable`, `course`, `class`, `room`).
- Produces:
  - `interface SessionOverviewItem` (17 field, xem Step 1)
  - `class SubmissionOverviewService { overviewForTeacher(teacherId: string): Promise<SessionOverviewItem[]> }`

- [ ] **Step 1: Viết file type (không có test riêng — nó là kiểu, test nằm ở Step 2)**

`apps/api/src/submission/submission-overview.types.ts`:

```ts
import type { ExamSessionStatus, ExamType } from '../exam-session/entities/exam-session.entity';

/**
 * Một dòng của "Quản lý bài thu" — xem
 * docs/superpowers/specs/2026-09-03-submissions-rollup-page-design.md §3.1.
 *
 * Năm field định danh đầu (course/class/examType/startTime/room) tồn tại vì
 * GV phải nhận ra "à, kỳ này" sau nhiều tháng — §1.2.
 */
export interface SessionOverviewItem {
  id: string;
  name: string;
  code: string;
  courseId: string;
  courseName: string;
  classId: string | null;
  className: string | null;
  roomName: string;
  examType: ExamType;
  startTime: string;
  endTime: string;
  status: ExamSessionStatus;

  requiredDeliverableCount: number;
  /** |roster ∪ người đã nộp| — §3.2. KHÔNG phải rosterSize. */
  expectedCount: number;
  /** false khi phiên không gắn lớp, hoặc lớp chưa có roster. */
  rosterKnown: boolean;
  fullySubmittedCount: number;
  partialCount: number;
  notSubmittedCount: number;
  /** Đếm theo FILE, không theo sinh viên. */
  invalidFileCount: number;
}
```

- [ ] **Step 2: Viết e2e test thất bại**

`apps/api/test/submission-overview.e2e-spec.ts`. Seeding theo đúng pattern của `test/teacher-submissions.e2e-spec.ts` nhưng **insert `submission` trực tiếp bằng SQL** thay vì đi qua socket — nhanh hơn, và cho dựng chính xác kịch bản fan-out.

```ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';
import { createTestAccount } from './helpers/create-account';

/**
 * GET /submissions/overview — §3.3. Chạy trên Postgres thật vì bug cần bắt
 * (join fan-out) chỉ tồn tại ở tầng SQL: repository mock không thể tái hiện.
 */
describe('Submission overview (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let schema: string;

  const stamp = Date.now();
  let teacherToken: string;
  let teacherId: string;
  let courseId: string;
  let classId: string;
  let roomId: string;

  /** Roster 40 SV cho lớp đang xét — mẫu số của mọi assertion bên dưới. */
  const ROSTER: string[] = Array.from({ length: 40 }, (_, i) =>
    `OV${stamp}${String(i).padStart(2, '0')}`.slice(0, 20),
  );

  async function createSession(
    name: string,
    filenames: string[],
    opts: { classId: string | null; startOffsetMs: number; endOffsetMs: number },
  ): Promise<{ id: string; deliverableIds: string[] }> {
    const response = await request(app.getHttpServer())
      .post('/exam-sessions')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        name,
        classId: opts.classId,
        roomId,
        examType: 'TK',
        startTime: new Date(Date.now() + opts.startOffsetMs).toISOString(),
        endTime: new Date(Date.now() + opts.endOffsetMs).toISOString(),
        requiredFilenames: filenames,
      });
    expect(response.status).toBe(201);
    return {
      id: response.body.id as string,
      deliverableIds: (response.body.requiredDeliverables as { id: string }[]).map((d) => d.id),
    };
  }

  /** Ghi thẳng một dòng submission — bỏ qua socket/storage, chỉ cần con số. */
  async function insertSubmission(
    sessionId: string,
    deliverableId: string,
    mssv: string,
    status: 'collected' | 'invalid',
  ): Promise<void> {
    await dataSource.query(
      `INSERT INTO ${schema}.submission
         (exam_session_id, required_deliverable_id, student_mssv, student_name_input, status)
       VALUES ($1, $2, $3, $4, $5)`,
      [sessionId, deliverableId, mssv, `SV ${mssv}`, status],
    );
  }

  async function fetchOverview(): Promise<Record<string, any>[]> {
    const response = await request(app.getHttpServer())
      .get('/submissions/overview')
      .set('Authorization', `Bearer ${teacherToken}`);
    expect(response.status).toBe(200);
    return response.body.items;
  }

  const bySessionId = (items: Record<string, any>[], id: string) => {
    const found = items.find((item) => item.id === id);
    if (!found) throw new Error(`session ${id} missing from overview`);
    return found;
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new PostgresExceptionFilter());
    await app.listen(0);
    dataSource = app.get(DataSource);
    schema = (dataSource.options as { schema?: string }).schema ?? 'examcollect';

    const email = `overview_${stamp}@example.com`;
    teacherId = await createTestAccount(dataSource, {
      email,
      password: 'correct-horse-battery',
      role: 'teacher',
    });
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'correct-horse-battery' });
    teacherToken = login.body.accessToken;

    const [semester] = await dataSource.query(
      `INSERT INTO ${schema}.semester (name, start_date, end_date)
       VALUES ($1, '2026-01-01', '2026-06-01') RETURNING id`,
      [`Overview Semester ${stamp}`],
    );
    const [course] = await dataSource.query(
      `INSERT INTO ${schema}.course (code, name, semester_id)
       VALUES ($1, 'Overview Course', $2) RETURNING id`,
      [`OVC${stamp}`.slice(0, 20), semester.id],
    );
    courseId = course.id;
    const [room] = await dataSource.query(
      `INSERT INTO ${schema}.room (name, capacity) VALUES ($1, 50) RETURNING id`,
      [`Overview Room ${stamp}`],
    );
    roomId = room.id;
    const [klass] = await dataSource.query(
      `INSERT INTO ${schema}.class (course_id, name, teacher_id)
       VALUES ($1, 'N01', $2) RETURNING id`,
      [courseId, teacherId],
    );
    classId = klass.id;

    // Roster 40 người, đúng định nghĩa (course_id + home_class_id).
    for (const mssv of ROSTER) {
      await dataSource.query(
        `INSERT INTO ${schema}.enrollment
           (student_mssv, student_name, course_id, home_class_id, home_teacher_id)
         VALUES ($1, $2, $3, $4, $5)`,
        [mssv, `SV ${mssv}`, courseId, classId, teacherId],
      );
    }
  }, 60_000);

  afterAll(async () => {
    await app.close();
  });

  it('fan-out ba chiều: 1 SV nộp đủ 3 file trên roster 40 không bị nhân lên', async () => {
    const session = await createSession(
      `Fanout ${stamp}`,
      ['Cau1.docx', 'Cau2.docx', 'Cau3.docx'],
      { classId, startOffsetMs: -7_200_000, endOffsetMs: -3_600_000 },
    );
    for (const deliverableId of session.deliverableIds) {
      await insertSubmission(session.id, deliverableId, ROSTER[0], 'collected');
    }

    const item = bySessionId(await fetchOverview(), session.id);

    // Nếu SQL join thô rồi GROUP BY, con số này sẽ là 3, 40 hoặc 120.
    expect(item.fullySubmittedCount).toBe(1);
    expect(item.partialCount).toBe(0);
    expect(item.notSubmittedCount).toBe(39);
    expect(item.expectedCount).toBe(40);
    expect(item.requiredDeliverableCount).toBe(3);
    expect(item.rosterKnown).toBe(true);
  }, 30_000);

  it('invalidFileCount đếm FILE và không nhân theo roster', async () => {
    const session = await createSession(
      `Invalid ${stamp}`,
      ['Cau1.docx', 'Cau2.docx', 'Cau3.docx'],
      { classId, startOffsetMs: -7_200_000, endOffsetMs: -3_600_000 },
    );
    await insertSubmission(session.id, session.deliverableIds[0], ROSTER[1], 'invalid');
    await insertSubmission(session.id, session.deliverableIds[1], ROSTER[1], 'invalid');

    const item = bySessionId(await fetchOverview(), session.id);

    // Nhân chéo sẽ cho 80 (× roster) hoặc 240 (× roster × deliverable).
    expect(item.invalidFileCount).toBe(2);
  }, 30_000);

  it('SV chỉ có file invalid được tính là "nộp thiếu", KHÔNG phải "chưa nộp"', async () => {
    const session = await createSession(
      `OnlyInvalid ${stamp}`,
      ['Cau1.docx', 'Cau2.docx'],
      { classId, startOffsetMs: -7_200_000, endOffsetMs: -3_600_000 },
    );
    await insertSubmission(session.id, session.deliverableIds[0], ROSTER[2], 'invalid');

    const item = bySessionId(await fetchOverview(), session.id);

    expect(item.partialCount).toBe(1);
    expect(item.notSubmittedCount).toBe(39);
    expect(item.fullySubmittedCount).toBe(0);
    expect(item.invalidFileCount).toBe(1);
  }, 30_000);

  it('requiredDeliverableCount = 0: không ai nộp đủ, API vẫn trả bình thường', async () => {
    const session = await createSession(`NoDeliv ${stamp}`, [], {
      classId,
      startOffsetMs: -7_200_000,
      endOffsetMs: -3_600_000,
    });

    const item = bySessionId(await fetchOverview(), session.id);

    expect(item.requiredDeliverableCount).toBe(0);
    expect(item.fullySubmittedCount).toBe(0);
    expect(item.expectedCount).toBe(40);
  }, 30_000);

  it('bất biến: fully + partial + notSubmitted === expectedCount, kể cả khi có SV thi ghép', async () => {
    // SV thi ghép: enrolled cùng course nhưng home_class_id là lớp KHÁC ->
    // không thuộc roster, nhưng có bài nộp -> phải nằm trong expectedCount.
    const [otherClass] = await dataSource.query(
      `INSERT INTO ${schema}.class (course_id, name, teacher_id)
       VALUES ($1, 'N02', $2) RETURNING id`,
      [courseId, teacherId],
    );
    const makeupMssv = `OVM${stamp}`.slice(0, 20);
    await dataSource.query(
      `INSERT INTO ${schema}.enrollment
         (student_mssv, student_name, course_id, home_class_id, home_teacher_id)
       VALUES ($1, 'SV thi ghép', $2, $3, $4)`,
      [makeupMssv, courseId, otherClass.id, teacherId],
    );

    const session = await createSession(
      `Union ${stamp}`,
      ['Cau1.docx', 'Cau2.docx'],
      { classId, startOffsetMs: -7_200_000, endOffsetMs: -3_600_000 },
    );
    await insertSubmission(session.id, session.deliverableIds[0], ROSTER[3], 'collected');
    await insertSubmission(session.id, session.deliverableIds[1], ROSTER[3], 'collected');
    await insertSubmission(session.id, session.deliverableIds[0], ROSTER[4], 'collected');
    await insertSubmission(session.id, session.deliverableIds[0], makeupMssv, 'collected');

    const item = bySessionId(await fetchOverview(), session.id);

    expect(item.expectedCount).toBe(41); // 40 roster + 1 thi ghép
    expect(item.fullySubmittedCount).toBe(1); // ROSTER[3]
    expect(item.partialCount).toBe(2); // ROSTER[4] + SV thi ghép
    expect(item.notSubmittedCount).toBe(38);
    expect(
      item.fullySubmittedCount + item.partialCount + item.notSubmittedCount,
    ).toBe(item.expectedCount);
  }, 30_000);

  it('phiên không gắn lớp: rosterKnown false, notSubmittedCount 0', async () => {
    const session = await createSession(`NoClass ${stamp}`, ['Cau1.docx'], {
      classId: null,
      startOffsetMs: -7_200_000,
      endOffsetMs: -3_600_000,
    });
    await insertSubmission(session.id, session.deliverableIds[0], ROSTER[5], 'collected');

    const item = bySessionId(await fetchOverview(), session.id);

    expect(item.rosterKnown).toBe(false);
    expect(item.notSubmittedCount).toBe(0);
    expect(item.expectedCount).toBe(1);
    expect(item.fullySubmittedCount).toBe(1);
  }, 30_000);

  it('không rò rỉ phiên của giảng viên khác', async () => {
    const otherEmail = `overview_other_${stamp}@example.com`;
    const otherTeacherId = await createTestAccount(dataSource, {
      email: otherEmail,
      password: 'correct-horse-battery',
      role: 'teacher',
    });
    const [foreignCourse] = await dataSource.query(
      `INSERT INTO ${schema}.course (code, name, semester_id)
       SELECT $1, 'Foreign', semester_id FROM ${schema}.course WHERE id = $2 RETURNING id`,
      [`OVF${stamp}`.slice(0, 20), courseId],
    );
    const [foreignClass] = await dataSource.query(
      `INSERT INTO ${schema}.class (course_id, name, teacher_id)
       VALUES ($1, 'N01', $2) RETURNING id`,
      [foreignCourse.id, otherTeacherId],
    );
    const otherLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: otherEmail, password: 'correct-horse-battery' });
    const foreign = await request(app.getHttpServer())
      .post('/exam-sessions')
      .set('Authorization', `Bearer ${otherLogin.body.accessToken}`)
      .send({
        name: `Phiên lạ ${stamp}`,
        classId: foreignClass.id,
        roomId,
        examType: 'TK',
        startTime: new Date(Date.now() - 7_200_000).toISOString(),
        endTime: new Date(Date.now() - 3_600_000).toISOString(),
        requiredFilenames: ['Cau1.docx'],
      });
    expect(foreign.status).toBe(201);

    const items = await fetchOverview();

    expect(items.some((item) => item.id === foreign.body.id)).toBe(false);
  }, 30_000);
});
```

- [ ] **Step 3: Chạy test để xác nhận nó FAIL**

```bash
docker compose up -d
pnpm --filter api test:e2e -- submission-overview
```

Expected: FAIL — mọi `it` trả 404 ở `expect(response.status).toBe(200)` vì route `/submissions/overview` chưa tồn tại.

- [ ] **Step 4: Viết service**

`apps/api/src/submission/submission-overview.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { SessionOverviewItem } from './submission-overview.types';

/** Hàng thô từ Postgres: mọi COUNT/SUM về đây dưới dạng string. */
interface OverviewRawRow {
  id: string;
  name: string;
  code: string;
  course_id: string;
  course_name: string;
  class_id: string | null;
  class_name: string | null;
  room_name: string;
  exam_type: string;
  start_time: Date;
  end_time: Date;
  status: string;
  required_count: string | null;
  roster_size: string | null;
  expected_count: string | null;
  fully_submitted: string | null;
  partial: string | null;
  not_submitted: string | null;
  invalid_file_count: string | null;
}

/**
 * "Quản lý bài thu" — roll-up mọi phiên của một giảng viên trong MỘT truy vấn.
 *
 * Tách khỏi SubmissionService có chủ đích: file đó lo vòng đời upload/confirm/
 * storage, còn đây là một câu đọc thuần. Xem spec §3.3 để hiểu vì sao truy vấn
 * BẮT BUỘC pre-aggregate bằng CTE thay vì join thô rồi GROUP BY.
 */
@Injectable()
export class SubmissionOverviewService {
  constructor(private readonly dataSource: DataSource) {}

  async overviewForTeacher(teacherId: string): Promise<SessionOverviewItem[]> {
    // Tên schema đến từ cấu hình (DATABASE_SCHEMA), không phải từ caller —
    // nội suy thẳng là an toàn, và cần thiết vì identifier không tham số hoá được.
    const schema = (this.dataSource.options as { schema?: string }).schema ?? 'examcollect';

    const rows: OverviewRawRow[] = await this.dataSource.query(
      `
      WITH deliv AS (
        SELECT exam_session_id, COUNT(*) AS required_count
        FROM ${schema}.required_deliverable
        GROUP BY exam_session_id
      ),
      roster_students AS (
        -- Khớp AttendanceService.buildView: enrollment khoá theo
        -- (course_id, home_class_id). class_id IS NULL -> roster rỗng.
        SELECT s.id AS exam_session_id, e.student_mssv
        FROM ${schema}.exam_session s
        JOIN ${schema}.enrollment e
          ON e.course_id = s.course_id
         AND e.home_class_id = s.class_id
        WHERE s.teacher_id = $1
      ),
      per_student AS (
        -- TẦNG 1: một dòng mỗi (phiên, SV đã nộp gì đó).
        SELECT sub.exam_session_id,
               sub.student_mssv,
               COUNT(DISTINCT sub.required_deliverable_id)
                 FILTER (WHERE sub.status = 'collected') AS collected_files,
               COUNT(DISTINCT sub.id)
                 FILTER (WHERE sub.status = 'invalid')   AS invalid_files
        FROM ${schema}.submission sub
        JOIN ${schema}.exam_session s ON s.id = sub.exam_session_id
        WHERE s.teacher_id = $1
        GROUP BY sub.exam_session_id, sub.student_mssv
      ),
      universe AS (
        -- roster ∪ người đã nộp — bản SQL của buildSubmissionRows (§3.2).
        SELECT COALESCE(r.exam_session_id, p.exam_session_id) AS exam_session_id,
               COALESCE(p.collected_files, 0)                AS collected_files,
               COALESCE(p.invalid_files, 0)                   AS invalid_files
        FROM roster_students r
        FULL OUTER JOIN per_student p
          ON p.exam_session_id = r.exam_session_id
         AND p.student_mssv    = r.student_mssv
      ),
      per_session AS (
        -- TẦNG 2: một dòng mỗi phiên.
        SELECT u.exam_session_id,
               COUNT(*) AS expected_count,
               COUNT(*) FILTER (
                 WHERE COALESCE(d.required_count, 0) > 0
                   AND u.collected_files >= COALESCE(d.required_count, 0)
               ) AS fully_submitted,
               COUNT(*) FILTER (
                 WHERE (u.collected_files > 0 OR u.invalid_files > 0)
                   AND u.collected_files < COALESCE(d.required_count, 0)
               ) AS partial,
               COUNT(*) FILTER (
                 WHERE u.collected_files = 0 AND u.invalid_files = 0
               ) AS not_submitted,
               SUM(u.invalid_files) AS invalid_file_count
        FROM universe u
        LEFT JOIN deliv d ON d.exam_session_id = u.exam_session_id
        GROUP BY u.exam_session_id
      ),
      roster_size AS (
        SELECT exam_session_id, COUNT(*) AS roster_size
        FROM roster_students
        GROUP BY exam_session_id
      )
      SELECT s.id, s.name, s.code,
             s.course_id, c.name AS course_name,
             s.class_id,  cl.name AS class_name,
             rm.name AS room_name,
             s.exam_type, s.start_time, s.end_time, s.status,
             d.required_count,
             rs.roster_size,
             ps.expected_count, ps.fully_submitted, ps.partial,
             ps.not_submitted, ps.invalid_file_count
      FROM ${schema}.exam_session s
      JOIN      ${schema}.course c  ON c.id  = s.course_id
      LEFT JOIN ${schema}.class  cl ON cl.id = s.class_id
      JOIN      ${schema}.room   rm ON rm.id = s.room_id
      LEFT JOIN deliv       d  ON d.exam_session_id  = s.id
      LEFT JOIN per_session ps ON ps.exam_session_id = s.id
      LEFT JOIN roster_size rs ON rs.exam_session_id = s.id
      WHERE s.teacher_id = $1
      ORDER BY s.start_time DESC
      `,
      [teacherId],
    );

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      code: row.code,
      courseId: row.course_id,
      courseName: row.course_name,
      classId: row.class_id,
      className: row.class_name,
      roomName: row.room_name,
      examType: row.exam_type as SessionOverviewItem['examType'],
      startTime: new Date(row.start_time).toISOString(),
      endTime: new Date(row.end_time).toISOString(),
      status: row.status as SessionOverviewItem['status'],
      requiredDeliverableCount: toCount(row.required_count),
      expectedCount: toCount(row.expected_count),
      rosterKnown: toCount(row.roster_size) > 0,
      fullySubmittedCount: toCount(row.fully_submitted),
      partialCount: toCount(row.partial),
      notSubmittedCount: toCount(row.not_submitted),
      invalidFileCount: toCount(row.invalid_file_count),
    }));
  }
}

/** bigint/numeric của Postgres về đây là string; NULL là "chưa có dòng nào". */
function toCount(value: string | null): number {
  return value === null ? 0 : Number(value);
}
```

- [ ] **Step 5: Đăng ký service + thêm route tạm để test chạy được**

Trong `apps/api/src/submission/submission.module.ts`: thêm `SubmissionOverviewService` vào `providers` (và `exports` nếu module khác cần — hiện không cần).

Trong `apps/api/src/submission/teacher-submissions.controller.ts`: thêm vào constructor `private readonly overview: SubmissionOverviewService,` và thêm handler **phía trên** `list()`:

```ts
  /**
   * Roll-up theo phiên cho "Quản lý bài thu". Không phân trang — một GV có
   * vài chục phiên (spec §1.2), nên phân trang chỉ thêm state mà không giảm
   * tải gì.
   */
  @Get('overview')
  @Roles('teacher')
  async listOverview(@Req() req: Request) {
    const items = await this.overview.overviewForTeacher(req.user!.sub);
    return { items };
  }
```

- [ ] **Step 6: Chạy test để xác nhận PASS**

```bash
pnpm --filter api test:e2e -- submission-overview
```

Expected: PASS — 7/7.

- [ ] **Step 7: Lint + commit**

```bash
pnpm --filter api lint
git add apps/api/src/submission/submission-overview.types.ts \
        apps/api/src/submission/submission-overview.service.ts \
        apps/api/src/submission/submission.module.ts \
        apps/api/src/submission/teacher-submissions.controller.ts \
        apps/api/test/submission-overview.e2e-spec.ts
git commit -m "feat(api): add GET /submissions/overview roll-up query

Pre-aggregated CTEs, not a flat join + GROUP BY: exam_session has three
one-to-many relations (submission, enrollment, required_deliverable) and
joining them raw multiplies row counts. See spec section 3.3."
```

---

## Task 2: Sinh lại OpenAPI schema + API client + hook

**Files:**
- Modify: `packages/shared/src/api/schema.d.ts` (**sinh lại, không sửa tay**)
- Create: `apps/web/src/lib/api/submissions.ts`
- Create: `apps/web/src/hooks/useSubmissionOverview.ts`

**Interfaces:**
- Consumes: `GET /submissions/overview` (Task 1), `GET /submissions` (đã có sẵn).
- Produces:
  - `interface SessionOverviewItem` (bản frontend, mirror Task 1)
  - `interface TeacherSubmission`, `interface SearchSubmissionsParams`
  - `listSessionOverview(): Promise<SessionOverviewItem[]>`
  - `listTeacherSubmissions(params): Promise<{ items: TeacherSubmission[]; total: number }>`
  - `useSessionOverview()`, `useTeacherSubmissions(params, enabled)`

- [ ] **Step 1: Sinh lại schema.d.ts (cần API đang chạy)**

```bash
docker compose up -d
pnpm --filter api dev &   # đợi tới khi log "Nest application successfully started"
pnpm --filter @cine/shared generate:api-client
```

Kiểm tra route mới đã có mặt:

```bash
grep -n '"/submissions/overview"' packages/shared/src/api/schema.d.ts
```

Expected: in ra một dòng. Nếu trống → API chưa chạy hoặc route chưa đăng ký; đừng sửa tay file này.

- [ ] **Step 2: Viết API client**

`apps/web/src/lib/api/submissions.ts`:

```ts
import { apiClient } from '@/lib/api-client';

/** Mirror SessionOverviewItem (apps/api/src/submission/submission-overview.types.ts). */
export interface SessionOverviewItem {
  id: string;
  name: string;
  code: string;
  courseId: string;
  courseName: string;
  classId: string | null;
  className: string | null;
  roomName: string;
  examType: 'TK' | 'GK' | 'CK';
  startTime: string;
  endTime: string;
  status: 'draft' | 'scheduled' | 'active' | 'completed' | 'cancelled';
  requiredDeliverableCount: number;
  expectedCount: number;
  rosterKnown: boolean;
  fullySubmittedCount: number;
  partialCount: number;
  notSubmittedCount: number;
  invalidFileCount: number;
}

/**
 * Một bài nộp lẻ — chỉ còn dùng cho luồng search theo MSSV (spec §3.4).
 * Bảng phẳng cũ đã bị xoá; endpoint thì không.
 */
export interface TeacherSubmission {
  id: string;
  examSessionId: string;
  examSessionName: string;
  requiredFilename: string;
  studentMssv: string;
  studentNameInput: string;
  status: 'received' | 'validated' | 'collected' | 'invalid';
  submittedAt: string;
  fileSize: string | null;
  downloadUrl: string | null;
}

export interface SearchSubmissionsParams {
  page: number;
  pageSize: number;
  /** Khớp MSSV HOẶC tên SV đã gõ, case-insensitive. */
  search?: string;
}

function throwIfFailed(error: unknown, response: Response): void {
  if (error || !response.ok) {
    throw error ?? new Error(`Yêu cầu thất bại (HTTP ${response.status})`);
  }
}

export async function listSessionOverview(): Promise<SessionOverviewItem[]> {
  const { data, error, response } = await apiClient.GET('/submissions/overview');
  throwIfFailed(error, response);
  // Cast: ExamSessionStatus/ExamType là string union không có
  // @ApiProperty({ enum }), cùng khoảng trống DTO mà lib/api/exam-session.ts
  // đã ghi lại cho chính nó.
  return (data as unknown as { items: SessionOverviewItem[] }).items;
}

export async function listTeacherSubmissions(
  params: SearchSubmissionsParams,
): Promise<{ items: TeacherSubmission[]; total: number }> {
  const { data, error, response } = await apiClient.GET('/submissions', {
    params: { query: params },
  });
  throwIfFailed(error, response);
  return data as unknown as { items: TeacherSubmission[]; total: number };
}
```

- [ ] **Step 3: Viết hook**

`apps/web/src/hooks/useSubmissionOverview.ts`:

```ts
'use client';

import { useQuery } from '@tanstack/react-query';
import {
  listSessionOverview,
  listTeacherSubmissions,
  type SearchSubmissionsParams,
} from '@/lib/api/submissions';

/** Mọi phiên của GV này kèm số liệu roll-up. Không phân trang — spec §1.2. */
export function useSessionOverview() {
  return useQuery({
    queryKey: ['submissions', 'overview'],
    queryFn: listSessionOverview,
  });
}

/**
 * Chỉ chạy khi có từ khoá — luồng search (§4.5). `enabled` để trang không
 * gọi endpoint này lúc ô search còn rỗng.
 */
export function useTeacherSubmissions(params: SearchSubmissionsParams, enabled: boolean) {
  return useQuery({
    queryKey: ['submissions', 'search', params],
    queryFn: () => listTeacherSubmissions(params),
    enabled,
  });
}
```

- [ ] **Step 4: Typecheck + lint**

```bash
pnpm --filter web exec tsc --noEmit
pnpm --filter web lint
```

Expected: không lỗi mới ở hai file vừa tạo. **Lưu ý hai lỗi `tsc` có sẵn từ trước, KHÔNG phải do task này**: `SubmissionStatusTable.tsx` dùng `variant="secondary"` (Button không có variant đó) và `read-workbook.test.ts` lệch type `File`. Task 6 sẽ sửa cái thứ nhất.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/api/schema.d.ts \
        apps/web/src/lib/api/submissions.ts \
        apps/web/src/hooks/useSubmissionOverview.ts
git commit -m "feat(web): api client + hooks for submission overview"
```

---

## Task 3: Quy tắc "cần chú ý" dạng thuần hàm

Không React, không component. Đây là nơi mọi luật §4.1–§4.3 sống, và là nơi test chúng.

**Files:**
- Create: `apps/web/src/lib/submission-attention.ts`
- Create: `apps/web/src/lib/submission-attention.test.ts`
- Modify: `apps/web/src/lib/exam-session-display.ts` (chỉ sửa docblock lỗi thời)

**Interfaces:**
- Consumes: `SessionOverviewItem` (Task 2).
- Produces:
  - `const SUBMISSION_GRACE_MS: number`
  - `type SessionPhase = 'draft' | 'cancelled' | 'upcoming' | 'running' | 'collecting' | 'ended'`
  - `interface AttentionReason { kind; count; label; variant; priority }`
  - `getSessionPhase(item, now): SessionPhase`
  - `getAttentionReasons(item, now): AttentionReason[]`
  - `hasRatio(item): boolean`
  - `compareSessions(a, b, now): number`
  - `interface SessionGroup { key; courseName; className; sessions; attentionCount }`
  - `groupByCourseClass(items, now): SessionGroup[]`

- [ ] **Step 1: Viết test thất bại**

`apps/web/src/lib/submission-attention.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  SUBMISSION_GRACE_MS,
  compareSessions,
  getAttentionReasons,
  getSessionPhase,
  groupByCourseClass,
  hasRatio,
} from './submission-attention';
import type { SessionOverviewItem } from './api/submissions';

const NOW = new Date('2026-09-03T10:00:00Z').getTime();
const HOUR = 3_600_000;

function make(overrides: Partial<SessionOverviewItem> = {}): SessionOverviewItem {
  return {
    id: 'session-1',
    name: 'Giữa kỳ #2',
    code: 'GK2',
    courseId: 'course-1',
    courseName: 'Nhập môn CSDL',
    classId: 'class-1',
    className: 'CINE',
    roomName: 'A3-01',
    examType: 'GK',
    // Mặc định: đã kết thúc từ 2 tiếng trước, ngoài grace.
    startTime: new Date(NOW - 4 * HOUR).toISOString(),
    endTime: new Date(NOW - 2 * HOUR).toISOString(),
    status: 'completed',
    requiredDeliverableCount: 3,
    expectedCount: 40,
    rosterKnown: true,
    fullySubmittedCount: 40,
    partialCount: 0,
    notSubmittedCount: 0,
    invalidFileCount: 0,
    ...overrides,
  };
}

describe('getSessionPhase', () => {
  it('draft và cancelled không bị đồng hồ ghi đè', () => {
    expect(getSessionPhase(make({ status: 'draft' }), NOW)).toBe('draft');
    expect(getSessionPhase(make({ status: 'cancelled' }), NOW)).toBe('cancelled');
  });

  it('chưa tới giờ là upcoming', () => {
    const item = make({
      status: 'scheduled',
      startTime: new Date(NOW + HOUR).toISOString(),
      endTime: new Date(NOW + 2 * HOUR).toISOString(),
    });
    expect(getSessionPhase(item, NOW)).toBe('upcoming');
  });

  it('đang trong giờ là running', () => {
    const item = make({
      status: 'active',
      startTime: new Date(NOW - HOUR).toISOString(),
      endTime: new Date(NOW + HOUR).toISOString(),
    });
    expect(getSessionPhase(item, NOW)).toBe('running');
  });

  it('vừa hết giờ, còn trong grace là collecting', () => {
    const item = make({
      status: 'completed',
      startTime: new Date(NOW - 2 * HOUR).toISOString(),
      endTime: new Date(NOW - 60_000).toISOString(),
    });
    expect(getSessionPhase(item, NOW)).toBe('collecting');
  });

  it('chốt tay trước endTime vẫn là collecting, KHÔNG phải running', () => {
    // FinalizeSessionButton đặt status='completed' ngay lúc bấm, có thể
    // trước endTime cả tiếng — spec §4.3.
    const item = make({
      status: 'completed',
      startTime: new Date(NOW - HOUR).toISOString(),
      endTime: new Date(NOW + HOUR).toISOString(),
    });
    expect(getSessionPhase(item, NOW)).toBe('collecting');
  });

  it('biên grace: đúng endTime + 30 phút vẫn collecting, thêm 1ms là ended', () => {
    const inside = make({ endTime: new Date(NOW - SUBMISSION_GRACE_MS).toISOString() });
    expect(getSessionPhase(inside, NOW)).toBe('collecting');

    const outside = make({ endTime: new Date(NOW - SUBMISSION_GRACE_MS - 1).toISOString() });
    expect(getSessionPhase(outside, NOW)).toBe('ended');
  });
});

describe('getAttentionReasons', () => {
  it('phiên đủ bài không có lý do nào', () => {
    expect(getAttentionReasons(make(), NOW)).toEqual([]);
  });

  it('ba lý do xuất hiện đúng thứ tự ưu tiên: invalid, partial, chưa nộp', () => {
    const item = make({
      invalidFileCount: 2,
      partialCount: 3,
      notSubmittedCount: 5,
      fullySubmittedCount: 32,
    });
    const reasons = getAttentionReasons(item, NOW);

    expect(reasons.map((r) => r.kind)).toEqual(['invalid', 'partial', 'not-submitted']);
    expect(reasons.map((r) => r.priority)).toEqual([1, 2, 3]);
    expect(reasons[0].label).toBe('2 file không hợp lệ');
    expect(reasons[1].label).toBe('3 sinh viên nộp thiếu file');
    expect(reasons[2].label).toBe('5 sinh viên chưa nộp');
    expect(reasons[0].variant).toBe('destructive');
    expect(reasons[1].variant).toBe('warning');
    expect(reasons[2].variant).toBe('default');
  });

  it('trong grace: không lý do nào, dù thiếu bài — báo động giả', () => {
    const item = make({
      endTime: new Date(NOW - 60_000).toISOString(),
      notSubmittedCount: 5,
      invalidFileCount: 2,
      fullySubmittedCount: 33,
    });
    expect(getAttentionReasons(item, NOW)).toEqual([]);
  });

  it('rosterKnown false: không lý do nào', () => {
    const item = make({ rosterKnown: false, notSubmittedCount: 0, expectedCount: 3 });
    expect(getAttentionReasons(item, NOW)).toEqual([]);
  });

  it('requiredDeliverableCount 0: không lý do nào', () => {
    const item = make({ requiredDeliverableCount: 0, fullySubmittedCount: 0 });
    expect(getAttentionReasons(item, NOW)).toEqual([]);
  });

  it('draft và cancelled: không bao giờ có lý do', () => {
    const shape = { notSubmittedCount: 40, fullySubmittedCount: 0, invalidFileCount: 9 };
    expect(getAttentionReasons(make({ status: 'draft', ...shape }), NOW)).toEqual([]);
    expect(getAttentionReasons(make({ status: 'cancelled', ...shape }), NOW)).toEqual([]);
  });
});

describe('hasRatio', () => {
  it('false khi không biết roster hoặc chưa khai file bắt buộc', () => {
    expect(hasRatio(make())).toBe(true);
    expect(hasRatio(make({ rosterKnown: false }))).toBe(false);
    expect(hasRatio(make({ requiredDeliverableCount: 0 }))).toBe(false);
  });
});

describe('compareSessions', () => {
  it('lý do gấp hơn xếp trước; cùng mức thì phiên mới hơn trước', () => {
    const invalid = make({ id: 'a', invalidFileCount: 1, fullySubmittedCount: 39 });
    const missing = make({ id: 'b', notSubmittedCount: 1, fullySubmittedCount: 39 });
    const clean = make({ id: 'c' });
    const cleanOlder = make({
      id: 'd',
      startTime: new Date(NOW - 10 * HOUR).toISOString(),
    });

    const sorted = [clean, missing, cleanOlder, invalid]
      .sort((x, y) => compareSessions(x, y, NOW))
      .map((s) => s.id);

    expect(sorted).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('groupByCourseClass', () => {
  it('gom theo môn + lớp, và ĐẾM cả phiên cần chú ý trong nhóm', () => {
    const items = [
      make({ id: 'a', courseName: 'CSDL', className: 'N01', invalidFileCount: 1 }),
      make({ id: 'b', courseName: 'CSDL', className: 'N01' }),
      make({ id: 'c', courseName: 'CTDL', className: 'N05' }),
    ];

    const groups = groupByCourseClass(items, NOW);

    expect(groups).toHaveLength(2);
    const csdl = groups.find((g) => g.courseName === 'CSDL')!;
    // Phiên cần chú ý VẪN nằm trong nhóm gốc — spec §4.4, cố ý lặp.
    expect(csdl.sessions.map((s) => s.id)).toEqual(['a', 'b']);
    expect(csdl.attentionCount).toBe(1);
    expect(groups.find((g) => g.courseName === 'CTDL')!.attentionCount).toBe(0);
  });

  it('phiên không gắn lớp vào nhóm riêng của môn đó', () => {
    const groups = groupByCourseClass(
      [make({ id: 'a', className: null, classId: null, rosterKnown: false })],
      NOW,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].className).toBeNull();
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận FAIL**

```bash
pnpm --filter web test -- submission-attention
```

Expected: FAIL — `Failed to resolve import "./submission-attention"`.

- [ ] **Step 3: Viết implementation**

`apps/web/src/lib/submission-attention.ts`:

```ts
import type { BadgeProps } from '@/components/ui/badge';
import type { SessionOverviewItem } from './api/submissions';

/**
 * Phải khớp SUBMISSION_GRACE_PERIOD_MS
 * (apps/api/src/submission/submission.types.ts). Agent còn được nộp tới
 * endTime + 30' — kêu "thiếu bài" trong khoảng đó là báo động giả, xem
 * spec §4.2.
 */
export const SUBMISSION_GRACE_MS = 30 * 60_000;

export type SessionPhase =
  | 'draft'
  | 'cancelled'
  | 'upcoming'
  | 'running'
  /** Hết giờ (hoặc đã chốt tay) nhưng còn trong grace — file đang bay về. */
  | 'collecting'
  | 'ended';

export const PHASE_LABELS: Record<SessionPhase, string> = {
  draft: 'Nháp',
  cancelled: 'Đã huỷ',
  upcoming: 'Chưa diễn ra',
  running: 'Đang diễn ra',
  collecting: 'Đang thu bài',
  ended: 'Đã kết thúc',
};

export const PHASE_VARIANTS: Record<SessionPhase, NonNullable<BadgeProps['variant']>> = {
  draft: 'default',
  cancelled: 'destructive',
  upcoming: 'info',
  running: 'success',
  collecting: 'info',
  ended: 'default',
};

export interface AttentionReason {
  kind: 'invalid' | 'partial' | 'not-submitted';
  count: number;
  label: string;
  variant: NonNullable<BadgeProps['variant']>;
  /** 1 gấp nhất. Xem bảng ưu tiên spec §4.1. */
  priority: 1 | 2 | 3;
}

/**
 * `ended` phải hỏi cả `status`, không chỉ đồng hồ: "Chốt bài ngay"
 * (FinalizeSessionButton) đặt status='completed' ngay lúc bấm, có thể trước
 * endTime cả tiếng. Chỉ so now với endTime thì phiên vừa chốt sẽ hiện "Đang
 * diễn ra" suốt quãng còn lại — spec §4.3.
 *
 * Nhưng biên grace vẫn là endTime + 30', KHÔNG phải thời-điểm-chốt + 30',
 * vì backend cho upload theo đúng công thức đó.
 */
export function getSessionPhase(item: SessionOverviewItem, now: number): SessionPhase {
  if (item.status === 'draft' || item.status === 'cancelled') {
    return item.status;
  }

  const start = new Date(item.startTime).getTime();
  const end = new Date(item.endTime).getTime();
  const ended = item.status === 'completed' || now > end;

  if (!ended) {
    return now < start ? 'upcoming' : 'running';
  }
  return now <= end + SUBMISSION_GRACE_MS ? 'collecting' : 'ended';
}

/** true khi hiển thị tỉ lệ "X/Y" là trung thực. Xem §3.3 và §4.2. */
export function hasRatio(item: SessionOverviewItem): boolean {
  return item.rosterKnown && item.requiredDeliverableCount > 0;
}

export function getAttentionReasons(
  item: SessionOverviewItem,
  now: number,
): AttentionReason[] {
  // Chỉ phiên đã thật sự xong mới bị kết luận. draft/cancelled là quyết định
  // có chủ ý của GV; collecting còn đang nhận file.
  if (getSessionPhase(item, now) !== 'ended') {
    return [];
  }
  // Không biết roster, hoặc chưa khai file bắt buộc -> không kết luận được
  // là "thiếu". §4.2(b) và §3.3.
  if (!hasRatio(item)) {
    return [];
  }

  const reasons: AttentionReason[] = [];
  if (item.invalidFileCount > 0) {
    reasons.push({
      kind: 'invalid',
      count: item.invalidFileCount,
      label: `${item.invalidFileCount} file không hợp lệ`,
      variant: 'destructive',
      priority: 1,
    });
  }
  if (item.partialCount > 0) {
    reasons.push({
      kind: 'partial',
      count: item.partialCount,
      label: `${item.partialCount} sinh viên nộp thiếu file`,
      variant: 'warning',
      priority: 2,
    });
  }
  if (item.notSubmittedCount > 0) {
    reasons.push({
      kind: 'not-submitted',
      count: item.notSubmittedCount,
      label: `${item.notSubmittedCount} sinh viên chưa nộp`,
      variant: 'default',
      priority: 3,
    });
  }
  return reasons;
}

/** 4 = không cần chú ý; nhỏ hơn là gấp hơn. */
function attentionRank(item: SessionOverviewItem, now: number): number {
  const reasons = getAttentionReasons(item, now);
  return reasons.length === 0 ? 4 : reasons[0].priority;
}

/** Lý do gấp hơn trước; cùng mức thì phiên mới hơn trước. */
export function compareSessions(
  a: SessionOverviewItem,
  b: SessionOverviewItem,
  now: number,
): number {
  const byRank = attentionRank(a, now) - attentionRank(b, now);
  if (byRank !== 0) return byRank;
  return new Date(b.startTime).getTime() - new Date(a.startTime).getTime();
}

export interface SessionGroup {
  key: string;
  courseName: string;
  className: string | null;
  sessions: SessionOverviewItem[];
  /** Bao nhiêu phiên trong nhóm này cần chú ý — hiện ở header nhóm, §4.4. */
  attentionCount: number;
}

/**
 * Nhóm theo Môn → Lớp. Phiên cần chú ý VẪN Ở LẠI nhóm gốc dù nó cũng hiện ở
 * dải ghim trên: nhóm phải là danh sách đầy đủ của môn đó, nếu lọc bớt thì
 * GV duyệt theo môn sẽ tưởng phiên đã bị xoá — spec §4.4.
 */
export function groupByCourseClass(
  items: SessionOverviewItem[],
  now: number,
): SessionGroup[] {
  const groups = new Map<string, SessionGroup>();

  for (const item of items) {
    const key = `${item.courseId}::${item.classId ?? 'no-class'}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        courseName: item.courseName,
        className: item.className,
        sessions: [],
        attentionCount: 0,
      };
      groups.set(key, group);
    }
    group.sessions.push(item);
  }

  const newestStart = (group: SessionGroup) =>
    Math.max(...group.sessions.map((s) => new Date(s.startTime).getTime()));

  for (const group of groups.values()) {
    group.sessions.sort((a, b) => compareSessions(a, b, now));
    group.attentionCount = group.sessions.filter(
      (s) => getAttentionReasons(s, now).length > 0,
    ).length;
  }

  return [...groups.values()].sort((a, b) => newestStart(b) - newestStart(a));
}
```

- [ ] **Step 4: Chạy test để xác nhận PASS**

```bash
pnpm --filter web test -- submission-attention
```

Expected: PASS — tất cả describe block.

- [ ] **Step 5: Sửa docblock lỗi thời ở exam-session-display.ts**

Trong `apps/web/src/lib/exam-session-display.ts`, thay đoạn docblock nói `create()` hardcode `'active'` và *"nothing ever flips it to `'completed'`"* bằng:

```ts
/**
 * Suy trạng thái hiển thị từ khung giờ thật của phiên, cho các dòng `'active'`.
 *
 * `ExamSessionScheduler` (apps/api/src/exam-session/exam-session.scheduler.ts)
 * có sweep chuyển `active -> completed` khi `end_time` đã qua, và
 * "Chốt bài ngay" cũng chuyển ngay lập tức — nên `'completed'` là thật, không
 * còn là "trên lý thuyết" như bản ghi chú trước của hàm này nói. Cái vẫn cần
 * suy ở đây là quãng giữa hai lần sweep. `'draft'`/`'cancelled'` là quyết định
 * có chủ ý của giảng viên, đồng hồ không được ghi đè.
 *
 * Trang "Quản lý bài thu" cần thêm một phase nữa (`'collecting'`, trong grace
 * period) — xem lib/submission-attention.ts, không nhân bản luật đó vào đây.
 */
```

- [ ] **Step 6: Chạy toàn bộ test web + lint + commit**

```bash
pnpm --filter web test
pnpm --filter web lint
git add apps/web/src/lib/submission-attention.ts \
        apps/web/src/lib/submission-attention.test.ts \
        apps/web/src/lib/exam-session-display.ts
git commit -m "feat(web): attention rule for submission roll-up

Reasons, not a bare ratio: 38/40 conflates three situations needing three
different actions. Grace period and unknown-roster sessions are explicitly
excluded from attention. See spec sections 4.1-4.3."
```

---

## Task 4: Trang roll-up — dải ghim + nhóm Môn/Lớp

**Files:**
- Create: `apps/web/src/app/teacher/submissions/page.tsx`
- Create: `apps/web/src/app/teacher/submissions/page.test.tsx`
- Modify: `apps/web/src/lib/nav-config.ts`

**Interfaces:**
- Consumes: `useSessionOverview()` (Task 2); `getSessionPhase`, `PHASE_LABELS`, `PHASE_VARIANTS`, `getAttentionReasons`, `hasRatio`, `compareSessions`, `groupByCourseClass` (Task 3).
- Produces: route `/teacher/submissions`; component `SessionRow` (nội bộ file, không export).

- [ ] **Step 1: Viết test thất bại**

`apps/web/src/app/teacher/submissions/page.test.tsx`:

```ts
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import type { SessionOverviewItem } from '@/lib/api/submissions';

const useSessionOverviewMock = vi.fn();
const useTeacherSubmissionsMock = vi.fn();

vi.mock('@/hooks/useSubmissionOverview', () => ({
  useSessionOverview: () => useSessionOverviewMock(),
  useTeacherSubmissions: (...args: unknown[]) => useTeacherSubmissionsMock(...args),
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

import SubmissionsPage from './page';

const HOUR = 3_600_000;

function make(overrides: Partial<SessionOverviewItem> = {}): SessionOverviewItem {
  return {
    id: 'session-1',
    name: 'Thường kỳ #1',
    code: 'TK1',
    courseId: 'course-1',
    courseName: 'Nhập môn CSDL',
    classId: 'class-1',
    className: 'N01',
    roomName: 'A3-01',
    examType: 'TK',
    startTime: new Date(Date.now() - 4 * HOUR).toISOString(),
    endTime: new Date(Date.now() - 2 * HOUR).toISOString(),
    status: 'completed',
    requiredDeliverableCount: 3,
    expectedCount: 40,
    rosterKnown: true,
    fullySubmittedCount: 40,
    partialCount: 0,
    notSubmittedCount: 0,
    invalidFileCount: 0,
    ...overrides,
  };
}

beforeEach(() => {
  useSessionOverviewMock.mockReset();
  useTeacherSubmissionsMock.mockReset();
  useTeacherSubmissionsMock.mockReturnValue({ data: undefined, isLoading: false, error: null });
  useSessionOverviewMock.mockReturnValue({
    data: [make()],
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  });
});

describe('SubmissionsPage — trạng thái tải', () => {
  it('hiện skeleton khi đang tải', () => {
    useSessionOverviewMock.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
      refetch: vi.fn(),
    });
    render(<SubmissionsPage />);
    expect(screen.getByLabelText('Đang tải danh sách phiên thi')).toBeInTheDocument();
  });

  it('hiện lỗi kèm nút thử lại', () => {
    const refetch = vi.fn();
    useSessionOverviewMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('boom'),
      refetch,
    });
    render(<SubmissionsPage />);
    screen.getByRole('button', { name: 'Thử lại' }).click();
    expect(refetch).toHaveBeenCalled();
  });

  it('hiện empty state khi giảng viên chưa có phiên nào', () => {
    useSessionOverviewMock.mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
    render(<SubmissionsPage />);
    expect(screen.getByText('Chưa có phiên thi nào')).toBeInTheDocument();
  });
});

describe('SubmissionsPage — dải cần chú ý', () => {
  it('không render dải khi mọi phiên đều ổn', () => {
    render(<SubmissionsPage />);
    expect(screen.queryByRole('region', { name: 'Cần chú ý' })).not.toBeInTheDocument();
  });

  it('phiên cần chú ý xuất hiện ở CẢ dải ghim VÀ nhóm Môn/Lớp của nó', () => {
    useSessionOverviewMock.mockReturnValue({
      data: [make({ id: 's1', name: 'Giữa kỳ #2', invalidFileCount: 2, fullySubmittedCount: 38 })],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
    render(<SubmissionsPage />);

    const strip = screen.getByRole('region', { name: 'Cần chú ý' });
    expect(within(strip).getByText('Giữa kỳ #2')).toBeInTheDocument();

    // Spec §4.4: KHÔNG được lọc nó khỏi nhóm gốc — nhóm phải đầy đủ.
    const group = screen.getByRole('region', { name: /Nhập môn CSDL/ });
    expect(within(group).getByText('Giữa kỳ #2')).toBeInTheDocument();
    expect(within(group).getByText(/1 cần chú ý/)).toBeInTheDocument();
  });

  it('sắp lý do theo ưu tiên và hiện đủ mọi lý do', () => {
    useSessionOverviewMock.mockReturnValue({
      data: [
        make({
          id: 's1',
          invalidFileCount: 2,
          partialCount: 3,
          notSubmittedCount: 5,
          fullySubmittedCount: 32,
        }),
      ],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
    render(<SubmissionsPage />);

    const strip = screen.getByRole('region', { name: 'Cần chú ý' });
    expect(within(strip).getByText('2 file không hợp lệ')).toBeInTheDocument();
    expect(within(strip).getByText('3 sinh viên nộp thiếu file')).toBeInTheDocument();
    expect(within(strip).getByText('5 sinh viên chưa nộp')).toBeInTheDocument();
  });

  it('phiên trong grace period không lên dải', () => {
    useSessionOverviewMock.mockReturnValue({
      data: [
        make({
          endTime: new Date(Date.now() - 60_000).toISOString(),
          notSubmittedCount: 5,
          fullySubmittedCount: 35,
        }),
      ],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
    render(<SubmissionsPage />);

    expect(screen.queryByRole('region', { name: 'Cần chú ý' })).not.toBeInTheDocument();
    expect(screen.getByText('Đang thu bài')).toBeInTheDocument();
  });
});

describe('SubmissionsPage — tỉ lệ', () => {
  it('hiện X/Y khi biết roster và có file bắt buộc', () => {
    useSessionOverviewMock.mockReturnValue({
      data: [make({ fullySubmittedCount: 38, notSubmittedCount: 2 })],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
    render(<SubmissionsPage />);
    expect(screen.getByText('38/40 đã nộp đủ')).toBeInTheDocument();
  });

  it('phiên không gắn lớp: không hiện mẫu số', () => {
    useSessionOverviewMock.mockReturnValue({
      data: [
        make({
          classId: null,
          className: null,
          rosterKnown: false,
          expectedCount: 5,
          fullySubmittedCount: 5,
          notSubmittedCount: 0,
        }),
      ],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
    render(<SubmissionsPage />);

    expect(screen.getByText('đã thu 5 bài')).toBeInTheDocument();
    expect(screen.getByText('phiên không gắn lớp')).toBeInTheDocument();
    expect(screen.queryByText(/\/5 đã nộp đủ/)).not.toBeInTheDocument();
  });

  it('chưa khai file bắt buộc: không hiện tỉ lệ', () => {
    useSessionOverviewMock.mockReturnValue({
      data: [make({ requiredDeliverableCount: 0, fullySubmittedCount: 0 })],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
    render(<SubmissionsPage />);

    expect(screen.getByText('phiên chưa khai file bắt buộc')).toBeInTheDocument();
    expect(screen.queryByText(/đã nộp đủ/)).not.toBeInTheDocument();
  });
});

describe('SubmissionsPage — điều hướng', () => {
  it('mỗi phiên link tới trang chi tiết, không kèm ?student=', () => {
    render(<SubmissionsPage />);
    const links = screen
      .getAllByRole('link')
      .map((el) => el.getAttribute('href'))
      .filter((href) => href?.startsWith('/teacher/submissions/'));
    expect(links).toContain('/teacher/submissions/session-1');
    expect(links.every((href) => !href!.includes('student='))).toBe(true);
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận FAIL**

```bash
pnpm --filter web test -- teacher/submissions/page
```

Expected: FAIL — `Failed to resolve import "./page"`.

- [ ] **Step 3: Viết trang (chưa có search — Task 5 thêm)**

`apps/web/src/app/teacher/submissions/page.tsx`:

```tsx
'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ChevronDown, ChevronRight, Inbox } from 'lucide-react';
import { useSessionOverview } from '@/hooks/useSubmissionOverview';
import {
  PHASE_LABELS,
  PHASE_VARIANTS,
  compareSessions,
  getAttentionReasons,
  getSessionPhase,
  groupByCourseClass,
  hasRatio,
} from '@/lib/submission-attention';
import type { SessionOverviewItem } from '@/lib/api/submissions';
import { EMPTY_LABEL, EXAM_TYPE_LABELS } from '@/lib/exam-session-display';
import { EmptyState } from '@/components/layout/empty-state';
import { PageHeader } from '@/components/layout/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Một phiên. `showContext` bật khi dòng nằm ở dải ghim — lúc đó nó đã bị tách
 * khỏi nhóm môn, nên phải tự mang môn/lớp theo, không thì GV không biết nó
 * thuộc đâu (spec §4.4).
 */
function SessionRow({
  item,
  now,
  showContext,
  studentHint,
}: {
  item: SessionOverviewItem;
  now: number;
  showContext: boolean;
  studentHint?: string;
}) {
  const phase = getSessionPhase(item, now);
  const reasons = getAttentionReasons(item, now);
  const href = studentHint
    ? `/teacher/submissions/${item.id}?student=${encodeURIComponent(studentHint)}`
    : `/teacher/submissions/${item.id}`;

  return (
    <Link
      href={href}
      className="flex flex-col gap-2 rounded-lg border border-border bg-surface-1 px-4 py-3 transition-colors hover:bg-surface-2/60"
    >
      <div className="flex flex-wrap items-center gap-2">
        {reasons.length > 0 && (
          <AlertTriangle className="h-4 w-4 shrink-0 text-danger-strong" aria-hidden="true" />
        )}
        <span className="font-medium text-foreground">{item.name}</span>
        <Badge variant="outline">{EXAM_TYPE_LABELS[item.examType] ?? item.examType}</Badge>
        <Badge variant={PHASE_VARIANTS[phase]}>{PHASE_LABELS[phase]}</Badge>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-small text-muted-foreground">
        {showContext && (
          <span className="text-foreground">
            {item.courseName}
            {item.className ? ` — ${item.className}` : ''}
          </span>
        )}
        <span>{formatDateTime(item.startTime)}</span>
        <span>{item.roomName}</span>
        {hasRatio(item) ? (
          <span className="font-medium text-foreground">
            {item.fullySubmittedCount}/{item.expectedCount} đã nộp đủ
          </span>
        ) : (
          <>
            <span className="font-medium text-foreground">
              đã thu {item.expectedCount} bài
            </span>
            <span className="text-caption">
              {item.rosterKnown ? 'phiên chưa khai file bắt buộc' : 'phiên không gắn lớp'}
            </span>
          </>
        )}
      </div>

      {studentHint && (
        <span className="text-caption text-muted-foreground">
          Sinh viên {studentHint} trong phiên này
        </span>
      )}

      {reasons.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {reasons.map((reason) => (
            <Badge key={reason.kind} variant={reason.variant}>
              {reason.label}
            </Badge>
          ))}
        </div>
      )}
    </Link>
  );
}

/**
 * "Quản lý bài thu" — trả lời "phiên nào cần tôi chú ý ngay bây giờ?" trước,
 * rồi mới tới việc duyệt theo môn. Xem
 * docs/superpowers/specs/2026-09-03-submissions-rollup-page-design.md.
 */
export default function SubmissionsPage() {
  const { data, isLoading, error, refetch } = useSessionOverview();
  // Chốt `now` một lần mỗi render thay vì gọi Date.now() rải rác: hai dòng
  // cạnh nhau phải được phân loại theo cùng một mốc thời gian.
  const now = Date.now();

  const attention = useMemo(
    () =>
      (data ?? [])
        .filter((item) => getAttentionReasons(item, now).length > 0)
        .sort((a, b) => compareSessions(a, b, now)),
    [data, now],
  );
  const groups = useMemo(() => groupByCourseClass(data ?? [], now), [data, now]);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-8">
        <PageHeader
          title="Quản lý bài thu"
          description="Phiên thi nào đã thu đủ bài, phiên nào còn thiếu — và tìm bài của một sinh viên qua tất cả các kỳ."
        />
        <Card>
          <CardContent
            className="flex flex-col gap-3 p-6"
            aria-label="Đang tải danh sách phiên thi"
          >
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Quản lý bài thu"
        description="Phiên thi nào đã thu đủ bài, phiên nào còn thiếu — và tìm bài của một sinh viên qua tất cả các kỳ."
      />

      {error ? (
        <Alert variant="destructive">
          <AlertDescription className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>Không tải được danh sách phiên thi. Hãy thử lại.</span>
            <Button type="button" variant="outline" size="sm" onClick={() => refetch()}>
              Thử lại
            </Button>
          </AlertDescription>
        </Alert>
      ) : (data ?? []).length === 0 ? (
        <Card>
          <EmptyState
            icon={Inbox}
            title="Chưa có phiên thi nào"
            description="Bài nộp sẽ xuất hiện ở đây sau khi bạn tạo phiên thi và sinh viên bắt đầu nộp bài."
          />
        </Card>
      ) : (
        <div data-animate className="flex flex-col gap-8">
          {attention.length > 0 && (
            <section
              aria-label="Cần chú ý"
              className="flex flex-col gap-3 rounded-xl border border-danger-subtle bg-danger-subtle/30 p-4"
            >
              <h2 className="text-h3 text-foreground">Cần chú ý</h2>
              <p className="text-small text-muted-foreground">
                Phiên đã kết thúc mà chưa thu đủ bài. Xử lý những phiên này trước.
              </p>
              <div className="flex flex-col gap-2">
                {attention.map((item) => (
                  <SessionRow key={item.id} item={item} now={now} showContext />
                ))}
              </div>
            </section>
          )}

          <div className="flex flex-col gap-4">
            {groups.map((group) => (
              <SessionGroupCard key={group.key} group={group} now={now} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SessionGroupCard({
  group,
  now,
}: {
  group: ReturnType<typeof groupByCourseClass>[number];
  now: number;
}) {
  // Nhóm không có cảnh báo thì thu gọn — nó không cần giành chú ý (§4.4).
  const [open, setOpen] = useState(group.attentionCount > 0);
  const heading = `${group.courseName}${group.className ? ` — ${group.className}` : ' — không gắn lớp'}`;

  return (
    <section aria-label={heading} className="rounded-xl border border-border bg-surface-1">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-4 py-3 text-left"
      >
        {open ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        )}
        <span className="font-medium text-foreground">{heading}</span>
        <span className="text-small text-muted-foreground">
          · {group.sessions.length} phiên
          {group.attentionCount > 0 ? ` · ${group.attentionCount} cần chú ý` : ''}
        </span>
      </button>

      {open && (
        <div className="flex flex-col gap-2 border-t border-border p-4">
          {group.sessions.map((item) => (
            <SessionRow key={item.id} item={item} now={now} showContext={false} />
          ))}
        </div>
      )}
    </section>
  );
}
```

> **Lưu ý cho người implement:** `EMPTY_LABEL` ở dòng import trên **không tồn tại** trong `exam-session-display.ts` — bỏ nó khỏi import, chỉ giữ `EXAM_TYPE_LABELS`. (Giữ lại ghi chú này thay vì im lặng sửa, để bạn biết đây là chỗ dễ import sai.)

- [ ] **Step 4: Chạy test để xác nhận PASS**

```bash
pnpm --filter web test -- teacher/submissions/page
```

Expected: PASS.

- [ ] **Step 5: Thêm lại nav entry**

Trong `apps/web/src/lib/nav-config.ts`: thêm `Inbox,` vào import từ `lucide-react` (giữ đúng thứ tự alphabet hiện có của khối import), và thêm vào `TEACHER_NAV` **ngay sau** "Quản lý kỳ thi":

```ts
  { label: 'Quản lý bài thu', href: '/teacher/submissions', icon: Inbox },
```

- [ ] **Step 6: Lint + commit**

```bash
pnpm --filter web test
pnpm --filter web lint
git add apps/web/src/app/teacher/submissions/page.tsx \
        apps/web/src/app/teacher/submissions/page.test.tsx \
        apps/web/src/lib/nav-config.ts
git commit -m "feat(web): submission roll-up page with pinned attention strip

Attention sessions escape the course grouping into a pinned strip so
'always on top' means across all courses, but they stay in their group
too: a group that hides one of its sessions is a list that lies."
```

---

## Task 5: Search theo MSSV trên trang roll-up

**Files:**
- Modify: `apps/web/src/app/teacher/submissions/page.tsx`
- Modify: `apps/web/src/app/teacher/submissions/page.test.tsx` (chỉ THÊM describe block)

**Interfaces:**
- Consumes: `useTeacherSubmissions(params, enabled)` (Task 2), `useDebouncedValue` (đã có), `SessionRow` (Task 4).
- Produces: không có export mới.

- [ ] **Step 1: Thêm test thất bại**

Thêm vào cuối `page.test.tsx`:

```ts
describe('SubmissionsPage — search theo MSSV', () => {
  it('không gọi endpoint search khi ô tìm còn rỗng', () => {
    render(<SubmissionsPage />);
    expect(useTeacherSubmissionsMock).toHaveBeenCalledWith(expect.anything(), false);
  });

  it('gõ từ khoá thì bật search và thu hẹp về những phiên có SV đó', async () => {
    useSessionOverviewMock.mockReturnValue({
      data: [
        make({ id: 's1', name: 'Giữa kỳ #2' }),
        make({ id: 's2', name: 'Cuối kỳ', courseName: 'CTDL', courseId: 'course-2' }),
      ],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
    useTeacherSubmissionsMock.mockReturnValue({
      data: {
        items: [
          {
            id: 'sub-1',
            examSessionId: 's2',
            examSessionName: 'Cuối kỳ',
            requiredFilename: 'Cau1.docx',
            studentMssv: '21520123',
            studentNameInput: 'Nguyễn Văn A',
            status: 'collected',
            submittedAt: new Date().toISOString(),
            fileSize: '1024',
            downloadUrl: 'https://example.test/f',
          },
        ],
        total: 1,
      },
      isLoading: false,
      error: null,
    });

    const { rerender } = render(<SubmissionsPage />);
    const input = screen.getByLabelText('Tìm sinh viên theo MSSV hoặc tên');
    input.focus();
    // Debounce 300ms: đẩy giá trị rồi chờ hook được gọi lại với enabled=true.
    await new Promise<void>((resolve) => {
      const { fireEvent } = require('@testing-library/react');
      fireEvent.change(input, { target: { value: '21520123' } });
      setTimeout(resolve, 400);
    });
    rerender(<SubmissionsPage />);

    expect(screen.getByText('Cuối kỳ')).toBeInTheDocument();
    expect(screen.queryByText('Giữa kỳ #2')).not.toBeInTheDocument();
    const link = screen
      .getAllByRole('link')
      .find((el) => el.getAttribute('href')?.startsWith('/teacher/submissions/s2'));
    expect(link?.getAttribute('href')).toBe('/teacher/submissions/s2?student=21520123');
  });

  it('empty state của search nói rõ SV chưa nộp gì sẽ không xuất hiện', async () => {
    useTeacherSubmissionsMock.mockReturnValue({
      data: { items: [], total: 0 },
      isLoading: false,
      error: null,
    });
    render(<SubmissionsPage />);
    const { fireEvent } = require('@testing-library/react');
    fireEvent.change(screen.getByLabelText('Tìm sinh viên theo MSSV hoặc tên'), {
      target: { value: 'khongton' },
    });
    await new Promise((resolve) => setTimeout(resolve, 400));

    expect(
      screen.getByText(/Sinh viên chưa nộp gì sẽ không xuất hiện ở đây/),
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận FAIL**

```bash
pnpm --filter web test -- teacher/submissions/page
```

Expected: FAIL — `getByLabelText('Tìm sinh viên theo MSSV hoặc tên')` không tìm thấy.

- [ ] **Step 3: Thêm search vào page.tsx**

Thêm import: `import { Input } from '@/components/ui/input';` và `import { useDebouncedValue } from '@/hooks/useDebouncedValue';`.

Trong `SubmissionsPage`, ngay sau `const now = Date.now();`:

```tsx
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);
  const trimmedSearch = debouncedSearch.trim();
  const isSearching = trimmedSearch !== '';

  // pageSize 200: đủ để gom hết bài của MỘT sinh viên qua ~8 kỳ/năm (spec
  // §1.2) trong một trang, nên luồng này không cần phân trang riêng.
  const searchResults = useTeacherSubmissions(
    { page: 1, pageSize: 200, search: trimmedSearch || undefined },
    isSearching,
  );

  /**
   * Phiên có xuất hiện trong kết quả search, kèm MSSV khớp — gom theo
   * examSessionId. Endpoint /submissions trả về dòng-per-file, còn câu trả
   * lời GV cần là "nằm ở phiên nào" (spec §3.4).
   */
  const searchGroups = useMemo(() => {
    if (!isSearching) return [];
    const byId = new Map<string, { item: SessionOverviewItem; mssv: string }>();
    for (const row of searchResults.data?.items ?? []) {
      const item = (data ?? []).find((session) => session.id === row.examSessionId);
      if (item && !byId.has(item.id)) {
        byId.set(item.id, { item, mssv: row.studentMssv });
      }
    }
    return [...byId.values()].sort(
      (a, b) => new Date(b.item.startTime).getTime() - new Date(a.item.startTime).getTime(),
    );
  }, [isSearching, searchResults.data, data]);
```

Thêm ô search ngay dưới `<PageHeader ... />` (ở cả nhánh loading và nhánh chính — hoặc gọn hơn: đưa `PageHeader` + `Input` ra một fragment dùng chung):

```tsx
      <Input
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Tìm sinh viên theo MSSV hoặc tên..."
        aria-label="Tìm sinh viên theo MSSV hoặc tên"
        className="sm:max-w-sm"
      />
```

Và thay khối kết quả chính bằng: nếu `isSearching` thì render `searchGroups`, ngược lại render dải + nhóm như Task 4:

```tsx
        isSearching ? (
          searchResults.isLoading ? (
            <Card>
              <CardContent className="flex flex-col gap-3 p-6">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full" />
                ))}
              </CardContent>
            </Card>
          ) : searchGroups.length === 0 ? (
            <Card>
              <EmptyState
                icon={Inbox}
                title={`Không tìm thấy bài nộp nào khớp «${trimmedSearch}»`}
                description="Sinh viên chưa nộp gì sẽ không xuất hiện ở đây — hãy mở phiên thi tương ứng để xem danh sách vắng."
                action={
                  <Button type="button" variant="outline" onClick={() => setSearch('')}>
                    Xoá tìm kiếm
                  </Button>
                }
              />
            </Card>
          ) : (
            <div data-animate className="flex flex-col gap-2">
              {searchGroups.map(({ item, mssv }) => (
                <SessionRow
                  key={item.id}
                  item={item}
                  now={now}
                  showContext
                  studentHint={mssv}
                />
              ))}
            </div>
          )
        ) : (
          /* ...dải cần chú ý + nhóm Môn/Lớp của Task 4... */
        )
```

- [ ] **Step 4: Chạy test để xác nhận PASS**

```bash
pnpm --filter web test -- teacher/submissions/page
```

Expected: PASS — cả describe block cũ và mới.

- [ ] **Step 5: Commit**

```bash
pnpm --filter web lint
git add apps/web/src/app/teacher/submissions/page.tsx \
        apps/web/src/app/teacher/submissions/page.test.tsx
git commit -m "feat(web): MSSV search collapses roll-up to matching sessions

Answers 'which exam was it?' with an exam session, not a stray file row.
Empty state states the known limitation instead of a bare 'not found':
GET /submissions only finds students who submitted at least one file."
```

---

## Task 6: `focusStudentMssv` trên `SubmissionStatusTable` — sáu cái bẫy

**Files:**
- Modify: `apps/web/src/app/(exam-live)/exam-sessions/[id]/_components/SubmissionStatusTable.tsx`
- Modify: `apps/web/src/app/(exam-live)/exam-sessions/[id]/_components/SubmissionStatusTable.test.tsx` (**chỉ THÊM**)

**Interfaces:**
- Consumes: `SubmissionRowStudent`, `DeliverableColumn` (đã có).
- Produces: prop optional `focusStudentMssv?: string` trên `SubmissionStatusTableProps`.

- [ ] **Step 1: Thêm test thất bại (đọc §6 của spec trước khi viết)**

Thêm vào cuối `SubmissionStatusTable.test.tsx`:

```tsx
describe('SubmissionStatusTable — focusStudentMssv', () => {
  const deliverables = [{ id: 'd1', requiredFilename: 'Cau1.docx' }];
  const makeStudent = (mssv: string): SubmissionRowStudent => ({
    studentMssv: mssv,
    fullName: `SV ${mssv}`,
    byDeliverable: {
      d1: { state: 'collected', submittedAt: '2026-09-01T10:00:00Z', downloadUrl: 'https://x.test/f' },
    },
  });

  it('bẫy 6: không có prop thì không mở dialog', () => {
    render(<SubmissionStatusTable deliverables={deliverables} students={[makeStudent('A1')]} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('bẫy 1: dữ liệu về SAU render đầu vẫn mở dialog', () => {
    const { rerender } = render(
      <SubmissionStatusTable deliverables={deliverables} students={[]} focusStudentMssv="A1" />,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    rerender(
      <SubmissionStatusTable
        deliverables={deliverables}
        students={[makeStudent('A1')]}
        focusStudentMssv="A1"
      />,
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('SV A1 · A1')).toBeInTheDocument();
  });

  it('bẫy 2: refetch (mảng students đổi identity) KHÔNG mở lại dialog đã đóng', () => {
    const students = [makeStudent('A1')];
    const { rerender } = render(
      <SubmissionStatusTable
        deliverables={deliverables}
        students={students}
        focusStudentMssv="A1"
      />,
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    // GV đóng dialog.
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    // React Query refetch: cùng nội dung, mảng MỚI.
    rerender(
      <SubmissionStatusTable
        deliverables={deliverables}
        students={[makeStudent('A1')]}
        focusStudentMssv="A1"
      />,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('bẫy 3: MSSV không tồn tại thì im lặng, không crash, không dialog', () => {
    render(
      <SubmissionStatusTable
        deliverables={deliverables}
        students={[makeStudent('A1')]}
        focusStudentMssv="KHONG-TON-TAI"
      />,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText('SV A1')).toBeInTheDocument();
  });

  it('dòng được nhắm tới có aria-current để không chỉ dựa vào màu (bẫy 4)', () => {
    render(
      <SubmissionStatusTable
        deliverables={deliverables}
        students={[makeStudent('A1'), makeStudent('B2')]}
        focusStudentMssv="B2"
      />,
    );
    const rows = screen.getAllByRole('row');
    const marked = rows.filter((row) => row.getAttribute('aria-current') === 'true');
    expect(marked).toHaveLength(1);
    expect(marked[0]).toHaveTextContent('B2');
  });
});
```

Thêm `fireEvent` vào import `@testing-library/react` ở đầu file nếu chưa có.

- [ ] **Step 2: Chạy test để xác nhận FAIL**

```bash
pnpm --filter web test -- SubmissionStatusTable
```

Expected: FAIL ở 4 test mới (test "bẫy 6" pass sẵn vì prop chưa tồn tại — đó là đúng). Các test CŨ phải vẫn PASS.

- [ ] **Step 3: Implement**

Trong `SubmissionStatusTable.tsx`:

Thêm `useEffect`, `useRef` vào import từ `react`. Thêm vào `SubmissionStatusTableProps`:

```ts
  /**
   * Đến từ luồng search (`?student=`): highlight dòng của SV này và mở sẵn
   * dialog bài nộp của họ, ĐÚNG MỘT LẦN. Vắng mặt ở trang lobby, nên trang
   * đó không đổi hành vi. Xem spec §5.2 và sáu cái bẫy ở §6.
   */
  focusStudentMssv?: string;
```

Trong thân component, ngay sau `const [selectedStudentMssv, setSelectedStudentMssv] = useState<string | null>(null);`:

```tsx
  // Bẫy 2: React Query refetch tạo mảng `students` MỚI mỗi lần. Nếu effect
  // dưới phụ thuộc vào `students`, dialog sẽ tự bật lại ngay giữa lúc giảng
  // viên đang đọc. Ref chốt "đã áp dụng rồi", và chỉ reset khi
  // focusStudentMssv đổi — không phải khi students đổi.
  const appliedFocusRef = useRef<string | null>(null);

  useEffect(() => {
    if (!focusStudentMssv) return;
    if (appliedFocusRef.current === focusStudentMssv) return;

    // Bẫy 1: render đầu tiên students còn rỗng (query đang chạy). Điều kiện
    // kích hoạt là "đã tìm thấy dòng", không phải "vừa mount".
    const match = students.find(
      (student) => student.studentMssv.toLowerCase() === focusStudentMssv.toLowerCase(),
    );
    // Bẫy 3: URL cũ hoặc sửa tay -> không có dòng nào khớp. Im lặng bỏ qua.
    if (!match) return;

    appliedFocusRef.current = focusStudentMssv;
    setSelectedStudentMssv(match.studentMssv);

    const row = document.getElementById(rowDomId(match.studentMssv));
    if (row) {
      // Bẫy 5: tôn trọng prefers-reduced-motion.
      const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      row.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
    }
  }, [focusStudentMssv, students]);

  // Bẫy 4: Radix trả focus về trigger khi đóng dialog, nhưng dialog này mở
  // bằng code nên không có trigger — focus sẽ rơi về <body> và giảng viên mất
  // vị trí. Trả nó về nút "Xem bài nộp" của chính dòng đó.
  const returnFocusToRow = (mssv: string) => {
    document.getElementById(viewButtonDomId(mssv))?.focus();
  };
```

Thêm hai helper ở scope module:

```ts
/** id DOM phải ổn định để effect focus tìm lại được đúng dòng. */
function rowDomId(mssv: string): string {
  return `submission-row-${encodeURIComponent(mssv)}`;
}
function viewButtonDomId(mssv: string): string {
  return `submission-view-${encodeURIComponent(mssv)}`;
}
```

Sửa `<TableRow>` của mỗi sinh viên:

```tsx
            <TableRow
              key={student.studentMssv}
              id={rowDomId(student.studentMssv)}
              aria-current={
                focusStudentMssv &&
                student.studentMssv.toLowerCase() === focusStudentMssv.toLowerCase()
                  ? 'true'
                  : undefined
              }
              className={cn(
                focusStudentMssv &&
                  student.studentMssv.toLowerCase() === focusStudentMssv.toLowerCase() &&
                  'bg-info-subtle',
              )}
            >
```

Sửa nút "Xem bài nộp": thêm `id={viewButtonDomId(student.studentMssv)}` và **sửa luôn lỗi type có sẵn** `variant="secondary"` → `variant="outline"` (`Button` không có variant `secondary`; đây là lỗi `tsc` tồn tại từ trước task này).

Sửa `onOpenChange` của `Dialog`:

```tsx
      <Dialog
        open={selectedStudent !== null}
        onOpenChange={(open) => {
          if (open) return;
          const closing = selectedStudentMssv;
          setSelectedStudentMssv(null);
          if (closing) returnFocusToRow(closing);
        }}
      >
```

- [ ] **Step 4: Chạy test để xác nhận PASS + regression lobby**

```bash
pnpm --filter web test -- SubmissionStatusTable
pnpm --filter web test -- "exam-sessions/\[id\]/page"
```

Expected: cả hai PASS. **Nếu phải sửa test cũ để chúng pass thì prop chưa thật sự optional — quay lại sửa implementation, đừng sửa test.**

- [ ] **Step 5: Commit**

```bash
pnpm --filter web exec tsc --noEmit
pnpm --filter web lint
git add "apps/web/src/app/(exam-live)/exam-sessions/[id]/_components/SubmissionStatusTable.tsx" \
        "apps/web/src/app/(exam-live)/exam-sessions/[id]/_components/SubmissionStatusTable.test.tsx"
git commit -m "feat(web): focusStudentMssv prop on SubmissionStatusTable

Opens the existing per-student dialog once, when the row actually arrives
(not on mount), guarded against React Query refetch reopening it. Also
fixes a pre-existing type error: Button has no 'secondary' variant."
```

---

## Task 7: Khôi phục trang chi tiết phiên + `?student=`

**Files:**
- Create: `apps/web/src/app/teacher/submissions/[sessionId]/page.tsx`
- Create: `apps/web/src/app/teacher/submissions/[sessionId]/page.test.tsx`

**Interfaces:**
- Consumes: `useExamSessionDetail`, `useAttendance`, `useSubmissions` (đã có); `buildSubmissionRows`, `countFullySubmitted` (đã có); `focusStudentMssv` (Task 6).
- Produces: route `/teacher/submissions/[sessionId]`.

- [ ] **Step 1: Khôi phục nguyên văn từ git**

```bash
git show 3e8b1c5:apps/web/src/app/teacher/submissions/\[sessionId\]/page.tsx \
  > "apps/web/src/app/teacher/submissions/[sessionId]/page.tsx"
git show 3e8b1c5:apps/web/src/app/teacher/submissions/\[sessionId\]/page.test.tsx \
  > "apps/web/src/app/teacher/submissions/[sessionId]/page.test.tsx"
pnpm --filter web test -- "teacher/submissions/\[sessionId\]"
```

Expected: PASS ngay — hai dependency nặng của nó (`SubmissionStatusTable`, `submission-rows.ts`) chưa từng bị xoá.

- [ ] **Step 2: Thêm test thất bại cho `?student=`**

Thêm vào `[sessionId]/page.test.tsx`. Mock `useSearchParams` cùng chỗ file này đã mock `useParams`:

```tsx
describe('SubmissionSessionDetailPage — ?student=', () => {
  it('truyền MSSV từ URL xuống bảng', () => {
    searchParamsMock.mockReturnValue(new URLSearchParams('student=21520123'));
    render(<SubmissionSessionDetailPage />);
    expect(submissionStatusTableProps.focusStudentMssv).toBe('21520123');
  });

  it('không có param thì không truyền gì (bẫy 6)', () => {
    searchParamsMock.mockReturnValue(new URLSearchParams(''));
    render(<SubmissionSessionDetailPage />);
    expect(submissionStatusTableProps.focusStudentMssv).toBeUndefined();
  });
});
```

Ở đầu file, mock component để bắt prop:

```tsx
const submissionStatusTableProps: Record<string, unknown> = {};
vi.mock('@/app/(exam-live)/exam-sessions/[id]/_components/SubmissionStatusTable', () => ({
  SubmissionStatusTable: (props: Record<string, unknown>) => {
    Object.assign(submissionStatusTableProps, props);
    return <div data-testid="submission-status-table" />;
  },
}));

const searchParamsMock = vi.fn(() => new URLSearchParams(''));
```

và thêm `useSearchParams: () => searchParamsMock()` vào factory mock `next/navigation` đã có trong file.

- [ ] **Step 3: Chạy test để xác nhận FAIL**

```bash
pnpm --filter web test -- "teacher/submissions/\[sessionId\]"
```

Expected: FAIL — `focusStudentMssv` là `undefined` ở test thứ nhất.

- [ ] **Step 4: Implement**

Trong `[sessionId]/page.tsx`:

- Thêm `useSearchParams` vào import từ `next/navigation`.
- Bọc export mặc định trong `Suspense` — `useSearchParams` yêu cầu boundary ở App Router. Đổi tên component hiện tại thành `SubmissionSessionDetailContent` và thêm:

```tsx
export default function SubmissionSessionDetailPage() {
  return (
    <Suspense>
      <SubmissionSessionDetailContent />
    </Suspense>
  );
}
```

(thêm `Suspense` vào import từ `react`; giữ nguyên tên export cũ để test import không đổi)

- Trong `SubmissionSessionDetailContent`, sau dòng lấy `sessionId`:

```tsx
  // Đến từ luồng search trên "Quản lý bài thu" — spec §5.2. Không có param
  // nghĩa là GV đến từ lối duyệt Môn/Lớp và muốn thấy CẢ LỚP.
  const focusStudentMssv = useSearchParams().get('student') ?? undefined;
```

- Truyền xuống bảng:

```tsx
          <SubmissionStatusTable
            deliverables={deliverables}
            students={rows}
            emptyStudentsDescription="Chưa có sinh viên nào nộp bài trong phiên này."
            focusStudentMssv={focusStudentMssv}
          />
```

- [ ] **Step 5: Chạy test để xác nhận PASS**

```bash
pnpm --filter web test -- "teacher/submissions"
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
pnpm --filter web lint
git add "apps/web/src/app/teacher/submissions/[sessionId]/page.tsx" \
        "apps/web/src/app/teacher/submissions/[sessionId]/page.test.tsx"
git commit -m "feat(web): restore per-session detail page, add ?student= focus

Same route serves two intents: browsing by course wants the whole class,
arriving from an MSSV search wants one student. The param, not a second
page, is the difference."
```

---

## Task 8: Điểm chỉ-đọc + nút "Chấm lại" disabled

**Files:**
- Modify: `apps/web/src/app/(exam-live)/exam-sessions/[id]/_components/SubmissionStatusTable.tsx`
- Modify: `apps/web/src/app/(exam-live)/exam-sessions/[id]/_components/SubmissionStatusTable.test.tsx` (chỉ THÊM)
- Modify: `apps/web/src/app/teacher/submissions/[sessionId]/page.tsx`
- Modify: `apps/web/src/app/teacher/submissions/[sessionId]/page.test.tsx` (chỉ THÊM)

**Interfaces:**
- Consumes: `useGradingResults` (đã có trong `apps/web/src/hooks/`), `GradingResult` (đã có).
- Produces: prop optional `gradingByMssv?: Record<string, { score: number | null; status: string }>`.

- [ ] **Step 1: Thêm test thất bại**

Thêm vào `SubmissionStatusTable.test.tsx`:

```tsx
describe('SubmissionStatusTable — gradingByMssv', () => {
  const deliverables = [{ id: 'd1', requiredFilename: 'Cau1.docx' }];
  const student: SubmissionRowStudent = {
    studentMssv: 'A1',
    fullName: 'SV A1',
    byDeliverable: { d1: { state: 'collected', downloadUrl: 'https://x.test/f' } },
  };

  it('vắng prop: dialog không nói gì về điểm, không có nút Chấm lại', () => {
    render(
      <SubmissionStatusTable
        deliverables={deliverables}
        students={[student]}
        focusStudentMssv="A1"
      />,
    );
    expect(screen.queryByText(/Điểm AI/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Chấm lại/ })).not.toBeInTheDocument();
  });

  it('bài chưa chấm: không hiện điểm, không hiện nút Chấm lại', () => {
    render(
      <SubmissionStatusTable
        deliverables={deliverables}
        students={[student]}
        focusStudentMssv="A1"
        gradingByMssv={{}}
      />,
    );
    expect(screen.queryByRole('button', { name: /Chấm lại/ })).not.toBeInTheDocument();
  });

  it('bài đã chấm: hiện điểm chỉ-đọc và nút Chấm lại DISABLED kèm lý do', () => {
    render(
      <SubmissionStatusTable
        deliverables={deliverables}
        students={[student]}
        focusStudentMssv="A1"
        gradingByMssv={{ A1: { score: 8.5, status: 'ai_graded' } }}
      />,
    );
    expect(screen.getByText('Điểm AI: 8.5')).toBeInTheDocument();
    const button = screen.getByRole('button', { name: /Chấm lại/ });
    expect(button).toBeDisabled();
    expect(screen.getByText('Có khi module chấm điểm hoàn thiện')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận FAIL**

```bash
pnpm --filter web test -- SubmissionStatusTable
```

Expected: FAIL ở test thứ ba.

- [ ] **Step 3: Implement prop trên component**

Thêm vào `SubmissionStatusTableProps`:

```ts
  /**
   * Điểm CHỈ-ĐỌC theo MSSV, chỉ trang chi tiết post-hoc truyền. Vắng mặt ở
   * trang lobby: giữa lúc thi thì điểm chưa tồn tại và không có nghĩa gì.
   * Tầng 2 (spec §7) mới làm chấm/chấm lại thật.
   */
  gradingByMssv?: Record<string, { score: number | null; status: string }>;
```

Trong `DialogContent`, sau khối `deliverables.map(...)`:

```tsx
              {(() => {
                const grade = gradingByMssv?.[selectedStudent.studentMssv];
                if (!grade) return null;
                return (
                  <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface-2/40 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="space-y-1">
                      <p className="font-medium text-foreground">
                        Điểm AI: {grade.score ?? '—'}
                      </p>
                      <p className="text-caption text-muted-foreground">
                        Có khi module chấm điểm hoàn thiện
                      </p>
                    </div>
                    {/* Disabled kèm lý do nhìn thấy được, theo quy ước sẵn có
                        của codebase (placeholder-page.tsx, StatCard.hint) —
                        một nút trông sống mà bấm không ra gì là cách nhanh
                        nhất dạy giảng viên rằng app hỏng. Spec §5.4. */}
                    <Button type="button" variant="outline" size="sm" disabled>
                      Chấm lại
                    </Button>
                  </div>
                );
              })()}
```

- [ ] **Step 4: Nối dữ liệu ở trang chi tiết**

Thêm test vào `[sessionId]/page.test.tsx`:

```tsx
  it('map kết quả chấm theo MSSV và truyền xuống bảng', () => {
    useGradingResultsMock.mockReturnValue({
      data: [{ studentMssv: 'A1', aiTotalScore: 8.5, status: 'ai_graded' }],
    });
    render(<SubmissionSessionDetailPage />);
    expect(submissionStatusTableProps.gradingByMssv).toEqual({
      A1: { score: 8.5, status: 'ai_graded' },
    });
  });
```

Mock ở đầu file (module đã xác minh: `apps/web/src/hooks/useGrading.ts`, chữ ký `useGradingResults(examSessionId: string | undefined)`):

```tsx
const useGradingResultsMock = vi.fn();
vi.mock('@/hooks/useGrading', () => ({
  useGradingResults: (...args: unknown[]) => useGradingResultsMock(...args),
}));
```

và trong `beforeEach`: `useGradingResultsMock.mockReturnValue({ data: undefined });`

Trong `[sessionId]/page.tsx` — thêm `import { useGradingResults } from '@/hooks/useGrading';`:

```tsx
  const gradingResults = useGradingResults(sessionId);

  /**
   * Chỉ-đọc. Nguồn là GET /exam-sessions/:id/grading-results, đã có sẵn —
   * Tầng 1 không thêm endpoint chấm nào.
   */
  const gradingByMssv = useMemo(() => {
    const map: Record<string, { score: number | null; status: string }> = {};
    for (const result of gradingResults.data ?? []) {
      map[result.studentMssv] = { score: result.aiTotalScore, status: result.status };
    }
    return map;
  }, [gradingResults.data]);
```

và truyền `gradingByMssv={gradingByMssv}` vào `SubmissionStatusTable`.

- [ ] **Step 5: Chạy toàn bộ test hai app**

```bash
pnpm --filter web test
pnpm --filter web exec tsc --noEmit
pnpm --filter api test
pnpm --filter api test:e2e -- submission-overview
```

Expected: tất cả PASS. `tsc` chỉ còn **một** lỗi có sẵn từ trước (`read-workbook.test.ts`, lệch type `File`) — lỗi `variant="secondary"` đã được Task 6 sửa.

- [ ] **Step 6: Commit**

```bash
pnpm --filter web lint
git add "apps/web/src/app/(exam-live)/exam-sessions/[id]/_components/SubmissionStatusTable.tsx" \
        "apps/web/src/app/(exam-live)/exam-sessions/[id]/_components/SubmissionStatusTable.test.tsx" \
        "apps/web/src/app/teacher/submissions/[sessionId]/page.tsx" \
        "apps/web/src/app/teacher/submissions/[sessionId]/page.test.tsx"
git commit -m "feat(web): read-only AI score + disabled re-grade placeholder

Re-grading is blocked by design on the backend (immutable AI output,
one-way status machine), so the button ships disabled with its reason
visible rather than looking alive and doing nothing. See spec section 7."
```

---

## Self-Review

**1. Spec coverage**

| Spec | Task |
|---|---|
| §3.1 endpoint + shape | 1 |
| §3.2 mẫu số = hợp, khớp trang chi tiết | 1 (test "bất biến ... SV thi ghép") |
| §3.3 CTE pre-aggregate, 3 biên | 1 |
| §3.4 search dùng lại `GET /submissions` + copy empty state | 2, 5 |
| §4.1 bảng ưu tiên lý do | 3, 4 |
| §4.2 grace + rosterKnown | 3, 4 |
| §4.3 máy trạng thái + chốt tay | 3 |
| §4.4 dải ghim + nhóm + lặp có chủ đích | 3 (`groupByCourseClass`), 4 |
| §4.5 ô search | 5 |
| §5.1 khôi phục trang chi tiết | 7 |
| §5.2 `?student=` | 6, 7 |
| §5.3 hai prop optional | 6, 8 |
| §5.4 điểm chỉ-đọc + Chấm lại disabled | 8 |
| §5.5 nav | 4 |
| §6 sáu cái bẫy | 6 (bẫy 1–5), 6+7 (bẫy 6) |
| §7 ngoài phạm vi | không có task — đúng chủ đích |
| §8 kiểm thử | rải trong mọi task |

Không có mục nào của spec thiếu task.

**2. Placeholder scan** — không có "TBD"/"tương tự Task N". Một chỗ **cố ý** để lại ghi chú thay vì code im lặng: import `EMPTY_LABEL` sai ở Task 4 Step 3 (đã ghi rõ phải bỏ) — giữ lại vì đó là cái bẫy copy-paste thật, không phải placeholder. Ẩn số duy nhất còn lại lúc soát lần đầu (tên module hook chấm điểm) đã được xác minh và ghi thẳng vào Task 8: `apps/web/src/hooks/useGrading.ts`.

**3. Type consistency** — `SessionOverviewItem` giống nhau ở Task 1 (api) và Task 2 (web), 17 field. `focusStudentMssv` (Task 6) và `gradingByMssv` (Task 8) khớp giữa khai báo prop, call site Task 7/8, và test. `SUBMISSION_GRACE_MS` (web) khớp giá trị `SUBMISSION_GRACE_PERIOD_MS` (api). `groupByCourseClass` trả `SessionGroup[]` và Task 4 dùng đúng field `key`/`courseName`/`className`/`sessions`/`attentionCount`.

**Thứ tự phụ thuộc:** 1 → 2 → 3 → 4 → 5, và 6 → 7 → 8. Task 3 không phụ thuộc 2 về runtime (chỉ import type), nên 3 có thể chạy song song với 1–2.
