import { apiClient } from '@/lib/api-client';
import { apiStatusFailure } from '@/lib/api/error';

/** Loại nhóm: đúng một quy tắc lỗi, từ hai quy tắc trở lên, không lỗi nào (spec duyệt nhanh 2026-10-21 §5.4). */
export type ReviewGroupKind = 'single' | 'multi' | 'none';

/** Mirrors ReviewGroup (apps/api/src/grading/review-group/review-group.types.ts). */
export interface ReviewGroup {
  /**
   * `${rubricVersionId}:${ruleId}` với nhóm `single`; `'multi'` hoặc `'none'` với hai nhóm còn lại. Gửi lại NGUYÊN
   * VĂN khi duyệt — server dựng lại nhóm rồi so khoá, không tách chuỗi.
   */
  key: string;
  /** Tên quy tắc (bản sửa hiện hành); nhóm `multi`/`none` mang chính khoá của nó. */
  label: string;
  description: string | null;
  /** Nguồn của các lỗi trong nhóm (`deterministic`, `llm_with_tools`, `llm_only`), không trùng. Rỗng với `none`. */
  sources: string[];
  kind: ReviewGroupKind;
  ruleId: string | null;
  /** Id bài, tăng dần. */
  resultIds: string[];
  /** Tối đa 3 bài mẫu: ba id đầu của `resultIds`. */
  sampleResultIds: string[];
}

/** Mirrors ConfirmSkipReason (apps/api/src/grading/review-group/review-group-confirm.ts). */
export type ConfirmSkipReason = 'not_flagged' | 'has_manual' | 'ungradable' | 'no_computation' | 'not_investigator';

/** Mirrors ConfirmOutcome — kết quả một lần duyệt nhóm. Bài bị bỏ qua không đổi gì. */
export interface ConfirmOutcome {
  confirmed: number;
  skipped: { resultId: string; reason: ConfirmSkipReason }[];
}

/** Mirrors OpenAutoBreaker (apps/api/src/grading/auto-breaker/auto-breaker.service.ts) — một phạm vi đang tạm dừng tự chốt. */
export interface OpenAutoBreaker {
  id: string;
  scope: 'rule' | 'no_error';
  ruleId: string | null;
  /** `null` với `no_error`, và với quy tắc không còn dòng trong Bảng lỗi. */
  ruleKey: string | null;
  trippedAt: string;
  /** Số bài kiểm tra ngẫu nhiên đã đếm LÚC TẠM DỪNG. */
  n: number;
  /** Trong `n`, số bài giảng viên không đồng ý với hệ thống. */
  disagreements: number;
}

/**
 * Bài bị gắn cờ của phiên, gom theo lỗi của lượt tính mới nhất. Mọi lỗi đều mang mã trạng thái (`ApiStatusError`) để
 * giao diện phân biệt được 404 "nhóm đã hết bài" với lỗi thật.
 */
export async function listReviewGroups(examSessionId: string): Promise<ReviewGroup[]> {
  const { data, error, response } = await apiClient.GET('/exam-sessions/{id}/review-groups', {
    params: { path: { id: examSessionId } },
  });
  if (error || !response.ok) throw apiStatusFailure(error, response);
  return data as unknown as ReviewGroup[];
}

/**
 * Duyệt một nhóm: mỗi bài đủ điều kiện được ghi "giảng viên chấp nhận điểm của lượt tính này", cả lô một giao dịch.
 *
 * - 404: nhóm không còn bài nào gắn cờ (thường là bấm lần hai) — giao diện coi là đã xong.
 * - 409: có bài đã sang nhóm khác hoặc vừa đổi trạng thái — không bài nào được ghi, tải lại rồi duyệt lại.
 * - 400: có bài không thuộc phiên — không bài nào được ghi.
 */
export async function confirmReviewGroup(
  examSessionId: string,
  body: { key: string; resultIds?: string[] },
): Promise<ConfirmOutcome> {
  const { data, error, response } = await apiClient.POST('/exam-sessions/{id}/review-groups/confirm', {
    params: { path: { id: examSessionId } },
    body,
  });
  if (error || !response.ok) throw apiStatusFailure(error, response);
  return data as unknown as ConfirmOutcome;
}

/** Các phạm vi đang tạm dừng tự chốt của CHÍNH người gọi (không theo phiên). */
export async function listAutoBreakers(): Promise<OpenAutoBreaker[]> {
  const { data, error, response } = await apiClient.GET('/auto-breakers');
  if (error || !response.ok) throw apiStatusFailure(error, response);
  return data as unknown as OpenAutoBreaker[];
}

/** Bật lại tự chốt cho một phạm vi. 404: không phải của bạn; 409: đã bật lại rồi. Không tính lại bài nào. */
export async function resetAutoBreaker(breakerId: string): Promise<void> {
  const { error, response } = await apiClient.POST('/auto-breakers/{id}/reset', {
    params: { path: { id: breakerId } },
  });
  if (error || !response.ok) throw apiStatusFailure(error, response);
}

/** Ghi mốc "giảng viên đã mở bài này" (spec §5.5). Server chỉ ghi lần đầu; gọi lại vô hại. */
export async function markResultOpened(gradingResultId: string): Promise<void> {
  const { error, response } = await apiClient.POST('/grading-results/{id}/opened', {
    params: { path: { id: gradingResultId } },
  });
  if (error || !response.ok) throw apiStatusFailure(error, response);
}
