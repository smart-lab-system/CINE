import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * P0 đo nền: hai cột cho `grading_attempt`, chỉ thêm, cho phép rỗng, không backfill (lượt cũ không
 * có số liệu này và không bịa ra). `cost_usd` đã có từ `1789450000000` nhưng chưa ai ghi.
 *
 * Trigger `guard_grading_attempt_immutable` chỉ chặn UPDATE khi `OLD.outcome IS NOT NULL`; các cột
 * mới được ghi trong CÙNG câu `UPDATE` đặt `outcome`, nên không bị chặn.
 */
export class AttemptUsageAndPrompt1789570000000 implements MigrationInterface {
  name = 'AttemptUsageAndPrompt1789570000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "examcollect"."grading_attempt" ADD COLUMN "prompt_version" character varying(40)`);
    await queryRunner.query(`ALTER TABLE "examcollect"."grading_attempt" ADD COLUMN "usage_by_model" jsonb`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "examcollect"."grading_attempt" DROP COLUMN IF EXISTS "usage_by_model"`);
    await queryRunner.query(`ALTER TABLE "examcollect"."grading_attempt" DROP COLUMN IF EXISTS "prompt_version"`);
  }
}
