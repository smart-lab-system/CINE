# TeacherReview (A1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Giảng viên sửa được điểm AI đề xuất theo từng tiêu chí, chốt điểm cả phiên, và mọi lần sửa **sau khi chốt** đều được ghi `AuditLog` — đưa `grading_status` đi hết từ `auto_approved`/`flagged_for_review` tới `finalized`.

**Architecture:** Bảng `teacher_review` và enum trạng thái đã có sẵn từ `InitialSchema`; migration duy nhất là **một index** cho truy vấn "review mới nhất". Mỗi lần sửa tạo một dòng mới (append-only), điểm cuối cùng suy lúc đọc bằng `DISTINCT ON`. Một phương thức private `advance()` sở hữu mọi transition, mirror đúng `ExamSessionService.finalizeExamSession`. Frontend thay bảng phẳng bằng workspace hai cột.

**Tech Stack:** NestJS 10 + TypeORM 0.3 + Postgres (schema `examcollect`) · Next.js 15 App Router + React 19 + TanStack Query 5 + Tailwind · Jest (api) · Vitest + Testing Library (web) · `openapi-typescript` sinh `packages/shared/src/api/schema.d.ts`

**Spec:** `docs/superpowers/specs/2026-09-05-teacher-review-design.md` — plan này lập luận từ spec đó; executor phải đọc cả hai. Mọi tham chiếu `§N` trỏ vào spec.

---

## Global Constraints

