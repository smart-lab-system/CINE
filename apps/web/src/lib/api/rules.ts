import { apiClient } from '@/lib/api-client';

/**
 * Bốn mẫu điều kiện có sẵn, hoặc `null` (luật bằng lời) — mirrors `RulePredicate`
 * (apps/api/src/grading/decision/types.ts). Không có mẫu thứ năm: không viết code tự do (spec §3.2).
 */
export type RulePredicate =
  | { kind: 'test_group_failed'; group: string }
  | { kind: 'calls_function'; name: string }
  | { kind: 'complexity_exceeds_required' }
  | { kind: 'no_recursion'; functionName?: string };

/** Mirrors RuleListItem (apps/api/src/grading/rules/error-rule.service.ts). */
export interface Rule {
  id: string;
  ruleKey: string;
  state: string;
  origin: string;
  revision: {
    id: string;
    revision: number;
    name: string;
    description: string;
    criterionKey: string;
    predicate: RulePredicate | null;
  };
  checkedBy: 'machine' | 'model';
  deduction: string | null;
  appliedTo: { results: number; sessions: number };
  mismatchedIn: number;
}

/** Mirrors RulePreview (apps/api/src/grading/rules/error-rule.service.ts). */
export type RulePreview =
  | {
      tier: 2;
      results: { resultId: string; sessionId: string; before: string | null; after: number | null; capped: boolean }[];
    }
  | { tier: 3; reason: string }
  | { tier: 4; sessions: { sessionId: string; name: string; graded: boolean }[] };

/** Mirrors PricePreview (apps/api/src/grading/rules/price.service.ts). */
export interface PricePreview {
  openSessions: { sessionId: string; name: string; affected: number; autoAfter: number; blockedByOtherUnpriced: number }[];
  /** Phiên đã chốt KHÔNG đổi theo (bảng giá ghim lúc chốt, §2.2) — không có autoAfter/blockedByOtherUnpriced. */
  finalizedSessions: { sessionId: string; name: string; affected: number }[];
}

export interface CriterionWaiver {
  id: string;
  criterionKey: string;
  setAt: string;
  revokedAt: string | null;
}

function fail(error: unknown, response: Response): Error {
  const body = error as { message?: string | string[] } | undefined;
  const message = Array.isArray(body?.message) ? body!.message.join('; ') : body?.message;
  return new Error(message ?? `Yêu cầu thất bại (HTTP ${response.status})`);
}

export async function listRules(): Promise<Rule[]> {
  const { data, error, response } = await apiClient.GET('/rules');
  if (error || !response.ok) throw fail(error, response);
  return data as unknown as Rule[];
}

/** Luật agent báo còn thiếu (§2.1) — chặn tự quyết cho tới khi giảng viên xử lý (spec UI 3.1). */
export async function listMissingRules(): Promise<Rule[]> {
  const { data, error, response } = await apiClient.GET('/rules/missing');
  if (error || !response.ok) throw fail(error, response);
  return data as unknown as Rule[];
}

export interface RuleInput {
  ruleKey?: string;
  name?: string;
  description?: string;
  criterionKey?: string;
  predicate?: unknown;
}

export async function createRule(input: RuleInput): Promise<{ ruleId: string; revisionId: string }> {
  const { data, error, response } = await apiClient.POST('/rules', { body: input as never });
  if (error || !response.ok) throw fail(error, response);
  return data as unknown as { ruleId: string; revisionId: string };
}

export async function reviseRule(ruleId: string, changes: RuleInput): Promise<{ revisionId: string }> {
  const { data, error, response } = await apiClient.PATCH('/rules/{id}', {
    params: { path: { id: ruleId } },
    body: changes as never,
  });
  if (error || !response.ok) throw fail(error, response);
  return data as unknown as { revisionId: string };
}

export async function previewRule(
  input: RuleInput & { ruleId?: string; deduction?: string | null },
): Promise<RulePreview> {
  const { data, error, response } = await apiClient.POST('/rules/preview', { body: input as never });
  if (error || !response.ok) throw fail(error, response);
  return data as unknown as RulePreview;
}

export async function setRuleState(ruleId: string, state: 'active' | 'dismissed' | 'retired'): Promise<void> {
  const { error, response } = await apiClient.POST('/rules/{id}/state', {
    params: { path: { id: ruleId } },
    body: { state },
  });
  if (error || !response.ok) throw fail(error, response);
}

/** "Lưu thì ảnh hưởng bao nhiêu bài" (spec UI 3.1, T-POL-5) — gọi TRƯỚC setPrice. */
export async function previewPrice(ruleId: string, deduction: string | null): Promise<PricePreview> {
  const { data, error, response } = await apiClient.POST('/rules/{id}/price/preview', {
    params: { path: { id: ruleId } },
    // `PriceBodyDto.deduction` khai `@Allow()` (kiểm ở parseDeduction, không ở decorator, §13.2) —
    // openapi-typescript không suy được kiểu, sinh ra `Record<string, never>`. Cùng khuôn `body as
    // never` đã dùng cho các DTO tương tự khác trong `lib/api/grading.ts`.
    body: { deduction } as never,
  });
  if (error || !response.ok) throw fail(error, response);
  return data as unknown as PricePreview;
}

export async function setPrice(ruleId: string, deduction: string | null): Promise<void> {
  const { error, response } = await apiClient.PUT('/rules/{id}/price', {
    params: { path: { id: ruleId } },
    body: { deduction } as never,
  });
  if (error || !response.ok) throw fail(error, response);
}

export async function listWaivers(rubricId: string): Promise<CriterionWaiver[]> {
  const { data, error, response } = await apiClient.GET('/rubrics/{id}/criterion-waivers', {
    params: { path: { id: rubricId } },
  });
  if (error || !response.ok) throw fail(error, response);
  return data as unknown as CriterionWaiver[];
}

export async function setWaiver(rubricId: string, criterionKey: string): Promise<void> {
  const { error, response } = await apiClient.POST('/rubrics/{id}/criterion-waivers', {
    params: { path: { id: rubricId } },
    body: { criterionKey },
  });
  if (error || !response.ok) throw fail(error, response);
}

export async function revokeWaiver(waiverId: string): Promise<void> {
  const { error, response } = await apiClient.POST('/criterion-waivers/{id}/revoke', {
    params: { path: { id: waiverId } },
  });
  if (error || !response.ok) throw fail(error, response);
}
