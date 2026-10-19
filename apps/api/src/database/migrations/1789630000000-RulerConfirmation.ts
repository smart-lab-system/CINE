import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * P1b 5.3 — giảng viên xác nhận thước (§6.3b): ghi ai và khi nào. Chỉ thêm cột rỗng được.
 *
 * Khoá ngoại thêm bằng NOT VALID rồi VALIDATE riêng: `migrationsTransactionMode` là `none`, nên một lỗi giữa chừng
 * không được để trạng thái dở. NOT VALID vẫn bắt mọi dòng MỚI ngay, nên bước VALIDATE hỏng cũng không để lọt dữ liệu sai.
 */
export class RulerConfirmation1789630000000 implements MigrationInterface {
  name = 'RulerConfirmation1789630000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "examcollect"."grading_reference" ADD COLUMN "ruler_confirmed_by" uuid`);
    await q.query(`ALTER TABLE "examcollect"."grading_reference" ADD COLUMN "ruler_confirmed_at" timestamptz`);
    await q.query(`ALTER TABLE "examcollect"."grading_reference" ADD CONSTRAINT "fk_grading_reference_ruler_confirmed_by"
      FOREIGN KEY ("ruler_confirmed_by") REFERENCES "examcollect"."account"("id") ON DELETE SET NULL NOT VALID`);
    await q.query(`ALTER TABLE "examcollect"."grading_reference" VALIDATE CONSTRAINT "fk_grading_reference_ruler_confirmed_by"`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "examcollect"."grading_reference" DROP CONSTRAINT IF EXISTS "fk_grading_reference_ruler_confirmed_by"`);
    await q.query(`ALTER TABLE "examcollect"."grading_reference" DROP COLUMN IF EXISTS "ruler_confirmed_at"`);
    await q.query(`ALTER TABLE "examcollect"."grading_reference" DROP COLUMN IF EXISTS "ruler_confirmed_by"`);
  }
}
