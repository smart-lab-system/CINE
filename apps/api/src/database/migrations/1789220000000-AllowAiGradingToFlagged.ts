import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Mở đúng MỘT đường: `ai_grading → flagged_for_review`.
 *
 * Vì sao cần: trigger hiện tại chỉ cho `ai_grading → ai_graded`. Một job
 * chấm thất bại vĩnh viễn — hết retry, hoặc guard bắt được AI không định vị
 * nổi dẫn chứng — KHÔNG CÓ ĐƯỜNG NÀO để kết thúc. Dòng nằm lại ở
 * `ai_grading`, và `progress()` đếm nó là `pending`.
 *
 * Hệ quả mà giảng viên nhìn thấy: thanh tiến độ đứng ở 38/40, poll mỗi 2
 * giây, mãi mãi, không thông báo lỗi nào, và "Chốt điểm" bị chặn vì "còn
 * bài đang chấm". Không có nút nào bấm được, vì không có trạng thái nào để
 * bấm tới.
 *
 * Một bài chấm hỏng phải trở thành "AI không chấm được, mời thầy xem" —
 * một kết cục NGƯỜI XỬ LÝ ĐƯỢC, thay vì một con số treo.
 *
 * CHỈ mở đường này, không mở gì khác. `auto_approved` vẫn phải đi qua
 * `ai_graded` (nếu không thì đó là công bố một điểm số chưa từng được
 * chấm), và `finalized` vẫn phải đi qua `teacher_reviewed` — đó là chỗ con
 * người ký tên, và không lỗi kỹ thuật nào được phép đi vòng qua nó.
 */
export class AllowAiGradingToFlagged1789220000000 implements MigrationInterface {
  name = 'AllowAiGradingToFlagged1789220000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
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
                  (OLD.status = 'ai_grading'
                      AND NEW.status IN ('ai_graded', 'flagged_for_review'))
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
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Khôi phục nguyên văn bản gốc từ InitialSchema.
    //
    // CẢNH BÁO: nếu đã có dòng đi `ai_grading → flagged_for_review` trước
    // khi revert, chúng VẪN ở `flagged_for_review` sau đó. Trigger không
    // xoá dữ liệu, nó chỉ từ chối lối vào — nên revert trả schema về mà
    // không trả dữ liệu về. Kiểm `SELECT count(*) FROM grading_result
    // WHERE status = 'flagged_for_review' AND ai_total_score IS NULL`
    // trước khi revert trên dữ liệu thật: đó chính là những dòng đi qua
    // đường này.
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
  }
}
