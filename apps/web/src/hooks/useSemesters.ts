'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createSemester,
  deleteSemester,
  listSemesters,
  updateSemester,
  type SemesterInput,
} from '@/lib/api/semesters';
import { MASTER_DATA_KEYS } from './master-data-keys';

/**
 * Học kỳ, nguồn DUY NHẤT của bộ lọc Năm học → Học kỳ (spec §7.2) và của trang quản trị. `staleTime` ngắn vì danh sách nhỏ và
 * admin có thể vừa thêm một kỳ ở tab khác; `invalidateQueries` sau mỗi lần ghi lo phần còn lại.
 */
export function useSemesters() {
  return useQuery({
    queryKey: [MASTER_DATA_KEYS.semesters],
    queryFn: listSemesters,
    staleTime: 60 * 1000,
  });
}

/**
 * Ghi một học kỳ làm mới CẢ danh sách lớp: nhãn lớp ở nhiều nơi kèm học kỳ (`label_with_semester`), và `classCount` của học kỳ
 * chính là số dòng của danh sách lớp.
 */
function useSemesterMutation<TArgs>(fn: (args: TArgs) => Promise<unknown>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: [MASTER_DATA_KEYS.semesters] }),
        queryClient.invalidateQueries({ queryKey: [MASTER_DATA_KEYS.classes] }),
      ]),
  });
}

export function useCreateSemester() {
  return useSemesterMutation((body: SemesterInput) => createSemester(body));
}

export function useUpdateSemester() {
  return useSemesterMutation((args: { id: string; body: Partial<SemesterInput> }) =>
    updateSemester(args.id, args.body),
  );
}

export function useDeleteSemester() {
  return useSemesterMutation((id: string) => deleteSemester(id));
}
