# Agent soạn đề CTDL&GT — Implementation Plan (bước 1–5)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Giảng viên nhập một câu prompt, agent sinh ra bộ ba **đề + đáp án mẫu (mã nguồn) + gói test**, giảng viên xem/sửa, xuất ra **hai** file Word tách rời, và gắn đề + đáp án vào một phiên thi nếu muốn.

**Architecture:** Module mới `apps/api/src/exam-authoring/` theo đúng khuôn của `grading/`: một seam `ExamAuthoringProvider` (business logic không import SDK), `TierChain` tái dùng nguyên si, provider thật dùng Anthropic SDK và provider stub tất định dùng khi `NODE_ENV=test`. Nội dung đề **không vào DB** — bản nháp sống ở `localStorage`; chỉ **usage** (token, chi phí) được ghi. Word sinh ở backend, stream thẳng về trình duyệt; nếu giảng viên gắn vào phiên thi thì **trình duyệt** PUT lên presigned URL, server không cầm file.

**Tech Stack:** NestJS 11 · TypeORM · `@anthropic-ai/sdk` ^0.125.0 (đã có) · `docx` (thêm mới) · Next.js 15 + TanStack Query · Jest (api) / Vitest (web)

**Spec:** `docs/superpowers/specs/2026-09-21-exam-authoring-agent-design.md`

## Global Constraints

Copy nguyên văn từ spec và từ `CLAUDE.md`. Mọi task đều chịu các ràng buộc này.

- **Môn duy nhất: CTDL&GT.** Ngôn ngữ lập trình KHÔNG khoá cứng (spec §1.2).
- **Không có ngân hàng câu hỏi.** Không bảng nào lưu nội dung đề. Bản nháp chỉ ở `localStorage`, tự xoá sau **24 giờ** (spec §1.2, §9).
- **Ghi usage, không ghi content** (spec §9.1): `teacher_id`, thời điểm, model, token vào/ra, `cost_usd`, số câu, `verification.status`. **Không** ghi đề, không ghi đáp án.
- **`verification.status` hôm nay LUÔN là `'unverified'`** với `reason: 'sandbox_unavailable'` (spec §4). Giao diện dán băng **"CHƯA KIỂM CHỨNG"** không tắt được.
- **ĐỀ và ĐÁP ÁN MẪU không bao giờ nằm chung một tài liệu** (spec §7.1). Hai endpoint, hai file.
- **Security rule 5:** file không bao giờ đi xuyên NestJS. Trình duyệt PUT lên presigned URL.
- **Đáp án mẫu nằm dưới prefix `grading-reference/`**, không bao giờ vào `exam_material` (spec §8).
- **`NODE_ENV === 'test'` thì KHÔNG gọi API tính tiền.** Soi gương `selectGradingProvider` tại `apps/api/src/grading/grading.module.ts:125`.
- **Mọi nguồn tri thức lọc theo `teacher_id = req.user.sub`** (spec §2).
- **Line ending: CRLF** cho mọi file `.ts`/`.tsx` trong repo này. Kiểm trước khi sửa.

## Phạm vi bị cắt so với spec, và vì sao

- **Bước 6 (nguồn bảng lỗi)** — bảng lỗi chưa có dòng code nào; nó đến cùng spec chấm §2.1. `KnowledgeSource` ở Task 4 được thiết kế để cắm thêm mà không sửa chỗ nào khác.
- **Bước 7 (kiểm chứng bằng sandbox)** — `sandbox.types.ts` mới là hợp đồng kiểu và nằm trên nhánh **chưa merge** `feature/code-autograder-plan-1`.
- **Gắn GÓI TEST vào phiên thi** — bảng `grading_test_bundle` **có trong DB dev** nhưng **entity không có trên nhánh này** (cũng ở nhánh autograder). Viết lại entity ở đây sẽ đụng nhánh đó khi merge. Task 10 vì vậy chỉ gắn **đề + đáp án mẫu**; gói test vẫn sinh ra và vẫn xuất được ra Word, chỉ chưa gắn được vào phiên.

## File Structure

| File | Trách nhiệm |
|---|---|
| `apps/api/src/exam-authoring/ai-provider/exam-authoring-provider.ts` | Seam: token DI, interface, kiểu `GeneratedExam` |
| `apps/api/src/exam-authoring/ai-provider/authoring-prompt.ts` | Dựng prompt + JSON schema đầu ra |
| `apps/api/src/exam-authoring/ai-provider/claude-authoring.provider.ts` | Gọi Anthropic SDK thật |
| `apps/api/src/exam-authoring/ai-provider/stub-authoring.provider.ts` | Bộ ba tất định, dùng khi `NODE_ENV=test` |
| `apps/api/src/exam-authoring/knowledge/knowledge-source.ts` | `KnowledgeSource` + nguồn prompt + nguồn rubric |
| `apps/api/src/exam-authoring/entities/ai-usage.entity.ts` | Dấu vết vận hành, KHÔNG có nội dung |
| `apps/api/src/exam-authoring/exam-authoring.service.ts` | Ghép nguồn tri thức → provider → ghi usage |
| `apps/api/src/exam-authoring/docx/exam-paper.docx.ts` | Dựng `de-thi.docx` |
| `apps/api/src/exam-authoring/docx/answer-key.docx.ts` | Dựng `dap-an-va-test.docx` |
| `apps/api/src/exam-authoring/exam-authoring.controller.ts` | 3 route: generate, export ×2 |
| `apps/web/src/lib/exam-draft.ts` | Nháp `localStorage` + hạn 24 giờ |
| `apps/web/src/app/teacher/exam-authoring/page.tsx` | Màn hình soạn đề |

---
### Task 1: Bảng `ai_usage` — dấu vết vận hành, không có nội dung

Spec §9.1. Làm trước mọi thứ vì Task 5 ghi vào nó, và vì mỗi ngày chạy mà không ghi là một ngày số liệu biến mất vĩnh viễn.

**Files:**
- Create: `apps/api/src/exam-authoring/entities/ai-usage.entity.ts`
- Create: `apps/api/src/database/migrations/1789360000000-AddAiUsage.ts`
- Modify: `apps/api/src/database/data-source.ts` (thêm entity vào mảng `entities`)
- Modify: `apps/api/src/database/verify-schema.ts` (thêm `'ai_usage'` vào danh sách bảng)
- Test: `apps/api/test/exam-authoring.e2e-spec.ts` (tạo mới ở Task 5; Task này chỉ kiểm bằng migration chạy được)

**Interfaces:**
- Produces: `AiUsageEntity` với các cột `id, created_at, teacher_id, feature, model_used, input_tokens, output_tokens, cost_usd, question_count, verification_status`

- [ ] **Step 1: Viết entity**

```ts
import { Check, Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { AccountEntity } from '../../identity/entities/account.entity';

/**
 * Một lượt gọi model tốn tiền. KHÔNG chứa nội dung.
 *
 * "Không lưu" của chủ đồ án (spec §9) áp cho NỘI DUNG ĐỀ, không áp cho dấu
 * vết vận hành: thiếu bảng này thì dashboard chi phí của Admin mù với cả một
 * tính năng, `cost_budget.current_spend_usd` đếm thiếu nên trần chi phí sai,
 * và câu "soạn một đề tốn bao nhiêu" — một con số phải có trong báo cáo,
 * đứng cạnh chi phí mỗi bài chấm — không ai trả lời được.
 *
 * Bản ghi một lần, không sửa: không có `updated_at`, cùng khuôn với
 * `CalibrationRunEntity`.
 */
@Entity({ name: 'ai_usage' })
@Check('ck_ai_usage_tokens', 'input_tokens >= 0 AND output_tokens >= 0')
@Check('ck_ai_usage_cost', 'cost_usd IS NULL OR cost_usd >= 0')
export class AiUsageEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'created_at', type: 'timestamptz', default: () => 'now()' })
  createdAt!: Date;

  @Column({ name: 'teacher_id', type: 'uuid' })
  teacherId!: string;

  @ManyToOne(() => AccountEntity, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'teacher_id' })
  teacher?: AccountEntity;

  /** Tính năng nào tiêu tiền. `'exam_authoring'` là giá trị đầu tiên; phần
   *  chấm sẽ thêm giá trị của nó sau mà không phải đổi schema. */
  @Column({ type: 'varchar', length: 50 })
  feature!: string;

  @Column({ name: 'model_used', type: 'varchar', length: 100 })
  modelUsed!: string;

  @Column({ name: 'input_tokens', type: 'int' })
  inputTokens!: number;

  @Column({ name: 'output_tokens', type: 'int' })
  outputTokens!: number;

  /** `null` khi chưa có bảng giá cho model đó — KHÔNG phải 0. Ghi 0 sẽ làm
   *  tổng chi phí nói dối theo hướng an toàn giả. */
  @Column({ name: 'cost_usd', type: 'numeric', precision: 10, scale: 6, nullable: true })
  costUsd!: string | null;

  @Column({ name: 'question_count', type: 'int' })
  questionCount!: number;

  @Column({ name: 'verification_status', type: 'varchar', length: 20 })
  verificationStatus!: string;
}
```

- [ ] **Step 2: Viết migration**

```ts
import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Dấu vết chi phí AI. Xem doc của `AiUsageEntity` để biết vì sao bảng này
 * tồn tại dù spec nói "không lưu".
 */
export class AddAiUsage1789360000000 implements MigrationInterface {
  name = 'AddAiUsage1789360000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "examcollect"."ai_usage" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "teacher_id" uuid NOT NULL REFERENCES "examcollect"."account"("id") ON DELETE RESTRICT,
        "feature" varchar(50) NOT NULL,
        "model_used" varchar(100) NOT NULL,
        "input_tokens" int NOT NULL,
        "output_tokens" int NOT NULL,
        "cost_usd" numeric(10,6),
        "question_count" int NOT NULL,
        "verification_status" varchar(20) NOT NULL,
        CONSTRAINT "ck_ai_usage_tokens" CHECK ("input_tokens" >= 0 AND "output_tokens" >= 0),
        CONSTRAINT "ck_ai_usage_cost" CHECK ("cost_usd" IS NULL OR "cost_usd" >= 0)
      )
    `);
    // Dashboard chi phí hỏi theo giảng viên và theo tháng. Index để câu hỏi
    // đó không phải quét cả bảng khi nó lớn dần qua các học kỳ.
    await queryRunner.query(
      `CREATE INDEX "ix_ai_usage_teacher_created" ON "examcollect"."ai_usage" ("teacher_id", "created_at" DESC)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "examcollect"."ai_usage"`);
  }
}
```

- [ ] **Step 3: Đăng ký entity và bảng**

Trong `apps/api/src/database/data-source.ts`: thêm `import { AiUsageEntity } from '../exam-authoring/entities/ai-usage.entity';` và thêm `AiUsageEntity,` vào mảng `entities`.
Trong `apps/api/src/database/verify-schema.ts`: thêm `'ai_usage',` vào danh sách tên bảng.

- [ ] **Step 4: Chạy migration và xác nhận bảng có thật**

Run:
```bash
cd apps/api && pnpm migration:run
docker exec -i cine-postgres-1 psql -U examcollect_admin -d examcollect -c "\d examcollect.ai_usage"
```
Expected: migration báo `executed successfully`; `\d` in ra 10 cột và 2 CHECK.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/exam-authoring/entities/ai-usage.entity.ts apps/api/src/database/migrations/1789360000000-AddAiUsage.ts apps/api/src/database/data-source.ts apps/api/src/database/verify-schema.ts
git commit -m "feat(exam-authoring): bảng ai_usage — ghi chi phí, không ghi nội dung"
```

---
### Task 2: Seam `ExamAuthoringProvider` + provider stub

Spec §3 (hình dạng bộ ba) và §5 (tái dùng gì). Chưa gọi API nào — task này khoá **hợp đồng kiểu** lại trước, để Task 3 chỉ còn việc điền một implementation.

**Files:**
- Create: `apps/api/src/exam-authoring/ai-provider/exam-authoring-provider.ts`
- Create: `apps/api/src/exam-authoring/ai-provider/stub-authoring.provider.ts`
- Test: `apps/api/src/exam-authoring/ai-provider/stub-authoring.provider.spec.ts`

**Interfaces:**
- Produces: `EXAM_AUTHORING_PROVIDER` (DI token), `ExamAuthoringProvider` interface với `generate(request: AuthoringRequest): Promise<AuthoringOutcome>`, và các kiểu `GeneratedExam`, `GeneratedQuestion`, `TestCase`, `Verification`, `AuthoringUsage`.

- [ ] **Step 1: Viết file seam**

