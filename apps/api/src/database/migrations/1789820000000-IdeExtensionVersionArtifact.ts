import { MigrationInterface, QueryRunner } from 'typeorm';

export class IdeExtensionVersionArtifact1789820000000 implements MigrationInterface {
  name = 'IdeExtensionVersionArtifact1789820000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "examcollect"."ide_extension_version"
        ADD COLUMN IF NOT EXISTS "storage_key" character varying,
        ADD COLUMN IF NOT EXISTS "artifact_sha256" character varying(64),
        ADD COLUMN IF NOT EXISTS "artifact_size_bytes" bigint,
        ADD COLUMN IF NOT EXISTS "artifact_uploaded_at" TIMESTAMP WITH TIME ZONE
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "examcollect"."ide_extension_version"
        DROP COLUMN IF EXISTS "artifact_uploaded_at",
        DROP COLUMN IF EXISTS "artifact_size_bytes",
        DROP COLUMN IF EXISTS "artifact_sha256",
        DROP COLUMN IF EXISTS "storage_key"
    `);
  }
}
