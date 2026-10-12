'use client';

import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { RubricOverview } from '@/lib/api/rubric-errors';
import { RubricStatus } from './RubricStatus';

/** Từ 1 đến MANY rubric: mỗi rubric một thẻ (tên + tình trạng). Nhiều hơn thì dùng `RubricPicker`. */
export function RubricTabs({
  overviews,
  current,
  onSelect,
  onNew,
}: {
  overviews: RubricOverview[];
  current: string;
  onSelect: (name: string) => void;
  onNew: () => void;
}) {
  return (
    <div role="tablist" aria-label="Chọn rubric" className="flex flex-wrap items-stretch gap-2.5">
      {overviews.map((o) => {
        const selected = o.rubricName === current;
        return (
          <button
            key={o.rubricName}
            type="button"
            role="tab"
            aria-selected={selected}
            title={o.rubricName}
            onClick={() => onSelect(o.rubricName)}
            className={cn(
              'flex min-w-[210px] max-w-[290px] flex-col items-start gap-0.5 rounded-lg border bg-surface px-3.5 py-2.5 text-left shadow-sm hover:bg-surface-2',
              selected ? 'border-primary ring-2 ring-primary-subtle' : 'border-border',
            )}
          >
            <span className={cn('max-w-full truncate text-body font-semibold', selected && 'text-primary')}>{o.rubricName}</span>
            <RubricStatus overview={o} />
          </button>
        );
      })}
      <Button type="button" variant="ghost" className="self-center text-primary hover:text-primary" onClick={onNew}>
        <Plus className="h-4 w-4" aria-hidden="true" />
        Rubric mới
      </Button>
    </div>
  );
}
