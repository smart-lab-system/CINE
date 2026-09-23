# Kiểm nội dung file nén nộp bài — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cho giảng viên khai, tuỳ chọn, những file phải nằm bên trong một deliverable `.zip`/`.rar`, và để server đối chiếu sau khi thu bài.

**Architecture:** Khai báo vào bảng con `required_deliverable_entry`. Lúc `submission:confirm`, server render danh sách kỳ vọng theo từng sinh viên rồi **chụp** vào `submission.archive_expected_entries`, đặt `archive_check_status = 'pending'`, commit, rồi mới đẩy một job BullMQ. Job tải object về, nhận dạng định dạng bằng magic bytes, **liệt kê entry mà không giải nén**, đối chiếu theo tên file (kệ thư mục, không phân biệt hoa thường), ghi kết quả. Kết quả là **dữ liệu**, không phải trạng thái — `submission.status` giữ nguyên `collected`.

**Tech Stack:** NestJS 10 · TypeORM 0.3 · PostgreSQL 17 (Supabase) · BullMQ · `yauzl` (đọc zip theo dòng) · `node-unrar-js` (WASM) · Next.js 15 + Zod (web) · Jest (api) · Vitest (web)

**Spec:** `docs/superpowers/specs/2026-09-21-archive-content-validation-design.md` — plan này lập luận từ spec đó; đọc cả hai.

---

## Global Constraints

Mọi task đều ngầm chịu các ràng buộc sau. Giá trị chép nguyên từ spec.

- **KHÔNG BAO GIỜ giải nén.** Chỉ đọc danh sách entry. Đây là thứ làm zip bomb vô hại (spec §6.2).
- **Trần kích thước đọc từ `HeadObjectCommand` → `ContentLength`, KHÔNG từ `submission.file_size`.** `file_size` do agent khai trong payload `submission:confirm` (spec §10.2). Đây là ràng buộc bảo mật, không phải sở thích.
- `ARCHIVE_CHECK_MAX_BYTES = 200 * 1024 * 1024` và `ARCHIVE_CHECK_CONCURRENCY = 2` — **hai con số đọc cùng nhau**, trần bộ nhớ ~800MB (RAR nhân đôi vì WASM heap). Khai cạnh nhau, cùng một comment (spec §6.2.1).
- `ARCHIVE_MAX_ENTRIES = 20_000` — **dừng đọc ngay tại ngưỡng**, không đọc hết rồi mới đếm (spec §6.2).
- Trần **20 entry khai báo** mỗi deliverable, kiểm ở DTO (spec §8.4). Khác hẳn con số trên.
- `entry_name` chịu **`FILENAME_TEMPLATE_REGEX`** — import từ `apps/api/src/exam-session/filename-template.ts`, không khai lại. Ký tự `/` bị cấm.
- Đối chiếu **không phân biệt hoa thường**, so theo phần sau dấu `/` cuối cùng (spec §6.3).
- **Enqueue SAU commit**, không nằm trong giao dịch (spec §5.3.1).
- `migrationsTransactionMode: 'none'` trong `data-source.ts` — migration tự mở giao dịch nếu cần.
- **Không đụng `validate_submission_lifecycle`.** `submission.status` không đổi (spec §4.3).
- **Đổi bề mặt API thì phải regenerate client**, nếu không `pnpm --filter web build` fail:
  ```bash
  pnpm --filter api dev                              # cửa sổ 1, chờ nó lên
  pnpm --filter @cine/shared generate:api-client     # cửa sổ 2
  ```
  Script đọc `http://localhost:4000/api-docs-json` và ghi `packages/shared/src/api/schema.d.ts`. Áp dụng cho Task 5 và Task 8.
- **Trước khi chạy e2e:** Postgres + MinIO phải chạy **và** bucket `examcollect-submissions` phải tồn tại (thiếu bucket cho ra lỗi trông như bug nghiệp vụ). Và `taskkill` mọi tiến trình jest/nest mồ côi — worker cũ còn sống sẽ ăn job BullMQ từ Redis và làm hỏng kết quả.
- **`apps/api/.env` đang trỏ Supabase PROD.** Trước mọi lệnh migration/test, đổi sang dòng Docker local đang bị comment, hoặc override `DATABASE_URL`. Chạy nhầm migration lên prod là chuyện đã suýt xảy ra.

---

## File Structure

**Tạo mới**

| File | Trách nhiệm |
|---|---|
| `apps/api/src/database/migrations/1789400000000-AddArchiveContentCheck.ts` | enum, bảng con, 4 cột, CHECK constraint |
| `apps/api/src/exam-session/entities/required-deliverable-entry.entity.ts` | bảng con |
| `apps/api/src/submission/archive-check/entry-matcher.ts` | **thuần**, không I/O — luật đối chiếu |
| `apps/api/src/submission/archive-check/archive-reader.ts` | magic bytes + liệt kê entry, có trần |
| `apps/api/src/submission/archive-check/archive-check.constants.ts` | ba hằng số + tên queue |
| `apps/api/src/submission/archive-check/archive-check.service.ts` | một bài: Head → get → detect → list → match → ghi |
| `apps/api/src/submission/archive-check/archive-check.processor.ts` | vỏ BullMQ |
| `apps/web/src/app/teacher/exam-sessions/new/_components/ArchiveEntriesField.tsx` | khối gập "Kiểm file bên trong" |

**Sửa**

| File | Sửa gì |
|---|---|
| `apps/api/src/database/data-source.ts` | đăng ký entity mới |
| `apps/api/src/submission/entities/submission.entity.ts` | 4 cột mới |
| `apps/api/src/exam-session/dto/create-exam-session.dto.ts` | `requiredFilenames` sang dạng object |
| `apps/api/src/exam-session/exam-session.service.ts` | lưu entry rows; trả entry trong response |
| `apps/api/src/exam-session/exam-session.gateway.ts` | `client.data.machineName` |
| `apps/api/src/submission/submission.service.ts` | chụp kỳ vọng, `pending`, enqueue sau commit |
| `apps/api/src/submission/submission.module.ts` | queue + processor + service |
| `apps/api/src/exam-session/recollect.service.ts` | `findMissing` tính cả `failed`/`unreadable` |
| `apps/api/src/exam-session/exam-session.controller.ts` | `POST :id/archive-recheck` |
| `apps/api/src/submission/submission-overview.service.ts` + `.types.ts` | `archiveIssueCount` |
| `apps/web/src/lib/submission-attention.ts` | lý do mới + sửa ghi chú "nghỉ hưu" |
| `apps/web/src/app/teacher/exam-sessions/new/schema.ts` | Zod song song với DTO |
| `apps/web/src/app/teacher/submissions/[sessionId]/page.tsx` | hiển thị + nút "Kiểm lại" |

---

## Task 1: Migration + entity

**Files:**
- Create: `apps/api/src/database/migrations/1789400000000-AddArchiveContentCheck.ts`
- Create: `apps/api/src/exam-session/entities/required-deliverable-entry.entity.ts`
- Modify: `apps/api/src/submission/entities/submission.entity.ts`
- Modify: `apps/api/src/database/data-source.ts`

**Interfaces:**
- Produces: `RequiredDeliverableEntryEntity` (`{ id, examSessionId? no — requiredDeliverableId, entryName }`); `SubmissionEntity.archiveCheckStatus: ArchiveCheckStatus`, `.archiveExpectedEntries: string[] | null`, `.archiveMissingEntries: string[] | null`, `.archiveCheckError: string | null`; `export type ArchiveCheckStatus = 'not_applicable' | 'pending' | 'passed' | 'failed' | 'unreadable'`

- [ ] **Step 1: Trỏ DB về Docker local**

Mở `apps/api/.env`, bỏ comment dòng `DATABASE_URL` localhost:5442 và comment dòng Supabase. Xác nhận:

```bash
cd apps/api && grep -n '^DATABASE_URL=' .env
```
Expected: dòng chứa `localhost:5442`, KHÔNG chứa `supabase.com`.

- [ ] **Step 2: Viết migration**

