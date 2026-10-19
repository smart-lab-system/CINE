import { getAccessToken } from '@/lib/auth-token';

/**
 * Nhật ký thao tác (chỉ đọc, chỉ admin). API chỉ trả TÊN các trường đã đổi — không có giá trị cũ hay mới.
 * Route chưa có trong schema đã sinh, nên gọi bằng fetch với cùng cách gắn Bearer như `api-client.ts`.
 */
export interface AuditLogItem {
  id: string;
  occurredAt: string;
  actorType: 'user' | 'system';
  actorName: string | null;
  action: string;
  targetType: string;
  targetId: string;
  changedFields: string[];
}

export interface AuditLogPage {
  items: AuditLogItem[];
  nextBefore: string | null;
}

export interface AuditLogFilter {
  action?: string;
  /** ISO 8601: chỉ lấy thao tác xảy ra từ thời điểm này trở đi. */
  from?: string;
  /** Cursor trang sau (lấy từ `nextBefore`). */
  before?: string;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export async function listAuditLog(filter: AuditLogFilter): Promise<AuditLogPage> {
  const params = new URLSearchParams({ limit: '50' });
  if (filter.action) params.set('action', filter.action);
  if (filter.from) params.set('from', filter.from);
  if (filter.before) params.set('before', filter.before);
  const token = await getAccessToken();
  const res = await fetch(`${API_URL}/admin/audit-log?${params.toString()}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(`Không tải được nhật ký (mã ${res.status}).`);
  return (await res.json()) as AuditLogPage;
}
