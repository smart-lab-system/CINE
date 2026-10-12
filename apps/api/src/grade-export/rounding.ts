import { ROUNDING_STEPS } from './grade-export.types';

/**
 * Làm tròn NỬA LÊN với bước `step` phần trăm điểm, bằng số nguyên: `⌊(2v + s) / 2s⌋ × s` (parent §13.2).
 * Chỉ lúc ghi ra file; trong hệ thống điểm không bao giờ bị làm tròn (§13.1 luật 7).
 */
export function roundHalfUp(hundredths: number, step: number): number {
  if (!Number.isInteger(hundredths) || hundredths < 0) throw new RangeError(`${hundredths} không phải số nguyên phần trăm điểm hợp lệ`);
  if (!(ROUNDING_STEPS as readonly number[]).includes(step)) throw new RangeError(`bước làm tròn ${step} không hợp lệ`);
  return Math.floor((2 * hundredths + step) / (2 * step)) * step;
}