```ts
import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Kiểm nội dung file nén — spec 2026-09-21-archive-content-validation §4.
 *
 * Kết quả là DỮ LIỆU, không phải TRẠNG THÁI: không đụng
 * `validate_submission_lifecycle`, không sinh `submission.status='invalid'`.
 * Lý do đầy đủ ở spec §3.3 — tóm tắt: trigger không có đường ra khỏi
 * `invalid`, nên nộp lại sẽ để lại một dòng nói dối; và một enum status
 * không chở được "thiếu file nào", vốn là thứ giảng viên thật sự cần.
 */
export class AddArchiveContentCheck1789400000000 implements MigrationInterface {
  name = 'AddArchiveContentCheck1789400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "examcollect"."required_deliverable_entry" (
        "id"                      uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at"              timestamptz NOT NULL DEFAULT now(),
        "updated_at"              timestamptz NOT NULL DEFAULT now(),
        "required_deliverable_id" uuid NOT NULL
          REFERENCES "examcollect"."required_deliverable"("id") ON DELETE CASCADE,
        "entry_name"              varchar(255) NOT NULL
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_deliverable_entry_name"
        ON "examcollect"."required_deliverable_entry" ("required_deliverable_id", "entry_name")
    `);
    // Mọi bảng khác trong schema này đều có nó; thiếu thì `updated_at`
    // đứng im mãi ở giá trị lúc insert.
    await queryRunner.query(`
      CREATE TRIGGER "set_updated_at_required_deliverable_entry"
        BEFORE UPDATE ON "examcollect"."required_deliverable_entry"
        FOR EACH ROW EXECUTE FUNCTION examcollect.set_updated_at()
    `);

    await queryRunner.query(`
      CREATE TYPE "examcollect"."archive_check_status" AS ENUM (
        'not_applicable', 'pending', 'passed', 'failed', 'unreadable'
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "examcollect"."submission"
        ADD COLUMN "archive_check_status" "examcollect"."archive_check_status"
            NOT NULL DEFAULT 'not_applicable',
        ADD COLUMN "archive_expected_entries" text[],
        ADD COLUMN "archive_missing_entries"  text[],
        ADD COLUMN "archive_check_error"      text
    `);

    // Bản chụp chỉ đúng khi CÓ người chụp — spec §5.2.1.
    //
    // Hôm nay `submission:confirm` là đường DUY NHẤT tới `collected`
    // (`submittedVia: 'normal'` là chỗ ghi duy nhất trong codebase; hai nhãn
    // `backup`/`manual_pull` tồn tại trong enum nhưng không gì sinh ra
    // chúng). Ngày ai đó viết đường backup thật mà không biết về bản chụp,
    // `{SOMAY}` sẽ render thành 'UNKNOWN' và đánh trượt oan đúng nhóm em đã
    // gặp sự cố máy móc — trong im lặng. Ràng buộc này bắt lỗi đó nổ tại
    // đúng câu lệnh gây ra nó.
    await queryRunner.query(`
      ALTER TABLE "examcollect"."submission"
        ADD CONSTRAINT "ck_submission_archive_snapshot" CHECK (
          "archive_check_status" <> 'pending'
          OR "archive_expected_entries" IS NOT NULL
        )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "examcollect"."submission"
        DROP CONSTRAINT IF EXISTS "ck_submission_archive_snapshot",
        DROP COLUMN IF EXISTS "archive_check_error",
        DROP COLUMN IF EXISTS "archive_missing_entries",
        DROP COLUMN IF EXISTS "archive_expected_entries",
        DROP COLUMN IF EXISTS "archive_check_status"
    `);
    await queryRunner.query(`DROP TYPE IF EXISTS "examcollect"."archive_check_status"`);
    // Bảng bỏ sau cùng: trigger và index đi theo nó.
    await queryRunner.query(`DROP TABLE IF EXISTS "examcollect"."required_deliverable_entry"`);
  }
}
```

- [ ] **Step 3: Viết entity bảng con**

`apps/api/src/exam-session/entities/required-deliverable-entry.entity.ts`:

```ts
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../shared/base.entity';
import { RequiredDeliverableEntity } from './required-deliverable.entity';

/**
 * Một file phải nằm BÊN TRONG một deliverable dạng nén.
 *
 * Deliverable không có dòng nào ở đây = không kiểm bên trong. KHÔNG có cờ
 * bật/tắt riêng — một cờ là một sự thật thứ hai về cùng chuyện, và nó sẽ
 * có ngày mâu thuẫn với danh sách (cùng lý lẽ `isTemplatedFilename` đã
 * viết cho chính nó ở filename-template.ts).
 */
@Entity({ name: 'required_deliverable_entry' })
@Index('uq_deliverable_entry_name', ['requiredDeliverableId', 'entryName'], { unique: true })
export class RequiredDeliverableEntryEntity extends BaseEntity {
  @Column({ name: 'required_deliverable_id', type: 'uuid' })
  requiredDeliverableId!: string;

  @ManyToOne(() => RequiredDeliverableEntity, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'required_deliverable_id' })
  requiredDeliverable!: RequiredDeliverableEntity;

  /** Mẫu tên, chịu FILENAME_TEMPLATE_REGEX — token dùng được như tên ngoài. */
  @Column({ name: 'entry_name', type: 'varchar', length: 255 })
  entryName!: string;
}
```

- [ ] **Step 4: Thêm 4 cột vào `SubmissionEntity`**

Thêm vào `apps/api/src/submission/entities/submission.entity.ts` (cạnh các cột file, sau `submittedVia`):

```ts
export type ArchiveCheckStatus =
  | 'not_applicable'
  | 'pending'
  | 'passed'
  | 'failed'
  | 'unreadable';
```

và trong class:

```ts
  /**
   * Kết quả kiểm nội dung file nén. KHÔNG phải `status` — spec §3.3.
   * `not_applicable` là mặc định: phần lớn deliverable không khai file
   * bên trong, và im lặng là câu trả lời đúng cho chúng.
   */
  @Column({
    name: 'archive_check_status',
    type: 'enum',
    enum: ['not_applicable', 'pending', 'passed', 'failed', 'unreadable'],
    enumName: 'archive_check_status',
    default: 'not_applicable',
  })
  archiveCheckStatus!: ArchiveCheckStatus;

  /**
   * BẢN CHỤP danh sách kỳ vọng, đã render token, tại thời điểm em nộp.
   * Không tra lại lúc chấm: `machineName` chỉ sống trong socket, nên
   * `{SOMAY}` không render lại được sau khi agent ngắt (spec §5.2).
   */
  @Column({ name: 'archive_expected_entries', type: 'text', array: true, nullable: true })
  archiveExpectedEntries!: string[] | null;

  @Column({ name: 'archive_missing_entries', type: 'text', array: true, nullable: true })
  archiveMissingEntries!: string[] | null;

  /** Chỉ đặt khi `unreadable`. Chuỗi đã qua xử lý, an toàn hiển thị. */
  @Column({ name: 'archive_check_error', type: 'text', nullable: true })
  archiveCheckError!: string | null;
```

- [ ] **Step 5: Đăng ký entity trong data-source**

Trong `apps/api/src/database/data-source.ts`: `import { RequiredDeliverableEntryEntity } from '../exam-session/entities/required-deliverable-entry.entity';` và thêm vào mảng `entities` ngay sau `RequiredDeliverableEntity`.

- [ ] **Step 6: Chạy migration**

```bash
cd apps/api && pnpm migration:run
```
Expected: `AddArchiveContentCheck1789400000000 has been executed successfully.`

- [ ] **Step 7: Kiểm CHECK constraint chặn thật**

```bash
docker compose exec -T postgres psql -U examcollect_admin -d examcollect -c \
  "UPDATE examcollect.submission SET archive_check_status='pending' WHERE id=(SELECT id FROM examcollect.submission LIMIT 1);"
```
Expected: FAIL — `new row for relation "submission" violates check constraint "ck_submission_archive_snapshot"`.

Nếu bảng `submission` rỗng thì câu trên không chứng minh gì. Khi đó insert một dòng giả rồi xoá, hoặc hoãn bước này sang Task 6 (nơi e2e đã có dữ liệu thật). **Không bỏ qua** — đây là ràng buộc cả spec dựa vào.

- [ ] **Step 8: Kiểm migration lùi được**

```bash
cd apps/api && pnpm migration:revert && pnpm migration:run
```
Expected: cả hai lệnh xanh.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/database/migrations/1789400000000-AddArchiveContentCheck.ts \
        apps/api/src/exam-session/entities/required-deliverable-entry.entity.ts \
        apps/api/src/submission/entities/submission.entity.ts \
        apps/api/src/database/data-source.ts
git commit -m "feat(schema): bảng entry file nén + bốn cột kết quả kiểm"
```

---

## Task 2: `matchEntries` — luật đối chiếu, thuần

**Files:**
- Create: `apps/api/src/submission/archive-check/entry-matcher.ts`
- Test: `apps/api/src/submission/archive-check/entry-matcher.spec.ts`

**Interfaces:**
- Produces: `matchEntries(expected: string[], actual: string[]): string[]` — trả về phần THIẾU, giữ nguyên thứ tự `expected`

- [ ] **Step 1: Viết test trước**

