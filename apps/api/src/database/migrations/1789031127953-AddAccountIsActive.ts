import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Vô hiệu hoá tài khoản, thay cho xoá cứng (CLAUDE.md §7.2.8).
 *
 * Xoá cứng một tài khoản đã dạy một lớp là bất khả và đúng như vậy: FK
 * RESTRICT trên `class.teacher_id`, `enrollment.home_teacher_id`,
 * `exam_session.teacher_id` chặn ở tầng DB, còn `audit_log` thì bất biến
 * nên tên người đã thao tác không bao giờ biến mất được. Nhưng nhân sự
 * nghỉ việc là chuyện có thật, và trước cột này hệ thống không có đường
 * nào để chặn họ đăng nhập.
 *
 * `NOT NULL DEFAULT true` nên mọi hàng có sẵn tự động là hoạt động —
 * không cần backfill, và không có trạng thái NULL mơ hồ để phải diễn giải
 * ở tầng ứng dụng.
 */
export class AddAccountIsActive1789031127953 implements MigrationInterface {
    name = 'AddAccountIsActive1789031127953'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "examcollect"."account" ADD "is_active" boolean NOT NULL DEFAULT true`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "examcollect"."account" DROP COLUMN "is_active"`);
    }

}