```ts
/**
 * Seam duy nhất mà mọi model soạn đề ngồi sau.
 *
 * Cùng một lý do với `AI_GRADING_PROVIDER` (xem `ai-grading-provider.ts`):
 * business logic không được import SDK của một nhà cung cấp cụ thể, vì dự án
 * dùng nhiều nhà cung cấp, so sánh chúng, và theo dõi chi phí riêng từng cái.
 */

/** Ca test của gói test sinh kèm. `group` khớp `rubric_criterion.test_group`
 *  của nhánh autograder — không đặt tên mới cho cùng một khái niệm. */
export interface TestCase {
  name: string;
  group: string;
  input: string;
  expectedOutput: string;
}

export interface GeneratedQuestion {
  statement: string;
  points: number;
  topic: string;
  /** `null` = đề không ràng buộc độ phức tạp. KHÔNG dùng chuỗi rỗng. */
  requiredComplexity: string | null;
  /** MÃ NGUỒN, không phải lời giải bằng văn xuôi. Đây là toàn bộ điểm khác
   *  biệt của spec này: một chương trình thì chạy được, và chạy được nghĩa
   *  là đo được. */
  modelAnswer: string;
  testBundle: TestCase[];
  /** Bài kinh điển mà model TỰ NHẬN câu này giống (spec §6). `null` = nó
   *  không thấy giống bài nào. Đây là lời tự khai, KHÔNG phải bằng chứng. */
  resemblesKnownProblem: string | null;
}

export type Verification =
  | { status: 'unverified'; reason: 'sandbox_unavailable' }
  | { status: 'passed'; ranAt: string; complexityMeasured: string | null }
  | { status: 'failed'; failures: string[]; repairAttempts: number };

export interface GeneratedExam {
  title: string;
  language: string;
  questions: GeneratedQuestion[];
  verification: Verification;
}

export interface AuthoringRequest {
  /** Prompt giảng viên gõ lần này. */
  prompt: string;
  /** Tri thức sẵn có của chính giảng viên đó, đã render thành văn bản.
   *  Rỗng là hợp lệ — giảng viên chưa có rubric nào vẫn soạn được đề. */
  knowledge: string[];
  questionCount: number;
  language: string;

  /**
   * Ba trường cho lượt SINH LẠI MỘT CÂU. Vắng mặt ở lượt sinh đầu tiên.
   *
   * Sinh lại mà giữ nguyên prompt thì model rơi lại đúng chỗ cũ — nó chọn
   * bài kinh điển vì đó là chỗ trũng nhất của phân phối, và prompt không
   * đổi thì phân phối không đổi. Ba trường này là ba cách đẩy nó ra.
   */

  /** Bài kinh điển PHẢI tránh. Hệ thống tự điền từ `resemblesKnownProblem`
   *  của câu đang bị thay — giảng viên không phải gõ lại thứ model vừa tự
   *  khai. */
  avoid?: string[];
  /** Ghi chú lái của giảng viên: "đổi sang đếm số lần so sánh". Đây là phần
   *  hệ thống KHÔNG đoán được, nên nó là phần bắt buộc phải hỏi. */
  refineNote?: string;
  /** Đề của các câu đang giữ lại, để câu mới không trùng ý với chúng. */
  existingStatements?: string[];
}

export interface AuthoringUsage {
  modelUsed: string;
  inputTokens: number;
  outputTokens: number;
}

export interface AuthoringOutcome {
  exam: GeneratedExam;
  usage: AuthoringUsage;
}

export interface ExamAuthoringProvider {
  readonly name: string;
  generate(request: AuthoringRequest): Promise<AuthoringOutcome>;
}

export const EXAM_AUTHORING_PROVIDER = Symbol('EXAM_AUTHORING_PROVIDER');

/**
 * Trần số câu mỗi lượt (spec §5.2). Quá số này thì giảng viên không đọc hết
 * nổi trước khi duyệt, và một đề không ai đọc thì tệ hơn không có đề.
 */
export const MAX_QUESTIONS_PER_RUN = 10;
```

- [ ] **Step 2: Viết test cho stub TRƯỚC khi có stub**

Create `stub-authoring.provider.spec.ts`:

```ts
import { StubAuthoringProvider } from './stub-authoring.provider';

describe('StubAuthoringProvider', () => {
  const provider = new StubAuthoringProvider();

  it('trả về đúng số câu được yêu cầu', async () => {
    const { exam } = await provider.generate({
      prompt: 'sắp xếp',
      knowledge: [],
      questionCount: 3,
      language: 'python',
    });
    expect(exam.questions).toHaveLength(3);
  });

  it('LUÔN unverified — không có sandbox thì không có trạng thái nào khác', async () => {
    const { exam } = await provider.generate({
      prompt: 'x', knowledge: [], questionCount: 1, language: 'python',
    });
    expect(exam.verification).toEqual({ status: 'unverified', reason: 'sandbox_unavailable' });
  });

  it('tất định: cùng đầu vào cho ra cùng đầu ra', async () => {
    const req = { prompt: 'x', knowledge: [], questionCount: 2, language: 'python' };
    const [a, b] = await Promise.all([provider.generate(req), provider.generate(req)]);
    expect(a.exam).toEqual(b.exam);
  });

  it('mỗi câu có đáp án mẫu là MÃ NGUỒN và ít nhất một ca test', async () => {
    const { exam } = await provider.generate({
      prompt: 'x', knowledge: [], questionCount: 1, language: 'python',
    });
    expect(exam.questions[0].modelAnswer).toContain('def ');
    expect(exam.questions[0].testBundle.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 3: Chạy test để xác nhận nó ĐỎ**

Run: `cd apps/api && npx jest src/exam-authoring/ai-provider/stub-authoring.provider.spec.ts`
Expected: FAIL — `Cannot find module './stub-authoring.provider'`

- [ ] **Step 4: Viết stub**

```ts
import { Injectable } from '@nestjs/common';
import {
  AuthoringOutcome,
  AuthoringRequest,
  ExamAuthoringProvider,
  GeneratedQuestion,
} from './exam-authoring-provider';

/**
 * Bộ ba tất định, không gọi mạng.
 *
 * Tồn tại vì đúng một lý do, và lý do đó đã có tiền lệ đắt trong repo này:
 * `selectGradingProvider` (grading.module.ts:125) trả provider keyword khi
 * `NODE_ENV === 'test'`, sau khi khoá API thật xuất hiện trong `.env` và cả
 * bộ e2e bắt đầu gọi API tính tiền. Hôm đó nó lộ ra vì tài khoản chưa có
 * credit; nếu có credit thì nó sẽ KHÔNG lộ ra, chỉ là mỗi lần chạy test lại
 * tiêu một ít tiền. "Có khoá trong .env" không phải lời xin phép tiêu tiền.
 */
@Injectable()
export class StubAuthoringProvider implements ExamAuthoringProvider {
  readonly name = 'stub-authoring';

  async generate(request: AuthoringRequest): Promise<AuthoringOutcome> {
    const questions: GeneratedQuestion[] = Array.from(
      { length: request.questionCount },
      (_, i) => ({
        statement: `Câu ${i + 1}: cài đặt hàm sắp xếp một mảng số nguyên tăng dần.`,
        points: 10 / request.questionCount,
        topic: 'sorting',
        requiredComplexity: 'O(n log n)',
        modelAnswer: 'def solve(xs):\n    return sorted(xs)\n',
        testBundle: [
          { name: 'rong', group: 'bien', input: '[]', expectedOutput: '[]' },
          { name: 'co-ban', group: 'co-ban', input: '[3,1,2]', expectedOutput: '[1,2,3]' },
        ],
        resemblesKnownProblem: null,
      }),
    );

    return {
      exam: {
        title: `Đề thử nghiệm (${request.language})`,
        language: request.language,
        questions,
        verification: { status: 'unverified', reason: 'sandbox_unavailable' },
      },
      usage: { modelUsed: this.name, inputTokens: 0, outputTokens: 0 },
    };
  }
}
```

- [ ] **Step 5: Chạy test để xác nhận nó XANH**

Run: `cd apps/api && npx jest src/exam-authoring/ai-provider/stub-authoring.provider.spec.ts`
Expected: PASS, 4 test.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/exam-authoring/ai-provider/
git commit -m "feat(exam-authoring): seam ExamAuthoringProvider + stub tất định cho test"
```

---
### Task 3: Provider Claude thật + prompt

Spec §2 (ba nguồn tri thức), §2.1 (không bê lập luận cache), §6 (tự khai bài kinh điển).

**Files:**
- Create: `apps/api/src/exam-authoring/ai-provider/authoring-prompt.ts`
- Create: `apps/api/src/exam-authoring/ai-provider/claude-authoring.provider.ts`
- Test: `apps/api/src/exam-authoring/ai-provider/authoring-prompt.spec.ts`

**Interfaces:**
- Consumes: `AuthoringRequest`, `AuthoringOutcome`, `ExamAuthoringProvider`, `GeneratedExam`, `GeneratedQuestion` (Task 2)
- Produces: `buildAuthoringPrompt(request: AuthoringRequest): string`, `parseAuthoringResponse(text: string): GeneratedExam`, `ClaudeAuthoringProvider`, `AUTHORING_MODEL`

- [ ] **Step 1: Viết test cho prompt + parser TRƯỚC**

```ts
import { buildAuthoringPrompt, parseAuthoringResponse } from './authoring-prompt';

describe('buildAuthoringPrompt', () => {
  const base = { prompt: 'cây nhị phân', knowledge: [], questionCount: 2, language: 'python' };

  it('nhét tri thức THẲNG vào prompt, không bắt đọc file', () => {
    // Spec §2.1: lập luận prompt-caching của spec chấm KHÔNG áp ở đây —
    // soạn đề là MỘT lượt, không có lô 40 bài nào để chia sẻ tiền tố.
    const text = buildAuthoringPrompt({ ...base, knowledge: ['Tiêu chí: dùng đệ quy — 3 điểm'] });
    expect(text).toContain('Tiêu chí: dùng đệ quy — 3 điểm');
  });

  it('nguồn tri thức rỗng vẫn dựng được prompt', () => {
    expect(() => buildAuthoringPrompt(base)).not.toThrow();
  });

  it('bắt model tự khai bài kinh điển nó thấy giống', () => {
    expect(buildAuthoringPrompt(base)).toContain('resemblesKnownProblem');
  });

  it('lượt SINH LẠI mang đủ ba vế: tránh gì, đổi gì, và các câu đang giữ', () => {
    // Thiếu vế nào cũng hỏng: không `avoid` thì model ra lại đúng bài cũ;
    // không `refineNote` thì nó không biết đi hướng nào; không
    // `existingStatements` thì câu mới trùng ý câu đang giữ.
    const text = buildAuthoringPrompt({
      ...base,
      questionCount: 1,
      avoid: ['tìm kiếm nhị phân tìm biên trái'],
      refineNote: 'đổi sang đếm số lần so sánh',
      existingStatements: ['Sắp xếp mảng tăng dần.'],
    });
    expect(text).toContain('tìm kiếm nhị phân tìm biên trái');
    expect(text).toContain('đổi sang đếm số lần so sánh');
    expect(text).toContain('Sắp xếp mảng tăng dần.');
  });

  it('lượt sinh ĐẦU TIÊN không mang mấy khối đó — prompt không phình vô cớ', () => {
    const text = buildAuthoringPrompt(base);
    expect(text).not.toContain('KHÔNG được ra lại');
    expect(text).not.toContain('Các câu đang giữ lại');
  });
});

describe('parseAuthoringResponse', () => {
  const valid = JSON.stringify({
    title: 'Giữa kỳ CTDL&GT',
    language: 'python',
    questions: [{
      statement: 'Sắp xếp mảng', points: 10, topic: 'sorting',
      requiredComplexity: 'O(n log n)',
      modelAnswer: 'def solve(xs):\n    return sorted(xs)\n',
      testBundle: [{ name: 'co-ban', group: 'co-ban', input: '[2,1]', expectedOutput: '[1,2]' }],
      resemblesKnownProblem: null,
    }],
  });

  it('đọc được JSON hợp lệ và LUÔN gắn unverified', () => {
    const exam = parseAuthoringResponse(valid);
    expect(exam.questions).toHaveLength(1);
    // Model KHÔNG được tự khai verification: nó chưa chạy gì cả.
    expect(exam.verification).toEqual({ status: 'unverified', reason: 'sandbox_unavailable' });
  });

  it('bỏ qua verification do model tự bịa', () => {
    const lying = JSON.stringify({
      ...JSON.parse(valid),
      verification: { status: 'passed', ranAt: '2026-01-01', complexityMeasured: 'O(n)' },
    });
    expect(parseAuthoringResponse(lying).verification.status).toBe('unverified');
  });

  it('JSON hỏng thì ném lỗi rõ ràng, KHÔNG trả bộ ba rỗng trông như hợp lệ', () => {
    expect(() => parseAuthoringResponse('{ khong phai json')).toThrow(/không đọc được/i);
  });

  it('câu thiếu modelAnswer thì ném, vì đề không có đáp án là nửa sản phẩm', () => {
    const missing = JSON.parse(valid);
    delete missing.questions[0].modelAnswer;
    expect(() => parseAuthoringResponse(JSON.stringify(missing))).toThrow();
  });

  it('gỡ được rào ```json quanh JSON', () => {
    expect(parseAuthoringResponse('```json\n' + valid + '\n```').questions).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Chạy để xác nhận ĐỎ**

