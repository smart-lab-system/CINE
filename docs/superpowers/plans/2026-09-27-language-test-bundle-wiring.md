# Khai ngôn ngữ + ghim gói test (3d2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Giảng viên khai được `deliverableType`/`language` lúc tạo phiên, tạo–duyệt–ghim một `grading_test_bundle` cho phiên, và `startGrading` chặn (400) một phiên có bài đường điều tra mà chưa ghim gói test (§14.3). Đây là mảnh hạ tầng CUỐI CÙNG còn thiếu để plan 3d (worker chấm đường điều tra) chạy được trên một phiên thật do giảng viên tự tạo qua API — không chỉ trong test insert thẳng vào DB.

**Architecture:** Cột/bảng DB đã có sẵn từ 3c/3d (`required_deliverable.language`, `exam_session.test_bundle_id`, `grading_test_bundle`, `grading_test_case`) nhưng không có đường API nào ghi vào chúng. Plan này thêm (1) hai trường tuỳ chọn vào `CreateExamSessionDto`, (2) một service mới `TestBundleService` (tạo phiên bản gói bằng ca giảng viên tự viết, duyệt, ghim) đọc/ghi bằng raw SQL qua `DataSource` — đúng khuôn `ScoreService`/`InvestigationContextService`, không đăng ký repository cho hai bảng append-only này, và (3) một điều kiện chặn trong `GradingRunService.startGrading`.

**Tech Stack:** NestJS 10, TypeORM 0.3.31 (raw SQL qua `DataSource`/`EntityManager` cho phần append-only), class-validator, Jest e2e (Postgres + MinIO thật, theo `cine-e2e-test-prerequisites`).

**Spec:** `docs/superpowers/specs/2026-09-20-grading-agent-investigator-design.md` §14.1 (mô hình `grading_test_bundle`/`grading_test_case`), §14.3 (điều kiện bắt đầu chấm), §2.1 luật 1 (gói test đóng băng).

## Global Constraints

- `grading_test_bundle`/`grading_test_case` là APPEND-ONLY ở DB (`guard_test_bundle_approve_once`, `guard_append_only`, `guard_no_delete`) — service PHẢI tự kiểm điều kiện TRƯỚC khi ghi. `PostgresExceptionFilter` không map mã `object_not_in_prerequisite_state`, nên để trigger bắn ra là một 500, không phải một lỗi giảng viên đọc được.
- `ck_required_deliverable_language`: `deliverable_type = 'code_project' OR language IS NULL` — bài `code_project` KHÔNG bắt buộc phải có `language` (thiếu thì đi `one_shot`, xem `pipelineFor`). DTO không được siết chặt hơn DB.
- `fk_exam_session_test_bundle` là khoá ghép `(test_bundle_id, id) → grading_test_bundle(id, exam_session_id)` — ghim gói của phiên khác chết ở DB thành `foreign_key_violation` (409 chung chung qua filter hiện có), nhưng service tự kiểm trước để trả lỗi rõ nghĩa hơn.
- Không route nào nhận `teacherId` từ body — luôn `req.user!.sub` + `this.examSessions.findEntityForOwner(id, req.user!.sub)`, đúng khuôn mọi route khác trong `GradingController`.
- `INVESTIGATOR_LANGUAGES = {'cpp', 'python'}` (đã có ở `pipeline.ts`) là tập ngôn ngữ chạy đường điều tra — dùng lại hàm `pipelineFor` đã có, không viết lại luật này lần hai.
- Test dùng Postgres + MinIO thật (docker compose), không mock DataSource.

## Review Focus

1. Duyệt một gói ĐÃ duyệt rồi → service phải tự trả 409 rõ nghĩa, không để `guard_test_bundle_approve_once` bắn ra 500.
2. Ghim một gói CHƯA duyệt → phải bị chặn 400 ngay ở service — DB không tự chặn việc này, và ghim gói nháp vi phạm thẳng §14.1 ("chỉ việc duyệt mới ghi lên dòng được").
3. Ghim gói thuộc MỘT PHIÊN KHÁC (dù cùng giảng viên sở hữu cả hai) → 404 rõ nghĩa từ service, không phải 409 "conflicts with an existing record" mù mờ từ FK.
4. `startGrading` phải phát hiện đúng khi phiên TRỘN `document` + `code_project`: chỉ cần MỘT bài `collected` map sang `investigator` mà `test_bundle_id` null là đủ để chặn cả lượt, không phải mọi bài đều phải là code mới chặn.
5. Khai `language` trên một deliverable KHÔNG phải `code_project` → 400 ngay ở DTO (400 rõ nghĩa), không lọt xuống DB thành `check_violation` (500-ish qua nhánh generic).