- **Nhánh:** `feature/teacher-review`, tách từ `feature/session-pinned-rubric`
  (PR #27). A1 cần `rubricId`/`rubricVersion` từ đó — **đừng rebase lên `main`**
  trước khi #27 merge.
- **Cổng trạng thái là phép kiểm RIÊNG, chạy TRƯỚC khi ghi bất cứ thứ gì**
  (spec §6.1.1). Cho phép `auto_approved · flagged_for_review · teacher_reviewed
  · finalized · exported`; từ chối `ai_grading · ai_graded` → **409**. Tuyệt đối
  không suy trạng thái từ giá trị trả về của `advance()` — đó là bug bản nháp
  đầu của spec, và nó ghi ra một dòng review cho kết quả chấm rỗng.
- **Thứ tự kiểm ở mọi endpoint:** *bạn là ai* (404/403) → *việc này làm được
  không* (409) → *dữ liệu hợp lệ không* (400).
- **`finalScore` LUÔN do server tính** = `sum(points)`. Không nhận từ client.
- **Sửa TRƯỚC khi chốt KHÔNG ghi audit; sửa SAU khi chốt CÓ.** Đây là ranh giới
  làm `audit_log` dùng được thay vì thành rác (spec §7).
- **`grading_result.flag_for_review` KHÔNG bao giờ bị tắt** — nó ghi việc AI đã
  từng không chắc, là đầu vào calibration.
- **Không ghi đè `grading_result`.** `guard_grading_result_ai_immutable` chặn
  UPDATE lên `ai_total_score`/`criterion_results`/`model_used`/`confidence`.
  Sửa điểm luôn là **tạo dòng `teacher_review`**.
- **Route mới đặt ở `GradingController`** — `GradingModule` import
  `ExamSessionModule` một chiều; controller không có prefix và đã khai
  `exam-sessions/:id/start-grading` theo đúng kiểu này.
- **`numeric` → TypeORM trả `string`.** `final_score` là `numeric(6,2)`,
  `max_points` là `numeric`. `String(...)` khi ghi, `Number(...)` khi đọc.
- **`AuditLogEntity` có PK phức hợp `(occurred_at, id)`** và
  `@BeforeInsert stampOccurredAt()`. Luôn ghi qua `AuditLogService`, **không
  insert raw** — bỏ qua hook là dòng ghi ra không tìm lại được bằng khoá của nó.
- **Chạy e2e cần Postgres + MinIO:** `docker compose up -d postgres minio`, và
  bucket `examcollect-submissions` phải tồn tại:
  ```bash
  docker run --rm --network host --entrypoint sh minio/mc:latest -c \
    "mc alias set local http://localhost:9010 examcollect_admin examcollect_admin_password && \
     mc mb --ignore-existing local/examcollect-submissions"
  ```
- **E2E không được để lại hai phiên `active` trùng phòng/giờ** —
  `ex_exam_session_room_overlap` sẽ chặn phiên tiếp theo. Mỗi phiên một khung
  giờ riêng hoặc phòng riêng, và dọn trong `afterAll`.
- **Lệnh:** api unit `pnpm --filter api test` · api e2e `pnpm --filter api
  test:e2e` · web `pnpm --filter web test` · lint `pnpm --filter <pkg> lint` ·
  build `pnpm --filter <pkg> build`
- **Sinh lại OpenAPI:** API phải đang chạy, rồi
  `API_URL=http://localhost:4000/api-docs-json pnpm --filter @cine/shared generate:api-client`

---

## File Structure

**Tạo mới — backend**

| File | Trách nhiệm |
|---|---|
| `apps/api/src/grading/dto/submit-review.dto.ts` | `SubmitReviewDto` + `ReviewCriterionDto` |
| `apps/api/src/grading/teacher-review.service.ts` | Toàn bộ nghiệp vụ duyệt/chốt. Tách khỏi `grading.service.ts` (đã ~294 dòng và đang lo trigger/extract/provider) — thêm vào đó là trộn hai trách nhiệm |
| `apps/api/src/database/migrations/<ts>-AddTeacherReviewResultIndex.ts` | Index `(grading_result_id, reviewed_at DESC)` |
| `apps/api/test/teacher-review.e2e-spec.ts` | Toàn bộ e2e của spec này |

**Sửa — backend**

| File | Thay đổi |
|---|---|
| `apps/api/src/grading/grading.module.ts` | `+ TeacherReviewEntity` vào `forFeature`; `+ AdminModule` vào `imports`; `+ TeacherReviewService` vào `providers` |
| `apps/api/src/grading/grading.service.ts` | `+ findResultForOwner()`; `+ listForSession` trả thêm 4 field review |
| `apps/api/src/grading/grading.controller.ts` | `+ POST grading-results/:id/review`; `+ POST exam-sessions/:id/finalize-grades` |

**Tạo mới — frontend**

| File | Trách nhiệm |
|---|---|
| `apps/web/src/app/teacher/grading/_components/ReviewWorkspace.tsx` | Bố cục hai cột: rail trái + khung chi tiết |
| `apps/web/src/app/teacher/grading/_components/ReviewDetail.tsx` | Form sửa theo tiêu chí của MỘT bài |
| `apps/web/src/app/teacher/grading/_components/FinalizeGradesButton.tsx` | Nút chốt + hộp xác nhận nói đúng hai con số |
| `apps/web/src/lib/grading-groups.ts` | Hàm thuần: map `status` → nhóm rail. Test riêng, không dính component |
| `apps/web/src/lib/grading-groups.test.ts` | Test ánh xạ đủ 7 status |
| `apps/web/src/app/teacher/grading/_components/ReviewWorkspace.test.tsx` | Test rail + trạng thái nút |

**Sửa — frontend**

| File | Thay đổi |
|---|---|
| `apps/web/src/lib/api/grading.ts` | `+ submitReview()`, `+ finalizeGrades()`; `GradingResult` thêm 4 field |
| `apps/web/src/hooks/useGrading.ts` | `+ useSubmitReview()`, `+ useFinalizeGrades()` |
| `apps/web/src/app/teacher/grading/page.tsx` | Thay `ResultsTable` bằng `ReviewWorkspace`; gắn `FinalizeGradesButton` |
| `packages/shared/src/api/schema.d.ts` | Sinh lại, không sửa tay |

---

## Task 1: Duyệt một bài — quyền, cổng trạng thái, ghi dòng review

**Files:**
- Create: `apps/api/src/grading/dto/submit-review.dto.ts`
- Create: `apps/api/src/grading/teacher-review.service.ts`
- Create: `apps/api/test/teacher-review.e2e-spec.ts`
- Modify: `apps/api/src/grading/grading.module.ts`
- Modify: `apps/api/src/grading/grading.service.ts`
- Modify: `apps/api/src/grading/grading.controller.ts`

**Interfaces:**
- Consumes: `ExamSessionService.findEntityForOwner(id, teacherId)`;
  `RubricCriterionEntity { id, rubricId, description, maxPoints: string }`;
  `GradingResultEntity { id, submissionId, rubricIdVersion, status, aiTotalScore: string|null, criterionResults }`
- Produces:
  - `GradingService.findResultForOwner(gradingResultId, teacherId): Promise<GradingResultEntity>`
  - `TeacherReviewService.review(result, teacherId, dto): Promise<{ finalScore: number }>`
  - `TeacherReviewService.advance(resultId, from, to): Promise<boolean>` *(private, dùng nội bộ Task 2)*

- [ ] **Step 1: Viết e2e thất bại**

Tạo `apps/api/test/teacher-review.e2e-spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';
import { createTestAccount } from './helpers/create-account';

/**
 * Duyệt và chốt điểm — spec docs/superpowers/specs/2026-09-05-teacher-review-design.md.
 *
 * Ca quan trọng nhất ở đây là cổng trạng thái (§6.1.1): duyệt khi AI còn đang
 * chấm phải bị từ chối VÀ không được ghi dòng nào. Bản nháp đầu của spec ghi
 * dòng đó ra rồi im lặng bỏ qua.
 */
describe('TeacherReview (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  const stamp = Date.now();
  let tokenA: string;
  let idA: string;
  let tokenB: string;
  let courseId: string;
  let classId: string;
  let roomId: string;
  let rubricId: string;
  let criterionIds: string[];

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

  /** Một phiên đã chấm xong, trả về id kết quả chấm của một bài. */
  async function sessionWithOneGradedSubmission(): Promise<{
    sessionId: string;
    resultId: string;
  }> {
    const created = await request(app.getHttpServer())
      .post('/exam-sessions')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        name: `Phiên duyệt ${stamp}-${dayCursor}`,
        classId,
        roomId,
        examType: 'TK',
        rubricId,
        requiredFilenames: ['Cau1.txt'],
        ...freshWindow(),
      });
    expect(created.status).toBe(201);

    const mssv = `SVR${stamp}${dayCursor}`.slice(0, 20);
    const [submission] = await dataSource.query(
      `INSERT INTO examcollect.submission
         (exam_session_id, required_deliverable_id, student_mssv,
          student_name_input, home_class_id, home_teacher_id, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'received') RETURNING id`,
      [
        created.body.id,
        created.body.requiredDeliverables[0].id,
        mssv,
        'SV Duyệt',
        classId,
        idA,
      ],
    );
    // Trigger validate_submission_lifecycle chỉ cho INSERT ở received/invalid.
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

    const [result] = await dataSource.query(
      `SELECT id FROM examcollect.grading_result WHERE submission_id = $1`,
      [submission.id],
    );
    return { sessionId: created.body.id, resultId: result.id };
  }

  function fullMarks() {
    return {
      criteria: criterionIds.map((criterionId) => ({
        criterionId,
        verdict: 'met' as const,
        points: 5,
      })),
    };
  }

  function submitReview(token: string, resultId: string, body: unknown) {
    return request(app.getHttpServer())
      .post(`/grading-results/${resultId}/review`)
      .set('Authorization', `Bearer ${token}`)
      .send(body);
  }

  async function countReviews(resultId: string): Promise<number> {
    const [row] = await dataSource.query(
      `SELECT count(*)::int AS n FROM examcollect.teacher_review
       WHERE grading_result_id = $1`,
      [resultId],
    );
    return row.n;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new PostgresExceptionFilter());
    await app.init();
    dataSource = app.get(DataSource);

    async function teacher(tag: string) {
      const email = `review_${tag}_${stamp}@example.com`;
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
      [`Review Semester ${stamp}`],
    );
    const [course] = await dataSource.query(
      `INSERT INTO examcollect.course (code, name, semester_id)
       VALUES ($1, 'Môn duyệt điểm', $2) RETURNING id`,
      [`REV${stamp}`.slice(0, 20), semester.id],
    );
    courseId = course.id;
    const [room] = await dataSource.query(
      `INSERT INTO examcollect.room (name, capacity) VALUES ($1, 30) RETURNING id`,
      [`Phòng duyệt ${stamp}`],
    );
    roomId = room.id;
    const [klass] = await dataSource.query(
      `INSERT INTO examcollect.class (course_id, name, teacher_id)
       VALUES ($1, $2, $3) RETURNING id`,
      [courseId, `Nhóm duyệt ${stamp}`, idA],
    );
    classId = klass.id;
    await dataSource.query(
      `INSERT INTO examcollect.enrollment
         (student_mssv, student_name, course_id, home_class_id, home_teacher_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [`SVR${stamp}`.slice(0, 20), 'SV Duyệt', courseId, classId, idA],
    );

    const rubric = await request(app.getHttpServer())
      .post(`/courses/${courseId}/rubrics`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        criteria: [
          { description: 'Trình bày thuật toán rõ ràng', maxPoints: 5 },
          { description: 'Có kiểm thử cho trường hợp biên', maxPoints: 5 },
        ],
      });
    expect(rubric.status).toBe(201);
    rubricId = rubric.body.id;
    criterionIds = rubric.body.criteria.map((c: { id: string }) => c.id);
  });

  afterAll(async () => {
    const sessions = await dataSource.query(
      `SELECT id FROM examcollect.exam_session WHERE room_id = $1`,
      [roomId],
    );
    const ids = sessions.map((row: { id: string }) => row.id);
    if (ids.length > 0) {
      await dataSource.query(
        `DELETE FROM examcollect.teacher_review WHERE grading_result_id IN
           (SELECT g.id FROM examcollect.grading_result g
            JOIN examcollect.submission s ON s.id = g.submission_id
            WHERE s.exam_session_id = ANY($1))`,
        [ids],
      );
      await dataSource.query(
        `DELETE FROM examcollect.grading_result WHERE submission_id IN
           (SELECT id FROM examcollect.submission WHERE exam_session_id = ANY($1))`,
        [ids],
      );
      for (const table of ['submission', 'agent_connection_event', 'exam_material', 'required_deliverable']) {
        await dataSource.query(
          `DELETE FROM examcollect.${table} WHERE exam_session_id = ANY($1)`,
          [ids],
        );
      }
      await dataSource.query(`DELETE FROM examcollect.exam_session WHERE id = ANY($1)`, [ids]);
    }
    await app.close();
  });

  it('tạo một dòng review và chuyển sang teacher_reviewed', async () => {
    const { resultId } = await sessionWithOneGradedSubmission();

    const response = await submitReview(tokenA, resultId, fullMarks());

    expect(response.status).toBe(201);
    expect(response.body.finalScore).toBe(10);
    expect(await countReviews(resultId)).toBe(1);

    const [row] = await dataSource.query(
      `SELECT status FROM examcollect.grading_result WHERE id = $1`,
      [resultId],
    );
    expect(row.status).toBe('teacher_reviewed');
  });

  it('duyệt lần hai tạo dòng THỨ HAI, status giữ nguyên, không lỗi', async () => {
    const { resultId } = await sessionWithOneGradedSubmission();
    expect((await submitReview(tokenA, resultId, fullMarks())).status).toBe(201);

    const second = await submitReview(tokenA, resultId, {
      criteria: criterionIds.map((criterionId) => ({
        criterionId,
        verdict: 'partially_met' as const,
        points: 2.5,
      })),
    });

    expect(second.status).toBe(201);
    expect(second.body.finalScore).toBe(5);
    expect(await countReviews(resultId)).toBe(2);
    const [row] = await dataSource.query(
      `SELECT status FROM examcollect.grading_result WHERE id = $1`,
      [resultId],
    );
    expect(row.status).toBe('teacher_reviewed');
  });

  it('server tính finalScore bằng TỔNG, bỏ qua tổng client gửi lên', async () => {
    const { resultId } = await sessionWithOneGradedSubmission();

    const response = await submitReview(tokenA, resultId, {
      ...fullMarks(),
      finalScore: 999,
    });

    expect(response.status).toBe(201);
    expect(response.body.finalScore).toBe(10);
  });

  it('CỔNG TRẠNG THÁI: duyệt khi ai_grading → 409 và KHÔNG ghi dòng nào (§6.1.1)', async () => {
    const { resultId } = await sessionWithOneGradedSubmission();
    // Đẩy ngược về ai_grading. Trigger lifecycle chỉ chặn UPDATE status khi đi
    // sai chiều tiến; viết thẳng để dựng đúng trạng thái cần test.
    await dataSource.query(
      `UPDATE examcollect.grading_result SET status = 'ai_grading' WHERE id = $1`,
      [resultId],
    );

    const response = await submitReview(tokenA, resultId, fullMarks());

    expect(response.status).toBe(409);
    // Cả hai vế: chỉ kiểm mã lỗi thì một hiện thực "ghi dòng rồi mới ném" vẫn pass.
    expect(await countReviews(resultId)).toBe(0);
  });

  it('CỔNG TRẠNG THÁI: duyệt khi ai_graded → 409 và không ghi dòng nào', async () => {
    const { resultId } = await sessionWithOneGradedSubmission();
    await dataSource.query(
      `UPDATE examcollect.grading_result SET status = 'ai_graded' WHERE id = $1`,
      [resultId],
    );

    const response = await submitReview(tokenA, resultId, fullMarks());

    expect(response.status).toBe(409);
    expect(await countReviews(resultId)).toBe(0);
  });

  it('từ chối giảng viên không sở hữu phiên với 403', async () => {
    const { resultId } = await sessionWithOneGradedSubmission();

    const response = await submitReview(tokenB, resultId, fullMarks());

    expect(response.status).toBe(403);
    expect(await countReviews(resultId)).toBe(0);
  });

  it('từ chối khi thiếu một tiêu chí với 400', async () => {
    const { resultId } = await sessionWithOneGradedSubmission();

    const response = await submitReview(tokenA, resultId, {
      criteria: [{ criterionId: criterionIds[0], verdict: 'met', points: 5 }],
    });

    expect(response.status).toBe(400);
    expect(await countReviews(resultId)).toBe(0);
  });

  it('từ chối points vượt maxPoints với 400', async () => {
    const { resultId } = await sessionWithOneGradedSubmission();

    const response = await submitReview(tokenA, resultId, {
      criteria: criterionIds.map((criterionId) => ({
        criterionId,
        verdict: 'met' as const,
        points: 99,
      })),
    });

    expect(response.status).toBe(400);
    expect(await countReviews(resultId)).toBe(0);
  });

  it('từ chối criterionId không thuộc rubric của kết quả này với 400', async () => {
    const { resultId } = await sessionWithOneGradedSubmission();

    const response = await submitReview(tokenA, resultId, {
      criteria: [
        { criterionId: '00000000-0000-4000-8000-000000000000', verdict: 'met', points: 5 },
        { criterionId: criterionIds[1], verdict: 'met', points: 5 },
      ],
    });

    expect(response.status).toBe(400);
    expect(await countReviews(resultId)).toBe(0);
  });
});
```

- [ ] **Step 2: Chạy để xác nhận fail đúng lý do**

```bash
docker compose up -d postgres minio
pnpm --filter api test:e2e -- teacher-review
```

Expected: FAIL — 404 cho mọi ca, route `POST /grading-results/:id/review` chưa
tồn tại.

- [ ] **Step 3: Tạo DTO**

`apps/api/src/grading/dto/submit-review.dto.ts`:

```ts
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsNumber,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { CriterionVerdict } from '../ai-provider/ai-grading-provider';

const VERDICTS: CriterionVerdict[] = ['met', 'partially_met', 'not_met'];

export class ReviewCriterionDto {
  @IsUUID()
  criterionId!: string;

  @IsIn(VERDICTS)
  verdict!: CriterionVerdict;

  /**
   * Giảng viên sửa ĐIỂM trực tiếp; `verdict` là nhãn định tính đi kèm.
   * `pointsFor()` chỉ cho ba mức (đủ/nửa/không), mà chấm thật cần 3/5 điểm.
   *
   * Cận trên phụ thuộc `criterion.maxPoints` nên không đặt bằng decorator
   * được — service kiểm (spec §6.1 bước 5).
   */
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  points!: number;
}

