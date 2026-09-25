import { capOf, caseConfidence } from './confidence';
import { DiagnosedError } from './types';

const err = (source: DiagnosedError['source'], deductionHundredths: number | null): DiagnosedError => ({
  ruleKey: `r-${source}-${deductionHundredths}`, criterionKey: 'c', deductionHundredths, source, toolCallIds: ['tc-1'],
});

describe('confidence theo nguồn gốc (§4.2)', () => {
  it('T-SRC-1 — deterministic KHÔNG bị trần bậc model kéo xuống', () => {
    expect(capOf('deterministic', 0.5)).toBe(1);
    expect(caseConfidence([err('deterministic', 300)], { modelCeiling: 0.3, coverageComplete: true })).toBe(1);
  });

  it('T-SRC-2 — llm_only chịu trần 0,5 kể cả khi bậc model khai trần 1; thấp hơn nữa nếu bậc thấp hơn', () => {
    expect(capOf('llm_only', 1)).toBe(0.5);
    expect(capOf('llm_only', 0.3)).toBe(0.3);
    expect(capOf('llm_with_tools', 0.3)).toBe(0.85); // trần bậc model không chạm tới llm_with_tools
  });

  it('T-AUTO-1 (phần số) — 60% mức trừ máy quyết + 40% llm_only → 0,80', () => {
    expect(caseConfidence([err('deterministic', 600), err('llm_only', 400)], { modelCeiling: 1, coverageComplete: true })).toBeCloseTo(0.8);
  });

  it('trung bình có trọng số THEO MỨC TRỪ, không phải giá trị nhỏ nhất', () => {
    const c = caseConfidence([err('deterministic', 300), err('llm_only', 50)], { modelCeiling: 1, coverageComplete: true });
    expect(c).toBeCloseTo((300 * 1 + 50 * 0.5) / 350);
  });

  it('T-CONF-1 — bài không lỗi nào → từ độ phủ, không chia cho 0', () => {
    expect(caseConfidence([], { modelCeiling: 1, coverageComplete: true })).toBe(1);
    expect(caseConfidence([], { modelCeiling: 1, coverageComplete: false })).toBe(0);
  });

  it('lỗi chưa có giá không có trọng số — confidence tính trên phần có giá; chỉ có lỗi chưa giá → như bài không lỗi', () => {
    expect(caseConfidence([err('llm_only', null)], { modelCeiling: 1, coverageComplete: true })).toBe(1);
    expect(caseConfidence([err('deterministic', 300), err('llm_only', null)], { modelCeiling: 1, coverageComplete: true })).toBe(1);
  });
});