---

### Task 1: DTO — khai `deliverableType`/`language` lúc tạo phiên

**Files:**
- Modify: `apps/api/src/exam-session/dto/create-exam-session.dto.ts`
- Modify: `apps/api/src/exam-session/exam-session.service.ts:213-222`
- Test: `apps/api/src/exam-session/dto/create-exam-session.dto.spec.ts`
- Test: `apps/api/test/exam-session.e2e-spec.ts`

**Interfaces:**
- Consumes: `DeliverableType` (`../entities/required-deliverable.entity`), `DECLARED_LANGUAGES`/`DeclaredLanguage` (`../declared-language`).
- Produces: `RequiredFilenameDto.deliverableType?: DeliverableType`, `RequiredFilenameDto.language?: DeclaredLanguage` — Task 3's `GradingRunService.startGrading` và mọi test dựng phiên `code_project` sau Task 1 dùng hai trường này.

- [ ] **Step 1: Viết test đỏ (unit DTO)**

Thêm vào `create-exam-session.dto.spec.ts` (theo đúng khuôn `validate(plainToInstance(...))` các test khác trong file):

```ts
it('nhận deliverableType=code_project kèm language hợp lệ', async () => {
  const dto = plainToInstance(CreateExamSessionDto, {
    ...validBase(),
    requiredFilenames: [{ filename: 'bai1.zip', deliverableType: 'code_project', language: 'cpp' }],
  });
  const errors = await validate(dto);
  expect(errors).toHaveLength(0);
});

it('từ chối language trên deliverable KHÔNG phải code_project', async () => {
  const dto = plainToInstance(CreateExamSessionDto, {
    ...validBase(),
    requiredFilenames: [{ filename: 'bai1.docx', deliverableType: 'document', language: 'cpp' }],
  });
  const errors = await validate(dto);
  expect(errors.length).toBeGreaterThan(0);
});

it('từ chối language không nằm trong bốn giá trị đã khai', async () => {
  const dto = plainToInstance(CreateExamSessionDto, {
    ...validBase(),
    requiredFilenames: [{ filename: 'bai1.zip', deliverableType: 'code_project', language: 'rust' }],
  });
  const errors = await validate(dto);
  expect(errors.length).toBeGreaterThan(0);
});

it('deliverableType/language đều tuỳ chọn — thiếu cả hai vẫn hợp lệ (tương thích ngược)', async () => {
  const dto = plainToInstance(CreateExamSessionDto, {
    ...validBase(),
    requiredFilenames: ['bai1.docx'],
  });
  const errors = await validate(dto);
  expect(errors).toHaveLength(0);
});
```

(`validBase()` là helper đã có sẵn trong file dựng phần thân hợp lệ còn lại của DTO — dùng lại nguyên văn, không viết lại.)

- [ ] **Step 2: Chạy test, xác nhận đỏ**

Run: `pnpm --filter api test create-exam-session.dto.spec.ts`
Expected: FAIL — `deliverableType`/`language` chưa tồn tại trên `RequiredFilenameDto` nên hai test đầu không đỏ đúng lý do (validate luôn qua vì property lạ bị `whitelist` bỏ qua ở transform, không phải ở validate), còn test "từ chối language..." không có lỗi nào sinh ra.

- [ ] **Step 3: Thêm trường + constraint vào DTO**

Trong `create-exam-session.dto.ts`, thêm import và constraint mới (đặt cạnh `EntriesOnlyOnArchiveConstraint`):

```ts
import { DeliverableType } from '../entities/required-deliverable.entity';
import { DECLARED_LANGUAGES, DeclaredLanguage } from '../declared-language';

/**
 * Mirror của ràng buộc DB `ck_required_deliverable_language`
 * (`deliverable_type = 'code_project' OR language IS NULL`) — không siết
 * chặt hơn: code_project KHÔNG bắt buộc phải có language.
 */
@ValidatorConstraint({ name: 'LanguageOnlyOnCodeProject', async: false })
class LanguageOnlyOnCodeProjectConstraint implements ValidatorConstraintInterface {
  validate(language: string | undefined, args: ValidationArguments): boolean {
    if (language === undefined) return true;
    const { deliverableType } = args.object as RequiredFilenameDto;
    return deliverableType === 'code_project';
  }

  defaultMessage(): string {
    return 'language chỉ khai được khi deliverableType là code_project';
  }
}
```

Thêm hai trường vào `RequiredFilenameDto` (sau `filename`, trước `entries`):