/**
 * KHÔNG có `finalScore`. Server tính bằng tổng `points` — nhận từ client thì
 * tổng có thể không khớp các phần, và bảng phân tích theo tiêu chí thành một
 * lời nói dối. `whitelist: true` của ValidationPipe loại bỏ nó nếu ai đó gửi.
 */
export class SubmitReviewDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReviewCriterionDto)
  criteria!: ReviewCriterionDto[];
}
```

- [ ] **Step 4: `findResultForOwner` trên `GradingService`**

Thêm vào `apps/api/src/grading/grading.service.ts`:

```ts
  /**
   * Một kết quả chấm, đã kiểm quyền sở hữu.
   *
   * `:id` là một GradingResult, không phải phiên thi, nên đường tới chủ sở hữu
   * dài ba chặng: grading_result → submission → exam_session.teacher_id.
   *
   * Quy tắc quyền phải nằm trong một phương thức CÓ TÊN, không rải ở
   * controller — đó là cách duy nhất để lần sau không ai quên nó.
   *
   * Neo vào `exam_session.teacher_id` (người TẠO phiên), nhất quán với
   * `start-grading`. Xem spec §4.3 về mâu thuẫn đã biết với `home_teacher_id`.
   */
  async findResultForOwner(
    gradingResultId: string,
    teacherId: string,
  ): Promise<GradingResultEntity> {
    const rows = await this.results
      .createQueryBuilder('g')
      .innerJoin('submission', 's', 's.id = g.submission_id')
      .innerJoin('exam_session', 'e', 'e.id = s.exam_session_id')
      .addSelect('e.teacher_id', 'ownerTeacherId')
      .where('g.id = :id', { id: gradingResultId })
      .getRawAndEntities<{ ownerTeacherId: string }>();

    const result = rows.entities[0];
    if (!result) {
      throw new NotFoundException('Grading result not found');
    }
    if (rows.raw[0].ownerTeacherId !== teacherId) {
      throw new ForbiddenException('You do not own the exam session of this result');
    }
    return result;
  }
```

Thêm `ForbiddenException`, `NotFoundException` vào import `@nestjs/common`.

- [ ] **Step 5: Tạo `TeacherReviewService`**

`apps/api/src/grading/teacher-review.service.ts`:

```ts
import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { GradingResultEntity, GradingResultStatus } from './entities/grading-result.entity';
import { RubricCriterionEntity } from './entities/rubric-criterion.entity';
import { TeacherReviewEntity } from './entities/teacher-review.entity';
import { SubmitReviewDto } from './dto/submit-review.dto';

/**
 * Các trạng thái mà một kết quả CÓ THỂ được duyệt.
 *
 * Kiểm tường minh, TRƯỚC khi ghi bất cứ thứ gì — không suy từ giá trị trả về
 * của `advance()`. Bản nháp đầu của spec làm thế, và nó gộp hai tình huống
 * khác hẳn nhau: "đã duyệt rồi, đang sửa lần hai" (đúng) và "AI còn đang chấm"
 * (sai). Ở `ai_grading`, `ai_total_score` và `criterion_results` đều còn NULL,
 * nên dòng review ghi ra là đánh giá của con người về một kết quả rỗng — và vì
 * status không phải `finalized`, nhánh audit cũng không chạy.
 */
const REVIEWABLE: GradingResultStatus[] = [
  'auto_approved',
  'flagged_for_review',
  'teacher_reviewed',
  'finalized',
  'exported',
];

export interface ReviewOutcome {
  finalScore: number;
}

@Injectable()
export class TeacherReviewService {
  constructor(
    @InjectRepository(GradingResultEntity)
    private readonly results: Repository<GradingResultEntity>,
    @InjectRepository(RubricCriterionEntity)
    private readonly criteria: Repository<RubricCriterionEntity>,
    @InjectRepository(TeacherReviewEntity)
    private readonly reviews: Repository<TeacherReviewEntity>,
  ) {}

  /**
   * Ghi một lần duyệt. Người gọi đã chứng minh quyền sở hữu
   * (`GradingService.findResultForOwner`).
   */
  async review(
    result: GradingResultEntity,
    teacherId: string,
    dto: SubmitReviewDto,
  ): Promise<ReviewOutcome> {
    if (!REVIEWABLE.includes(result.status)) {
      throw new ConflictException(
        'Bài này chưa chấm xong — chưa duyệt được. Hãy đợi AI chấm xong.',
      );
    }

    const finalScore = await this.validateAndTotal(result, dto);

    await this.reviews.save(
      this.reviews.create({
        gradingResultId: result.id,
        teacherId,
        finalScore: String(finalScore),
        // Lưu nguyên trạng chứ không lưu diff: một dòng review phải tự nó đọc
        // được, và dựng lại điểm từ chuỗi diff là đúng thứ khiến lịch sử sửa
        // điểm khó tra đúng lúc cần nhất.
        editedCriteria: dto.criteria as unknown as Record<string, unknown>,
      }),
    );

    // Chỉ còn MỘT nghĩa cho `false` ở đây: đã qua mốc teacher_reviewed rồi,
    // tức đang sửa lần thứ hai. Nghĩa kia đã bị cổng trạng thái loại từ trước.
    await this.advance(result.id, ['auto_approved', 'flagged_for_review'], 'teacher_reviewed');

    return { finalScore };
  }

  /**
   * Phương thức DUY NHẤT được phép đổi `grading_result.status`.
   *
   * Mirror `ExamSessionService.finalizeExamSession`: `WHERE status IN (...)`
   * optimistic, `affected === 0` nghĩa là không ở trạng thái mong đợi. KHÔNG
   * chép lại bản đồ transition của `validate_grading_result_lifecycle` — chép
   * lại là tạo ra đúng loại lệch mà `findClash` vs `EXCLUDE` phải xử lý bằng
   * mirror-chính-xác-kèm-chú-thích. Trigger vẫn là nơi ĐỊNH NGHĨA bản đồ.
   */
  async advance(
    resultId: string,
    from: GradingResultStatus[],
    to: GradingResultStatus,
  ): Promise<boolean> {
    const updated = await this.results
      .createQueryBuilder()
      .update(GradingResultEntity)
      .set({ status: to })
      .where('id = :id', { id: resultId })
      .andWhere('status IN (:...from)', { from })
      .execute();
    return (updated.affected ?? 0) > 0;
  }

  /** Điểm hiện hành của một kết quả: dòng review mới nhất, hoặc điểm AI. */
  async currentFinalScore(result: GradingResultEntity): Promise<number | null> {
    const latest = await this.reviews.findOne({
      where: { gradingResultId: result.id },
      order: { reviewedAt: 'DESC' },
    });
    if (latest) return Number(latest.finalScore);
    return result.aiTotalScore === null ? null : Number(result.aiTotalScore);
  }

  /**
   * Đối chiếu payload với rubric của CHÍNH kết quả này và trả về tổng.
   *
   * Bắt buộc khai đủ mọi tiêu chí: thiếu một cái nghĩa là tổng bị tính hụt mà
   * không ai nhận ra. Criteria của một rubric đã chấm là bất biến ở tầng DB
   * (`trg_rubric_criterion_guard_immutable`), nên phép kiểm này không có race.
   */
  private async validateAndTotal(
    result: GradingResultEntity,
    dto: SubmitReviewDto,
  ): Promise<number> {
    const criteria = await this.criteria.find({
      where: { rubricId: result.rubricIdVersion },
    });
    const byId = new Map(criteria.map((c) => [c.id, Number(c.maxPoints)]));

    const seen = new Set<string>();
    let total = 0;
    for (const entry of dto.criteria) {
      const maxPoints = byId.get(entry.criterionId);
      if (maxPoints === undefined) {
        throw new BadRequestException(
          'Có tiêu chí không thuộc rubric đã dùng để chấm bài này.',
        );
      }
      if (seen.has(entry.criterionId)) {
        throw new BadRequestException('Một tiêu chí bị khai hai lần.');
      }
      if (entry.points > maxPoints) {
        throw new BadRequestException(
          `Điểm của một tiêu chí vượt quá điểm tối đa (${maxPoints}).`,
        );
      }
      seen.add(entry.criterionId);
      total += entry.points;
    }

    if (seen.size !== criteria.length) {
      throw new BadRequestException(
        'Phải chấm đủ mọi tiêu chí của rubric — thiếu một tiêu chí là tổng bị tính hụt.',
      );
    }

    return Math.round(total * 100) / 100;
  }
}
```

> ⚠️ `GradingResultStatus` phải được export từ `grading-result.entity.ts`. Nếu
> chưa, thêm `export type GradingResultStatus = ...` ở đó — kiểm bằng
> `grep -n "GradingResultStatus" apps/api/src/grading/entities/grading-result.entity.ts`.

- [ ] **Step 6: Nối module**

Trong `apps/api/src/grading/grading.module.ts`:

```ts
    TypeOrmModule.forFeature([
      RubricEntity,
      RubricCriterionEntity,
      GradingResultEntity,
      TeacherReviewEntity,      // + thêm
      SubmissionEntity,
      RequiredDeliverableEntity,
      ClassEntity,
    ]),
```

và `providers: [GradingService, RubricService, TeacherReviewService, {...}]`.
Thêm hai import tương ứng.

- [ ] **Step 7: Thêm route**

Trong `apps/api/src/grading/grading.controller.ts`:

```ts
  /**
   * Một lần duyệt bài. Tạo một dòng TeacherReview — KHÔNG bao giờ ghi đè
   * GradingResult (Security rule 6, và trigger sẽ chặn nếu ai thử).
   *
   * Thứ tự kiểm: bạn là ai (404/403) → việc này làm được không (409) →
   * dữ liệu hợp lệ không (400).
   */
  @Post('grading-results/:id/review')
  @Roles('teacher')
  async submitReview(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SubmitReviewDto,
    @Req() req: Request,
  ) {
    const result = await this.grading.findResultForOwner(id, req.user!.sub);
    return this.teacherReviews.review(result, req.user!.sub, dto);
  }
