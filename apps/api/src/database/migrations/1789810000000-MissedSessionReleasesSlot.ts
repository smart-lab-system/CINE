import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phiên `missed` (Không diễn ra) không giữ phòng, lớp, hay khoảng nghỉ
 * của giảng viên. `not_ready` vẫn giữ — còn có thể mở lúc giờ bắt đầu.
 *
 * Tách khỏi migration thêm enum: file kia chỉ `ADD VALUE`. Dùng `'missed'`
 * trong cùng transaction với `ADD VALUE` bị Postgres từ chối.
 *
 * Một `ALTER TABLE` cho cả ba ràng buộc, giống ContractMasterData: mode
 * migration là `none`, nên DROP rồi ADD ở hai câu sẽ để hở một khoảnh
 * không còn ràng buộc.
 */
export class MissedSessionReleasesSlot1789810000000 implements MigrationInterface {
  name = 'MissedSessionReleasesSlot1789810000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const predicate = `
      status <> 'collecting'
      AND status <> 'completed'
      AND status <> 'cancelled'
      AND status <> 'missed'
    `;

    await queryRunner.query(`
      ALTER TABLE "examcollect"."exam_session"
        DROP CONSTRAINT IF EXISTS "ex_exam_session_room_overlap",
        DROP CONSTRAINT IF EXISTS "ex_exam_session_class_overlap",
        DROP CONSTRAINT IF EXISTS "ex_exam_session_teacher_gap",
        ADD CONSTRAINT "ex_exam_session_room_overlap"
        EXCLUDE USING gist (
          "room_name" WITH =,
          tstzrange("start_time", "end_time", '[)') WITH &&
        )
        WHERE (${predicate}),
        ADD CONSTRAINT "ex_exam_session_class_overlap"
        EXCLUDE USING gist (
          "class_id" WITH =,
          tstzrange("start_time", "end_time", '[)') WITH &&
        )
        WHERE (${predicate}),
        ADD CONSTRAINT "ex_exam_session_teacher_gap"
        EXCLUDE USING gist (
          "teacher_id" WITH =,
          "examcollect"."teacher_busy_range"("start_time", "end_time") WITH &&
        )
        WHERE (${predicate})
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_exam_session_status_start_time" ON "examcollect"."exam_session" ("status", "start_time")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const predicate = `
      status <> 'collecting'
      AND status <> 'completed'
      AND status <> 'cancelled'
    `;

    await queryRunner.query(
      `DROP INDEX IF EXISTS "examcollect"."idx_exam_session_status_start_time"`,
    );
    await queryRunner.query(`
      ALTER TABLE "examcollect"."exam_session"
        DROP CONSTRAINT IF EXISTS "ex_exam_session_room_overlap",
        DROP CONSTRAINT IF EXISTS "ex_exam_session_class_overlap",
        DROP CONSTRAINT IF EXISTS "ex_exam_session_teacher_gap",
        ADD CONSTRAINT "ex_exam_session_room_overlap"
        EXCLUDE USING gist (
          "room_name" WITH =,
          tstzrange("start_time", "end_time", '[)') WITH &&
        )
        WHERE (${predicate}),
        ADD CONSTRAINT "ex_exam_session_class_overlap"
        EXCLUDE USING gist (
          "class_id" WITH =,
          tstzrange("start_time", "end_time", '[)') WITH &&
        )
        WHERE (${predicate}),
        ADD CONSTRAINT "ex_exam_session_teacher_gap"
        EXCLUDE USING gist (
          "teacher_id" WITH =,
          "examcollect"."teacher_busy_range"("start_time", "end_time") WITH &&
        )
        WHERE (${predicate})
    `);
  }
}
