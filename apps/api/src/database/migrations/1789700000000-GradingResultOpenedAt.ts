import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Mốc mở bài của giảng viên — cột `opened_at` trên `grading_result` (spec duyệt nhanh 2026-10-21 §5.5).
 *
 * Nằm trên `grading_result`, không trên `teacher_review`: lúc giảng viên mở bài chưa có dòng
 * `teacher_review` nào, và `ck_teacher_review_score_by_kind` cấm dòng không điểm. Ghi MỘT lần
 * (`WHERE opened_at IS NULL`) — việc đó thuộc service, không thuộc migration.
 *
 * `guard_grading_result_ai_immutable` (dựng lần cuối ở `1789410000000` từ `AI_OUTPUT_COLUMNS`) chỉ so
 * tám cột đầu ra của AI; `opened_at` không nằm trong đó nên ghi được cả khi `ai_total_score` đã có.
 * CHỈ THÊM một cột nullable: không đổi dòng nào, không có giá trị mặc định.
 */
export class GradingResultOpenedAt1789700000000 implements MigrationInterface {
  name = 'GradingResultOpenedAt1789700000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "examcollect"."grading_result" ADD COLUMN "opened_at" timestamptz`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "examcollect"."grading_result" DROP COLUMN "opened_at"`);
  }
}
