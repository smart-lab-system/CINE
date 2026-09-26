import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Cột mới của `grading_result`, `teacher_review`, `exam_session` — spec §14.1. Khoá ngoại tới
 * bảng chưa có (`grading_attempt`, `score_computation`, `error_rule`, `grading_test_bundle`,
 * `price_table_version`) thêm ở migration tạo bảng đó.
 */
export class GradingResultReviewSessionColumns1789430000000 implements MigrationInterface {
  name = 'GradingResultReviewSessionColumns1789430000000';

  public async up(q: QueryRunner): Promise<void> {
    // ---------------------------------------------------------------- grading_result
    await q.query(`CREATE TYPE "examcollect"."grading_pipeline" AS ENUM ('one_shot', 'investigator')`);
    await q.query(`CREATE TYPE "examcollect"."ungradable_class" AS ENUM ('system', 'submission')`);
    await q.query(`
      ALTER TABLE "examcollect"."grading_result"
        ADD COLUMN "pipeline" "examcollect"."grading_pipeline" NOT NULL DEFAULT 'one_shot',
        ADD COLUMN "current_attempt_id" uuid,
        ADD COLUMN "ungradable_class" "examcollect"."ungradable_class",
        ADD COLUMN "audit_sampled" boolean NOT NULL DEFAULT false,
        ADD COLUMN "audit_sampled_at" timestamptz,
        ADD COLUMN "finalized_computation_id" uuid,
        ADD COLUMN "finalized_by" uuid REFERENCES "examcollect"."account"("id") ON DELETE RESTRICT,
        ADD COLUMN "finalized_at" timestamptz
    `);

    // §2.3 luật 7 — dữ liệu cũ. Hôm nay chỉ `markUngradable` sinh ra dòng như vậy, và nó chỉ chạy
    // khi job hết lượt thử: lỗi phía hệ thống. Không điền thì chính các phiên đang kẹt vẫn kẹt,
    // vì chấm lại đòi `ungradable_class` khác null. Lượt số 1 chép lý do cũ thêm ở `1789450000000`.
    //
    // Tắt `trg_grading_result_updated_at` trong CÙNG transaction: `updated_at` của các dòng này là
    // lúc `markUngradable` chạy, và `1789450000000` đọc nó làm `finished_at` của lượt số 1 — một
    // dòng bất biến ngay khi ghi. Để trigger bắn thì mọi lượt số 1 "kết thúc" lúc migration chạy.
    await q.startTransaction();
    try {
      await q.query(`ALTER TABLE "examcollect"."grading_result" DISABLE TRIGGER "trg_grading_result_updated_at"`);
      await q.query(`
        UPDATE "examcollect"."grading_result"
           SET ungradable_class = 'system'
         WHERE status = 'flagged_for_review' AND ai_total_score IS NULL
           AND ungradable_reason IS NOT NULL AND ungradable_class IS NULL
      `);
      await q.query(`ALTER TABLE "examcollect"."grading_result" ENABLE TRIGGER "trg_grading_result_updated_at"`);
      await q.commitTransaction();
    } catch (error) {
      await q.rollbackTransaction();
      throw error;
    }

    await q.query(`
      ALTER TABLE "examcollect"."grading_result"
        ADD CONSTRAINT "ck_grading_result_ungradable"
          CHECK (ungradable_class IS NULL OR (ai_total_score IS NULL AND ungradable_reason IS NOT NULL)),
        ADD CONSTRAINT "ck_grading_result_audit_sampled_at"
          CHECK (audit_sampled = (audit_sampled_at IS NOT NULL)),
        ADD CONSTRAINT "ck_grading_result_finalized_pair"
          CHECK ((finalized_by IS NULL) = (finalized_at IS NULL))
    `);
    // Dòng đã chốt TRƯỚC migration này giữ `finalized_by` null: người ký tên của chúng nằm ở
    // dòng `teacher_review` mà `finalizeGrades` đã ghi, như trước. Điền ngược là bịa một thời
    // điểm chốt không ai ghi lại.

    // ---------------------------------------------------------------- teacher_review
    await q.query(`CREATE TYPE "examcollect"."teacher_review_kind" AS ENUM ('review', 'error_exception', 'manual_score', 'bulk_accept')`);
    await q.query(`CREATE TYPE "examcollect"."error_exception_direction" AS ENUM ('exclude', 'include')`);
    await q.query(`
      ALTER TABLE "examcollect"."teacher_review"
        ADD COLUMN "kind" "examcollect"."teacher_review_kind" NOT NULL DEFAULT 'review',
        ADD COLUMN "error_rule_id" uuid,
        ADD COLUMN "direction" "examcollect"."error_exception_direction",
        ALTER COLUMN "final_score" DROP NOT NULL
    `);
    // Dòng của duyệt hàng loạt là dòng duy nhất mang `applied_rule`.
    await q.query(`UPDATE "examcollect"."teacher_review" SET kind = 'bulk_accept' WHERE applied_rule IS NOT NULL`);
    await q.query(`
      ALTER TABLE "examcollect"."teacher_review"
        ADD CONSTRAINT "ck_teacher_review_score_by_kind"
          CHECK (kind = 'error_exception' OR final_score IS NOT NULL),
        ADD CONSTRAINT "ck_teacher_review_exception_target"
          CHECK ((kind = 'error_exception' AND error_rule_id IS NOT NULL AND direction IS NOT NULL)
              OR (kind <> 'error_exception' AND error_rule_id IS NULL AND direction IS NULL))
    `);

    // ---------------------------------------------------------------- exam_session
    await q.query(`
      ALTER TABLE "examcollect"."exam_session"
        ADD COLUMN "grading_seed" uuid NOT NULL DEFAULT uuid_generate_v4(),
        ADD COLUMN "test_bundle_id" uuid,
        ADD COLUMN "pinned_price_version_id" uuid
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "examcollect"."exam_session" DROP COLUMN "pinned_price_version_id", DROP COLUMN "test_bundle_id", DROP COLUMN "grading_seed"`);
    await q.query(`ALTER TABLE "examcollect"."teacher_review" DROP CONSTRAINT "ck_teacher_review_exception_target", DROP CONSTRAINT "ck_teacher_review_score_by_kind"`);
    // Không khôi phục NOT NULL của final_score nếu đã có dòng ngoại lệ: `down()` phải nổ thay vì
    // xoá dòng của giảng viên.
    await q.query(`ALTER TABLE "examcollect"."teacher_review" ALTER COLUMN "final_score" SET NOT NULL`);
    await q.query(`ALTER TABLE "examcollect"."teacher_review" DROP COLUMN "direction", DROP COLUMN "error_rule_id", DROP COLUMN "kind"`);
    await q.query(`DROP TYPE "examcollect"."error_exception_direction"`);
    await q.query(`DROP TYPE "examcollect"."teacher_review_kind"`);
    await q.query(`
      ALTER TABLE "examcollect"."grading_result"
        DROP CONSTRAINT "ck_grading_result_finalized_pair",
        DROP CONSTRAINT "ck_grading_result_audit_sampled_at",
        DROP CONSTRAINT "ck_grading_result_ungradable",
        DROP COLUMN "finalized_at", DROP COLUMN "finalized_by", DROP COLUMN "finalized_computation_id",
        DROP COLUMN "audit_sampled_at", DROP COLUMN "audit_sampled", DROP COLUMN "ungradable_class",
        DROP COLUMN "current_attempt_id", DROP COLUMN "pipeline"
    `);
    await q.query(`DROP TYPE "examcollect"."ungradable_class"`);
    await q.query(`DROP TYPE "examcollect"."grading_pipeline"`);
  }
}
