import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Bảng lỗi có uuid và bảng giá có phiên bản — spec §14.1, §2.1, §2.2. Service ghi chúng là bước
 * 3c; ở đây là luật bất biến của chúng ở tầng DB.
 *
 * Ngoài §14.1, `rule_price` mang thêm `teacher_id`: hai khoá ngoại ghép `(…, teacher_id)` làm cho
 * một giá KHÔNG THỂ trỏ luật của giảng viên khác (T-POL-8) — luật đó ở tầng DB, không trông vào
 * service nhớ lọc.
 */
export class ErrorRulesAndPrices1789440000000 implements MigrationInterface {
  name = 'ErrorRulesAndPrices1789440000000';

  public async up(q: QueryRunner): Promise<void> {
    // ------------------------------------------------------------ guard dùng chung
    await q.query(`
      CREATE FUNCTION examcollect.guard_append_only() RETURNS trigger
      LANGUAGE plpgsql SET search_path TO 'examcollect', 'public' AS $$
      BEGIN
        RAISE EXCEPTION 'Bảng % chỉ thêm — % bị từ chối', TG_TABLE_NAME, TG_OP
          USING ERRCODE = 'object_not_in_prerequisite_state';
      END $$
    `);
    await q.query(`
      CREATE FUNCTION examcollect.guard_no_delete() RETURNS trigger
      LANGUAGE plpgsql SET search_path TO 'examcollect', 'public' AS $$
      BEGIN
        RAISE EXCEPTION 'Dòng của bảng % không xoá được — hồ sơ trỏ vào nó vĩnh viễn', TG_TABLE_NAME
          USING ERRCODE = 'object_not_in_prerequisite_state';
      END $$
    `);

    // ------------------------------------------------------------ luật
    await q.query(`CREATE TYPE "examcollect"."error_rule_state" AS ENUM ('proposed', 'active', 'dismissed', 'retired')`);
    await q.query(`CREATE TYPE "examcollect"."error_rule_origin" AS ENUM ('teacher', 'seed', 'agent_reported')`);
    await q.query(`
      CREATE TABLE "examcollect"."error_rule" (
        "id"                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at"          timestamptz NOT NULL DEFAULT now(),
        "updated_at"          timestamptz NOT NULL DEFAULT now(),
        "teacher_id"          uuid NOT NULL REFERENCES "examcollect"."account"("id") ON DELETE RESTRICT,
        "rule_key"            text NOT NULL CONSTRAINT "ck_error_rule_key" CHECK (rule_key ~ '^[a-z0-9_]{1,64}$'),
        "state"               "examcollect"."error_rule_state" NOT NULL DEFAULT 'proposed',
        "origin"              "examcollect"."error_rule_origin" NOT NULL,
        "current_revision_id" uuid,
        CONSTRAINT "uq_error_rule_teacher_key" UNIQUE ("teacher_id", "rule_key"),
        CONSTRAINT "uq_error_rule_id_teacher" UNIQUE ("id", "teacher_id")
      )
    `);
    await q.query(`
      CREATE TABLE "examcollect"."error_rule_revision" (
        "id"            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at"    timestamptz NOT NULL DEFAULT now(),
        "error_rule_id" uuid NOT NULL REFERENCES "examcollect"."error_rule"("id") ON DELETE RESTRICT,
        "revision"      int NOT NULL CHECK (revision >= 1),
        "name"          text NOT NULL,
        "description"   text NOT NULL,
        "criterion_key" text NOT NULL CHECK (criterion_key ~ '^[a-z0-9_]{1,64}$'),
        "predicate"     jsonb CHECK (predicate IS NULL OR jsonb_typeof(predicate) = 'object'),
        "created_by"    uuid NOT NULL REFERENCES "examcollect"."account"("id") ON DELETE RESTRICT,
        CONSTRAINT "uq_error_rule_revision" UNIQUE ("error_rule_id", "revision"),
        CONSTRAINT "uq_error_rule_revision_id_rule" UNIQUE ("id", "error_rule_id")
      )
    `);
    // Bản sửa hiện hành phải là bản sửa CỦA luật đó: khoá ghép (current_revision_id, id).
    await q.query(`
      ALTER TABLE "examcollect"."error_rule"
        ADD CONSTRAINT "fk_error_rule_current_revision"
        FOREIGN KEY ("current_revision_id", "id") REFERENCES "examcollect"."error_rule_revision"("id", "error_rule_id")
    `);
    await q.query(`CREATE TRIGGER "set_updated_at_error_rule" BEFORE UPDATE ON "examcollect"."error_rule" FOR EACH ROW EXECUTE FUNCTION examcollect.set_updated_at()`);
    await q.query(`CREATE TRIGGER "trg_error_rule_no_delete" BEFORE DELETE ON "examcollect"."error_rule" FOR EACH ROW EXECUTE FUNCTION examcollect.guard_no_delete()`);
    await q.query(`CREATE TRIGGER "trg_error_rule_revision_append_only" BEFORE UPDATE OR DELETE ON "examcollect"."error_rule_revision" FOR EACH ROW EXECUTE FUNCTION examcollect.guard_append_only()`);

    // ------------------------------------------------------------ giá
    await q.query(`
      CREATE TABLE "examcollect"."price_table_version" (
        "id"         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "teacher_id" uuid NOT NULL REFERENCES "examcollect"."account"("id") ON DELETE RESTRICT,
        "version"    int NOT NULL CHECK (version >= 1),
        "created_by" uuid NOT NULL REFERENCES "examcollect"."account"("id") ON DELETE RESTRICT,
        CONSTRAINT "uq_price_table_version" UNIQUE ("teacher_id", "version"),
        CONSTRAINT "uq_price_table_version_id_teacher" UNIQUE ("id", "teacher_id")
      )
    `);
    await q.query(`
      CREATE TABLE "examcollect"."rule_price" (
        "price_table_version_id" uuid NOT NULL,
        "error_rule_id"          uuid NOT NULL,
        "teacher_id"             uuid NOT NULL,
        "deduction"              numeric(6,2) CHECK (deduction IS NULL OR deduction >= 0),
        "created_at"             timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_rule_price" PRIMARY KEY ("price_table_version_id", "error_rule_id"),
        CONSTRAINT "fk_rule_price_version_teacher" FOREIGN KEY ("price_table_version_id", "teacher_id")
          REFERENCES "examcollect"."price_table_version"("id", "teacher_id") ON DELETE RESTRICT,
        CONSTRAINT "fk_rule_price_rule_teacher" FOREIGN KEY ("error_rule_id", "teacher_id")
          REFERENCES "examcollect"."error_rule"("id", "teacher_id") ON DELETE RESTRICT
      )
    `);
    for (const table of ['price_table_version', 'rule_price']) {
      await q.query(`CREATE TRIGGER "trg_${table}_append_only" BEFORE UPDATE OR DELETE ON "examcollect"."${table}" FOR EACH ROW EXECUTE FUNCTION examcollect.guard_append_only()`);
    }

    // ------------------------------------------------------------ khoá ngoại chờ từ 1789430000000
    await q.query(`
      ALTER TABLE "examcollect"."teacher_review"
        ADD CONSTRAINT "fk_teacher_review_error_rule" FOREIGN KEY ("error_rule_id")
        REFERENCES "examcollect"."error_rule"("id") ON DELETE RESTRICT
    `);
    await q.query(`
      ALTER TABLE "examcollect"."exam_session"
        ADD CONSTRAINT "fk_exam_session_pinned_price" FOREIGN KEY ("pinned_price_version_id", "teacher_id")
        REFERENCES "examcollect"."price_table_version"("id", "teacher_id") ON DELETE RESTRICT
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "examcollect"."exam_session" DROP CONSTRAINT "fk_exam_session_pinned_price"`);
    await q.query(`ALTER TABLE "examcollect"."teacher_review" DROP CONSTRAINT "fk_teacher_review_error_rule"`);
    await q.query(`DROP TABLE "examcollect"."rule_price"`);
    await q.query(`DROP TABLE "examcollect"."price_table_version"`);
    await q.query(`ALTER TABLE "examcollect"."error_rule" DROP CONSTRAINT "fk_error_rule_current_revision"`);
    await q.query(`DROP TABLE "examcollect"."error_rule_revision"`);
    await q.query(`DROP TABLE "examcollect"."error_rule"`);
    await q.query(`DROP TYPE "examcollect"."error_rule_origin"`);
    await q.query(`DROP TYPE "examcollect"."error_rule_state"`);
    await q.query(`DROP FUNCTION examcollect.guard_no_delete()`);
    await q.query(`DROP FUNCTION examcollect.guard_append_only()`);
  }
}
