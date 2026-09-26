/**
 * Enum của mô hình dữ liệu §14.1. File LEAF — đọc bởi decorator `@Column`; import bất cứ thứ gì
 * ở đây là mở cửa cho `undefined` lọt vào decorator dưới CommonJS (xem `advocate.types.ts`).
 */
export const GRADING_PIPELINES = ['one_shot', 'investigator'] as const;
export type GradingPipeline = (typeof GRADING_PIPELINES)[number];

/** Đúng hai lớp lý do không chấm được (§4.4). */
export const UNGRADABLE_CLASSES = ['system', 'submission'] as const;
export type UngradableClass = (typeof UNGRADABLE_CLASSES)[number];

/** `error_exception` là dòng DUY NHẤT được không mang điểm (§14.1). */
export const TEACHER_REVIEW_KINDS = ['review', 'error_exception', 'manual_score', 'bulk_accept'] as const;
export type TeacherReviewKind = (typeof TEACHER_REVIEW_KINDS)[number];

/** `exclude` = bỏ lỗi này cho riêng bài này (cũng dùng cho *đồng ý bác bỏ*); `include` = giữ lỗi này. */
export const EXCEPTION_DIRECTIONS = ['exclude', 'include'] as const;
export type ExceptionDirection = (typeof EXCEPTION_DIRECTIONS)[number];

export const MODEL_ANSWER_ORIGINS = ['teacher', 'authoring', 'generated'] as const;
export type ModelAnswerOrigin = (typeof MODEL_ANSWER_ORIGINS)[number];

export const ERROR_RULE_STATES = ['proposed', 'active', 'dismissed', 'retired'] as const;
export type ErrorRuleState = (typeof ERROR_RULE_STATES)[number];
export const ERROR_RULE_ORIGINS = ['teacher', 'seed', 'agent_reported'] as const;
export type ErrorRuleOrigin = (typeof ERROR_RULE_ORIGINS)[number];

export const ATTEMPT_OUTCOMES = ['graded', 'ungradable'] as const;
export type AttemptOutcome = (typeof ATTEMPT_OUTCOMES)[number];
export const TEST_BUNDLE_ORIGINS = ['teacher', 'from_model_answer', 'generated'] as const;
export type TestBundleOrigin = (typeof TEST_BUNDLE_ORIGINS)[number];
export const SCORE_COMPUTATION_REASONS = [
  'initial', 'price_change', 'rule_revision', 'tier2_rule', 'tier3_rule',
  'case_dropped', 'error_exception', 'finalized_reapply',
] as const;
export type ScoreComputationReason = (typeof SCORE_COMPUTATION_REASONS)[number];
