import { apiClient } from '@/lib/api-client';

// Mirrors AuditLogPageView (apps/api/src/admin/audit-log.types.ts).
export interface AuditLogActor {
  id: string;
  name: string;
  email: string;
}

export interface AuditLogEntry {
  id: string;
  occurredAt: string;
  /** `null` = dòng của hệ thống, không có người thực hiện. */
  actor: AuditLogActor | null;
  action: string;
  targetType: string;
  targetId: string;
  /** `null` khi giá trị vượt 4 KB — xem `oldValueTruncated`. */
  oldValue: Record<string, unknown> | null;
  oldValueTruncated: boolean;
  newValue: Record<string, unknown> | null;
  newValueTruncated: boolean;
}

export interface AuditLogPage {
  items: AuditLogEntry[];
  total: number;
  page: number;
  pageSize: number;
}

export interface SearchAuditLogParams {
  /** Mục kết thúc bằng `.` là tiền tố (`room.`), còn lại khớp chính xác. */
  action?: string[];
  actorId?: string;
  targetType?: string;
  targetId?: string;
  /** ISO 8601, bao gồm. */
  from?: string;
  /** ISO 8601, KHÔNG bao gồm. */
  to?: string;
  page: number;
  pageSize: number;
}

async function throwIfFailed(error: unknown, response: Response) {
  if (error || !response.ok) {
    const body = error as { message?: string | string[] } | undefined;
    const message = Array.isArray(body?.message) ? body!.message.join('; ') : body?.message;
    throw new Error(message ?? `Yêu cầu thất bại (HTTP ${response.status})`);
  }
}

export async function searchAuditLog(params: SearchAuditLogParams): Promise<AuditLogPage> {
  const { data, error, response } = await apiClient.GET('/audit-log', {
    params: { query: params },
  });
  await throwIfFailed(error, response);
  // Cast như lib/api/accounts.ts: kiểu phản hồi do plugin Swagger sinh có thể
  // lệch (Date vs string); JSON thật đúng hình dạng khai ở trên.
  return data as unknown as AuditLogPage;
}