```ts
import { matchEntries } from './entry-matcher';

describe('matchEntries', () => {
  it('đủ hết thì không thiếu gì', () => {
    expect(matchEntries(['Main.java', 'BaoCao.docx'], ['Main.java', 'BaoCao.docx'])).toEqual([]);
  });

  it('trả về đúng phần thiếu, theo thứ tự giảng viên khai', () => {
    expect(matchEntries(['A.java', 'B.docx', 'C.txt'], ['B.docx'])).toEqual(['A.java', 'C.txt']);
  });

  // §3.2 — lý do cả thiết kế chọn khớp theo tên: em nén CẢ THƯ MỤC CHỨA là
  // lỗi phổ biến nhất, và khớp theo đường dẫn sẽ đánh trượt toàn bộ bài.
  it('khớp file nằm sâu trong thư mục', () => {
    expect(matchEntries(['Main.java'], ['BaiThi_2180123/src/Main.java'])).toEqual([]);
  });

  it('không phân biệt hoa thường — Windows coi chúng là một file', () => {
    expect(matchEntries(['Main.java'], ['MAIN.JAVA'])).toEqual([]);
    expect(matchEntries(['Main.java'], ['src/main.java'])).toEqual([]);
  });

  it('entry thư mục không bao giờ khớp', () => {
    expect(matchEntries(['src'], ['src/'])).toEqual(['src']);
  });

  it('kỳ vọng rỗng thì không thiếu gì', () => {
    expect(matchEntries([], ['bat.ky.gi'])).toEqual([]);
  });

  it('thực tế rỗng thì thiếu hết', () => {
    expect(matchEntries(['A.java'], [])).toEqual(['A.java']);
  });

  // Zip do Windows tạo dùng '\' trong một số công cụ cũ.
  it('coi cả "\\" là dấu phân cách', () => {
    expect(matchEntries(['Main.java'], ['src\\Main.java'])).toEqual([]);
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận nó đỏ**

```bash
cd apps/api && pnpm test -- entry-matcher
```
Expected: FAIL — `Cannot find module './entry-matcher'`.

- [ ] **Step 3: Viết implementation nhỏ nhất**

```ts
/**
 * Luật đối chiếu tên file bên trong file nén — spec §6.3.
 *
 * THUẦN, không I/O, cố ý. Đây là chỗ duy nhất luật "đủ hay thiếu" tồn tại,
 * nên nó test trực tiếp được, và nếu sau này muốn cảnh báo sớm ngay trên
 * agent thì dùng lại nguyên vẹn (spec §2, ngoài phạm vi đợt này).
 *
 * KHÔNG phân biệt hoa thường — và đây không phải thiếu nhất quán với phép
 * khớp tên file BÊN NGOÀI vốn so chính xác. Hai bên khác nhau ở chỗ AI tạo
 * ra cái tên: tên ngoài do agent tạo từ chuỗi server gửi xuống nên luôn
 * đúng từng ký tự; tên trong do sinh viên gõ trên Windows, nơi `Main.java`
 * và `main.java` là cùng một file và hệ điều hành không cho em biết là có
 * khác. So chính xác ở đây chỉ đẻ ra kết luận sai.
 */
export function matchEntries(expected: string[], actual: string[]): string[] {
  const present = new Set<string>();
  for (const raw of actual) {
    // Thư mục: bỏ. Một entry thư mục không phải một file em nộp.
    if (raw.endsWith('/') || raw.endsWith('\\')) {
      continue;
    }
    const base = raw.split(/[/\\]/).pop();
    if (base) {
      present.add(base.toLowerCase());
    }
  }
  return expected.filter((name) => !present.has(name.toLowerCase()));
}
```

- [ ] **Step 4: Chạy lại, xác nhận xanh**

```bash
cd apps/api && pnpm test -- entry-matcher
```
Expected: PASS, 8 test.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/submission/archive-check/entry-matcher.ts \
        apps/api/src/submission/archive-check/entry-matcher.spec.ts
git commit -m "feat(archive-check): luật đối chiếu tên file bên trong, thuần và có test"
```

---

## Task 3: Đọc file nén — magic bytes + liệt kê có trần

**Files:**
- Create: `apps/api/src/submission/archive-check/archive-check.constants.ts`
- Create: `apps/api/src/submission/archive-check/archive-reader.ts`
- Test: `apps/api/src/submission/archive-check/archive-reader.spec.ts`

**Interfaces:**
- Consumes: —
- Produces:
  - `export type ArchiveFormat = 'zip' | 'rar' | 'unknown'`
  - `detectArchiveFormat(buffer: Buffer): ArchiveFormat`
  - `listArchiveEntries(buffer: Buffer, format: 'zip' | 'rar'): Promise<string[]>` — ném `ArchiveTooManyEntriesError` hoặc `ArchiveUnreadableError`
  - `class ArchiveUnreadableError extends Error`, `class ArchiveTooManyEntriesError extends Error`
  - hằng: `ARCHIVE_CHECK_MAX_BYTES`, `ARCHIVE_CHECK_CONCURRENCY`, `ARCHIVE_MAX_ENTRIES`, `ARCHIVE_CHECK_QUEUE`

- [ ] **Step 1: Cài dependency**

```bash
pnpm --filter api add yauzl node-unrar-js
pnpm --filter api add -D @types/yauzl
```

> `node-unrar-js` dùng giấy phép riêng của RARLAB, **không phải OSI**: cho giải nén tự do, cấm dùng mã nguồn để làm bộ NÉN RAR. Cách dùng ở đây (chỉ đọc danh sách) nằm trong phần được phép. Ghi lại vì nếu phần này tái dùng cho sản phẩm thương mại thì đây là dependency duy nhất cần soát giấy phép riêng.

- [ ] **Step 2: Viết file hằng số**

```ts
/**
 * Ba con số này ĐỌC CÙNG NHAU. Đổi một cái mà không tính lại cái kia là mở
 * lại đúng lỗ vừa bịt — spec §6.2.1.
 *
 * Ràng buộc ở đây là RAM của container, KHÔNG phải rate limit của một API
 * bên ngoài (đó là chuyện của GRADING_QUEUE). Đáy bài toán:
 *
 *     concurrency × MAX_BYTES × 2   (nhân 2 vì RAR giữ thêm một bản trong
 *     = 2 × 200MB × 2 = 800MB        heap của WASM, ngoài buffer phía JS)
 *
 * Railway container mặc định không chịu nổi 5 × 200MB × 2 = 2GB.
 */
export const ARCHIVE_CHECK_MAX_BYTES = 200 * 1024 * 1024;
export const ARCHIVE_CHECK_CONCURRENCY = 2;

/**
 * Trần số mục ĐỌC RA TỪ FILE NÉN — khác hẳn trần 20 mục KHAI BÁO ở DTO.
 * Cái này chặn cạn bộ nhớ; cái kia chặn biểu mẫu không dùng nổi.
 *
 * Trần này chỉ có tác dụng VÌ trình đọc dừng được giữa chừng. Một trần đặt
 * sau khi thư viện đã nạp xong toàn bộ bảng mục lục là một trần không tồn
 * tại — chính là lý do dùng `yauzl` chứ không `jszip` (spec §6.2).
 */
export const ARCHIVE_MAX_ENTRIES = 20_000;

export const ARCHIVE_CHECK_QUEUE = 'archive-check';
```

- [ ] **Step 3: Viết test nhận dạng định dạng trước**

```ts
import { detectArchiveFormat, listArchiveEntries, ArchiveUnreadableError } from './archive-reader';

const zipMagic = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]);
const rar4Magic = Buffer.from([0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x00]);
const rar5Magic = Buffer.from([0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x01, 0x00]);

describe('detectArchiveFormat', () => {
  it('nhận ra zip', () => expect(detectArchiveFormat(zipMagic)).toBe('zip'));
  it('nhận ra rar4', () => expect(detectArchiveFormat(rar4Magic)).toBe('rar'));
  it('nhận ra rar5', () => expect(detectArchiveFormat(rar5Magic)).toBe('rar'));
  it('rác thì unknown', () =>
    expect(detectArchiveFormat(Buffer.from('khong phai file nen'))).toBe('unknown'));
  it('buffer rỗng thì unknown, không ném', () =>
    expect(detectArchiveFormat(Buffer.alloc(0))).toBe('unknown'));
  it('buffer ngắn hơn cả magic bytes thì unknown, không ném', () =>
    expect(detectArchiveFormat(Buffer.from([0x50, 0x4b]))).toBe('unknown'));
});

describe('listArchiveEntries — zip', () => {
  it('đọc zip thật ra đúng danh sách', async () => {
    const buf = await makeZip({ 'Main.java': 'x', 'src/Helper.java': 'y' });
    const entries = await listArchiveEntries(buf, 'zip');
    expect(entries).toEqual(expect.arrayContaining(['Main.java', 'src/Helper.java']));
  });

  it('zip hỏng ném ArchiveUnreadableError', async () => {
    const broken = Buffer.concat([zipMagic, Buffer.from('rac')]);
    await expect(listArchiveEntries(broken, 'zip')).rejects.toBeInstanceOf(ArchiveUnreadableError);
  });
});
```

`makeZip` là helper trong chính file test — dùng `yazl` hoặc `jszip` (đã có trong workspace ở `apps/agent`) để dựng zip trong bộ nhớ. Nếu không muốn thêm dep, dùng `zlib` + tự ghép header là quá tốn; **cài `yazl` vào devDependencies của api** cho việc này:

```bash
pnpm --filter api add -D yazl @types/yazl
```

- [ ] **Step 4: Chạy test, xác nhận đỏ**

```bash
cd apps/api && pnpm test -- archive-reader
```
Expected: FAIL — module chưa tồn tại.

- [ ] **Step 5: Viết implementation**

