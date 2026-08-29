import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The headcount baseline, so that "45 present, 46 submissions" becomes a
 * question anyone can ask.
 *
 * Two columns and nothing else: WHICH students were present is derived from
 * agent_connection_event at this timestamp, not stored a second time where
 * it could disagree with the log.
 *
 * Both nullable, and they stay nullable — a session where nobody took a
 * headcount is a normal session, not a broken one, and every session that
 * already exists is one.
 */

export class AddAttendanceHeadcount1788009783017 implements MigrationInterface {
    name = 'AddAttendanceHeadcount1788009783017'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "examcollect"."exam_session" ADD "attendance_confirmed_at" TIMESTAMP WITH TIME ZONE`);
        await queryRunner.query(`ALTER TABLE "examcollect"."exam_session" ADD "attendance_confirmed_count" integer`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "examcollect"."exam_session" DROP COLUMN "attendance_confirmed_count"`);
        await queryRunner.query(`ALTER TABLE "examcollect"."exam_session" DROP COLUMN "attendance_confirmed_at"`);
    }

}