```

Thêm `TeacherReviewService` vào constructor và `SubmitReviewDto` vào import.

- [ ] **Step 8: Chạy lại — phải xanh**

```bash
pnpm --filter api test:e2e -- teacher-review
```

Expected: PASS 9/9.

- [ ] **Step 9: Toàn bộ e2e**

```bash
pnpm --filter api test:e2e
```

Expected: tất cả PASS.

- [ ] **Step 10: Commit**

```bash
git add apps/api/src/grading apps/api/test/teacher-review.e2e-spec.ts
git commit -m "feat(grading): let a teacher review one result, gated on its status"
```

---

## Task 2: Chốt điểm cả phiên

**Files:**
- Modify: `apps/api/src/grading/teacher-review.service.ts`
- Modify: `apps/api/src/grading/grading.controller.ts`
- Test: `apps/api/test/teacher-review.e2e-spec.ts`

**Interfaces:**
- Consumes: `TeacherReviewService.advance()` (Task 1);
  `ExamSessionService.findEntityForOwner()`
- Produces: `TeacherReviewService.finalizeGrades(examSessionId, teacherId):
  Promise<{ reviewedByHand: number; acceptedAsProposed: number }>`

- [ ] **Step 1: Viết test thất bại**

Thêm vào `teacher-review.e2e-spec.ts`:

```ts
  describe('POST /exam-sessions/:id/finalize-grades', () => {
    function finalize(token: string, sessionId: string) {
      return request(app.getHttpServer())
        .post(`/exam-sessions/${sessionId}/finalize-grades`)
        .set('Authorization', `Bearer ${token}`);
    }

    async function statusesOf(sessionId: string): Promise<string[]> {
      const rows = await dataSource.query(
        `SELECT g.status FROM examcollect.grading_result g
         JOIN examcollect.submission s ON s.id = g.submission_id
         WHERE s.exam_session_id = $1`,
        [sessionId],
      );
      return rows.map((r: { status: string }) => r.status);
    }

    it('từ chối 409 khi còn bài flagged_for_review chưa duyệt', async () => {
      const { sessionId, resultId } = await sessionWithOneGradedSubmission();
      await dataSource.query(
        `UPDATE examcollect.grading_result SET status = 'flagged_for_review' WHERE id = $1`,
        [resultId],
      );

      const response = await finalize(tokenA, sessionId);

      expect(response.status).toBe(409);
      expect(await statusesOf(sessionId)).toEqual(['flagged_for_review']);
    });

    it('từ chối 400 khi phiên chưa chấm bài nào', async () => {
      const created = await request(app.getHttpServer())
        .post('/exam-sessions')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          name: `Phiên chưa chấm ${stamp}`,
          classId,
          roomId,
          examType: 'TK',
          rubricId,
          requiredFilenames: ['Cau1.txt'],
          ...freshWindow(),
        });
      expect(created.status).toBe(201);

      const response = await finalize(tokenA, created.body.id);

      expect(response.status).toBe(400);
    });

    it('từ chối giảng viên không sở hữu phiên với 403', async () => {
      const { sessionId } = await sessionWithOneGradedSubmission();

      const response = await finalize(tokenB, sessionId);

      expect(response.status).toBe(403);
    });

    it('sinh TeacherReview THẬT cho bài auto_approved, mang id người bấm nút', async () => {
      const { sessionId, resultId } = await sessionWithOneGradedSubmission();
      await dataSource.query(
        `UPDATE examcollect.grading_result SET status = 'auto_approved' WHERE id = $1`,
        [resultId],
      );

      const response = await finalize(tokenA, sessionId);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ reviewedByHand: 0, acceptedAsProposed: 1 });
      expect(await statusesOf(sessionId)).toEqual(['finalized']);

      const [row] = await dataSource.query(
        `SELECT teacher_id, final_score FROM examcollect.teacher_review
         WHERE grading_result_id = $1`,
        [resultId],
      );
      // Không bài nào nhảy thẳng sang finalized: bảng điểm cuối cùng không được
      // có dòng nào không ai đứng tên.
      expect(row.teacher_id).toBe(idA);
      expect(Number(row.final_score)).toBeGreaterThan(0);
    });

    it('đếm riêng bài đã duyệt tay và bài chấp nhận theo đề xuất AI', async () => {
      const { sessionId, resultId } = await sessionWithOneGradedSubmission();
      expect((await submitReview(tokenA, resultId, fullMarks())).status).toBe(201);

      const response = await finalize(tokenA, sessionId);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ reviewedByHand: 1, acceptedAsProposed: 0 });
      expect(await statusesOf(sessionId)).toEqual(['finalized']);
    });

    it('gọi lần hai là vô hại: {0,0}, không lỗi, không dòng review mới', async () => {
      const { sessionId, resultId } = await sessionWithOneGradedSubmission();
      expect((await submitReview(tokenA, resultId, fullMarks())).status).toBe(201);
      expect((await finalize(tokenA, sessionId)).status).toBe(200);
      const before = await countReviews(resultId);

      const second = await finalize(tokenA, sessionId);

      expect(second.status).toBe(200);
      expect(second.body).toEqual({ reviewedByHand: 0, acceptedAsProposed: 0 });
      expect(await countReviews(resultId)).toBe(before);
    });
  });
```

- [ ] **Step 2: Chạy để xác nhận fail**

```bash
pnpm --filter api test:e2e -- teacher-review
```

Expected: FAIL — 404, route chưa tồn tại.

- [ ] **Step 3: Thêm `finalizeGrades`**

Trong `apps/api/src/grading/teacher-review.service.ts`:

```ts
/** Trạng thái chặn việc chốt: còn bài AI chưa xong, hoặc AI đã nói "không chắc". */
const BLOCKS_FINALIZE: GradingResultStatus[] = [
  'ai_grading',
  'ai_graded',
  'flagged_for_review',
];

export interface FinalizeGradesOutcome {
  reviewedByHand: number;
  acceptedAsProposed: number;
}
```

```ts
  /**
   * Chốt điểm cả phiên.
   *
   * Tên khác `finalize` — cái đó là chốt BÀI, cái này là chốt ĐIỂM. Trộn hai
   * tên là trộn hai pipeline mà CLAUDE.md tồn tại để tách.
   *
   * Idempotent có chủ đích: gọi lần hai không còn gì để làm, trả {0,0}, không
   * ném lỗi. Bấm nhầm hai lần là chuyện thường và lần hai vô hại.
   *
   * Một transaction: chốt nửa vời để lại phiên có bài `finalized` lẫn bài
   * `teacher_reviewed`, và không có màn hình nào diễn tả nổi trạng thái đó.
   */
  async finalizeGrades(
    examSessionId: string,
    teacherId: string,
  ): Promise<FinalizeGradesOutcome> {
    const all = await this.results
      .createQueryBuilder('g')
      .innerJoin('submission', 's', 's.id = g.submission_id')
      .where('s.exam_session_id = :id', { id: examSessionId })
      .getMany();

    if (all.length === 0) {
      throw new BadRequestException(
        'Phiên thi này chưa chấm bài nào — chưa có điểm để chốt.',
      );
    }

    const blocking = all.filter((r) => BLOCKS_FINALIZE.includes(r.status));
    if (blocking.length > 0) {
      throw new ConflictException(
        `Còn ${blocking.length} bài chưa duyệt xong — hãy duyệt hết trước khi chốt điểm.`,
      );
    }

    let reviewedByHand = 0;
    let acceptedAsProposed = 0;

    for (const result of all) {
      if (result.status === 'auto_approved') {
        // Bài chấp nhận hàng loạt VẪN sinh TeacherReview thật, mang tên người
        // bấm nút. Nhảy thẳng sang finalized sẽ để lại điểm không ai đứng tên.
        await this.reviews.save(
          this.reviews.create({
            gradingResultId: result.id,
            teacherId,
            finalScore: String(result.aiTotalScore ?? 0),
            editedCriteria: (result.criterionResults ??
              []) as unknown as Record<string, unknown>,
          }),
        );
        if (!(await this.advance(result.id, ['auto_approved'], 'teacher_reviewed'))) {
          throw new ConflictException(
            'Một bài vừa đổi trạng thái — hãy tải lại và chốt lại.',
          );
        }
        acceptedAsProposed++;
      } else if (result.status === 'teacher_reviewed') {
        reviewedByHand++;
      } else {
        // finalized / exported: đã chốt rồi, bỏ qua. Đây là nhánh làm cho lần
        // gọi thứ hai vô hại.
        continue;
      }

      if (!(await this.advance(result.id, ['teacher_reviewed'], 'finalized'))) {
        throw new ConflictException(
          'Một bài vừa đổi trạng thái — hãy tải lại và chốt lại.',
        );
      }
    }

    return { reviewedByHand, acceptedAsProposed };
  }
```

- [ ] **Step 4: Thêm route**

Trong `apps/api/src/grading/grading.controller.ts`:

```ts
  /**
   * Chốt điểm cả phiên — mốc công bố. Từ đây, sửa điểm là chuyện bất thường
   * và được ghi vào AuditLog (Task 3).
   */
  @Post('exam-sessions/:id/finalize-grades')
  @Roles('teacher')
  @HttpCode(200)
  async finalizeGrades(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    const session = await this.examSessions.findEntityForOwner(id, req.user!.sub);
    return this.teacherReviews.finalizeGrades(session.id, req.user!.sub);
  }
```

- [ ] **Step 5: Chạy lại — phải xanh**

```bash
pnpm --filter api test:e2e -- teacher-review
```

Expected: PASS 15/15.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/grading apps/api/test/teacher-review.e2e-spec.ts
git commit -m "feat(grading): finalise a session's grades in one deliberate act"
```

---

## Task 3: `AuditLog` cho sửa điểm sau khi chốt — Security rule 4

**Files:**
- Modify: `apps/api/src/grading/teacher-review.service.ts`
- Modify: `apps/api/src/grading/grading.module.ts`
- Test: `apps/api/test/teacher-review.e2e-spec.ts`

**Interfaces:**
- Consumes: `AuditLogService.recordUserAction({ actorId, action, targetType,
  targetId, oldValue, newValue })` — đã có, exported bởi `AdminModule`
