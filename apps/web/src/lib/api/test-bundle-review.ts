import { apiClient } from '@/lib/api-client';

/**
 * Bỏ một ca khỏi gói CHƯA duyệt — server sinh một phiên bản gói mới không
 * chép ca đó (`grading_test_case` là append-only). Gói đã duyệt thì server
 * trả 409 và UI không hiện nút này.
 *
 * File RIÊNG, không thêm vào `lib/api/test-bundle.ts`: file đó dùng chung
 * với các luồng khác đang chạy song song.
 */
export async function dropTestBundleCase(
  examSessionId: string,
  bundleId: string,
  caseKey: string,
): Promise<{ id: string; version: number }> {
  const { data, error, response } = await apiClient.POST('/exam-sessions/{id}/test-bundles/{bundleId}/drop-case', {
    params: { path: { id: examSessionId, bundleId } },
    body: { caseKey },
  });
  if (error || !response.ok) {
    const body = error as { message?: string | string[] } | undefined;
    const message = Array.isArray(body?.message) ? body!.message.join('; ') : body?.message;
    throw new Error(message ?? `Yêu cầu thất bại (HTTP ${response.status})`);
  }
  return data as unknown as { id: string; version: number };
}
