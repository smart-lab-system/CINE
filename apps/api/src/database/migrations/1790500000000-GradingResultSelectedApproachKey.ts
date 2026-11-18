import { MigrationInterface, QueryRunner } from 'typeorm';
import { AI_OUTPUT_COLUMNS, rebuildAiImmutableGuardSql } from './support/ai-immutable-guard';

/**
 * UC33 QS: lưu cách giải AI (hoặc fallback) đã chọn lúc chấm.
 * Ghi cùng lượt với `ai_total_score` — thêm vào AI_OUTPUT_COLUMNS để bất biến sau đó.
 */
export class GradingResultSelectedApproachKey1790500000000 implements MigrationInterface {
  name = 'GradingResultSelectedApproachKey1790500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "examcollect"."grading_result"
        ADD COLUMN "selected_approach_key" varchar(120) NULL
    `);
    await queryRunner.query(rebuildAiImmutableGuardSql(AI_OUTPUT_COLUMNS));
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const without = AI_OUTPUT_COLUMNS.filter((c) => c !== 'selected_approach_key');
    await queryRunner.query(rebuildAiImmutableGuardSql(without));
    await queryRunner.query(`
      ALTER TABLE "examcollect"."grading_result"
        DROP COLUMN IF EXISTS "selected_approach_key"
    `);
  }
}
