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
 * "Tất cả học kỳ" luôn có mặt: nó là lối thoát một click khi mặc định không
 * phải thứ người dùng cần — và chính vì luôn có nó mà chi phí của một mặc định
 * sai ở đây rất thấp.
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
              {semester.isCurrent ? ' — đang hiện hành' : ''}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Không kỳ nào gạt cờ: nói ra AI là người đặt, vì giảng viên không tự
          làm được và một màn hình trống không giải thích gì là cách nhanh nhất
          để họ tưởng hệ thống hỏng. */}
      {current === null && (
        <span className="text-caption text-warning-strong">
          Chưa có học kỳ hiện hành — Phòng Đào tạo là người đặt.
        </span>
      )}

      {/* Cờ không tự sửa như việc suy-từ-ngày. Hiện ở MỌI màn hình, kể cả của
          giảng viên: họ không gạt được cần, nhưng cần biết vì sao màn hình
          trông lạ. */}
      {isStale && (
        <span className="text-caption text-muted-foreground">
          Học kỳ hiện hành đã kết thúc {staleDays} ngày trước.
        </span>
      )}
    </div>
  );
}
