'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createClass,
  deleteClass,
  listTeachingClasses,
  updateClass,
  type ClassInput,
} from '@/lib/api/teaching';

/**
 * Lớp mà giảng viên này dạy.
 *
 * Không còn tham số học kỳ: một lớp không thuộc kỳ nào nữa. Bảng
 * `semester` biến mất cùng đợt thu hẹp master data, và chỉ PHIÊN THI mới
 * chụp lại tên kỳ mà giảng viên khai.
 */
export function useTeachingClasses() {
  return useQuery({
    queryKey: ['classes', 'teaching'],
    queryFn: () => listTeachingClasses(),
  });
}

/**
 * Ba mutation cùng làm một việc với cache: xoá `['classes']` khỏi cache.
 *
 * Khoá rộng (`['classes']`, không phải `['classes','teaching']`) là có chủ
 * ý: sĩ số lớp xuất hiện ở cả trang này lẫn form tạo phiên thi, và một
 * trong hai chỗ hiện con số cũ là cách người dùng mất niềm tin vào cả hai.
 */
function useClassMutation<TArgs>(fn: (args: TArgs) => Promise<unknown>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['classes'] });
    },
  });
}

export function useCreateClass() {
  return useClassMutation((body: ClassInput) => createClass(body));
}

export function useUpdateClass() {
  return useClassMutation((args: { id: string; body: Partial<ClassInput> }) =>
    updateClass(args.id, args.body),
  );
}

export function useDeleteClass() {
  return useClassMutation((id: string) => deleteClass(id));
}
