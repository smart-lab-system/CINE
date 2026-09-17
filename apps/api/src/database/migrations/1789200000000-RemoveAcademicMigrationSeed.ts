import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Removes the academic *data* that AddCourseRoomExamType inserted so a
 * freshly migrated DB is schema-only. Reference rows now come from
 * `pnpm seed:sample` (docs/superpowers/specs/2026-09-17-…).
 *
 * Does not amend the old migration. Deletes only when no FK dependents
 * remain (exam_session / class / enrollment / rubric). A dirty demo DB
 * with sessions pointing at those rows keeps them — wipe the volume instead.
 *
 * `down` is intentionally a no-op: toy migration seed is not restored;
 * the seed script is the source of truth.
 */
export class RemoveAcademicMigrationSeed1789200000000
  implements MigrationInterface
{
  name = 'RemoveAcademicMigrationSeed1789200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM examcollect.enrollment e
       USING examcollect.course c
       WHERE e.course_id = c.id
         AND upper(c.code::text) IN ('CS101', 'CS201')
         AND NOT EXISTS (
           SELECT 1 FROM examcollect.exam_session es WHERE es.course_id = c.id
         )
    `);

    await queryRunner.query(`
      DELETE FROM examcollect.class k
       USING examcollect.course c
       WHERE k.course_id = c.id
         AND upper(c.code::text) IN ('CS101', 'CS201')
         AND NOT EXISTS (
           SELECT 1 FROM examcollect.exam_session es
            WHERE es.class_id = k.id OR es.course_id = c.id
         )
    `);

    await queryRunner.query(`
      DELETE FROM examcollect.rubric_criterion rc
       USING examcollect.rubric r
       JOIN examcollect.course c ON c.id = r.course_id
       WHERE rc.rubric_id = r.id
         AND upper(c.code::text) IN ('CS101', 'CS201')
         AND NOT EXISTS (
           SELECT 1 FROM examcollect.exam_session es WHERE es.course_id = c.id
         )
    `);

    await queryRunner.query(`
      DELETE FROM examcollect.rubric r
       USING examcollect.course c
       WHERE r.course_id = c.id
         AND upper(c.code::text) IN ('CS101', 'CS201')
         AND NOT EXISTS (
           SELECT 1 FROM examcollect.exam_session es WHERE es.course_id = c.id
         )
         AND NOT EXISTS (
           SELECT 1 FROM examcollect.rubric_criterion rc WHERE rc.rubric_id = r.id
         )
    `);

    await queryRunner.query(`
      DELETE FROM examcollect.course c
       WHERE upper(c.code::text) IN ('CS101', 'CS201')
         AND NOT EXISTS (
           SELECT 1 FROM examcollect.exam_session es WHERE es.course_id = c.id
         )
         AND NOT EXISTS (
           SELECT 1 FROM examcollect.class k WHERE k.course_id = c.id
         )
         AND NOT EXISTS (
           SELECT 1 FROM examcollect.enrollment e WHERE e.course_id = c.id
         )
         AND NOT EXISTS (
           SELECT 1 FROM examcollect.rubric r WHERE r.course_id = c.id
         )
    `);

    await queryRunner.query(`
      DELETE FROM examcollect.room r
       WHERE r.name IN ('Phòng máy A1', 'Phòng máy A2', 'Phòng máy B1')
         AND NOT EXISTS (
           SELECT 1 FROM examcollect.exam_session es WHERE es.room_id = r.id
         )
    `);

    await queryRunner.query(`
      DELETE FROM examcollect.semester s
       WHERE s.name = 'Học kỳ 1 2026-2027'
         AND NOT EXISTS (
           SELECT 1 FROM examcollect.course c WHERE c.semester_id = s.id
         )
    `);
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // No-op: do not re-insert CS101/CS201 / Phòng máy A* toy rows.
    // Source of truth is `pnpm seed:sample`.
  }
}
