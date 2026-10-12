'use client';

import { Link2, Pencil, TriangleAlert } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Popover } from '@/components/ui/popover';
import type { OverviewCriterion, RubricErrorItem } from '@/lib/api/rubric-errors';
import { deductionLabel, formatDeductionString } from '@/lib/rules-vocab';
import { DetectionBadge } from './DetectionBadge';
import { ErrorMenu } from './ErrorMenu';
import { PricePopover } from './PricePopover';
import { UsesMore } from './UsesMore';

/** Lưới của một dòng lỗi (từ lg trở lên): lỗi · cách phát hiện · điểm trừ · đã gặp · ⋯. Dưới lg các ô xếp dọc. */
export const ROW_GRID = 'lg:grid lg:grid-cols-[minmax(0,1fr)_150px_190px_130px_40px] lg:items-center lg:gap-3.5';

export function ErrorRow({
  item,
  criterion,
  rubricName,
  pricingOpen,
  onPricingOpenChange,
  onEdit,
  onMove,
  onRemove,
  onOpenRubric,
}: {
  item: RubricErrorItem;
  criterion?: OverviewCriterion;
  rubricName: string;
  pricingOpen: boolean;
  onPricingOpenChange: (open: boolean) => void;
  onEdit: () => void;
  onMove: () => void;
  onRemove: () => void;
  onOpenRubric: (name: string) => void;
}) {
  const unpriced = item.deduction === null;
  const shown = item.alsoIn.slice(0, 2);
  const more = item.alsoIn.length - shown.length;
  const verb = unpriced ? 'Đặt' : 'Sửa';
  return (
    <div data-testid="error-row" className={`flex flex-col gap-2 border-t border-border px-4 py-3 first:border-t-0 ${ROW_GRID}`}>
      <div className="min-w-0">
        <b className="font-semibold">{item.name}</b>
        <p className="mt-px text-small text-muted-foreground">{item.description}</p>
        {item.alsoIn.length > 0 && (
          <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 text-caption text-muted-foreground">
            <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
            <span>
              Cũng dùng ở{' '}
              {shown.map((a, i) => (
                <span key={a.rubricName}>
                  {i > 0 && '; '}
                  <b>{a.rubricName}</b> ({deductionLabel(a.deduction)})
                </span>
              ))}
              {more > 0 && ' và '}
            </span>
            {more > 0 && (
              <UsesMore
                label={`${more} rubric khác`}
                title={`${item.name} — đang dùng ở ${item.alsoIn.length} rubric khác`}
                items={item.alsoIn.map((a) => ({ key: a.rubricName, name: a.rubricName, value: deductionLabel(a.deduction) }))}
                onPick={onOpenRubric}
              />
            )}
          </div>
        )}
      </div>

      <div>
        <DetectionBadge predicate={item.predicate} />
      </div>

      <div className="flex items-center gap-2 lg:justify-end">
        <Popover
          open={pricingOpen}
          onOpenChange={onPricingOpenChange}
          label={`${verb} điểm trừ ${item.name}`}
          anchor={
            unpriced ? (
              <span className="flex items-center gap-2">
                <Badge variant="warning">
                  <TriangleAlert className="h-3 w-3" aria-hidden="true" />
                  Chưa có điểm trừ
                </Badge>
                <Button type="button" size="sm" variant="outline" className="border-primary text-primary" onClick={() => onPricingOpenChange(true)}>
                  Đặt điểm trừ
                </Button>
              </span>
            ) : (
              <button
                type="button"
                aria-label={`Sửa điểm trừ ${item.name}, hiện ${formatDeductionString(item.deduction)}`}
                onClick={() => onPricingOpenChange(true)}
                className="group inline-flex h-[34px] items-center gap-2 rounded-md border border-transparent px-2.5 text-body font-bold tabular-nums hover:border-border hover:bg-surface-2"
              >
                {formatDeductionString(item.deduction)}
                <Pencil className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100" aria-hidden="true" />
              </button>
            )
          }
        >
          <PricePopover key={item.id} item={item} rubricName={rubricName} criterion={criterion} onClose={() => onPricingOpenChange(false)} />
        </Popover>
      </div>

      <div className="text-small tabular-nums text-muted-foreground">
        {item.appliedTo.results > 0 ? `${item.appliedTo.results} bài · ${item.appliedTo.sessions} phiên` : 'Chưa gặp bài nào'}
      </div>

      <div className="flex lg:justify-end">
        <ErrorMenu item={item} onEdit={onEdit} onMove={onMove} onRemove={onRemove} />
      </div>
    </div>
  );
}
