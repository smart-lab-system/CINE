'use client';

import { useQuery } from '@tanstack/react-query';
import { listTeacherOptions } from '@/lib/api/accounts';

/** Giảng viên để giao lớp (admin). Khoá riêng, không dính `MASTER_DATA_KEYS`: tài khoản đổi ở trang tài khoản, không ở đây. */
export function useTeacherOptions() {
  return useQuery({
    queryKey: ['accounts', 'teacher-options'],
    queryFn: listTeacherOptions,
    staleTime: 60 * 1000,
  });
}
