import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Chỗ để giảng viên viết, trên chính dòng ghi lại quyết định của họ.
 *
 * VÌ SAO HAI CỘT, KHÔNG PHẢI MỘT:
 *
 * "Đã châm chước 0,5đ lỗi chính tả" và "Bài tốt, thiếu ví dụ minh hoạ" là
 * hai thứ khác nhau về người đọc. Cái đầu là ghi chú cho chính mình sáu
 * tháng sau; cái sau đi vào phiếu phúc khảo gửi sinh viên. Gộp làm một
 * trường thì hoặc giảng viên tự kiểm duyệt ghi chú của mình (và mất đi lý
 * do thật của quyết định), hoặc một câu viết cho mình lọt tới sinh viên.
 * Không có cách nào tách lại sau khi đã gộp.
 *
 * VÌ SAO Ở ĐÂY, KHÔNG PHẢI TRÊN `grading_result`:
 *
 * `guard_grading_result_ai_immutable` đóng băng đầu ra AI ngay khi
 * `ai_total_score` có giá trị — đúng như Security rule 6 yêu cầu. Ghi chú
 * của con người là thứ SINH RA SAU đó và có thể sửa nhiều lần, nên nó phải
 * nằm ở bảng mà mỗi lần duyệt tạo một dòng mới. Đó chính là `teacher_review`.
 *
 * `pinnedEvidence` KHÔNG có cột riêng: nó đi trong `edited_criteria` (jsonb)
 * cùng `verdict` và `points` của đúng tiêu chí đó. Tách nó ra một cột sẽ cho
 * phép tồn tại một minh chứng không gắn với đánh giá nào — trạng thái mà
 * `validateAndTotal` đang chặn bằng cách đòi payload phủ đủ mọi tiêu chí.
 */
export class AddTeacherReviewNotes1789270000000 implements MigrationInterface {
  name = 'AddTeacherReviewNotes1789270000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Cả hai NULL được: phần lớn lần duyệt không cần ghi gì, và một chuỗi
    // rỗng sẽ đọc ra như "đã viết rồi xoá", khác "chưa bao giờ viết".
    await queryRunner.query(`
      ALTER TABLE "examcollect"."teacher_review"
        ADD COLUMN "private_note" text NULL,
        ADD COLUMN "student_feedback" text NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "examcollect"."teacher_review"
        DROP COLUMN "private_note",
        DROP COLUMN "student_feedback"
    `);
  }
}
