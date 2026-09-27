import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Gói test có phiên bản, lượt chấm, lượt tính điểm, đánh dấu tiêu chí, kiểm mẫu — spec §14.1,
 * §14.4. Mọi khoá ngoại "của chính nó" là khoá GHÉP: một lượt tính điểm không trỏ được lượt chấm
 * của bài khác, một phiên không ghim được gói test của phiên khác.
 */
export class AttemptsBundlesScores1789450000000 implements MigrationInterface {
  name = 'AttemptsBundlesScores1789450000000';

  public async up(q: QueryRunner): Promise<void> {
    // ------------------------------------------------------------ gói test
    await q.query(`CREATE TYPE "examcollect"."test_bundle_origin" AS ENUM ('teacher', 'from_model_answer', 'generated')`);
    await q.query(`
      CREATE TABLE "examcollect"."grading_test_bundle" (
        "id"              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at"      timestamptz NOT NULL DEFAULT now(),
        "updated_at"      timestamptz NOT NULL DEFAULT now(),
        "exam_session_id" uuid NOT NULL REFERENCES "examcollect"."exam_session"("id") ON DELETE RESTRICT,
        "version"         int NOT NULL CHECK (version >= 1),
        "origin"          "examcollect"."test_bundle_origin" NOT NULL,
        "storage_key"     varchar(512),
        "filename"        varchar(255),
        "comparator"      jsonb CHECK (comparator IS NULL OR jsonb_typeof(comparator) = 'object'),
        "created_by"      uuid NOT NULL REFERENCES "examcollect"."account"("id") ON DELETE RESTRICT,
        "approved_by"     uuid REFERENCES "examcollect"."account"("id") ON DELETE RESTRICT,
        "approved_at"     timestamptz,
        CONSTRAINT "uq_grading_test_bundle_version" UNIQUE ("exam_session_id", "version"),
        CONSTRAINT "uq_grading_test_bundle_id_session" UNIQUE ("id", "exam_session_id"),
        CONSTRAINT "ck_grading_test_bundle_approval" CHECK ((approved_by IS NULL) = (approved_at IS NULL)),
        CONSTRAINT "ck_grading_test_bundle_file" CHECK ((storage_key IS NULL) = (filename IS NULL))
      )
    `);
    // Gói chỉ đổi được đúng một lần: lúc giảng viên duyệt. Mọi thay đổi khác là phiên bản mới
    // (§2.1: bỏ ca = phiên bản gói không chép ca đó).
    await q.query(`
      CREATE FUNCTION examcollect.guard_test_bundle_approve_once() RETURNS trigger
      LANGUAGE plpgsql SET search_path TO 'examcollect', 'public' AS $$
      BEGIN
        IF OLD.approved_at IS NOT NULL
           OR (to_jsonb(NEW) - 'approved_by' - 'approved_at' - 'updated_at')
              IS DISTINCT FROM (to_jsonb(OLD) - 'approved_by' - 'approved_at' - 'updated_at') THEN
          RAISE EXCEPTION 'Gói test % chỉ ghi được việc duyệt, và chỉ một lần — đổi nội dung là phiên bản mới', OLD.id
            USING ERRCODE = 'object_not_in_prerequisite_state';
        END IF;
        RETURN NEW;
      END $$
    `);
    await q.query(`CREATE TRIGGER "trg_grading_test_bundle_approve_once" BEFORE UPDATE ON "examcollect"."grading_test_bundle" FOR EACH ROW EXECUTE FUNCTION examcollect.guard_test_bundle_approve_once()`);
    await q.query(`CREATE TRIGGER "set_updated_at_grading_test_bundle" BEFORE UPDATE ON "examcollect"."grading_test_bundle" FOR EACH ROW EXECUTE FUNCTION examcollect.set_updated_at()`);
    await q.query(`CREATE TRIGGER "trg_grading_test_bundle_no_delete" BEFORE DELETE ON "examcollect"."grading_test_bundle" FOR EACH ROW EXECUTE FUNCTION examcollect.guard_no_delete()`);

    await q.query(`
      CREATE TABLE "examcollect"."grading_test_case" (
        "id"                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at"          timestamptz NOT NULL DEFAULT now(),
        "bundle_id"           uuid NOT NULL REFERENCES "examcollect"."grading_test_bundle"("id") ON DELETE RESTRICT,
        "case_key"            text NOT NULL CHECK (case_key ~ '^[A-Za-z0-9_-]{1,64}$'),
        "group"               text NOT NULL CHECK (length("group") BETWEEN 1 AND 100),
        "input"               text NOT NULL,
        "expected_output"     text NOT NULL,
        "constraint_quote"    text,
        "auto_dropped_reason" text,
        CONSTRAINT "uq_grading_test_case_key" UNIQUE ("bundle_id", "case_key")
      )
    `);
    await q.query(`CREATE TRIGGER "trg_grading_test_case_append_only" BEFORE UPDATE OR DELETE ON "examcollect"."grading_test_case" FOR EACH ROW EXECUTE FUNCTION examcollect.guard_append_only()`);
    await q.query(`
      ALTER TABLE "examcollect"."exam_session"
        ADD CONSTRAINT "fk_exam_session_test_bundle" FOREIGN KEY ("test_bundle_id", "id")
        REFERENCES "examcollect"."grading_test_bundle"("id", "exam_session_id") ON DELETE RESTRICT
    `);

    // ------------------------------------------------------------ lượt chấm
    await q.query(`CREATE TYPE "examcollect"."grading_attempt_outcome" AS ENUM ('graded', 'ungradable')`);
    await q.query(`
      CREATE TABLE "examcollect"."grading_attempt" (
        "id"                 uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at"         timestamptz NOT NULL DEFAULT now(),
        "updated_at"         timestamptz NOT NULL DEFAULT now(),
        "grading_result_id"  uuid NOT NULL REFERENCES "examcollect"."grading_result"("id") ON DELETE RESTRICT,
        "attempt_no"         int NOT NULL CHECK (attempt_no >= 1),
        "outcome"            "examcollect"."grading_attempt_outcome",
        "ungradable_class"   "examcollect"."ungradable_class",
        "ungradable_reason"  text,
        "investigation"      jsonb,
        "structured_results" jsonb,
        "challenge"          jsonb,
        "model_used"         varchar(200),
        "sandbox_host"       jsonb,
        "tokens_in"          int CHECK (tokens_in IS NULL OR tokens_in >= 0),
        "tokens_out"         int CHECK (tokens_out IS NULL OR tokens_out >= 0),
        "cost_usd"           numeric(10,4) CHECK (cost_usd IS NULL OR cost_usd >= 0),
        "triggered_by"       uuid NOT NULL REFERENCES "examcollect"."account"("id") ON DELETE RESTRICT,
        "started_at"         timestamptz NOT NULL DEFAULT now(),
        "finished_at"        timestamptz,
        CONSTRAINT "uq_grading_attempt_no" UNIQUE ("grading_result_id", "attempt_no"),
        CONSTRAINT "uq_grading_attempt_id_result" UNIQUE ("id", "grading_result_id"),
        CONSTRAINT "ck_grading_attempt_outcome_finished" CHECK ((outcome IS NULL) = (finished_at IS NULL)),
        CONSTRAINT "ck_grading_attempt_finished_after_start" CHECK (finished_at IS NULL OR finished_at >= started_at),
        CONSTRAINT "ck_grading_attempt_ungradable" CHECK (
          (outcome = 'ungradable' AND ungradable_class IS NOT NULL AND ungradable_reason IS NOT NULL)
          OR (outcome IS DISTINCT FROM 'ungradable' AND ungradable_class IS NULL AND ungradable_reason IS NULL))
      )
    `);
    // Lớp bảo vệ hồ sơ của bài CHƯA có điểm — chỗ `guard_grading_result_ai_immutable` để hở, vì
    // guard đó chỉ bắn khi `OLD.ai_total_score IS NOT NULL` (§14.4).
    await q.query(`
      CREATE FUNCTION examcollect.guard_grading_attempt_immutable() RETURNS trigger
      LANGUAGE plpgsql SET search_path TO 'examcollect', 'public' AS $$
      BEGIN
        IF TG_OP = 'DELETE' THEN
          RAISE EXCEPTION 'Lượt chấm % không xoá được — hồ sơ trỏ vào nó vĩnh viễn', OLD.id
            USING ERRCODE = 'object_not_in_prerequisite_state';
        END IF;
        IF OLD.outcome IS NOT NULL THEN
          RAISE EXCEPTION 'Lượt chấm % đã có kết cục — hồ sơ bất biến', OLD.id
            USING ERRCODE = 'object_not_in_prerequisite_state';
        END IF;
        RETURN NEW;
      END $$
    `);
    await q.query(`CREATE TRIGGER "trg_grading_attempt_immutable" BEFORE UPDATE OR DELETE ON "examcollect"."grading_attempt" FOR EACH ROW EXECUTE FUNCTION examcollect.guard_grading_attempt_immutable()`);
    await q.query(`CREATE TRIGGER "set_updated_at_grading_attempt" BEFORE UPDATE ON "examcollect"."grading_attempt" FOR EACH ROW EXECUTE FUNCTION examcollect.set_updated_at()`);
    await q.query(`
      ALTER TABLE "examcollect"."grading_result"
        ADD CONSTRAINT "fk_grading_result_current_attempt" FOREIGN KEY ("current_attempt_id", "id")
        REFERENCES "examcollect"."grading_attempt"("id", "grading_result_id") ON DELETE RESTRICT
    `);

    // ------------------------------------------------------------ lượt tính điểm
    await q.query(`
      CREATE TYPE "examcollect"."score_computation_reason" AS ENUM (
        'initial', 'price_change', 'rule_revision', 'tier2_rule', 'tier3_rule',
        'case_dropped', 'error_exception', 'finalized_reapply')
    `);
    await q.query(`
      CREATE TABLE "examcollect"."score_computation" (
        "id"                     uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at"             timestamptz NOT NULL DEFAULT now(),
        "grading_result_id"      uuid NOT NULL REFERENCES "examcollect"."grading_result"("id") ON DELETE RESTRICT,
        "attempt_id"             uuid NOT NULL,
        "price_table_version_id" uuid REFERENCES "examcollect"."price_table_version"("id") ON DELETE RESTRICT,
        "rubric_id_version"      uuid NOT NULL REFERENCES "examcollect"."rubric"("id") ON DELETE RESTRICT,
        "test_bundle_id"         uuid REFERENCES "examcollect"."grading_test_bundle"("id") ON DELETE RESTRICT,
        "reason"                 "examcollect"."score_computation_reason" NOT NULL,
        "score"                  numeric(6,2) NOT NULL CHECK (score >= 0),
        "breakdown"              jsonb NOT NULL,
        "created_by"             uuid REFERENCES "examcollect"."account"("id") ON DELETE RESTRICT,
        CONSTRAINT "uq_score_computation_id_result" UNIQUE ("id", "grading_result_id"),
        CONSTRAINT "fk_score_computation_attempt" FOREIGN KEY ("attempt_id", "grading_result_id")
          REFERENCES "examcollect"."grading_attempt"("id", "grading_result_id") ON DELETE RESTRICT
      )
    `);
    await q.query(`CREATE INDEX "idx_score_computation_result_time" ON "examcollect"."score_computation" ("grading_result_id", "created_at" DESC)`);
    await q.query(`CREATE TRIGGER "trg_score_computation_append_only" BEFORE UPDATE OR DELETE ON "examcollect"."score_computation" FOR EACH ROW EXECUTE FUNCTION examcollect.guard_append_only()`);
    await q.query(`
      ALTER TABLE "examcollect"."grading_result"
        ADD CONSTRAINT "fk_grading_result_finalized_computation" FOREIGN KEY ("finalized_computation_id", "id")
        REFERENCES "examcollect"."score_computation"("id", "grading_result_id") ON DELETE RESTRICT
    `);

    // ------------------------------------------------------------ "tiêu chí này không có luật trừ"
    await q.query(`
      CREATE TABLE "examcollect"."criterion_waiver" (
        "id"            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at"    timestamptz NOT NULL DEFAULT now(),
        "updated_at"    timestamptz NOT NULL DEFAULT now(),
        "rubric_id"     uuid NOT NULL,
        "criterion_key" text NOT NULL,
        "set_by"        uuid NOT NULL REFERENCES "examcollect"."account"("id") ON DELETE RESTRICT,
        "set_at"        timestamptz NOT NULL DEFAULT now(),
        "revoked_by"    uuid REFERENCES "examcollect"."account"("id") ON DELETE RESTRICT,
        "revoked_at"    timestamptz,
        CONSTRAINT "fk_criterion_waiver_criterion" FOREIGN KEY ("rubric_id", "criterion_key")
          REFERENCES "examcollect"."rubric_criterion"("rubric_id", "key") ON DELETE RESTRICT,
        CONSTRAINT "ck_criterion_waiver_revoke_pair" CHECK ((revoked_by IS NULL) = (revoked_at IS NULL)),
        CONSTRAINT "ck_criterion_waiver_revoke_after_set" CHECK (revoked_at IS NULL OR revoked_at >= set_at)
      )
    `);
    await q.query(`CREATE UNIQUE INDEX "uq_criterion_waiver_active" ON "examcollect"."criterion_waiver" ("rubric_id", "criterion_key") WHERE revoked_at IS NULL`);
    await q.query(`
      CREATE FUNCTION examcollect.guard_criterion_waiver_revoke_once() RETURNS trigger
      LANGUAGE plpgsql SET search_path TO 'examcollect', 'public' AS $$
      BEGIN
        IF OLD.revoked_at IS NOT NULL
           OR (to_jsonb(NEW) - 'revoked_by' - 'revoked_at' - 'updated_at')
              IS DISTINCT FROM (to_jsonb(OLD) - 'revoked_by' - 'revoked_at' - 'updated_at') THEN
          RAISE EXCEPTION 'Đánh dấu % chỉ gỡ được, và chỉ một lần', OLD.id
            USING ERRCODE = 'object_not_in_prerequisite_state';
        END IF;
        RETURN NEW;
      END $$
    `);
    await q.query(`CREATE TRIGGER "trg_criterion_waiver_revoke_once" BEFORE UPDATE ON "examcollect"."criterion_waiver" FOR EACH ROW EXECUTE FUNCTION examcollect.guard_criterion_waiver_revoke_once()`);
    await q.query(`CREATE TRIGGER "set_updated_at_criterion_waiver" BEFORE UPDATE ON "examcollect"."criterion_waiver" FOR EACH ROW EXECUTE FUNCTION examcollect.set_updated_at()`);
    await q.query(`CREATE TRIGGER "trg_criterion_waiver_no_delete" BEFORE DELETE ON "examcollect"."criterion_waiver" FOR EACH ROW EXECUTE FUNCTION examcollect.guard_no_delete()`);

    // ------------------------------------------------------------ kiểm mẫu
    await q.query(`
      CREATE TABLE "examcollect"."audit_sample_review" (
        "grading_result_id" uuid PRIMARY KEY REFERENCES "examcollect"."grading_result"("id") ON DELETE RESTRICT,
        "teacher_id"        uuid NOT NULL REFERENCES "examcollect"."account"("id") ON DELETE RESTRICT,
        "picked_rule_ids"   uuid[] NOT NULL DEFAULT '{}',
        "extra_errors"      text[] NOT NULL DEFAULT '{}',
        "recorded_at"       timestamptz NOT NULL DEFAULT now()
      )
    `);
    await q.query(`CREATE TRIGGER "trg_audit_sample_review_append_only" BEFORE UPDATE OR DELETE ON "examcollect"."audit_sample_review" FOR EACH ROW EXECUTE FUNCTION examcollect.guard_append_only()`);

    // ------------------------------------------------------------ §2.3 luật 7 — lượt số 1 của dữ liệu cũ
    // Lý do lần trước không chấm được là DỮ LIỆU: chép nó thành lượt số 1, để lượt chấm lại là
    // lượt 2 và lý do cũ không mất. `started_at` = lúc xếp hàng (không ai ghi lúc job bắt đầu),
    // `finished_at` = lần ghi cuối của dòng — lúc `markUngradable` chạy.
    await q.query(`
      INSERT INTO "examcollect"."grading_attempt"
        (grading_result_id, attempt_no, outcome, ungradable_class, ungradable_reason,
         triggered_by, started_at, finished_at)
      SELECT g.id, 1, 'ungradable', 'system', g.ungradable_reason, g.grading_triggered_by,
             g.grading_triggered_at, GREATEST(g.updated_at, g.grading_triggered_at)
        FROM "examcollect"."grading_result" g
       WHERE g.ungradable_class = 'system' AND g.current_attempt_id IS NULL
    `);
    await q.query(`
      UPDATE "examcollect"."grading_result" g
         SET current_attempt_id = a.id
        FROM "examcollect"."grading_attempt" a
       WHERE a.grading_result_id = g.id AND a.attempt_no = 1 AND g.current_attempt_id IS NULL
         AND g.ungradable_class = 'system'
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`UPDATE "examcollect"."grading_result" SET current_attempt_id = NULL, finalized_computation_id = NULL WHERE current_attempt_id IS NOT NULL OR finalized_computation_id IS NOT NULL`);
    await q.query(`ALTER TABLE "examcollect"."grading_result" DROP CONSTRAINT "fk_grading_result_finalized_computation", DROP CONSTRAINT "fk_grading_result_current_attempt"`);
    await q.query(`ALTER TABLE "examcollect"."exam_session" DROP CONSTRAINT "fk_exam_session_test_bundle"`);
    await q.query(`UPDATE "examcollect"."exam_session" SET test_bundle_id = NULL WHERE test_bundle_id IS NOT NULL`);
    for (const table of ['audit_sample_review', 'criterion_waiver', 'score_computation', 'grading_attempt', 'grading_test_case', 'grading_test_bundle']) {
      await q.query(`DROP TABLE "examcollect"."${table}"`);
    }
    await q.query(`DROP FUNCTION examcollect.guard_criterion_waiver_revoke_once()`);
    await q.query(`DROP FUNCTION examcollect.guard_grading_attempt_immutable()`);
    await q.query(`DROP FUNCTION examcollect.guard_test_bundle_approve_once()`);
    await q.query(`DROP TYPE "examcollect"."score_computation_reason"`);
    await q.query(`DROP TYPE "examcollect"."grading_attempt_outcome"`);
    await q.query(`DROP TYPE "examcollect"."test_bundle_origin"`);
  }
}