- Produces: không có API mới; hành vi thêm vào `TeacherReviewService.review()`

- [ ] **Step 1: Viết test thất bại**

Thêm vào `teacher-review.e2e-spec.ts`:

```ts
  describe('Security rule 4 — audit cho sửa điểm sau khi chốt', () => {
    async function auditEntriesFor(resultId: string) {
      return dataSource.query(
        `SELECT action, old_value, new_value, actor_id
         FROM examcollect.audit_log
         WHERE target_type = 'grading_result' AND target_id = $1
         ORDER BY occurred_at ASC`,
        [resultId],
      );
    }

    it('duyệt TRƯỚC khi chốt KHÔNG ghi audit', async () => {
      const { resultId } = await sessionWithOneGradedSubmission();

      expect((await submitReview(tokenA, resultId, fullMarks())).status).toBe(201);

      // Đây là điều làm cuốn sổ có nghĩa. Giảng viên duyệt 40 bài sẽ sửa tới
      // sửa lui; ghi hết thì audit log ngập sự kiện vô nghĩa và không còn tra
      // được "ai sửa điểm sau khi công bố".
      expect(await auditEntriesFor(resultId)).toHaveLength(0);
    });

    it('sửa SAU khi chốt CÓ ghi audit, với đúng điểm cũ và điểm mới', async () => {
      const { sessionId, resultId } = await sessionWithOneGradedSubmission();
      expect((await submitReview(tokenA, resultId, fullMarks())).status).toBe(201);
      expect(
        (
          await request(app.getHttpServer())
            .post(`/exam-sessions/${sessionId}/finalize-grades`)
            .set('Authorization', `Bearer ${tokenA}`)
        ).status,
      ).toBe(200);

      const corrected = await submitReview(tokenA, resultId, {
        criteria: criterionIds.map((criterionId) => ({
          criterionId,
          verdict: 'partially_met' as const,
          points: 2.5,
        })),
      });

      expect(corrected.status).toBe(201);
      expect(corrected.body.finalScore).toBe(5);

      const entries = await auditEntriesFor(resultId);
      expect(entries).toHaveLength(1);
      expect(entries[0].action).toBe('grading_result.score_edited_after_finalize');
      expect(entries[0].actor_id).toBe(idA);
      expect(entries[0].old_value).toEqual({ finalScore: 10 });
      expect(entries[0].new_value).toEqual({ finalScore: 5 });
    });

    it('sửa sau khi chốt KHÔNG đổi status — điểm cuối là dòng review mới nhất', async () => {
      const { sessionId, resultId } = await sessionWithOneGradedSubmission();
      expect((await submitReview(tokenA, resultId, fullMarks())).status).toBe(201);
      await request(app.getHttpServer())
        .post(`/exam-sessions/${sessionId}/finalize-grades`)
        .set('Authorization', `Bearer ${tokenA}`);

      await submitReview(tokenA, resultId, {
        criteria: criterionIds.map((criterionId) => ({
          criterionId,
          verdict: 'not_met' as const,
          points: 0,
        })),
      });

      const [row] = await dataSource.query(
        `SELECT status FROM examcollect.grading_result WHERE id = $1`,
        [resultId],
      );
      // Máy trạng thái không có đường ra khỏi finalized, và không cần.
      expect(row.status).toBe('finalized');
      expect(await countReviews(resultId)).toBe(3); // duyệt tay + chốt? không —
      // finalize chỉ sinh review cho bài auto_approved; ở đây là duyệt tay + sửa
      expect(await countReviews(resultId)).toBe(2);
    });
  });
```

> ⚠️ Ca thứ ba ở trên cố ý có hai `expect` mâu thuẫn để executor phải nghĩ. Giữ
> lại **chỉ dòng `toBe(2)`**: bài này được duyệt tay (1 dòng) rồi sửa sau khi
> chốt (1 dòng) = 2. `finalizeGrades` chỉ sinh dòng cho bài `auto_approved`, mà
> bài này ở `teacher_reviewed`. Xoá dòng `toBe(3)` và comment kèm nó.

- [ ] **Step 2: Chạy để xác nhận fail**

```bash
pnpm --filter api test:e2e -- teacher-review
```

Expected: ca "duyệt trước khi chốt" PASS (chưa có audit nào cả); ca "sửa sau khi
chốt" FAIL với `expect(entries).toHaveLength(1)` nhận `0`.

- [ ] **Step 3: Import `AdminModule` vào `GradingModule`**

```ts
  imports: [
    TypeOrmModule.forFeature([...]),
    StorageModule,
    ExamSessionModule,
    // Sửa điểm sau khi đã công bố phải để lại dấu vết — Security rule 4.
    AdminModule,
  ],
```

Thêm `import { AdminModule } from '../admin/admin.module';`.

- [ ] **Step 4: Ghi audit trong `review()`**

Trong `TeacherReviewService`, thêm `AuditLogService` vào constructor:

```ts
    private readonly auditLog: AuditLogService,
```

và sửa `review()` — lấy điểm cũ **trước** khi ghi dòng mới:

```ts
    const finalScore = await this.validateAndTotal(result, dto);

    // Phải đọc TRƯỚC khi ghi dòng mới, nếu không `currentFinalScore` sẽ trả
    // về chính điểm vừa ghi và oldValue === newValue.
    const published = FINALISED.includes(result.status);
    const previousScore = published ? await this.currentFinalScore(result) : null;

    await this.reviews.save(...);
    await this.advance(...);

    if (published) {
      // Security rule 4. Chỉ ghi khi điểm đã CÔNG BỐ — sửa trong lúc còn đang
      // duyệt là việc bình thường, ghi hết thì cuốn sổ thành rác.
      await this.auditLog.recordUserAction({
        actorId: teacherId,
        action: 'grading_result.score_edited_after_finalize',
        targetType: 'grading_result',
        targetId: result.id,
        oldValue: { finalScore: previousScore },
        newValue: { finalScore },
      });
    }

    return { finalScore };
```

Thêm hằng số cạnh `REVIEWABLE`:

```ts
/** Điểm đã công bố. Từ đây, mọi lần sửa để lại dấu vết. */
const FINALISED: GradingResultStatus[] = ['finalized', 'exported'];
```

- [ ] **Step 5: Chạy lại — phải xanh**

```bash
pnpm --filter api test:e2e -- teacher-review
pnpm --filter api test:e2e
```

Expected: cả hai PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/grading
git commit -m "feat(grading): record every score edit made after grades are published"
```

---

## Task 4: Đọc lại — điểm cuối cùng trên `GET grading-results` + index

**Files:**
- Create: `apps/api/src/database/migrations/<ts>-AddTeacherReviewResultIndex.ts`
- Modify: `apps/api/src/grading/entities/teacher-review.entity.ts`
- Modify: `apps/api/src/grading/grading.service.ts`
- Test: `apps/api/test/teacher-review.e2e-spec.ts`

**Interfaces:**
- Produces: `GradingResultView` thêm `finalScore: number | null`,
  `reviewedAt: string | null`, `reviewedByName: string | null`,
  `editedCriteria: unknown[] | null`

- [ ] **Step 1: Viết test thất bại**

```ts
  it('GET grading-results trả điểm cuối cùng từ dòng review mới nhất', async () => {
    const { sessionId, resultId } = await sessionWithOneGradedSubmission();
    expect((await submitReview(tokenA, resultId, fullMarks())).status).toBe(201);
    await submitReview(tokenA, resultId, {
      criteria: criterionIds.map((criterionId) => ({
        criterionId,
        verdict: 'partially_met' as const,
        points: 2.5,
      })),
    });

    const response = await request(app.getHttpServer())
      .get(`/exam-sessions/${sessionId}/grading-results`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(response.status).toBe(200);
    const view = response.body[0];
    // Dòng MỚI NHẤT, không phải dòng đầu tiên.
    expect(view.finalScore).toBe(5);
    expect(view.reviewedByName).toBeTruthy();
    expect(view.reviewedAt).toBeTruthy();
    expect(view.editedCriteria).toHaveLength(2);
  });

  it('GET grading-results trả null cho bài chưa ai duyệt', async () => {
    const { sessionId } = await sessionWithOneGradedSubmission();

    const response = await request(app.getHttpServer())
      .get(`/exam-sessions/${sessionId}/grading-results`)
      .set('Authorization', `Bearer ${tokenA}`);

    const view = response.body[0];
    // null nghĩa là "AI đã chấm, chưa ai duyệt" — KHÔNG phải "điểm bằng 0".
    expect(view.finalScore).toBeNull();
    expect(view.reviewedByName).toBeNull();
  });
```

- [ ] **Step 2: Chạy để xác nhận fail**

Expected: `view.finalScore` là `undefined`, không phải `5`.

- [ ] **Step 3: Viết migration**

Lấy timestamp: `node -e "console.log(Date.now())"`.

```ts
import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Postgres KHÔNG tự tạo index cho phía tham chiếu của một FK.
 *
 * Không có index này, mọi lần tra "review mới nhất của kết quả này" là seq
 * scan trên `teacher_review` — và đó là truy vấn chạy trên MỖI lần đọc trang
 * Chấm điểm, với một bảng chỉ có thêm chứ không bao giờ bớt.
 *
 * Thứ tự cột khớp đúng `DISTINCT ON (grading_result_id) ... ORDER BY
 * grading_result_id, reviewed_at DESC` ở GradingService.listForSession.
 */
export class AddTeacherReviewResultIndex<TS> implements MigrationInterface {
    name = 'AddTeacherReviewResultIndex<TS>'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE INDEX "idx_teacher_review_result_time" ON "examcollect"."teacher_review" ("grading_result_id", "reviewed_at" DESC)`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "examcollect"."idx_teacher_review_result_time"`);
    }
}
```

Thay `<TS>` bằng timestamp thật ở cả tên file, tên class và thuộc tính `name`.

Thêm decorator tương ứng lên entity để `migration:generate` sau này không thấy
lệch:

```ts
@Index('idx_teacher_review_result_time', ['gradingResultId', 'reviewedAt'])
```

> ⚠️ Decorator của TypeORM **không diễn tả được `DESC`**. Đó là lý do migration
> viết tay chứ không generate. Nếu một `migration:generate` sau này sinh ra
> lệnh drop/tạo lại index này, **trim nó bằng tay** — cùng loại bẫy mà
> `AuditLogEntity` đã phải ghi chú dài về PK phức hợp.

Chạy: `pnpm --filter api migration:run`

- [ ] **Step 4: Mở rộng `listForSession`**

Trong `apps/api/src/grading/grading.service.ts`, sau khi lấy `rows`:

```ts
    // Review mới nhất của từng kết quả, MỘT truy vấn cho cả danh sách.
    //
    // DISTINCT ON là idiom của Postgres cho "bản ghi mới nhất theo nhóm", và
    // nó dùng đúng idx_teacher_review_result_time. Cách khác là LEFT JOIN
    // LATERAL trong query builder — cùng kết quả, nhưng phải viết SQL thô
    // giữa chuỗi query builder và khó đọc hơn hẳn.
    const ids = rows.entities.map((entity) => entity.id);
    const latest = ids.length === 0 ? [] : await this.results.manager.query(
      `SELECT DISTINCT ON (tr.grading_result_id)
              tr.grading_result_id AS "resultId",
              tr.final_score       AS "finalScore",
              tr.reviewed_at       AS "reviewedAt",
              tr.edited_criteria   AS "editedCriteria",
              a.name               AS "reviewedByName"
       FROM examcollect.teacher_review tr
       JOIN examcollect.account a ON a.id = tr.teacher_id
       WHERE tr.grading_result_id = ANY($1)
       ORDER BY tr.grading_result_id, tr.reviewed_at DESC`,
      [ids],
    );
    const reviewByResult = new Map<string, (typeof latest)[number]>(
      latest.map((row: { resultId: string }) => [row.resultId, row]),
    );
