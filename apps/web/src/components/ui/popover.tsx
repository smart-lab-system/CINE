'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Ô nổi neo vào một nút. Không dùng Radix: dự án chưa có `@radix-ui/react-popover`, và thêm phụ thuộc npm
 * chỉ cho popover này là việc nặng không đáng. Đủ cho nhu cầu hiện có:
 * mở/đóng do bên ngoài điều khiển; đóng khi bấm ra ngoài hoặc nhấn Esc (trả tiêu điểm về nút neo).
 *
 * Neo ở mép phải của nút (`right-0`) vì mọi chỗ dùng đều nằm ở cột phải của một hàng.
 */
export function Popover({
  open,
  onOpenChange,
  anchor,
  label,
  children,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  anchor: ReactNode;
  /** Tên của hộp thoại cho trình đọc màn hình. */
  label: string;
  children: ReactNode;
  className?: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) onOpenChange(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      onOpenChange(false);
      wrapRef.current?.querySelector<HTMLElement>('[data-popover-anchor] button, [data-popover-anchor] a')?.focus();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onOpenChange]);

  return (
    <div ref={wrapRef} className="relative inline-flex">
      <div data-popover-anchor className="inline-flex">
        {anchor}
      </div>
      {open && (
        <div
          role="dialog"
          aria-label={label}
          className={cn(
            'absolute right-0 top-full z-30 mt-1.5 flex w-[380px] max-w-[calc(100vw-2rem)] flex-col gap-3 rounded-lg border border-border bg-surface p-4 shadow-lg',
            className,
          )}
        >
          {children}
        </div>
      )}
    </div>
  );
}
