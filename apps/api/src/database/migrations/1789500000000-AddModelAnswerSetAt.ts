import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Lúc đáp án mẫu được ĐẶT — một cột riêng, không dùng `updated_at`.
 *
 * `grading_reference` là bảng MỘT DÒNG mỗi phiên và `upsert` là UPDATE trên
 * chính dòng đó, nên `updated_at` đổi cả khi giảng viên chỉ chọn lại đề bài.
 * Dòng nguồn của đáp án sẽ khi ấy nói "bạn tải lên lúc 16:40" cho một lần
 * chọn đề lúc 16:40. (Ghi chú thì KHÁC: nó là một dạng đáp án, nên viết ghi
 * chú có đổi cột này — cùng nhịp với `model_answer_origin`.)
 *
 * Một cột, một câu lệnh, không index: mỗi phiên một dòng, ghi vài lần.
 */
export class AddModelAnswerSetAt1789500000000 implements MigrationInterface {
  name = 'AddModelAnswerSetAt1789500000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "examcollect"."grading_reference" ADD COLUMN "model_answer_set_at" timestamptz NULL`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "examcollect"."grading_reference" DROP COLUMN "model_answer_set_at"`);
  }
}
