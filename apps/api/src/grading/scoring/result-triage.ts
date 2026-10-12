import type { GradingPipeline } from '../grading-model.types';
import type { ScoreBreakdown } from './score-core';

/**
 * Tóm tắt bảng lỗi của MỘT bài cho danh sách bài (G1 §2): đủ để vẽ cột "vì sao cần bạn", cột số lỗi và dòng đòn bẩy
 * mà không phải tải hồ sơ từng bài.
 *
 * `null` = không có bảng lỗi để tóm tắt: bài tự luận, bài chưa có lượt tính nào, hay bài không chấm được. Giao diện
 * không cần `triage` để phân biệt ba ca đó — nó đã đọc `pipeline`, `status` và `ungradableReason` trên cùng dòng.
 */
export interface ResultTriage {
  caseFlags: { code: string; detail: string }[];
  errorFlags: { ruleKey: string; code: string }[];
  counts: { counted: number; unpriced: number; refuted: number; excluded: number };
}

export function triageOf(input: {
  pipeline: GradingPipeline;
  ungradableClass: string | null;
  breakdown: ScoreBreakdown | null;
}): ResultTriage | null {
  const { pipeline, ungradableClass, breakdown } = input;
  if (pipeline !== 'investigator' || breakdown === null) return null;
  // Lượt tính dưới sàn có `errors: []` và `ungradable` khác null — "không lỗi nào" ở đây là một lời nói dối.
  if (ungradableClass !== null || breakdown.ungradable !== null) return null;
  const counts = { counted: 0, unpriced: 0, refuted: 0, excluded: 0 };
  for (const e of breakdown.errors) counts[e.counted] += 1;
  return {
    caseFlags: breakdown.caseFlags.map((f) => ({ code: f.code, detail: f.detail })),
    errorFlags: breakdown.errorFlags.map((f) => ({ ruleKey: f.ruleKey, code: f.code })),
    counts,
  };
}
