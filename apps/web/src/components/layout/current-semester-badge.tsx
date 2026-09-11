'use client';

import { CalendarRange } from 'lucide-react';
import { useCurrentSemester } from '@/hooks/useSemesterFilter';
import { cn } from '@/lib/utils';

/**
 * "Học kỳ hiện tại" trên topbar, cho cả ba role.
 *
 * ⚠️ ĐỌC TRƯỚC KHI MỞ RỘNG — CLAUDE.md §1.2 từng cấm hẳn banner học kỳ, và
 * lệnh cấm đó có lý do thật: bản trước đã xây `is_current` + banner + luật
 * "chỉ thao tác được trong kỳ hiện hành", phình thành 13 commit và bị
 * revert ngày 2026-09-10. Banner này được cho phép trở lại (quyết định của
 * chủ đồ án, 2026-09-10) với ranh giới hẹp, và ranh giới đó là thứ giữ nó
 * không trượt lại vào hố cũ:
 *
 * - **Không có cột `is_current`.** Giá trị TÍNH TỪ NGÀY mỗi lần render,
 *   bằng `pickDefaultSemester` — cùng một công thức với bộ lọc danh sách
 *   và mặc định form tạo Môn học. Không có nguồn sự thật thứ hai.
 * - **Không có API set-current.** Không ai "đặt" kỳ hiện tại được; nó là
 *   hệ quả của `start_date`/`end_date`, mà chỉ `admin` sửa (§7.2.2).
 * - **Không chặn gì.** Đây là chữ, không phải điều kiện. Nếu có ngày ai đó
 *   định dùng giá trị này trong một câu `if` để từ chối thao tác, thì đó
 *   đúng là ca mà §1.2 nói phải chặn ở review — thi lại, thi bù và dời
 *   lịch đều diễn ra ngoài kỳ.
 *
 * `title` nói thẳng "tính theo ngày hôm nay" chính là để chống cách đọc
 * sai đó: người dùng thấy nó là một suy luận theo lịch, không phải một
 * công tắc ai đó đã bật.
 */
export function CurrentSemesterBadge({ className }: { className?: string }) {
  const { current, isStale, staleDays, isLoading } = useCurrentSemester();

  // Chưa tải xong, hoặc chưa có học kỳ nào trong hệ thống: không hiện gì.
  // Một chỗ trống im lặng tốt hơn một dòng nhấp nháy trên MỌI trang, và
  // ca "chưa có học kỳ" đã được dashboard của từng role nói rõ kèm hướng
  // xử lý — nhắc lại ở đây chỉ là tiếng ồn không hành động được.
  if (isLoading || !current) {
    return null;
  }

  return (
    <div
      className={cn(
        'flex min-w-0 items-center gap-2 rounded-md border px-2.5 py-1.5',
        isStale
          ? 'border-warning-strong/30 bg-warning-subtle text-warning-strong'
          : 'border-border bg-surface-2 text-muted-foreground',
        className,
      )}
      title={
        isStale
          ? `Học kỳ ${current.name} đã kết thúc ${staleDays} ngày trước và chưa có học kỳ mới nào được mở. Đây chỉ là thông tin — không thao tác nào bị chặn.`
          : `Suy ra theo ngày hôm nay từ thời gian bắt đầu/kết thúc của học kỳ. Đây chỉ là thông tin — không thao tác nào bị chặn.`
      }
    >
      <CalendarRange className="h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="flex min-w-0 flex-col leading-tight">
        {/* Nhãn ẩn ở màn hình hẹp: tên kỳ mới là phần mang thông tin, và
            topbar ở 400px còn phải chứa nút menu, user chip và đăng xuất. */}
        <span className="hidden text-caption text-muted-foreground sm:block">
          Học kỳ hiện tại
        </span>
        <span className="truncate text-small font-medium text-foreground">{current.name}</span>
      </div>
      {isStale && (
        <span className="hidden shrink-0 text-caption font-medium lg:inline">
          đã kết thúc {staleDays} ngày
        </span>
      )}
    </div>
  );
}
