'use client';

import { LIST_STATUS_LABEL, LIST_STATUS_ORDER, type ListStatus } from '@/lib/session-list';
import { cn } from '@/lib/utils';
import { STATUS_PILL } from './StatusPill';

const TABS: Array<ListStatus | 'all'> = ['all', ...LIST_STATUS_ORDER];

/**
 * Tab trạng thái = bộ lọc chính. Số đếm theo các bộ lọc KHÁC đang bật. Không có số đếm thì không vẽ gì:
 * một tab "Cần bạn xem 0" khi thật ra chưa biết là lời nói dối.
 */
export function StatusTabs({
  counts,
  value,
  onChange,
}: {
  counts: Record<ListStatus | 'all', number> | null;
  value: ListStatus | 'all';
  onChange: (v: ListStatus | 'all') => void;
}) {
  if (counts === null) return null;
  return (
    <div role="group" aria-label="Lọc theo trạng thái chấm" className="flex gap-0.5 overflow-x-auto border-b border-border">
      {TABS.map((tab) => {
        const Icon = tab === 'all' ? null : STATUS_PILL[tab].Icon;
        const label = tab === 'all' ? 'Tất cả' : LIST_STATUS_LABEL[tab];
        return (
          <button
            key={tab}
            type="button"
            aria-pressed={value === tab}
            onClick={() => onChange(tab)}
            className={cn(
              '-mb-px inline-flex h-10 items-center gap-2 whitespace-nowrap border-b-2 border-transparent px-3 text-small font-semibold text-muted-foreground hover:text-foreground',
              value === tab && 'border-primary text-foreground',
            )}
          >
            {Icon && <Icon className="h-4 w-4" aria-hidden="true" />}
            {label}
            <span
              className={cn(
                'grid h-5 min-w-6 place-items-center rounded-full px-1.5 text-caption tabular-nums',
                tab === 'attention' && counts[tab] > 0 ? 'bg-warning-subtle text-warning-strong' : 'bg-surface-2 text-foreground',
              )}
            >
              {counts[tab]}
            </span>
          </button>
        );
      })}
    </div>
  );
}
