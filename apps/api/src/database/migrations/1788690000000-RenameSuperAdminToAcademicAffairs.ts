import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `super_admin` là tên THỨ BẬC gán cho một công việc cụ thể: giữ lịch học kỳ
 * cấp trường. Đổi sang tên công việc, cùng lý do area đặt là `/academic` chứ
 * không `/super-admin` — và để trả lại cái tên cho một tier siêu quản trị
 * thật, nếu sau này cần. Xem spec §3.2.
 *
 * RENAME VALUE chỉ sửa catalog, không rewrite bảng (Postgres 10+; ở đây
 * 16.15). An toàn với dữ liệu đang có: mọi row mang giá trị cũ tự động đọc ra
 * tên mới, không có bước cập nhật dữ liệu nào.
 *
 * Migration khởi tạo (1787766223206-InitialSchema) KHÔNG được sửa để mang tên
 * mới: migration đã chạy là lịch sử, sửa nó làm chữ ký khác đi trên mọi máy đã
 * migrate.
 */
export class RenameSuperAdminToAcademicAffairs1788690000000 implements MigrationInterface {
  name = 'RenameSuperAdminToAcademicAffairs1788690000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "examcollect"."account_role" RENAME VALUE 'super_admin' TO 'academic_affairs'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "examcollect"."account_role" RENAME VALUE 'academic_affairs' TO 'super_admin'`,
    );
  }
}
