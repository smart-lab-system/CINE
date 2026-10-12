import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Ghi điểm vào sổ điểm (spec `2026-09-29-gradebook-export-design.md` §4.1, parent §13.1 luật 2 và 7, §14.1).
 *
 * `grade_export` chưa từng có dòng nào (không service nào ghi nó), nên thêm cột mặc định là an toàn.
 * Cả hai bảng CHỈ-THÊM: một lượt xuất là hồ sơ — *"một con số đã xuất phải giải thích lại được"* — nên sai
 * thì xuất lượt mới, không sửa lượt cũ. Trigger `set_updated_at` của `grade_export` (migration đầu tiên)
 * đứng sau trigger chỉ-thêm theo thứ tự tên nên không bao giờ chạy tới.
 */
export class GradeExportRows1789530000000 implements MigrationInterface {
  name = 'GradeExportRows1789530000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(
      `CREATE TYPE "examcollect"."grade_export_blank_reason" AS ENUM ('absent', 'not_finished', 'ungradable', 'flagged')`,
    );
    await q.query(`
      ALTER TABLE "examcollect"."grade_export"
        ADD COLUMN "sheet_name" varchar(31),
        ADD COLUMN "first_data_row" int,
        ADD COLUMN "reason_column" varchar(20),
        ADD COLUMN "required_deliverable_id" uuid REFERENCES "examcollect"."required_deliverable"("id") ON DELETE RESTRICT,
        ADD COLUMN "rounding_step_hundredths" int NOT NULL DEFAULT 1,
        ADD COLUMN "rounding_mode" text NOT NULL DEFAULT 'half_up',
        ADD COLUMN "written_count" int NOT NULL DEFAULT 0,
        ADD COLUMN "blank_count" int NOT NULL DEFAULT 0,
        ADD COLUMN "overwrite_count" int NOT NULL DEFAULT 0,
        ADD COLUMN "decrease_count" int NOT NULL DEFAULT 0,
        ADD COLUMN "decrease_confirmed_by" uuid REFERENCES "examcollect"."account"("id") ON DELETE RESTRICT,
        ADD COLUMN "template_file_name" varchar(255),
        ADD COLUMN "output_file_name" varchar(255),
        ADD CONSTRAINT "ck_grade_export_rounding_step" CHECK (rounding_step_hundredths IN (1, 10, 25, 50))
    `);
    await q.query(`CREATE INDEX "idx_grade_export_session_time" ON "examcollect"."grade_export" ("exam_session_id", "exported_at")`);
    await q.query(`
      CREATE TABLE "examcollect"."grade_export_row" (
        "id"                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "grade_export_id"     uuid NOT NULL REFERENCES "examcollect"."grade_export"("id") ON DELETE RESTRICT,
        "file_row"            int NOT NULL CHECK (file_row >= 1),
        "mssv"                citext NOT NULL,
        "written_hundredths"  int CHECK (written_hundredths IS NULL OR written_hundredths >= 0),
        "blank_reason"        "examcollect"."grade_export_blank_reason",
        "score_computation_id" uuid REFERENCES "examcollect"."score_computation"("id") ON DELETE RESTRICT,
        CONSTRAINT "ck_grade_export_row_one_of" CHECK ((written_hundredths IS NULL) <> (blank_reason IS NULL)),
        CONSTRAINT "uq_grade_export_row_mssv" UNIQUE ("grade_export_id", "mssv")
      )
    `);
    for (const table of ['grade_export', 'grade_export_row']) {
      await q.query(
        `CREATE TRIGGER "trg_${table}_append_only" BEFORE UPDATE OR DELETE ON "examcollect"."${table}" FOR EACH ROW EXECUTE FUNCTION examcollect.guard_append_only()`,
      );
    }
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TRIGGER IF EXISTS "trg_grade_export_row_append_only" ON "examcollect"."grade_export_row"`);
    await q.query(`DROP TRIGGER IF EXISTS "trg_grade_export_append_only" ON "examcollect"."grade_export"`);
    await q.query(`DROP TABLE "examcollect"."grade_export_row"`);
    await q.query(`DROP INDEX "examcollect"."idx_grade_export_session_time"`);
    await q.query(`
      ALTER TABLE "examcollect"."grade_export"
        DROP CONSTRAINT "ck_grade_export_rounding_step",
        DROP COLUMN "output_file_name", DROP COLUMN "template_file_name", DROP COLUMN "decrease_confirmed_by",
        DROP COLUMN "decrease_count", DROP COLUMN "overwrite_count", DROP COLUMN "blank_count", DROP COLUMN "written_count",
        DROP COLUMN "rounding_mode", DROP COLUMN "rounding_step_hundredths", DROP COLUMN "required_deliverable_id",
        DROP COLUMN "reason_column", DROP COLUMN "first_data_row", DROP COLUMN "sheet_name"
    `);
    await q.query(`DROP TYPE "examcollect"."grade_export_blank_reason"`);
  }
}