Run: `cd apps/api && npx jest src/exam-authoring/ai-provider/authoring-prompt.spec.ts`
Expected: FAIL — `Cannot find module './authoring-prompt'`

- [ ] **Step 3: Viết `authoring-prompt.ts` — phần dựng prompt**

```ts
import { AuthoringRequest, GeneratedExam, GeneratedQuestion } from './exam-authoring-provider';

/**
 * Tri thức đi THẲNG vào prompt, không qua file trong workspace.
 *
 * Spec chấm §2.1 cấm nhét bảng lỗi vào system prompt, và cấm đúng: 40 bài của
 * một phiên dùng chung một tiền tố, nên đặt phần thay đổi theo giảng viên vào
 * tiền tố là trả giá đầy đủ bốn mươi lần. **Ở đây không có bốn mươi lần** —
 * soạn đề là một lượt tương tác, một lần. Không có lô nào chia sẻ tiền tố,
 * nên cache không có gì để tiết kiệm.
 *
 * Ghi ra vì đây đúng loại lập luận dễ bị bê nguyên si sang chỗ không thuộc về
 * nó: một luật tối ưu chỉ đúng trong điều kiện sinh ra nó.
 */
export function buildAuthoringPrompt(request: AuthoringRequest): string {
  const knowledge = request.knowledge.filter((k) => k.trim().length > 0);
  const knowledgeBlock =
    knowledge.length > 0
      ? `\n\n## Tri thức của chính giảng viên này\n\n${knowledge.join('\n\n')}`
      : '';

  // Ba khối chỉ có mặt ở lượt SINH LẠI. Vắng ở lượt đầu, để prompt không
  // phình ra với những dòng chưa có nội dung.
  const refineBlock = request.refineNote?.trim()
    ? `\n\nGiảng viên muốn đổi: ${request.refineNote.trim()}`
    : '';
  const avoid = (request.avoid ?? []).filter((a) => a.trim().length > 0);
  const avoidBlock =
    avoid.length > 0
      ? `\n\nKHÔNG được ra lại các bài sau, kể cả đổi tên biến hay đổi lời kể: ${avoid.join('; ')}.`
      : '';
  const keep = (request.existingStatements ?? []).filter((s) => s.trim().length > 0);
  const keepBlock =
    keep.length > 0
      ? `\n\nCác câu đang giữ lại trong đề — câu mới không được trùng ý với chúng:\n${keep.map((s, i) => `${i + 1}. ${s}`).join('\n')}`
      : '';

  return `Bạn soạn đề thi môn Cấu trúc dữ liệu và Giải thuật.

Sinh ${request.questionCount} câu bằng ngôn ngữ ${request.language}.

Mỗi câu phải có ĐỦ BA phần, thiếu một phần là câu đó không dùng được:
1. Đề bài.
2. "modelAnswer": MÃ NGUỒN chạy được, không phải lời giải bằng văn xuôi.
3. "testBundle": các ca test, phủ ít nhất một ca biên (mảng rỗng, một phần
   tử, phần tử trùng, hoặc đã sắp sẵn).

"resemblesKnownProblem": nếu câu này về bản chất là một bài kinh điển đã phổ
biến (two-sum, Kadane, LRU cache, ba lô 0/1, đảo danh sách liên kết...) thì
NÓI RA TÊN NÓ. Sinh viên tra mạng ra lời giải trong ba mươi giây, và giảng
viên cần biết điều đó trước khi in đề. Không giống bài nào thì để null.

KHÔNG tự khai trường "verification": bạn chưa chạy gì cả.

Yêu cầu của giảng viên lần này:
${request.prompt}${refineBlock}${avoidBlock}${keepBlock}${knowledgeBlock}

Trả về DUY NHẤT một object JSON:
{
  "title": string,
  "language": string,
  "questions": [{
    "statement": string,
    "points": number,
    "topic": string,
    "requiredComplexity": string | null,
    "modelAnswer": string,
    "testBundle": [{"name": string, "group": string, "input": string, "expectedOutput": string}],
    "resemblesKnownProblem": string | null
  }]
}`;
}
```

- [ ] **Step 4: Viết phần parser vào cùng file**

```ts
function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Không đọc được đầu ra của model: thiếu hoặc sai kiểu ở "${field}"`);
  }
  return value;
}

/**
 * Đọc đầu ra thành `GeneratedExam`. Hai luật, cả hai đều là "thà nổ còn hơn
 * trả một thứ trông hợp lệ":
 *
 * 1. **`verification` do CODE gắn, không bao giờ đọc từ model.** Model chưa
 *    chạy dòng nào, nên mọi khẳng định của nó về việc đã kiểm chứng đều là
 *    bịa. Cùng nguyên tắc với spec chấm §5.1 (đoạn tóm tắt do harness render,
 *    không do model kể lại).
 * 2. **Thiếu `modelAnswer` là ném, không phải bỏ qua.** Một đề không có đáp
 *    án chạy được là nửa sản phẩm, và nửa sản phẩm im lặng đi tiếp sẽ thành
 *    một `grading_reference` rác ở Task 10 — đúng cái bẫy spec §4.1 mô tả.
 */
export function parseAuthoringResponse(text: string): GeneratedExam {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    throw new Error('Không đọc được đầu ra của model: JSON hỏng');
  }

  const questionsRaw = raw.questions;
  if (!Array.isArray(questionsRaw) || questionsRaw.length === 0) {
    throw new Error('Không đọc được đầu ra của model: thiếu danh sách câu hỏi');
  }

  const questions: GeneratedQuestion[] = questionsRaw.map((q, i) => {
    const row = q as Record<string, unknown>;
    const bundle = Array.isArray(row.testBundle) ? row.testBundle : [];
    return {
      statement: requireString(row.statement, `questions[${i}].statement`),
      points: typeof row.points === 'number' ? row.points : 0,
      topic: typeof row.topic === 'string' ? row.topic : 'khác',
      requiredComplexity:
        typeof row.requiredComplexity === 'string' ? row.requiredComplexity : null,
      modelAnswer: requireString(row.modelAnswer, `questions[${i}].modelAnswer`),
      testBundle: bundle.map((c) => {
        const cell = c as Record<string, unknown>;
        return {
          name: typeof cell.name === 'string' ? cell.name : 'ca',
          group: typeof cell.group === 'string' ? cell.group : 'co-ban',
          input: typeof cell.input === 'string' ? cell.input : '',
          expectedOutput: typeof cell.expectedOutput === 'string' ? cell.expectedOutput : '',
        };
      }),
      resemblesKnownProblem:
        typeof row.resemblesKnownProblem === 'string' ? row.resemblesKnownProblem : null,
    };
  });

  return {
    title: typeof raw.title === 'string' ? raw.title : 'Đề thi CTDL&GT',
    language: typeof raw.language === 'string' ? raw.language : 'python',
    questions,
    // Gắn ở ĐÂY, bất kể model nói gì. Xem luật 1 ở doc trên.
    verification: { status: 'unverified', reason: 'sandbox_unavailable' },
  };
}
```

- [ ] **Step 5: Chạy test — phải XANH**

Run: `cd apps/api && npx jest src/exam-authoring/ai-provider/authoring-prompt.spec.ts`
Expected: PASS, 9 test.

- [ ] **Step 6: Viết `claude-authoring.provider.ts`**

```ts
import { Injectable, Logger } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import {
  AuthoringOutcome,
  AuthoringRequest,
  ExamAuthoringProvider,
} from './exam-authoring-provider';
import { buildAuthoringPrompt, parseAuthoringResponse } from './authoring-prompt';

/**
 * Sonnet 5, KHÁC `GRADER_MODEL` ('claude-sonnet-4-6') mà nhánh chấm dùng.
 *
 * Cố ý khác, và lý do đáng ghi ra: chấm một tiêu chí là phán đoán hẹp đã có
 * rubric dẫn đường; soạn một đề kèm đáp án chạy được và gói test phủ biên là
 * việc rộng hơn hẳn. Nhánh chấm nâng bậc khi nào là quyết định riêng của nó —
 * hai con số này không phải cùng một quyết định, nên không dùng chung hằng số.
 */
export const AUTHORING_MODEL = 'claude-sonnet-5';

@Injectable()
export class ClaudeAuthoringProvider implements ExamAuthoringProvider {
  readonly name = AUTHORING_MODEL;
  private readonly logger = new Logger(ClaudeAuthoringProvider.name);
  private readonly client = new Anthropic();

  async generate(request: AuthoringRequest): Promise<AuthoringOutcome> {
    const response = await this.client.messages.create({
      model: AUTHORING_MODEL,
      max_tokens: 16000,
      messages: [{ role: 'user', content: buildAuthoringPrompt(request) }],
    });

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('');

    const exam = parseAuthoringResponse(text);
    this.logger.log(
      `soạn đề: ${exam.questions.length} câu, token in=${response.usage.input_tokens} ` +
        `out=${response.usage.output_tokens}`,
    );

    return {
      exam,
      usage: {
        // `response.model` chứ không phải hằng số: model có thể trả về một id
        // cụ thể hơn id ta gửi, và bảng usage phải ghi cái ĐÃ CHẠY.
        modelUsed: response.model ?? AUTHORING_MODEL,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    };
  }
}
```

- [ ] **Step 7: Typecheck**

Run: `cd apps/api && npx tsc --noEmit -p tsconfig.json`
Expected: exit 0.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/exam-authoring/ai-provider/
git commit -m "feat(exam-authoring): prompt, parser chống bịa verification, provider Claude"
```

---
### Task 4: Nguồn tri thức cắm được

Spec §2. Chủ đồ án chốt **cả (a) prompt gõ mỗi lần lẫn (b) tri thức sẵn có**. Ba nguồn, và **chỉ hai tồn tại hôm nay** — bảng lỗi chưa có dòng code nào.

**Files:**
- Create: `apps/api/src/exam-authoring/knowledge/knowledge-source.ts`
- Test: `apps/api/src/exam-authoring/knowledge/knowledge-source.spec.ts`

**Interfaces:**
- Produces: `KnowledgeSource` interface, `RubricKnowledgeSource` class với `render(teacherId: string): Promise<string>`, `collectKnowledge(sources, teacherId): Promise<string[]>`

- [ ] **Step 1: Viết test TRƯỚC**

```ts
import { RubricKnowledgeSource, collectKnowledge, KnowledgeSource } from './knowledge-source';

function fakeSource(kind: KnowledgeSource['kind'], text: string): KnowledgeSource {
  return { kind, render: async () => text };
}

describe('collectKnowledge', () => {
  it('bỏ nguồn trả về rỗng — nguồn CHƯA TỒN TẠI không phải lỗi', () => {
    // Bảng lỗi sẽ cắm vào đây khi spec chấm §2.1 có nó. Tới lúc đó nó trả
    // rỗng, và đó là trạng thái hợp lệ, không phải hỏng.
    return expect(
      collectKnowledge([fakeSource('rubric', 'A'), fakeSource('error_table', '   ')], 't1'),
    ).resolves.toEqual(['A']);
  });

  it('giữ nguyên thứ tự nguồn', async () => {
    const out = await collectKnowledge(
      [fakeSource('prompt', 'P'), fakeSource('rubric', 'R')], 't1',
    );
    expect(out).toEqual(['P', 'R']);
  });

  it('một nguồn ném KHÔNG làm hỏng cả lượt soạn đề', async () => {
    const boom: KnowledgeSource = {
      kind: 'rubric',
      render: async () => { throw new Error('DB sập'); },
    };
    await expect(collectKnowledge([boom, fakeSource('prompt', 'P')], 't1')).resolves.toEqual(['P']);
  });
});

