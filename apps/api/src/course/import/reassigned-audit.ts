import { AUDIT_VALUE_CAP_BYTES } from '../../admin/audit-log-query';

export interface ReassignedEntry {
  label: string;
  from: string;
  to: string;
}

/** Số mục tối đa, kể cả khi từng mục rất nhỏ — giữ nguyên trần cũ của E1. */
const MAX_ENTRIES = 50;

/**
 * Ngân sách BYTE cho danh sách `reassigned` trong `new_value` của dòng audit một lô import lớp. Trang audit CẮT mọi giá trị jsonb vượt
 * `AUDIT_VALUE_CAP_BYTES` thành `null` (spec T-AUD-4); lúc đó câu mô tả mất luôn `added/updated/unchanged` và quản trị viên không còn
 * thấy gì về lô. 70% trần chừa ~1,2 KB cho các số đếm, `targetLabel` và khoảng trắng mà Postgres thêm khi in jsonb.
 */
const LIST_BUDGET_BYTES = Math.floor(AUDIT_VALUE_CAP_BYTES * 0.7);

/**
 * Phần audit thêm cho một lô import lớp có đổi giảng viên — thứ DUY NHẤT trong lô có hệ quả về quyền, nên nêu rõ ai bị đổi. Danh sách
 * cắt theo BYTE chứ không theo số mục: đo ở Postgres, 35 mục cỡ thường đã làm cả dòng vượt 4096 B. `reassignedTotal` luôn là tổng thật,
 * nên người đọc biết danh sách đã bị cắt. Một mục đơn lẻ vượt cả ngân sách thì danh sách rỗng (tổng vẫn đúng) chứ không ném.
 */
export function reassignedAuditExtra(entries: readonly ReassignedEntry[]): Record<string, unknown> {
  if (entries.length === 0) return {};
  const kept: ReassignedEntry[] = [];
  let used = 2; // "[]"
  for (const entry of entries) {
    if (kept.length >= MAX_ENTRIES) break;
    const size = Buffer.byteLength(JSON.stringify(entry), 'utf8') + 1; // +1: dấu phẩy
    if (used + size > LIST_BUDGET_BYTES) break;
    kept.push(entry);
    used += size;
  }
  return { reassigned: kept, reassignedTotal: entries.length };
}
