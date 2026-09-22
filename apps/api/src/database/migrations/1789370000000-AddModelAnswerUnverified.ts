import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Bộ ba chưa kiểm chứng gắn vào phiên thi thì phiên đó phải MANG DẤU.
 *
 * Spec chấm §2.1 dựng TOÀN BỘ cơ chế rút chuẩn trên đáp án mẫu: "bài sinh
 * viên lệch khỏi chuẩn nào thì đó là một lỗi ứng viên". Một đáp án mẫu không
 * biên dịch nổi đi vào `grading_reference` thì chuẩn đó là rác, và mọi bài
 * của phiên bị đo bằng một cái thước bịa.
 *
 * Tệ hơn: nó hỏng theo kiểu IM LẶNG. Bài nào cũng "lệch chuẩn", nên bài nào
 * cũng bị chẩn đoán đầy lỗi, và không có tín hiệu nào nói rằng vấn đề nằm ở
 * cái thước chứ không ở sinh viên. Cột này là thứ duy nhất phân biệt được hai
 * chuyện đó về sau.
 *
 * Mặc định `false`: mọi bản ghi có trước đều do giảng viên tự upload, và cái
 * cờ này chỉ nói về đáp án đến từ agent soạn đề.
 */
export class AddModelAnswerUnverified1789370000000 implements MigrationInterface {
  name = 'AddModelAnswerUnverified1789370000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "examcollect"."grading_reference"
        ADD COLUMN "model_answer_unverified" boolean NOT NULL DEFAULT false
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "examcollect"."grading_reference"
        DROP COLUMN IF EXISTS "model_answer_unverified"
    `);
  }
}