describe('RubricKnowledgeSource', () => {
  it('chỉ đọc rubric của CHÍNH giảng viên đó', async () => {
    const find = jest.fn().mockResolvedValue([]);
    const source = new RubricKnowledgeSource({ find } as never);
    await source.render('teacher-1');
    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({ where: { teacherId: 'teacher-1', isActive: true } }),
    );
  });

  it('không có rubric nào thì trả chuỗi rỗng, không ném', async () => {
    const source = new RubricKnowledgeSource({ find: async () => [] } as never);
    await expect(source.render('t1')).resolves.toBe('');
  });

  it('render tên rubric và tiêu chí thành văn bản model đọc được', async () => {
    const source = new RubricKnowledgeSource({
      find: async () => [
        { name: 'Giữa kỳ CTDL', criteria: [{ description: 'Dùng đệ quy', maxPoints: '3' }] },
      ],
    } as never);
    const text = await source.render('t1');
    expect(text).toContain('Giữa kỳ CTDL');
    expect(text).toContain('Dùng đệ quy');
    expect(text).toContain('3');
  });
});
```

- [ ] **Step 2: Chạy để xác nhận ĐỎ**

Run: `cd apps/api && npx jest src/exam-authoring/knowledge/`
Expected: FAIL — `Cannot find module './knowledge-source'`

- [ ] **Step 3: Viết implementation**

```ts
import { Logger } from '@nestjs/common';
import { Repository } from 'typeorm';
import { RubricEntity } from '../../grading/entities/rubric.entity';

/**
 * Một nguồn tri thức của giảng viên, render thành văn bản cho prompt.
 *
 * Là DANH SÁCH CẮM THÊM ĐƯỢC, không phải ba tham số cứng — spec §2. Hôm nay
 * mảng có hai phần tử (prompt, rubric); ngày bảng lỗi ra đời thì thêm một
 * phần tử và không sửa chỗ nào khác.
 */
export interface KnowledgeSource {
  kind: 'prompt' | 'rubric' | 'error_table';
  /** Rỗng = nguồn chưa tồn tại hoặc chưa có dữ liệu. KHÔNG phải lỗi. */
  render(teacherId: string): Promise<string>;
}

const logger = new Logger('KnowledgeSource');

/**
 * Gom mọi nguồn, bỏ cái rỗng.
 *
 * Một nguồn ném thì GHI LOG rồi đi tiếp, không làm hỏng cả lượt soạn đề:
 * giảng viên đang ngồi đợi, và mất một nguồn phụ trợ thì đề vẫn sinh được —
 * mất cả lượt thì không. Đây là đánh đổi có chủ ý, khác hẳn với đường chấm
 * điểm nơi thiếu dữ liệu phải dừng lại.
 */
export async function collectKnowledge(
  sources: KnowledgeSource[],
  teacherId: string,
): Promise<string[]> {
  const out: string[] = [];
  for (const source of sources) {
    try {
      const text = await source.render(teacherId);
      if (text.trim().length > 0) {
        out.push(text);
      }
    } catch (error) {
      logger.warn(`nguồn tri thức "${source.kind}" hỏng, bỏ qua: ${String(error)}`);
    }
  }
  return out;
}

/**
 * Rubric của chính giảng viên đó — nguồn (b) thứ nhất, và là nguồn DUY NHẤT
 * của (b) tồn tại hôm nay.
 *
 * Lọc `teacherId` là ranh giới cách ly thật, cùng luật với
 * `unique(teacher_id, name, version)` mà đợt cắt master data đã chốt: rubric
 * của giảng viên khác không bao giờ được đọc để sinh đề cho người này.
 */
export class RubricKnowledgeSource implements KnowledgeSource {
  readonly kind = 'rubric' as const;

  constructor(private readonly rubrics: Repository<RubricEntity>) {}

  async render(teacherId: string): Promise<string> {
    const rows = await this.rubrics.find({
      where: { teacherId, isActive: true },
      relations: { criteria: true },
      take: 5,
    } as never);

    const usable = (rows as Array<{ name: string; criteria?: Array<{ description: string; maxPoints: string }> }>)
      .filter((r) => (r.criteria?.length ?? 0) > 0);
    if (usable.length === 0) {
      return '';
    }

    const lines = usable.map((r) => {
      const criteria = (r.criteria ?? [])
        .map((c) => `  - ${c.description} (${c.maxPoints} điểm)`)
        .join('\n');
      return `Rubric "${r.name}":\n${criteria}`;
    });

    return `Giảng viên này chấm theo các tiêu chí sau. Đề sinh ra nên hỏi được đúng những thứ đó:\n\n${lines.join('\n\n')}`;
  }
}
```

- [ ] **Step 4: Kiểm quan hệ `criteria` có thật trên `RubricEntity` chưa**

Run: `grep -n "criteria" apps/api/src/grading/entities/rubric.entity.ts`
Nếu KHÔNG có: thêm vào `RubricEntity`:
```ts
  @OneToMany(() => RubricCriterionEntity, (c) => c.rubric)
  criteria?: RubricCriterionEntity[];
```
và import `OneToMany` + `RubricCriterionEntity`. Kiểm `rubric-criterion.entity.ts` xem tên thuộc tính phía `ManyToOne` là gì rồi khớp đúng tên đó.

- [ ] **Step 5: Chạy test — phải XANH**

Run: `cd apps/api && npx jest src/exam-authoring/knowledge/`
Expected: PASS, 6 test.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/exam-authoring/knowledge/ apps/api/src/grading/entities/rubric.entity.ts
git commit -m "feat(exam-authoring): nguồn tri thức cắm được, rubric là nguồn đầu tiên"
```

---
### Task 5: Service + module + route `POST /exam-authoring/generate`

Spec §5 (tái dùng gì), §9.1 (ghi usage không ghi content).

**Files:**
- Create: `apps/api/src/exam-authoring/dto/generate-exam.dto.ts`
- Create: `apps/api/src/exam-authoring/exam-authoring.service.ts`
- Create: `apps/api/src/exam-authoring/exam-authoring.controller.ts`
- Create: `apps/api/src/exam-authoring/exam-authoring.module.ts`
- Modify: `apps/api/src/app.module.ts` (thêm `ExamAuthoringModule` vào `imports`)
- Test: `apps/api/test/exam-authoring.e2e-spec.ts`

**Interfaces:**
- Consumes: `EXAM_AUTHORING_PROVIDER`, `ExamAuthoringProvider`, `GeneratedExam`, `MAX_QUESTIONS_PER_RUN` (Task 2); `collectKnowledge`, `RubricKnowledgeSource`, `KnowledgeSource` (Task 4); `AiUsageEntity` (Task 1)
- Produces: `ExamAuthoringService.generate(teacherId: string, dto: GenerateExamDto): Promise<GeneratedExam>`, `AUTHORING_LANGUAGES`

- [ ] **Step 1: Viết DTO**

```ts
import {
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';
import { MAX_QUESTIONS_PER_RUN } from '../ai-provider/exam-authoring-provider';

/**
 * Ngôn ngữ mở nhưng KHÔNG tự do.
 *
 * Một chuỗi bất kỳ đi thẳng vào prompt là một đường tiêm lệnh, và cũng là
 * cách sinh ra đề bằng ngôn ngữ mà sandbox sau này không chạy được. Danh
 * sách khớp `SANDBOX_LANGUAGES` của nhánh autograder để bước 7 sau này
 * không phải thu hẹp lại.
 */
export const AUTHORING_LANGUAGES = ['python', 'cpp', 'java', 'node'] as const;

export class GenerateExamDto {
  @IsString()
  @Length(10, 2000)
  prompt!: string;

  @IsInt()
  @Min(1)
  @Max(MAX_QUESTIONS_PER_RUN)
  questionCount!: number;

  @IsIn(AUTHORING_LANGUAGES)
  language!: string;

  /**
   * Ba trường của lượt SINH LẠI MỘT CÂU. Vắng ở lượt sinh đầu.
   *
   * `avoid` do FRONTEND điền từ `resemblesKnownProblem` của câu đang bị
   * thay, không phải giảng viên gõ: hệ thống đã biết model tự khai gì, bắt
   * người dùng gõ lại là bắt họ làm việc của máy.
   */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Length(1, 200, { each: true })
  avoid?: string[];

  @IsOptional()
  @IsString()
  @Length(1, 1000)
  refineNote?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Length(1, 4000, { each: true })
  existingStatements?: string[];
}
```

- [ ] **Step 2: Viết service**

```ts
import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiUsageEntity } from './entities/ai-usage.entity';
import { RubricEntity } from '../grading/entities/rubric.entity';
import {
  AuthoringOutcome,
  EXAM_AUTHORING_PROVIDER,
  ExamAuthoringProvider,
  GeneratedExam,
} from './ai-provider/exam-authoring-provider';
import {
  KnowledgeSource,
  RubricKnowledgeSource,
  collectKnowledge,
} from './knowledge/knowledge-source';
import { GenerateExamDto } from './dto/generate-exam.dto';

@Injectable()
export class ExamAuthoringService {
  private readonly logger = new Logger(ExamAuthoringService.name);

  constructor(
    @Inject(EXAM_AUTHORING_PROVIDER) private readonly provider: ExamAuthoringProvider,
    @InjectRepository(RubricEntity) private readonly rubrics: Repository<RubricEntity>,
    @InjectRepository(AiUsageEntity) private readonly usage: Repository<AiUsageEntity>,
  ) {}

  /**
   * Sinh một bộ ba. KHÔNG lưu nội dung ở đâu cả (spec §9) — hàm này trả về
   * rồi quên. Thứ duy nhất ở lại là một dòng `ai_usage`.
   */
  async generate(teacherId: string, dto: GenerateExamDto): Promise<GeneratedExam> {
    const sources: KnowledgeSource[] = [new RubricKnowledgeSource(this.rubrics)];
    const knowledge = await collectKnowledge(sources, teacherId);

    const outcome = await this.provider.generate({
      prompt: dto.prompt,
      knowledge,
      questionCount: dto.questionCount,
      language: dto.language,
      avoid: dto.avoid,
      refineNote: dto.refineNote,
      existingStatements: dto.existingStatements,
    });

    await this.recordUsage(teacherId, outcome);
    return outcome.exam;
  }

  /**
   * Ghi dấu vết vận hành, và cố ý NUỐT lỗi.
   *
   * Giảng viên đã có đề trong tay rồi; làm hỏng lượt soạn đề vì không ghi
   * được một dòng thống kê là đánh đổi sai chiều. Nhưng nó phải KÊU trong
   * log, vì im lặng thì dashboard chi phí thiếu số mà không ai biết vì sao.
   */
  private async recordUsage(teacherId: string, outcome: AuthoringOutcome): Promise<void> {
    try {
      await this.usage.save(
        this.usage.create({
          teacherId,
          feature: 'exam_authoring',
          modelUsed: outcome.usage.modelUsed,
          inputTokens: outcome.usage.inputTokens,
          outputTokens: outcome.usage.outputTokens,
          // `null`, KHÔNG phải 0: chưa có bảng giá cho model này, và ghi 0 sẽ
          // làm tổng chi phí nói dối theo hướng an toàn giả.
          costUsd: null,
          // Lượt SINH LẠI MỘT CÂU ghi một dòng RIÊNG, `question_count: 1`.
          // Nó là một lời gọi model tốn tiền thật; gộp vào lượt gốc thì con
          // số "soạn một đề tốn bao nhiêu" nói dối theo hướng rẻ đi, và đó
          // đúng là con số sẽ đi vào báo cáo đứng cạnh chi phí mỗi bài chấm.
          questionCount: outcome.exam.questions.length,
          verificationStatus: outcome.exam.verification.status,
        }),
      );
    } catch (error) {
      this.logger.error(`không ghi được ai_usage cho giảng viên ${teacherId}: ${String(error)}`);
    }
  }
}
```

- [ ] **Step 3: Viết controller**

```ts
import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { ExamAuthoringService } from './exam-authoring.service';
import { GenerateExamDto } from './dto/generate-exam.dto';
import { GeneratedExam } from './ai-provider/exam-authoring-provider';

@Controller('exam-authoring')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ExamAuthoringController {
  constructor(private readonly authoring: ExamAuthoringService) {}

  /**
   * POST chứ không GET, dù nó không ghi gì vào DB: nó tiêu tiền thật và nhận
   * một prompt dài. Một route tốn tiền nằm sau GET là một route bị prefetch.
   */
  @Post('generate')
  @Roles('teacher')
  generate(@Req() req: Request, @Body() dto: GenerateExamDto): Promise<GeneratedExam> {
    return this.authoring.generate(req.user!.sub, dto);
  }
}
```

- [ ] **Step 4: Viết module — chú ý factory chọn provider**

