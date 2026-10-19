import { apiClient } from '@/lib/api-client';
import { apiStatusFailure } from './error';

/** Mirrors TestBundleService.list() (apps/api/src/grading/test-bundle/test-bundle.service.ts). */
export interface TestBundleSummary {
  id: string;
  version: number;
  approvedAt: string | null;
  /** `examcollect.test_bundle_origin` — ai viết các ca trong gói này. */
  origin: 'teacher' | 'from_model_answer' | 'generated';
  caseCount: number;
}

/** Mirrors TestBundleService.get(). */
export interface TestBundleCase {
  caseKey: string;
  group: string;
  input: string;
  expectedOutput: string;
  /** Trích nguyên văn ràng buộc trong đề mà ca này kiểm. `null` khi giảng viên tự gõ. */
  constraintQuote: string | null;
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

export type RunStatus = 'pass' | 'fail' | 'compile_error' | 'unavailable' | 'aborted';

/** Một ca trong kết quả chạy thử. Không có stdout; `diff` đã bị server cắt còn 200 ký tự. */
export interface RunCaseResult {
  name: string;
  status: string;
  ms: number;
  diff: string | null;
}

/** Mirrors `TestRunService.run()`. `compileLog` chỉ có khi `compile_error` và không được lưu ở server. */
export interface TestRunResult {
  runId: string;
  status: RunStatus;
  cases: RunCaseResult[];
  compileLog?: string;
}

/**
 * Chạy thử đáp án mẫu của giảng viên trên MỘT phiên bản gói: mọi ca đang dùng, hay một ca khi có `caseKey`. Không đổi
 * duyệt, ghim hay độ tin cậy của thước. Mã đáp án không đi qua đây: server tự đọc nó từ kho.
 */
export async function runTestBundle(examSessionId: string, bundleId: string, caseKey?: string): Promise<TestRunResult> {
  const { data, error, response } = await apiClient.POST('/exam-sessions/{id}/test-bundles/{bundleId}/runs', {
    params: { path: { id: examSessionId, bundleId } },
    body: caseKey === undefined ? {} : { caseKey },
  });
  if (error || !response.ok) throw apiStatusFailure(error, response);
  return data as unknown as TestRunResult;
}

export type GenerateMode = 'statement' | 'answer';

/** Mirrors `RulerGenerateService.generate()`. `ruler` chỉ có khi sinh từ đề (đáp án do hệ thống viết nên có độ tin cậy). */
export interface GenerateResult {
  testBundle: { id: string; version: number; caseCount: number; droppedCount: number };
  ruler?: { trust: 'verified' | 'unverified'; examplesChecked: number };
  run: { runId: string; status: 'pass' };
  warnings: string[];
}

/**
 * Sinh một phiên bản gói test. `statement`: hệ thống viết đáp án mẫu và đề xuất ca từ đề. `answer`: hệ thống chỉ đề xuất ca,
 * output lấy từ chạy mã đáp án của giảng viên. Gói sinh ra luôn CHƯA duyệt và chưa ghim. Đồng bộ và chậm (model và hai lượt
 * chạy đáp án): có thể mất cả phút.
 */
export async function generateTestBundle(examSessionId: string, mode: GenerateMode): Promise<GenerateResult> {
  const path =
    mode === 'statement'
      ? '/exam-sessions/{id}/test-bundles/generate-from-statement'
      : '/exam-sessions/{id}/test-bundles/generate-from-answer';
  const { data, error, response } = await apiClient.POST(path, { params: { path: { id: examSessionId } } });
  if (error || !response.ok) throw apiStatusFailure(error, response);
  return data as unknown as GenerateResult;
}
