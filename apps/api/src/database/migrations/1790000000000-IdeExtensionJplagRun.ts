import { MigrationInterface, QueryRunner } from 'typeorm';

/** Persist JPlag exam-flow runs (vs_model / vs_student) — spec 2026-11-15-ide-extension-jplag-exam-flow. */
export class IdeExtensionJplagRun1790000000000 implements MigrationInterface {
  name = 'IdeExtensionJplagRun1790000000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TYPE "examcollect"."ide_extension_jplag_run_kind" AS ENUM ('vs_model', 'vs_student');
      CREATE TYPE "examcollect"."ide_extension_jplag_run_status" AS ENUM (
        'pending', 'running', 'completed', 'failed'
      );
      CREATE TYPE "examcollect"."ide_extension_jplag_run_trigger" AS ENUM (
        'scan', 'submission', 'manual'
      );

      CREATE TABLE "examcollect"."ide_extension_jplag_run" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "exam_session_id" uuid NOT NULL,
        "extension_pk" uuid,
        "version_id" uuid,
        "extension_identifier" varchar(200) NOT NULL,
        "extension_version" varchar(50),
        "kind" "examcollect"."ide_extension_jplag_run_kind" NOT NULL,
        "status" "examcollect"."ide_extension_jplag_run_status" NOT NULL DEFAULT 'pending',
        "trigger" "examcollect"."ide_extension_jplag_run_trigger" NOT NULL,
        "language" varchar(32),
        "student_mssv" varchar(50),
        "required_deliverable_id" uuid,
        "submission_id" uuid,
        "similarity_text" double precision,
        "similarity_language" double precision,
        "report_text_key" varchar,
        "report_language_key" varchar,
        "comparison_text_key" varchar,
        "comparison_language_key" varchar,
        "error" text,
        CONSTRAINT "fk_jplag_run_exam_session"
          FOREIGN KEY ("exam_session_id") REFERENCES "examcollect"."exam_session"("id") ON DELETE CASCADE
      );

      CREATE INDEX "idx_jplag_run_session" ON "examcollect"."ide_extension_jplag_run" ("exam_session_id");
      CREATE INDEX "idx_jplag_run_status" ON "examcollect"."ide_extension_jplag_run" ("status");

      CREATE UNIQUE INDEX "uq_jplag_run_vs_model_active"
        ON "examcollect"."ide_extension_jplag_run" ("exam_session_id", "version_id")
        WHERE "kind" = 'vs_model' AND "status" IN ('pending', 'running', 'completed') AND "version_id" IS NOT NULL;

      CREATE UNIQUE INDEX "uq_jplag_run_vs_student_active"
        ON "examcollect"."ide_extension_jplag_run" (
          "exam_session_id", "version_id", "student_mssv", "required_deliverable_id"
        )
        WHERE "kind" = 'vs_student'
          AND "status" IN ('pending', 'running', 'completed')
          AND "version_id" IS NOT NULL
          AND "student_mssv" IS NOT NULL
          AND "required_deliverable_id" IS NOT NULL;
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`
      DROP TABLE IF EXISTS "examcollect"."ide_extension_jplag_run";
      DROP TYPE IF EXISTS "examcollect"."ide_extension_jplag_run_trigger";
      DROP TYPE IF EXISTS "examcollect"."ide_extension_jplag_run_status";
      DROP TYPE IF EXISTS "examcollect"."ide_extension_jplag_run_kind";
    `);
  }
}
