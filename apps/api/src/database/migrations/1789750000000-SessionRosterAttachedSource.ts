import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Sinh viên có mặt vì file danh sách được tải lên — khác thêm tay (`manual`)
 * và khác bản chép từ lớp (`frozen`).
 *
 * Giá trị enum nằm ở migration riêng: Postgres không cho dùng giá trị vừa
 * `ADD VALUE` trong cùng giao dịch.
 */
export class SessionRosterAttachedSource1789750000000 implements MigrationInterface {
  name = 'SessionRosterAttachedSource1789750000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TYPE "examcollect"."session_roster_source" ADD VALUE IF NOT EXISTS 'attached'`,
    );
  }

  public async down(): Promise<void> {
    throw new Error(
      'SessionRosterAttachedSource1789750000000: không hoàn được — Postgres không bỏ được giá trị enum',
    );
  }
}
