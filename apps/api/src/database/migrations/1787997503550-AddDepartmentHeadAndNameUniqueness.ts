import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 2 groundwork: who owns a course, and names that mean one thing.
 *
 * **course.department_head_id** is the entire scoping mechanism for the
 * Trưởng khoa role. A department table was considered and rejected: every
 * academic row already hangs off `course` (class, exam_session and
 * enrollment all carry course_id), so the only fact the schema was missing
 * is who owns the course. One column replaces a table, a CRUD screen, and a
 * join — see the design doc for the conditions that would make a real
 * department entity worth it, and the one migration that would introduce it.
 *
 * Nullable, because there is nothing to backfill from: no department_admin
 * account exists at the moment this runs, so the seeded courses have no
 * owner. An unowned course is listed to nobody, which is why admin gets a
 * dedicated "courses with no owner" view rather than letting them go quiet.
 *
 * **Unique names** on semester and room. Both are globally writable by every
 * Trưởng khoa, so without this two of them can each create
 * "Học kỳ 1 2026-2027" and their courses end up on different terms that look
 * identical on screen.
 *
 * Existing duplicates are RENAMED, not deleted: they are referenced by
 * courses and exam sessions, so deleting them would fail on the foreign keys
 * — and quietly discarding rows to satisfy a new constraint is the wrong
 * trade regardless. The suffix makes them visible so an operator can merge
 * them by hand.
 */
export class AddDepartmentHeadAndNameUniqueness1787997503550 implements MigrationInterface {
  name = 'AddDepartmentHeadAndNameUniqueness1787997503550';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "examcollect"."course" ADD "department_head_id" uuid`,
    );
    // Hash name, not a readable one: TypeORM derives FK names from the
    // table and column and will diff against that forever. A readable name
    // here is exactly the drift that made every generated migration try to
    // rewrite audit_log.primary key.
    await queryRunner.query(`
      ALTER TABLE "examcollect"."course"
        ADD CONSTRAINT "FK_e699d35616e0c26796b53936fa1"
        FOREIGN KEY ("department_head_id")
        REFERENCES "examcollect"."account"("id")
        ON DELETE RESTRICT ON UPDATE NO ACTION
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_course_department_head" ON "examcollect"."course" ("department_head_id")`,
    );

    for (const table of ['semester', 'room']) {
      await queryRunner.query(`
        UPDATE "examcollect"."${table}" t
           SET "name" = t."name" || ' #' || left(t."id"::text, 8)
          FROM (
            SELECT "id",
                   row_number() OVER (PARTITION BY "name" ORDER BY "created_at", "id") AS rn
              FROM "examcollect"."${table}"
          ) d
         WHERE d."id" = t."id" AND d.rn > 1
      `);
      await queryRunner.query(
        `CREATE UNIQUE INDEX "uq_${table}_name" ON "examcollect"."${table}" ("name")`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "examcollect"."uq_room_name"`);
    await queryRunner.query(`DROP INDEX "examcollect"."uq_semester_name"`);
    await queryRunner.query(`DROP INDEX "examcollect"."idx_course_department_head"`);
    await queryRunner.query(
      `ALTER TABLE "examcollect"."course" DROP CONSTRAINT "FK_e699d35616e0c26796b53936fa1"`,
    );
    await queryRunner.query(
      `ALTER TABLE "examcollect"."course" DROP COLUMN "department_head_id"`,
    );
  }
}
