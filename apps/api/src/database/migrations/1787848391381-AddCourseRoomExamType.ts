import { MigrationInterface, QueryRunner } from "typeorm";

// Hand-edited after `migration:generate`. Three things the generator can't
// know to do on its own:
//
// 1. Seed data + backfill: `exam_session.room_id`/`exam_type` are brand-new
//    NOT NULL columns, and `course_id` flips nullable -> NOT NULL — but 23
//    exam_session rows already exist (from earlier e2e-test/demo runs) with
//    no course_id at all and obviously no room_id. Adding these columns as
//    NOT NULL directly (what the generator proposed) fails outright against
//    that live data. Seed a real Semester/Course/Room here, backfill every
//    existing row to point at them, THEN apply the NOT NULL constraints —
//    safe whether the table is empty (a fresh DB) or holds stale rows.
// 2. The generator also proposed adding exam_type as a bare NOT NULL with
//    no default, which has the same "no value for existing rows" problem —
//    given a DEFAULT inline instead, matching the backfill's exam type,
//    then the default is dropped so future inserts must supply one
//    explicitly (CreateExamSessionDto requires it — see exam-type's own
//    entity comment for why there's no app-level "unset" case to design
//    a default around going forward).
// 3. Dropped the generator's audit_log DROP/ADD PK + index recreate — the
//    same stale partitioning drift AddExamSessionNameCode1787795324287
//    already documented removing (TypeORM's schema diff can't see
//    audit_log's RANGE partitioning from InitialSchema, so every regenerate
//    proposes "undoing" it; unrelated to this migration's actual changes).
export class AddCourseRoomExamType1787848391381 implements MigrationInterface {
    name = 'AddCourseRoomExamType1787848391381'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "examcollect"."room" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "name" character varying(100) NOT NULL, "capacity" integer, CONSTRAINT "PK_c6d46db005d623e691b2fbcba23" PRIMARY KEY ("id"))`);

        // --- Seed data (also the backfill target for existing rows below) ---
        const [semester] = await queryRunner.query(
          `INSERT INTO "examcollect"."semester" ("name", "start_date", "end_date")
           VALUES ('Học kỳ 1 2026-2027', '2026-09-01', '2027-01-15')
           RETURNING id`,
        );
        const [course1] = await queryRunner.query(
          `INSERT INTO "examcollect"."course" ("code", "name", "semester_id")
           VALUES ('CS101', 'Nhập môn lập trình', '${semester.id}')
           RETURNING id`,
        );
        await queryRunner.query(
          `INSERT INTO "examcollect"."course" ("code", "name", "semester_id")
           VALUES ('CS201', 'Cấu trúc dữ liệu và giải thuật', '${semester.id}')`,
        );
        const [room1] = await queryRunner.query(
          `INSERT INTO "examcollect"."room" ("name", "capacity")
           VALUES ('Phòng máy A1', 40)
           RETURNING id`,
        );
        await queryRunner.query(
          `INSERT INTO "examcollect"."room" ("name", "capacity") VALUES ('Phòng máy A2', 40)`,
        );
        await queryRunner.query(
          `INSERT INTO "examcollect"."room" ("name", "capacity") VALUES ('Phòng máy B1', 30)`,
        );

        // --- room_id: add nullable, backfill, THEN enforce NOT NULL ---
        await queryRunner.query(`ALTER TABLE "examcollect"."exam_session" ADD "room_id" uuid`);
        await queryRunner.query(
          `UPDATE "examcollect"."exam_session" SET "room_id" = '${room1.id}' WHERE "room_id" IS NULL`,
        );
        await queryRunner.query(`ALTER TABLE "examcollect"."exam_session" ALTER COLUMN "room_id" SET NOT NULL`);

        // --- exam_type: add with an inline default (fills existing rows),
        // then drop the default so every future insert must supply one ---
        await queryRunner.query(`CREATE TYPE "examcollect"."exam_type" AS ENUM('TK', 'GK', 'CK')`);
        await queryRunner.query(`ALTER TABLE "examcollect"."exam_session" ADD "exam_type" "examcollect"."exam_type" NOT NULL DEFAULT 'TK'`);
        await queryRunner.query(`ALTER TABLE "examcollect"."exam_session" ALTER COLUMN "exam_type" DROP DEFAULT`);

        // --- course_id: backfill existing NULLs, THEN enforce NOT NULL ---
        await queryRunner.query(
          `UPDATE "examcollect"."exam_session" SET "course_id" = '${course1.id}' WHERE "course_id" IS NULL`,
        );
        await queryRunner.query(`ALTER TABLE "examcollect"."exam_session" DROP CONSTRAINT "FK_100641d6d10a21a54cc580117ed"`);
        await queryRunner.query(`ALTER TABLE "examcollect"."exam_session" ALTER COLUMN "course_id" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "examcollect"."exam_session" ADD CONSTRAINT "FK_100641d6d10a21a54cc580117ed" FOREIGN KEY ("course_id") REFERENCES "examcollect"."course"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "examcollect"."exam_session" ADD CONSTRAINT "FK_ca5732a98b1d0dd81a294b43455" FOREIGN KEY ("room_id") REFERENCES "examcollect"."room"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "examcollect"."exam_session" DROP CONSTRAINT "FK_ca5732a98b1d0dd81a294b43455"`);
        await queryRunner.query(`ALTER TABLE "examcollect"."exam_session" DROP CONSTRAINT "FK_100641d6d10a21a54cc580117ed"`);
        await queryRunner.query(`ALTER TABLE "examcollect"."exam_session" ALTER COLUMN "course_id" DROP NOT NULL`);
        await queryRunner.query(`ALTER TABLE "examcollect"."exam_session" ADD CONSTRAINT "FK_100641d6d10a21a54cc580117ed" FOREIGN KEY ("course_id") REFERENCES "examcollect"."course"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "examcollect"."exam_session" DROP COLUMN "exam_type"`);
        await queryRunner.query(`DROP TYPE "examcollect"."exam_type"`);
        await queryRunner.query(`ALTER TABLE "examcollect"."exam_session" DROP COLUMN "room_id"`);
        await queryRunner.query(`DROP TABLE "examcollect"."room"`);
        // Seed rows (semester/course/room) are intentionally left in place on
        // down() — dropping the room/exam_type columns/table above already
        // removes anything that referenced them; deleting the seed course/
        // semester rows too could cascade-fail against unrelated data
        // inserted after this migration ran (RESTRICT, by design) instead of
        // cleanly reverting schema.
    }

}
