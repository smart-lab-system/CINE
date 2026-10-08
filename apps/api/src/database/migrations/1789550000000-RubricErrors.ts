import { MigrationInterface, QueryRunner } from 'typeorm';
import { BACKFILL_ASSIGNMENTS_SQL, BACKFILL_PRICES_SQL } from '../rubric-errors-backfill';

/**
 * Bảng lỗi theo rubric (spec 2026-10-07-rules-by-rubric-design.md §2, §6).
 * Lỗi (`error_rule`) dùng chung; `rubric_error` là dòng áp dụng riêng từng rubric (theo TÊN) mang tiêu
 * chí; `rubric_error_price` là giá của dòng áp dụng trong một phiên bản bảng giá. `rule_price` và
 * `error_rule_revision.criterion_key` giữ nguyên làm hồ sơ — không ghi nữa.
 */
export class RubricErrors1789550000000 implements MigrationInterface {
  name = 'RubricErrors1789550000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE "examcollect"."rubric_error" (
        "id"            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at"    timestamptz NOT NULL DEFAULT now(),
        "updated_at"    timestamptz NOT NULL DEFAULT now(),
        "teacher_id"    uuid NOT NULL REFERENCES "examcollect"."account"("id") ON DELETE RESTRICT,
        "rubric_name"   text NOT NULL CONSTRAINT "ck_rubric_error_name" CHECK (length(btrim(rubric_name)) BETWEEN 1 AND 200),
        "error_rule_id" uuid NOT NULL,
        "criterion_key" text NOT NULL CONSTRAINT "ck_rubric_error_key" CHECK (criterion_key ~ '^[a-z0-9_]{1,64}$'),
        "removed_at"    timestamptz,
        CONSTRAINT "uq_rubric_error" UNIQUE ("teacher_id", "rubric_name", "error_rule_id"),
        CONSTRAINT "uq_rubric_error_id_teacher" UNIQUE ("id", "teacher_id"),
        CONSTRAINT "fk_rubric_error_rule_teacher" FOREIGN KEY ("error_rule_id", "teacher_id")
          REFERENCES "examcollect"."error_rule"("id", "teacher_id") ON DELETE RESTRICT
      )
    `);
    await q.query(
      `CREATE INDEX "idx_rubric_error_rubric" ON "examcollect"."rubric_error" ("teacher_id", "rubric_name") WHERE removed_at IS NULL`,
    );
    await q.query(
      `CREATE TRIGGER "set_updated_at_rubric_error" BEFORE UPDATE ON "examcollect"."rubric_error" FOR EACH ROW EXECUTE FUNCTION examcollect.set_updated_at()`,
    );
    await q.query(
      `CREATE TRIGGER "trg_rubric_error_no_delete" BEFORE DELETE ON "examcollect"."rubric_error" FOR EACH ROW EXECUTE FUNCTION examcollect.guard_no_delete()`,
    );

    await q.query(`
      CREATE TABLE "examcollect"."rubric_error_price" (
        "price_table_version_id" uuid NOT NULL,
        "rubric_error_id"        uuid NOT NULL,
        "teacher_id"             uuid NOT NULL,
        "deduction"              numeric(6,2) CHECK (deduction IS NULL OR deduction >= 0),
        "created_at"             timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_rubric_error_price" PRIMARY KEY ("price_table_version_id", "rubric_error_id"),
        CONSTRAINT "fk_rep_version_teacher" FOREIGN KEY ("price_table_version_id", "teacher_id")
          REFERENCES "examcollect"."price_table_version"("id", "teacher_id") ON DELETE RESTRICT,
        CONSTRAINT "fk_rep_error_teacher" FOREIGN KEY ("rubric_error_id", "teacher_id")
          REFERENCES "examcollect"."rubric_error"("id", "teacher_id") ON DELETE RESTRICT
      )
    `);
    await q.query(
      `CREATE TRIGGER "trg_rubric_error_price_append_only" BEFORE UPDATE OR DELETE ON "examcollect"."rubric_error_price" FOR EACH ROW EXECUTE FUNCTION examcollect.guard_append_only()`,
    );

    await q.query(`
      CREATE TABLE "examcollect"."error_rule_sighting" (
        "id"                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at"        timestamptz NOT NULL DEFAULT now(),
        "teacher_id"        uuid NOT NULL,
        "error_rule_id"     uuid NOT NULL,
        "grading_result_id" uuid NOT NULL REFERENCES "examcollect"."grading_result"("id") ON DELETE CASCADE,
        "exam_session_id"   uuid NOT NULL REFERENCES "examcollect"."exam_session"("id") ON DELETE CASCADE,
        "rubric_name"       text NOT NULL,
        CONSTRAINT "uq_sighting" UNIQUE ("error_rule_id", "grading_result_id"),
        CONSTRAINT "fk_sighting_rule_teacher" FOREIGN KEY ("error_rule_id", "teacher_id")
          REFERENCES "examcollect"."error_rule"("id", "teacher_id") ON DELETE RESTRICT
      )
    `);
    await q.query(
      `CREATE INDEX "idx_sighting_rubric" ON "examcollect"."error_rule_sighting" ("teacher_id", "rubric_name")`,
    );

    await q.query(`ALTER TABLE "examcollect"."error_rule_revision" ALTER COLUMN "criterion_key" DROP NOT NULL`);

    await q.query(BACKFILL_ASSIGNMENTS_SQL, [null]);
    await q.query(BACKFILL_PRICES_SQL, [null]);
  }

  public async down(q: QueryRunner): Promise<void> {
    // `rule_price` còn nguyên nên điểm cũ tính lại được. Bản sửa mới ghi NULL → đưa về giá trị giữ chỗ cũ.
    // UPDATE revision bị chặn bởi trg_error_rule_revision_append_only — tắt tạm khi hoàn tác.
    await q.query(
      `ALTER TABLE "examcollect"."error_rule_revision" DISABLE TRIGGER "trg_error_rule_revision_append_only"`,
    );
    await q.query(
      `UPDATE "examcollect"."error_rule_revision" SET criterion_key = 'chua_gan' WHERE criterion_key IS NULL`,
    );
    await q.query(
      `ALTER TABLE "examcollect"."error_rule_revision" ENABLE TRIGGER "trg_error_rule_revision_append_only"`,
    );
    await q.query(`ALTER TABLE "examcollect"."error_rule_revision" ALTER COLUMN "criterion_key" SET NOT NULL`);
    await q.query(`DROP TABLE "examcollect"."error_rule_sighting"`);
    await q.query(`DROP TABLE "examcollect"."rubric_error_price"`);
    await q.query(`DROP TABLE "examcollect"."rubric_error"`);
  }
}
