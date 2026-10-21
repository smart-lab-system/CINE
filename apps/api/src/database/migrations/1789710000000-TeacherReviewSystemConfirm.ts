import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Kind `system_confirm` của `teacher_review` — "giảng viên chấp nhận điểm của lượt tính này"
 * (spec duyệt nhanh 2026-10-21 §5.4).
 *
 * - Giá trị enum mới; cột `confirmed_computation_id` trỏ lượt tính được chấp nhận. Khoá ngoại là
 *   khoá GHÉP `(confirmed_computation_id, grading_result_id)` → `score_computation(id, grading_result_id)`,
 *   cùng khuôn `fk_grading_result_finalized_computation` (`1789450000000`): một dòng xác nhận KHÔNG
 *   thể trỏ lượt tính của bài khác. Cột `NULL` thì khoá không kiểm (MATCH SIMPLE) nên các kind cũ
 *   không bị đụng.
 * - `ck_teacher_review_score_by_kind` được dựng lại: `system_confirm` đòi cả `final_score` lẫn
 *   `confirmed_computation_id`. Việc `final_score` bằng điểm của lượt tính đó là so giữa hai bảng,
 *   CHECK không viết được — thuộc service, trong cùng giao dịch ghi dòng.
 *
 * Vì sao điều kiện viết `kind::text <> 'system_confirm'` chứ không `kind <> 'system_confirm'`:
 * Postgres cấm dùng một giá trị enum vừa `ADD VALUE` trong CÙNG giao dịch (55P04, "unsafe use of new
 * value"), và literal enum trong CHECK được phân giải ngay lúc tạo ràng buộc. So sánh qua `text`
 * không phân giải literal enum nên migration này chạy được cả khi chạy cả loạt trong một giao dịch
 * (`typeorm migration:run -t all`) lẫn từng migration một.
 */
export class TeacherReviewSystemConfirm1789710000000 implements MigrationInterface {
  name = 'TeacherReviewSystemConfirm1789710000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TYPE "examcollect"."teacher_review_kind" ADD VALUE IF NOT EXISTS 'system_confirm'`);
    await q.query(`ALTER TABLE "examcollect"."teacher_review" ADD COLUMN "confirmed_computation_id" uuid`);
    await q.query(`
      ALTER TABLE "examcollect"."teacher_review"
        ADD CONSTRAINT "fk_teacher_review_confirmed_computation" FOREIGN KEY ("confirmed_computation_id", "grading_result_id")
        REFERENCES "examcollect"."score_computation"("id", "grading_result_id") ON DELETE RESTRICT
    `);
    await q.query(`
      ALTER TABLE "examcollect"."teacher_review"
        DROP CONSTRAINT "ck_teacher_review_score_by_kind",
        ADD CONSTRAINT "ck_teacher_review_score_by_kind"
          CHECK ((kind = 'error_exception' OR final_score IS NOT NULL)
             AND (kind::text <> 'system_confirm' OR confirmed_computation_id IS NOT NULL))
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    // Dòng xác nhận là chữ ký của giảng viên: `down()` phải nổ thay vì xoá cột làm mất nó.
    const rows: { n: number }[] = await q.query(
      `SELECT count(*)::int AS n FROM "examcollect"."teacher_review" WHERE kind::text = 'system_confirm'`,
    );
    if (rows[0].n > 0) {
      throw new Error(
        `TeacherReviewSystemConfirm1789710000000: không hoàn được — còn ${rows[0].n} dòng teacher_review kind system_confirm`,
      );
    }
    await q.query(`
      ALTER TABLE "examcollect"."teacher_review"
        DROP CONSTRAINT "ck_teacher_review_score_by_kind",
        ADD CONSTRAINT "ck_teacher_review_score_by_kind" CHECK (kind = 'error_exception' OR final_score IS NOT NULL)
    `);
    await q.query(`ALTER TABLE "examcollect"."teacher_review" DROP CONSTRAINT "fk_teacher_review_confirmed_computation"`);
    await q.query(`ALTER TABLE "examcollect"."teacher_review" DROP COLUMN "confirmed_computation_id"`);
    // Giá trị enum `system_confirm` ở lại: Postgres không bỏ được giá trị enum. Không dòng nào dùng nó
    // (đã kiểm ở trên) nên nó vô hại; `up()` dùng `ADD VALUE IF NOT EXISTS` nên chạy lại được.
  }
}