```ts
import { Logger, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiUsageEntity } from './entities/ai-usage.entity';
import { RubricEntity } from '../grading/entities/rubric.entity';
import { ExamAuthoringService } from './exam-authoring.service';
import { ExamAuthoringController } from './exam-authoring.controller';
import {
  EXAM_AUTHORING_PROVIDER,
  ExamAuthoringProvider,
} from './ai-provider/exam-authoring-provider';
import { ClaudeAuthoringProvider } from './ai-provider/claude-authoring.provider';
import { StubAuthoringProvider } from './ai-provider/stub-authoring.provider';

/**
 * TEST KHÔNG BAO GIỜ ĐƯỢC GỌI API TÍNH TIỀN.
 *
 * Soi gương `selectGradingProvider` (grading.module.ts:125), và cùng cái giá
 * đã trả ở đó: khoá API thật trong `.env` từng làm cả bộ e2e gọi API thật, và
 * nó chỉ lộ ra vì tài khoản chưa có credit. Nếu đã có credit thì test vẫn
 * xanh, chỉ là mỗi lần chạy lại tiêu một ít tiền — đó mới là ca đắt.
 */
export function selectAuthoringProvider(
  claude: ClaudeAuthoringProvider,
  stub: StubAuthoringProvider,
): ExamAuthoringProvider {
  if (process.env.NODE_ENV === 'test') {
    return stub;
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    new Logger('ExamAuthoringModule').warn(
      'Không có ANTHROPIC_API_KEY — soạn đề chạy bằng stub, đề sinh ra là mẫu cố định.',
    );
    return stub;
  }
  return claude;
}

@Module({
  imports: [TypeOrmModule.forFeature([AiUsageEntity, RubricEntity])],
  controllers: [ExamAuthoringController],
  providers: [
    ExamAuthoringService,
    ClaudeAuthoringProvider,
    StubAuthoringProvider,
    {
      provide: EXAM_AUTHORING_PROVIDER,
      useFactory: selectAuthoringProvider,
      inject: [ClaudeAuthoringProvider, StubAuthoringProvider],
    },
  ],
  exports: [ExamAuthoringService],
})
export class ExamAuthoringModule {}
```

Rồi thêm `ExamAuthoringModule` vào mảng `imports` của `apps/api/src/app.module.ts`.

- [ ] **Step 5: Viết e2e**

Dựng khung theo `apps/api/test/exam-session.e2e-spec.ts` (tạo tài khoản qua `createTestAccount`, login lấy token). `NODE_ENV=test` nên provider là stub — không tốn tiền, đầu ra tất định.

```ts
it('teacher sinh được đề, và đề LUÔN unverified', async () => {
  const res = await request(app.getHttpServer())
    .post('/exam-authoring/generate')
    .set('Authorization', `Bearer ${teacherToken}`)
    .send({ prompt: 'sắp xếp và tìm kiếm nhị phân', questionCount: 2, language: 'python' });

  expect(res.status).toBe(201);
  expect(res.body.questions).toHaveLength(2);
  expect(res.body.verification).toEqual({ status: 'unverified', reason: 'sandbox_unavailable' });
});

it('ghi ĐÚNG MỘT dòng ai_usage, và dòng đó KHÔNG chứa nội dung đề', async () => {
  const [{ n: before }] = await dataSource.query(
    `SELECT count(*)::int AS n FROM examcollect.ai_usage WHERE teacher_id = $1`, [teacherId],
  );
  await request(app.getHttpServer())
    .post('/exam-authoring/generate')
    .set('Authorization', `Bearer ${teacherToken}`)
    .send({ prompt: 'cây nhị phân tìm kiếm', questionCount: 1, language: 'python' });

  const rows = await dataSource.query(
    `SELECT * FROM examcollect.ai_usage WHERE teacher_id = $1 ORDER BY created_at DESC`, [teacherId],
  );
  expect(rows.length).toBe(before + 1);
  // Spec §9.1: usage CÓ, content KHÔNG. Kiểm bằng cách so cả hàng với một
  // chuỗi chắc chắn có trong đáp án mẫu của stub.
  expect(JSON.stringify(rows[0])).not.toContain('def solve');
  expect(rows[0].question_count).toBe(1);
});

it('sinh lại một câu ghi một dòng ai_usage RIÊNG với question_count = 1', async () => {
  const [{ n: before }] = await dataSource.query(
    `SELECT count(*)::int AS n FROM examcollect.ai_usage WHERE teacher_id = $1`, [teacherId],
  );
  await request(app.getHttpServer())
    .post('/exam-authoring/generate')
    .set('Authorization', `Bearer ${teacherToken}`)
    .send({
      prompt: 'sắp xếp và tìm kiếm nhị phân',
      questionCount: 1,
      language: 'python',
      avoid: ['tìm kiếm nhị phân tìm biên trái'],
      refineNote: 'đổi sang đếm số lần so sánh',
      existingStatements: ['Sắp xếp mảng tăng dần.'],
    });

  const rows = await dataSource.query(
    `SELECT question_count FROM examcollect.ai_usage WHERE teacher_id = $1 ORDER BY created_at DESC`,
    [teacherId],
  );
  expect(rows.length).toBe(before + 1);
  expect(rows[0].question_count).toBe(1);
});

it('questionCount vượt 10 bị từ chối 400', async () => {
  const res = await request(app.getHttpServer())
    .post('/exam-authoring/generate')
    .set('Authorization', `Bearer ${teacherToken}`)
    .send({ prompt: 'x'.repeat(20), questionCount: 11, language: 'python' });
  expect(res.status).toBe(400);
});

it('ngôn ngữ ngoài danh sách bị từ chối 400', async () => {
  const res = await request(app.getHttpServer())
    .post('/exam-authoring/generate')
    .set('Authorization', `Bearer ${teacherToken}`)
    .send({ prompt: 'x'.repeat(20), questionCount: 1, language: 'brainfuck' });
  expect(res.status).toBe(400);
});

it('admin KHÔNG soạn được đề — 403', async () => {
  const res = await request(app.getHttpServer())
    .post('/exam-authoring/generate')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ prompt: 'x'.repeat(20), questionCount: 1, language: 'python' });
  expect(res.status).toBe(403);
});
```

- [ ] **Step 6: Chạy e2e**

Run: `cd apps/api && pnpm test:e2e -- exam-authoring`
Expected: PASS, 5 test.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/exam-authoring/ apps/api/src/app.module.ts apps/api/test/exam-authoring.e2e-spec.ts
git commit -m "feat(exam-authoring): route generate, ghi usage, stub bắt buộc khi test"
```

---
### Task 6: Xuất HAI file Word

Spec §7. Hai export nằm chung một task vì phép kiểm mạnh nhất — **đề không chứa đáp án** — chỉ viết được khi cả hai đã tồn tại.

**Files:**
- Modify: `apps/api/package.json` (thêm `docx`, và `jszip` vào devDependencies)
- Create: `apps/api/src/exam-authoring/docx/exam-paper.docx.ts`
- Create: `apps/api/src/exam-authoring/docx/answer-key.docx.ts`
- Modify: `apps/api/src/exam-authoring/exam-authoring.controller.ts`
- Modify: `apps/api/src/exam-authoring/dto/generate-exam.dto.ts`
- Test: `apps/api/src/exam-authoring/docx/exam-paper.docx.spec.ts`

**Interfaces:**
- Consumes: `GeneratedExam`, `GeneratedQuestion` (Task 2)
- Produces: `buildExamPaperDocx(exam: GeneratedExam): Promise<Buffer>`, `buildAnswerKeyDocx(exam: GeneratedExam): Promise<Buffer>`, `ExportExamDto`

- [ ] **Step 1: Cài phụ thuộc**

Run: `cd apps/api && pnpm add docx && pnpm add -D jszip`

`docx` chứ không `docxtemplater`: templater cần một file `.docx` mẫu, mà file mẫu thì phải lưu ở đâu đó — mâu thuẫn trực tiếp với "không lưu" của spec §9. `jszip` chỉ dùng trong test, để mở `.docx` (một file zip) ra đọc XML.

- [ ] **Step 2: Viết test TRƯỚC — luật hai file là thứ được kiểm**

```ts
import { buildExamPaperDocx } from './exam-paper.docx';
import { buildAnswerKeyDocx } from './answer-key.docx';
import type { GeneratedExam } from '../ai-provider/exam-authoring-provider';

const SECRET = 'bi_mat_dap_an';

const exam: GeneratedExam = {
  title: 'Giữa kỳ CTDL&GT',
  language: 'python',
  questions: [
    {
      statement: 'Sắp xếp mảng tăng dần.',
      points: 6,
      topic: 'sorting',
      requiredComplexity: 'O(n log n)',
      modelAnswer: `def ${SECRET}(xs):\n    return sorted(xs)\n`,
      testBundle: [{ name: 'co-ban', group: 'co-ban', input: '[2,1]', expectedOutput: '[1,2]' }],
      resemblesKnownProblem: null,
    },
    {
      statement: 'Đếm phần tử khác nhau.',
      points: 4,
      topic: 'hashing',
      requiredComplexity: null,
      modelAnswer: 'def dem(xs):\n    return len(set(xs))\n',
      testBundle: [],
      resemblesKnownProblem: 'two-sum',
    },
  ],
  verification: { status: 'unverified', reason: 'sandbox_unavailable' },
};

/** `.docx` là một file zip — `toString` trên buffer không đọc ra chữ nào.
 *  Giải nén phần XML văn bản để so nội dung THẬT, không so nhị phân. */
async function textOf(buffer: Buffer): Promise<string> {
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(buffer);
  return zip.file('word/document.xml')!.async('string');
}

describe('buildExamPaperDocx', () => {
  it('KHÔNG chứa một ký tự nào của đáp án mẫu', async () => {
    // Test quan trọng nhất của cả task. Một file Word chứa cả đề lẫn đáp án
    // là đúng tai nạn mà `GradingReferenceEntity` viết hoa cảnh báo, chỉ
    // khác là nó xảy ra ở tay giảng viên: họ in ra, hoặc upload nhầm file
    // đó vào `exam_material`.
    const text = await textOf(await buildExamPaperDocx(exam));
    expect(text).not.toContain(SECRET);
    expect(text).not.toContain('sorted(xs)');
  });

  it('có đề, điểm và ràng buộc độ phức tạp', async () => {
    const text = await textOf(await buildExamPaperDocx(exam));
    expect(text).toContain('Sắp xếp mảng tăng dần');
    expect(text).toContain('O(n log n)');
  });

  it('câu có requiredComplexity = null thì dòng đó VẮNG, không in chữ "null"', async () => {
    expect(await textOf(await buildExamPaperDocx(exam))).not.toContain('null');
  });
});