```

và trong `.map(...)`:

```ts
      const review = reviewByResult.get(entity.id);
      return {
        ...
        // null nghĩa là "chưa ai duyệt", KHÔNG phải "điểm bằng 0".
        finalScore: review ? Number(review.finalScore) : null,
        reviewedAt: review ? new Date(review.reviewedAt).toISOString() : null,
        reviewedByName: review ? review.reviewedByName : null,
        editedCriteria: review ? review.editedCriteria : null,
      };
```

Cập nhật `GradingResultView`:

```ts
  /** numeric(6,2) → driver trả string; Number(...) trước khi ra API. */
  finalScore: number | null;
  reviewedAt: string | null;
  /** TÊN giảng viên. Không trả id: trang này không dùng id, và dấu vết
   *  ai-làm-gì thuộc về audit_log chứ không phải payload hiển thị. */
  reviewedByName: string | null;
  editedCriteria: unknown[] | null;
```

- [ ] **Step 5: Chạy lại + toàn bộ**

```bash
pnpm --filter api test:e2e -- teacher-review
pnpm --filter api test:e2e && pnpm --filter api test && pnpm --filter api build
```

Expected: tất cả PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src
git commit -m "feat(grading): read the current score back from the latest review"
```

---

## Task 5: Sinh lại OpenAPI + client + hooks

**Files:**
- Modify: `packages/shared/src/api/schema.d.ts` (sinh, không sửa tay)
- Modify: `apps/web/src/lib/api/grading.ts`
- Modify: `apps/web/src/hooks/useGrading.ts`

**Interfaces:**
- Produces: `submitReview(gradingResultId, criteria)`,
  `finalizeGrades(examSessionId)`, `useSubmitReview(examSessionId)`,
  `useFinalizeGrades(examSessionId)`; `GradingResult` thêm 4 field

- [ ] **Step 1: Sinh lại schema**

```bash
pnpm --filter api dev   # cửa sổ riêng, chờ "Nest application successfully started"
API_URL=http://localhost:4000/api-docs-json pnpm --filter @cine/shared generate:api-client
grep -n "grading-results/{id}/review\|finalize-grades" packages/shared/src/api/schema.d.ts
```

Expected: cả hai route xuất hiện.

- [ ] **Step 2: Thêm vào client**

Trong `apps/web/src/lib/api/grading.ts`, mở rộng interface:

```ts
export interface ReviewCriterion {
  criterionId: string;
  verdict: 'met' | 'partially_met' | 'not_met';
  points: number;
}
```

và thêm vào `GradingResult`:

```ts
  /** null = chưa ai duyệt, KHÔNG phải điểm 0. */
  finalScore: number | null;
  reviewedAt: string | null;
  reviewedByName: string | null;
  editedCriteria: ReviewCriterion[] | null;
```

```ts
/** Một lần duyệt. Server tính tổng — client không gửi finalScore. */
export async function submitReview(
  gradingResultId: string,
  criteria: ReviewCriterion[],
): Promise<{ finalScore: number }> {
  const { data, error, response } = await apiClient.POST(
    '/grading-results/{id}/review',
    { params: { path: { id: gradingResultId } }, body: { criteria } },
  );
  if (error || !response.ok) throw fail(error, response);
  return data as unknown as { finalScore: number };
}

/** Chốt điểm cả phiên. 409 khi còn bài chưa duyệt; idempotent nếu đã chốt. */
export async function finalizeGrades(
  examSessionId: string,
): Promise<{ reviewedByHand: number; acceptedAsProposed: number }> {
  const { data, error, response } = await apiClient.POST(
    '/exam-sessions/{id}/finalize-grades',
    { params: { path: { id: examSessionId } } },
  );
  if (error || !response.ok) throw fail(error, response);
  return data as unknown as { reviewedByHand: number; acceptedAsProposed: number };
}
```

- [ ] **Step 3: Thêm hooks**

Trong `apps/web/src/hooks/useGrading.ts`:

```ts
/** Invalidate danh sách kết quả: điểm và trạng thái vừa đổi nằm trong đó. */
export function useSubmitReview(examSessionId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      gradingResultId,
      criteria,
    }: {
      gradingResultId: string;
      criteria: ReviewCriterion[];
    }) => submitReview(gradingResultId, criteria),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['exam-sessions', examSessionId, 'grading-results'],
      });
    },
  });
}

export function useFinalizeGrades(examSessionId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => finalizeGrades(examSessionId!),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['exam-sessions', examSessionId, 'grading-results'],
      });
    },
  });
}
```

- [ ] **Step 4: Typecheck**

```bash
pnpm --filter web exec tsc --noEmit
```

Expected: không lỗi mới. (Hai lỗi có sẵn ở `src/lib/read-workbook.test.ts` về
`Buffer.File` vs DOM `File` là nợ cũ.)

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/api/schema.d.ts apps/web/src/lib/api/grading.ts apps/web/src/hooks/useGrading.ts
git commit -m "feat(web): api client and hooks for reviewing and finalising grades"
```

---

## Task 6: Ánh xạ nhóm rail — hàm thuần, test riêng

**Files:**
- Create: `apps/web/src/lib/grading-groups.ts`
- Create: `apps/web/src/lib/grading-groups.test.ts`

**Interfaces:**
- Produces: `type ReviewGroup = 'needsReview' | 'reviewed' | 'autoApproved' |
  'finalised' | 'grading'`; `groupOf(status: string): ReviewGroup`;
  `GROUP_LABELS: Record<ReviewGroup, string>`; `GROUP_ORDER: ReviewGroup[]`

- [ ] **Step 1: Viết test thất bại**

`apps/web/src/lib/grading-groups.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { GROUP_ORDER, groupOf, type ReviewGroup } from './grading-groups';

describe('groupOf', () => {
  // Bảng ánh xạ ở spec §8. Không status nào được rơi ra ngoài — một status
  // không có nhóm nghĩa là một bài biến mất khỏi rail, và bài đó chứa bài thi
  // thật của sinh viên.
  const cases: [string, ReviewGroup][] = [
    ['flagged_for_review', 'needsReview'],
    ['auto_approved', 'autoApproved'],
    ['teacher_reviewed', 'reviewed'],
    ['finalized', 'finalised'],
    ['exported', 'finalised'],
    ['ai_grading', 'grading'],
    ['ai_graded', 'grading'],
  ];

  it.each(cases)('xếp %s vào %s', (status, expected) => {
    expect(groupOf(status)).toBe(expected);
  });

  it('mọi nhóm đều có mặt trong GROUP_ORDER', () => {
    const groups = new Set(cases.map(([, group]) => group));
    for (const group of groups) {
      expect(GROUP_ORDER).toContain(group);
    }
  });

  it('status lạ rơi vào nhóm grading thay vì biến mất', () => {
    // An toàn theo hướng "vẫn hiện ra": một enum mới thêm sau này không được
    // làm bài nào rơi khỏi rail trong im lặng.
    expect(groupOf('something_new')).toBe('grading');
  });
});
```

- [ ] **Step 2: Chạy để xác nhận fail**

```bash
pnpm --filter web test -- grading-groups
```

Expected: FAIL — không resolve được `./grading-groups`.

- [ ] **Step 3: Viết module**

`apps/web/src/lib/grading-groups.ts`:

```ts
/**
 * Nhóm hiển thị của một kết quả chấm trên rail trái — spec §8.
 *
 * Hàm thuần, tách khỏi component để test được đủ bảy trạng thái mà không phải
 * render gì. Ánh xạ phải TOÀN PHẦN: một status không có nhóm nghĩa là một bài
 * biến mất khỏi rail, và trong đó là bài thi thật của sinh viên.
 */
export type ReviewGroup =
  | 'needsReview'
  | 'reviewed'
  | 'autoApproved'
  | 'finalised'
  | 'grading';

export const GROUP_ORDER: ReviewGroup[] = [
  'needsReview',
  'autoApproved',
  'reviewed',
  'finalised',
  'grading',
];

export const GROUP_LABELS: Record<ReviewGroup, string> = {
  needsReview: 'Cần xem',
  autoApproved: 'Tự duyệt',
  reviewed: 'Đã duyệt',
  finalised: 'Đã chốt',
  grading: 'Đang chấm',
};

