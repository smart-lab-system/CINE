import type { QsApproach, QsScoreInput, QsScoreOutput, StepVerdict } from './qs.types';

function toHundredths(points: number): number {
  return Math.round(points * 100);
}

function earnedForVerdict(maxHundredths: number, verdict: StepVerdict): number {
  switch (verdict) {
    case 'met':
      return maxHundredths;
    case 'partially_met':
      return Math.round(maxHundredths / 2);
    case 'not_met':
      return 0;
  }
}

export function approachMaxHundredths(approach: QsApproach): number {
  return approach.steps.reduce((sum, s) => sum + toHundredths(s.maxPoints), 0);
}

/** Mẫu số quy đổi: tổng mark của hướng có tổng cao nhất. */
export function scaleMaxHundredths(approaches: QsApproach[]): number {
  if (approaches.length === 0) return 0;
  return Math.max(...approaches.map(approachMaxHundredths));
}

/**
 * Điểm QS: chỉ checklist của **một** hướng đã chọn. Quy đổi:
 *   score = earned / M × problemPoints
 * với M = max(tổng mark mọi hướng). Không dùng tổng mark của riêng hướng đang chấm làm mẫu số.
 */
export function scoreQs(input: QsScoreInput): QsScoreOutput {
  const approach = input.approaches.find((a) => a.key === input.selectedApproachKey);
  if (!approach) {
    throw new Error(`hướng QS "${input.selectedApproachKey}" không có trong rubric`);
  }
  if (approach.steps.length === 0) {
    throw new Error(`hướng QS "${approach.key}" không có bước checklist`);
  }

  const byStep = new Map(input.stepResults.map((r) => [r.stepKey, r.verdict]));
  const perStep = approach.steps.map((step) => {
    const maxHundredths = toHundredths(step.maxPoints);
    const verdict = byStep.get(step.key) ?? 'not_met';
    return {
      stepKey: step.key,
      maxHundredths,
      earnedHundredths: earnedForVerdict(maxHundredths, verdict),
      verdict,
    };
  });

  const approachMax = perStep.reduce((s, p) => s + p.maxHundredths, 0);
  const earned = perStep.reduce((s, p) => s + p.earnedHundredths, 0);
  const scaleMax = scaleMaxHundredths(input.approaches);
  const problemPoints = input.problemPointsHundredths ?? scaleMax;
  const scoreHundredths =
    scaleMax === 0 ? 0 : Math.round((earned / scaleMax) * problemPoints);

  return {
    selectedApproachKey: approach.key,
    approachMaxHundredths: approachMax,
    scaleMaxHundredths: scaleMax,
    earnedHundredths: earned,
    scoreHundredths,
    problemPointsHundredths: problemPoints,
    perStep,
  };
}
