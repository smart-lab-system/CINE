import type { GradingPipeline } from './grading-model.types';
import type { ResultDetail } from './scoring/result-detail';

/**
 * Giấu điểm và lỗi của hệ thống khỏi một bài `audit_pending` (parent spec §8.1 luật 2) — Ở TẦNG API, không chỉ ở
 * tầng hiển thị. Hai hàm THUẦN, mỗi endpoint đi qua đúng một chỗ để không ai quên được.
 *
 * Nhận xét được ghi thì bài rời `audit_pending` (sang `teacher_reviewed`) và các trường này hiện lại như mọi
 * bài — đó là lúc che mù kết thúc.
 */
export interface BlindableRow {
  status: string;
  aiTotalScore: number | null;
  confidence: number | null;
  criterionResults: unknown[];
  advocateOpinion: unknown;
  finalScore: number | null;
  currentScore: number | null;
  currentScoreSource: string;
  triage: unknown;
}

export function blindAuditRow<T extends BlindableRow>(row: T): T {
  if (row.status !== 'audit_pending') return row;
  return {
    ...row,
    aiTotalScore: null,
    confidence: null,
    criterionResults: [],
    advocateOpinion: null,
    finalScore: null,
    currentScore: null,
    currentScoreSource: 'none',
    triage: null,
  };
}

/**
 * Bản hồ sơ MÙ, dựng sẵn — `loadResultDetail` trả nó NGAY ĐẦU hàm, trước khi đọc bất kỳ dòng tính điểm hay lượt
 * chấm nào. Không đọc thì không thể rò.
 */
export function blindResultDetail(result: { pipeline: GradingPipeline; status: string }): ResultDetail {
  return {
    pipeline: result.pipeline,
    currentScore: null,
    currentScoreSource: 'none',
    status: result.status,
    ungradableClass: null,
    ungradableReason: null,
    breakdown: null,
    investigation: null,
    challengeNotes: [],
    challengeVerdicts: [],
    // Task 13 (E1): mọi trường mới đều rỗng — bài chưa được duyệt không lộ bảng đóng góp, độ khớp hay gói test.
    confidenceTerms: [],
    noErrorAgreement: { n: 0, disagreements: 0, paused: false },
    testBundle: null,
  };
}
