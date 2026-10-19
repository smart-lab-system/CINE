'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { listAuditLog, type AuditLogFilter } from '@/lib/api/audit-log';

/** Nhật ký theo bộ lọc, tải thêm bằng cursor `nextBefore`. */
export function useAuditLog(filter: AuditLogFilter) {
  return useInfiniteQuery({
    queryKey: ['admin', 'audit-log', filter],
    queryFn: ({ pageParam }) => listAuditLog({ ...filter, before: pageParam ?? undefined }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextBefore,
    staleTime: 30_000,
  });
}
