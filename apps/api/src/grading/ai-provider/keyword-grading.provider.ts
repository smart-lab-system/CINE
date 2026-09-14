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
          // RỖNG, không phải một câu giải thích: chuỗi rỗng là tín hiệu
          // hợp lệ ("sinh viên không đề cập"), còn một câu giải thích
          // không nằm trong bài làm sẽ bị guard verbatim đánh là không
          // định vị được — đúng một cách vô ích, vì nó vốn không phải
          // trích dẫn.
          evidence: '',
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
        // TRÍCH NGUYÊN VĂN quanh từ khoá đầu tiên tìm được, không phải mô
        // tả về việc tìm thấy gì.
        //
        // Provider này là hàng thay thế trong lúc phát triển, nên nó phải
        // tôn trọng ĐÚNG hợp đồng mà provider thật tôn trọng — trong đó có
        // guard verbatim (`harness/evidence-check.ts`), vốn đòi dẫn chứng
        // phải định vị được trong bài làm. Một mô tả kiểu "tìm thấy 3/4 từ
        // khoá" không định vị được, nên nó sẽ bị đánh `unverified` và mọi
        // bài chấm bằng provider này đều rơi vào nhánh "không tin được" —
        // biến môi trường dev thành một thứ không chạy giống production.
        evidence: found.length > 0 ? excerptAround(request.content, found[0]) : '',
      };
    });

    const totalScore = criterionResults.reduce((sum, result) => sum + result.points, 0);

    return {
      modelUsed: this.name,
      criterionResults,
      totalScore: Math.round(totalScore * 100) / 100,
      // Trần thấp có chủ đích. Đối sánh từ khoá là bằng chứng một chủ đề
      // ĐƯỢC NHẮC TỚI, không bao giờ là bằng chứng nó được TRẢ LỜI ĐÚNG —
      // nên không gì provider này sinh ra được phép vượt ngưỡng tự duyệt,
      // kể cả khi mọi guard cơ học đều sạch.
      confidenceCeiling: unreadable ? 0 : 0.2,
      // Số 0 ở đây là SỰ THẬT, không phải chỗ trống chờ điền: provider này
      // chạy cục bộ bằng đếm từ và không gọi API nào. Một lượt chấm bằng nó
      // tốn đúng 0 token, và dashboard chi phí phải đọc được điều đó.
      usage: {
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
      },
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

/**
 * Trích một đoạn NGUYÊN VĂN quanh vị trí từ khoá khớp.
 *
 * Phải trả về text gốc chứ không phải text đã chuẩn hoá: guard verbatim
 * đối chiếu vào bài làm THẬT, nên một đoạn đã bỏ dấu sẽ không định vị được.
 *
 * Tìm trên bản chuẩn hoá (để khớp được "trinh bay" với "trình bày") rồi
 * cắt theo ĐÚNG chỉ số đó trên bản gốc — hai chuỗi có cùng độ dài vì
 * `normalize` chỉ thay ký tự, không thêm bớt.
 */
function excerptAround(original: string, keyword: string, radius = 60): string {
  const at = normalize(original).indexOf(keyword);
  if (at === -1) {
    return '';
  }
  const start = Math.max(0, at - radius);
  const end = Math.min(original.length, at + keyword.length + radius);
  return original.slice(start, end).trim();
}
