import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Module Quản lý lab + allowlist extension VS Code — spec 2026-10-18.
 */
export class IdeExtensionLabMgmt1789620000000 implements MigrationInterface {
  name = 'IdeExtensionLabMgmt1789620000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "examcollect"."ide_extension_policy_scope" AS ENUM ('global', 'course')
    `);
    await queryRunner.query(`
      CREATE TYPE "examcollect"."ide_extension_approval_status" AS ENUM ('approved', 'pending', 'rejected')
    `);
    await queryRunner.query(`
      CREATE TYPE "examcollect"."ide_extension_scan_reported_by" AS ENUM ('teacher_hub')
    `);
    await queryRunner.query(`
      CREATE TYPE "examcollect"."ide_extension_scan_status" AS ENUM ('clean', 'has_violations')
    `);
    await queryRunner.query(`
      CREATE TYPE "examcollect"."ide_extension_verdict" AS ENUM ('allowed', 'blocked')
    `);
    await queryRunner.query(`
      CREATE TYPE "examcollect"."ide_extension_matched_scope" AS ENUM ('global', 'course')
    `);
    await queryRunner.query(`
      CREATE TYPE "examcollect"."lab_mgmt_machine_role" AS ENUM ('teacher_hub', 'student_node')
    `);

    await queryRunner.query(`
      CREATE TABLE "examcollect"."ide_extension_policy" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "scope_type" "examcollect"."ide_extension_policy_scope" NOT NULL,
        "course_id" uuid,
        "name" character varying(200) NOT NULL,
        "is_active" boolean NOT NULL DEFAULT true,
        CONSTRAINT "PK_ide_extension_policy" PRIMARY KEY ("id"),
        CONSTRAINT "ck_ide_extension_policy_scope" CHECK (
          (scope_type = 'global' AND course_id IS NULL)
          OR (scope_type = 'course' AND course_id IS NOT NULL)
        ),
        CONSTRAINT "fk_ide_extension_policy_course"
          FOREIGN KEY ("course_id") REFERENCES "examcollect"."course"("id")
          ON DELETE RESTRICT ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_ide_extension_policy_global_active"
        ON "examcollect"."ide_extension_policy" ("scope_type")
        WHERE scope_type = 'global' AND is_active = true
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_ide_extension_policy_course_active"
        ON "examcollect"."ide_extension_policy" ("course_id")
        WHERE scope_type = 'course' AND is_active = true
    `);

    await queryRunner.query(`
      CREATE TABLE "examcollect"."ide_extension_policy_item" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "policy_id" uuid NOT NULL,
        "extension_id" character varying(200) NOT NULL,
        "display_name" character varying(200),
        "min_version" character varying(50),
        "max_version" character varying(50),
        "approval_status" "examcollect"."ide_extension_approval_status" NOT NULL,
        "requested_by" uuid,
        "reviewed_by" uuid,
        "reviewed_at" TIMESTAMP WITH TIME ZONE,
        "note" text,
        CONSTRAINT "PK_ide_extension_policy_item" PRIMARY KEY ("id"),
        CONSTRAINT "uq_ide_extension_policy_item" UNIQUE ("policy_id", "extension_id"),
        CONSTRAINT "fk_ide_extension_policy_item_policy"
          FOREIGN KEY ("policy_id") REFERENCES "examcollect"."ide_extension_policy"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "fk_ide_extension_policy_item_requested"
          FOREIGN KEY ("requested_by") REFERENCES "examcollect"."account"("id")
          ON DELETE RESTRICT ON UPDATE NO ACTION,
        CONSTRAINT "fk_ide_extension_policy_item_reviewed"
          FOREIGN KEY ("reviewed_by") REFERENCES "examcollect"."account"("id")
          ON DELETE RESTRICT ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "examcollect"."lab_mgmt_session" (
        "id" uuid NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "teacher_account_id" uuid NOT NULL,
        "room_hint" character varying(200),
        "course_id" uuid,
        "exam_session_id" uuid,
        "started_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "ended_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_lab_mgmt_session" PRIMARY KEY ("id"),
        CONSTRAINT "fk_lab_mgmt_session_teacher"
          FOREIGN KEY ("teacher_account_id") REFERENCES "examcollect"."account"("id")
          ON DELETE RESTRICT ON UPDATE NO ACTION,
        CONSTRAINT "fk_lab_mgmt_session_course"
          FOREIGN KEY ("course_id") REFERENCES "examcollect"."course"("id")
          ON DELETE RESTRICT ON UPDATE NO ACTION,
        CONSTRAINT "fk_lab_mgmt_session_exam"
          FOREIGN KEY ("exam_session_id") REFERENCES "examcollect"."exam_session"("id")
          ON DELETE RESTRICT ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "examcollect"."lab_mgmt_machine" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "lab_mgmt_session_id" uuid NOT NULL,
        "machine_id" character varying(100) NOT NULL,
        "role" "examcollect"."lab_mgmt_machine_role" NOT NULL,
        "hostname" character varying(200) NOT NULL,
        "local_ip" character varying(64) NOT NULL,
        "student_mssv" citext,
        "last_seen_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        CONSTRAINT "PK_lab_mgmt_machine" PRIMARY KEY ("id"),
        CONSTRAINT "uq_lab_mgmt_machine_session_machine"
          UNIQUE ("lab_mgmt_session_id", "machine_id"),
        CONSTRAINT "fk_lab_mgmt_machine_session"
          FOREIGN KEY ("lab_mgmt_session_id") REFERENCES "examcollect"."lab_mgmt_session"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "examcollect"."ide_extension_scan" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "exam_session_id" uuid,
        "course_id" uuid,
        "lab_mgmt_session_id" uuid,
        "student_mssv" citext NOT NULL,
        "machine_id" character varying(100) NOT NULL,
        "machine_name" character varying(200),
        "scanned_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "reported_by" "examcollect"."ide_extension_scan_reported_by" NOT NULL DEFAULT 'teacher_hub',
        "teacher_account_id" uuid,
        "vscode_version" character varying(50),
        "extension_count" integer NOT NULL DEFAULT 0,
        "violation_count" integer NOT NULL DEFAULT 0,
        "status" "examcollect"."ide_extension_scan_status" NOT NULL,
        CONSTRAINT "PK_ide_extension_scan" PRIMARY KEY ("id"),
        CONSTRAINT "fk_ide_extension_scan_exam"
          FOREIGN KEY ("exam_session_id") REFERENCES "examcollect"."exam_session"("id")
          ON DELETE RESTRICT ON UPDATE NO ACTION,
        CONSTRAINT "fk_ide_extension_scan_course"
          FOREIGN KEY ("course_id") REFERENCES "examcollect"."course"("id")
          ON DELETE RESTRICT ON UPDATE NO ACTION,
        CONSTRAINT "fk_ide_extension_scan_lab"
          FOREIGN KEY ("lab_mgmt_session_id") REFERENCES "examcollect"."lab_mgmt_session"("id")
          ON DELETE RESTRICT ON UPDATE NO ACTION,
        CONSTRAINT "fk_ide_extension_scan_teacher"
          FOREIGN KEY ("teacher_account_id") REFERENCES "examcollect"."account"("id")
          ON DELETE RESTRICT ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_ide_extension_scan_lab_mssv"
        ON "examcollect"."ide_extension_scan" ("lab_mgmt_session_id", "student_mssv")
        WHERE lab_mgmt_session_id IS NOT NULL
    `);

    await queryRunner.query(`
      CREATE TABLE "examcollect"."ide_extension_scan_item" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "scan_id" uuid NOT NULL,
        "extension_id" character varying(200) NOT NULL,
        "display_name" character varying(200),
        "version" character varying(50),
        "verdict" "examcollect"."ide_extension_verdict" NOT NULL,
        "matched_scope" "examcollect"."ide_extension_matched_scope",
        "is_builtin" boolean NOT NULL DEFAULT false,
        CONSTRAINT "PK_ide_extension_scan_item" PRIMARY KEY ("id"),
        CONSTRAINT "fk_ide_extension_scan_item_scan"
          FOREIGN KEY ("scan_id") REFERENCES "examcollect"."ide_extension_scan"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "examcollect"."ide_extension_session_summary" (
        "lab_mgmt_session_id" uuid NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "machines_scanned" integer NOT NULL DEFAULT 0,
        "machines_with_violations" integer NOT NULL DEFAULT 0,
        "effective_extension_count" integer NOT NULL DEFAULT 0,
        "last_synced_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        CONSTRAINT "PK_ide_extension_session_summary" PRIMARY KEY ("lab_mgmt_session_id"),
        CONSTRAINT "fk_ide_extension_session_summary_lab"
          FOREIGN KEY ("lab_mgmt_session_id") REFERENCES "examcollect"."lab_mgmt_session"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "examcollect"."ide_extension_session_summary"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "examcollect"."ide_extension_scan_item"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "examcollect"."ide_extension_scan"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "examcollect"."lab_mgmt_machine"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "examcollect"."lab_mgmt_session"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "examcollect"."ide_extension_policy_item"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "examcollect"."ide_extension_policy"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "examcollect"."lab_mgmt_machine_role"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "examcollect"."ide_extension_matched_scope"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "examcollect"."ide_extension_verdict"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "examcollect"."ide_extension_scan_status"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "examcollect"."ide_extension_scan_reported_by"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "examcollect"."ide_extension_approval_status"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "examcollect"."ide_extension_policy_scope"`);
  }
}
