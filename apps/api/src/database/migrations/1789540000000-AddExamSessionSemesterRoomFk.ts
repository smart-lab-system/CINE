import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Gắn catalog semester/room vào exam_session: FK nullable + giữ snapshot text.
 * Spec: 2026-10-07-sync-master-data-schema-design.md
 *
 * ON DELETE SET NULL — xoá/nghỉ mục catalog không chặn phiên lịch sử;
 * overlap / filter vẫn đọc semester_name / room_name.
 */
export class AddExamSessionSemesterRoomFk1789540000000
  implements MigrationInterface
{
  name = 'AddExamSessionSemesterRoomFk1789540000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "examcollect"."exam_session"
        ADD COLUMN "semester_id" uuid,
        ADD COLUMN "room_id" uuid
    `);

    await queryRunner.query(`
      ALTER TABLE "examcollect"."exam_session"
        ADD CONSTRAINT "fk_exam_session_semester"
          FOREIGN KEY ("semester_id")
          REFERENCES "examcollect"."semester"("id")
          ON DELETE SET NULL ON UPDATE NO ACTION,
        ADD CONSTRAINT "fk_exam_session_room"
          FOREIGN KEY ("room_id")
          REFERENCES "examcollect"."room"("id")
          ON DELETE SET NULL ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_exam_session_semester_id"
        ON "examcollect"."exam_session" ("semester_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_exam_session_room_id"
        ON "examcollect"."exam_session" ("room_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "examcollect"."idx_exam_session_room_id"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "examcollect"."idx_exam_session_semester_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "examcollect"."exam_session"
        DROP CONSTRAINT IF EXISTS "fk_exam_session_room",
        DROP CONSTRAINT IF EXISTS "fk_exam_session_semester"
    `);
    await queryRunner.query(`
      ALTER TABLE "examcollect"."exam_session"
        DROP COLUMN IF EXISTS "room_id",
        DROP COLUMN IF EXISTS "semester_id"
    `);
  }
}
