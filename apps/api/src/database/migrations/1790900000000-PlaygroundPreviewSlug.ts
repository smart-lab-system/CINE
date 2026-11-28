import { MigrationInterface, QueryRunner } from 'typeorm';

export class PlaygroundPreviewSlug1790900000000 implements MigrationInterface {
  name = 'PlaygroundPreviewSlug1790900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "examcollect"."playground_run"
        ADD COLUMN IF NOT EXISTS "preview_slug" character varying(160)
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_playground_run_preview_slug"
        ON "examcollect"."playground_run" ("preview_slug")
        WHERE "preview_slug" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "examcollect"."uq_playground_run_preview_slug"
    `);
    await queryRunner.query(`
      ALTER TABLE "examcollect"."playground_run"
        DROP COLUMN IF EXISTS "preview_slug"
    `);
  }
}
