import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `validate_grading_result_lifecycle` viết lại theo ĐÚNG bảng §14.3 (§14.4): thêm sáu dòng *Thêm*
 * — bảy cặp trạng thái — cùng ba luật mà bảng một chiều không tả được:
 *   1. sang `finalized` phải mang `finalized_by` (người ký tên, §14.2);
 *   2. `flagged_for_review → ai_grading` chỉ cho bài không chấm được lớp `system`, chưa có điểm
 *      (§2.3 luật 1, 4);
 *   3. `pipeline` không bao giờ đổi (§14.1, §2.3 luật 8).
 * Bản trong code: `grading/lifecycle/grading-transitions.ts`; T-LIFE-1 giữ hai bản khớp nhau.
 */
export class GradingLifecycleV21789460000000 implements MigrationInterface {
  name = 'GradingLifecycleV21789460000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
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

          IF NEW.pipeline IS DISTINCT FROM OLD.pipeline THEN
              RAISE EXCEPTION 'pipeline của một kết quả chấm không bao giờ đổi: % -> %', OLD.pipeline, NEW.pipeline
                  USING ERRCODE = 'check_violation';
          END IF;

          IF NEW.status IS DISTINCT FROM OLD.status THEN
              IF NOT (
                    (OLD.status = 'ai_grading'
                        AND NEW.status IN ('ai_graded', 'flagged_for_review'))
                 OR (OLD.status = 'ai_graded'
                        AND NEW.status IN ('auto_approved', 'flagged_for_review'))
                 OR (OLD.status = 'auto_approved'
                        AND NEW.status IN ('audit_pending', 'flagged_for_review', 'teacher_reviewed', 'finalized'))
                 OR (OLD.status = 'audit_pending'
                        AND NEW.status IN ('teacher_reviewed', 'flagged_for_review'))
                 OR (OLD.status = 'flagged_for_review'
                        AND NEW.status IN ('auto_approved', 'ai_grading', 'teacher_reviewed'))
                 OR (OLD.status = 'teacher_reviewed' AND NEW.status = 'finalized')
                 OR (OLD.status = 'finalized' AND NEW.status = 'exported')
              ) THEN
                  RAISE EXCEPTION 'Invalid grading result status transition: % -> %', OLD.status, NEW.status
                      USING ERRCODE = 'check_violation';
              END IF;

              IF NEW.status = 'finalized' AND NEW.finalized_by IS NULL THEN
                  RAISE EXCEPTION 'Chốt điểm phải mang tên người chốt (finalized_by) — kết quả %', OLD.id
                      USING ERRCODE = 'check_violation';
              END IF;

              IF OLD.status = 'flagged_for_review' AND NEW.status = 'ai_grading'
                 AND (OLD.ai_total_score IS NOT NULL OR OLD.ungradable_class IS DISTINCT FROM 'system') THEN
                  RAISE EXCEPTION 'Chỉ chấm lại bài không chấm được lớp system, chưa có điểm — kết quả %', OLD.id
                      USING ERRCODE = 'check_violation';
              END IF;
          END IF;

          RETURN NEW;
      END;
      $$
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    // Bản của `AllowAiGradingToFlagged1789220000000`.
    await q.query(`
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
      $$
    `);
  }
}
