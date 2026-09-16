import type { GradingResult } from '@/lib/api/grading';

/**
 * Bốn nhóm của màn Điều phối.
 *
 * Toàn bộ file này là hàm thuần, không chạm DOM và không chạm mạng — đây là
 * chỗ duy nhất màn Điều phối có logic, và một phép phân loại sai không làm
 * đỏ test nào khác: nó chỉ đưa bài vào nhầm ô, và giảng viên tin con số.
 */
export type Bucket = 'high' | 'low' | 'flagged' | 'stuck';

/** Từ đây trở lên mới coi là tin cậy cao. */
export const HIGH_CONFIDENCE = 0.7;

/** Tỉ lệ bài mất điểm ở một tiêu chí, từ đây trở lên thì báo bất thường. */
export const MASS_LOSS_RATIO = 0.6;

/**
 * Điểm một mức đánh giá đáng được, theo đúng `pointsFor()` của server.
 *
 * Chép lại ba nhánh chứ không đoán: `partially_met` là ĐÚNG MỘT NỬA, và con
 * số đó cố tình chưa cấu hình được — trọng số từng phần là câu hỏi thiết kế
 * rubric, không phải một hằng số nằm trong helper.
 */
export function pointsForVerdict(
  verdict: 'met' | 'partially_met' | 'not_met',
  maxPoints: number,
): number {
  if (verdict === 'met') return maxPoints;
  if (verdict === 'partially_met') return Math.round(maxPoints * 50) / 100;
  return 0;
}

/**
 * Bài này thuộc nhóm nào.
 *
 * "Treo" KHÔNG tính bằng đồng hồ ở client. `GRADE_JOB_TIMEOUT_MS` là biến
 * môi trường của server; màn hình không biết nó và không nên đoán. Dấu hiệu
 * dùng được là: bài còn `ai_grading` trong khi hàng đợi không còn job nào
 * chạy — cũng chính là điều kiện `regradeStuck()` lọc theo, nên màn hình và
 * route nó gọi kể cùng một câu chuyện.
 */
export function bucketOf(result: GradingResult, queueActive: number): Bucket {
  if (result.status === 'ai_grading') {
    return queueActive === 0 ? 'stuck' : 'low';
  }
  if (result.status === 'flagged_for_review') {
    return 'flagged';
  }

  // `check == null` nghĩa là bài được chấm TRƯỚC khi hệ thống ghi lại phép
  // đối chiếu. Coi nó là `'ok'` sẽ làm mọi bài cũ trông như đã được kiểm.
  const allVerified = result.criterionResults.every((criterion) => criterion.check === 'ok');
  const confident = (result.confidence ?? 0) >= HIGH_CONFIDENCE;
  return confident && allVerified ? 'high' : 'low';
}

export function countBuckets(
  results: GradingResult[],
  queueActive: number,
): Record<Bucket, number> {
  const counts: Record<Bucket, number> = { high: 0, low: 0, flagged: 0, stuck: 0 };
  for (const result of results) {
    counts[bucketOf(result, queueActive)] += 1;
  }
  return counts;
}

/**
 * Điểm QUY RA từ kiến nghị của lượt phản biện.
 *
 * `AdvocateOpinion` không có trường điểm nào — nó chỉ nêu mức đánh giá, và
 * ba lớp chặn độc lập giữ cho nó không bao giờ trả về một con số. Hàm này
 * tính lại ở client theo đúng thang rubric, và mọi chỗ hiển thị con số này
 * phải nói rõ nó là điểm SUY RA, không phải điểm ai đó đã chấm.
 *
 * Tiêu chí lượt phản biện không nhắc tới thì giữ nguyên điểm của lượt chấm:
 * im lặng ở đây nghĩa là "không có ý kiến", không phải "đề nghị 0 điểm".
 */
