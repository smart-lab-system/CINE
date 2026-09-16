import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Ý kiến của Advocate — lượt hỏi thứ hai, MÙ RUBRIC.
 *
 * Grader trả lời "bài này có khớp rubric không". Advocate trả lời câu còn
 * lại, câu mà cả thiết kế này sinh ra để hỏi: "bỏ qua rubric, em ấy có
 * đúng không?" — vì mỗi giảng viên viết rubric một kiểu, và một em trả
 * lời đúng theo hướng rubric không lường trước sẽ mất điểm âm thầm.
 *
 * VÌ SAO LÀ CỘT RIÊNG, KHÔNG PHẢI MỘT KHỐI TRONG `criterion_results`:
 * spec §2.2 viết là khối trong `criterion_results`, nhưng cách đó không
 * chạy được. `trg_grading_result_guard_ai_immutable` đóng băng cột đó
 * NGAY KHI `ai_total_score` được ghi, nên mọi lần ghi thứ hai đều bị từ
 * chối. Cột riêng còn được thêm hai thứ: `criterion_results` giữ nguyên
 * kiểu MẢNG (ba nơi đang đọc nó), và không phải thêm trạng thái nào vào
 * vòng đời chấm — thứ mà CLAUDE.md cảnh báo là kéo theo trigger, migration
 * và mười suite e2e.
 *
 * `NULL` là trạng thái đúng và CÓ NGHĨA: "Advocate không chạy cho bài
 * này". Khác hẳn `'{}'::jsonb` ("chạy và không kiến nghị gì"). Khoảng 80%
 * số bài sẽ ở `NULL`, và chính sự phân biệt đó là nguồn đo tỉ lệ kích
 * hoạt cổng Advocate cho calibration (§11) mà không cần một cột đếm nào.
 *
 * Trigger được MỞ RỘNG chứ không để nguyên: nếu không, `advocate_opinion`
 * thành thứ duy nhất trong bảng sửa được sau khi đã chốt. Một ý kiến phản
 * biện mà sửa được sau khi giảng viên đã đọc thì nó không còn là bằng
 * chứng — Security rule 6 áp cho cả hai lượt, không riêng Grader.
 */
export class AddAdvocateOpinion1789240000000 implements MigrationInterface {
  name = 'AddAdvocateOpinion1789240000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "examcollect"."grading_result"
      ADD COLUMN "advocate_opinion" jsonb
    `);

    // CREATE OR REPLACE, không DROP + CREATE: trigger đang trỏ vào oid của
    // hàm này. DROP sẽ phải drop cả trigger, và một lỗi giữa chừng để lại
    // bảng KHÔNG CÒN guard nào — trạng thái không ai phát hiện ra bằng mắt.
    //
    // `SET search_path` giữ nguyên từ bản gốc: bỏ nó đi thì hàm chạy với
    // search_path của phiên gọi, và một phiên trỏ sang schema khác sẽ làm
    // hàm nhìn nhầm bảng.
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
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // THỨ TỰ QUAN TRỌNG: khôi phục hàm TRƯỚC, bỏ cột SAU. Ngược lại thì
    // giữa hai câu lệnh có một khoảnh khắc hàm tham chiếu một cột không
    // còn tồn tại, và mọi UPDATE lên `grading_result` trong khoảnh khắc
    // đó sẽ nổ với một lỗi không liên quan gì tới thứ người ta đang làm.
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
      DROP COLUMN "advocate_opinion"
    `);
  }
}