```ts
import * as yauzl from 'yauzl';
import { ARCHIVE_MAX_ENTRIES } from './archive-check.constants';

export type ArchiveFormat = 'zip' | 'rar' | 'unknown';

export class ArchiveUnreadableError extends Error {}
export class ArchiveTooManyEntriesError extends Error {
  constructor() {
    super(`File nén khai quá ${ARCHIVE_MAX_ENTRIES} mục — không đọc tiếp.`);
  }
}

const ZIP_MAGICS = [
  Buffer.from([0x50, 0x4b, 0x03, 0x04]),
  Buffer.from([0x50, 0x4b, 0x05, 0x06]),
  Buffer.from([0x50, 0x4b, 0x07, 0x08]),
];
const RAR_MAGIC = Buffer.from([0x52, 0x61, 0x72, 0x21, 0x1a, 0x07]);

/**
 * Nhận dạng bằng MAGIC BYTES, không bằng đuôi file — spec §6.1.
 *
 * Sinh viên đổi tên `.rar` thành `.zip` là chuyện có thật, và đọc theo đuôi
 * sẽ báo `unreadable` cho một file hoàn toàn lành. Magic bytes trả lời câu
 * hỏi thật ("đây là cái gì") thay vì câu hỏi "nó tự xưng là cái gì".
 */
export function detectArchiveFormat(buffer: Buffer): ArchiveFormat {
  if (ZIP_MAGICS.some((m) => buffer.length >= m.length && buffer.subarray(0, m.length).equals(m))) {
    return 'zip';
  }
  if (buffer.length >= RAR_MAGIC.length && buffer.subarray(0, RAR_MAGIC.length).equals(RAR_MAGIC)) {
    return 'rar';
  }
  return 'unknown';
}

export async function listArchiveEntries(
  buffer: Buffer,
  format: 'zip' | 'rar',
): Promise<string[]> {
  return format === 'zip' ? listZipEntries(buffer) : listRarEntries(buffer);
}

/**
 * `lazyEntries: true` là toàn bộ lý do dùng yauzl thay vì jszip: nó đọc
 * từng mục một khi được gọi `readEntry()`, nên trần bên dưới DỪNG ĐƯỢC
 * giữa chừng. `jszip.loadAsync` dựng xong cả bảng `files` rồi mới trả về,
 * tức là bộ nhớ đã phình trước khi có chỗ nào để đếm.
 */
function listZipEntries(buffer: Buffer): Promise<string[]> {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(buffer, { lazyEntries: true }, (err, zipfile) => {
      if (err || !zipfile) {
        reject(new ArchiveUnreadableError(describe(err)));
        return;
      }
      const names: string[] = [];
      zipfile.on('entry', (entry: yauzl.Entry) => {
        names.push(entry.fileName);
        if (names.length > ARCHIVE_MAX_ENTRIES) {
          zipfile.close();
          reject(new ArchiveTooManyEntriesError());
          return;
        }
        zipfile.readEntry();
      });
      zipfile.on('end', () => resolve(names));
      zipfile.on('error', (e: Error) => reject(new ArchiveUnreadableError(describe(e))));
      zipfile.readEntry();
    });
  });
}

/**
 * NẠP LƯỜI — spec §12.1. Một phiên chỉ dùng `.zip` không bao giờ kéo ~1MB
 * WASM vào tiến trình. `import()` động chứ không `import` ở đầu file.
 */
async function listRarEntries(buffer: Buffer): Promise<string[]> {
  try {
    const { createExtractorFromData } = await import('node-unrar-js');
    const extractor = await createExtractorFromData({ data: Uint8Array.from(buffer).buffer });
    const list = extractor.getFileList();
    const names: string[] = [];
    for (const header of list.fileHeaders) {
      names.push(header.flags.directory ? `${header.name}/` : header.name);
      if (names.length > ARCHIVE_MAX_ENTRIES) {
        throw new ArchiveTooManyEntriesError();
      }
    }
    return names;
  } catch (error) {
    if (error instanceof ArchiveTooManyEntriesError) throw error;
    // Gồm cả rar mã hoá HEADER: không đọc nổi danh sách thì đúng là
    // `unreadable`, không phải `failed`.
    throw new ArchiveUnreadableError(describe(error));
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
```

> **Kiểm chứng API trước khi tin đoạn RAR.** Hình dạng `createExtractorFromData` / `getFileList()` / `fileHeaders` lấy theo README của `node-unrar-js`; phiên bản cài về có thể khác. Chạy một script nhỏ đọc một file `.rar` thật và in ra kết quả TRƯỚC khi viết tiếp — đừng sửa test cho khớp một API đoán mò.

- [ ] **Step 6: Chạy test, xác nhận xanh**

```bash
cd apps/api && pnpm test -- archive-reader
```
Expected: PASS.

- [ ] **Step 7: Thêm test trần entry, và xác nhận nó dừng SỚM**

```ts
it('quá trần thì ném, và không đọc hết cả archive', async () => {
  const many: Record<string, string> = {};
  for (let i = 0; i < ARCHIVE_MAX_ENTRIES + 50; i++) many[`f${i}.txt`] = '';
  const buf = await makeZip(many);
  await expect(listArchiveEntries(buf, 'zip')).rejects.toBeInstanceOf(ArchiveTooManyEntriesError);
});
```

Chạy: `cd apps/api && pnpm test -- archive-reader`. Expected: PASS.

- [ ] **Step 8: Thêm file `.rar` thật vào fixtures và test cả rar4 lẫn rar5**

Tạo hai file bằng WinRAR (một RAR4 qua tuỳ chọn "RAR4", một RAR5 mặc định), mỗi file chứa `Main.java` và `src/Helper.java`, đặt ở `apps/api/test/fixtures/archive/`. Thêm test đọc chúng ra đúng danh sách, và một file rar **mã hoá header** (WinRAR: "Encrypt file names") phải ném `ArchiveUnreadableError`.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/submission/archive-check/ apps/api/test/fixtures/archive/ apps/api/package.json
git commit -m "feat(archive-check): đọc zip bằng yauzl và rar bằng WASM, có trần dừng sớm"
```

---

## Task 4: DTO nhận danh sách lồng + lưu entry rows

**Files:**
- Modify: `apps/api/src/exam-session/dto/create-exam-session.dto.ts`
- Modify: `apps/api/src/exam-session/exam-session.service.ts:195-220`
- Modify: `apps/api/src/exam-session/dto/exam-session-response.dto.ts`
- Test: `apps/api/src/exam-session/dto/create-exam-session.dto.spec.ts` (đã tồn tại — thêm case)

**Interfaces:**
- Consumes: `FILENAME_TEMPLATE_REGEX` từ `../filename-template`
- Produces: `RequiredFilenameInput = string | { filename: string; entries?: string[] }`; `ExamSessionService.create` lưu `RequiredDeliverableEntryEntity` rows

- [ ] **Step 1: Viết test DTO trước**

Thêm vào `create-exam-session.dto.spec.ts`:

```ts
it('nhận chuỗi trần (tương thích ngược)', async () => {
  const dto = plainToInstance(CreateExamSessionDto, { ...valid, requiredFilenames: ['a.docx'] });
  expect(await validate(dto)).toHaveLength(0);
});

it('nhận object kèm entries cho .zip', async () => {
  const dto = plainToInstance(CreateExamSessionDto, {
    ...valid,
    requiredFilenames: [{ filename: 'BaiThi_{MSSV}.zip', entries: ['Main.java'] }],
  });
  expect(await validate(dto)).toHaveLength(0);
});

it('TỪ CHỐI entries trên deliverable không phải file nén', async () => {
  const dto = plainToInstance(CreateExamSessionDto, {
    ...valid,
    requiredFilenames: [{ filename: 'BaoCao.docx', entries: ['Main.java'] }],
  });
  expect(await validate(dto)).not.toHaveLength(0);
});

it('TỪ CHỐI entry chứa dấu "/" — khớp theo tên, đường dẫn là vô nghĩa', async () => {
  const dto = plainToInstance(CreateExamSessionDto, {
    ...valid,
    requiredFilenames: [{ filename: 'a.zip', entries: ['src/Main.java'] }],
  });
  expect(await validate(dto)).not.toHaveLength(0);
});

it('TỪ CHỐI entry trùng nhau', async () => {
  const dto = plainToInstance(CreateExamSessionDto, {
    ...valid,
    requiredFilenames: [{ filename: 'a.zip', entries: ['M.java', 'M.java'] }],
  });
  expect(await validate(dto)).not.toHaveLength(0);
});

it('TỪ CHỐI quá 20 entry', async () => {
  const entries = Array.from({ length: 21 }, (_, i) => `f${i}.java`);
  const dto = plainToInstance(CreateExamSessionDto, {
    ...valid,
    requiredFilenames: [{ filename: 'a.zip', entries }],
  });
  expect(await validate(dto)).not.toHaveLength(0);
});
```

- [ ] **Step 2: Chạy, xác nhận đỏ**

```bash
cd apps/api && pnpm test -- create-exam-session.dto
```
Expected: FAIL trên các case object.

- [ ] **Step 3: Sửa DTO**

Thay `requiredFilenames!: string[]` bằng:

```ts
export const ARCHIVE_EXTENSIONS = ['.zip', '.rar'] as const;
export const MAX_ENTRIES_PER_DELIVERABLE = 20;

export class RequiredFilenameDto {
  @IsString()
  @Matches(FILENAME_TEMPLATE_REGEX, {
    message:
      'Tên file chỉ được chứa chữ, số, "_", "-", "." và các ô {MSSV} {TEN} {PHONG} {SOMAY}',
  })
  @MaxLength(255)
  filename!: string;

