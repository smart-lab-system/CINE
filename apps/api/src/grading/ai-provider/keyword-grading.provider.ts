import { Injectable } from '@nestjs/common';
import {
  AIGradingProvider,
  CriterionResult,
  CriterionVerdict,
  GradingOutcome,
  GradingRequest,
  pointsFor,
} from './ai-grading-provider';

/**
 * The provider that runs when no model is configured.
 *
 * It is NOT a pretend model and does not want to be mistaken for one — it
 * reports itself as `keyword-match@1`, so a grading result graded by it says
 * so on its face and a calibration run can exclude it. What it does is
 * mechanical: look for the criterion's own distinctive words in the
 * submission, and say how much of the criterion the text appears to touch.
 *
 * It exists for two reasons. The whole pipeline — trigger, extract, grade,
 * decide, review — has to be runnable and testable without an API key or a
 * network, and a capstone demo has to work in a room with no internet. It
 * is deliberately crude, and its confidence is low enough that everything
 * it grades lands in front of a teacher rather than being auto-approved.
 */
@Injectable()
export class KeywordGradingProvider implements AIGradingProvider {
  readonly name = 'keyword-match@1';

  /**
   * Words too common to be evidence of anything. Vietnamese and English
   * function words, since rubric text is written in both.
   */
  private static readonly STOPWORDS = new Set([
    'the', 'and', 'for', 'with', 'that', 'this', 'from', 'has', 'have', 'are',
    'was', 'were', 'not', 'but', 'all', 'any', 'can', 'must', 'should', 'when',
    'which', 'their', 'there', 'they', 'you', 'your', 'its',
    'va', 'cua', 'cho', 'voi', 'mot', 'cac', 'nhung', 'duoc', 'phai', 'khi',
    'trong', 'theo', 'tren', 'nhu', 'hoac', 'neu', 'thi', 'la', 'co', 'khong',
  ]);

  async grade(request: GradingRequest): Promise<GradingOutcome> {
    const haystack = normalize(request.content);

    // Nothing could be read out of the file. Scoring zero here would be a
    // lie about the student's work; the honest output is no score and no
    // confidence, which sends it straight to a human.
    const unreadable = haystack.trim() === '';

    const criterionResults: CriterionResult[] = request.criteria.map((criterion) => {
      const keywords = this.keywordsOf(criterion.description);
      if (unreadable || keywords.length === 0) {
        return {
          criterionId: criterion.id,
          verdict: 'not_met' as CriterionVerdict,
          points: 0,
          evidence: unreadable
            ? 'Không đọc được nội dung bài làm — cần giảng viên chấm tay.'
            : 'Tiêu chí không có từ khoá đủ đặc trưng để đối chiếu tự động.',
        };
      }

      const found = keywords.filter((word) => haystack.includes(word));
      const ratio = found.length / keywords.length;
      const verdict: CriterionVerdict =
        ratio >= 0.75 ? 'met' : ratio > 0 ? 'partially_met' : 'not_met';

      return {
        criterionId: criterion.id,
        verdict,
        points: pointsFor(verdict, criterion.maxPoints),
        evidence:
          found.length > 0
            ? `Tìm thấy trong bài: ${found.slice(0, 6).join(', ')} (${found.length}/${keywords.length} từ khoá).`
            : `Không tìm thấy từ khoá nào của tiêu chí: ${keywords.slice(0, 6).join(', ')}.`,
      };
    });

    const totalScore = criterionResults.reduce((sum, result) => sum + result.points, 0);

    return {
      modelUsed: this.name,
      criterionResults,
      totalScore: Math.round(totalScore * 100) / 100,
      // Capped low on purpose. Word overlap is evidence that a topic was
      // mentioned, never that it was answered correctly, so nothing this
      // provider produces should clear an auto-approval threshold.
      confidence: unreadable ? 0 : 0.2,
    };
  }

  private keywordsOf(description: string): string[] {
    return Array.from(
      new Set(
        normalize(description)
          .split(/\s+/)
          .filter(
            (word) => word.length >= 4 && !KeywordGradingProvider.STOPWORDS.has(word),
          ),
      ),
    );
  }
}

/**
 * Lowercased, diacritics dropped, punctuation flattened to spaces.
 *
 * Dropping diacritics is what makes "trình bày" in a rubric match "trinh
 * bay" typed without them — a real and constant difference between how a
 * lecturer writes a criterion and how a student types at speed.
 */
function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ');
}
