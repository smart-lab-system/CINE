'use client';

import type { ReactNode } from 'react';
import { ChevronDown, Info, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { OverviewCriterion, RubricErrorItem } from '@/lib/api/rubric-errors';
import { formatVnPoints } from '@/lib/format';
import { overCap } from '@/lib/rubric-board';
import { ROW_GRID } from './ErrorRow';

/**
 * Một nhóm tiêu chí: tiêu đề (tên tiêu chí = mô tả của nó, số lỗi, điểm tối đa), rồi các dòng lỗi — hoặc lời nói
 * thẳng về hậu quả khi chưa có lỗi nào / khi tiêu chí đã đánh dấu không trừ điểm (spec mục 5.3). Không hiện khoá
 * kỹ thuật của tiêu chí.
 */
export function CriterionGroup({
  criterion,
  errors,
  open,
  onToggle,
  onAdd,
  onWaive,
  onUnwaive,
  children,
}: {
  criterion: OverviewCriterion;
  errors: RubricErrorItem[];
  open: boolean;
  onToggle: () => void;
  onAdd: () => void;
  onWaive: () => void;
  onUnwaive: () => void;
  children: ReactNode;
}) {
  const waived = criterion.waiverId !== null;
  const max = formatVnPoints(criterion.maxPoints);
  const over = overCap(errors.map((e) => e.deduction), criterion.maxPoints);
  return (
    <section id={`crit-${criterion.key}`} aria-label={criterion.description} className="mt-3.5 rounded-lg border border-border bg-surface shadow-sm">
      <div
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={onToggle}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onToggle();
          }
        }}
        className="flex cursor-pointer items-center gap-3 rounded-lg px-4 py-3.5 hover:bg-background"
      >
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', !open && '-rotate-90')} aria-hidden="true" />
        <h3 className="min-w-0 flex-1 truncate text-h3" title={criterion.description}>
          {criterion.description}
        </h3>
        <Badge>{errors.length} lỗi</Badge>
        <span className="whitespace-nowrap text-small text-muted-foreground">
          Tối đa <b className="text-body text-foreground">{max}</b> điểm
        </span>
      </div>

      {open && (
        <div className="border-t border-border">
          {waived && (
            <div className="m-4 flex items-center justify-between gap-2.5 rounded-lg bg-surface-2 px-3.5 py-3">
              <span>
                <b>Tiêu chí này không trừ điểm</b> — mọi bài được trọn {max} điểm.
              </span>
              <Button type="button" size="sm" variant="outline" onClick={onUnwaive}>
                Bỏ đánh dấu
              </Button>
            </div>
          )}

          {!waived && errors.length === 0 && (
            <div className="m-4 flex flex-wrap items-center justify-between gap-4 rounded-lg border-[1.5px] border-dashed border-border p-[18px]">
              <p className="max-w-[520px]">
                <b>Chưa có lỗi nào cho tiêu chí này.</b>
                <br />
                <span className="text-muted-foreground">
                  Bài chấm theo rubric này sẽ không tự duyệt được cho tới khi có lỗi, hoặc bạn xác nhận tiêu chí này không trừ điểm.
                </span>
              </p>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" className="border-primary text-primary" onClick={onAdd}>
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Thêm lỗi đầu tiên
                </Button>
                <Button type="button" variant="outline" onClick={onWaive}>
                  Tiêu chí này không trừ điểm
                </Button>
              </div>
            </div>
          )}

          {errors.length > 0 && (
            <>
              <div className={cn('hidden bg-surface-2 px-4 py-2 text-caption font-semibold uppercase tracking-wide text-muted-foreground', ROW_GRID)}>
                <span>Lỗi</span>
                <span>Cách phát hiện</span>
                <span className="text-right">Điểm trừ</span>
                <span>Đã gặp</span>
                <span className="sr-only">Thao tác</span>
              </div>
              {children}
              {over !== null && (
                <p className="flex items-center gap-2 px-4 pb-3 text-small text-muted-foreground">
                  <Info className="h-4 w-4 shrink-0" aria-hidden="true" />
                  Cộng hết các lỗi là {formatVnPoints(over)}, vượt điểm tối đa {max} — bài chỉ bị trừ tới {max}.
                </p>
              )}
              <div className="border-t border-border px-3 py-2">
                <Button type="button" variant="ghost" size="sm" className="text-primary hover:text-primary" onClick={onAdd}>
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Thêm lỗi vào “{criterion.description}”
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
