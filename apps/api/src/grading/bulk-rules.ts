import {
  pointsFor,
  type CriterionResult,
  type CriterionVerdict,
} from './ai-provider/ai-grading-provider';
import type { AdvocateOpinion } from './ai-provider/advocate.types';

/**
 * Bốn cách biến một kết quả AI thành một lượt duyệt của giảng viên.
 *
 * File LEAF về nghiệp vụ: chỉ import type và `pointsFor` — bản thân
 * `ai-grading-provider.ts` cũng là leaf, nên không có vòng nào. `pointsFor`
 * được DÙNG LẠI chứ không chép: chép nó là tạo ra đúng thứ sẽ trôi khỏi bản
 * gốc khi ai đó đổi bậc `partially_met`.
 */
export type BulkRule =
  | { kind: 'keep_ai' }
  | { kind: 'apply_advocate' }
  | { kind: 'criterion_full_marks'; criterionId: string }
  | { kind: 'criterion_bonus'; criterionId: string; points: number };

export interface RuleCriterion {
  criterionId: string;
  verdict: CriterionVerdict;
  points: number;
}

export interface RuleInput {
  /**
   * Nguồn sự thật cho "phải có tiêu chí nào" — KHÔNG phải `criterionResults`.
   *
   * `validateAndTotal` ném 400 nếu payload không phủ đủ mọi tiêu chí của
   * rubric. Nếu AI trả thiếu một tiêu chí thì duyệt theo đầu ra AI sinh
   * payload thiếu và làm hỏng CẢ LÔ vì một bài.
   */
  rubricCriteria: { id: string; maxPoints: number }[];
  criterionResults: CriterionResult[];
  advocateOpinion: AdvocateOpinion | null;
}

export type RuleOutcome =
  | { ok: true; criteria: RuleCriterion[] }
  | { ok: false; reason: 'no_advocate' };

/**
 * Nhãn suy TỪ điểm, không ngược lại.
 *
 * `pointsFor()` chỉ có ba bậc, còn chấm thật cần 3/5. `ReviewCriterionDto` đã
 * ghi rõ giảng viên sửa ĐIỂM trực tiếp và `verdict` là nhãn định tính đi kèm,
 * và `validateAndTotal` không kiểm hai thứ khớp nhau.
 */
function verdictForPoints(points: number, maxPoints: number): CriterionVerdict {
  if (points >= maxPoints) return 'met';
  if (points <= 0) return 'not_met';
  return 'partially_met';
}

export function applyRule(rule: BulkRule, input: RuleInput): RuleOutcome {
  if (rule.kind === 'apply_advocate' && !input.advocateOpinion) {
    return { ok: false, reason: 'no_advocate' };
  }

  const byId = new Map(input.criterionResults.map((row) => [row.criterionId, row]));
  const suggested = new Map(
    (input.advocateOpinion?.suggestedVerdicts ?? []).map((s) => [s.criterionId, s.suggestedVerdict]),
  );

  // Duyệt theo RUBRIC, không theo đầu ra AI — xem `RuleInput.rubricCriteria`.
  const criteria = input.rubricCriteria.map<RuleCriterion>((criterion) => {
    // AI không nói gì về tiêu chí này thì coi như chưa đạt: giữ nguyên là
    // lựa chọn duy nhất không tự bịa ra điểm cho sinh viên.
    const aiPoints = byId.get(criterion.id)?.points ?? 0;
    const aiVerdict = byId.get(criterion.id)?.verdict ?? 'not_met';
    const untouched: RuleCriterion = {
      criterionId: criterion.id,
      verdict: aiVerdict,
      points: aiPoints,
    };

    switch (rule.kind) {
      case 'keep_ai':
        return untouched;

      case 'apply_advocate': {
        const verdict = suggested.get(criterion.id);
        if (verdict === undefined) return untouched;

        // MAX theo từng tiêu chí, không ghi đè mù. Đây là thứ mua được bảo
        // đảm "áp kiến nghị phản biện không bao giờ làm tụt điểm", và nó an
        // toàn kể cả khi phản biện lỡ kiến nghị một mức thấp hơn.
        const points = Math.max(aiPoints, pointsFor(verdict, criterion.maxPoints));
        return {
          criterionId: criterion.id,
          verdict: verdictForPoints(points, criterion.maxPoints),
          points,
        };
      }

      case 'criterion_full_marks':
        if (criterion.id !== rule.criterionId) return untouched;
        return { criterionId: criterion.id, verdict: 'met', points: criterion.maxPoints };

      case 'criterion_bonus': {
        if (criterion.id !== rule.criterionId) return untouched;

        // Chặn trần, im lặng. Không chặn thì một bài đã ở điểm tối đa nhận
        // `+2` sẽ vượt `maxPoints` và 400 CẢ LÔ. Nhãn trên màn hình nói ra
        // trần, nên giảng viên không bị bất ngờ.
        const points = Math.min(aiPoints + rule.points, criterion.maxPoints);
        return {
          criterionId: criterion.id,
          verdict: verdictForPoints(points, criterion.maxPoints),
          points,
        };
      }
    }
  });

  return { ok: true, criteria };
}
