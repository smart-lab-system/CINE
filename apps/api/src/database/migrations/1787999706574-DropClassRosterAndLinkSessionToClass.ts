import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Two halves of the same change: the roster becomes one table, and a
 * session records which class it was for.
 *
 * `class_roster` and `enrollment` had the same natural key
 * `(course_id, student_mssv)` over the same rows from the same Excel file,
 * and nothing ever converted one into the other. `enrollment` is the one
 * Security rule 1 names, so `class_roster` goes and `enrollment` keeps the
 * `student_name` it absorbed in AddEnrollmentStudentName.
 *
 * `exam_session.class_id` answers *who was expected*, never *who may join*.
 * Joining stays authenticated at course level through `enrollment` — that
 * separation is what lets a student sit a make-up exam with another class.
 * Nullable because 100+ sessions predate this column; they have no expected
 * roster and the lobby degrades to what it showed before.
 *
 * The `ADD` half is generated. Everything about the drop is hand-written:
 * `migration:generate` never emits a DROP for a table whose entity is gone,
 * so leaving it out would leave the table behind forever and the next
 * generate would report clean.
 */
export class DropClassRosterAndLinkSessionToClass1787999706574
  implements MigrationInterface
{
  name = 'DropClassRosterAndLinkSessionToClass1787999706574';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // The table is empty in every environment checked, but "checked" is not
    // "guaranteed": this runs against databases nobody has looked at. Rows
    // here would be roster data that only exists here, and dropping them
    // silently is unrecoverable — so refuse and make a human decide.
    const rows = (await queryRunner.query(
      `SELECT count(*)::text AS count FROM examcollect.class_roster`,
    )) as { count: string }[];
    const count = rows[0].count;
    if (count !== '0') {
      throw new Error(
        `Refusing to drop examcollect.class_roster: it holds ${count} row(s). ` +
          'Migrate them into examcollect.enrollment (same natural key: ' +
          'course_id + student_mssv; enrollment additionally needs ' +
          'home_teacher_id, available as class.teacher_id) and re-run.',
      );
    }

    await queryRunner.query(
      `DROP TRIGGER IF EXISTS trg_class_roster_updated_at ON examcollect.class_roster`,
    );
    await queryRunner.query(`DROP TABLE "examcollect"."class_roster"`);

    await queryRunner.query(
      `ALTER TABLE "examcollect"."exam_session" ADD "class_id" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "examcollect"."exam_session" ADD CONSTRAINT "FK_72cea853d475614aecc34cb85ef" FOREIGN KEY ("class_id") REFERENCES "examcollect"."class"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "examcollect"."exam_session" DROP CONSTRAINT "FK_72cea853d475614aecc34cb85ef"`,
    );
    await queryRunner.query(
      `ALTER TABLE "examcollect"."exam_session" DROP COLUMN "class_id"`,
    );

    // Recreated byte-for-byte as InitialSchema wrote it — constraint names
    // included, since a later revert past that migration drops them by name.
    await queryRunner.query(
      `CREATE TABLE "examcollect"."class_roster" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "course_id" uuid NOT NULL, "home_class_id" uuid NOT NULL, "student_mssv" citext NOT NULL, "student_name" character varying(150) NOT NULL, CONSTRAINT "ck_class_roster_mssv" CHECK (student_mssv ~ '^[A-Za-z0-9]{4,20}$'), CONSTRAINT "PK_a3de9d295f217b0a4d7f6b90ca5" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_class_roster_course_student" ON "examcollect"."class_roster" ("course_id", "student_mssv")`,
    );
    await queryRunner.query(
      `ALTER TABLE "examcollect"."class_roster" ADD CONSTRAINT "FK_a4bd8c8687d40e180e074105ed4" FOREIGN KEY ("course_id") REFERENCES "examcollect"."course"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "examcollect"."class_roster" ADD CONSTRAINT "FK_240ad5d6591fa0de516bc4ff846" FOREIGN KEY ("home_class_id") REFERENCES "examcollect"."class"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(`
      CREATE TRIGGER trg_class_roster_updated_at
      BEFORE UPDATE ON examcollect.class_roster
      FOR EACH ROW EXECUTE FUNCTION examcollect.set_updated_at();
    `);
  }
}
