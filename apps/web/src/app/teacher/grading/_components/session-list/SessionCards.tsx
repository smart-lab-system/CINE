'use client';

import Link from 'next/link';
import { CheckCircle2, ChevronRight, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { SessionRow } from '@/lib/session-list';
import { cn } from '@/lib/utils';
import { SessionProgress } from './SessionProgress';
import { groupSummary, sessionRowView } from './session-row-view';
import type { SessionTableProps } from './SessionTable';
import { StatusPill } from './StatusPill';
import { TriCheckbox } from './TriCheckbox';

/** Cùng các thuộc tính với bảng, trừ phần chỉ bảng dùng (tiêu đề cột bấm được để sắp xếp). */
export type SessionCardsProps = Omit<SessionTableProps, 'view' | 'onSort'>;

function Card({
  row,
  selected,
  onToggle,
  onStart,
  now,
  density,
}: {
  row: SessionRow;
  selected: boolean;
  onToggle: (on: boolean) => void;
  onStart: (r: SessionRow) => void;
  now: number;
  density: 'cozy' | 'compact';
}) {
  const v = sessionRowView(row, now);
  const { action, note } = v;

  return (
    <li data-selected={selected} className="flex gap-1 px-3 py-3 data-[selected=true]:bg-primary-subtle">
      {/* Vùng bấm 40px quanh ô chọn 16px; kéo ra mép thẻ để ô chọn thẳng với lề trái. */}
      <label className="-ml-3 -mt-1 flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center">
        <input
          type="checkbox"
          checked={selected}
          onChange={(e) => onToggle(e.target.checked)}
          aria-label={v.selectLabel}
          className="h-4 w-4 cursor-pointer accent-primary"
        />
      </label>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="min-w-0">
          <Link href={v.href} title={v.name} className="line-clamp-2 break-words text-body font-semibold text-foreground hover:underline">
            {v.name}
          </Link>
          <span className="block truncate text-caption text-muted-foreground">{v.meta}</span>
        </div>
        <p className="text-caption tabular-nums text-muted-foreground">
          {`${v.date} ${v.time} · ${v.typeLabel} · ${v.submitted}${v.expected} bài nộp`}
        </p>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <StatusPill status={row.status} />
          {note && density !== 'compact' && (
            <span
              className={cn(
                'flex items-center gap-1 text-caption font-medium',
                note.tone === 'warn' ? 'text-warning-strong' : 'text-success-strong',
              )}
            >
              {note.tone === 'warn' ? <TriangleAlert className="h-3 w-3" aria-hidden="true" /> : <CheckCircle2 className="h-3 w-3" aria-hidden="true" />}
              {note.text}
            </span>
          )}
        </div>
        <SessionProgress row={row} />
        <div className="flex justify-end">
          {action.kind === 'link' ? (
            <Button asChild variant={action.tone === 'primary' ? 'default' : action.tone}>
              <Link href={action.href} aria-label={v.actionLabel}>{action.label}</Link>
            </Button>
          ) : (
            <Button type="button" onClick={() => onStart(row)} aria-label={v.actionLabel}>
              {action.label}
            </Button>
          )}
        </div>
      </div>
    </li>
  );
}

/**
 * Danh sách phiên dạng thẻ cho viewport hẹp (dưới 820px, spec Giai đoạn 2 §5.1): mỗi phiên một thẻ gom tên, trạng thái,
 * tiến độ và nút hành động, để việc chính không nằm ngoài màn. Chữ và điều kiện đọc từ `sessionRowView`, cùng nguồn với
 * bảng. Sắp xếp và nhóm dùng các ô chọn trong thanh lọc, nên thẻ không có tiêu đề cột.
 */
export function SessionCards({ groups, selected, onToggleRows, collapsed, onToggleGroup, onStart, density, now }: SessionCardsProps) {
  return (
    <div data-density={density} className="group overflow-clip rounded-lg border border-border bg-surface shadow-sm">
      <ul aria-label="Danh sách phiên chấm" className="divide-y divide-border">
        {groups.flatMap((g) => {
          const open = g.key === null || !collapsed.has(g.key);
          const ids = g.rows.map((r) => r.session.id);
          const inGroup = ids.filter((id) => selected.has(id)).length;
          const { attention, ready } = groupSummary(g);
          return [
            g.key !== null && (
              <li key={`group-${g.key}`} className="flex items-center bg-surface-2">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center">
                  <TriCheckbox
                    checked={inGroup === ids.length && ids.length > 0}
                    indeterminate={inGroup > 0 && inGroup < ids.length}
                    onChange={(on) => onToggleRows(ids, on)}
                    label={`Chọn cả nhóm ${g.label}`}
                  />
                </span>
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => onToggleGroup(g.key!)}
                  className="flex min-h-10 min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1 py-1 pr-3 text-left text-small"
                >
                  <ChevronRight className={cn('h-4 w-4 shrink-0 transition-transform', open && 'rotate-90')} aria-hidden="true" />
                  <span className="font-semibold">{g.label}</span>
                  <span className="text-caption text-muted-foreground">{ids.length} phiên</span>
                  {attention > 0 && <span className="rounded-full bg-warning-subtle px-2 py-0.5 text-caption font-semibold text-warning-strong">{attention} cần xem</span>}
                  {ready > 0 && <span className="rounded-full bg-success-subtle px-2 py-0.5 text-caption font-semibold text-success-strong">{ready} sẵn sàng chốt</span>}
                </button>
              </li>
            ),
            ...(open
              ? g.rows.map((r) => (
                  <Card
                    key={r.session.id}
                    row={r}
                    selected={selected.has(r.session.id)}
                    onToggle={(on) => onToggleRows([r.session.id], on)}
                    onStart={onStart}
                    now={now}
                    density={density}
                  />
                ))
              : []),
          ];
        })}
      </ul>
    </div>
  );
}
