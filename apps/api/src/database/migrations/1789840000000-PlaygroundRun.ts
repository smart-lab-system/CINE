import { MigrationInterface, QueryRunner } from 'typeorm';

export class PlaygroundRun1789840000000 implements MigrationInterface {
  name = 'PlaygroundRun1789840000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "examcollect"."playground_run" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "created_by_account_id" uuid NOT NULL,
        "language" character varying(16) NOT NULL,
        "status" character varying(32) NOT NULL,
        "entry_path" character varying(512),
        "entry_detection" character varying(16),
        "candidates" jsonb,
        "file_paths" jsonb NOT NULL,
        "compile_log" text,
        "stdout" text,
        "stderr" text,
        "exit_code" integer,
        "error" text,
        "started_at" TIMESTAMP WITH TIME ZONE,
        "finished_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_playground_run" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_playground_run_created_by"
        ON "examcollect"."playground_run" ("created_by_account_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "examcollect"."IDX_playground_run_created_by"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "examcollect"."playground_run"`);
  }
}
