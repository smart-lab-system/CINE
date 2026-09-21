import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Dấu vết chi phí AI.
 *
 * Xem doc của `AiUsageEntity` để biết vì sao bảng này tồn tại dù spec soạn đề
 * nói "không lưu": nó ghi USAGE, không ghi CONTENT.
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

    // Dashboard chi phí hỏi theo GIẢNG VIÊN và theo THÁNG. Index để câu hỏi
    // đó không phải quét cả bảng khi nó lớn dần qua từng học kỳ.
    await queryRunner.query(
      `CREATE INDEX "ix_ai_usage_teacher_created" ON "examcollect"."ai_usage" ("teacher_id", "created_at" DESC)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "examcollect"."ai_usage"`);
  }
}
