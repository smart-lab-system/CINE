import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Ngữ cảnh mà một lượt chấm THỰC SỰ tiêu thụ — không phải ngữ cảnh đã được
 * cấu hình cho phiên.
 *
 * Hai con số đó từng luôn trùng nhau vì chỉ có một provider. Từ khi có
 * chuỗi dự phòng (2026-09-15) thì không: các endpoint tương thích OpenAI
 * KHÔNG gửi được PDF, nên một bài do bậc dự phòng chấm chạy ở mức "chỉ có
 * rubric" DÙ giảng viên đã upload đủ đề bài và đáp án mẫu.
 *
 * Không lưu lại thì hỏng hai chỗ, cả hai ÂM THẦM:
 *
 * 1. `grading-readiness` báo "mức 3 — đủ tài liệu" theo CẤU HÌNH. Giảng
 *    viên tin bài được chấm có đề bài, mà thật ra không. Đúng thứ spec
 *    §3.4 sinh ra để chặn — "phải BÁO, không được im".
 * 2. Calibration §11.2 so nhánh A (chỉ rubric) với nhánh B (có đề bài) —
 *    toàn bộ luận điểm của đồ án. Không biết một DÒNG thực sự chạy ở mức
 *    nào thì hai nhánh lẫn vào nhau và con số không nói lên gì.
 *
 * Hai cột boolean chứ không một cột "mức": mức là thứ SUY RA được từ hai
 * cờ, còn hai cờ thì không suy ngược lại được từ mức. Lưu thứ thô hơn.
 *
 * `NULL` có nghĩa riêng: "dòng này được chấm trước khi hệ thống biết ghi
 * lại điều đó". Đặt `DEFAULT false` cho các dòng cũ sẽ là bịa ra một sự
 * thật lịch sử — và calibration sẽ đọc chúng như "đã đo, không có đề bài"
 * thay vì "không biết".
 */
export class AddGradingContextUsed1789250000000 implements MigrationInterface {
  name = 'AddGradingContextUsed1789250000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "examcollect"."grading_result"
      ADD COLUMN "context_used_question" boolean,
      ADD COLUMN "context_used_model_answer" boolean
    `);

    // Hai cột này là một phần output của AI, nên chúng phải BẤT BIẾN cùng
    // luật với `ai_total_score` (Security rule 6). Một dòng sửa được "lượt
    // chấm này có đề bài không" sau khi đã chốt là một dòng có thể làm đẹp
    // số liệu calibration mà không ai thấy.
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION examcollect.guard_grading_result_ai_immutable()
      RETURNS trigger
      LANGUAGE plpgsql
      SET search_path TO 'examcollect', 'public'
      AS $function$
          BEGIN
              IF OLD.ai_total_score IS NOT NULL
                 AND (
                      NEW.ai_total_score IS DISTINCT FROM OLD.ai_total_score
                      OR NEW.criterion_results IS DISTINCT FROM OLD.criterion_results
                      OR NEW.model_used IS DISTINCT FROM OLD.model_used
                      OR NEW.confidence IS DISTINCT FROM OLD.confidence
                      OR NEW.advocate_opinion IS DISTINCT FROM OLD.advocate_opinion
                      OR NEW.context_used_question IS DISTINCT FROM OLD.context_used_question
                      OR NEW.context_used_model_answer
                         IS DISTINCT FROM OLD.context_used_model_answer
                 ) THEN
                  RAISE EXCEPTION
                      'GradingResult %''s AI output is immutable once set; edit via TeacherReview instead',
                      OLD.id
                      USING ERRCODE = 'object_not_in_prerequisite_state';
              END IF;
              RETURN NEW;
          END;
          $function$
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Khôi phục hàm TRƯỚC, bỏ cột SAU — ngược lại thì có một khoảnh khắc
    // hàm tham chiếu cột không còn tồn tại, và mọi UPDATE lên bảng này
    // trong khoảnh khắc đó nổ với một lỗi không liên quan gì tới thứ người
    // ta đang làm.
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION examcollect.guard_grading_result_ai_immutable()
      RETURNS trigger
      LANGUAGE plpgsql
      SET search_path TO 'examcollect', 'public'
      AS $function$
          BEGIN
              IF OLD.ai_total_score IS NOT NULL
                 AND (
                      NEW.ai_total_score IS DISTINCT FROM OLD.ai_total_score
                      OR NEW.criterion_results IS DISTINCT FROM OLD.criterion_results
                      OR NEW.model_used IS DISTINCT FROM OLD.model_used
                      OR NEW.confidence IS DISTINCT FROM OLD.confidence
                      OR NEW.advocate_opinion IS DISTINCT FROM OLD.advocate_opinion
                 ) THEN
                  RAISE EXCEPTION
                      'GradingResult %''s AI output is immutable once set; edit via TeacherReview instead',
                      OLD.id
                      USING ERRCODE = 'object_not_in_prerequisite_state';
              END IF;
              RETURN NEW;
          END;
          $function$
    `);

    await queryRunner.query(`
      ALTER TABLE "examcollect"."grading_result"
      DROP COLUMN "context_used_question",
      DROP COLUMN "context_used_model_answer"
    `);
  }
}
