import { apiClient } from '@/lib/api-client';
import { apiFailure } from './error';

/**
 * Bốn mẫu điều kiện có sẵn, hoặc `null` (AI đọc bài) — mirrors `RulePredicate`
 * (apps/api/src/grading/decision/types.ts). Giao diện chỉ TẠO mẫu `test_group_failed`; ba mẫu còn lại chỉ còn ở
 * lỗi cũ (spec D9) và được hiện như "AI đọc bài" kèm ghi chú.
 */
export type RulePredicate =
  | { kind: 'test_group_failed'; group: string }
  | { kind: 'calls_function'; name: string }
  | { kind: 'complexity_exceeds_required' }
  | { kind: 'no_recursion'; functionName?: string };

/**
 * Kết quả tính lại mà máy chủ trả sau mỗi thao tác đổi lỗi / điểm trừ / đánh dấu — mirrors `RecomputeSummary`
 * (apps/api/src/grading/scoring/score.service.ts). Luôn đọc lại bằng lời cho giảng viên (`describeRecompute`).
 */
export interface RecomputeSummary {
  recomputed: number;
  promoted: number;
  demoted: number;
  belowFloor: number;
}

/** Mirrors PricePreview (apps/api/src/grading/rules/price.service.ts). */
export interface PricePreview {
  openSessions: { sessionId: string; name: string; affected: number; autoAfter: number; blockedByOtherUnpriced: number }[];
  /** Phiên đã chốt KHÔNG đổi theo: bảng điểm trừ đã ghim lúc chốt (§2.2). */
  finalizedSessions: { sessionId: string; name: string; affected: number }[];
}

export interface ErrorChanges {
  name?: string;
  description?: string;
  predicate?: RulePredicate | null;
}

/** Một lỗi trong THƯ VIỆN — mirrors LibraryRule (apps/api/src/grading/rules/error-rule.service.ts). */
export interface LibraryRule {
  id: string;
  ruleKey: string;
  origin: string;
  revision: { id: string; revision: number; name: string; description: string; predicate: RulePredicate | null };
  checkedBy: 'machine' | 'model';
  uses: { rubricName: string; criterionKey: string; deduction: string | null }[];
}

/** Lỗi AI đề xuất kèm nơi thấy — mirrors ProposalItem (apps/api/src/grading/rules/proposal.service.ts). */
export interface ProposalItem {
  id: string;
  ruleKey: string;
  name: string;
  description: string;
  sightings: { sessions: { id: string; name: string }[]; results: number };
  /** Báo trước khi có bảng ghi nhận nơi thấy — không biết thấy ở đâu nên hiện ở mọi rubric. */
  legacy: boolean;
}

export async function listLibrary(): Promise<LibraryRule[]> {
  const { data, error, response } = await apiClient.GET('/rules');
  if (error || !response.ok) throw apiFailure(error, response);
  return data as unknown as LibraryRule[];
}

/** Có `rubricName`: chỉ lỗi thấy ở rubric đó (số liệu của rubric đó). Không có: mọi lỗi đề xuất. */
export async function listProposals(rubricName?: string): Promise<ProposalItem[]> {
  const { data, error, response } = await apiClient.GET('/rules/missing', {
    params: { query: rubricName ? { rubricName } : {} } as never,
  });
  if (error || !response.ok) throw apiFailure(error, response);
  return data as unknown as ProposalItem[];
}

/** Sửa tên / mô tả / điều kiện cho CẢ các rubric đang dùng lỗi này. */
export async function reviseRule(
  ruleId: string,
  changes: ErrorChanges,
): Promise<{ revisionId: string; recompute: RecomputeSummary | null }> {
  const { data, error, response } = await apiClient.PATCH('/rules/{id}', {
    params: { path: { id: ruleId } },
    body: changes as never,
  });
  if (error || !response.ok) throw apiFailure(error, response);
  return data as unknown as { revisionId: string; recompute: RecomputeSummary | null };
}

/** Sửa CHỈ cho một rubric: tách thành bản riêng, rubric còn lại giữ nguyên (D4). */
export async function splitRule(
  ruleId: string,
  rubricName: string,
  changes: ErrorChanges,
): Promise<{ ruleId: string; rubricErrorId: string; recompute: RecomputeSummary }> {
  const { data, error, response } = await apiClient.POST('/rules/{id}/split', {
    params: { path: { id: ruleId } },
    body: { rubricName, changes } as never,
  });
  if (error || !response.ok) throw apiFailure(error, response);
  return data as unknown as { ruleId: string; rubricErrorId: string; recompute: RecomputeSummary };
}

/** "Không phải lỗi" (`dismissed`). Duyệt một lỗi đề xuất đi qua `assignError`, không qua đây. */
export async function setRuleState(
  ruleId: string,
  state: 'dismissed' | 'retired',
): Promise<{ recompute: RecomputeSummary }> {
  const { data, error, response } = await apiClient.POST('/rules/{id}/state', {
    params: { path: { id: ruleId } },
    body: { state },
  });
  if (error || !response.ok) throw apiFailure(error, response);
  return data as unknown as { recompute: RecomputeSummary };
}

export async function setWaiver(
  rubricId: string,
  criterionKey: string,
): Promise<{ waiverId: string; recompute: RecomputeSummary | null }> {
  const { data, error, response } = await apiClient.POST('/rubrics/{id}/criterion-waivers', {
    params: { path: { id: rubricId } },
    body: { criterionKey },
  });
  if (error || !response.ok) throw apiFailure(error, response);
  return data as unknown as { waiverId: string; recompute: RecomputeSummary | null };
}

export async function revokeWaiver(waiverId: string): Promise<{ recompute: RecomputeSummary }> {
  const { data, error, response } = await apiClient.POST('/criterion-waivers/{id}/revoke', {
    params: { path: { id: waiverId } },
  });
  if (error || !response.ok) throw apiFailure(error, response);
  return data as unknown as { recompute: RecomputeSummary };
}
