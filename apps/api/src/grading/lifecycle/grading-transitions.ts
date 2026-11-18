import type { GradingResultStatus } from '../entities/grading-result.entity';

/**
 * Máy trạng thái §14.3 — bản CODE. Bản DB là `validate_grading_result_lifecycle`
 * (`1789460000000`); `grading-lifecycle-v2.e2e-spec.ts` đi qua MỌI cặp trạng thái và đòi hai bản
 * trả lời giống nhau, nên sửa một bản mà quên bản kia là test đỏ.
 *
 * Luật DB ép thêm: sang `finalized` phải có `finalized_by`;
 * `→ ai_grading` từ flagged/auto_approved: system ungradable (không điểm) hoặc force regrade (NEW xoá điểm AI).
 */
export const GRADING_STATUSES: readonly GradingResultStatus[] = [
  'ai_grading', 'ai_graded', 'auto_approved', 'audit_pending',
  'flagged_for_review', 'teacher_reviewed', 'finalized', 'exported',
];

export const GRADING_TRANSITIONS: ReadonlyArray<readonly [GradingResultStatus, GradingResultStatus]> = [
  ['ai_grading', 'ai_graded'],
  ['ai_grading', 'flagged_for_review'],
  ['ai_graded', 'auto_approved'],
  ['ai_graded', 'flagged_for_review'],
  ['auto_approved', 'audit_pending'],
  ['audit_pending', 'teacher_reviewed'],
  ['auto_approved', 'flagged_for_review'],
  ['auto_approved', 'ai_grading'], // force chấm lại bằng AI (xoá điểm AI cùng UPDATE)
  ['audit_pending', 'flagged_for_review'],
  ['flagged_for_review', 'auto_approved'],
  ['flagged_for_review', 'ai_grading'], // system ungradable HOẶC force chấm lại bằng AI
  ['auto_approved', 'teacher_reviewed'],
  ['flagged_for_review', 'teacher_reviewed'],
  ['auto_approved', 'finalized'],
  ['teacher_reviewed', 'finalized'],
  ['finalized', 'exported'],
];

const ALLOWED = new Set(GRADING_TRANSITIONS.map(([from, to]) => `${from}>${to}`));

export function canTransition(from: GradingResultStatus, to: GradingResultStatus): boolean {
  return ALLOWED.has(`${from}>${to}`);
}

/** §14.3: *"Một danh sách, ở một chỗ."* Bài không chấm được nằm ở `flagged_for_review`. */
export const BLOCKS_FINALIZE: ReadonlySet<GradingResultStatus> = new Set<GradingResultStatus>([
  'ai_grading', 'ai_graded', 'flagged_for_review', 'audit_pending',
]);