```ts
  /**
   * Loại bài nộp (§14.1). Mặc định `document` khi bỏ trống — giữ tương
   * thích ngược cho mọi phiên KHÔNG chấm code.
   */
  @IsOptional()
  @IsIn(['document', 'code_project', 'image'])
  deliverableType?: DeliverableType;

  /**
   * Ngôn ngữ giảng viên khai cho bài `code_project` (§14.1). Chỉ bốn giá
   * trị `DECLARED_LANGUAGES`; đường điều tra (worker chạy) chỉ nhận
   * `cpp`/`python` trong đó (`INVESTIGATOR_LANGUAGES`, `pipeline.ts`) —
   * `java`/`node` hợp lệ ở tầng khai báo nhưng rơi về `one_shot`.
   */
  @IsOptional()
  @IsIn(DECLARED_LANGUAGES)
  @Validate(LanguageOnlyOnCodeProjectConstraint)
  language?: DeclaredLanguage;
```

- [ ] **Step 4: Chạy lại, xác nhận xanh**

Run: `pnpm --filter api test create-exam-session.dto.spec.ts`
Expected: PASS toàn bộ.

- [ ] **Step 5: Dùng hai trường này khi tạo `RequiredDeliverableEntity`**

Trong `exam-session.service.ts:213-222`, đổi:

```ts
          const savedDeliverables = await manager.save(
            RequiredDeliverableEntity,
            dto.requiredFilenames.map((item) =>
              manager.create(RequiredDeliverableEntity, {
                examSessionId: session.id,
                requiredFilename: item.filename,
                deliverableType: item.deliverableType ?? DEFAULT_DELIVERABLE_TYPE,
                language: item.language ?? null,
              }),
            ),
          );
```

- [ ] **Step 6: Test e2e — tạo phiên với một deliverable `code_project`**

Thêm vào `exam-session.e2e-spec.ts` (dùng đúng `ownerToken`/`classId`/`roomName`/`futureWindow()` đã có trong `beforeAll`):

```ts
it('tạo phiên với deliverable code_project kèm language — 201, cột được lưu đúng (3d2)', async () => {
  const { startTime, endTime } = futureWindow();
  const res = await request(app.getHttpServer())
    .post('/exam-sessions')
    .set('Authorization', `Bearer ${ownerToken}`)
    .send({
      name: 'Bài thực hành CTDL',
      classId,
      roomName,
      semesterName: FIRST_SEMESTER,
      examType: 'GK',
      startTime,
      endTime,
      requiredFilenames: [{ filename: 'bai1.zip', deliverableType: 'code_project', language: 'cpp' }],
    });

  expect(res.status).toBe(201);
  const row = await dataSource.query(
    `SELECT deliverable_type, language FROM examcollect.required_deliverable WHERE exam_session_id = $1`,
    [res.body.id],
  );
  expect(row[0].deliverable_type).toBe('code_project');
  expect(row[0].language).toBe('cpp');
});

it('language trên deliverable document → 400 (3d2)', async () => {
  const { startTime, endTime } = futureWindow();
  const res = await request(app.getHttpServer())
    .post('/exam-sessions')
    .set('Authorization', `Bearer ${ownerToken}`)
    .send({
      name: 'Bài tự luận',
      classId,
      roomName,
      semesterName: FIRST_SEMESTER,
      examType: 'GK',
      startTime,
      endTime,
      requiredFilenames: [{ filename: 'bai1.docx', deliverableType: 'document', language: 'cpp' }],
    });

  expect(res.status).toBe(400);
});
```

- [ ] **Step 7: Chạy e2e, xác nhận xanh**

