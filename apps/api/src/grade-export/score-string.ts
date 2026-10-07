import { currentScore, type CurrentScore, type CurrentScoreInput } from '../grading/scoring/current-score';
import { parseHundredths } from '../grading/scoring/hundredths';

export interface PickedScore {
  /** Chuỗi `numeric` thô của đúng nguồn được chọn — không bao giờ qua số thực. */
  raw: string;
  hundredths: number;
  source: CurrentScore['source'];
}

/**
 * Điểm hiện tại của MỘT bài, dạng chuỗi (spec D8). `currentScore()` quyết nguồn nào thắng — đúng một chỗ
 * (§14.2) — rồi ta lấy chuỗi thô của nguồn đó. Trường `value` (số thực) của `currentScore()` KHÔNG được dùng:
 * đọc điểm qua số thực là hỏng theo parent §13.2.
 */
export function pickScore(input: CurrentScoreInput): PickedScore | null {
  const { source } = currentScore(input);
  let raw: string | null;
  switch (source) {
    case 'review':
      raw = input.latestScoredReview?.finalScore ?? null;
      break;
    case 'ai':
      raw = input.aiTotalScore;
      break;
    case 'manual':
      raw = input.latestManualScore;
      break;
    case 'finalized':
      raw = input.finalizedComputationScore;
      break;
    case 'computation':
      raw = input.latestComputationScore;
      break;
    default:
      raw = null;
  }
  return raw === null ? null : { raw, hundredths: parseHundredths(raw), source };
}
