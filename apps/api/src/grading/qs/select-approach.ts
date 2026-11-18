import { approachMaxHundredths, scoreQs } from './score-qs';
import type { QsApproach, QsStepResult } from './qs.types';

export interface ApproachCandidate {
  approachKey: string;
  /** Điểm earned trên hướng đó (hundredths), trước khi quy về điểm câu. */
  earnedHundredths: number;
  approachMaxHundredths: number;
}

/**
 * Chọn hướng thắng: earned cao nhất; hòa thì approach đứng trước trong danh sách.
 * Dùng khi đã có (hoặc ước lượng) verdict từng bước cho mọi hướng.
 */
export function selectWinningApproach(
  approaches: QsApproach[],
  resultsByApproach: Map<string, QsStepResult[]>,
): { selectedApproachKey: string; candidates: ApproachCandidate[] } {
  if (approaches.length === 0) {
    throw new Error('QS rubric không có hướng nào');
  }

  const candidates: ApproachCandidate[] = approaches.map((a) => {
    const stepResults = resultsByApproach.get(a.key) ?? [];
    const scored = scoreQs({
      approaches: [a],
      selectedApproachKey: a.key,
      stepResults,
    });
    return {
      approachKey: a.key,
      earnedHundredths: scored.earnedHundredths,
      approachMaxHundredths: approachMaxHundredths(a),
    };
  });

  let best = candidates[0];
  for (const c of candidates.slice(1)) {
    if (c.earnedHundredths > best.earnedHundredths) best = c;
  }

  return { selectedApproachKey: best.approachKey, candidates };
}

/**
 * Khi AI (hoặc người) đã chỉ định hướng — chỉ kiểm key hợp lệ.
 * Rubric QA không gọi hàm này.
 */
export function assertApproachKey(approaches: QsApproach[], key: string): string {
  if (!approaches.some((a) => a.key === key)) {
    throw new Error(`hướng QS "${key}" không hợp lệ`);
  }
  return key;
}
