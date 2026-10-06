'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createAdministrativeClass,
  deleteAdministrativeClass,
  listAdministrativeClasses,
  updateAdministrativeClass,
  type AdministrativeClassInput,
} from '@/lib/api/administrative-classes';
import { MASTER_DATA_KEYS } from './master-data-keys';

/** Danh mục lớp danh nghĩa — nguồn của ô chọn trong form lớp (chỉ admin). */
export function useAdministrativeClasses() {
  return useQuery({
    queryKey: [MASTER_DATA_KEYS.administrativeClasses],
    queryFn: listAdministrativeClasses,
    staleTime: 60 * 1000,
  });
}

/**
 * Làm mới Danh mục; riêng ĐỔI mã còn làm mới danh sách lớp, vì nhãn của mọi lớp dùng mã đó đổi theo (kể cả lớp của kỳ cũ).
 * Thêm/xoá một mã không đụng tới lớp nào nên không làm mới danh sách lớp.
 */
function useCatalogMutation<TArgs>(fn: (args: TArgs) => Promise<unknown>, alsoClasses: boolean) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: [MASTER_DATA_KEYS.administrativeClasses] }),
        ...(alsoClasses ? [queryClient.invalidateQueries({ queryKey: [MASTER_DATA_KEYS.classes] })] : []),
      ]),
  });
}

export function useCreateAdministrativeClass() {
  return useCatalogMutation((body: AdministrativeClassInput) => createAdministrativeClass(body), false);
}

export function useUpdateAdministrativeClass() {
  return useCatalogMutation(
    (args: { id: string; body: Partial<AdministrativeClassInput> }) => updateAdministrativeClass(args.id, args.body),
    true,
  );
}

export function useDeleteAdministrativeClass() {
  return useCatalogMutation((id: string) => deleteAdministrativeClass(id), false);
}
