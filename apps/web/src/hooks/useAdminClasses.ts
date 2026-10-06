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

/** Ghi một lớp làm đổi những bộ đếm `classCount` nào ngoài danh sách lớp. */
interface ClassWriteEffect {
  /** `classCount` của mã lớp danh nghĩa (Danh mục) — ô chọn trong form và hộp thoại Danh mục đang hiện nó. */
  catalog: boolean;
  /** `classCount` của học kỳ — trang Học kỳ dùng nó để khoá năm/kỳ và để giải thích vì sao không xoá được. */
  semesters: boolean;
}

/**
 * Ghi một lớp làm mới danh sách lớp và đúng các bộ đếm mà lần ghi đó đổi: thêm/xoá lớp đổi `classCount` của MỘT mã VÀ của MỘT học kỳ;
 * sửa lớp chỉ đổi bộ đếm của thứ nó chuyển đi/đến (đổi mã → hai mã, đổi học kỳ → hai học kỳ, đổi giảng viên/nhóm → không bộ đếm nào).
 * Thiếu một khoá ở đây thì admin mở trang Học kỳ/Danh mục ngay sau đó thấy "0 lớp" và mở khoá những trường server sẽ từ chối.
 */
function useClassMutation<TArgs>(fn: (args: TArgs) => Promise<unknown>, effect: (args: TArgs) => ClassWriteEffect) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (_result, args) => {
      const { catalog, semesters } = effect(args);
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: [MASTER_DATA_KEYS.classes] }),
        ...(catalog ? [queryClient.invalidateQueries({ queryKey: [MASTER_DATA_KEYS.administrativeClasses] })] : []),
        ...(semesters ? [queryClient.invalidateQueries({ queryKey: [MASTER_DATA_KEYS.semesters] })] : []),
      ]);
    },
  });
}

const COUNTS_BOTH: ClassWriteEffect = { catalog: true, semesters: true };

export function useCreateAdminClass() {
  return useClassMutation((body: AdminClassInput) => createAdminClass(body), () => COUNTS_BOTH);
}

export function useUpdateAdminClass() {
  return useClassMutation(
    (args: { id: string; body: Partial<AdminClassInput> }) => updateAdminClass(args.id, args.body),
    ({ body }) => ({
      catalog: body.administrativeClassId !== undefined,
      semesters: body.semesterId !== undefined,
    }),
  );
}

export function useDeleteAdminClass() {
  return useClassMutation((id: string) => deleteAdminClass(id), () => COUNTS_BOTH);
}
