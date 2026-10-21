import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Nhãn kiểm mẫu và cầu dao tự chốt (spec duyệt nhanh 2026-10-21 §5.3). CHỈ THÊM bảng mới.
 *
 * - `audit_rule_label`: một dòng cho mỗi luật trong `perRule` của một lần kiểm mẫu; `verdict` là
 *   `both` (giảng viên và hệ thống cùng thấy), `teacher_only` (hệ thống bỏ sót) hoặc `system_only`.
 *   Chỉ thêm: nhãn là số liệu của cầu dao, sửa nhãn là sửa kết quả đo (`guard_append_only`, dựng ở
 *   `1789440000000`).
 * - `audit_no_error_label`: nhãn của LỚP BÀI KHÔNG LỖI — chỉ ghi khi lượt tính mới nhất của bài được
 *   kiểm có `breakdown.errors` rỗng; `agree = true` khi giảng viên không thấy lỗi nào. Chỉ thêm.
 * - `auto_rule_breaker`: trạng thái cầu dao. KHÔNG chỉ-thêm — bật lại là ghi `reset_at`/`reset_by`
 *   lên chính dòng đó. `scope = 'rule'` bắt buộc có `rule_id`, `scope = 'no_error'` bắt buộc không có
 *   (`ck_auto_rule_breaker_scope_rule`); chỉ mục từng phần `uq_auto_rule_breaker_open` cho tối đa một
 *   dòng MỞ (`reset_at IS NULL`) mỗi (giảng viên, phạm vi, luật). Phạm vi `no_error` không có luật nên
 *   `COALESCE` về uuid toàn số 0 — nếu không, NULL khác nhau trong chỉ mục duy nhất và giảng viên có
 *   thể có nhiều cầu dao `no_error` cùng mở.
 *
 * Khoá ngoại tới `grading_result` và `account` cùng khuôn `audit_sample_review` (`1789450000000`):
 * `ON DELETE RESTRICT` — nhãn và cầu dao là chứng cứ, không mồ côi, không xoá theo cha.
 */
export class AutoBreaker1789720000000 implements MigrationInterface {
  name = 'AutoBreaker1789720000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE "examcollect"."audit_rule_label" (
        "grading_result_id" uuid NOT NULL REFERENCES "examcollect"."grading_result"("id") ON DELETE RESTRICT,
        "rule_id"           uuid NOT NULL REFERENCES "examcollect"."error_rule"("id") ON DELETE RESTRICT,
        "verdict"           text NOT NULL,
        "recorded_at"       timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_audit_rule_label" PRIMARY KEY ("grading_result_id", "rule_id"),
        CONSTRAINT "ck_audit_rule_label_verdict" CHECK ("verdict" IN ('both', 'teacher_only', 'system_only'))
      )
    `);
    await q.query(`CREATE TRIGGER "trg_audit_rule_label_append_only" BEFORE UPDATE OR DELETE ON "examcollect"."audit_rule_label" FOR EACH ROW EXECUTE FUNCTION examcollect.guard_append_only()`);

    await q.query(`
      CREATE TABLE "examcollect"."audit_no_error_label" (
        "grading_result_id" uuid PRIMARY KEY REFERENCES "examcollect"."grading_result"("id") ON DELETE RESTRICT,
        "teacher_id"        uuid NOT NULL REFERENCES "examcollect"."account"("id") ON DELETE RESTRICT,
        "agree"             boolean NOT NULL,
        "recorded_at"       timestamptz NOT NULL DEFAULT now()
      )
    `);
    await q.query(`CREATE TRIGGER "trg_audit_no_error_label_append_only" BEFORE UPDATE OR DELETE ON "examcollect"."audit_no_error_label" FOR EACH ROW EXECUTE FUNCTION examcollect.guard_append_only()`);

    await q.query(`
      CREATE TABLE "examcollect"."auto_rule_breaker" (
        "id"          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "teacher_id"  uuid NOT NULL REFERENCES "examcollect"."account"("id") ON DELETE RESTRICT,
        "scope"       text NOT NULL,
        "rule_id"     uuid REFERENCES "examcollect"."error_rule"("id") ON DELETE RESTRICT,
        "tripped_at"  timestamptz NOT NULL DEFAULT now(),
        "evidence"    jsonb NOT NULL,
        "reset_at"    timestamptz,
        "reset_by"    uuid REFERENCES "examcollect"."account"("id") ON DELETE RESTRICT,
        CONSTRAINT "ck_auto_rule_breaker_scope" CHECK ("scope" IN ('rule', 'no_error')),
        CONSTRAINT "ck_auto_rule_breaker_scope_rule" CHECK (("scope" = 'rule') = ("rule_id" IS NOT NULL))
      )
    `);
    await q.query(`
      CREATE UNIQUE INDEX "uq_auto_rule_breaker_open" ON "examcollect"."auto_rule_breaker"
        ("teacher_id", "scope", (COALESCE("rule_id", '00000000-0000-0000-0000-000000000000'::uuid)))
        WHERE "reset_at" IS NULL
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    for (const table of ['auto_rule_breaker', 'audit_no_error_label', 'audit_rule_label']) {
      await q.query(`DROP TABLE "examcollect"."${table}"`);
    }
  }
}
