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

/**
 * Mọi phiên của GV này kèm số liệu roll-up. Không phân trang — spec §1.2.
 *
 * `student` biến nó thành luồng tìm kiếm: cùng endpoint, cùng hình dạng dữ
 * liệu, chỉ hẹp lại còn những phiên có sinh viên khớp. Dùng lại chính endpoint
 * này thay vì GET /submissions là điều sửa được lỗ cũ — endpoint kia đọc bảng
 * submission nên không bao giờ thấy sinh viên chưa nộp gì, tức đúng nhóm mà
 * giảng viên đi tra.
 *
 * Khoá query mang `student`, nên chế độ duyệt và từng lượt tìm nằm ở các ô
 * cache riêng: gõ rồi xoá ô search không bắt tải lại danh sách đầy đủ.
 */
export function useSessionOverview(student?: string, enabled = true) {
  return useQuery({
    queryKey: ['submissions', 'overview', student ?? null],
    queryFn: () => listSessionOverview(student),
    enabled,
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
