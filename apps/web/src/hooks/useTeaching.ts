'use client';

import { useQuery } from '@tanstack/react-query';
import { listTeachingClasses } from '@/lib/api/teaching';

/**
 * The lecturer's own classes — the create-session form's source of truth.
 *
 * `semesterId` là tuỳ chọn và nằm TRONG query key: đổi kỳ phải là một
 * query khác, không phải cùng một cache entry bị ghi đè — nếu không, quay
 * lại kỳ trước sẽ hiện dữ liệu của kỳ vừa xem trong một nhịp.
 *
 * Bỏ trống = tất cả học kỳ. Form tạo phiên thi gọi không truyền gì, và đó
 * là đúng: giảng viên chọn lớp nào cũng mở được phiên, kể cả lớp kỳ cũ
 * (thi lại, thi bù — CLAUDE.md §1.2).
 */
export function useTeachingClasses(semesterId?: string | null) {
  return useQuery({
    queryKey: ['classes', 'teaching', semesterId ?? 'all'],
    queryFn: () => listTeachingClasses(semesterId ?? undefined),
  });
}
