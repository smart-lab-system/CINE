import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Lý do tính lại `criterion_waiver` (§14.3: đánh dấu / gỡ đánh dấu *"tiêu chí không có luật trừ"*
 * là một lượt tính lại tầng luật). §14.1 chưa kể nó trong enum; mượn nhãn khác là ghi sai lịch sử.
 */
export class ScoreReasonCriterionWaiver1789470000000 implements MigrationInterface {
  name = 'ScoreReasonCriterionWaiver1789470000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TYPE "examcollect"."score_computation_reason" ADD VALUE IF NOT EXISTS 'criterion_waiver'`);
  }

  public async down(): Promise<void> {
    throw new Error('ScoreReasonCriterionWaiver1789470000000: không hoàn được — Postgres không bỏ được giá trị enum');
  }
}
