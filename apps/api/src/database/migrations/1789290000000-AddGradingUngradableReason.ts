import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `markUngradable` (grading.service.ts) chỉ LOG lý do AI không chấm
 * được — chưa từng ghi vào DB. Sự cố thật 2026-09-17 (tài khoản
 * Anthropic hết credit, bài của HS24001 phiên "Thi cuối kỳ lập trình
 * web 2026") mất cả buổi điều tra vì câu trả lời duy nhất nằm trong log
 * terminal của đúng lần chạy đó — không truy lại được sau khi log xoay
 * vòng, và không ai nhớ chính xác thời điểm để đi tìm log cũ.
 *
 * `TEXT`, không giới hạn độ dài như `model_used varchar(100)`: đây là
 * một câu mô tả lỗi (đã qua `describeError()`, an toàn hiển thị), không
 * phải một mã định danh ngắn.
 *
 * KHÔNG thêm vào `guard_grading_result_ai_immutable`: guard đó chỉ khoá
 * khi `OLD.ai_total_score IS NOT NULL`, còn `markUngradable` chỉ chạy
 * khi `ai_total_score` CÒN NULL (early-return theo `status !==
 * 'ai_grading'` chặn mọi lần gọi lại sau đó) — hai nhánh loại trừ lẫn
 * nhau ngay từ code, không cần thêm ràng buộc DB cho một điều đã đúng.
 */
export class AddGradingUngradableReason1789290000000 implements MigrationInterface {
  name = 'AddGradingUngradableReason1789290000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "examcollect"."grading_result"
      ADD COLUMN "ungradable_reason" text
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "examcollect"."grading_result"
      DROP COLUMN "ungradable_reason"
    `);
  }
}
