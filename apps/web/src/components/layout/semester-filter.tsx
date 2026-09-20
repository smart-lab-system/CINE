'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface SemesterFilterProps {
  value: string | null;
  onChange: (value: string | null) => void;
  /** Các học kỳ có thật trong dữ liệu trang đang xem — xem `semesterOptions`. */
  semesters: string[];
}

/**
 * Một control cho mọi màn hình danh sách.
 *
 * "Tất cả học kỳ" luôn có mặt, và từ đợt thu hẹp master data nó cũng là MẶC
 * ĐỊNH: học kỳ không còn là một hàng có ngày bắt đầu và ngày kết thúc, nên
 * không có cách nào tính ra "kỳ hợp lý nhất hôm nay" để chọn sẵn — và cảnh
 * báo "kỳ mặc định đã kết thúc N ngày trước" cũng mất luôn cơ sở để tính.
 *
 * Bộ lọc này chỉ hẹp tầm nhìn, không bao giờ chặn thao tác nào (CLAUDE.md
 * §1.2) — nên không cần trạng thái disabled hay xác nhận gì.
 */
export function SemesterFilter({ value, onChange, semesters }: SemesterFilterProps) {
  return (
    <Select
      value={value ?? 'all'}
      onValueChange={(next) => onChange(next === 'all' ? null : next)}
    >
      <SelectTrigger className="sm:w-64" aria-label="Lọc theo học kỳ">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">Tất cả học kỳ</SelectItem>
        {semesters.map((semester) => (
          <SelectItem key={semester} value={semester}>
            {semester}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
