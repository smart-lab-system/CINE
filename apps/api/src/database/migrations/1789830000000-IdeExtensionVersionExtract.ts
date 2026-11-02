import { MigrationInterface, QueryRunner } from 'typeorm';

export class IdeExtensionVersionExtract1789830000000 implements MigrationInterface {
  name = 'IdeExtensionVersionExtract1789830000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "examcollect"."ide_extension_extract_status" AS ENUM (
        'none', 'pending', 'extracting', 'ready', 'failed'
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "examcollect"."ide_extension_version"
        ADD COLUMN IF NOT EXISTS "extract_status" "examcollect"."ide_extension_extract_status"
          NOT NULL DEFAULT 'none',
        ADD COLUMN IF NOT EXISTS "extract_tree_key" character varying,
        ADD COLUMN IF NOT EXISTS "extract_error" text,
        ADD COLUMN IF NOT EXISTS "extract_started_at" TIMESTAMP WITH TIME ZONE,
        ADD COLUMN IF NOT EXISTS "extract_finished_at" TIMESTAMP WITH TIME ZONE,
        ADD COLUMN IF NOT EXISTS "extract_entry_count" integer,
        ADD COLUMN IF NOT EXISTS "extract_total_bytes" bigint
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "examcollect"."ide_extension_version"
        DROP COLUMN IF EXISTS "extract_total_bytes",
        DROP COLUMN IF EXISTS "extract_entry_count",
        DROP COLUMN IF EXISTS "extract_finished_at",
        DROP COLUMN IF EXISTS "extract_started_at",
        DROP COLUMN IF EXISTS "extract_error",
        DROP COLUMN IF EXISTS "extract_tree_key",
        DROP COLUMN IF EXISTS "extract_status"
    `);
    await queryRunner.query(`
      DROP TYPE IF EXISTS "examcollect"."ide_extension_extract_status"
    `);
  }
}
