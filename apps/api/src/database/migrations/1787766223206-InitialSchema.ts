import { MigrationInterface, QueryRunner } from "typeorm";

// Structural DDL (tables/enums/FKs/checks/indexes) in `up()` up to the
// "Business-rule triggers" marker is generated from the entities via
// `pnpm migration:generate` — see apps/api/src/database/data-source.ts.
// Two things needed hand-fixing after generation, both noted inline below:
// audit_log's RANGE partitioning (PARTITION BY can't be expressed by an
// entity decorator, and can't be ALTERed onto a plain table afterwards),
// and de-duplicating the `deliverable_type` enum (two entities declare a
// column with the same `enumName`, and the generator emitted two
// `CREATE TYPE` statements for it instead of recognizing they're the same
// Postgres type). Everything after that marker is hand-written: trigger
// functions/triggers enforcing rules decorators can't express (CLAUDE.md's
// state machines and immutability rules) and the audit_log default
// partition.
export class InitialSchema1787766223206 implements MigrationInterface {
    name = 'InitialSchema1787766223206'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "examcollect"."account_role" AS ENUM('admin', 'teacher', 'super_admin', 'department_admin')`);
        await queryRunner.query(`CREATE TABLE "examcollect"."account" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "name" character varying(150) NOT NULL, "email" citext NOT NULL, "password_hash" text NOT NULL, "role" "examcollect"."account_role" NOT NULL, CONSTRAINT "ck_account_password_hash_length" CHECK (length(password_hash) >= 20), CONSTRAINT "PK_54115ee388cdb6d86bb4bf5b2ea" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "uq_account_email" ON "examcollect"."account" ("email") `);
        await queryRunner.query(`CREATE TABLE "examcollect"."semester" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "name" character varying(150) NOT NULL, "start_date" date NOT NULL, "end_date" date NOT NULL, CONSTRAINT "ck_semester_dates" CHECK (end_date >= start_date), CONSTRAINT "PK_9129c1fd35aa4aded7a9825b38d" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "examcollect"."course" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "code" citext NOT NULL, "name" character varying(200) NOT NULL, "semester_id" uuid NOT NULL, CONSTRAINT "PK_bf95180dd756fd204fb01ce4916" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "uq_course_semester_code" ON "examcollect"."course" ("semester_id", "code") `);
        await queryRunner.query(`CREATE TABLE "examcollect"."class" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "course_id" uuid NOT NULL, "name" character varying(100) NOT NULL, "teacher_id" uuid NOT NULL, CONSTRAINT "PK_0b9024d21bdfba8b1bd1c300eae" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "uq_class_course_name" ON "examcollect"."class" ("course_id", "name") `);
        await queryRunner.query(`CREATE TABLE "examcollect"."class_roster" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "course_id" uuid NOT NULL, "home_class_id" uuid NOT NULL, "student_mssv" citext NOT NULL, "student_name" character varying(150) NOT NULL, CONSTRAINT "ck_class_roster_mssv" CHECK (student_mssv ~ '^[A-Za-z0-9]{4,20}$'), CONSTRAINT "PK_a3de9d295f217b0a4d7f6b90ca5" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "uq_class_roster_course_student" ON "examcollect"."class_roster" ("course_id", "student_mssv") `);
        await queryRunner.query(`CREATE TABLE "examcollect"."enrollment" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "student_mssv" citext NOT NULL, "course_id" uuid NOT NULL, "home_class_id" uuid NOT NULL, "home_teacher_id" uuid NOT NULL, CONSTRAINT "ck_enrollment_mssv" CHECK (student_mssv ~ '^[A-Za-z0-9]{4,20}$'), CONSTRAINT "PK_7e200c699fa93865cdcdd025885" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "uq_enrollment_course_student" ON "examcollect"."enrollment" ("course_id", "student_mssv") `);
        await queryRunner.query(`CREATE TABLE "examcollect"."rubric" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "course_id" uuid NOT NULL, "version" integer NOT NULL DEFAULT '1', "is_active" boolean NOT NULL DEFAULT true, CONSTRAINT "PK_c6926c4b9f70196fae0f95c5691" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "uq_rubric_course_version" ON "examcollect"."rubric" ("course_id", "version") `);
        await queryRunner.query(`CREATE TYPE "examcollect"."exam_session_status" AS ENUM('draft', 'scheduled', 'active', 'completed', 'cancelled')`);
        await queryRunner.query(`CREATE TABLE "examcollect"."exam_session" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "course_id" uuid NOT NULL, "teacher_id" uuid NOT NULL, "start_time" TIMESTAMP WITH TIME ZONE NOT NULL, "end_time" TIMESTAMP WITH TIME ZONE NOT NULL, "submission_rule" jsonb NOT NULL DEFAULT '{}', "status" "examcollect"."exam_session_status" NOT NULL DEFAULT 'draft', "rubric_id" uuid, CONSTRAINT "ck_exam_session_time" CHECK (end_time > start_time), CONSTRAINT "PK_e95661f107b30b65c630381d1e2" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "examcollect"."deliverable_type" AS ENUM('document', 'code_project', 'image')`);
        await queryRunner.query(`CREATE TABLE "examcollect"."required_deliverable" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "exam_session_id" uuid NOT NULL, "required_filename" character varying(255) NOT NULL, "deliverable_type" "examcollect"."deliverable_type" NOT NULL, CONSTRAINT "PK_ed4260bf8512f17996019b6949b" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "uq_required_deliverable_session_filename" ON "examcollect"."required_deliverable" ("exam_session_id", "required_filename") `);
        await queryRunner.query(`CREATE TABLE "examcollect"."exam_material" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "exam_session_id" uuid NOT NULL, "storage_key" text NOT NULL, "file_name" character varying(255) NOT NULL, "file_size" bigint NOT NULL, "uploaded_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "ck_exam_material_file_size" CHECK (file_size >= 0), CONSTRAINT "PK_1dd922caed3ec86b1958882a555" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "examcollect"."agent_event_type" AS ENUM('connected', 'disconnected', 'reconnected')`);
        await queryRunner.query(`CREATE TABLE "examcollect"."agent_connection_event" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "exam_session_id" uuid NOT NULL, "student_mssv" citext NOT NULL, "event_type" "examcollect"."agent_event_type" NOT NULL, "joined_late" boolean NOT NULL DEFAULT false, "occurred_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_7007d8b359db82b731124e1718b" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "idx_agent_connection_event_student" ON "examcollect"."agent_connection_event" ("student_mssv", "exam_session_id") `);
        await queryRunner.query(`CREATE INDEX "idx_agent_connection_event_session" ON "examcollect"."agent_connection_event" ("exam_session_id", "occurred_at") `);
        await queryRunner.query(`CREATE TYPE "examcollect"."submission_via" AS ENUM('normal', 'backup', 'manual_pull')`);
        await queryRunner.query(`CREATE TYPE "examcollect"."submission_status" AS ENUM('received', 'validated', 'collected', 'invalid')`);
        await queryRunner.query(`CREATE TABLE "examcollect"."submission" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "exam_session_id" uuid NOT NULL, "required_deliverable_id" uuid NOT NULL, "student_mssv" citext NOT NULL, "student_name_input" character varying(150) NOT NULL, "home_class_id" uuid NOT NULL, "home_teacher_id" uuid NOT NULL, "storage_key" text, "checksum" character varying(64), "file_size" bigint, "submitted_via" "examcollect"."submission_via" NOT NULL DEFAULT 'normal', "submitted_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "status" "examcollect"."submission_status" NOT NULL DEFAULT 'received', CONSTRAINT "ck_submission_checksum" CHECK (checksum IS NULL OR checksum ~ '^[0-9a-f]{64}$'), CONSTRAINT "ck_submission_mssv" CHECK (student_mssv ~ '^[A-Za-z0-9]{4,20}$'), CONSTRAINT "PK_7faa571d0e4a7076e85890c9bd0" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "uq_submission_identity" ON "examcollect"."submission" ("exam_session_id", "required_deliverable_id", "student_mssv") `);
        await queryRunner.query(`CREATE TABLE "examcollect"."rubric_criterion" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "rubric_id" uuid NOT NULL, "description" text NOT NULL, "max_points" numeric(6,2) NOT NULL, "sort_order" smallint NOT NULL DEFAULT '0', CONSTRAINT "ck_rubric_criterion_max_points" CHECK (max_points > 0), CONSTRAINT "PK_2891a0ba24d0310a3bbad916e5c" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "examcollect"."grading_status" AS ENUM('ai_grading', 'ai_graded', 'auto_approved', 'flagged_for_review', 'teacher_reviewed', 'finalized', 'exported')`);
        await queryRunner.query(`CREATE TABLE "examcollect"."grading_result" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "submission_id" uuid NOT NULL, "rubric_id_version" uuid NOT NULL, "model_used" character varying(100), "criterion_results" jsonb NOT NULL DEFAULT '[]', "ai_total_score" numeric(6,2), "confidence" numeric(4,3), "flag_for_review" boolean NOT NULL DEFAULT false, "grading_triggered_by" uuid NOT NULL, "grading_triggered_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "status" "examcollect"."grading_status" NOT NULL DEFAULT 'ai_grading', CONSTRAINT "ck_grading_result_confidence" CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1), CONSTRAINT "PK_6e8a519068e03f1c6709ced66e3" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "examcollect"."teacher_review" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "grading_result_id" uuid NOT NULL, "teacher_id" uuid NOT NULL, "final_score" numeric(6,2) NOT NULL, "edited_criteria" jsonb NOT NULL DEFAULT '{}', "reviewed_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "ck_teacher_review_final_score" CHECK (final_score >= 0), CONSTRAINT "PK_e6d359c5da4b8a7f63ce2c84bc4" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "examcollect"."grade_export" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "exam_session_id" uuid NOT NULL, "exported_by" uuid NOT NULL, "template_storage_key" text NOT NULL, "output_storage_key" text, "mssv_column" character varying(20) NOT NULL, "score_column" character varying(20) NOT NULL, "unmatched_mssv_count" integer NOT NULL DEFAULT '0', "exported_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_a8b2d1a0b09197efbfeaf3a5a1f" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "examcollect"."calibration_run" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "rubric_id_version" uuid NOT NULL, "model_used" character varying(100), "sample_size" integer NOT NULL, "agreement_score" numeric(5,4), "cost_usd" numeric(10,4), "run_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "notes" text, CONSTRAINT "ck_calibration_run_agreement" CHECK (agreement_score IS NULL OR agreement_score BETWEEN -1 AND 1), CONSTRAINT "ck_calibration_run_sample_size" CHECK (sample_size > 0), CONSTRAINT "PK_7354cd659ca555f994b06e4c276" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "examcollect"."audit_actor_type" AS ENUM('user', 'system')`);
        // Hand-fixed: PARTITION BY RANGE (occurred_at), with the PK widened to
        // (occurred_at, id) — Postgres requires the partition key to be part
        // of every unique constraint on a partitioned table. Not expressible
        // as an entity decorator (TypeORM has no partitioning support), and
        // can't be ALTERed onto a plain table afterwards.
        await queryRunner.query(`CREATE TABLE "examcollect"."audit_log" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "occurred_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "actor_type" "examcollect"."audit_actor_type" NOT NULL DEFAULT 'system', "actor_id" uuid, "action" character varying(80) NOT NULL, "target_type" character varying(80) NOT NULL, "target_id" uuid NOT NULL, "old_value" jsonb NOT NULL DEFAULT '{}', "new_value" jsonb NOT NULL DEFAULT '{}', CONSTRAINT "ck_audit_log_actor" CHECK ((actor_type = 'user' AND actor_id IS NOT NULL) OR (actor_type = 'system' AND actor_id IS NULL)), CONSTRAINT "PK_audit_log" PRIMARY KEY ("occurred_at", "id")) PARTITION BY RANGE ("occurred_at")`);
        await queryRunner.query(`CREATE TABLE "examcollect"."audit_log_default" PARTITION OF "examcollect"."audit_log" DEFAULT`);
        await queryRunner.query(`CREATE INDEX "idx_audit_log_action_time" ON "examcollect"."audit_log" ("action", "occurred_at") `);
        await queryRunner.query(`CREATE INDEX "idx_audit_log_target_time" ON "examcollect"."audit_log" ("target_type", "target_id", "occurred_at") `);
        await queryRunner.query(`CREATE INDEX "idx_audit_log_actor_time" ON "examcollect"."audit_log" ("actor_id", "occurred_at") `);
        await queryRunner.query(`CREATE TABLE "examcollect"."rubric_template" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "department_id" uuid, "name" character varying(200) NOT NULL, "criteria" jsonb NOT NULL DEFAULT '[]', "created_by" uuid NOT NULL, CONSTRAINT "PK_ec4fd941ae8dd908994ac41dd64" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "examcollect"."cost_budget_scope" AS ENUM('teacher', 'department')`);
        await queryRunner.query(`CREATE TABLE "examcollect"."cost_budget" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "scope_type" "examcollect"."cost_budget_scope" NOT NULL, "scope_id" uuid NOT NULL, "monthly_limit_usd" numeric(10,2) NOT NULL, "current_spend_usd" numeric(10,2) NOT NULL DEFAULT '0', "period" character varying(7) NOT NULL, CONSTRAINT "ck_cost_budget_period" CHECK (period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'), CONSTRAINT "ck_cost_budget_spend" CHECK (current_spend_usd >= 0), CONSTRAINT "ck_cost_budget_limit" CHECK (monthly_limit_usd >= 0), CONSTRAINT "PK_6ce7699754a38225e851ee99755" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "uq_cost_budget_scope_period" ON "examcollect"."cost_budget" ("scope_type", "scope_id", "period") `);
        await queryRunner.query(`CREATE TYPE "examcollect"."grading_pipeline_scope" AS ENUM('global', 'course')`);
        // Hand-fixed: de-duplicated. required_deliverable (above) already
        // created the `deliverable_type` enum this column reuses — Postgres
        // enum types are schema-wide, not per-table, so a second
        // `CREATE TYPE` here would fail with "type already exists".
        await queryRunner.query(`CREATE TABLE "examcollect"."grading_pipeline_config" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "scope_type" "examcollect"."grading_pipeline_scope" NOT NULL, "scope_id" uuid, "deliverable_type" "examcollect"."deliverable_type" NOT NULL, "primary_model" character varying(100) NOT NULL, "escalation_model" character varying(100), "confidence_threshold" numeric(4,3), "updated_by" uuid NOT NULL, CONSTRAINT "ck_grading_pipeline_config_scope" CHECK ((scope_type = 'global' AND scope_id IS NULL) OR (scope_type = 'course' AND scope_id IS NOT NULL)), CONSTRAINT "PK_a7da63913320d5346263a683d9b" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "uq_grading_pipeline_config_scope_deliverable" ON "examcollect"."grading_pipeline_config" ("scope_type", "scope_id", "deliverable_type") `);
        await queryRunner.query(`ALTER TABLE "examcollect"."course" ADD CONSTRAINT "FK_3daacf1aa8e795638c83bd2ab27" FOREIGN KEY ("semester_id") REFERENCES "examcollect"."semester"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "examcollect"."class" ADD CONSTRAINT "FK_57476b73061271c061ae6dd16ea" FOREIGN KEY ("course_id") REFERENCES "examcollect"."course"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "examcollect"."class" ADD CONSTRAINT "FK_c24cc47b50016cb7ec5a0716ee5" FOREIGN KEY ("teacher_id") REFERENCES "examcollect"."account"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "examcollect"."class_roster" ADD CONSTRAINT "FK_a4bd8c8687d40e180e074105ed4" FOREIGN KEY ("course_id") REFERENCES "examcollect"."course"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "examcollect"."class_roster" ADD CONSTRAINT "FK_240ad5d6591fa0de516bc4ff846" FOREIGN KEY ("home_class_id") REFERENCES "examcollect"."class"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "examcollect"."enrollment" ADD CONSTRAINT "FK_dd1ce01d1164c8bbdda052ced74" FOREIGN KEY ("course_id") REFERENCES "examcollect"."course"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "examcollect"."enrollment" ADD CONSTRAINT "FK_2cda13be1557653653b146b39b5" FOREIGN KEY ("home_class_id") REFERENCES "examcollect"."class"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "examcollect"."enrollment" ADD CONSTRAINT "FK_801e9a8d380ed648f0554cc0a05" FOREIGN KEY ("home_teacher_id") REFERENCES "examcollect"."account"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "examcollect"."rubric" ADD CONSTRAINT "FK_46d3c6d0158ff9b0dd8736cf8e6" FOREIGN KEY ("course_id") REFERENCES "examcollect"."course"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "examcollect"."exam_session" ADD CONSTRAINT "FK_100641d6d10a21a54cc580117ed" FOREIGN KEY ("course_id") REFERENCES "examcollect"."course"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "examcollect"."exam_session" ADD CONSTRAINT "FK_71c0c1784164ebd508507c5fc91" FOREIGN KEY ("teacher_id") REFERENCES "examcollect"."account"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "examcollect"."exam_session" ADD CONSTRAINT "FK_b39bac4a67f38dfc62bd6510475" FOREIGN KEY ("rubric_id") REFERENCES "examcollect"."rubric"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "examcollect"."required_deliverable" ADD CONSTRAINT "FK_ad1742404e324bc0c7157395395" FOREIGN KEY ("exam_session_id") REFERENCES "examcollect"."exam_session"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "examcollect"."exam_material" ADD CONSTRAINT "FK_4f15e111ad3751af9b332042914" FOREIGN KEY ("exam_session_id") REFERENCES "examcollect"."exam_session"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "examcollect"."agent_connection_event" ADD CONSTRAINT "FK_555437024295ce984783216712e" FOREIGN KEY ("exam_session_id") REFERENCES "examcollect"."exam_session"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "examcollect"."submission" ADD CONSTRAINT "FK_232fc80d2efab02fc9ad92ee0cf" FOREIGN KEY ("exam_session_id") REFERENCES "examcollect"."exam_session"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "examcollect"."submission" ADD CONSTRAINT "FK_bb521aabd1a81ffbe61e2b19a27" FOREIGN KEY ("required_deliverable_id") REFERENCES "examcollect"."required_deliverable"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "examcollect"."submission" ADD CONSTRAINT "FK_6b29f44f3dd2c6b98bdc49cff42" FOREIGN KEY ("home_class_id") REFERENCES "examcollect"."class"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "examcollect"."submission" ADD CONSTRAINT "FK_ce0ab514839fa26e208afd68ebd" FOREIGN KEY ("home_teacher_id") REFERENCES "examcollect"."account"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "examcollect"."rubric_criterion" ADD CONSTRAINT "FK_37862cc340c6094ae756a2ebe86" FOREIGN KEY ("rubric_id") REFERENCES "examcollect"."rubric"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "examcollect"."grading_result" ADD CONSTRAINT "FK_fa607b916b8fc17bab3c0650f6b" FOREIGN KEY ("submission_id") REFERENCES "examcollect"."submission"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "examcollect"."grading_result" ADD CONSTRAINT "FK_927d275385ae315d4bba3fe5581" FOREIGN KEY ("rubric_id_version") REFERENCES "examcollect"."rubric"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "examcollect"."grading_result" ADD CONSTRAINT "FK_d7bf07f65af723a687be7b92dcb" FOREIGN KEY ("grading_triggered_by") REFERENCES "examcollect"."account"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "examcollect"."teacher_review" ADD CONSTRAINT "FK_af83224d8bd321cc8d8844772ed" FOREIGN KEY ("grading_result_id") REFERENCES "examcollect"."grading_result"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "examcollect"."teacher_review" ADD CONSTRAINT "FK_a8bd165f72cef27713ef6badafa" FOREIGN KEY ("teacher_id") REFERENCES "examcollect"."account"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "examcollect"."grade_export" ADD CONSTRAINT "FK_7a4d1d577f8919be4abd21076f0" FOREIGN KEY ("exam_session_id") REFERENCES "examcollect"."exam_session"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "examcollect"."grade_export" ADD CONSTRAINT "FK_e8dabf749bd44beffd6bd0be40d" FOREIGN KEY ("exported_by") REFERENCES "examcollect"."account"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "examcollect"."calibration_run" ADD CONSTRAINT "FK_32b90f4fe7e6b8522ebb0ef4bd8" FOREIGN KEY ("rubric_id_version") REFERENCES "examcollect"."rubric"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "examcollect"."audit_log" ADD CONSTRAINT "FK_15a6f5aad57db494c17986ed2e2" FOREIGN KEY ("actor_id") REFERENCES "examcollect"."account"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "examcollect"."rubric_template" ADD CONSTRAINT "FK_7c5c826c1ce2bbbbe68ddcf7699" FOREIGN KEY ("created_by") REFERENCES "examcollect"."account"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "examcollect"."grading_pipeline_config" ADD CONSTRAINT "FK_98dffb66c25a38b1100c9c49359" FOREIGN KEY ("scope_id") REFERENCES "examcollect"."course"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "examcollect"."grading_pipeline_config" ADD CONSTRAINT "FK_867f4b50e248e94f52d33e7f674" FOREIGN KEY ("updated_by") REFERENCES "examcollect"."account"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);

        // ============================================================
        // Business-rule triggers — hand-written, not derivable from entity
        // decorators. Each one enforces a rule CLAUDE.md marks as
        // mandatory, not a nice-to-have.
        // ============================================================

        // Belt-and-suspenders for `updated_at`: TypeORM's @UpdateDateColumn
        // only fires through Repository#save(); a raw Repository#update()
        // call (very common for partial updates) bypasses it silently. This
        // trigger keeps `updated_at` correct regardless of write path.
        await queryRunner.query(`
            CREATE OR REPLACE FUNCTION examcollect.set_updated_at()
            RETURNS TRIGGER
            LANGUAGE plpgsql
            SET search_path = examcollect, public
            AS $$
            BEGIN
                NEW.updated_at := clock_timestamp();
                RETURN NEW;
            END;
            $$;
        `);

        await queryRunner.query(`
            CREATE OR REPLACE FUNCTION examcollect.prevent_append_only_mutation()
            RETURNS TRIGGER
            LANGUAGE plpgsql
            SET search_path = examcollect, public
            AS $$
            BEGIN
                RAISE EXCEPTION '% is append-only; % is not allowed',
                    TG_TABLE_NAME,
                    TG_OP
                    USING ERRCODE = 'object_not_in_prerequisite_state';
            END;
            $$;
        `);

        // CLAUDE.md Security rule 7: once any GradingResult references a
        // rubric version, that version's criteria are frozen.
        await queryRunner.query(`
            CREATE OR REPLACE FUNCTION examcollect.guard_rubric_criteria_immutable()
            RETURNS TRIGGER
            LANGUAGE plpgsql
            SET search_path = examcollect, public
            AS $$
            BEGIN
                IF EXISTS (
                    SELECT 1 FROM grading_result
                    WHERE rubric_id_version = OLD.rubric_id
                ) THEN
                    RAISE EXCEPTION
                        'Rubric criterion % is frozen — its rubric version has already been used for grading',
                        OLD.id
                        USING ERRCODE = 'object_not_in_prerequisite_state';
                END IF;
                RETURN COALESCE(NEW, OLD);
            END;
            $$;
        `);

        // CLAUDE.md Security rule 6: the AI's original output is never
        // overwritten once set. A teacher's edit always creates a new
        // teacher_review row instead.
        await queryRunner.query(`
            CREATE OR REPLACE FUNCTION examcollect.guard_grading_result_ai_immutable()
            RETURNS TRIGGER
            LANGUAGE plpgsql
            SET search_path = examcollect, public
            AS $$
            BEGIN
                IF OLD.ai_total_score IS NOT NULL
                   AND (
                        NEW.ai_total_score IS DISTINCT FROM OLD.ai_total_score
                        OR NEW.criterion_results IS DISTINCT FROM OLD.criterion_results
                        OR NEW.model_used IS DISTINCT FROM OLD.model_used
                        OR NEW.confidence IS DISTINCT FROM OLD.confidence
                   ) THEN
                    RAISE EXCEPTION
                        'GradingResult %''s AI output is immutable once set; edit via TeacherReview instead',
                        OLD.id
                        USING ERRCODE = 'object_not_in_prerequisite_state';
                END IF;
                RETURN NEW;
            END;
            $$;
        `);

        // Submission (COLLECTION lifecycle): received -> validated ->
        // collected, or -> invalid from either received or validated.
        // Copied verbatim from CLAUDE.md's State Machines section.
        await queryRunner.query(`
            CREATE OR REPLACE FUNCTION examcollect.validate_submission_lifecycle()
            RETURNS TRIGGER
            LANGUAGE plpgsql
            SET search_path = examcollect, public
            AS $$
            BEGIN
                IF TG_OP = 'INSERT' THEN
                    IF NEW.status NOT IN ('received', 'invalid') THEN
                        RAISE EXCEPTION 'A submission must be created as received or invalid'
                            USING ERRCODE = 'check_violation';
                    END IF;
                    RETURN NEW;
                END IF;

                IF NEW.status IS DISTINCT FROM OLD.status
                   AND NOT (
                        (OLD.status = 'received' AND NEW.status IN ('validated', 'invalid'))
                        OR (OLD.status = 'validated' AND NEW.status IN ('collected', 'invalid'))
                   ) THEN
                    RAISE EXCEPTION 'Invalid submission status transition: % -> %',
                        OLD.status,
                        NEW.status
                        USING ERRCODE = 'check_violation';
                END IF;

                RETURN NEW;
            END;
            $$;
        `);

        // GradingResult (GRADING lifecycle), only initialized when the
        // teacher clicks "Start Grading". Copied verbatim from CLAUDE.md's
        // State Machines section.
        await queryRunner.query(`
            CREATE OR REPLACE FUNCTION examcollect.validate_grading_result_lifecycle()
            RETURNS TRIGGER
            LANGUAGE plpgsql
            SET search_path = examcollect, public
            AS $$
            BEGIN
                IF TG_OP = 'INSERT' THEN
                    IF NEW.status <> 'ai_grading' THEN
                        RAISE EXCEPTION 'A grading result must be created in ai_grading status'
                            USING ERRCODE = 'check_violation';
                    END IF;
                    RETURN NEW;
                END IF;

                IF NEW.status IS DISTINCT FROM OLD.status
                   AND NOT (
                        (OLD.status = 'ai_grading' AND NEW.status = 'ai_graded')
                        OR (OLD.status = 'ai_graded'
                            AND NEW.status IN ('auto_approved', 'flagged_for_review'))
                        OR (OLD.status IN ('auto_approved', 'flagged_for_review')
                            AND NEW.status = 'teacher_reviewed')
                        OR (OLD.status = 'teacher_reviewed' AND NEW.status = 'finalized')
                        OR (OLD.status = 'finalized' AND NEW.status = 'exported')
                   ) THEN
                    RAISE EXCEPTION 'Invalid grading result status transition: % -> %',
                        OLD.status,
                        NEW.status
                        USING ERRCODE = 'check_violation';
                END IF;

                RETURN NEW;
            END;
            $$;
        `);

        const updatedAtTables = [
            'account', 'semester', 'course', 'class', 'class_roster', 'enrollment',
            'rubric', 'rubric_criterion', 'exam_session', 'required_deliverable',
            'exam_material', 'submission', 'grading_result', 'teacher_review',
            'grade_export', 'rubric_template', 'cost_budget', 'grading_pipeline_config',
        ];
        for (const table of updatedAtTables) {
            await queryRunner.query(`
                CREATE TRIGGER trg_${table}_updated_at
                BEFORE UPDATE ON examcollect.${table}
                FOR EACH ROW EXECUTE FUNCTION examcollect.set_updated_at();
            `);
        }

        await queryRunner.query(`
            CREATE TRIGGER trg_agent_connection_event_immutable
            BEFORE UPDATE OR DELETE ON examcollect.agent_connection_event
            FOR EACH ROW EXECUTE FUNCTION examcollect.prevent_append_only_mutation();
        `);
        await queryRunner.query(`
            CREATE TRIGGER trg_audit_log_immutable
            BEFORE UPDATE OR DELETE ON examcollect.audit_log
            FOR EACH ROW EXECUTE FUNCTION examcollect.prevent_append_only_mutation();
        `);
        await queryRunner.query(`
            CREATE TRIGGER trg_rubric_criterion_guard_immutable
            BEFORE UPDATE OR DELETE ON examcollect.rubric_criterion
            FOR EACH ROW EXECUTE FUNCTION examcollect.guard_rubric_criteria_immutable();
        `);
        await queryRunner.query(`
            CREATE TRIGGER trg_submission_lifecycle
            BEFORE INSERT OR UPDATE ON examcollect.submission
            FOR EACH ROW EXECUTE FUNCTION examcollect.validate_submission_lifecycle();
        `);
        await queryRunner.query(`
            CREATE TRIGGER trg_grading_result_lifecycle
            BEFORE INSERT OR UPDATE ON examcollect.grading_result
            FOR EACH ROW EXECUTE FUNCTION examcollect.validate_grading_result_lifecycle();
        `);
        await queryRunner.query(`
            CREATE TRIGGER trg_grading_result_guard_ai_immutable
            BEFORE UPDATE ON examcollect.grading_result
            FOR EACH ROW EXECUTE FUNCTION examcollect.guard_grading_result_ai_immutable();
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TRIGGER IF EXISTS trg_grading_result_guard_ai_immutable ON examcollect.grading_result`);
        await queryRunner.query(`DROP TRIGGER IF EXISTS trg_grading_result_lifecycle ON examcollect.grading_result`);
        await queryRunner.query(`DROP TRIGGER IF EXISTS trg_submission_lifecycle ON examcollect.submission`);
        await queryRunner.query(`DROP TRIGGER IF EXISTS trg_rubric_criterion_guard_immutable ON examcollect.rubric_criterion`);
        await queryRunner.query(`DROP TRIGGER IF EXISTS trg_audit_log_immutable ON examcollect.audit_log`);
        await queryRunner.query(`DROP TRIGGER IF EXISTS trg_agent_connection_event_immutable ON examcollect.agent_connection_event`);

        const updatedAtTables = [
            'account', 'semester', 'course', 'class', 'class_roster', 'enrollment',
            'rubric', 'rubric_criterion', 'exam_session', 'required_deliverable',
            'exam_material', 'submission', 'grading_result', 'teacher_review',
            'grade_export', 'rubric_template', 'cost_budget', 'grading_pipeline_config',
        ];
        for (const table of updatedAtTables) {
            await queryRunner.query(`DROP TRIGGER IF EXISTS trg_${table}_updated_at ON examcollect.${table}`);
        }

        await queryRunner.query(`DROP FUNCTION IF EXISTS examcollect.validate_grading_result_lifecycle()`);
        await queryRunner.query(`DROP FUNCTION IF EXISTS examcollect.validate_submission_lifecycle()`);
        await queryRunner.query(`DROP FUNCTION IF EXISTS examcollect.guard_grading_result_ai_immutable()`);
        await queryRunner.query(`DROP FUNCTION IF EXISTS examcollect.guard_rubric_criteria_immutable()`);
        await queryRunner.query(`DROP FUNCTION IF EXISTS examcollect.prevent_append_only_mutation()`);
        await queryRunner.query(`DROP FUNCTION IF EXISTS examcollect.set_updated_at()`);

        await queryRunner.query(`ALTER TABLE "examcollect"."grading_pipeline_config" DROP CONSTRAINT "FK_867f4b50e248e94f52d33e7f674"`);
        await queryRunner.query(`ALTER TABLE "examcollect"."grading_pipeline_config" DROP CONSTRAINT "FK_98dffb66c25a38b1100c9c49359"`);
        await queryRunner.query(`ALTER TABLE "examcollect"."rubric_template" DROP CONSTRAINT "FK_7c5c826c1ce2bbbbe68ddcf7699"`);
        await queryRunner.query(`ALTER TABLE "examcollect"."audit_log" DROP CONSTRAINT "FK_15a6f5aad57db494c17986ed2e2"`);
        await queryRunner.query(`ALTER TABLE "examcollect"."calibration_run" DROP CONSTRAINT "FK_32b90f4fe7e6b8522ebb0ef4bd8"`);
        await queryRunner.query(`ALTER TABLE "examcollect"."grade_export" DROP CONSTRAINT "FK_e8dabf749bd44beffd6bd0be40d"`);
        await queryRunner.query(`ALTER TABLE "examcollect"."grade_export" DROP CONSTRAINT "FK_7a4d1d577f8919be4abd21076f0"`);
        await queryRunner.query(`ALTER TABLE "examcollect"."teacher_review" DROP CONSTRAINT "FK_a8bd165f72cef27713ef6badafa"`);
        await queryRunner.query(`ALTER TABLE "examcollect"."teacher_review" DROP CONSTRAINT "FK_af83224d8bd321cc8d8844772ed"`);
        await queryRunner.query(`ALTER TABLE "examcollect"."grading_result" DROP CONSTRAINT "FK_d7bf07f65af723a687be7b92dcb"`);
        await queryRunner.query(`ALTER TABLE "examcollect"."grading_result" DROP CONSTRAINT "FK_927d275385ae315d4bba3fe5581"`);
        await queryRunner.query(`ALTER TABLE "examcollect"."grading_result" DROP CONSTRAINT "FK_fa607b916b8fc17bab3c0650f6b"`);
        await queryRunner.query(`ALTER TABLE "examcollect"."rubric_criterion" DROP CONSTRAINT "FK_37862cc340c6094ae756a2ebe86"`);
        await queryRunner.query(`ALTER TABLE "examcollect"."submission" DROP CONSTRAINT "FK_ce0ab514839fa26e208afd68ebd"`);
        await queryRunner.query(`ALTER TABLE "examcollect"."submission" DROP CONSTRAINT "FK_6b29f44f3dd2c6b98bdc49cff42"`);
        await queryRunner.query(`ALTER TABLE "examcollect"."submission" DROP CONSTRAINT "FK_bb521aabd1a81ffbe61e2b19a27"`);
        await queryRunner.query(`ALTER TABLE "examcollect"."submission" DROP CONSTRAINT "FK_232fc80d2efab02fc9ad92ee0cf"`);
        await queryRunner.query(`ALTER TABLE "examcollect"."agent_connection_event" DROP CONSTRAINT "FK_555437024295ce984783216712e"`);
        await queryRunner.query(`ALTER TABLE "examcollect"."exam_material" DROP CONSTRAINT "FK_4f15e111ad3751af9b332042914"`);
        await queryRunner.query(`ALTER TABLE "examcollect"."required_deliverable" DROP CONSTRAINT "FK_ad1742404e324bc0c7157395395"`);
        await queryRunner.query(`ALTER TABLE "examcollect"."exam_session" DROP CONSTRAINT "FK_b39bac4a67f38dfc62bd6510475"`);
        await queryRunner.query(`ALTER TABLE "examcollect"."exam_session" DROP CONSTRAINT "FK_71c0c1784164ebd508507c5fc91"`);
        await queryRunner.query(`ALTER TABLE "examcollect"."exam_session" DROP CONSTRAINT "FK_100641d6d10a21a54cc580117ed"`);
        await queryRunner.query(`ALTER TABLE "examcollect"."rubric" DROP CONSTRAINT "FK_46d3c6d0158ff9b0dd8736cf8e6"`);
        await queryRunner.query(`ALTER TABLE "examcollect"."enrollment" DROP CONSTRAINT "FK_801e9a8d380ed648f0554cc0a05"`);
        await queryRunner.query(`ALTER TABLE "examcollect"."enrollment" DROP CONSTRAINT "FK_2cda13be1557653653b146b39b5"`);
        await queryRunner.query(`ALTER TABLE "examcollect"."enrollment" DROP CONSTRAINT "FK_dd1ce01d1164c8bbdda052ced74"`);
        await queryRunner.query(`ALTER TABLE "examcollect"."class_roster" DROP CONSTRAINT "FK_240ad5d6591fa0de516bc4ff846"`);
        await queryRunner.query(`ALTER TABLE "examcollect"."class_roster" DROP CONSTRAINT "FK_a4bd8c8687d40e180e074105ed4"`);
        await queryRunner.query(`ALTER TABLE "examcollect"."class" DROP CONSTRAINT "FK_c24cc47b50016cb7ec5a0716ee5"`);
        await queryRunner.query(`ALTER TABLE "examcollect"."class" DROP CONSTRAINT "FK_57476b73061271c061ae6dd16ea"`);
        await queryRunner.query(`ALTER TABLE "examcollect"."course" DROP CONSTRAINT "FK_3daacf1aa8e795638c83bd2ab27"`);
        await queryRunner.query(`DROP INDEX "examcollect"."uq_grading_pipeline_config_scope_deliverable"`);
        await queryRunner.query(`DROP TABLE "examcollect"."grading_pipeline_config"`);
        await queryRunner.query(`DROP TYPE "examcollect"."grading_pipeline_scope"`);
        await queryRunner.query(`DROP INDEX "examcollect"."uq_cost_budget_scope_period"`);
        await queryRunner.query(`DROP TABLE "examcollect"."cost_budget"`);
        await queryRunner.query(`DROP TYPE "examcollect"."cost_budget_scope"`);
        await queryRunner.query(`DROP TABLE "examcollect"."rubric_template"`);
        await queryRunner.query(`DROP INDEX "examcollect"."idx_audit_log_actor_time"`);
        await queryRunner.query(`DROP INDEX "examcollect"."idx_audit_log_target_time"`);
        await queryRunner.query(`DROP INDEX "examcollect"."idx_audit_log_action_time"`);
        await queryRunner.query(`DROP TABLE "examcollect"."audit_log_default"`);
        await queryRunner.query(`DROP TABLE "examcollect"."audit_log"`);
        await queryRunner.query(`DROP TYPE "examcollect"."audit_actor_type"`);
        await queryRunner.query(`DROP TABLE "examcollect"."calibration_run"`);
        await queryRunner.query(`DROP TABLE "examcollect"."grade_export"`);
        await queryRunner.query(`DROP TABLE "examcollect"."teacher_review"`);
        await queryRunner.query(`DROP TABLE "examcollect"."grading_result"`);
        await queryRunner.query(`DROP TYPE "examcollect"."grading_status"`);
        await queryRunner.query(`DROP TABLE "examcollect"."rubric_criterion"`);
        await queryRunner.query(`DROP INDEX "examcollect"."uq_submission_identity"`);
        await queryRunner.query(`DROP TABLE "examcollect"."submission"`);
        await queryRunner.query(`DROP TYPE "examcollect"."submission_status"`);
        await queryRunner.query(`DROP TYPE "examcollect"."submission_via"`);
        await queryRunner.query(`DROP INDEX "examcollect"."idx_agent_connection_event_session"`);
        await queryRunner.query(`DROP INDEX "examcollect"."idx_agent_connection_event_student"`);
        await queryRunner.query(`DROP TABLE "examcollect"."agent_connection_event"`);
        await queryRunner.query(`DROP TYPE "examcollect"."agent_event_type"`);
        await queryRunner.query(`DROP TABLE "examcollect"."exam_material"`);
        await queryRunner.query(`DROP INDEX "examcollect"."uq_required_deliverable_session_filename"`);
        await queryRunner.query(`DROP TABLE "examcollect"."required_deliverable"`);
        // Hand-fixed: dropped once here (not again after exam_session below) —
        // this is the shared `deliverable_type` enum's only remaining user.
        await queryRunner.query(`DROP TYPE "examcollect"."deliverable_type"`);
        await queryRunner.query(`DROP TABLE "examcollect"."exam_session"`);
        await queryRunner.query(`DROP TYPE "examcollect"."exam_session_status"`);
        await queryRunner.query(`DROP INDEX "examcollect"."uq_rubric_course_version"`);
        await queryRunner.query(`DROP TABLE "examcollect"."rubric"`);
        await queryRunner.query(`DROP INDEX "examcollect"."uq_enrollment_course_student"`);
        await queryRunner.query(`DROP TABLE "examcollect"."enrollment"`);
        await queryRunner.query(`DROP INDEX "examcollect"."uq_class_roster_course_student"`);
        await queryRunner.query(`DROP TABLE "examcollect"."class_roster"`);
        await queryRunner.query(`DROP INDEX "examcollect"."uq_class_course_name"`);
        await queryRunner.query(`DROP TABLE "examcollect"."class"`);
        await queryRunner.query(`DROP INDEX "examcollect"."uq_course_semester_code"`);
        await queryRunner.query(`DROP TABLE "examcollect"."course"`);
        await queryRunner.query(`DROP TABLE "examcollect"."semester"`);
        await queryRunner.query(`DROP INDEX "examcollect"."uq_account_email"`);
        await queryRunner.query(`DROP TABLE "examcollect"."account"`);
        await queryRunner.query(`DROP TYPE "examcollect"."account_role"`);
    }

}
