import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * G2b A2b: CHỈ THÊM. Hai cột trỏ tới MÃ NGUỒN của đáp án mẫu, lưu theo băm nội dung
 * (`grading-reference/<sessionId>/source-<sha256>.<cpp|py>`). Cho phép rỗng: phiên cũ không có mã nguồn.
 * Không thêm ràng buộc ở DB; khuôn khoá và băm do `GradingReferenceService.upsert` kiểm, cùng chỗ kiểm đáp án.
 */
export class GradingReferenceAnswerSource1789670000000 implements MigrationInterface {
  name = 'GradingReferenceAnswerSource1789670000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE "examcollect"."grading_reference"
        ADD COLUMN "model_answer_source_key" text,
        ADD COLUMN "model_answer_source_sha256" varchar(64)`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE "examcollect"."grading_reference"
        DROP COLUMN IF EXISTS "model_answer_source_sha256",
        DROP COLUMN IF EXISTS "model_answer_source_key"`);
  }
}
