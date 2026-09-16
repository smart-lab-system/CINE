import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Luật hàng loạt nào đã sinh ra dòng duyệt này.
 *
 * `null` = duyệt tay từng bài (đường đã có). Khác `null` = do một luật hàng
 * loạt sinh ra, và luật đó đọc lại được từ chính dòng ấy.
 *
 * VÌ SAO KHÔNG DỰA VÀO AUDIT: `review()` chỉ ghi audit khi bài đã công bố
 * (`PUBLISHED.includes(result.status)`). Duyệt hàng loạt TRƯỚC khi chốt điểm
 * — ca thường gặp nhất — không sinh dòng audit nào, nên luật đã áp sẽ biến
 * mất. Khi sinh viên hỏi "vì sao em được điểm này", câu trả lời trung thực
 * "hệ thống lấy mức cao hơn giữa hai lượt chấm trên từng tiêu chí" phải tái
 * dựng được từ dữ liệu, không phải từ trí nhớ của giảng viên.
 *
 * VÌ SAO KHÔNG NHÉT VÀO `edited_criteria`: cột đó đang lưu MẢNG tiêu chí (ép
 * kiểu qua `as unknown as Record<string, unknown>`), nên thêm một khoá anh em
 * sẽ đổi hình dạng của mọi dòng đã có.
 *
 * Không trigger nào bắn trên `teacher_review` — ba trigger bất biến nằm ở
 * `grading_result`, `rubric_criterion` và `submission`.
 */
export class AddTeacherReviewAppliedRule1789280000000 implements MigrationInterface {
  name = 'AddTeacherReviewAppliedRule1789280000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "examcollect"."teacher_review"
        ADD COLUMN "applied_rule" jsonb NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "examcollect"."teacher_review" DROP COLUMN "applied_rule"
    `);
  }
}
