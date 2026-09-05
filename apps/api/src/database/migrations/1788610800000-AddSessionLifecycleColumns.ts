import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Hai trạng thái vòng đời do giảng viên đặt, tách bạch có chủ đích:
 *
 *  archived_at         — "phiên này không phải việc thật" (nháp, tạo thử).
 *                        Ẩn khỏi CẢ trang.
 *  attention_closed_at — "việc thật này đã xong". Rời mục cần chú ý, vẫn nằm
 *                        trong danh sách theo môn.
 *
 * Cột trên exam_session chứ không phải bảng nối: mỗi phiên có đúng một giảng
 * viên sở hữu (teacher_id), nên không có trạng thái per-user để tách ra.
 *
 * Cả hai nullable và ở nguyên vậy — phiên chưa lưu trữ/chưa khép là phiên bình
 * thường, và mọi phiên đang tồn tại đều thế.
 *
 * attention_closed_at cũng là chỗ module xuất điểm sẽ ghi vào khi nó ra đời —
 * cùng một cột, mọc thêm cò tự động, không phải cơ chế thứ hai (spec §1.3).
 */
export class AddSessionLifecycleColumns1788610800000 implements MigrationInterface {
    name = 'AddSessionLifecycleColumns1788610800000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "examcollect"."exam_session" ADD "archived_at" TIMESTAMP WITH TIME ZONE`);
        await queryRunner.query(`ALTER TABLE "examcollect"."exam_session" ADD "attention_closed_at" TIMESTAMP WITH TIME ZONE`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "examcollect"."exam_session" DROP COLUMN "attention_closed_at"`);
        await queryRunner.query(`ALTER TABLE "examcollect"."exam_session" DROP COLUMN "archived_at"`);
    }
}