Run: `pnpm --filter api test:e2e exam-session.e2e-spec.ts`
Expected: PASS toàn bộ (kể cả các test cũ trong file — không được đỏ test nào đang có).

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/exam-session/dto/create-exam-session.dto.ts apps/api/src/exam-session/dto/create-exam-session.dto.spec.ts apps/api/src/exam-session/exam-session.service.ts apps/api/test/exam-session.e2e-spec.ts
git commit -m "feat(exam-session): khai deliverableType/language lúc tạo phiên (§14.1, 3d2)"
```

---

### Task 2: `TestBundleService` — tạo, duyệt, ghim gói test

**Files:**
- Create: `apps/api/src/grading/test-bundle/test-bundle.service.ts`
- Create: `apps/api/src/grading/test-bundle/dto/create-test-bundle.dto.ts`
- Test: `apps/api/test/test-bundle.e2e-spec.ts`

**Interfaces:**
- Consumes: `DataSource` (raw SQL, giống `InvestigationContextService`), `ExamSessionEntity` (không dùng trực tiếp — controller ở Task 3 truyền `examSessionId`/`teacherId` đã qua `findEntityForOwner`).
- Produces:
  - `TestBundleService.create(examSessionId: string, teacherId: string, dto: CreateTestBundleDto): Promise<{ id: string; version: number }>`
  - `TestBundleService.approve(examSessionId: string, bundleId: string, teacherId: string): Promise<{ id: string; approvedAt: string }>`
  - `TestBundleService.pin(examSessionId: string, bundleId: string, teacherId: string): Promise<{ testBundleId: string }>`
  - `TestBundleService.list(examSessionId: string): Promise<Array<{ id: string; version: number; approvedAt: string | null; caseCount: number }>>`
  - `TestBundleService.get(examSessionId: string, bundleId: string): Promise<{ id: string; version: number; approvedAt: string | null; cases: Array<{ caseKey: string; group: string; input: string; expectedOutput: string }> } | null>`
  - Task 3's controller và Task 4's e2e gọi thẳng các hàm này.

- [ ] **Step 1: DTO tạo gói (viết trước, không phải RED test — DTO thuần khai báo)**

`create-test-bundle.dto.ts`:

```ts
import { ArrayMinSize, IsArray, IsOptional, IsString, Length, Matches, MaxLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

/** Khuôn `case_key` khớp CHECK của DB (`^[A-Za-z0-9_-]{1,64}$`). */
export const CASE_KEY_REGEX = /^[A-Za-z0-9_-]{1,64}$/;

export class TestCaseDto {
  @IsString()
  @Matches(CASE_KEY_REGEX, { message: 'caseKey chỉ gồm chữ, số, "_", "-", tối đa 64 ký tự' })
  caseKey!: string;

  @IsString()
  @Length(1, 100)
  group!: string;

  @IsString()
  input!: string;

  @IsString()
  expectedOutput!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  constraintQuote?: string;
}

export class CreateTestBundleDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => TestCaseDto)
  cases!: TestCaseDto[];
}
```

- [ ] **Step 2: Viết test e2e đỏ — tạo, duyệt, ghim (happy path)**

`apps/api/test/test-bundle.e2e-spec.ts` (dùng `createTestAccount` + tạo session trực tiếp qua `dataSource.query` INSERT, theo khuôn các e2e chấm điểm khác — ví dụ `finalize-investigator.e2e-spec.ts` đã dựng sẵn helper tương tự, xem `seedCodeSession` ở `test/helpers/code-session-seed.ts` từ 3d và TÁI DÙNG nó thay vì viết lại):

```ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';
import { createTestAccount } from './helpers/create-account';
import { seedCodeSession } from './helpers/code-session-seed';

