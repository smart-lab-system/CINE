'use client';

import { Play, Tag, X } from 'lucide-react';
import { LIST_STATUS_LABEL, bulkPlan, type ListStatus, type SessionRow } from '@/lib/session-list';
import { cn } from '@/lib/utils';
import type { BulkRequest } from './BulkDialog';

function mixText(mix: Partial<Record<ListStatus, number>>): string {
  return (Object.keys(LIST_STATUS_LABEL) as ListStatus[])
    .filter((k) => mix[k])
    .map((k) => `${mix[k]} ${LIST_STATUS_LABEL[k].toLowerCase()}`)
    .join(' · ');
}

const BTN = 'inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-md border border-primary-foreground/40 px-3 text-small font-semibold hover:bg-primary-foreground/15 aria-disabled:cursor-not-allowed aria-disabled:opacity-45 aria-disabled:hover:bg-transparent';

/**
 * Thanh nổi ở đáy khi có phiên được chọn. Mỗi nút đếm số phiên ĐỦ ĐIỀU KIỆN và nói vì sao khi không có
 * (`aria-disabled` + `title`, không phải `disabled`: nút tắt mất khỏi thứ tự Tab và không ai đọc được lý do).
 * Cố ý không có "Chốt điểm" và "Xuất điểm" hàng loạt (spec D3, mục 1.1).
 */
export function BulkBar({ selected, onRequest, onClear }: { selected: SessionRow[]; onRequest: (r: BulkRequest) => void; onClear: () => void }) {
  const plan = bulkPlan(selected);
  const act = (kind: BulkRequest['kind'], rows: SessionRow[]) => () => {
    if (rows.length === 0) return; // nút đang aria-disabled: bấm không làm gì, lý do nằm ở `title`
    onRequest({ kind, rows, skipped: selected.length - rows.length });
  };

  return (
    <div role="region" aria-label="Thao tác trên phiên đã chọn" className="sticky bottom-4 z-30 flex w-max max-w-full flex-wrap items-center gap-x-5 gap-y-2 self-center rounded-xl bg-primary px-4 py-2.5 text-primary-foreground shadow-lg">
      <div>
        <strong className="block text-body">Đã chọn {selected.length} phiên</strong>
        <span className="block text-caption opacity-90">{mixText(plan.mix)}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          aria-disabled={plan.start.length === 0}
          title={plan.start.length === 0 ? 'Chọn phiên chưa chấm đã có rubric và đề bài.' : undefined}
          onClick={act('start', plan.start)}
          className={cn(BTN, 'border-transparent bg-primary-foreground text-primary hover:bg-primary-foreground/90 aria-disabled:hover:bg-primary-foreground')}
        >
          <Play className="h-4 w-4" aria-hidden="true" />
          Bắt đầu chấm
          <span className="tabular-nums">· {plan.start.length}</span>
        </button>
        <button
          type="button"
          aria-disabled={plan.assignRubric.length === 0}
          title={plan.assignRubric.length === 0 ? 'Chọn phiên chưa chấm và chưa có rubric.' : undefined}
          onClick={act('rubric', plan.assignRubric)}
          className={BTN}
        >
          <Tag className="h-4 w-4" aria-hidden="true" />
          Gắn rubric
          <span className="tabular-nums">· {plan.assignRubric.length}</span>
        </button>
        <button type="button" onClick={onClear} className={cn(BTN, 'border-transparent')} aria-label="Bỏ chọn">
          <X className="h-4 w-4" aria-hidden="true" />
          Bỏ chọn
        </button>
      </div>
    </div>
  );
}
