import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Đáp án mẫu gói: file đơn hoặc zip (folder nén phía client).
 * Backfill row đã có storage key → file.
 */
export class GradingReferenceModelAnswerPackageKind1790600000000
  implements MigrationInterface
{
  name = 'GradingReferenceModelAnswerPackageKind1790600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "examcollect"."grading_reference"
        ADD COLUMN "model_answer_package_kind" varchar(8) NULL
    `);
    await queryRunner.query(`
      UPDATE "examcollect"."grading_reference"
         SET "model_answer_package_kind" = 'file'
       WHERE "model_answer_storage_key" IS NOT NULL
         AND "model_answer_package_kind" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "examcollect"."grading_reference"
        DROP COLUMN IF EXISTS "model_answer_package_kind"
    `);
  }
}