describe('buildAnswerKeyDocx', () => {
  it('chứa đáp án mẫu và ca test', async () => {
    const text = await textOf(await buildAnswerKeyDocx(exam));
    expect(text).toContain(SECRET);
    expect(text).toContain('[1,2]');
  });

  it('nêu bài kinh điển mà model tự khai, kèm cảnh báo đó chỉ là tự khai', async () => {
    const text = await textOf(await buildAnswerKeyDocx(exam));
    expect(text).toContain('two-sum');
    expect(text).toContain('tự khai');
  });

  it('dán nhãn CHƯA KIỂM CHỨNG khi verification là unverified', async () => {
    expect(await textOf(await buildAnswerKeyDocx(exam))).toContain('CHƯA KIỂM CHỨNG');
  });
});
```

- [ ] **Step 3: Chạy để xác nhận ĐỎ**

Run: `cd apps/api && npx jest src/exam-authoring/docx/`
Expected: FAIL — `Cannot find module './exam-paper.docx'`

- [ ] **Step 4: Viết `exam-paper.docx.ts`**

```ts
import { Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx';
import type { GeneratedExam } from '../ai-provider/exam-authoring-provider';

/**
 * `de-thi.docx` — thứ giảng viên in ra và phát.
 *
 * **Không một byte nào của `modelAnswer` được lọt vào đây** (spec §7.1). Hàm
 * này cố ý KHÔNG dùng chung helper render câu với `answer-key.docx.ts`: hai
 * tài liệu chia sẻ code là hai tài liệu có thể vô tình chia sẻ nội dung, và
 * lần refactor "gom cho DRY" sẽ là lần đáp án rò ra.
 */
export async function buildExamPaperDocx(exam: GeneratedExam): Promise<Buffer> {
  const children: Paragraph[] = [
    new Paragraph({ text: exam.title, heading: HeadingLevel.HEADING_1 }),
    new Paragraph({ children: [new TextRun({ text: `Ngôn ngữ: ${exam.language}`, italics: true })] }),
    new Paragraph({ text: '' }),
  ];

  exam.questions.forEach((q, i) => {
    children.push(
      new Paragraph({ children: [new TextRun({ text: `Câu ${i + 1}. (${q.points} điểm)`, bold: true })] }),
    );
    // Giữ xuống dòng của đề: một đề nhiều đoạn bị gộp thành một dòng là đề
    // khó đọc, và giảng viên sẽ phải sửa tay từng câu sau khi xuất.
    for (const line of q.statement.split('\n')) {
      children.push(new Paragraph({ text: line }));
    }
    if (q.requiredComplexity) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: `Yêu cầu độ phức tạp: ${q.requiredComplexity}`, italics: true })],
        }),
      );
    }
    children.push(new Paragraph({ text: '' }));
  });

  return Packer.toBuffer(new Document({ sections: [{ children }] }));
}
```

- [ ] **Step 5: Viết `answer-key.docx.ts`**

```ts
import { Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx';
import type { GeneratedExam } from '../ai-provider/exam-authoring-provider';

/** `dap-an-va-test.docx` — KHÔNG BAO GIỜ phát cho sinh viên. Tách hẳn khỏi
 *  `exam-paper.docx.ts`; xem doc ở file đó. */
export async function buildAnswerKeyDocx(exam: GeneratedExam): Promise<Buffer> {
  const children: Paragraph[] = [
    new Paragraph({ text: `${exam.title} — ĐÁP ÁN`, heading: HeadingLevel.HEADING_1 }),
    new Paragraph({
      children: [new TextRun({ text: 'TÀI LIỆU NỘI BỘ — không phát cho sinh viên.', bold: true })],
    }),
  ];

  if (exam.verification.status === 'unverified') {
    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: 'CHƯA KIỂM CHỨNG — đáp án mẫu chưa được chạy lần nào.', bold: true }),
        ],
      }),
    );
  }
  children.push(new Paragraph({ text: '' }));

  exam.questions.forEach((q, i) => {
    children.push(
      new Paragraph({ children: [new TextRun({ text: `Câu ${i + 1}. (${q.points} điểm)`, bold: true })] }),
    );
    if (q.resemblesKnownProblem) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: `Model tự khai câu này giống bài: ${q.resemblesKnownProblem}. Đây là lời tự khai của chính model đã sinh ra câu hỏi, KHÔNG phải kết quả đối chiếu.`,
              italics: true,
            }),
          ],
        }),
      );
    }
    children.push(new Paragraph({ text: 'Đáp án mẫu:' }));
    for (const line of q.modelAnswer.split('\n')) {
      children.push(new Paragraph({ children: [new TextRun({ text: line, font: 'Consolas' })] }));
    }
    if (q.testBundle.length > 0) {
      children.push(new Paragraph({ text: 'Ca test:' }));
      for (const c of q.testBundle) {
        children.push(
          new Paragraph({ text: `- [${c.group}] ${c.name}: ${c.input} -> ${c.expectedOutput}` }),
        );
      }
    }
    children.push(new Paragraph({ text: '' }));
  });

  return Packer.toBuffer(new Document({ sections: [{ children }] }));
}
```

- [ ] **Step 6: Chạy test — phải XANH**

Run: `cd apps/api && npx jest src/exam-authoring/docx/`
Expected: PASS, 6 test.

- [ ] **Step 7: Thêm `ExportExamDto` và hai route**

Vào `dto/generate-exam.dto.ts`:
```ts
import { IsObject } from 'class-validator';

/**
 * Bộ ba đi NGƯỢC lên từ trình duyệt.
 *
 * Trông lạ, nhưng là hệ quả trực tiếp của "không lưu" (spec §9): server
 * không giữ bản nháp nào, nên lúc xuất file nó phải được đưa lại. Không có
 * `examId` để tra, vì không có bảng nào để tra.
 */
export class ExportExamDto {
  @IsObject()
  exam!: Record<string, unknown>;
}
```

Vào controller (import thêm `Res` từ `@nestjs/common`, `Response` từ `express`, hai hàm `build*Docx`, `ExportExamDto`):
```ts
  @Post('export/paper')
  @Roles('teacher')
  async exportPaper(@Body() dto: ExportExamDto, @Res() res: Response): Promise<void> {
    const buffer = await buildExamPaperDocx(dto.exam as unknown as GeneratedExam);
    // `attachment` và KHÔNG lưu gì: hết request là hết (spec §7).
    res
      .set({
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': 'attachment; filename="de-thi.docx"',
      })
      .send(buffer);
  }

  @Post('export/answer-key')
  @Roles('teacher')
  async exportAnswerKey(@Body() dto: ExportExamDto, @Res() res: Response): Promise<void> {
    const buffer = await buildAnswerKeyDocx(dto.exam as unknown as GeneratedExam);
    res
      .set({
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': 'attachment; filename="dap-an-va-test.docx"',
      })
      .send(buffer);
  }
```

- [ ] **Step 8: Thêm e2e — hai route là HAI route**

Vào `apps/api/test/exam-authoring.e2e-spec.ts`:
```ts
it('đề và đáp án là hai endpoint, hai file — không có đường nào ra file gộp', async () => {
  const { body: exam } = await request(app.getHttpServer())
    .post('/exam-authoring/generate')
    .set('Authorization', `Bearer ${teacherToken}`)
    .send({ prompt: 'sắp xếp mảng số nguyên', questionCount: 1, language: 'python' });

  const paper = await request(app.getHttpServer())
    .post('/exam-authoring/export/paper')
    .set('Authorization', `Bearer ${teacherToken}`).send({ exam });
  expect(paper.status).toBe(201);
  expect(paper.headers['content-disposition']).toContain('de-thi.docx');

  const key = await request(app.getHttpServer())
    .post('/exam-authoring/export/answer-key')
    .set('Authorization', `Bearer ${teacherToken}`).send({ exam });
  expect(key.status).toBe(201);
  expect(key.headers['content-disposition']).toContain('dap-an-va-test.docx');

  // Hai file khác nhau. Nếu ai đó gộp chúng lại thì dòng này đỏ.
  expect(Buffer.from(paper.body).length).not.toBe(Buffer.from(key.body).length);
});
```

- [ ] **Step 9: Chạy e2e + commit**

Run: `cd apps/api && pnpm test:e2e -- exam-authoring`
Expected: PASS.

```bash
git add apps/api/package.json apps/api/src/exam-authoring/ apps/api/test/exam-authoring.e2e-spec.ts ../../pnpm-lock.yaml
git commit -m "feat(exam-authoring): xuất hai file Word tách rời, đề không chứa đáp án"
```

---
### Task 7: Bản nháp `localStorage` + API client + hook

Spec §9. Không bảng nào lưu đề, nên bản nháp sống ở trình duyệt và **tự xoá sau 24 giờ**.

**Files:**
- Create: `apps/web/src/lib/exam-draft.ts`
- Create: `apps/web/src/lib/exam-draft.test.ts`
- Create: `apps/web/src/lib/api/exam-authoring.ts`
- Create: `apps/web/src/hooks/useExamAuthoring.ts`

**Interfaces:**
- Produces: `saveDraft(exam)`, `loadDraft(): GeneratedExam | null`, `clearDraft()`, `DRAFT_TTL_MS`; `generateExam(input)`, `downloadExamPaper(exam)`, `downloadAnswerKey(exam)`; `useGenerateExam()`

- [ ] **Step 1: Viết test cho nháp TRƯỚC**

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DRAFT_TTL_MS, clearDraft, loadDraft, saveDraft } from './exam-draft';

const exam = {
  title: 'Đề thử', language: 'python', questions: [],
  verification: { status: 'unverified' as const, reason: 'sandbox_unavailable' as const },
};

beforeEach(() => { window.localStorage.clear(); vi.useRealTimers(); });

describe('exam-draft', () => {
  it('lưu rồi đọc lại ra đúng bộ ba', () => {
    saveDraft(exam);
    expect(loadDraft()).toEqual(exam);
  });

  it('chưa có nháp thì trả null, không ném', () => {
    expect(loadDraft()).toBeNull();
  });

  it('nháp quá 24 giờ TỰ XOÁ', () => {
    // Máy phòng máy là máy DÙNG CHUNG. Một đề chưa thi nằm mãi trong
    // localStorage của một máy mà sinh viên cũng ngồi là đường rò thật.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-21T08:00:00Z'));
    saveDraft(exam);
    vi.setSystemTime(new Date('2026-09-22T08:00:01Z'));
    expect(loadDraft()).toBeNull();
    expect(window.localStorage.length).toBe(0);
  });

  it('nháp 23 giờ 59 phút vẫn còn', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-21T08:00:00Z'));
    saveDraft(exam);
    vi.setSystemTime(new Date('2026-09-21T08:00:00Z').getTime() + DRAFT_TTL_MS - 1000);
    expect(loadDraft()).toEqual(exam);
  });

  it('dữ liệu hỏng trong localStorage trả null và tự dọn', () => {
    window.localStorage.setItem('examcollect:exam-draft', '{ hong');
    expect(loadDraft()).toBeNull();
    expect(window.localStorage.getItem('examcollect:exam-draft')).toBeNull();
  });

  it('clearDraft xoá thật', () => {
    saveDraft(exam);
    clearDraft();
    expect(loadDraft()).toBeNull();
  });
});
```

- [ ] **Step 2: Chạy để xác nhận ĐỎ**

Run: `cd apps/web && npx vitest run src/lib/exam-draft.test.ts`
Expected: FAIL — không import được `./exam-draft`.

- [ ] **Step 3: Viết `exam-draft.ts`**

```ts
import type { GeneratedExam } from '@/lib/api/exam-authoring';

const KEY = 'examcollect:exam-draft';

/**
 * 24 giờ. Máy phòng máy là máy DÙNG CHUNG (spec §9): một bản nháp đề chưa
 * thi nằm mãi trong `localStorage` của một máy mà sinh viên cũng ngồi là một
 * đường rò thật, không phải rủi ro lý thuyết.
 */
export const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;

interface StoredDraft {
  savedAt: number;
  exam: GeneratedExam;
}

export function saveDraft(exam: GeneratedExam): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ savedAt: Date.now(), exam }));
  } catch {
    // Chế độ riêng tư, hoặc site data bị chặn. Mất nháp thì khó chịu; làm
    // hỏng cả màn hình soạn đề vì không ghi được thì tệ hơn nhiều.
  }
}

/** `null` = không có nháp, nháp hỏng, hoặc nháp quá hạn. Cả ba trường hợp
 *  đều dọn sạch chỗ, để lần sau không phải xử lý lại cùng một rác. */
export function loadDraft(): GeneratedExam | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredDraft;
    if (typeof parsed?.savedAt !== 'number' || !parsed.exam) {
      clearDraft();
      return null;
    }
    if (Date.now() - parsed.savedAt >= DRAFT_TTL_MS) {
      clearDraft();
      return null;
    }
    return parsed.exam;
  } catch {
    clearDraft();
    return null;
  }
}

export function clearDraft(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // Xem `saveDraft`.
  }
}
```

- [ ] **Step 4: Chạy test — phải XANH**

Run: `cd apps/web && npx vitest run src/lib/exam-draft.test.ts`
Expected: PASS, 6 test.

- [ ] **Step 5: Viết API client `apps/web/src/lib/api/exam-authoring.ts`**

Mirror kiểu của backend (hand-written, cùng khuôn với `lib/api/exam-session.ts`).

```ts
import { apiClient } from '@/lib/api-client';

export interface TestCase { name: string; group: string; input: string; expectedOutput: string }
export interface GeneratedQuestion {
  statement: string; points: number; topic: string;
  requiredComplexity: string | null; modelAnswer: string;
  testBundle: TestCase[]; resemblesKnownProblem: string | null;
}
export type Verification =
  | { status: 'unverified'; reason: 'sandbox_unavailable' }
  | { status: 'passed'; ranAt: string; complexityMeasured: string | null }
  | { status: 'failed'; failures: string[]; repairAttempts: number };
export interface GeneratedExam {
  title: string; language: string;
  questions: GeneratedQuestion[]; verification: Verification;
}

export interface GenerateExamInput {
  prompt: string; questionCount: number; language: string;
}

export async function generateExam(body: GenerateExamInput): Promise<GeneratedExam> {
  const { data, error, response } = await apiClient.POST('/exam-authoring/generate', { body });
  if (error || !response.ok) {
    throw error ?? new Error(`Yêu cầu thất bại (HTTP ${response.status})`);
  }
  return data as unknown as GeneratedExam;
}

/**
 * Tải file về máy. KHÔNG dùng `apiClient`: openapi-fetch đọc body thành JSON,
 * còn đây là nhị phân. `fetch` thẳng rồi tạo blob URL.
 *
 * Trình duyệt giữ bytes này lại — Task 9 sẽ dùng chính chúng để PUT lên
 * presigned URL nếu giảng viên gắn đề vào phiên thi (Security rule 5: file
 * không đi xuyên NestJS).
 */
async function download(path: string, exam: GeneratedExam, filename: string): Promise<Blob> {
  const res = await fetch(`/api${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ exam }),
  });
  if (!res.ok) throw new Error(`Không xuất được file (HTTP ${res.status})`);
  const blob = await res.blob();

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  return blob;
}

