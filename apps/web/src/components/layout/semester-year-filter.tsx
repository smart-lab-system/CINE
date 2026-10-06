'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  academicYearOptions,
  termOptions,
  type SemesterRef,
  type SemesterSelection,
} from '@/lib/semester-filter';

interface SemesterYearFilterProps {
  semesters: readonly SemesterRef[];
  selection: SemesterSelection;
  onYearChange: (year: number | null) => void;
  onSemesterChange: (semesterId: string | null) => void;
  /** Xếp dọc, ô rộng hết bề ngang — cho cột lọc hẹp. Mặc định: hai ô cạnh nhau từ màn hình sm trở lên. */
  stacked?: boolean;
}

/**
 * Hai ô liên kết Năm học → Học kỳ cho MỌI màn hình có lọc theo học kỳ (spec §7.2), thay `semester-filter.tsx` (một ô, theo chuỗi).
 * Lựa chọn lấy từ bảng học kỳ chứ không từ các dòng đã tải. "Tất cả" luôn có mặt và là mặc định.
 *
 * Nhãn `aria-label="Lọc theo học kỳ"` của ô kỳ GIỮ NGUYÊN so với component cũ, để các test trang chuyển sang bộ lọc mới ở plan G3 chỉ
 * phải đổi nguồn dữ liệu chứ không phải đổi cách tìm ô.
 *
 * Bộ lọc chỉ hẹp tầm nhìn, không bao giờ chặn thao tác (CLAUDE.md §1.2) — nên không có trạng thái disabled hay xác nhận gì, và vẫn vẽ
 * đủ hai ô khi chưa có học kỳ nào (chỉ còn "Tất cả").
 */
export function SemesterYearFilter({
  semesters,
  selection,
  onYearChange,
  onSemesterChange,
  stacked = false,
}: SemesterYearFilterProps) {
  const years = academicYearOptions(semesters);
  const terms = termOptions(semesters, selection.academicYear);

  return (
    <div className={stacked ? 'flex flex-col gap-2' : 'flex flex-col gap-2 sm:flex-row'}>
      <Select
        value={selection.academicYear === null ? 'all' : String(selection.academicYear)}
        onValueChange={(value) => onYearChange(value === 'all' ? null : Number(value))}
      >
        <SelectTrigger className={stacked ? 'w-full' : 'sm:w-44'} aria-label="Lọc theo năm học">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Tất cả năm học</SelectItem>
          {years.map((year) => (
            <SelectItem key={year.value} value={String(year.value)}>
              {year.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={selection.semesterId ?? 'all'}
        onValueChange={(value) => onSemesterChange(value === 'all' ? null : value)}
      >
        <SelectTrigger className={stacked ? 'w-full' : 'sm:w-52'} aria-label="Lọc theo học kỳ">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Tất cả học kỳ</SelectItem>
          {terms.map((semester) => (
            <SelectItem key={semester.id} value={semester.id}>
              {semester.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
