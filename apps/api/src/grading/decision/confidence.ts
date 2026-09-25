import { DiagnosedError, VerdictSource } from './types';

/** Trần confidence theo NGUỒN GỐC, không theo bậc model (§4.2). */
export const SOURCE_CAP: Record<VerdictSource, number> = {
  deterministic: 1,
  llm_with_tools: 0.85,
  llm_only: 0.5,
};

/**
 * Trần bậc model chỉ kéo được `llm_only` xuống (§4.2): lấy nó làm trần của hai nguồn còn lại thì
 * một provider khai trần 1 làm "chỉ mô hình" được tin HƠN "mô hình + công cụ".
 */
export function capOf(source: VerdictSource, modelCeiling: number): number {
  return source === 'llm_only' ? Math.min(SOURCE_CAP.llm_only, modelCeiling) : SOURCE_CAP[source];
}

/**
 * Trung bình có trọng số theo MỨC TRỪ (§4.2). Không có lỗi nào có giá → trọng số 0: confidence
 * đến từ độ phủ của cuộc điều tra — 1,0 khi mọi điều kiện độ phủ của sàn qua (T-CONF-1). Điều
 * kiện độ phủ trượt thì bài đã bị gắn cờ bởi chính điều kiện đó; 0 ở đây chỉ để không ai đọc nhầm.
 */
export function caseConfidence(errors: DiagnosedError[], opts: { modelCeiling: number; coverageComplete: boolean }): number {
  const priced = errors.filter((e) => e.deductionHundredths !== null && e.deductionHundredths > 0);
  const weight = priced.reduce((s, e) => s + e.deductionHundredths!, 0);
  if (weight === 0) return opts.coverageComplete ? 1 : 0;
  return priced.reduce((s, e) => s + capOf(e.source, opts.modelCeiling) * e.deductionHundredths!, 0) / weight;
}