export function downloadExamPaper(exam: GeneratedExam): Promise<Blob> {
  return download('/exam-authoring/export/paper', exam, 'de-thi.docx');
}

export function downloadAnswerKey(exam: GeneratedExam): Promise<Blob> {
  return download('/exam-authoring/export/answer-key', exam, 'dap-an-va-test.docx');
}
```

**Kiểm đường `/api` prefix:** mở `apps/web/src/lib/api-client.ts` xem `baseUrl` là gì rồi dùng đúng nó trong `download()`. Nếu client cấu hình `baseUrl` khác `/api`, sửa lại cho khớp — sai chỗ này thì 404 và trông như route chưa tồn tại.

- [ ] **Step 6: Viết hook**

```ts
'use client';

import { useMutation } from '@tanstack/react-query';
import { generateExam, type GeneratedExam, type GenerateExamInput } from '@/lib/api/exam-authoring';

/**
 * Soạn đề là MUTATION, không phải query: nó tiêu tiền và không idempotent.
 * Một `useQuery` sẽ tự refetch khi cửa sổ lấy lại focus, và mỗi lần như vậy
 * là một lần trả tiền cho một đề khác hẳn đề đang hiện trên màn hình.
 */
export function useGenerateExam() {
  return useMutation<GeneratedExam, Error, GenerateExamInput>({ mutationFn: generateExam });
}
```

- [ ] **Step 7: Regenerate OpenAPI client**

Route mới nên `apiClient.POST('/exam-authoring/generate', ...)` sẽ đỏ cho tới khi regenerate. Theo đúng quy trình đã biết:
```bash
cd apps/api && pnpm build
node -r dotenv/config dist/src/main.js &
# đợi tới khi curl -s -o /dev/null -w '%{http_code}' http://localhost:4000/api-docs-json trả 200
cd ../../packages/shared && pnpm generate:api-client
# rồi tắt server: netstat -ano | grep ':4000' | grep LISTENING  -> taskkill //F //PID <pid>
```
Xác nhận: `grep -n "exam-authoring" packages/shared/src/api/schema.d.ts` phải có kết quả.

- [ ] **Step 8: Typecheck + commit**

Run: `cd apps/web && npx tsc --noEmit -p tsconfig.json`
```bash
git add apps/web/src/lib/exam-draft.ts apps/web/src/lib/exam-draft.test.ts apps/web/src/lib/api/exam-authoring.ts apps/web/src/hooks/useExamAuthoring.ts packages/shared/src/api/schema.d.ts
git commit -m "feat(exam-authoring): nháp localStorage hạn 24h, API client, hook"
```

---
### Task 8: Màn hình soạn đề

Spec §4 (băng CHƯA KIỂM CHỨNG không tắt được), §9 (nút xoá nháp).

**Files:**
- Create: `apps/web/src/app/teacher/exam-authoring/page.tsx`
- Create: `apps/web/src/app/teacher/exam-authoring/_components/question-card.tsx`
- Create: `apps/web/src/app/teacher/exam-authoring/page.test.tsx`
- Modify: điều hướng của giảng viên — tìm bằng `grep -rn "teacher/exam-sessions" apps/web/src/components` rồi thêm mục "Soạn đề" cùng chỗ.

**Interfaces:**
- Consumes: `useGenerateExam` (Task 7), `loadDraft`/`saveDraft`/`clearDraft` (Task 7), `downloadExamPaper`/`downloadAnswerKey` (Task 7)

- [ ] **Step 1: Viết test TRƯỚC (mock hook, cùng khuôn `exam-sessions/page.test.tsx`)**

```ts
const useGenerateExamMock = vi.fn();
vi.mock('@/hooks/useExamAuthoring', () => ({
  useGenerateExam: () => useGenerateExamMock(),
}));
const downloadExamPaperMock = vi.fn();
const downloadAnswerKeyMock = vi.fn();
vi.mock('@/lib/api/exam-authoring', () => ({
  downloadExamPaper: (...a: unknown[]) => downloadExamPaperMock(...a),
  downloadAnswerKey: (...a: unknown[]) => downloadAnswerKeyMock(...a),
}));

const exam = {
  title: 'Giữa kỳ CTDL&GT',
  language: 'python',
  questions: [{
    statement: 'Sắp xếp mảng', points: 10, topic: 'sorting',
    requiredComplexity: 'O(n log n)',
    modelAnswer: 'def solve(xs):\n    return sorted(xs)\n',
    testBundle: [], resemblesKnownProblem: 'Kadane',
  }],
  verification: { status: 'unverified', reason: 'sandbox_unavailable' },
};

beforeEach(() => {
  window.localStorage.clear();
  useGenerateExamMock.mockReset();
  useGenerateExamMock.mockReturnValue({ mutate: vi.fn(), isPending: false, data: exam, error: null });
});

it('hiện băng CHƯA KIỂM CHỨNG và KHÔNG có cách nào tắt nó', () => {
  render(<ExamAuthoringPage />);
  const banner = screen.getByRole('status', { name: /chưa kiểm chứng/i });
  expect(banner).toBeInTheDocument();
  // Không có nút đóng: spec §4 nói nhãn này không tắt được. Một cảnh báo tắt
  // được là một cảnh báo sẽ bị tắt, và bên dưới nó là đáp án chưa ai chạy.
  expect(within(banner).queryByRole('button')).toBeNull();
});

it('nêu bài kinh điển mà model tự khai, kèm chữ "tự khai"', () => {
  render(<ExamAuthoringPage />);
  expect(screen.getByText(/Kadane/)).toBeInTheDocument();
  expect(screen.getByText(/tự khai/i)).toBeInTheDocument();
});

it('gập một câu thì chip trạng thái vẫn hiện — gập không giấu được cảnh báo', () => {
  render(<ExamAuthoringPage />);
  fireEvent.click(screen.getByRole('button', { name: /gập lại câu 1/i }));
  expect(screen.getByLabelText(/đề bài câu 1/i)).not.toBeVisible();
  // Chip "Cần bạn quyết" của câu có cảnh báo phải sống sót qua lượt gập.
  expect(screen.getByText(/cần bạn quyết/i)).toBeVisible();
});

it('nút sinh lại bị khoá tới khi có ghi chú đổi gì', () => {
  render(<ExamAuthoringPage />);
  fireEvent.click(screen.getByRole('button', { name: /sinh lại riêng câu này/i }));
  const go = screen.getByRole('button', { name: /^sinh lại câu/i });
  expect(go).toBeDisabled();

  fireEvent.change(screen.getByLabelText(/cần đổi gì/i), {
    target: { value: 'đổi sang đếm số lần so sánh' },
  });
  expect(go).toBeEnabled();
});

it('sinh lại gửi kèm bài phải tránh và các câu đang giữ', () => {
  const mutate = vi.fn();
  useGenerateExamMock.mockReturnValue({ mutate, isPending: false, data: exam, error: null });
  render(<ExamAuthoringPage />);
  fireEvent.click(screen.getByRole('button', { name: /sinh lại riêng câu này/i }));
  fireEvent.change(screen.getByLabelText(/cần đổi gì/i), { target: { value: 'khó hơn' } });
  fireEvent.click(screen.getByRole('button', { name: /^sinh lại câu/i }));

  expect(mutate).toHaveBeenCalledWith(
    expect.objectContaining({
      questionCount: 1,
      avoid: ['Kadane'],
      refineNote: 'khó hơn',
    }),
  );
});

it('hai nút xuất file là HAI nút riêng biệt', () => {
  render(<ExamAuthoringPage />);
  fireEvent.click(screen.getByRole('button', { name: /xuất đề/i }));
  expect(downloadExamPaperMock).toHaveBeenCalledTimes(1);
  expect(downloadAnswerKeyMock).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole('button', { name: /xuất đáp án/i }));
  expect(downloadAnswerKeyMock).toHaveBeenCalledTimes(1);
});

it('có nút xoá nháp, và bấm là localStorage sạch', () => {
  render(<ExamAuthoringPage />);
  fireEvent.click(screen.getByRole('button', { name: /xoá bản nháp/i }));
  expect(window.localStorage.length).toBe(0);
});

it('sửa đề trong ô textarea thì bộ ba gửi đi lúc xuất mang bản ĐÃ SỬA', () => {
  render(<ExamAuthoringPage />);
  fireEvent.change(screen.getByLabelText(/đề bài câu 1/i), {
    target: { value: 'Đề đã sửa tay' },
  });
  fireEvent.click(screen.getByRole('button', { name: /xuất đề/i }));
  expect(downloadExamPaperMock.mock.calls[0][0].questions[0].statement).toBe('Đề đã sửa tay');
});
```

- [ ] **Step 2: Chạy để xác nhận ĐỎ**

Run: `cd apps/web && npx vitest run src/app/teacher/exam-authoring/page.test.tsx`
Expected: FAIL — không import được `./page`.

- [ ] **Step 3: Dựng trang**

Yêu cầu bắt buộc của màn hình (mỗi gạch đầu dòng là một thứ test ở trên đang kiểm):

- Form: `<textarea>` prompt (label "Yêu cầu của bạn"), `<input type=number>` số câu (1–10), `<select>` ngôn ngữ (python/cpp/java/node), nút "Sinh đề".
- Khi `isPending`: nút disabled + `<Skeleton>` theo khuôn layout, KHÔNG phải spinner.
- Băng cảnh báo: `role="status"`, `aria-label="Chưa kiểm chứng"`, nền `bg-warning-subtle`, chữ `text-warning-strong`, **không có nút đóng**. Nội dung: *"CHƯA KIỂM CHỨNG — đáp án mẫu chưa được chạy lần nào. Sandbox chưa có, nên hệ thống không biết mã này có biên dịch được không."*
- Mỗi câu là một thẻ **gập được**: nút `aria-expanded` ở góc phải, nội dung trong một vùng `id` mà nút `aria-controls` trỏ tới. Khi gập, thẻ còn một dải: số câu, các chip, dòng đầu của đề (cắt bằng ellipsis), và **chip trạng thái vẫn ở nguyên đó** — gập không được phép giấu một cảnh báo, nếu không thì "đọc xong rồi gập" thành cách bỏ qua đúng thứ cần quyết.
- Thẻ mở gồm: `<textarea>` đề (label `Đề bài câu {i}`), `<textarea>` đáp án mẫu, bảng ca test.
- **Hộp bài kinh điển** (khi `resemblesKnownProblem !== null`): nêu **hai hệ quả** — sinh viên tra được (phòng thi không chặn Internet, `CLAUDE.md` chốt vậy có chủ ý), và nhiều bài sẽ giống nhau vì cùng chép một nguồn nên phép so chéo khi chấm sẽ báo nghi vấn hàng loạt sai. Kèm dòng nói rõ đây là **lời tự khai**, hệ thống không có mạng để đối chiếu.
- **Panel sinh lại một câu**, mở ra từ hộp trên: `<textarea>` "Cần đổi gì ở câu này?", 4 chip gợi ý nhanh điền sẵn vào ô đó, một khối chỉ rõ **hệ thống tự thêm gì** (câu `avoid` lấy từ `resemblesKnownProblem`, và tóm tắt các câu đang giữ), rồi ba nút: "Sinh lại câu {i}" / "Huỷ" / "Giữ nguyên — đề này ra mức cơ bản".
  - Bấm "Sinh lại câu {i}" gọi `generateExam` với `questionCount: 1`, `avoid: [câu.resemblesKnownProblem]`, `refineNote` = nội dung ô, `existingStatements` = đề của các câu còn lại; kết quả **thay đúng câu đó**, không đụng các câu khác.
  - Nút "Sinh lại" **disabled khi ô ghi chú rỗng**, kèm dòng phụ giải thích: sinh lại mà không nói đổi gì thì model ra lại đúng loại đề cũ. Đây là ràng buộc sản phẩm, không phải làm khó người dùng.
- Sửa ô nào thì cập nhật state `exam` và gọi `saveDraft(exam)` — nháp theo kịp từng lần gõ.
- `useEffect` lúc mount: `loadDraft()`, có thì đổ vào state.
- Ba nút: "Xuất đề (Word)", "Xuất đáp án + test (Word)", "Xoá bản nháp".
- Trang là `'use client'`, đặt tại `/teacher/exam-authoring`.

Màu và token: dùng đúng biến của `globals.css` (`warning-subtle`/`warning-strong`, `surface`, `border`, `muted-foreground`) — **không** hardcode hex.

- [ ] **Step 4: Chạy test — phải XANH**

Run: `cd apps/web && npx vitest run src/app/teacher/exam-authoring/page.test.tsx`
Expected: PASS, 5 test.

- [ ] **Step 5: Lint + build**

Run: `cd apps/web && pnpm lint && cd ../.. && pnpm --filter web build`
Expected: 0 lỗi lint; build xanh.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/teacher/exam-authoring/ apps/web/src/components
git commit -m "feat(exam-authoring): màn hình soạn đề, băng CHƯA KIỂM CHỨNG không tắt được"
```

