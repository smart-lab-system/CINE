import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Soft-deactivate lớp học phần (hub admin). Hard delete vẫn qua DELETE
 * khi roster trống và không còn phiên.
 */
export class ClassIsActive1790200000000 implements MigrationInterface {
  name = 'ClassIsActive1790200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "examcollect"."class"
        ADD COLUMN IF NOT EXISTS "is_active" boolean NOT NULL DEFAULT true
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_class_is_active"
        ON "examcollect"."class" ("is_active")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "examcollect"."idx_class_is_active"`,
    );
    await queryRunner.query(
      `ALTER TABLE "examcollect"."class" DROP COLUMN IF EXISTS "is_active"`,
    );
  }
}