export function advocateScore(
  result: GradingResult,
  maxByCriterion: Map<string, number>,
): number | null {
  if (!result.advocateOpinion) {
    return null;
  }
  const suggested = new Map(
    result.advocateOpinion.suggestedVerdicts.map((s) => [s.criterionId, s.suggestedVerdict]),
  );

  let total = 0;
  for (const criterion of result.criterionResults) {
    const verdict = suggested.get(criterion.criterionId);
    if (verdict === undefined) {
      total += criterion.points;
      continue;
    }
    total += pointsForVerdict(verdict, maxByCriterion.get(criterion.criterionId) ?? 0);
  }
  return Math.round(total * 100) / 100;
}

export interface Anomaly {
  kind: 'criterion-mass-loss' | 'unlocatable-evidence' | 'advocate-dissent';
  count: number;
  total: number;
  criterionId?: string;
  /** Khoảng cách trung bình giữa hai lập luận. KHÔNG phải điểm đã bị sửa. */
  averageGap?: number;
}

/**
 * Những gì cả lớp cùng lệch.
 *
 * Tiêu chí bị trừ điểm hàng loạt là tín hiệu **rubric viết chưa chặt**, không
 * phải tín hiệu cả lớp kém — và đó là cách màn hình phải nói ra nó.
 */
export function findAnomalies(
  results: GradingResult[],
  maxByCriterion: Map<string, number>,
): Anomaly[] {
  const total = results.length;
  if (total === 0) {
    return [];
  }
  const out: Anomaly[] = [];

  const lostByCriterion = new Map<string, number>();
  for (const result of results) {
    for (const criterion of result.criterionResults) {
      if (criterion.verdict !== 'met') {
        lostByCriterion.set(
          criterion.criterionId,
          (lostByCriterion.get(criterion.criterionId) ?? 0) + 1,
        );
      }
    }
  }
  for (const [criterionId, count] of lostByCriterion) {
    if (count / total >= MASS_LOSS_RATIO) {
      out.push({ kind: 'criterion-mass-loss', criterionId, count, total });
    }
  }

  const unlocatable = results.filter((result) =>
    result.criterionResults.some((criterion) => criterion.check === 'unverified'),
  ).length;
  if (unlocatable > 0) {
    out.push({ kind: 'unlocatable-evidence', count: unlocatable, total });
  }

  const gaps: number[] = [];
  for (const result of results) {
    const advocate = advocateScore(result, maxByCriterion);
    if (advocate === null || result.aiTotalScore === null) {
      continue;
    }
    const gap = Math.abs(advocate - result.aiTotalScore);
    if (gap > 0) {
      gaps.push(gap);
    }
  }
  if (gaps.length > 0) {
    const averageGap = gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length;
    out.push({
      kind: 'advocate-dissent',
      count: gaps.length,
      total,
      averageGap: Math.round(averageGap * 100) / 100,
    });
  }

  return out;
}

/**
 * Bốn nhóm của màn Ma trận điều hành.
 *
 * `no-advocate` là nhóm THỨ TƯ, không có trong bản mẫu: bài không có ý kiến
 * phản biện thì KHÔNG tính được khoảng cách, và nhét nó vào `zero` là nói
 * dối — hai lượt không hề đồng thuận, chỉ có một lượt lên tiếng. Nó cũng
 * đúng là nhóm mà luật "giữ điểm lượt chấm" dùng tới.
 */
export type DeltaGroup = 'zero' | 'small' | 'large' | 'no-advocate';

/**
 * MỘT ngưỡng, không phải hai.
 *
 * Ba nhóm có khoảng cách được chia bởi đúng một con số, và đúng 1,5 thuộc
 * nhóm DƯỚI: biên phải nằm ở một phía cố định, không thì một bài lệch đúng
 * ngưỡng rơi vào "cần đọc kỹ" hay không là tuỳ thứ tự hai câu `if`.
 */
export const DELTA_SMALL_MAX = 1.5;

export function deltaGroupOf(
  result: GradingResult,
  maxByCriterion: Map<string, number>,
): DeltaGroup {
  const advocate = advocateScore(result, maxByCriterion);
  if (advocate === null || result.aiTotalScore === null) {
    return 'no-advocate';
  }
  const delta = Math.abs(advocate - result.aiTotalScore);
  if (delta === 0) return 'zero';
  return delta <= DELTA_SMALL_MAX ? 'small' : 'large';
}
