import { MigrationInterface, QueryRunner } from 'typeorm';

export class PlaygroundStaticPreview1789850000000 implements MigrationInterface {
  name = 'PlaygroundStaticPreview1789850000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "examcollect"."playground_run"
        ADD COLUMN IF NOT EXISTS "preview_url" character varying(1024),
        ADD COLUMN IF NOT EXISTS "container_name" character varying(128),
        ADD COLUMN IF NOT EXISTS "host_port" integer,
        ADD COLUMN IF NOT EXISTS "expires_at" TIMESTAMP WITH TIME ZONE
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "examcollect"."playground_run"
        DROP COLUMN IF EXISTS "expires_at",
        DROP COLUMN IF EXISTS "host_port",
        DROP COLUMN IF EXISTS "container_name",
        DROP COLUMN IF EXISTS "preview_url"
    `);
  }
}
