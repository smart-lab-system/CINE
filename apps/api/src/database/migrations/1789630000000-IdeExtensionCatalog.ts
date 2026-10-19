import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Catalog extension + phiên bản — nguồn UI Quản lý tiện ích IDE (§7.1a).
 */
export class IdeExtensionCatalog1789630000000 implements MigrationInterface {
  name = 'IdeExtensionCatalog1789630000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "examcollect"."ide_extension" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "identifier" character varying(200) NOT NULL,
        "display_name" character varying(200) NOT NULL,
        "publisher" character varying(200) NOT NULL,
        "published_at" TIMESTAMP WITH TIME ZONE,
        "last_released_at" TIMESTAMP WITH TIME ZONE,
        "is_active" boolean NOT NULL DEFAULT true,
        CONSTRAINT "PK_ide_extension" PRIMARY KEY ("id"),
        CONSTRAINT "uq_ide_extension_identifier" UNIQUE ("identifier")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "examcollect"."ide_extension_version" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "extension_pk" uuid NOT NULL,
        "version" character varying(50) NOT NULL,
        "added_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "approval_status" "examcollect"."ide_extension_approval_status" NOT NULL DEFAULT 'pending',
        "approved_at" TIMESTAMP WITH TIME ZONE,
        "approved_by" uuid,
        "note" text,
        CONSTRAINT "PK_ide_extension_version" PRIMARY KEY ("id"),
        CONSTRAINT "uq_ide_extension_version" UNIQUE ("extension_pk", "version"),
        CONSTRAINT "fk_ide_extension_version_extension"
          FOREIGN KEY ("extension_pk") REFERENCES "examcollect"."ide_extension"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "fk_ide_extension_version_approved_by"
          FOREIGN KEY ("approved_by") REFERENCES "examcollect"."account"("id")
          ON DELETE RESTRICT ON UPDATE NO ACTION
      )
    `);

    // Migrate legacy global policy items → catalog (một version placeholder nếu chưa có).
    await queryRunner.query(`
      INSERT INTO "examcollect"."ide_extension"
        ("identifier", "display_name", "publisher", "published_at", "last_released_at", "is_active")
      SELECT DISTINCT
        i."extension_id",
        COALESCE(NULLIF(i."display_name", ''), i."extension_id"),
        CASE
          WHEN position('.' in i."extension_id") > 0
            THEN split_part(i."extension_id", '.', 1)
          ELSE i."extension_id"
        END,
        i."created_at",
        i."created_at",
        true
      FROM "examcollect"."ide_extension_policy_item" i
      INNER JOIN "examcollect"."ide_extension_policy" p ON p."id" = i."policy_id"
      WHERE p."scope_type" = 'global'
      ON CONFLICT ("identifier") DO NOTHING
    `);

    await queryRunner.query(`
      INSERT INTO "examcollect"."ide_extension_version"
        ("extension_pk", "version", "added_at", "approval_status", "approved_at", "approved_by", "note")
      SELECT
        e."id",
        COALESCE(NULLIF(i."min_version", ''), '*'),
        i."created_at",
        i."approval_status",
        i."reviewed_at",
        i."reviewed_by",
        i."note"
      FROM "examcollect"."ide_extension_policy_item" i
      INNER JOIN "examcollect"."ide_extension_policy" p ON p."id" = i."policy_id"
      INNER JOIN "examcollect"."ide_extension" e ON e."identifier" = i."extension_id"
      WHERE p."scope_type" = 'global'
      ON CONFLICT ("extension_pk", "version") DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "examcollect"."ide_extension_version"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "examcollect"."ide_extension"`);
  }
}
