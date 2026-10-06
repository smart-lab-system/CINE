'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createAdminClass,
  deleteAdminClass,
  listAdminClasses,
  updateAdminClass,
  type AdminClassFilters,
  type AdminClassInput,
} from '@/lib/api/admin-classes';
import { MASTER_DATA_KEYS } from './master-data-keys';

/**
 * Lớp cho trang quản trị. Khoá `['classes', 'admin', filters]` nằm DƯỚI gốc `['classes']` — cùng gốc với `['classes','teaching']` của
 * "Lớp của tôi" — nên một lần ghi làm mới cả hai (lý do đã nêu ở `useTeaching.ts`: sĩ số xuất hiện ở nhiều nơi).
 * `keepPreviousData`: đổi bộ lọc không nháy sang khung xương mỗi lần bấm.
 */
export function useAdminClasses(filters: AdminClassFilters = {}) {
  return useQuery({
    queryKey: [MASTER_DATA_KEYS.classes, 'admin', filters],
    queryFn: () => listAdminClasses(filters),
    placeholderData: keepPreviousData,
  });
}

/**
 * Ghi một lớp làm mới danh sách lớp VÀ Danh mục lớp danh nghĩa: `classCount` của mã nằm ở Danh mục và đổi theo mỗi lớp thêm/xoá,
 * mà ô chọn trong form đang hiện nó.
 */
function useClassMutation<TArgs>(fn: (args: TArgs) => Promise<unknown>, alsoCatalog: boolean) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: [MASTER_DATA_KEYS.classes] }),
        ...(alsoCatalog
          ? [queryClient.invalidateQueries({ queryKey: [MASTER_DATA_KEYS.administrativeClasses] })]
          : []),
      ]),
  });
}

export function useCreateAdminClass() {
  return useClassMutation((body: AdminClassInput) => createAdminClass(body), true);
}

export function useUpdateAdminClass() {
  return useClassMutation(
    (args: { id: string; body: Partial<AdminClassInput> }) => updateAdminClass(args.id, args.body),
    false,
  );
}

export function useDeleteAdminClass() {
  return useClassMutation((id: string) => deleteAdminClass(id), true);
}
