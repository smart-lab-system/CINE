import { capOf, caseConfidence, confidenceTerms } from './confidence';
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

describe('confidenceTerms — bảng đóng góp của bài (E1, §5.8)', () => {
  const named = (ruleKey: string, source: DiagnosedError['source'], deductionHundredths: number | null): DiagnosedError => ({
    ruleKey, criterionKey: 'c', deductionHundredths, source, toolCallIds: [],
  });

  it('HS2410018: bốn lỗi có giá → bốn dòng với trần theo nguồn; trung bình từ các dòng bằng caseConfidence (≈ 0,714)', () => {
    const errors = [
      named('sai_ca_bien', 'deterministic', 150),
      named('ro_ri_bo_nho', 'llm_only', 100),
      named('ten_bien_vo_nghia', 'llm_only', 50),
      named('thieu_chu_thich', 'llm_only', 50),
    ];
    const terms = confidenceTerms(errors, 1);
    expect(terms.map((t) => [t.ruleKey, t.cap, t.deductionHundredths])).toEqual([
      ['sai_ca_bien', 1, 150],
      ['ro_ri_bo_nho', 0.5, 100],
      ['ten_bien_vo_nghia', 0.5, 50],
      ['thieu_chu_thich', 0.5, 50],
    ]);
    const fromTerms = terms.reduce((s, t) => s + t.cap * t.deductionHundredths, 0) / terms.reduce((s, t) => s + t.deductionHundredths, 0);
    expect(fromTerms).toBeCloseTo(caseConfidence(errors, { modelCeiling: 1, coverageComplete: true }));
    expect(fromTerms).toBeCloseTo(0.714, 3);
  });

  it('lỗi chưa có giá hoặc mức trừ 0 không vào bảng', () => {
    const terms = confidenceTerms([named('chua_gia', 'llm_only', null), named('mien_phi', 'deterministic', 0), named('co_gia', 'deterministic', 100)], 1);
    expect(terms.map((t) => t.ruleKey)).toEqual(['co_gia']);
  });

  it('trần bậc model kéo llm_only xuống trong bảng, như trong caseConfidence', () => {
    expect(confidenceTerms([named('r', 'llm_only', 100)], 0.3)[0].cap).toBe(0.3);
  });

  it('không có lỗi nào có giá → bảng rỗng', () => {
    expect(confidenceTerms([], 1)).toEqual([]);
  });
});
