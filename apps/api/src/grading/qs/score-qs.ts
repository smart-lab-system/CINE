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

/**
 * Điểm QS: chỉ checklist của hướng thắng. Công thức:
 *   score = earned / approachMax × problemPoints
 * (làm tròn hundredths). Không đụng các hướng khác.
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
  const problemPoints = input.problemPointsHundredths ?? approachMax;
  const scoreHundredths =
    approachMax === 0 ? 0 : Math.round((earned / approachMax) * problemPoints);

  return {
    selectedApproachKey: approach.key,
    approachMaxHundredths: approachMax,
    earnedHundredths: earned,
    scoreHundredths,
    problemPointsHundredths: problemPoints,
    perStep,
  };
}
