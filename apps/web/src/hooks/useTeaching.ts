'use client';

import { useQuery } from '@tanstack/react-query';
import { listTeachingClasses } from '@/lib/api/teaching';

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
