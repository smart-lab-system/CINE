import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Trạng thái `audit_pending` (§14.3, §8.1) — MỘT MÌNH một migration.
 *
 * Postgres không cho dùng một giá trị enum vừa thêm trong cùng transaction (*unsafe use of new
 * value*). Trigger vòng đời mới (`1789460000000`) nhắc tới giá trị này; tách riêng để giá trị
 * đã commit trước khi ai dùng nó.
 */
export class AddAuditPendingStatus1789420000000 implements MigrationInterface {
  name = 'AddAuditPendingStatus1789420000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TYPE "examcollect"."grading_status" ADD VALUE IF NOT EXISTS 'audit_pending' AFTER 'auto_approved'`);
  }

  public async down(): Promise<void> {
    // Postgres không bỏ được một giá trị enum. Hoàn lại là dựng lại type và mọi cột dùng nó —
    // việc đó không đáng làm ngầm trong một `down()`.
    throw new Error('AddAuditPendingStatus1789420000000: không hoàn được — Postgres không bỏ được giá trị enum');
  }
}