  /**
   * File phải nằm BÊN TRONG, chỉ có nghĩa với deliverable dạng nén.
   *
   * Không cho khai trên `.docx`: nhận im lặng rồi không kiểm gì còn tệ hơn
   * từ chối, vì giảng viên sẽ tin là hệ thống đang canh.
   */
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(MAX_ENTRIES_PER_DELIVERABLE)
  @IsString({ each: true })
  @Matches(FILENAME_TEMPLATE_REGEX, { each: true, message: '...' })
  @MaxLength(255, { each: true })
  @Validate(EntriesOnlyOnArchiveConstraint)
  entries?: string[];
}
```

với constraint:

```ts
@ValidatorConstraint({ name: 'EntriesOnlyOnArchive', async: false })
class EntriesOnlyOnArchiveConstraint implements ValidatorConstraintInterface {
  validate(entries: string[] | undefined, args: ValidationArguments): boolean {
    if (!entries || entries.length === 0) return true;
    const { filename } = args.object as RequiredFilenameDto;
    const lower = (filename ?? '').toLowerCase();
    return ARCHIVE_EXTENSIONS.some((ext) => lower.endsWith(ext));
  }
  defaultMessage(): string {
    return 'Chỉ khai được file bên trong cho deliverable .zip hoặc .rar';
  }
}
```

và trên trường của `CreateExamSessionDto`:

```ts
  /**
   * Chuỗi trần vẫn nhận, hiểu là "không khai file bên trong" — giữ tương
   * thích ngược cho mọi chỗ gọi đã có.
   */
  @IsArray()
  @ArrayMinSize(1)
  @Transform(({ value }) =>
    Array.isArray(value)
      ? value.map((v) => (typeof v === 'string' ? { filename: v } : v))
      : value,
  )
  @ValidateNested({ each: true })
  @Type(() => RequiredFilenameDto)
  requiredFilenames!: RequiredFilenameDto[];
```

> `@ArrayUnique()` trên `requiredFilenames` không còn dùng được vì phần tử giờ là object. Thay bằng một constraint riêng so `filename` — **không được bỏ**: tên trùng lọt qua mọi phép kiểm riêng lẻ rồi chết ở unique index dưới DB, nổi lên thành 409 mà frontend không giải thích được.

- [ ] **Step 4: Chạy test DTO, xác nhận xanh**

```bash
cd apps/api && pnpm test -- create-exam-session.dto
```
Expected: PASS.

- [ ] **Step 5: Lưu entry rows trong service**

Trong `exam-session.service.ts`, thay khối `savedDeliverables`:

```ts
          const savedDeliverables = await manager.save(
            RequiredDeliverableEntity,
            dto.requiredFilenames.map((item) =>
              manager.create(RequiredDeliverableEntity, {
                examSessionId: session.id,
                requiredFilename: item.filename,
                deliverableType: DEFAULT_DELIVERABLE_TYPE,
              }),
            ),
          );

          // Cùng giao dịch với deliverable: một deliverable có mặt mà danh
          // sách bên trong của nó chưa có là một phiên thi kiểm sai.
          const entryRows = savedDeliverables.flatMap((deliverable, index) =>
            (dto.requiredFilenames[index].entries ?? []).map((entryName) =>
              manager.create(RequiredDeliverableEntryEntity, {
                requiredDeliverableId: deliverable.id,
                entryName,
              }),
            ),
          );
          if (entryRows.length > 0) {
            await manager.save(RequiredDeliverableEntryEntity, entryRows);
          }
```

> `savedDeliverables` giữ đúng thứ tự của mảng đưa vào `manager.save`, nên `index` khớp `dto.requiredFilenames`. Nếu nghi ngờ, map theo `requiredFilename` thay vì index.

- [ ] **Step 6: Trả entries trong response DTO**

Thêm `entries: string[]` vào shape deliverable của `exam-session-response.dto.ts` và điền trong `toResponseDto`.

- [ ] **Step 7: Chạy e2e phiên thi**

```bash
# Postgres + MinIO đang chạy, bucket examcollect-submissions đã tạo,
# và đã kill mọi jest/nest mồ côi.
cd apps/api && pnpm test:e2e -- exam-session
```
Expected: PASS.

- [ ] **Step 8: Regenerate API client**

```bash
pnpm --filter api dev            # cửa sổ 1
pnpm --filter @cine/shared generate:api-client   # cửa sổ 2
pnpm --filter web build
```
Expected: `Wrote packages/shared/src/api/schema.d.ts`, rồi web build xanh.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/exam-session packages/shared/src/api/schema.d.ts
git commit -m "feat(exam-session): khai được file bên trong deliverable nén"
```

---

## Task 5: Chụp kỳ vọng lúc nộp + enqueue sau commit

**Files:**
- Modify: `apps/api/src/exam-session/exam-session.gateway.ts:455-470`
- Modify: `apps/api/src/submission/submission.service.ts:420-500`
- Modify: `apps/api/src/submission/submission.module.ts`
- Test: `apps/api/test/archive-check.e2e-spec.ts` (tạo mới)

**Interfaces:**
- Consumes: `renderFilename` từ `exam-session/filename-template`; `ARCHIVE_CHECK_QUEUE` từ Task 3
- Produces: dòng `submission` có `archiveExpectedEntries` + `archiveCheckStatus='pending'`; job `{ submissionId: string }` trên `ARCHIVE_CHECK_QUEUE`

- [ ] **Step 1: Giữ `machineName` trên socket**

Trong `exam-session.gateway.ts`, cạnh các dòng `client.data.*` đã có:

```ts
    // Đọc lại ở submission:confirm để render bản chụp entry. `machineName`
    // KHÔNG được ghi xuống DB ở đâu cả, nên nếu không giữ ở đây thì
    // `{SOMAY}` trong tên file bên trong không render lại được sau khi
    // socket đóng — và render với null cho ra 'UNKNOWN', đánh trượt oan
    // (spec §5.2).
    client.data.machineName = dto.machineName ?? null;
```

- [ ] **Step 2: Viết e2e trước**

`apps/api/test/archive-check.e2e-spec.ts`:

```ts
it('nộp deliverable có khai entry → pending + có bản chụp đã render token', async () => {
  // tạo phiên với requiredFilenames: [{ filename: 'BaiThi_{MSSV}.zip',
  //   entries: ['BaoCao_{MSSV}.docx', 'Main.java'] }]
  // mock agent join với machineName 'PM-A1-07', nộp một zip bất kỳ
  const row = await submissionRepo.findOneByOrFail({ id });
  expect(row.status).toBe('collected');
  expect(row.archiveCheckStatus).toBe('pending');
  expect(row.archiveExpectedEntries).toEqual(['BaoCao_2180123.docx', 'Main.java']);
  // KHÔNG được có 'UNKNOWN' ở đâu — đó là dấu hiệu render mất context
  expect(row.archiveExpectedEntries?.join()).not.toContain('UNKNOWN');
});

it('deliverable không khai entry → not_applicable, không job nào chạy', async () => {
  const row = await submissionRepo.findOneByOrFail({ id });
  expect(row.archiveCheckStatus).toBe('not_applicable');
  expect(row.archiveExpectedEntries).toBeNull();
});

// Spec §5.4 — thứ mà quyết định "không dùng 'invalid'" mua được. Nếu đi
// qua status thì dòng này sẽ kẹt `invalid` vĩnh viễn.
it('nộp lại thì chụp lại và về pending, không kẹt kết quả cũ', async () => {
  await submissionRepo.update(id, {
    archiveCheckStatus: 'failed',
    archiveMissingEntries: ['Main.java'],
  });
  await mockAgent.submit(deliverableId, zipWithEverything);
  const row = await submissionRepo.findOneByOrFail({ id });
  expect(row.archiveCheckStatus).toBe('pending');
  expect(row.archiveMissingEntries).toBeNull();
  expect(row.archiveExpectedEntries).toEqual(['BaoCao_2180123.docx', 'Main.java']);
});
```

- [ ] **Step 3: Chạy, xác nhận đỏ**

```bash
cd apps/api && pnpm test:e2e -- archive-check
```
Expected: FAIL — `archiveCheckStatus` là `not_applicable` ở cả hai test.

- [ ] **Step 4: Chụp trong `confirmSubmission`**

Trong nhánh tạo mới VÀ nhánh cập nhật của `submission.service.ts`, sau khi dòng tới `collected`, tính và ghi:

```ts
  /**
   * Bản chụp danh sách kỳ vọng, render theo đúng em đang nộp.
   *
   * Chụp ở ĐÂY chứ không tra lại trong job vì `machineName` chỉ sống trong
   * socket. Nó cũng đóng luôn khe "giảng viên sửa luật sau khi em nộp" —
   * trong phạm vi MỘT LẦN NỘP; nộp lại sẽ chụp lại theo luật mới, và đó là
   * hành vi đúng (spec §5.2).
   */
  private async snapshotExpectedEntries(
    manager: EntityManager,
    submissionId: string,
    deliverableId: string,
    identity: AgentIdentity,
    roomName: string,
  ): Promise<boolean> {
    const entries = await manager.find(RequiredDeliverableEntryEntity, {
      where: { requiredDeliverableId: deliverableId },
      order: { createdAt: 'ASC' },
    });
    if (entries.length === 0) {
      await manager.update(SubmissionEntity, submissionId, {
        archiveCheckStatus: 'not_applicable',
        archiveExpectedEntries: null,
        archiveMissingEntries: null,
        archiveCheckError: null,
      });
      return false;
    }

    const context = {
      studentMssv: identity.studentId,
      studentName: identity.fullName,
      roomName,
      machineName: identity.machineName ?? null,
    };
    await manager.update(SubmissionEntity, submissionId, {
      archiveExpectedEntries: entries.map((e) => renderFilename(e.entryName, context)),
      archiveCheckStatus: 'pending',
      archiveMissingEntries: null,
      archiveCheckError: null,
    });
    return true;
  }
```

