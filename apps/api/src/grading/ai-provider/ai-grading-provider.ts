/**
 * The one seam every grading model sits behind.
 *
 * CLAUDE.md is explicit that business logic must never call a specific SDK:
 * the project uses more than one provider (Claude for prose and images,
 * Codex for code review), compares them, and tracks cost per provider. None
 * of that is possible if `GradingService` imports `@anthropic-ai/sdk`.
 *
 * So the service depends on this interface and nothing else, and which
 * implementation it gets is a module wiring decision.
 */

/**
 * A near-binary verdict per criterion, not a continuous score.
 *
 * This is a research finding, not a style preference: asking a model
 * "met / partially met / not met, and show the evidence" agrees with human
 * graders substantially better than asking it for a number out of ten. The
 * number is then derived from the verdict, here, in code that always
 * derives it the same way.
 */
export type CriterionVerdict = 'met' | 'partially_met' | 'not_met';

export interface CriterionResult {
  criterionId: string;
  verdict: CriterionVerdict;
  /** Derived from the verdict and the criterion's maxPoints, never invented. */
  points: number;
  /**
   * Why. A score with no evidence is unreviewable — the teacher's job at
   * the end of this is to check the reasoning, and there is nothing to
   * check if the model only returned a number.
   */
  evidence: string;
}

export interface GradingRubricCriterion {
  id: string;
  description: string;
  maxPoints: number;
}

export interface GradingRequest {
  studentMssv: string;
  /** Extracted text. Empty when nothing could be read out of the file. */
  content: string;
  /** What kind of file it came from, for providers that care. */
  deliverableType: string;
  criteria: GradingRubricCriterion[];
}

/**
 * Token đã dùng cho một lượt chấm.
 *
 * Spec này chỉ GHI LOG; lưu vào đâu là việc của module admin. Nhưng nếu
 * provider NUỐT MẤT con số này thì không ai lấy lại được —
 * `CalibrationRun.cost_usd` và dashboard chi phí AI đều mất nguồn vĩnh
 * viễn, và cả hai đều đã nằm trong schema chờ dữ liệu.
 *
 * `cacheReadTokens > 0` cũng là BẰNG CHỨNG DUY NHẤT rằng prompt caching có
 * tác dụng thật, thay vì chỉ là một câu trong báo cáo.
 */
export interface GradingUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
}

export interface GradingOutcome {
  /**
   * What actually did the grading, named precisely enough to audit later —
   * a model id, or the name of the local rule set. Never a friendly label:
   * a calibration run comparing "AI" against humans is meaningless if
   * nobody can say which AI.
   */
  modelUsed: string;
  criterionResults: CriterionResult[];
  totalScore: number;
  /**
   * TRẦN tin cậy mà CƠ CHẾ của provider này có thể biện minh — không phải
   * một phán đoán về bài nộp cụ thể.
   *
   * Đây là thuộc tính của phương pháp, không phải của bài làm. Đối sánh từ
   * khoá không bao giờ biện minh nổi một điểm số tự duyệt, dù nó khớp
   * 100% từ khoá, nên trần của nó thấp. Một model mạnh đọc hiểu bài và
   * trích được dẫn chứng thì trần là 1.
   *
   * `confidence` THẬT do `applyGuards` tính từ các phép đo cơ học, rồi bị
   * kẹp xuống dưới trần này. Guard chỉ được HẠ, không được NÂNG: một phép
   * đo cơ học sạch không biến việc đếm từ thành việc hiểu bài.
   */
  confidenceCeiling: number;
  usage: GradingUsage;
}

export interface AIGradingProvider {
  readonly name: string;
  grade(request: GradingRequest): Promise<GradingOutcome>;
}

/** Nest injection token — an interface has no runtime identity of its own. */
export const AI_GRADING_PROVIDER = Symbol('AI_GRADING_PROVIDER');

/**
 * Tính lại ĐIỂM và TỔNG từ verdict, bỏ qua mọi con số provider trả về.
 *
 * Vì sao tồn tại: comment trên `CriterionResult.points` tuyên bố nó "never
 * invented", nhưng `pointsFor()` trước đây chỉ được gọi BÊN TRONG
 * `KeywordGradingProvider` — tức mỗi provider tự nguyện tuân thủ. Một model
 * thật trả `verdict: 'not_met'` kèm `points: 10` là chuyện sẽ xảy ra (model
 * làm số học kém, và verdict/points lệch nhau là lỗi phổ biến), và không có
 * hàm này thì con số đó đi thẳng vào bảng điểm của sinh viên.
 *
 * Ranh giới: **model phán đoán, code đếm.** `verdict` và `evidence` là phần
 * model được quyết và không bị đụng tới — sửa chúng ở đây sẽ làm bằng chứng
 * và điểm nói hai điều khác nhau.
 */
export function enforceScoring(
  criterionResults: CriterionResult[],
  criteria: GradingRubricCriterion[],
): {
  criterionResults: CriterionResult[];
  totalScore: number;
  /**
   * Tiêu chí model trả về mà rubric không có.
   *
   * Trả ra thay vì nuốt: cho 0 điểm là hướng AN TOÀN, nhưng an-toàn-và-im-
   * lặng vẫn là lỗi trong một hệ thống lấy "fail loudly" làm nguyên tắc.
   * Guard coverage (G3) sẽ là chỗ xử lý chính thức; tới lúc đó người gọi
   * ít nhất phải ghi được một dòng log.
   */
  unknownCriterionIds: string[];
} {
  const maxByCriterion = new Map(criteria.map((c) => [c.id, Number(c.maxPoints)]));
  const unknownCriterionIds: string[] = [];
  const enforced = criterionResults.map((row) => {
    const maxPoints = maxByCriterion.get(row.criterionId);
    if (maxPoints === undefined) {
      // Không ném: ném ở đây sẽ mất luôn những tiêu chí hợp lệ khác trong
      // cùng lượt chấm. Ghi lại để người gọi báo cáo.
      unknownCriterionIds.push(row.criterionId);
    }
    return { ...row, points: pointsFor(row.verdict, maxPoints ?? 0) };
  });
  return {
    criterionResults: enforced,
    totalScore: enforced.reduce((sum, row) => sum + row.points, 0),
    unknownCriterionIds,
  };
}

/** Points for a verdict. One place, so two providers cannot disagree. */
export function pointsFor(verdict: CriterionVerdict, maxPoints: number): number {
  switch (verdict) {
    case 'met':
      return maxPoints;
    case 'partially_met':
      // Half, and deliberately not configurable yet: a per-criterion
      // partial weight is a rubric design question, and inventing one here
      // would put grading policy in a helper function.
      return Math.round(maxPoints * 50) / 100;
    case 'not_met':
      return 0;
  }
}
