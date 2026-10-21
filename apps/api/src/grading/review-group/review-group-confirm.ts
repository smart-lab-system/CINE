/** Lý do một bài không được xác nhận hàng loạt (spec duyệt nhanh 2026-10-21 §5.4). Bài bị bỏ không đổi gì. */
export type ConfirmSkipReason = 'not_flagged' | 'has_manual' | 'ungradable' | 'no_computation' | 'not_investigator';

export interface ConfirmOutcome {
  confirmed: number;
  /** Theo thứ tự id bài tăng dần. */
  skipped: { resultId: string; reason: ConfirmSkipReason }[];
}

/** Trạng thái của MỘT bài, đọc SAU khi đã khoá giảng viên và khoá dòng. */
export interface ConfirmCandidate {
  status: string;
  pipeline: string;
  ungradableClass: string | null;
  hasManualScore: boolean;
  /** Lượt tính mới nhất (`latestComputationRow`); `null` = bài chưa có lượt tính nào. */
  latestComputation: { id: string; score: string | null } | null;
  /** Bài có trong nhóm vừa dựng lại cho khoá được gửi. */
  inGroup: boolean;
}

export type ConfirmVerdict =
  | { kind: 'confirm'; computationId: string }
  | { kind: 'skip'; reason: ConfirmSkipReason }
  /** Đủ điều kiện xác nhận nhưng thuộc nhóm KHÁC: người gọi từ chối cả lô, không bỏ qua một mình bài này. */
  | { kind: 'other_group' };

const skip = (reason: ConfirmSkipReason): ConfirmVerdict => ({ kind: 'skip', reason });

/**
 * Bài này có được xác nhận không. Hàm thuần; thứ tự kiểm là thứ tự lý do được báo khi một bài vướng nhiều lý do:
 *
 * 1. Trạng thái trước: chỉ `flagged_for_review` mới có chỗ để xác nhận. Bài đã duyệt, đã chốt hay đang kiểm mẫu đều
 *    `not_flagged` — kể cả bài đã chấm tay (thường đã `teacher_reviewed`).
 * 2. `not_investigator`: bài một-phát không có lượt tính để trỏ tới.
 * 3. `has_manual`: chấm tay khoá bài khỏi mọi lượt tính lại (§2.2); chấp nhận "điểm của hệ thống" lên trên đó là ghi
 *    một quyết định trái với điểm hiện tại của bài.
 * 4. `ungradable`: lớp không chấm được, hoặc lượt tính mới nhất dưới sàn (điểm null) — `system_confirm` đòi điểm.
 * 5. `no_computation`: không có lượt tính nào để trỏ `confirmed_computation_id` tới.
 *
 * Qua đủ năm cửa mà không thuộc nhóm thì bài nằm ở một nhóm khác của phiên: `other_group`.
 */
export function confirmVerdict(c: ConfirmCandidate): ConfirmVerdict {
  if (c.status !== 'flagged_for_review') return skip('not_flagged');
  if (c.pipeline !== 'investigator') return skip('not_investigator');
  if (c.hasManualScore) return skip('has_manual');
  if (c.ungradableClass !== null) return skip('ungradable');
  if (c.latestComputation === null) return skip('no_computation');
  if (c.latestComputation.score === null) return skip('ungradable');
  if (!c.inGroup) return { kind: 'other_group' };
  return { kind: 'confirm', computationId: c.latestComputation.id };
}
