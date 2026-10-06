'use client';

import { useQuery } from '@tanstack/react-query';
import { listTeachingClasses, type TeachingClassFilters } from '@/lib/api/teaching';
import { MASTER_DATA_KEYS } from './master-data-keys';

/**
 * Lớp mà giảng viên này được giao, tuỳ chọn lọc theo năm học/học kỳ. Gọi không đối số là mọi lớp (trang phòng chờ, danh sách phiên, form
 * tạo phiên): bộ lọc chỉ hẹp tầm nhìn, không bao giờ chặn thao tác (CLAUDE.md §1.2).
 *
 * Khoá `['classes', 'teaching', filters]` nằm DƯỚI gốc `classes` — cùng gốc với danh sách của admin — nên mọi lần ghi lớp (admin tạo,
 * giao lại, import) và mọi lần đổi roster làm mới nó. Giảng viên không còn mutation nào ở đây: lớp do admin quản lý.
 */
export function useTeachingClasses(filters: TeachingClassFilters = {}) {
  return useQuery({
    queryKey: [MASTER_DATA_KEYS.classes, 'teaching', filters],
    queryFn: () => listTeachingClasses(filters),
  });
}
