/** Một bước checklist trong một hướng QS (mark của dataset DSA). */
export interface QsStep {
  key: string;
  description: string;
  /** Điểm bước — cùng đơn vị điểm thập phân như rubric criterion (không phải hundredths). */
  maxPoints: number;
}

/** Một hướng làm (Solution N trong rubric.txt). */
export interface QsApproach {
  key: string;
  name: string;
  steps: QsStep[];
}

export type StepVerdict = 'met' | 'partially_met' | 'not_met';

export interface QsStepResult {
  stepKey: string;
  verdict: StepVerdict;
}

export interface QsScoreInput {
  approaches: QsApproach[];
  /** Hướng đã chọn; phải thuộc `approaches`. */
  selectedApproachKey: string;
  stepResults: QsStepResult[];
  /**
   * Điểm tối đa của câu (hundredths). Nếu bỏ trống = M
   * (max tổng mark mọi hướng).
   */
  problemPointsHundredths?: number;
}

export interface QsScoreOutput {
  selectedApproachKey: string;
  /** Tổng mark của hướng đang chấm. */
  approachMaxHundredths: number;
  /** Mẫu số quy đổi = max tổng mark mọi hướng. */
  scaleMaxHundredths: number;
  earnedHundredths: number;
  /** Điểm quy về thang câu: earned / scaleMax × problemPoints. */
  scoreHundredths: number;
  problemPointsHundredths: number;
  perStep: {
    stepKey: string;
    maxHundredths: number;
    earnedHundredths: number;
    verdict: StepVerdict;
  }[];
}
