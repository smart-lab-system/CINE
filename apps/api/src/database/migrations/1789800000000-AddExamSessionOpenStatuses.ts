import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `not_ready` (Chưa đủ điều kiện) và `missed` (Không diễn ra).
 *
 * Cùng quy ước với AddCollectingStatus: chỉ `ADD VALUE`, không dùng hai
 * giá trị mới trong file này. Postgres cấm dùng giá trị enum vừa thêm
 * trong cùng transaction sinh ra nó. Ràng buộc phòng/lớp/giảng viên nhả
 * chỗ cho `missed` nằm ở migration kế tiếp.
 */
export class AddExamSessionOpenStatuses1789800000000 implements MigrationInterface {
  name = 'AddExamSessionOpenStatuses1789800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "examcollect"."exam_session_status" ADD VALUE IF NOT EXISTS 'not_ready' AFTER 'scheduled'`,
    );
    await queryRunner.query(
      `ALTER TYPE "examcollect"."exam_session_status" ADD VALUE IF NOT EXISTS 'missed' AFTER 'not_ready'`,
    );
  }

  public async down(): Promise<void> {
    throw new Error(
      'AddExamSessionOpenStatuses không revert được: Postgres không hỗ trợ xoá giá trị enum. ' +
        'Muốn lùi thì phải tạo lại type exam_session_status và cast cả bảng — làm tay, có chủ đích.',
    );
  }
}