export function groupOf(status: string): ReviewGroup {
  switch (status) {
    case 'flagged_for_review':
      return 'needsReview';
    case 'auto_approved':
      return 'autoApproved';
    case 'teacher_reviewed':
      return 'reviewed';
    case 'finalized':
    case 'exported':
      return 'finalised';
    default:
      // ai_grading, ai_graded, và bất cứ giá trị nào thêm sau này. Rơi vào
      // nhóm chỉ-đọc chứ không biến mất.
      return 'grading';
  }
}
```

- [ ] **Step 4: Chạy lại — phải xanh**

```bash
pnpm --filter web test -- grading-groups
```

Expected: PASS 9/9.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/grading-groups.ts apps/web/src/lib/grading-groups.test.ts
git commit -m "feat(web): a total mapping from grading status to review group"
```

---

## Task 7: Workspace hai cột + nút chốt

**Files:**
- Create: `apps/web/src/app/teacher/grading/_components/ReviewDetail.tsx`
- Create: `apps/web/src/app/teacher/grading/_components/ReviewWorkspace.tsx`
- Create: `apps/web/src/app/teacher/grading/_components/FinalizeGradesButton.tsx`
- Create: `apps/web/src/app/teacher/grading/_components/ReviewWorkspace.test.tsx`
- Modify: `apps/web/src/app/teacher/grading/page.tsx`

**Interfaces:**
- Consumes: `groupOf`, `GROUP_ORDER`, `GROUP_LABELS` (Task 6);
  `useSubmitReview`, `useFinalizeGrades` (Task 5); `GradingResult` với 4 field
  mới

- [ ] **Step 1: Viết test thất bại**

`apps/web/src/app/teacher/grading/_components/ReviewWorkspace.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { ReviewWorkspace } from './ReviewWorkspace';
import type { GradingResult } from '@/lib/api/grading';

const useSubmitReviewMock = vi.fn();
vi.mock('@/hooks/useGrading', () => ({
  useSubmitReview: (...args: unknown[]) => useSubmitReviewMock(...args),
}));

const useRubricsMock = vi.fn();

function result(over: Partial<GradingResult> = {}): GradingResult {
  return {
    id: 'r1',
    submissionId: 's1',
    studentMssv: '20120001',
    studentName: 'Nguyễn Văn A',
    status: 'flagged_for_review',
    modelUsed: 'keyword-match@1',
    aiTotalScore: 4,
    confidence: 0.2,
    flagForReview: true,
    criterionResults: [
      { criterionId: 'c1', verdict: 'partially_met', points: 2, evidence: 'chưa nêu độ phức tạp' },
    ],
    finalScore: null,
    reviewedAt: null,
    reviewedByName: null,
    editedCriteria: null,
    ...over,
  };
}

describe('ReviewWorkspace', () => {
  beforeEach(() => {
    useSubmitReviewMock.mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      isError: false,
      error: null,
    });
    useRubricsMock.mockReturnValue({ data: [], isLoading: false });
  });

  it('nhóm rail theo status, đếm đúng từng nhóm', () => {
    render(
      <ReviewWorkspace
        examSessionId="e1"
        results={[
          result({ id: 'r1', status: 'flagged_for_review' }),
          result({ id: 'r2', status: 'auto_approved', studentName: 'Trần B' }),
          result({ id: 'r3', status: 'auto_approved', studentName: 'Lê C' }),
        ]}
      />,
    );

    expect(screen.getByText(/Cần xem \(1\)/)).toBeInTheDocument();
    expect(screen.getByText(/Tự duyệt \(2\)/)).toBeInTheDocument();
  });

  it('hiện điểm cuối cùng khi đã có review, điểm AI khi chưa', () => {
    render(
      <ReviewWorkspace
        examSessionId="e1"
        results={[
          result({ id: 'r1', status: 'teacher_reviewed', finalScore: 7.5, aiTotalScore: 4 }),
        ]}
      />,
    );

    // Điểm cuối cùng thắng điểm AI — đó là cả điểm của việc duyệt.
    expect(screen.getByText('7.5')).toBeInTheDocument();
    expect(screen.queryByText('4')).not.toBeInTheDocument();
  });

  it('bài đang chấm thì khung phải chỉ đọc, không có nút Lưu', () => {
    render(
      <ReviewWorkspace
        examSessionId="e1"
        results={[result({ id: 'r1', status: 'ai_grading' })]}
      />,
    );

    expect(screen.queryByRole('button', { name: /Lưu duyệt/i })).not.toBeInTheDocument();
  });

  it('sau khi chốt, nút Lưu cảnh báo sẽ ghi nhật ký', () => {
    render(
      <ReviewWorkspace
        examSessionId="e1"
        results={[result({ id: 'r1', status: 'finalized', finalScore: 7.5 })]}
      />,
    );

    expect(screen.getByText(/ghi vào nhật ký/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Chạy để xác nhận fail**

```bash
pnpm --filter web test -- ReviewWorkspace
```

Expected: FAIL — không resolve được `./ReviewWorkspace`.

- [ ] **Step 3: `ReviewDetail`**

`apps/web/src/app/teacher/grading/_components/ReviewDetail.tsx`:

```tsx
'use client';

import { useMemo, useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useSubmitReview } from '@/hooks/useGrading';
import type { GradingResult, ReviewCriterion } from '@/lib/api/grading';

const VERDICTS: { value: ReviewCriterion['verdict']; label: string }[] = [
  { value: 'met', label: 'Đạt' },
  { value: 'partially_met', label: 'Đạt một phần' },
  { value: 'not_met', label: 'Chưa đạt' },
];

/** Trạng thái mà bài đã CÔNG BỐ điểm — sửa từ đây trở đi để lại dấu vết. */
const PUBLISHED = ['finalized', 'exported'];
/** Trạng thái chưa duyệt được: AI còn đang làm việc. */
const IN_PROGRESS = ['ai_grading', 'ai_graded'];

