import { apiClient } from '@/lib/api-client';

/** Mirrors TestBundleService.list() (apps/api/src/grading/test-bundle/test-bundle.service.ts). */
export interface TestBundleSummary {
  id: string;
  version: number;
  approvedAt: string | null;
  caseCount: number;
}

/** Mirrors TestBundleService.get(). */
export interface TestBundleCase {
  caseKey: string;
  group: string;
  input: string;
  expectedOutput: string;
  autoDroppedReason: string | null;
}

export interface TestBundleDetail {
  id: string;
  version: number;
  approvedAt: string | null;
  cases: TestBundleCase[];
}

export interface TestBundleCaseInput {
  caseKey: string;
  group: string;
  input: string;
  expectedOutput: string;
  constraintQuote?: string;
}

function fail(error: unknown, response: Response): Error {
  const body = error as { message?: string | string[] } | undefined;
  const message = Array.isArray(body?.message) ? body!.message.join('; ') : body?.message;
  return new Error(message ?? `Yêu cầu thất bại (HTTP ${response.status})`);
}

export async function listTestBundles(examSessionId: string): Promise<TestBundleSummary[]> {
  const { data, error, response } = await apiClient.GET('/exam-sessions/{id}/test-bundles', {
    params: { path: { id: examSessionId } },
  });
  if (error || !response.ok) throw fail(error, response);
  return data as unknown as TestBundleSummary[];
}

export async function getTestBundle(examSessionId: string, bundleId: string): Promise<TestBundleDetail> {
  const { data, error, response } = await apiClient.GET('/exam-sessions/{id}/test-bundles/{bundleId}', {
    params: { path: { id: examSessionId, bundleId } },
  });
  if (error || !response.ok) throw fail(error, response);
  return data as unknown as TestBundleDetail;
}

/** Tạo một PHIÊN BẢN gói test mới, ca giảng viên tự viết (§14.1) — chưa duyệt. */
export async function createTestBundle(
  examSessionId: string,
  cases: TestBundleCaseInput[],
): Promise<{ id: string; version: number }> {
  const { data, error, response } = await apiClient.POST('/exam-sessions/{id}/test-bundles', {
    params: { path: { id: examSessionId } },
    body: { cases },
  });
  if (error || !response.ok) throw fail(error, response);
  return data as unknown as { id: string; version: number };
}

export async function approveTestBundle(examSessionId: string, bundleId: string): Promise<void> {
  const { error, response } = await apiClient.POST('/exam-sessions/{id}/test-bundles/{bundleId}/approve', {
    params: { path: { id: examSessionId, bundleId } },
  });
  if (error || !response.ok) throw fail(error, response);
}

/** Chỉ gói ĐÃ duyệt mới ghim được (§14.1) — server tự chặn, đây chỉ gọi. */
export async function pinTestBundle(examSessionId: string, bundleId: string): Promise<void> {
  const { error, response } = await apiClient.POST('/exam-sessions/{id}/test-bundles/{bundleId}/pin', {
    params: { path: { id: examSessionId, bundleId } },
  });
  if (error || !response.ok) throw fail(error, response);
}
