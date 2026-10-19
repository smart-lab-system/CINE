import { MigrationInterface, QueryRunner } from 'typeorm';

export class IdeExtensionMarketplaceSyncedAt1789640000000 implements MigrationInterface {
  name = 'IdeExtensionMarketplaceSyncedAt1789640000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "examcollect"."ide_extension"
        ADD COLUMN IF NOT EXISTS "marketplace_synced_at" TIMESTAMP WITH TIME ZONE
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "examcollect"."ide_extension"
        DROP COLUMN IF EXISTS "marketplace_synced_at"
    `);
  }
}
