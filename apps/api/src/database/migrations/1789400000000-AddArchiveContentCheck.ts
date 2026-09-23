import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Kiểm nội dung file nén — spec
 * `docs/superpowers/specs/2026-09-21-archive-content-validation-design.md` §4.
 *
 * Kết quả là DỮ LIỆU, không phải TRẠNG THÁI: migration này KHÔNG đụng
 * `validate_submission_lifecycle` và không sinh `submission.status='invalid'`.
 *
 * Lý do đầy đủ ở spec §3.3, tóm tắt hai ý: trigger vòng đời không có đường
 * ra khỏi `invalid`, nên một em nén lại nộp lần hai sẽ mang dấu hỏng vĩnh
 * viễn; và một enum status không chở được "thiếu file nào", vốn là thứ
 * giảng viên thật sự cần. Cột dữ liệu là thứ phải có dù chọn hướng nào, nên
 * lật thêm status chỉ thêm một cái bẫy một chiều mà không thêm thông tin.
 */
export class AddArchiveContentCheck1789400000000 implements MigrationInterface {
  name = 'AddArchiveContentCheck1789400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ------------------------------------------------------------ khai báo
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

    // Mọi bảng khác trong schema này đều gắn trigger này; thiếu nó thì
    // `updated_at` đứng im mãi ở giá trị lúc insert.
    await queryRunner.query(`
      CREATE TRIGGER "set_updated_at_required_deliverable_entry"
        BEFORE UPDATE ON "examcollect"."required_deliverable_entry"
        FOR EACH ROW EXECUTE FUNCTION examcollect.set_updated_at()
    `);

    // ------------------------------------------------------------ kết quả
    await queryRunner.query(`
      CREATE TYPE "examcollect"."archive_check_status" AS ENUM (
        'not_applicable', 'pending', 'passed', 'failed', 'unreadable'
      )
    `);

    // Năm nhãn chứ không phải một mảng trần, và đây là bài học của
    // `AddAdvocateOutcome1789310000000` — migration đó sinh ra vì
    // `advocate_opinion = NULL` mang ba nghĩa cùng lúc và làm nhiễu số liệu
    // calibration. Nếu ở đây chỉ có `archive_missing_entries` thì NULL sẽ
    // mang BỐN nghĩa: không phải kiểm / chưa kiểm xong / mở không ra / đã
    // kiểm và đạt.
    //
    // `unreadable` tách khỏi `failed` vì hai bên dẫn tới hai hành động khác
    // nhau: "em nộp thiếu file" thì nhắc em nén lại, còn "file mở không ra"
    // thì phải xem tay. Gộp vào một chữ là bắt giảng viên đi đoán.
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
    // Hôm nay `submission:confirm` là đường DUY NHẤT tới `collected`:
    // `submittedVia: 'normal'` là chỗ ghi duy nhất trong cả codebase, và hai
    // nhãn `backup`/`manual_pull` tồn tại trong enum nhưng không gì sinh ra
    // chúng (`backup.ts` nói thẳng một snapshot không bao giờ thành bài nộp).
    //
    // Ngày ai đó viết đường backup thật mà không biết về bản chụp, `{SOMAY}`
    // sẽ render thành 'UNKNOWN' — vì `machineName` chỉ sống trong socket —
    // và đánh trượt oan đúng nhóm em đã gặp sự cố máy móc, trong im lặng.
    // Một quy ước viết trong spec không chặn được chuyện đó; ràng buộc này
    // bắt nó nổ tại đúng câu lệnh gây ra nó.
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
    // Bảng bỏ sau cùng: trigger và unique index đi theo nó.
    await queryRunner.query(`DROP TABLE IF EXISTS "examcollect"."required_deliverable_entry"`);
  }
}
