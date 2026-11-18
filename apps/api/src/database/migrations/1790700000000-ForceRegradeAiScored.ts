import { MigrationInterface, QueryRunner } from 'typeorm';
import { AI_OUTPUT_COLUMNS, rebuildAiImmutableGuardSql } from './support/ai-immutable-guard';

/**
 * Cho phép "Chấm lại bằng AI" trên bài ĐÃ CÓ ĐIỂM (flagged/auto_approved):
 * 1) lifecycle: flagged|auto_approved → ai_grading khi NEW xoá điểm AI;
 * 2) guard bất biến: cho phép reset AI columns khi NEW.status = ai_grading và ai_total_score NULL.
 *
 * Giữ đường chấm lại system-ungradable (không điểm) như cũ.
 */
export class ForceRegradeAiScored1790700000000 implements MigrationInterface {
  name = 'ForceRegradeAiScored1790700000000';

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
                        AND NEW.status IN ('audit_pending', 'flagged_for_review', 'teacher_reviewed', 'finalized', 'ai_grading'))
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

              -- System ungradable (không điểm) HOẶC force regrade (NEW đã xoá điểm AI).
              IF OLD.status IN ('flagged_for_review', 'auto_approved') AND NEW.status = 'ai_grading' THEN
                  IF OLD.status = 'flagged_for_review'
                     AND OLD.ungradable_class = 'system'
                     AND OLD.ai_total_score IS NULL THEN
                      NULL; -- đường §2.3 cũ
                  ELSIF NEW.ai_total_score IS NULL AND NEW.ungradable_class IS NULL THEN
                      NULL; -- force chấm lại bằng AI
                  ELSE
                      RAISE EXCEPTION
                          'Chỉ chấm lại bài lỗi hệ thống (không điểm) hoặc ép chấm lại khi đã xoá điểm AI — kết quả %',
                          OLD.id
                          USING ERRCODE = 'check_violation';
                  END IF;
              END IF;
          END IF;

          RETURN NEW;
      END;
      $$
    `);

    // Guard: cho phép xoá output AI khi đưa về ai_grading (force regrade).
    await q.query(`
      CREATE OR REPLACE FUNCTION examcollect.guard_grading_result_ai_immutable()
      RETURNS trigger
      LANGUAGE plpgsql
      SET search_path TO 'examcollect', 'public'
      AS $body$
          BEGIN
              IF OLD.ai_total_score IS NOT NULL
                 AND NEW.status = 'ai_grading'
                 AND NEW.ai_total_score IS NULL THEN
                  RETURN NEW;
              END IF;
              IF OLD.ai_total_score IS NOT NULL
                 AND (
                      NEW.ai_total_score IS DISTINCT FROM OLD.ai_total_score
                   OR NEW.criterion_results IS DISTINCT FROM OLD.criterion_results
                   OR NEW.model_used IS DISTINCT FROM OLD.model_used
                   OR NEW.confidence IS DISTINCT FROM OLD.confidence
                   OR NEW.advocate_opinion IS DISTINCT FROM OLD.advocate_opinion
                   OR NEW.advocate_outcome IS DISTINCT FROM OLD.advocate_outcome
                   OR NEW.context_used_question IS DISTINCT FROM OLD.context_used_question
                   OR NEW.context_used_model_answer IS DISTINCT FROM OLD.context_used_model_answer
                   OR NEW.selected_approach_key IS DISTINCT FROM OLD.selected_approach_key
                 ) THEN
                  RAISE EXCEPTION
                      'GradingResult %''s AI output is immutable once set; edit via TeacherReview instead',
                      OLD.id
                      USING ERRCODE = 'object_not_in_prerequisite_state';
              END IF;
              RETURN NEW;
          END;
      $body$;
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    // Khôi phục lifecycle bản 178946.
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

    await q.query(rebuildAiImmutableGuardSql(AI_OUTPUT_COLUMNS));
  }
}