describe('Test bundle — tạo, duyệt, ghim (3d2)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new PostgresExceptionFilter());
    await app.init();
    dataSource = app.get(DataSource);
  });

  afterAll(async () => app.close());

  it('tạo gói (nháp) → duyệt → ghim → session.test_bundle_id đúng gói', async () => {
    const { token, examSessionId } = await seedCodeSession(dataSource, app);

    const created = await request(app.getHttpServer())
      .post(`/exam-sessions/${examSessionId}/test-bundles`)
      .set('Authorization', `Bearer ${token}`)
      .send({ cases: [{ caseKey: 'ca1', group: 'public', input: '1 2\n', expectedOutput: '3\n' }] });
    expect(created.status).toBe(201);
    expect(created.body.version).toBe(1);
    const bundleId = created.body.id;

    // Ghim TRƯỚC khi duyệt → 400 (Review Focus #2).
    const pinBeforeApprove = await request(app.getHttpServer())
      .post(`/exam-sessions/${examSessionId}/test-bundles/${bundleId}/pin`)
      .set('Authorization', `Bearer ${token}`);
    expect(pinBeforeApprove.status).toBe(400);

    const approved = await request(app.getHttpServer())
      .post(`/exam-sessions/${examSessionId}/test-bundles/${bundleId}/approve`)
      .set('Authorization', `Bearer ${token}`);
    expect(approved.status).toBe(201);

    // Duyệt lần hai → 409 (Review Focus #1), không phải 500.
    const approveTwice = await request(app.getHttpServer())
      .post(`/exam-sessions/${examSessionId}/test-bundles/${bundleId}/approve`)
      .set('Authorization', `Bearer ${token}`);
    expect(approveTwice.status).toBe(409);

    const pinned = await request(app.getHttpServer())
      .post(`/exam-sessions/${examSessionId}/test-bundles/${bundleId}/pin`)
      .set('Authorization', `Bearer ${token}`);
    expect(pinned.status).toBe(201);

    const [row] = await dataSource.query(
      `SELECT test_bundle_id FROM examcollect.exam_session WHERE id = $1`,
      [examSessionId],
    );
    expect(row.test_bundle_id).toBe(bundleId);
  });

  it('ghim gói thuộc phiên KHÁC → 404 (Review Focus #3)', async () => {
    const a = await seedCodeSession(dataSource, app);
    const b = await seedCodeSession(dataSource, app);

    const created = await request(app.getHttpServer())
      .post(`/exam-sessions/${a.examSessionId}/test-bundles`)
      .set('Authorization', `Bearer ${a.token}`)
      .send({ cases: [{ caseKey: 'ca1', group: 'public', input: '1\n', expectedOutput: '1\n' }] });
    await request(app.getHttpServer())
      .post(`/exam-sessions/${a.examSessionId}/test-bundles/${created.body.id}/approve`)
      .set('Authorization', `Bearer ${a.token}`);

    // b không sở hữu gói của a (dù cùng test dùng chung teacher factory, session khác).
    const res = await request(app.getHttpServer())
      .post(`/exam-sessions/${b.examSessionId}/test-bundles/${created.body.id}/pin`)
      .set('Authorization', `Bearer ${b.token}`);
    expect(res.status).toBe(404);
  });
});
```

(Nếu `seedCodeSession` trả về mỗi lần một teacher/token khác nhau, ca thứ hai vẫn đúng ý: "gói không thuộc phiên `b`" — sửa lại lời gọi cho khớp chữ ký thật của helper khi đọc `code-session-seed.ts` ở bước implement, chữ ký chính xác không phải trọng tâm RED test này.)

- [ ] **Step 3: Chạy test, xác nhận đỏ**

Run: `pnpm --filter api test:e2e test-bundle.e2e-spec.ts`
Expected: FAIL — route `/exam-sessions/:id/test-bundles*` chưa tồn tại (404 từ Nest, không phải từ logic).

- [ ] **Step 4: Viết `TestBundleService`**

```ts
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CreateTestBundleDto } from './dto/create-test-bundle.dto';

/**
 * Gói test có phiên bản của MỘT phiên (§14.1). Raw SQL qua `DataSource`,
 * không repository — hai bảng `grading_test_bundle`/`grading_test_case` là
 * append-only ở DB, và service này là nơi DUY NHẤT kiểm điều kiện TRƯỚC khi
 * ghi (trigger của DB chỉ là lưới an toàn cuối, bắn ra 500 nếu chạm tới).
 */