export function ReviewDetail({
  examSessionId,
  result,
}: {
  examSessionId: string;
  result: GradingResult;
}) {
  const submit = useSubmitReview(examSessionId);

  // Điểm khởi đầu: bản giảng viên đã sửa nếu có, nếu chưa thì bản AI đề xuất.
  const initial = useMemo<ReviewCriterion[]>(
    () =>
      (result.editedCriteria ??
        (result.criterionResults as unknown as ReviewCriterion[])) ?? [],
    [result.editedCriteria, result.criterionResults],
  );
  const [draft, setDraft] = useState<ReviewCriterion[] | null>(null);
  const rows = draft ?? initial;

  // Tổng LUÔN tính từ các ô, không cho nhập tay — khớp với việc server cũng
  // tính bằng tổng và bỏ qua mọi tổng client gửi lên.
  const total = Math.round(rows.reduce((sum, row) => sum + row.points, 0) * 100) / 100;

  const readOnly = IN_PROGRESS.includes(result.status);
  const published = PUBLISHED.includes(result.status);

  function update(index: number, patch: Partial<ReviewCriterion>) {
    setDraft(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-h3">{result.studentName}</p>
        <p className="font-mono text-caption text-muted-foreground">{result.studentMssv}</p>
      </div>

      {readOnly && (
        <Alert variant="info">
          <AlertDescription>
            AI đang chấm bài này — chưa duyệt được. Tải lại sau ít phút.
          </AlertDescription>
        </Alert>
      )}

      {rows.map((row, index) => {
        const evidence = (result.criterionResults as { criterionId: string; evidence: string }[])
          .find((c) => c.criterionId === row.criterionId)?.evidence;
        return (
          <div key={row.criterionId} className="flex flex-col gap-2 rounded-md border border-border p-3">
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex flex-1 flex-col gap-1.5">
                <Label htmlFor={`verdict-${row.criterionId}`}>Đánh giá</Label>
                <Select
                  value={row.verdict}
                  disabled={readOnly}
                  onValueChange={(value) =>
                    update(index, { verdict: value as ReviewCriterion['verdict'] })
                  }
                >
                  <SelectTrigger id={`verdict-${row.criterionId}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {VERDICTS.map((verdict) => (
                      <SelectItem key={verdict.value} value={verdict.value}>
                        {verdict.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex w-28 flex-col gap-1.5">
                <Label htmlFor={`points-${row.criterionId}`}>Điểm</Label>
                <Input
                  id={`points-${row.criterionId}`}
                  type="number"
                  min={0}
                  step={0.25}
                  disabled={readOnly}
                  value={row.points}
                  onChange={(event) =>
                    update(index, { points: Number(event.target.value) || 0 })
                  }
                />
              </div>
            </div>
            {evidence && (
              <p className="text-caption text-muted-foreground">{evidence}</p>
            )}
          </div>
        );
      })}

      {published && (
        <Alert variant="warning">
          <AlertDescription>
            Điểm đã chốt — thay đổi này sẽ được ghi vào nhật ký.
          </AlertDescription>
        </Alert>
      )}

      {submit.isError && (
        <Alert variant="destructive">
          <AlertDescription>{submit.error.message}</AlertDescription>
        </Alert>
      )}

      {!readOnly && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-small">
            Tổng: <span className="font-semibold tabular-nums">{total}</span>
          </p>
          <Button
            type="button"
            loading={submit.isPending}
            onClick={() =>
              submit.mutate(
                { gradingResultId: result.id, criteria: rows },
                { onSuccess: () => setDraft(null) },
              )
            }
          >
            {published ? 'Lưu và ghi nhật ký' : 'Lưu duyệt'}
          </Button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: `ReviewWorkspace`**

`apps/web/src/app/teacher/grading/_components/ReviewWorkspace.tsx`:

```tsx
'use client';

import { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { GROUP_LABELS, GROUP_ORDER, groupOf, type ReviewGroup } from '@/lib/grading-groups';
import type { GradingResult } from '@/lib/api/grading';
import { ReviewDetail } from './ReviewDetail';

/**
 * Hai cột: rail trái là tiến độ cả phiên, khung phải là bài đang duyệt.
 *
 * Không phải bảng phẳng: duyệt bài là việc THEO TỪNG BÀI, cần chỗ cho đoạn
 * bằng chứng và ô sửa từng tiêu chí — với 40 bài, bảng thành 40 lần đóng/mở.
 * Không phải chế độ toàn màn hình một bài: nó giấu mất "còn bao nhiêu bài Cần
 * xem", mà đó chính là điều kiện bật nút Chốt.
 */
export function ReviewWorkspace({
  examSessionId,
  results,
}: {
  examSessionId: string;
  results: GradingResult[];
}) {
  const grouped = useMemo(() => {
    const map = new Map<ReviewGroup, GradingResult[]>();
    for (const result of results) {
      const group = groupOf(result.status);
      map.set(group, [...(map.get(group) ?? []), result]);
    }
    return map;
  }, [results]);

  const [selectedId, setSelectedId] = useState<string | null>(results[0]?.id ?? null);
  const selected = results.find((result) => result.id === selectedId) ?? results[0];

  return (
    <Card className="overflow-hidden">
      <CardContent className="grid gap-0 p-0 md:grid-cols-[minmax(14rem,18rem)_1fr]">
        <nav className="flex flex-col gap-4 border-b border-border p-4 md:border-b-0 md:border-r">
          {GROUP_ORDER.filter((group) => (grouped.get(group)?.length ?? 0) > 0).map(
            (group) => (
              <div key={group} className="flex flex-col gap-1">
                <p className="text-caption font-semibold text-muted-foreground">
                  {GROUP_LABELS[group]} ({grouped.get(group)!.length})
                </p>
                {grouped.get(group)!.map((result) => (
                  <button
                    key={result.id}
                    type="button"
                    onClick={() => setSelectedId(result.id)}
                    data-active={result.id === selected?.id}
                    className="flex items-center justify-between rounded-sm px-2 py-1 text-left text-small hover:bg-surface-2 data-[active=true]:bg-surface-2"
                  >
                    <span className="truncate">{result.studentName}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {/* Điểm cuối cùng thắng điểm AI — đó là cả điểm của việc duyệt. */}
                      {result.finalScore ?? result.aiTotalScore ?? '—'}
                    </span>
                  </button>
                ))}
              </div>
            ),
          )}
        </nav>

        <div className="p-6">
          {selected ? (
            <ReviewDetail
              key={selected.id}
              examSessionId={examSessionId}
              result={selected}
            />
          ) : (
            <p className="text-small text-muted-foreground">Chưa có bài nào để duyệt.</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 5: Chạy test workspace — phải xanh**

```bash
pnpm --filter web test -- ReviewWorkspace
```

Expected: PASS 4/4.

- [ ] **Step 6: `FinalizeGradesButton`**

`apps/web/src/app/teacher/grading/_components/FinalizeGradesButton.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { Lock } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useFinalizeGrades } from '@/hooks/useGrading';
import { groupOf } from '@/lib/grading-groups';
import type { GradingResult } from '@/lib/api/grading';

/**
 * Chốt điểm cả phiên — mốc CÔNG BỐ, không phải một thao tác lưu.
 *
 * Hộp xác nhận nói đúng hai con số, vì chấp nhận hàng loạt phải TƯỜNG MINH:
 * bấm nút mà không biết mình vừa nhận 35 bài chưa đọc là câu trả lời tệ khi có
 * khiếu nại.
 */
export function FinalizeGradesButton({
  examSessionId,
  results,
}: {
  examSessionId: string;
  results: GradingResult[];
}) {
  const finalize = useFinalizeGrades(examSessionId);
  const [confirming, setConfirming] = useState(false);

  const needsReview = results.filter((r) => groupOf(r.status) === 'needsReview').length;
  const inProgress = results.filter((r) => groupOf(r.status) === 'grading').length;
  const reviewed = results.filter((r) => groupOf(r.status) === 'reviewed').length;
  const autoApproved = results.filter((r) => groupOf(r.status) === 'autoApproved').length;
  const alreadyFinalised = results.every((r) => groupOf(r.status) === 'finalised');

  if (results.length === 0 || alreadyFinalised) {
    return alreadyFinalised ? (
      <p className="text-small text-muted-foreground">
        Điểm của phiên thi này đã chốt.
      </p>
    ) : null;
  }

  const blocked = needsReview + inProgress > 0;

  return (
    <div className="flex flex-col gap-3">
      {confirming ? (
        <Alert variant="warning">
          <AlertDescription className="flex flex-col gap-3">
            <span>
              Bạn đang chốt <strong>{autoApproved} bài</strong> theo đúng điểm AI đề
              xuất mà chưa mở xem, và <strong>{reviewed} bài</strong> bạn đã duyệt.
            </span>
            <span className="flex gap-2">
              <Button
                type="button"
                size="sm"
                loading={finalize.isPending}
                onClick={() => finalize.mutate(undefined, { onSuccess: () => setConfirming(false) })}
              >
                Chốt điểm
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => setConfirming(false)}>
                Huỷ
              </Button>
            </span>
          </AlertDescription>
        </Alert>
      ) : (
        <Button
          type="button"
          className="self-start"
          disabled={blocked}
          // Tắt kèm LÝ DO, không tắt câm.
          title={
            blocked
              ? `Còn ${needsReview + inProgress} bài chưa duyệt xong — duyệt hết rồi mới chốt được.`
              : undefined
          }
          onClick={() => setConfirming(true)}
        >
          <Lock className="h-4 w-4" aria-hidden="true" />
          Chốt điểm cả phiên
        </Button>
      )}

      {blocked && (
        <p className="text-caption text-muted-foreground">
          Còn {needsReview + inProgress} bài chưa duyệt xong.
        </p>
      )}

      {finalize.isError && (
        <Alert variant="destructive">
          <AlertDescription>{finalize.error.message}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
```

- [ ] **Step 7: Gắn vào trang**

Trong `apps/web/src/app/teacher/grading/page.tsx`, thay khối `ResultsTable` bằng:

```tsx
              {results.isLoading ? (
                <Skeleton className="h-5 w-1/2" />
              ) : (results.data?.length ?? 0) === 0 ? (
                <p className="rounded-md border border-dashed border-border px-4 py-3 text-small text-muted-foreground">
                  Chưa chấm bài nào. Hệ thống không tự chấm sau khi thu bài — bạn bấm nút thì
                  mới chạy.
                </p>
              ) : (
                <div className="flex flex-col gap-4">
                  <ReviewWorkspace examSessionId={sessionId} results={results.data!} />
                  <FinalizeGradesButton examSessionId={sessionId} results={results.data!} />
                </div>
              )}
```

Xoá hàm `ResultsTable` và hằng `VERDICT_LABELS` khỏi `page.tsx` (đã chuyển vào
`ReviewDetail`), cùng mọi import chỉ còn nó dùng: `Badge`, `Table`,
`TableBody`, `TableCell`, `TableHead`, `TableHeader`, `TableRow`, `Fragment`.

Thêm hai import mới cho hai component vừa tạo.

- [ ] **Step 8: Verification toàn bộ**

```bash
pnpm --filter web exec tsc --noEmit
pnpm --filter web test && pnpm --filter web lint && pnpm --filter web build
pnpm --filter api test && pnpm --filter api test:e2e && pnpm --filter api lint && pnpm --filter api build
```

Expected: tất cả PASS, và **không còn warning `unique "key" prop`**.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/app/teacher/grading
git commit -m "feat(web): a two-column workspace for reviewing and finalising grades"
```

---

## Self-Review

**Spec coverage — mọi mục có task thực thi:**

| Spec | Task |
|---|---|
| §3 index migration | Task 4 Step 3 |
| §3.1 điểm cuối suy lúc đọc | Task 4 Step 4 (`DISTINCT ON`) |
| §4.1 ownership finalize | Task 2 Step 4 |
| §4.2 `findResultForOwner` | Task 1 Step 4 |
| §4.3 ranh giới `home_teacher_id` | Ghi trong comment Task 1 Step 4 |
| §5 một phương thức `advance` | Task 1 Step 5 |
| §6.1 review endpoint + 4 phép kiểm | Task 1 Steps 3-7 |
| §6.1.1 **cổng trạng thái** | Task 1 Step 5 (`REVIEWABLE`), test Step 1 |
| §6.2 finalize-grades | Task 2 |
| §6.3 mở rộng `GradingResultView` | Task 4 |
| §7 audit sau chốt | Task 3 |
| §8 workspace hai cột | Task 6 (ánh xạ) + Task 7 (UI) |
| §9.4 `numeric` → string | Task 1 (`String(...)`), Task 4 (`Number(...)`) |
| §10 idempotent double-finalize | Task 2 Step 1 (test), Step 3 (nhánh `continue`) |
| §11.1 ranh giới rule 4 | Task 3 Step 1 |
| §11.2 ba test 403 | Task 1 Step 1, Task 2 Step 1 |
| §11.3 test backend | Tasks 1-4 |
| §11.4 test web | Tasks 6-7 |

**Đã sửa khi tự soát:**

1. Task 3 Step 1 ban đầu có **hai `expect` mâu thuẫn** (`toBe(3)` và `toBe(2)`)
   trong cùng một test. Giữ lại chú thích cảnh báo và chỉ dẫn xoá dòng `toBe(3)`
   — `finalizeGrades` chỉ sinh dòng review cho bài `auto_approved`, mà bài trong
   test đó ở `teacher_reviewed`.
2. `currentFinalScore` phải đọc **trước** khi ghi dòng review mới, nếu không
   `oldValue === newValue`. Đã nêu rõ ở Task 3 Step 4.
3. `GradingResultStatus` có thể chưa được export từ entity — thêm cảnh báo kèm
   lệnh `grep` ở Task 1 Step 5.
4. Decorator `@Index` của TypeORM không diễn tả được `DESC`, nên một
   `migration:generate` sau này sẽ thấy lệch. Thêm cảnh báo ở Task 4 Step 3,
   cùng loại bẫy `AuditLogEntity` đã ghi chú về PK phức hợp.
5. Task 7 Step 7 ban đầu chỉ nói "thay `ResultsTable`". Liệt kê rõ cả những
   import trở thành mồ côi sau khi xoá, nếu không lint sẽ đỏ.

**Ngoài phạm vi (spec §12), không task nào đụng:** GradeExport · calibration ·
chấm lại/chấm lẻ · BullMQ · provider LLM thật · quyền chấm theo `home_teacher_id`.
