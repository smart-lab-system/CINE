import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export const WIZARD_STEPS = ['Tải file', 'Chọn cột', 'Xem trước và ghi'] as const;

/**
 * Chỉ báo ba bước của trang ghi điểm. Ba cách phân biệt, không chỉ màu: bước đã xong là dấu tích, bước đang làm là số
 * trong vòng indigo đậm kèm chữ đậm, bước chưa tới là số trong vòng xám. Trên màn hẹp chỉ bước đang làm giữ nhãn — ba
 * nhãn dài không vừa một hàng 375px, mà số + đường nối vẫn cho biết đang ở đâu. Nhãn các bước khác chỉ ẩn về mặt hình
 * ảnh (`sr-only`, không `display:none`) để đọc màn hình vẫn nghe đủ tên và trạng thái từng bước.
 */
export function WizardStepper({ step }: { step: 1 | 2 | 3 }) {
  return (
    <ol aria-label="Các bước" className="flex items-center gap-3">
      {WIZARD_STEPS.map((label, i) => {
        const n = i + 1;
        const state = n < step ? 'done' : n === step ? 'current' : 'todo';
        return (
          <li
            key={label}
            aria-current={state === 'current' ? 'step' : undefined}
            data-state={state}
            className={cn('flex items-center gap-3 text-small', n < WIZARD_STEPS.length && 'flex-1')}
          >
            <span
              aria-hidden="true"
              className={cn(
                'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border font-semibold tabular-nums transition-[background-color,border-color,color,box-shadow] duration-200 ease-smooth',
                state === 'done' && 'border-transparent bg-accent-strong text-accent-foreground',
                state === 'current' && 'border-transparent bg-primary text-primary-foreground shadow-[0_0_0_4px_hsl(var(--primary)/0.14)]',
                state === 'todo' && 'border-border bg-surface text-muted-foreground',
              )}
            >
              {state === 'done' ? <Check className="h-4 w-4" strokeWidth={3} /> : n}
            </span>
            <span
              className={cn(
                state === 'current' ? 'font-semibold text-foreground' : 'max-sm:sr-only',
                state === 'done' && 'font-medium text-foreground',
                state === 'todo' && 'text-muted-foreground',
              )}
            >
              {label}
              {state === 'done' && <span className="sr-only"> (đã xong)</span>}
            </span>
            {n < WIZARD_STEPS.length && (
              <span
                aria-hidden="true"
                className={cn(
                  'h-0.5 min-w-4 flex-1 rounded-full transition-colors duration-200 ease-smooth',
                  n < step ? 'bg-accent-strong' : 'bg-border',
                )}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
