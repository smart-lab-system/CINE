import { apiClient } from '@/lib/api-client';
import { apiFailure } from './error';
import type { ErrorChanges, PricePreview, RecomputeSummary, RulePredicate } from './rules';

export type RubricSessionState = 'not_started' | 'grading' | 'finalized';

export interface OverviewCriterion {
  key: string;
  description: string;
  maxPoints: number;
  /** Dòng áp dụng chưa gỡ ở tiêu chí này. */
  errorCount: number;
  /** ≠ null: tiêu chí đã đánh dấu "không trừ điểm". */
  waiverId: string | null;
}

export interface OverviewSession {
  id: string;
  name: string;
  semesterName: string;
  state: RubricSessionState;
  resultCount: number;
}

/** Một phần tử cho MỖI rubric (theo tên) — mirrors RubricOverview (apps/api/src/grading/rules/rubric-overview.service.ts). */
export interface RubricOverview {
  rubricName: string;
  /** Phiên bản mới nhất — dùng cho đánh dấu tiêu chí và hộp thoại sửa tiêu chí. */
  rubricId: string;
  totalPoints: number;
  criteria: OverviewCriterion[];
  errorCount: number;
  unpricedCount: number;
  /** Lỗi gắn tiêu chí không còn ở bản mới nhất (spec mục 2.3.4). */
  danglingCount: number;
  proposalCount: number;
  sessions: OverviewSession[];
  semesters: string[];
}

/** Mirrors RubricErrorItem (apps/api/src/grading/rules/rubric-error.service.ts). */
export interface RubricErrorItem {
  id: string;
  ruleId: string;
  ruleKey: string;
  name: string;
  description: string;
  predicate: RulePredicate | null;
  checkedBy: 'machine' | 'model';
  origin: string;
  criterionKey: string;
  criterionDangling: boolean;
  deduction: string | null;
  appliedTo: { results: number; sessions: number };
  alsoIn: { rubricName: string; criterionKey: string; deduction: string | null }[];
}

export interface NewErrorInput {
  name: string;
  description: string;
  predicate: RulePredicate | null;
}

export interface AssignInput {
  rubricName: string;
  criterionKey: string;
  /** Bỏ qua = không ghi phiên bản điểm trừ nào. `null` = ghi "chưa có điểm trừ" tường minh. */
  deduction?: string | null;
  ruleId?: string;
  newRule?: NewErrorInput;
  /** Chỉ cho lỗi đề xuất được duyệt: sửa rồi kích hoạt. */
  changes?: ErrorChanges;
}

export interface AssignResult {
  rubricErrorId: string;
  ruleId: string;
  recompute: RecomputeSummary | null;
}

export interface CopyResult {
  copied: number;
  skippedNoCriterion: number;
  skippedExisting: number;
  recompute: RecomputeSummary | null;
}

export async function getRubricOverview(): Promise<RubricOverview[]> {
  const { data, error, response } = await apiClient.GET('/rubric-errors/overview');
  if (error || !response.ok) throw apiFailure(error, response);
  return data as unknown as RubricOverview[];
}

export async function listRubricErrors(rubricName: string): Promise<RubricErrorItem[]> {
  const { data, error, response } = await apiClient.GET('/rubric-errors', {
    params: { query: { rubricName } } as never,
  });
  if (error || !response.ok) throw apiFailure(error, response);
  return data as unknown as RubricErrorItem[];
}

export async function assignError(input: AssignInput): Promise<AssignResult> {
  const { data, error, response } = await apiClient.POST('/rubric-errors', { body: input as never });
  if (error || !response.ok) throw apiFailure(error, response);
  return data as unknown as AssignResult;
}

export async function moveError(rubricErrorId: string, criterionKey: string): Promise<{ recompute: RecomputeSummary }> {
  const { data, error, response } = await apiClient.PATCH('/rubric-errors/{id}', {
    params: { path: { id: rubricErrorId } },
    body: { criterionKey } as never,
  });
  if (error || !response.ok) throw apiFailure(error, response);
  return data as unknown as { recompute: RecomputeSummary };
}

/** "Gỡ khỏi rubric này": lỗi vẫn ở thư viện, rubric khác không đổi. */
export async function removeError(rubricErrorId: string): Promise<{ recompute: RecomputeSummary }> {
  const { data, error, response } = await apiClient.DELETE('/rubric-errors/{id}', {
    params: { path: { id: rubricErrorId } },
  });
  if (error || !response.ok) throw apiFailure(error, response);
  return data as unknown as { recompute: RecomputeSummary };
}

/** Sao chép lỗi + điểm trừ từ rubric nguồn sang rubric đích, ghép theo tiêu chí. Sau đó hai rubric độc lập (D3). */
export async function copyErrors(fromRubricName: string, toRubricName: string): Promise<CopyResult> {
  const { data, error, response } = await apiClient.POST('/rubric-errors/copy', {
    body: { fromRubricName, toRubricName } as never,
  });
  if (error || !response.ok) throw apiFailure(error, response);
  return data as unknown as CopyResult;
}

/** "Lưu thì ảnh hưởng bao nhiêu bài" (T-POL-5) — gọi TRƯỚC `setErrorPrice`; không ghi gì. */
export async function previewErrorPrice(rubricErrorId: string, deduction: string | null): Promise<PricePreview> {
  const { data, error, response } = await apiClient.POST('/rubric-errors/{id}/price/preview', {
    params: { path: { id: rubricErrorId } },
    // `deduction` khai `@Allow()` ở DTO (kiểm ở parseDeduction, §13.2) nên openapi-typescript không suy được kiểu.
    body: { deduction } as never,
  });
  if (error || !response.ok) throw apiFailure(error, response);
  return data as unknown as PricePreview;
}

export async function setErrorPrice(
  rubricErrorId: string,
  deduction: string | null,
): Promise<{ versionId: string; recompute: RecomputeSummary }> {
  const { data, error, response } = await apiClient.PUT('/rubric-errors/{id}/price', {
    params: { path: { id: rubricErrorId } },
    body: { deduction } as never,
  });
  if (error || !response.ok) throw apiFailure(error, response);
  return data as unknown as { versionId: string; recompute: RecomputeSummary };
}
