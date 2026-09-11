'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Semester } from '@/lib/api/department';

interface SemesterFilterProps {
  value: string | null;
  onChange: (value: string | null) => void;
  semesters: Semester[];
  current: Semester | null;
  isStale: boolean;
  staleDays: number;
}

/**
 * Một control cho mọi màn hình danh sách.
 *
 * "Tất cả học kỳ" luôn có mặt: lối thoát một click khi kỳ mặc định không
 * phải thứ người dùng đang cần. Bộ lọc này chỉ hẹp tầm nhìn, không bao giờ
 * chặn thao tác nào (CLAUDE.md §1.2) — nên không cần trạng thái disabled
 * hay xác nhận gì.
 */
export function SemesterFilter({
  value,
  onChange,
  semesters,
  current,
  isStale,
  staleDays,
}: SemesterFilterProps) {
  return (
    <div className="flex flex-col gap-1">
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
            <SelectItem key={semester.id} value={semester.id}>
              {semester.name}
              {current?.id === semester.id ? ' — mặc định' : ''}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Chỉ hiện khi kỳ đang xem CŨNG là kỳ hệ thống tự chọn: người dùng
          chủ động mở một kỳ cũ ra xem không phải là hệ thống đoán sai, và
          nhắc họ điều họ vừa tự làm chỉ là tiếng ồn. */}
      {isStale && value === current?.id && (
        <span className="text-caption text-muted-foreground">
          Học kỳ mặc định đã kết thúc {staleDays} ngày trước — chưa có học kỳ mới nào được mở.
        </span>
      )}
    </div>
  );
}