> Thứ tự hai trường trong cùng một `update`: `archive_expected_entries` và `archive_check_status` phải đi CÙNG câu lệnh, nếu không `ck_submission_archive_snapshot` từ chối.

- [ ] **Step 5: Enqueue SAU commit**

Ở chỗ gọi (ngoài `dataSource.transaction`):

```ts
    const needsCheck = await this.dataSource.transaction(async (manager) => {
      // ... đường cũ, rồi:
      return this.snapshotExpectedEntries(manager, row.id, dto.requiredDeliverableId, identity, roomName);
    });

    // NGOÀI giao dịch, có chủ ý. Enqueue bên trong thì worker có thể nhấc
    // job lên và đọc dòng TRƯỚC khi commit — thấy dòng chưa có bản chụp,
    // hoặc chưa tồn tại (spec §5.3.1).
    //
    // Cái giá: enqueue hỏng ở đây (Redis rớt) để lại một dòng `pending`
    // không có job. Không có timeout nào tự vớt. Đó là việc của
    // POST :id/archive-recheck (Task 7).
    if (needsCheck) {
      try {
        await this.archiveCheckQueue.add('check', { submissionId: row.id });
      } catch (error) {
        this.logger.error(
          `Không đẩy được job kiểm file nén cho submission ${row.id} — dùng "Kiểm lại" để chạy tay`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }
```

- [ ] **Step 6: Đăng ký queue trong module**

Trong `submission.module.ts`: `BullModule.registerQueue({ name: ARCHIVE_CHECK_QUEUE })` và `TypeOrmModule.forFeature([... , RequiredDeliverableEntryEntity])`.

- [ ] **Step 7: Chạy e2e, xác nhận xanh**

