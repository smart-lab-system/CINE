'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  archiveSession,
  closeAttention,
  listSessionOverview,
  listTeacherSubmissions,
  reopenAttention,
  unarchiveSession,
  type SearchSubmissionsParams,
} from '@/lib/api/submissions';

/** Mọi phiên của GV này kèm số liệu roll-up. Không phân trang — spec §1.2. */
export function useSessionOverview() {
  return useQuery({
    queryKey: ['submissions', 'overview'],
    queryFn: listSessionOverview,
  });
}

/**
 * Chỉ chạy khi có từ khoá — luồng search (§4.5). `enabled` để trang không
 * gọi endpoint này lúc ô search còn rỗng.
 */
export function useTeacherSubmissions(params: SearchSubmissionsParams, enabled: boolean) {
  return useQuery({
    queryKey: ['submissions', 'search', params],
    queryFn: () => listTeacherSubmissions(params),
    enabled,
  });
}

/**
 * `on: true` bật trạng thái, `false` gỡ. Một hook cho cả hai chiều vì nút trên
 * bảng cũng là một nút đảo trạng thái, không phải hai nút khác nhau.
 *
 * Invalidate cả overview: lưu trữ/khép đổi cả số đếm ở cột lọc lẫn danh sách.
 */
export function useArchiveSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, on }: { id: string; on: boolean }) =>
      on ? archiveSession(id) : unarchiveSession(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['submissions', 'overview'] });
    },
  });
}

export function useCloseAttention() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, on }: { id: string; on: boolean }) =>
      on ? closeAttention(id) : reopenAttention(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['submissions', 'overview'] });
    },
  });
}
