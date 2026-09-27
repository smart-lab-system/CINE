import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Lý do tính lại `session_rule_set` (review 3c I1): một bài của phiên xong SAU mà bảng lỗi lúc nó
 * bắt đầu thiếu một luật lời các bài kia đều có → theo §2.2 *"tất cả hoặc không"*, luật đó thôi
 * được xét cho cả phiên và các bài đã tính của phiên tính lại. Không phải đổi giá, không phải bản
 * sửa luật — mượn nhãn khác là ghi sai lịch sử.
 */
export class ScoreReasonSessionRuleSet1789490000000 implements MigrationInterface {
  name = 'ScoreReasonSessionRuleSet1789490000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TYPE "examcollect"."score_computation_reason" ADD VALUE IF NOT EXISTS 'session_rule_set'`);
  }

  public async down(): Promise<void> {
    throw new Error('ScoreReasonSessionRuleSet1789490000000: không hoàn được — Postgres không bỏ được giá trị enum');
  }
}
