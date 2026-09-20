import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `advocate_opinion = null` đang mang BA nghĩa: không cần phản biện, cố ý
 * bỏ qua vì phiên không có đề bài, và ĐÃ CHẠY VÀ HỎNG (lỗi bị nuốt có chủ
 * đích ở `grading.service.ts`).
 *
 * Hậu quả không nằm ở lúc chạy mà ở SỐ LIỆU của đồ án.
 * `scripts/calibration/export.py` suy nhánh A/B/C/D bằng
 * `(gr.advocate_opinion IS NOT NULL) AS co_advocate`, nên một lượt phản
 * biện crash bị xếp vào nhánh B như thể nó chưa từng được bật: nhánh C
 * thiếu đúng những bài mà phản biện gặp khó nhất, nhánh B lẫn những bài
 * đáng lẽ thuộc C, và phép so sánh "phản biện có giúp không" được tính
 * trên hai tập đã nhiễm nhau.
 *
 * KHÔNG `DEFAULT`, KHÔNG backfill: dòng cũ để NULL. README của calibration
 * đã có nhánh `?` cho đúng loại dữ liệu "chấm trước khi hệ thống biết ghi
 * lại điều này", kèm cảnh báo đừng gộp nó vào nhánh khác.
 */
export class AddAdvocateOutcome1789310000000 implements MigrationInterface {
  name = 'AddAdvocateOutcome1789310000000';

  /**
   * Siêu tập các cột output-của-AI phải bất biến, LỌC THEO CỘT THỰC SỰ TỒN
   * TẠI trước khi dựng thân hàm.
   *
   * Vì sao không ghi cứng như bốn migration trước: nhánh
   * `feature/code-autograder-plan-1` có `AddCodeGradingSchema1789300000000`
   * thêm `test_run` VÀ thêm nó vào cùng hàm này. Hai nhánh song song, hai
   * file migration khác nhau ⇒ **git không báo xung đột**, và cái chạy sau
   * sẽ gỡ cột của cái chạy trước khỏi danh sách đóng băng. Không test nào
   * của nhánh nào bắt được, vì mỗi nhánh chạy riêng đều xanh.
   *
   * Dựng động từ siêu tập thì chạy thứ tự nào cũng ra HỢP của hai bên, và
   * nhánh nào thiếu cột nào thì đơn giản là không nhắc tới nó.
   */
  private static readonly FROZEN_SUPERSET = [
    'ai_total_score',
    'criterion_results',
    'model_used',
    'confidence',
    'advocate_opinion',
    'advocate_outcome',
    'context_used_question',
    'context_used_model_answer',
    'test_run',
  ];

  private static rebuildGuard(columns: string[]): string {
    const list = columns.map((c) => `'${c}'`).join(', ');
    return `
      DO $do$
      DECLARE
        superset text[] := ARRAY[${list}];
        present  text[];
        predicate text;
      BEGIN
        SELECT array_agg(t.c ORDER BY t.ord)
          INTO present
          FROM unnest(superset) WITH ORDINALITY AS t(c, ord)
         WHERE EXISTS (
           SELECT 1
             FROM information_schema.columns
            WHERE table_schema = 'examcollect'
              AND table_name   = 'grading_result'
              AND column_name  = t.c
         );

        SELECT string_agg(format('NEW.%I IS DISTINCT FROM OLD.%I', c, c), E'\\n OR ')
          INTO predicate
          FROM unnest(present) c;

        EXECUTE
          $f$
          CREATE OR REPLACE FUNCTION examcollect.guard_grading_result_ai_immutable()
          RETURNS trigger
          LANGUAGE plpgsql
          SET search_path TO 'examcollect', 'public'
          AS $body$
              BEGIN
                  IF OLD.ai_total_score IS NOT NULL
                     AND (
          $f$
          || predicate ||
          $f$
                     ) THEN
                      RAISE EXCEPTION
                          'GradingResult %''s AI output is immutable once set; edit via TeacherReview instead',
                          OLD.id
                          USING ERRCODE = 'object_not_in_prerequisite_state';
                  END IF;
                  RETURN NEW;
              END;
          $body$
          $f$;
      END
      $do$;
    `;
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "examcollect"."advocate_outcome" AS ENUM (
        'not_needed', 'skipped', 'failed', 'completed'
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "examcollect"."grading_result"
      ADD COLUMN "advocate_outcome" "examcollect"."advocate_outcome"
    `);

    // Cột này là một phần output của AI, nên nó BẤT BIẾN cùng luật với
    // `ai_total_score` (Security rule 6). Một dòng sửa được "lượt phản biện
    // đã xảy ra chuyện gì" sau khi chốt là một dòng làm đẹp được số liệu
    // calibration mà không ai thấy.
    await queryRunner.query(
      AddAdvocateOutcome1789310000000.rebuildGuard(
        AddAdvocateOutcome1789310000000.FROZEN_SUPERSET,
      ),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Khôi phục hàm TRƯỚC, bỏ cột SAU — ngược lại thì có một khoảnh khắc hàm
    // tham chiếu cột không còn tồn tại, và mọi UPDATE lên bảng này trong
    // khoảnh khắc đó nổ với một lỗi không liên quan gì tới thứ người ta đang
    // làm.
    await queryRunner.query(
      AddAdvocateOutcome1789310000000.rebuildGuard(
        AddAdvocateOutcome1789310000000.FROZEN_SUPERSET.filter(
          (c) => c !== 'advocate_outcome',
        ),
      ),
    );

    await queryRunner.query(`
      ALTER TABLE "examcollect"."grading_result" DROP COLUMN "advocate_outcome"
    `);
    await queryRunner.query(`DROP TYPE "examcollect"."advocate_outcome"`);
  }
}
