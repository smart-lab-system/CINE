import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Nới khe nghỉ giữa hai phiên của cùng một giảng viên: 30 phút → 5 phút.
 *
 * Hàm `teacher_busy_range` là IMMUTABLE và nằm trong EXCLUDE index, nên
 * phải DROP ràng buộc trước khi REPLACE hàm, rồi ADD lại — nếu không
 * index vẫn giữ biên cũ.
 *
 * Nới (không siết) nên không cần quét dữ liệu sẵn có: mọi cặp đã hợp lệ
 * với khe 30 phút vẫn hợp lệ với khe 5 phút.
 */
export class TeacherScheduleGapFiveMinutes1791200000000
  implements MigrationInterface
{
  name = 'TeacherScheduleGapFiveMinutes1791200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const predicate = `
      status <> 'collecting'
      AND status <> 'completed'
      AND status <> 'cancelled'
      AND status <> 'missed'
    `;

    await queryRunner.query(`
      ALTER TABLE "examcollect"."exam_session"
        DROP CONSTRAINT IF EXISTS "ex_exam_session_teacher_gap"
    `);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION "examcollect"."teacher_busy_range"(
        s timestamptz, e timestamptz
      ) RETURNS tstzrange
      LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
      AS $fn$ SELECT tstzrange(s, e + make_interval(mins => 5), '[)') $fn$
    `);

    await queryRunner.query(`
      ALTER TABLE "examcollect"."exam_session"
        ADD CONSTRAINT "ex_exam_session_teacher_gap"
        EXCLUDE USING gist (
          "teacher_id" WITH =,
          "examcollect"."teacher_busy_range"("start_time", "end_time") WITH &&
        )
        WHERE (${predicate})
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const predicate = `
      status <> 'collecting'
      AND status <> 'completed'
      AND status <> 'cancelled'
      AND status <> 'missed'
    `;

    await queryRunner.query(`
      ALTER TABLE "examcollect"."exam_session"
        DROP CONSTRAINT IF EXISTS "ex_exam_session_teacher_gap"
    `);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION "examcollect"."teacher_busy_range"(
        s timestamptz, e timestamptz
      ) RETURNS tstzrange
      LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
      AS $fn$ SELECT tstzrange(s, e + make_interval(mins => 30), '[)') $fn$
    `);

    // Siết lại 30 phút: nếu đã có cặp cách dưới 30 thì ADD sẽ nổ — đúng,
    // đừng đoán hộ lịch.
    await queryRunner.query(`
      ALTER TABLE "examcollect"."exam_session"
        ADD CONSTRAINT "ex_exam_session_teacher_gap"
        EXCLUDE USING gist (
          "teacher_id" WITH =,
          "examcollect"."teacher_busy_range"("start_time", "end_time") WITH &&
        )
        WHERE (${predicate})
    `);
  }
}