@Injectable()
export class TestBundleService {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  async create(examSessionId: string, teacherId: string, dto: CreateTestBundleDto) {
    return this.ds.transaction(async (manager) => {
      const [{ next_version }] = await manager.query(
        `SELECT COALESCE(MAX(version), 0) + 1 AS next_version
           FROM examcollect.grading_test_bundle WHERE exam_session_id = $1`,
        [examSessionId],
      );
      const [bundle] = await manager.query(
        `INSERT INTO examcollect.grading_test_bundle (exam_session_id, version, origin, created_by)
         VALUES ($1, $2, 'teacher', $3) RETURNING id, version`,
        [examSessionId, next_version, teacherId],
      );
      for (const c of dto.cases) {
        await manager.query(
          `INSERT INTO examcollect.grading_test_case (bundle_id, case_key, "group", input, expected_output, constraint_quote)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [bundle.id, c.caseKey, c.group, c.input, c.expectedOutput, c.constraintQuote ?? null],
        );
      }
      return { id: bundle.id as string, version: bundle.version as number };
    });
  }

  async approve(examSessionId: string, bundleId: string, teacherId: string) {
    const bundle = await this.findOwnedBundle(examSessionId, bundleId);
    if (bundle.approved_at) {
      throw new ConflictException(`Gói test ${bundleId} đã được duyệt lúc ${bundle.approved_at} — không duyệt lại được.`);
    }
    const [row] = await this.ds.query(
      `UPDATE examcollect.grading_test_bundle SET approved_by = $1, approved_at = now()
        WHERE id = $2 RETURNING id, approved_at`,
      [teacherId, bundleId],
    );
    return { id: row.id as string, approvedAt: row.approved_at as string };
  }

  async pin(examSessionId: string, bundleId: string, teacherId: string) {
    const bundle = await this.findOwnedBundle(examSessionId, bundleId);
    if (!bundle.approved_at) {
      throw new BadRequestException(`Gói test ${bundleId} chưa được duyệt — chỉ gói đã duyệt mới ghim được (§14.1).`);
    }
    await this.ds.query(`UPDATE examcollect.exam_session SET test_bundle_id = $1 WHERE id = $2`, [bundleId, examSessionId]);
    return { testBundleId: bundleId };
  }

  async list(examSessionId: string) {
    return this.ds.query(
      `SELECT b.id, b.version, b.approved_at, COUNT(c.id)::int AS case_count
         FROM examcollect.grading_test_bundle b
         LEFT JOIN examcollect.grading_test_case c ON c.bundle_id = b.id AND c.auto_dropped_reason IS NULL
        WHERE b.exam_session_id = $1
        GROUP BY b.id ORDER BY b.version DESC`,
      [examSessionId],
    );
  }

  async get(examSessionId: string, bundleId: string) {
    const bundle = await this.findOwnedBundle(examSessionId, bundleId);
    const cases = await this.ds.query(
      `SELECT case_key, "group", input, expected_output, auto_dropped_reason
         FROM examcollect.grading_test_case WHERE bundle_id = $1 ORDER BY case_key`,
      [bundleId],
    );
    return { id: bundle.id, version: bundle.version, approvedAt: bundle.approved_at, cases };
  }

  /** Gói phải thuộc ĐÚNG phiên được truyền vào — Review Focus #3. */
  private async findOwnedBundle(examSessionId: string, bundleId: string) {
    const [bundle] = await this.ds.query(
      `SELECT id, version, approved_at FROM examcollect.grading_test_bundle
        WHERE id = $1 AND exam_session_id = $2`,
      [bundleId, examSessionId],
    );
    if (!bundle) {
      throw new NotFoundException(`Gói test ${bundleId} không thuộc phiên ${examSessionId}`);
    }
    return bundle;
  }
}
```

- [ ] **Step 5: Controller + đăng ký module**

`apps/api/src/grading/test-bundle/test-bundle.controller.ts`:

```ts
import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { ExamSessionService } from '../../exam-session/exam-session.service';
import { CreateTestBundleDto } from './dto/create-test-bundle.dto';
import { TestBundleService } from './test-bundle.service';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class TestBundleController {
  constructor(
    private readonly bundles: TestBundleService,
    private readonly examSessions: ExamSessionService,
  ) {}

  @Post('exam-sessions/:id/test-bundles')
  @Roles('teacher')
  async create(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateTestBundleDto, @Req() req: Request) {
    const session = await this.examSessions.findEntityForOwner(id, req.user!.sub);
    return this.bundles.create(session.id, req.user!.sub, dto);
  }

  @Get('exam-sessions/:id/test-bundles')
  @Roles('teacher')
  async list(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    const session = await this.examSessions.findEntityForOwner(id, req.user!.sub);
    return this.bundles.list(session.id);
  }

  @Get('exam-sessions/:id/test-bundles/:bundleId')
  @Roles('teacher')
  async get(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('bundleId', ParseUUIDPipe) bundleId: string,
    @Req() req: Request,
  ) {
    const session = await this.examSessions.findEntityForOwner(id, req.user!.sub);
    return this.bundles.get(session.id, bundleId);
  }

  @Post('exam-sessions/:id/test-bundles/:bundleId/approve')
  @Roles('teacher')
  @HttpCode(201)
  async approve(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('bundleId', ParseUUIDPipe) bundleId: string,
    @Req() req: Request,
  ) {
    const session = await this.examSessions.findEntityForOwner(id, req.user!.sub);
    return this.bundles.approve(session.id, bundleId, req.user!.sub);
  }

  @Post('exam-sessions/:id/test-bundles/:bundleId/pin')
  @Roles('teacher')
  @HttpCode(201)
  async pin(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('bundleId', ParseUUIDPipe) bundleId: string,
    @Req() req: Request,
  ) {
    const session = await this.examSessions.findEntityForOwner(id, req.user!.sub);
    return this.bundles.pin(session.id, bundleId, req.user!.sub);
  }
}
```

Đăng ký `TestBundleService` + `TestBundleController` vào `providers`/`controllers` của `apps/api/src/grading/grading.module.ts` (cạnh `RulesController`/`ErrorRuleService`).

- [ ] **Step 6: Chạy e2e, xác nhận xanh**

Run: `pnpm --filter api test:e2e test-bundle.e2e-spec.ts`
Expected: PASS toàn bộ. Nếu `seedCodeSession` không tồn tại với chữ ký giả định ở Step 2, đọc `test/helpers/code-session-seed.ts` thật và sửa lời gọi cho khớp — helper đã seed đủ class/teacher/session/rubric cho 3d, tái dùng nguyên văn.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/grading/test-bundle apps/api/src/grading/grading.module.ts apps/api/test/test-bundle.e2e-spec.ts
git commit -m "feat(grading): tạo—duyệt—ghim gói test của một phiên (§14.1, 3d2)"
```

---

### Task 3: `startGrading` chặn khi thiếu gói test cho bài đường điều tra (§14.3)

**Files:**
- Modify: `apps/api/src/grading/grading-run.service.ts`
- Test: `apps/api/src/grading/grading-run.service.spec.ts` (tạo mới nếu chưa có unit test cho service này — kiểm bằng repository giả, theo khuôn `grading-regrade.spec.ts`)

**Interfaces:**
- Consumes: `pipelineFor` (`./pipeline`), `INVESTIGATOR_LANGUAGES` không cần trực tiếp — `pipelineFor` đã gói luật đó.
- Produces: `startGrading` ném `BadRequestException` SỚM (trước khi tạo `grading_result` nào) khi điều kiện §14.3 không thoả — không đổi chữ ký `StartGradingResult`.

- [ ] **Step 1: Viết test đỏ**

Thêm vào một file spec unit cho `GradingRunService` (tạo `apps/api/src/grading/grading-run.service.spec.ts` nếu chưa có, dựng repository giả bằng `jest.fn()` đúng khuôn `grading-regrade.spec.ts`):

```ts
it('phiên có bài code_project/cpp CHƯA ghim gói test → startGrading từ chối 400 (§14.3, 3d2)', async () => {
  const session = { id: 's1', rubricId: 'r1', testBundleId: null } as ExamSessionEntity;
  // rubrics.findById, criteria.find, submissions.find (1 collected), anchors, deliverables.find
  // trả về một deliverable { deliverableType: 'code_project', language: 'cpp' }.
  await expect(service.startGrading(session, 't1')).rejects.toThrow(BadRequestException);
});

it('phiên có bài code_project/cpp ĐÃ ghim gói test → startGrading chạy bình thường', async () => {
  const session = { id: 's1', rubricId: 'r1', testBundleId: 'b1' } as ExamSessionEntity;
  await expect(service.startGrading(session, 't1')).resolves.toBeDefined();
});

it('phiên chỉ có bài document, không ghim gói test → startGrading vẫn chạy (không đụng §14.3)', async () => {
  const session = { id: 's1', rubricId: 'r1', testBundleId: null } as ExamSessionEntity;
  await expect(service.startGrading(session, 't1')).resolves.toBeDefined();
});
```

- [ ] **Step 2: Chạy test, xác nhận đỏ**

Run: `pnpm --filter api test grading-run.service.spec.ts`
Expected: FAIL ở ca đầu — `startGrading` hiện không ném gì, chỉ xếp hàng bình thường.

- [ ] **Step 3: Thêm điều kiện chặn**

Trong `grading-run.service.ts`, sau đoạn dựng `deliverables` (dòng ~194-205) và TRƯỚC vòng `for (const batch of chunk(todo, ...))` ghi `grading_result` (dòng ~236), chèn:

```ts
    // §14.3 — một phiên có bài đường điều tra mà chưa ghim gói test là
    // chưa đủ điều kiện bắt đầu chấm: InvestigationContextService sẽ trả
    // `ungradable/system` cho MỌI bài đó (§4.4), và phát hiện việc này SAU
    // khi đã xếp hàng chỉ khiến giảng viên đọc ra từng bài một thay vì một
    // thông báo rõ nghĩa trước khi bấm.
    if (!session.testBundleId) {
      const needsBundle = todo.some((submission) => {
        const info = deliverables.get(submission.requiredDeliverableId);
        return info !== undefined && pipelineFor(info) === 'investigator';
      });
      if (needsBundle) {
        throw new BadRequestException(
          'Phiên này có bài chấm bằng đường điều tra (code) nhưng chưa ghim gói test — hãy tạo, duyệt và ghim một gói test trước khi bắt đầu chấm (§14.3).',
        );
      }
    }
```

Thêm import `pipelineFor` từ `./pipeline` (đã import `pipelineFor` ở dòng 19 — kiểm lại, có sẵn).

- [ ] **Step 4: Chạy lại, xác nhận xanh**

Run: `pnpm --filter api test grading-run.service.spec.ts`
Expected: PASS toàn bộ ba ca.

- [ ] **Step 5: Chạy suite unit đầy đủ của grading — không đỏ hồi quy**

Run: `pnpm --filter api test grading`
Expected: PASS — đặc biệt các test cũ của `startGrading` (anchor freeze, chunk 100, `alreadyGraded`) không đổi hành vi khi `testBundleId` đã có hoặc phiên toàn `document`.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/grading/grading-run.service.ts apps/api/src/grading/grading-run.service.spec.ts
git commit -m "feat(grading): chặn bắt đầu chấm khi phiên có bài điều tra mà chưa ghim gói test (§14.3, 3d2)"
```

---

### Task 4: e2e xuyên suốt — tạo phiên code, ghim gói, chấm thật ra điểm

**Files:**
- Test: `apps/api/test/investigator-end-to-end.e2e-spec.ts`

**Interfaces:**
- Consumes: mọi route/service của Task 1-3, cộng `InvestigatorRunService`/`ScoreService` đã có từ 3c/3d — không có sản phẩm mới, đây là bài kiểm TÍCH HỢP đóng plan.

- [ ] **Step 1: Viết test — đường đi đầy đủ từ API tới điểm**

```ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';
import { createTestAccount } from './helpers/create-account';
import { putObject } from './helpers/code-session-seed';

describe('Đường điều tra chạy thật — từ tạo phiên tới điểm (3d2, đóng plan)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new PostgresExceptionFilter());
    await app.init();
    dataSource = app.get(DataSource);
  });

  afterAll(async () => app.close());

  it('start-grading bị chặn TRƯỚC khi ghim gói, chạy được SAU khi ghim', async () => {
    // 1. Tạo class + teacher (createTestAccount), rubric tối thiểu (INSERT thẳng,
    //    theo khuôn finalize-investigator.e2e-spec.ts), phiên có MỘT deliverable
    //    code_project/cpp qua POST /exam-sessions (Task 1).
    // 2. Nộp một bài qua kênh thu bài thật (putObject + INSERT submission status='collected'),
    //    theo đúng khuôn archive-check.e2e-spec.ts.
    // 3. POST start-grading → 400 (chưa ghim gói, Task 3).
    // 4. POST test-bundles → approve → pin (Task 2).
    // 5. POST start-grading → 200, queued: 1.
    // 6. Đợi worker xử lý (poll GET grading-progress tới khi done=1, timeout ngắn — theo khuôn
    //    investigator-run.e2e-spec.ts), rồi đọc GET grading-results và xác nhận có điểm hoặc
    //    ungradable với lý do CỤ THỂ không phải "chưa ghim gói test" (vì đã ghim).
  });
});
```

*(Chi tiết bước 1-2 lấy nguyên văn cách dựng fixture từ `finalize-investigator.e2e-spec.ts` và `archive-check.e2e-spec.ts` — hai file đã tồn tại và làm đúng việc này cho 3c/3d; task này chỉ nối chúng qua route mới của Task 1-2 thay vì INSERT thẳng `test_bundle_id`/`required_deliverable.language` như các file đó đang làm.)*

- [ ] **Step 2: Chạy, xác nhận xanh**

Run: `pnpm --filter api test:e2e investigator-end-to-end.e2e-spec.ts`
Expected: PASS. Nếu bước 6 (chờ worker) không tất định trong CI, dùng đúng cơ chế poll đã có ở `investigator-run.e2e-spec.ts` (Bull worker chạy trong cùng process test) thay vì `setTimeout` cố định.

- [ ] **Step 3: Chạy toàn bộ e2e của grading + exam-session một lượt**

Run: `pnpm --filter api test:e2e -- --testPathPattern="(exam-session|grading|test-bundle|investigator)"`
Expected: PASS hết, không hồi quy bất kỳ file nào của 3b/3c/3d.

- [ ] **Step 4: Commit**

```bash
git add apps/api/test/investigator-end-to-end.e2e-spec.ts
git commit -m "test(grading): e2e xuyên suốt tạo phiên code — ghim gói — chấm thật (3d2, đóng plan)"
```

---

## Ngoài phạm vi plan này (không chặn demo, để sau)

- Đọc đề PDF thành chữ — `extractText` đã đọc được DOCX/TXT; giảng viên dùng DOCX/TXT cho đề bài code trong lúc chờ.
- Luật mồi đóng gói sẵn (§2.1) — giảng viên tự thêm luật qua `POST /rules` đã có từ 3c.
- Chấm lại bài `ungradable/system` sau khi sửa nguyên nhân (§2.3) — hôm nay giảng viên gọi `regrade-stuck` (đã có) cho bài `ai_grading` treo; bài đã đóng `ungradable` cần một route riêng, để plan sau.
- Sinh gói test từ đáp án mẫu (`origin: 'from_model_answer'`) — `TestBundleService.create` hôm nay chỉ nhận ca giảng viên tự viết (`origin: 'teacher'`).
