import {
  AIGradingProvider,
  CriterionResult,
  enforceScoring,
  GradingOutcome,
  GradingRequest,
} from './ai-provider/ai-grading-provider';
import { applyGuards, GuardOutcome } from './harness/grading-guards';
import { AUTO_APPROVE_CONFIDENCE } from './grading.types';

export interface OneShotResult {
  outcome: GradingOutcome;
  guards: GuardOutcome;
  retried: boolean;
  firstGuardsReason: string | null;
  finalConfidence: number;
  scored: { criterionResults: CriterionResult[]; totalScore: number; unknownCriterionIds: string[] };
  confident: boolean;
}

/**
 * Lõi thuần của đường chấm một-phát — gọi, guard, chấm lại tối đa MỘT lần,
 * trần confidence, ép điểm, quyết tự duyệt.
 *
 * Tách khỏi `gradeOne` để runner eval (spec 2026-09-20 §9 bước 0) đo ĐÚNG
 * đường đang chạy mà không cần DB. Không ghi gì, không log gì: người gọi
 * quyết định ghi và log — `gradeOne` ghi vào `grading_result`, runner ghi ra
 * file.
 */
export async function gradeOneShot(
  provider: AIGradingProvider,
  request: GradingRequest,
): Promise<OneShotResult> {
  const guard = (o: GradingOutcome) =>
    applyGuards({
      studentText: request.content,
      criteria: request.criteria,
      criterionResults: o.criterionResults,
    });

  let outcome = await provider.grade(request);
  let guards = guard(outcome);
  let retried = false;
  let firstGuardsReason: string | null = null;

  // Chấm lại ĐÚNG MỘT lần (spec 2026-09-14 §6.4).
  //
  // Vì sao đúng một lần: chấm lại vô hạn thì tốn tiền và có thể trượt
  // tiếp; đẩy thẳng cho giảng viên thì trung thực nhưng nếu model hay
  // trượt thì họ ngập bài flag. Một lần là điểm cân bằng, và số lần
  // trượt được người gọi ghi log để có dữ liệu THẬT về tần suất.
  if (guards.runUntrustworthy) {
    retried = true;
    firstGuardsReason = guards.reason;
    outcome = await provider.grade(request);
    guards = guard(outcome);
  }

  // Guard chỉ được HẠ tin cậy, không được NÂNG quá trần mà cơ chế của
  // provider biện minh nổi.
  const finalConfidence = Math.min(guards.confidence, outcome.confidenceCeiling);
  // ĐIỂM DO SERVER TÍNH. Provider chỉ được phép phán đoán (`verdict` +
  // `evidence`); mọi con số đều tính lại ở đây.
  const scored = enforceScoring(outcome.criterionResults, request.criteria);
  // `AUTO_APPROVE_CONFIDENCE` là lớp chặn thứ hai: guard có thể trả
  // `auto_approved` với một confidence dưới ngưỡng nếu ai đó chỉnh số ở
  // `grading-guards.ts` mà quên chỗ này.
  const confident =
    guards.status === 'auto_approved' && finalConfidence >= AUTO_APPROVE_CONFIDENCE;

  return { outcome, guards, retried, firstGuardsReason, finalConfidence, scored, confident };
}
