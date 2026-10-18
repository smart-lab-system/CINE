import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Làm thật status `scheduled` (spec 2026-10-18-exam-session-setup-edit-flow).
 *
 * Trước đây create() ghi `active` ngay; nhiều phiên "active" chưa bao giờ
 * được mở (không có dòng session_roster). Đổi nhãn những hàng đó sang
 * `scheduled` cho khớp thực tế "chưa mở cửa". Không tự freeze.
 *
 * `down` cố ý no-op: đảo scheduled→active sẽ phá phiên đúng nghĩa sau deploy.
 */
export class ScheduledSessionStatus1789620000000 implements MigrationInterface {
  name = 'ScheduledSessionStatus1789620000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE examcollect.exam_session AS s
      SET status = 'scheduled'
      WHERE s.status = 'active'
        AND NOT EXISTS (
          SELECT 1 FROM examcollect.session_roster r
          WHERE r.exam_session_id = s.id
        )
    `);

    await queryRunner.query(`
      UPDATE examcollect.exam_session
      SET status = 'scheduled'
      WHERE status = 'draft'
        AND start_time > NOW()
    `);
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // Irreversible on purpose — see class comment.
  }
}