```bash
cd apps/api && pnpm test:e2e -- archive-check
```
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/submission apps/api/src/exam-session/exam-session.gateway.ts apps/api/test/archive-check.e2e-spec.ts
git commit -m "feat(submission): chụp danh sách kỳ vọng lúc nộp, đẩy job sau commit"
```

---

## Task 6: Processor — chạy phép kiểm

**Files:**
- Create: `apps/api/src/submission/archive-check/archive-check.service.ts`
- Create: `apps/api/src/submission/archive-check/archive-check.processor.ts`
- Modify: `apps/api/src/storage/storage.service.ts` (thêm `getObjectSize`)
- Modify: `apps/api/src/submission/submission.module.ts`
- Test: `apps/api/test/archive-check.e2e-spec.ts` (mở rộng)

**Interfaces:**
- Consumes: `matchEntries` (Task 2), `detectArchiveFormat`/`listArchiveEntries` (Task 3), `StorageService`
- Produces: `ArchiveCheckService.checkOne(submissionId: string): Promise<void>`; `StorageService.getObjectSize(key: string): Promise<number | null>`

- [ ] **Step 1: Thêm `getObjectSize` vào StorageService**

```ts
  /**
   * Kích thước THẬT của object, từ metadata của storage.
   *
   * KHÔNG dùng `submission.file_size` cho việc này: cột đó lấy từ
   * `ConfirmSubmissionDto.fileSize`, tức con số AGENT KHAI. Một cửa chặn
   * dựng trên nó nằm trong tay đúng bên nó phải chặn — khai `fileSize: 1`
   * rồi đẩy 5GB là qua sạch (spec §10.2).
   */
  async getObjectSize(key: string): Promise<number | null> {
    try {
      const head = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return head.ContentLength ?? null;
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }
```

- [ ] **Step 2: Viết test cửa chặn kích thước TRƯỚC**

```ts
it('object lớn hơn trần → unreadable, và KHÔNG gọi getObject', async () => {
  jest.spyOn(storage, 'getObjectSize').mockResolvedValue(ARCHIVE_CHECK_MAX_BYTES + 1);
  const getObject = jest.spyOn(storage, 'getObject');
  await service.checkOne(submissionId);
  const row = await repo.findOneByOrFail({ id: submissionId });
  expect(row.archiveCheckStatus).toBe('unreadable');
  expect(row.archiveCheckError).toContain('quá lớn');
  expect(getObject).not.toHaveBeenCalled();
});

// Test chứng minh cửa chặn KHÔNG dựng trên số client khai. Thiếu nó thì lỗ
// bảo mật lặng lẽ quay lại ở lần refactor sau.
it('HeadObject báo 5GB trong khi file_size khai 1 byte → vẫn unreadable', async () => {
  await repo.update(submissionId, { fileSize: '1' });
  jest.spyOn(storage, 'getObjectSize').mockResolvedValue(5 * 1024 * 1024 * 1024);
  await service.checkOne(submissionId);
  expect((await repo.findOneByOrFail({ id: submissionId })).archiveCheckStatus).toBe('unreadable');
});
```

- [ ] **Step 3: Chạy, xác nhận đỏ**

```bash
cd apps/api && pnpm test:e2e -- archive-check
```
Expected: FAIL — `checkOne` chưa tồn tại.

- [ ] **Step 4: Viết `ArchiveCheckService`**

```ts
@Injectable()
export class ArchiveCheckService {
  private readonly logger = new Logger(ArchiveCheckService.name);

  constructor(
    @InjectRepository(SubmissionEntity) private readonly submissions: Repository<SubmissionEntity>,
    private readonly storage: StorageService,
  ) {}

  async checkOne(submissionId: string): Promise<void> {
    const row = await this.submissions.findOneBy({ id: submissionId });
    if (!row || row.archiveCheckStatus === 'not_applicable' || !row.archiveExpectedEntries) {
      return;
    }
    if (!row.storageKey) {
      await this.markUnreadable(submissionId, 'Bài nộp không có file trên kho lưu trữ.');
      return;
    }

    const size = await this.storage.getObjectSize(row.storageKey);
    if (size === null) {
      await this.markUnreadable(submissionId, 'Không tìm thấy file trên kho lưu trữ.');
      return;
    }
    if (size > ARCHIVE_CHECK_MAX_BYTES) {
      await this.markUnreadable(
        submissionId,
        `File quá lớn để mở ra kiểm (${size} byte, trần ${ARCHIVE_CHECK_MAX_BYTES}).`,
      );
      return;
    }

    const buffer = await this.storage.getObject(row.storageKey);
    const format = detectArchiveFormat(buffer);
    if (format === 'unknown') {
      await this.markUnreadable(submissionId, 'File không phải định dạng .zip hay .rar đọc được.');
      return;
    }

    let actual: string[];
    try {
      actual = await listArchiveEntries(buffer, format);
    } catch (error) {
      await this.markUnreadable(submissionId, describeError(error));
      return;
    }

    const missing = matchEntries(row.archiveExpectedEntries, actual);
    await this.submissions.update(submissionId, {
      archiveCheckStatus: missing.length === 0 ? 'passed' : 'failed',
      archiveMissingEntries: missing.length === 0 ? [] : missing,
      archiveCheckError: null,
    });
  }

  /**
   * `public` chứ không `private`: processor gọi nó ở nhánh hết-lần-thử để
   * đảm bảo trạng thái cuối luôn là một kết luận (spec §12.3).
   */
  async markUnreadable(submissionId: string, reason: string): Promise<void> {
    await this.submissions.update(submissionId, {
      archiveCheckStatus: 'unreadable',
      archiveMissingEntries: null,
      archiveCheckError: reason,
    });
  }
}
```

Mọi chỗ trên gọi `this.markUnreadable(...)` — **không** có phương thức `fail` nào; một tên duy nhất cho một việc.

`describeError` là chuỗi ĐÃ XỬ LÝ, không phải message thô của thư viện — cùng luật mà `ungradable_reason` đang theo. Dùng lại helper sẵn có nếu có, nếu không thì:

```ts
function describeError(error: unknown): string {
  if (error instanceof ArchiveTooManyEntriesError) return error.message;
  if (error instanceof ArchiveUnreadableError) {
    return `Không mở được file nén: ${error.message}`;
  }
  return 'Không mở được file nén.';
}
```

- [ ] **Step 5: Viết processor**

```ts
/**
 * Queue RIÊNG, không dùng chung GRADING_QUEUE: nhịp bên kia là hạn mức
 * token của API AI, còn ràng buộc ở đây là RAM của container. Trộn vào là
 * để cấu hình của bên này đổi ngầm hành vi bên kia.
 */
@Processor(ARCHIVE_CHECK_QUEUE, { concurrency: ARCHIVE_CHECK_CONCURRENCY })
export class ArchiveCheckProcessor extends WorkerHost {
  private readonly logger = new Logger(ArchiveCheckProcessor.name);

  constructor(private readonly archiveCheck: ArchiveCheckService) {
    super();
  }

  async process(job: Job<{ submissionId: string }>): Promise<void> {
    await this.archiveCheck.checkOne(job.data.submissionId);
  }

  // Ba lần thử với backoff: lỗi ở đây gần như luôn là storage chập chờn,
  // loại tự hết. Không có lớp phân loại lỗi vĩnh viễn như GradingProcessor
  // vì không có lời gọi API bên ngoài nào để hỏng theo kiểu 4xx.

  /**
   * Trạng thái cuối phải luôn là một KẾT LUẬN — spec §12.3. Hết lần thử mà
   * vẫn `pending` thì bài đó trông như "đang chạy" mãi mãi, và giảng viên
   * tin là hệ thống còn đang làm việc.
   */
  @OnWorkerEvent('failed')
  async onFailed(job: Job<{ submissionId: string }>): Promise<void> {
    if ((job.attemptsMade ?? 0) < (job.opts.attempts ?? 1)) return;
    await this.archiveCheck.markUnreadable(
      job.data.submissionId,
      'Không kiểm được sau nhiều lần thử. Bấm "Kiểm lại" để chạy lại.',
    );
  }
}
```

> `markUnreadable` là `fail` ở Step 4, đổi sang `public`.

- [ ] **Step 6: Nối vào module + chạy test**

Thêm `ArchiveCheckService`, `ArchiveCheckProcessor` vào `providers` của `submission.module.ts`, `StorageModule` vào `imports`.

```bash
cd apps/api && pnpm test:e2e -- archive-check
```
Expected: PASS.

- [ ] **Step 7: Thêm test cho đủ các kết luận**

zip đủ → `passed`; zip thiếu → `failed` + đúng danh sách; zip hỏng → `unreadable` + có `archiveCheckError`; rar4 và rar5 thật → `passed`; rar mã hoá header → `unreadable`.

```bash
cd apps/api && pnpm test:e2e -- archive-check
```
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/submission apps/api/src/storage/storage.service.ts
git commit -m "feat(archive-check): processor chạy phép kiểm, chặn kích thước bằng HeadObject"
```

---

## Task 7: Đường kiểm lại thủ công

**Files:**
- Modify: `apps/api/src/exam-session/exam-session.controller.ts`
- Create: `apps/api/src/exam-session/archive-recheck.service.ts`
- Test: `apps/api/test/archive-check.e2e-spec.ts` (mở rộng)

**Interfaces:**
- Produces: `POST /exam-sessions/:id/archive-recheck` → `{ requeued: number }`

- [ ] **Step 1: Viết e2e trước**

```ts
it('xếp hàng lại các bài failed/unreadable/pending, KHÔNG đụng bytes bài nộp', async () => {
  const before = await repo.findOneByOrFail({ id: submissionId });
  await request(app).post(`/exam-sessions/${sessionId}/archive-recheck`).set(auth).expect(201);
  const after = await repo.findOneByOrFail({ id: submissionId });
  expect(after.storageKey).toBe(before.storageKey);
  expect(after.checksum).toBe(before.checksum);
  expect(after.submittedAt).toEqual(before.submittedAt);
  expect(after.archiveCheckStatus).toBe('pending');
});

it('không đụng bài not_applicable', async () => {
  await repo.update(otherId, { archiveCheckStatus: 'not_applicable' });
  const res = await request(app)
    .post(`/exam-sessions/${sessionId}/archive-recheck`)
    .set(auth)
    .expect(201);
  expect((await repo.findOneByOrFail({ id: otherId })).archiveCheckStatus).toBe('not_applicable');
  expect(res.body.requeued).toBe(1);
});

it('phiên của giảng viên khác → 404/403', async () => {
  await request(app)
    .post(`/exam-sessions/${sessionId}/archive-recheck`)
    .set(otherTeacherAuth)
    .expect((r) => expect([403, 404]).toContain(r.status));
});
```

- [ ] **Step 2: Chạy, xác nhận đỏ** — `cd apps/api && pnpm test:e2e -- archive-check`. Expected: 404.

- [ ] **Step 3: Viết service**

```ts
@Injectable()
export class ArchiveRecheckService {
  constructor(
    @InjectRepository(SubmissionEntity) private readonly submissions: Repository<SubmissionEntity>,
    private readonly examSessions: ExamSessionService,
    @InjectQueue(ARCHIVE_CHECK_QUEUE) private readonly queue: Queue,
  ) {}

  /**
   * ĐỌC-RỒI-XẾP-HÀNG, không đổi một byte nào của bài nộp: `storage_key`,
   * `checksum`, `submitted_at`, `status` đều không đụng tới. Bấm bao nhiêu
   * lần cũng được — cùng tính chất như "Thu lại".
   *
   * Bản chụp GIỮ NGUYÊN, không render lại. Nó là sự thật tại thời điểm em
   * nộp, và render lại bây giờ sẽ cho ra 'UNKNOWN' ở `{SOMAY}` vì socket
   * đã đóng từ lâu (spec §5.2).
   */
  async requeue(examSessionId: string, teacherId: string): Promise<{ requeued: number }> {
    await this.examSessions.findEntityForOwner(examSessionId, teacherId);

    const targets = await this.submissions.find({
      where: {
        examSessionId,
        archiveCheckStatus: In(['failed', 'unreadable', 'pending']),
        archiveExpectedEntries: Not(IsNull()),
      },
      select: { id: true },
    });
    if (targets.length === 0) {
      return { requeued: 0 };
    }

    await this.submissions.update(
      { id: In(targets.map((t) => t.id)) },
      { archiveCheckStatus: 'pending', archiveMissingEntries: null, archiveCheckError: null },
    );
    await this.queue.addBulk(
      targets.map((t) => ({ name: 'check', data: { submissionId: t.id } })),
    );
    return { requeued: targets.length };
  }
}
```

- [ ] **Step 4: Thêm route**

```ts
  @Post(':id/archive-recheck')
  @Roles('teacher', 'admin')
  archiveRecheck(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtUser) {
    return this.archiveRecheck.requeue(id, user.sub);
  }
```
Cùng guard như mọi route khác của phiên. Bấm nhiều lần vô hại.

- [ ] **Step 5: Chạy test, xác nhận xanh** — Expected: PASS.

- [ ] **Step 6: Regenerate API client**

```bash
pnpm --filter api dev
pnpm --filter @cine/shared generate:api-client
pnpm --filter web build
```

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/exam-session packages/shared/src/api/schema.d.ts apps/api/test
git commit -m "feat(exam-session): đường kiểm lại file nén thủ công"
```

---

## Task 8: Lan ra — recollect, overview, attention, nghỉ hưu `invalid`

**Files:**
- Modify: `apps/api/src/exam-session/recollect.service.ts:45-72`
- Modify: `apps/api/src/submission/submission-overview.service.ts`, `submission-overview.types.ts`
- Modify: `apps/web/src/lib/submission-attention.ts`
- Modify: `apps/api/src/submission/submission.service.ts:472` (ghi chú TODO)
- Test: `apps/api/test/recollect.e2e-spec.ts`, `apps/web/src/lib/submission-attention.test.ts`

- [ ] **Step 1: Viết test recollect trước**

```ts
it('em nộp đủ file nhưng zip thiếu nội dung VẪN nằm trong danh sách thu lại', async () => {
  await repo.update(submissionId, {
    archiveCheckStatus: 'failed',
    archiveMissingEntries: ['Main.java'],
  });
  const result = await recollect.requestRecollect(sessionId, teacherId);
  expect(result.missing.map((s) => s.mssv)).toContain('2180123');
});

it('pending KHÔNG tính là thiếu — chưa có kết luận thì chưa kết luận', async () => {
  await repo.update(submissionId, { archiveCheckStatus: 'pending' });
  const result = await recollect.requestRecollect(sessionId, teacherId);
  expect(result.missing.map((s) => s.mssv)).not.toContain('2180123');
});
```

- [ ] **Step 2: Chạy, xác nhận đỏ** — `cd apps/api && pnpm test:e2e -- recollect`.

- [ ] **Step 3: Sửa `findMissing`**

Đổi CTE `collected` thành:

```sql
       collected AS (
         SELECT student_mssv, COUNT(*)::int AS n
           FROM examcollect.submission
          WHERE exam_session_id = $1
            AND status = 'collected'
            -- Một bài về tới nơi nhưng bên trong thiếu file thì CHƯA xong.
            -- `pending` không tính là thiếu: chưa có kết luận thì chưa kết
            -- luận (spec §8.1).
            AND archive_check_status NOT IN ('failed', 'unreadable')
          GROUP BY student_mssv
       )
```

- [ ] **Step 4: Chạy test, xác nhận xanh** — Expected: PASS.

- [ ] **Step 5: Thêm `archiveIssueCount` vào overview**

`submission-overview.types.ts`: thêm `archiveIssueCount: number;` cạnh `invalidFileCount`. Trong service, đếm `archive_check_status IN ('failed','unreadable')`.

> **Không tái dụng `invalidFileCount`.** Nó đếm một khái niệm khác; trộn hai thứ vào một số là làm cả hai không đọc được.

- [ ] **Step 6: Thêm lý do cảnh báo mới + sửa hai ghi chú "nghỉ hưu"**

Trong `submission-attention.ts`, thêm một `AttentionReason` đếm `archiveIssueCount`, chịu đúng ba cổng chặn sẵn có (`archived`/`closed` → `ended` → `hasRatio`). Và sửa ghi chú ở dòng ~122:

```ts
 * `invalidFileCount` KHÔNG sinh lý do, và từ 2026-09-22 đây là một QUYẾT
 * ĐỊNH, không phải việc còn dở: `submission_status = 'invalid'` đã NGHỈ HƯU
 * (spec 2026-09-21-archive-content-validation §8.2). Mọi kết luận về nội
 * dung bài nộp đi qua `archiveIssueCount` ngay bên dưới. Đừng implement
 * nhánh `'invalid'` — nó sẽ là tín hiệu thứ hai cho cùng một mối lo.
```

Sửa TODO ở `submission.service.ts:472` y như vậy: nó đang mời người sau đi làm đúng cái bẫy một chiều mà thiết kế này tránh.

- [ ] **Step 7: Chạy test web + api**

```bash
cd apps/web && pnpm test -- submission-attention
cd apps/api && pnpm test && pnpm lint
```
Expected: PASS cả ba.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src apps/web/src/lib apps/api/test
git commit -m "feat: thu lại tính cả zip thiếu nội dung, và cho 'invalid' nghỉ hưu"
```

---

## Task 9: Biểu mẫu tạo phiên thi

**Files:**
- Create: `apps/web/src/app/teacher/exam-sessions/new/_components/ArchiveEntriesField.tsx`
- Modify: `apps/web/src/app/teacher/exam-sessions/new/schema.ts`
- Modify: `apps/web/src/app/teacher/exam-sessions/new/page.tsx`
- Test: `apps/web/src/app/teacher/exam-sessions/new/schema.test.ts`

- [ ] **Step 1: Viết test Zod trước**

```ts
it('cho khai entries khi tên file là .zip', () => {
  const r = createExamSessionSchema.safeParse({ ...valid,
    requiredFilenames: [{ value: 'a.zip', entries: [{ value: 'Main.java' }] }] });
  expect(r.success).toBe(true);
});

it('TỪ CHỐI entries khi tên file là .docx — phải khớp DTO backend', () => {
  const r = createExamSessionSchema.safeParse({ ...valid,
    requiredFilenames: [{ value: 'a.docx', entries: [{ value: 'Main.java' }] }] });
  expect(r.success).toBe(false);
});

it('TỪ CHỐI entry có dấu "/" — khớp theo tên nên đường dẫn là vô nghĩa', () => {
  const r = createExamSessionSchema.safeParse({ ...valid,
    requiredFilenames: [{ value: 'a.zip', entries: [{ value: 'src/Main.java' }] }] });
  expect(r.success).toBe(false);
});

it('TỪ CHỐI quá 20 entry', () => {
  const entries = Array.from({ length: 21 }, (_, i) => ({ value: `f${i}.java` }));
  const r = createExamSessionSchema.safeParse({ ...valid,
    requiredFilenames: [{ value: 'a.zip', entries }] });
  expect(r.success).toBe(false);
});

it('.ZIP viết hoa vẫn được khai entries', () => {
  const r = createExamSessionSchema.safeParse({ ...valid,
    requiredFilenames: [{ value: 'BaiThi.ZIP', entries: [{ value: 'Main.java' }] }] });
  expect(r.success).toBe(true);
});
```

- [ ] **Step 2: Chạy, xác nhận đỏ** — `cd apps/web && pnpm test -- schema`.

- [ ] **Step 3: Sửa Zod schema**

Thêm `entries` vào từng phần tử `requiredFilenames`, cùng regex và cùng thông báo lỗi với backend, cùng trần 20, cùng luật "chỉ với .zip/.rar". File này đã tự ghi rằng regex phải **byte-for-byte** khớp backend — giữ đúng lời hứa đó.

- [ ] **Step 4: Viết component**

Khối gập, hiện **khi và chỉ khi** tên file đang gõ kết thúc `.zip`/`.rar` (không phân biệt hoa thường). Tiêu đề *"Kiểm file bên trong (tuỳ chọn)"*. Bên trong là một danh sách nhập giống hệt danh sách ngoài.

Kèm một dòng chữ **bắt buộc** (spec §12.2):

> "Hệ thống kiểm sau khi thu bài. Sinh viên KHÔNG được cảnh báo lúc đang thi."

Thiếu dòng này thì giảng viên sẽ tưởng hệ thống có nhắc sinh viên.

- [ ] **Step 5: Gõ lại thành `.docx` thì xoá entries đã nhập**

Không giữ ngầm: giữ lại sẽ gửi lên một danh sách mà DTO từ chối, và người dùng không hiểu vì sao.

- [ ] **Step 6: Chạy test + build**

```bash
cd apps/web && pnpm test && pnpm lint && pnpm build
```
Expected: PASS cả ba.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/teacher/exam-sessions/new
git commit -m "feat(web): khai file bên trong ngay ở biểu mẫu tạo phiên thi"
```

---

## Task 10: Màn bài nộp

**Files:**
- Modify: `apps/web/src/app/teacher/submissions/[sessionId]/page.tsx`
- Modify: `apps/web/src/lib/api/submissions.ts`
- Modify: `apps/web/src/lib/submission-rows.ts`
- Test: `apps/web/src/app/teacher/submissions/[sessionId]/page.test.tsx`

- [ ] **Step 1: Viết test trước**

```ts
it('failed hiện thẳng tên file thiếu, không giấu sau một cú bấm', () => {
  render(<Page {...props(submission({ archiveCheckStatus: 'failed',
    archiveMissingEntries: ['Main.java', 'BaoCao.docx'] }))} />);
  expect(screen.getByText(/Main\.java/)).toBeInTheDocument();
  expect(screen.getByText(/BaoCao\.docx/)).toBeInTheDocument();
});

it('pending hiện "Đang kiểm", KHÔNG để trống', () => {
  // Ô trống lúc chờ trông giống hệt một bài đã kiểm và đạt — kiểu nói dối
  // im lặng tệ nhất (spec §7).
  render(<Page {...props(submission({ archiveCheckStatus: 'pending' }))} />);
  expect(screen.getByText(/Đang kiểm/)).toBeInTheDocument();
});

it('unreadable hiện lý do, không chỉ chữ "hỏng"', () => {
  render(<Page {...props(submission({ archiveCheckStatus: 'unreadable',
    archiveCheckError: 'File quá lớn để mở ra kiểm (300000000 byte, trần 209715200).' }))} />);
  expect(screen.getByText(/quá lớn để mở ra kiểm/)).toBeInTheDocument();
});

it('not_applicable không hiện gì về file nén', () => {
  render(<Page {...props(submission({ archiveCheckStatus: 'not_applicable' }))} />);
  expect(screen.queryByText(/Đang kiểm|Thiếu:|Không mở được/)).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Chạy, xác nhận đỏ** — `cd apps/web && pnpm test -- submissions`.

- [ ] **Step 3: Hiển thị theo bảng §7 của spec**

| status | hiện gì |
|---|---|
| `not_applicable` | không gì |
| `pending` | "Đang kiểm" |
| `passed` | dấu đủ |
| `failed` | "Thiếu: `Main.java`, `BaoCao.docx`" |
| `unreadable` | "Không mở được: <`archiveCheckError`>" |

- [ ] **Step 4: Thêm nút "Kiểm lại"**

Gọi `POST /exam-sessions/:id/archive-recheck`. Đặt cạnh "Thu lại". Tooltip nói rõ nó **không đụng bài nộp**, chỉ chạy lại phép kiểm — để giảng viên dám bấm.

- [ ] **Step 5: Chạy test + build**

```bash
cd apps/web && pnpm test && pnpm lint && pnpm build
```
Expected: PASS.

- [ ] **Step 6: Chạy toàn bộ e2e lần cuối**

```bash
# kill jest/nest mồ côi trước, Postgres + MinIO + bucket đã sẵn sàng
cd apps/api && pnpm test && pnpm test:e2e && pnpm lint
```
Expected: PASS hết.

- [ ] **Step 7: Kiểm chứng agent cũ không bị ảnh hưởng (spec §12.5)**

Chạy `pnpm --filter agent mock-agent` bằng **bản build cũ** nếu còn, hoặc xác nhận bằng đọc: `agent:join:ack` giữ nguyên hình dạng, `submission:confirm` giữ nguyên tham số. Bản Electron portable đã phát cho phòng máy không cập nhật theo server, nên đây không phải chuyện lý thuyết.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): hiện kết quả kiểm file nén và nút kiểm lại"
```

---

## Sau khi xong

Theo HANDOFF RULE trong `CLAUDE.md`: gọi `@code-reviewer` review trước khi báo done. Không báo "xong" nếu chưa có VERDICT.

Trước khi mở PR, **trả `apps/api/.env` về Supabase** nếu bạn đã đổi nó ở Task 1 Step 1 — và đừng commit file đó.
