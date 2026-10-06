'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { searchAuditLog, type SearchAuditLogParams } from '@/lib/api/audit-log';

/**
 * Nhật ký cho trang admin. Mọi tham số làm đổi tập kết quả đều nằm trong khoá.
 *
 * `keepPreviousData`: khi chuyển trang hay đổi bộ lọc, bảng giữ nguyên dòng cũ
 * cho tới khi dòng mới về, thay vì nháy sang khung xương mỗi lần bấm — nhật
 * ký là thứ người ta lật qua lại liên tục.
 *
 * `enabled = false` khi bộ lọc đang sai (khoảng ngày ngược): không gửi yêu cầu nào thay vì gửi một yêu cầu chắc chắn bị 400.
 */
export function useAuditLog(params: SearchAuditLogParams, enabled = true) {
  return useQuery({
    queryKey: ['audit-log', params],
    queryFn: () => searchAuditLog(params),
    placeholderData: keepPreviousData,
    enabled,
  });
}