---
### Task 9: Gắn vào phiên thi

Spec §8 và **§4.1 (bẫy nghiêm trọng nhất của cả spec)**.

**Phạm vi:** chỉ **đề + đáp án mẫu**. Gói test bị hoãn — bảng `grading_test_bundle` có trong DB dev nhưng entity nằm ở nhánh chưa merge `feature/code-autograder-plan-1`; viết lại ở đây sẽ đụng nó lúc merge.

**Files:**
- Modify: `apps/api/src/grading/entities/grading-reference.entity.ts` (thêm cột cờ)
- Create: `apps/api/src/database/migrations/1789370000000-AddModelAnswerUnverified.ts`
- Modify: `apps/api/src/grading/grading-reference.service.ts` (nhận cờ)
- Create: `apps/web/src/app/teacher/exam-authoring/_components/attach-dialog.tsx`
- Test: `apps/api/test/exam-authoring.e2e-spec.ts`

**Interfaces:**
- Consumes: `downloadExamPaper`/`downloadAnswerKey` trả `Blob` (Task 7)
- Produces: cột `grading_reference.model_answer_unverified` (boolean, default false)

- [ ] **Step 1: Migration thêm cột cờ**

```ts
/**
 * Bộ ba chưa kiểm chứng gắn vào phiên thi thì phiên đó phải MANG DẤU.
 *
 * Spec §4.1: spec chấm dựng TOÀN BỘ cơ chế rút chuẩn trên đáp án mẫu ("bài
 * sinh viên lệch khỏi chuẩn nào thì đó là một lỗi ứng viên"). Một đáp án mẫu
 * không biên dịch nổi đi vào đây thì chuẩn đó là rác, và mọi bài của phiên
 * bị đo bằng một cái thước bịa — hỏng IM LẶNG, vì bài nào cũng "lệch chuẩn"
 * nên không có tín hiệu nào nói vấn đề nằm ở cái thước.
 */
await queryRunner.query(`
  ALTER TABLE "examcollect"."grading_reference"
    ADD COLUMN "model_answer_unverified" boolean NOT NULL DEFAULT false
`);
```
`down`: `DROP COLUMN "model_answer_unverified"`.

Thêm vào entity:
```ts
  /** `true` = đáp án mẫu đến từ agent soạn đề và CHƯA từng được chạy. Màn
   *  chấm điểm đọc cờ này và cảnh báo trên mọi bài của phiên (spec §4.1). */
  @Column({ name: 'model_answer_unverified', type: 'boolean', default: false })
  modelAnswerUnverified!: boolean;
```

- [ ] **Step 2: Chạy migration**

Run: `cd apps/api && pnpm migration:run`
Expected: `executed successfully`.

- [ ] **Step 3: Viết e2e cho ba lớp chặn TRƯỚC khi sửa service**

```ts
it('gắn đáp án CHƯA KIỂM CHỨNG thì phải ghi cờ model_answer_unverified', async () => {
  // Endpoint gắn đáp án mẫu đã có sẵn ở GradingReferenceService; chỗ mới là
  // tham số cờ. Tìm tên route bằng:
  //   grep -n "grading-reference\|model-answer" apps/api/src/grading/grading.controller.ts
  const res = await request(app.getHttpServer())
    .post(`/exam-sessions/${sessionId}/grading-reference/model-answer/confirm`)
    .set('Authorization', `Bearer ${teacherToken}`)
    .send({ filename: 'dap-an.docx', unverified: true });
  expect(res.status).toBeLessThan(400);

  const [row] = await dataSource.query(
    `SELECT model_answer_unverified FROM examcollect.grading_reference WHERE exam_session_id = $1`,
    [sessionId],
  );
  expect(row.model_answer_unverified).toBe(true);
});

it('phiên ĐÃ CÓ kết quả chấm thì từ chối ghi đè reference', async () => {
  // `uq_grading_reference_session` cho một phiên một bản, và bản ấy đóng
  // băng khi đã chấm: 20 bài đầu chấm có đáp án mẫu, 20 bài sau chấm với
  // đáp án đã sửa, là hai kỳ thi khác nhau đội lốt một.
  await dataSource.query(
    `INSERT INTO examcollect.grading_result (submission_id, status) VALUES ($1, 'ai_graded')`,
    [submissionId],
  );
  const res = await request(app.getHttpServer())
    .post(`/exam-sessions/${sessionId}/grading-reference/model-answer/confirm`)
    .set('Authorization', `Bearer ${teacherToken}`)
    .send({ filename: 'dap-an-moi.docx', unverified: true });
  expect(res.status).toBe(409);
});
```

Chạy: `cd apps/api && pnpm test:e2e -- exam-authoring` → ĐỎ.

- [ ] **Step 4: Sửa `GradingReferenceService` nhận cờ `unverified`**

Thêm tham số `unverified: boolean` vào hàm xác nhận upload đáp án mẫu, ghi vào cột mới. Giữ nguyên mọi kiểm tra quyền sở hữu và luật đóng băng đang có — **không** nới lỏng cái nào.

- [ ] **Step 5: Chạy e2e — phải XANH**

Run: `cd apps/api && pnpm test:e2e -- exam-authoring`

- [ ] **Step 6a: Modal CHỌN PHIÊN THI**

Create `apps/web/src/app/teacher/exam-authoring/_components/session-picker.tsx`.

Danh sách phiên đọc bằng `useExamSessions` đã có (không thêm hook mới), lọc ở client xuống **`draft` + `scheduled`**.

> **`active` bị chặn, và đây là quyết định chứ không phải thiếu sót.** Security rule 2 phát tài liệu cho agent ngay khi qua `start_time`. Gắn thêm đề vào phiên đang thi nghĩa là một nửa phòng nhận đề A, nửa kia nhận A+B. Phiên `active` vẫn **hiện** trong danh sách nhưng xám mờ, `disabled`, kèm lý do ngay trên dòng — ẩn hẳn sẽ làm giảng viên tưởng hệ thống quên mất phiên của họ.

Mỗi dòng: radio, tên phiên, chip trạng thái, và dòng phụ `ngày · giờ · phòng · lớp`. Phiên `draft` chưa có giờ/phòng thì dòng phụ nói thẳng "Chưa chốt giờ · chưa chọn phòng".

Cuối modal, trước nút: một dòng nói **bước tiếp theo là phòng chờ** — "Sau khi xác nhận, bạn sẽ được đưa tới phòng chờ của phiên để kiểm lại tài liệu. Việc gắn chỉ hoàn tất khi bạn xác nhận ở đó."

Test:
```ts
it('chỉ chọn được phiên draft và scheduled; phiên đang diễn ra bị khoá', () => {
  render(<SessionPicker sessions={[draft, scheduled, active]} onPick={vi.fn()} />);
  expect(screen.getByRole('radio', { name: /nháp/i })).toBeEnabled();
  expect(screen.getByRole('radio', { name: /đã lên lịch/i })).toBeEnabled();
  const running = screen.getByRole('radio', { name: /đang diễn ra/i });
  expect(running).toBeDisabled();
  // Vẫn HIỆN, kèm lý do: ẩn đi thì giảng viên tưởng hệ thống quên phiên của họ.
  expect(screen.getByText(/đã phát tài liệu cho sinh viên/i)).toBeInTheDocument();
});
```

- [ ] **Step 6b: Hộp thoại cảnh báo ở frontend**

Trong `attach-dialog.tsx`, khi `exam.verification.status !== 'passed'`:

- Tiêu đề: **"Đáp án mẫu này chưa từng được chạy"**
- Thân, nêu ĐÚNG hậu quả chứ không phải "bạn có chắc không?":
  *"Hệ thống chấm điểm lấy đáp án mẫu làm chuẩn để so mọi bài nộp. Nếu đáp án này sai hoặc không biên dịch được, cả phiên thi sẽ bị đo bằng một cái thước sai — và mọi bài đều sẽ trông như có lỗi, nên sẽ không có dấu hiệu nào cho thấy vấn đề nằm ở cái thước."*
- Hai nút: "Huỷ" (mặc định focus, kiểu nút chính) và "Vẫn gắn — tới phòng chờ" (kiểu nút phụ, chữ đỏ).
- Sau khi gắn xong: `router.push('/exam-sessions/' + sessionId)` — giảng viên kiểm lại tài liệu ở phòng chờ. Việc gắn **không** được coi là xong cho tới lúc đó.

Luồng gắn, đúng Security rule 5 — **server không cầm file**:
1. `downloadExamPaper(exam)` / `downloadAnswerKey(exam)` trả `Blob` (Task 7 đã trả sẵn).
2. Xin presigned URL: đề qua route upload-url của `exam_material`; đáp án qua route upload-url của `grading-reference`.
3. **Trình duyệt** `fetch(uploadUrl, { method: 'PUT', body: blob })`.
4. Gọi route confirm tương ứng, kèm `unverified: exam.verification.status !== 'passed'`.

Tên chính xác của 4 route: `grep -n "upload-url\|materials" apps/api/src/exam-session/exam-session.controller.ts apps/api/src/grading/grading.controller.ts`.

- [ ] **Step 7: Test frontend cho hộp thoại**

```ts
it('bộ ba unverified thì KHÔNG gắn được nếu chưa qua hộp thoại xác nhận', () => {
  render(<AttachDialog exam={exam} sessionId="s1" />);
  fireEvent.click(screen.getByRole('button', { name: /gắn vào phiên thi/i }));
  expect(screen.getByText(/chưa từng được chạy/i)).toBeInTheDocument();
  expect(attachMock).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole('button', { name: /vẫn gắn/i }));
  expect(attachMock).toHaveBeenCalledWith(expect.objectContaining({ unverified: true }));
});
```

- [ ] **Step 8: Toàn bộ cổng kiểm**

```bash
cd apps/api && pnpm test && pnpm test:e2e -- exam-authoring
cd ../web && pnpm test && pnpm lint
cd ../.. && pnpm --filter web build
```

- [ ] **Step 9: Commit**

```bash
git add apps/api/src apps/api/test apps/web/src
git commit -m "feat(exam-authoring): gắn đề + đáp án vào phiên thi, cờ chưa-kiểm-chứng đi theo"
```

---

## Self-Review

**Phủ spec:** §1 Task 5 (DTO khoá ngôn ngữ/số câu) · §2 Task 4 · §2.1 Task 3 · §3 Task 2 · §4 Task 2+3 (luôn `unverified`) · §4.1 Task 9 (ba lớp chặn) · §5 Task 2+5 · §5.2 Task 2 (`MAX_QUESTIONS_PER_RUN`) · §6 Task 3 (`resemblesKnownProblem`) + Task 8 (hiện ra) · §7 Task 6 · §7.1 Task 6 (T-DOC-1/2) · §7.2 Task 6 · §8 Task 9 · §9 Task 7 (nháp 24h) · §9.1 Task 1+5.

**Chỗ spec có mà plan KHÔNG làm, và lý do:** §5.1 ba công cụ + §6 file 50 bài kinh điển đóng gói sẵn — cả hai thuộc bước 7 (kiểm chứng), chờ sandbox. §2 nguồn bảng lỗi — chờ spec chấm §2.1. Gắn gói test vào phiên — chờ entity ở nhánh autograder.

**Nhất quán kiểu:** `GeneratedExam`/`GeneratedQuestion`/`TestCase`/`Verification` khai một lần ở Task 2, mọi task sau import từ đó. Phía web khai lại thủ công ở Task 7 (cùng khuôn `lib/api/exam-session.ts`), và `apiClient.POST` vẫn kiểm cấu trúc với schema sinh ra nên lệch vẫn là lỗi biên dịch.

**Rủi ro lịch trình:** Task 9 phụ thuộc hình dạng thật của `GradingReferenceService` và tên 4 route — plan đã ghi sẵn lệnh `grep` để tra thay vì đoán tên.
