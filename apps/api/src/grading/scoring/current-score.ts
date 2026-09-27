import type { TeacherReviewKind } from '../grading-model.types';

export interface CurrentScoreInput {
  pipeline: 'one_shot' | 'investigator';
  aiTotalScore: string | null;
  /** Dòng `teacher_review` MANG điểm mới nhất (review | manual_score | bulk_accept). */
  latestScoredReview: { kind: TeacherReviewKind; finalScore: string } | null;
  latestManualScore: string | null;
  finalized: boolean;
  finalizedComputationScore: string | null;
  latestComputationScore: string | null;
}

export interface CurrentScore {
  value: number | null;
  source: 'manual' | 'review' | 'finalized' | 'computation' | 'ai' | 'none';
}

/**
 * §14.2 — MỌI chỗ đọc điểm đi qua đúng hàm này. `ai_total_score` không bao giờ là điểm hiện tại
 * của đường investigator: đó là điểm của lượt tính đầu, còn giá thì đổi được.
 */
export function currentScore(x: CurrentScoreInput): CurrentScore {
  if (x.pipeline === 'one_shot') {
    if (x.latestScoredReview) return { value: Number(x.latestScoredReview.finalScore), source: 'review' };
    return x.aiTotalScore === null ? { value: null, source: 'none' } : { value: Number(x.aiTotalScore), source: 'ai' };
  }
  if (x.latestManualScore !== null) return { value: Number(x.latestManualScore), source: 'manual' };
  if (x.finalized && x.finalizedComputationScore !== null) {
    return { value: Number(x.finalizedComputationScore), source: 'finalized' };
  }
  if (x.latestComputationScore !== null) return { value: Number(x.latestComputationScore), source: 'computation' };
  return { value: null, source: 'none' };
}
