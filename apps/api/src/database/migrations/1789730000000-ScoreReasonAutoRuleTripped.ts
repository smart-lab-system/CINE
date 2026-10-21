import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Lý do tính lại `auto_rule_tripped` (spec duyệt nhanh 2026-10-21 §5.3): cầu dao của một luật hoặc của
 * lớp bài không lỗi vừa tắt, và các bài chưa chốt thuộc phạm vi đó được quyết lại. Không phải đổi giá,
 * không phải bản sửa luật — mượn nhãn khác là ghi sai lịch sử (tiền lệ `1789470000000`, `1789490000000`).
 *
 * Một giá trị enum nằm ở migration riêng: Postgres không cho dùng giá trị vừa `ADD VALUE` trong cùng
 * giao dịch với lệnh dùng nó.
 */
export class ScoreReasonAutoRuleTripped1789730000000 implements MigrationInterface {
  name = 'ScoreReasonAutoRuleTripped1789730000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TYPE "examcollect"."score_computation_reason" ADD VALUE IF NOT EXISTS 'auto_rule_tripped'`);
  }

  public async down(): Promise<void> {
    throw new Error('ScoreReasonAutoRuleTripped1789730000000: không hoàn được — Postgres không bỏ được giá trị enum');
  }
}
