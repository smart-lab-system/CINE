'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronRight, CheckCircle2, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EXAM_TYPE_LABELS } from '@/lib/exam-session-display';
import {
  formatSessionDate,
  rowActionOf,
  rowNote,
  sessionHref,
  submittedCount,
  type ListView,
  type RowGroup,
  type SessionRow,
  type SortKey,
} from '@/lib/session-list';
import { cn } from '@/lib/utils';
import { SessionProgress } from './SessionProgress';
import { StatusPill } from './StatusPill';

export interface SessionTableProps {
  groups: RowGroup[];
  view: ListView;
  onSort: (key: SortKey) => void;
  selected: ReadonlySet<string>;
  onToggleRows: (ids: string[], on: boolean) => void;
  collapsed: ReadonlySet<string>;
  onToggleGroup: (key: string) => void;
  onStart: (row: SessionRow) => void;
  density: 'cozy' | 'compact';
  now: number;
}

/** Ô chọn ba trạng thái: `indeterminate` chỉ đặt được qua thuộc tính DOM, không qua prop. */
function TriCheckbox({ checked, indeterminate, onChange, label }: { checked: boolean; indeterminate: boolean; onChange: (on: boolean) => void; label: string }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      aria-label={label}
      className="h-4 w-4 cursor-pointer accent-primary"
    />
  );
}

function SortHead({ label, sortKey, view, onSort, className }: { label: string; sortKey: SortKey; view: ListView; onSort: (k: SortKey) => void; className?: string }) {
  const active = view.sortKey === sortKey;
  const Icon = !active ? ArrowUpDown : view.sortDir === 'asc' ? ArrowUp : ArrowDown;
  return (
    <th
      scope="col"
      aria-sort={active ? (view.sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={cn('sticky top-0 z-10 h-10 bg-surface-2 px-3 text-left text-caption font-semibold text-muted-foreground', active && 'text-foreground', className)}
    >
      <button type="button" onClick={() => onSort(sortKey)} className="inline-flex items-center gap-1 hover:text-foreground">
        {label}
        <Icon className={cn('h-3 w-3', !active && 'opacity-50')} aria-hidden="true" />
      </button>
    </th>
  );
}

const PlainHead = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <th scope="col" className={cn('sticky top-0 z-10 h-10 bg-surface-2 px-3 text-left text-caption font-semibold text-muted-foreground', className)}>
    {children}
  </th>
);

function Row({ row, selected, onToggle, onStart, now }: { row: SessionRow; selected: boolean; onToggle: (on: boolean) => void; onStart: (r: SessionRow) => void; now: number }) {
  const s = row.session;
  const when = formatSessionDate(s.startTime);
  const note = rowNote(row, now);
  const action = rowActionOf(row);
  const typeLabel = EXAM_TYPE_LABELS[s.examType] ?? s.examType;
  const actionLabel = `${action.label}: ${s.name}${s.className ? `, ${s.className}` : ''}`;

  return (
    <tr data-selected={selected} className="border-b border-border last:border-0 hover:bg-surface-2 data-[selected=true]:bg-primary-subtle">
      <td className="px-0 py-2.5 text-center align-middle group-data-[density=compact]:py-1.5">
        <input
          type="checkbox"
          checked={selected}
          onChange={(e) => onToggle(e.target.checked)}
          aria-label={`Chọn phiên ${s.name}${s.className ? `, ${s.className}` : ''}`}
          className="h-4 w-4 cursor-pointer accent-primary"
        />
      </td>
      <td className="px-3 py-2.5 align-middle group-data-[density=compact]:py-1.5">
        <Link href={sessionHref(s.id)} title={s.name} className="line-clamp-2 text-body font-semibold text-foreground hover:underline group-data-[density=compact]:line-clamp-1">
          {s.name}
        </Link>
        <span className="block truncate text-caption text-muted-foreground">
          <span className="min-[1240px]:hidden">{typeLabel} · </span>
          {[s.className, s.roomName].filter(Boolean).join(' · ')}
        </span>
      </td>
      <td className="whitespace-nowrap px-3 py-2.5 align-middle tabular-nums group-data-[density=compact]:py-1.5">
        <span className="block">{when.date}</span>
        <span className="block text-caption text-muted-foreground">{when.time}</span>
      </td>
      <td className="hidden px-3 py-2.5 align-middle min-[1240px]:table-cell group-data-[density=compact]:py-1.5">
        <span className="inline-flex h-6 items-center rounded-md border border-border bg-surface-2 px-2 text-caption font-medium">{typeLabel}</span>
      </td>
      <td className="whitespace-nowrap px-3 py-2.5 align-middle tabular-nums group-data-[density=compact]:py-1.5">
        <span className="font-semibold">{submittedCount(s)}</span>
        <span className="text-muted-foreground">{s.rosterKnown && s.expectedCount > 0 ? `/${s.expectedCount}` : ''}</span>
      </td>
      <td className="px-3 py-2.5 align-middle group-data-[density=compact]:py-1.5">
        <StatusPill status={row.status} />
        {note && (
          <span
            className={cn(
              'mt-1 flex items-center gap-1 text-caption group-data-[density=compact]:hidden',
              note.tone === 'warn' ? 'font-medium text-warning-strong' : 'font-medium text-success-strong',
            )}
          >
            {note.tone === 'warn' ? <TriangleAlert className="h-3 w-3" aria-hidden="true" /> : <CheckCircle2 className="h-3 w-3" aria-hidden="true" />}
            {note.text}
          </span>
        )}
      </td>
      <td className="px-3 py-2.5 align-middle group-data-[density=compact]:py-1.5">
        <SessionProgress row={row} />
      </td>
      <td className="px-3 py-2.5 text-right align-middle group-data-[density=compact]:py-1.5">
        {action.kind === 'link' ? (
          <Button asChild size="sm" variant={action.tone === 'primary' ? 'default' : action.tone}>
            <Link href={action.href} aria-label={actionLabel}>{action.label}</Link>
          </Button>
        ) : (
          <Button type="button" size="sm" onClick={() => onStart(row)} aria-label={actionLabel}>
            {action.label}
          </Button>
        )}
      </td>
    </tr>
  );
}

/**
 * Bảng phiên. Cột "Loại" ẩn dưới 1240px (loại kỳ thi chuyển lên dòng phụ của tên); dưới 820px bảng cuộn
 * ngang trong khung của nó — đầu bảng dính chỉ hoạt động khi khung không cuộn.
 */
export function SessionTable({ groups, view, onSort, selected, onToggleRows, collapsed, onToggleGroup, onStart, density, now }: SessionTableProps) {
  const allRows = groups.flatMap((g) => g.rows);
  const allIds = allRows.map((r) => r.session.id);
  const pickedAll = allIds.length > 0 && allIds.every((id) => selected.has(id));
  const pickedSome = allIds.some((id) => selected.has(id));

  return (
    <div data-density={density} className="group overflow-clip rounded-lg border border-border bg-surface shadow-sm max-[819px]:overflow-x-auto">
      <table className="w-full table-fixed border-separate border-spacing-0 text-small max-[819px]:min-w-[780px]" aria-label="Danh sách phiên chấm">
        <colgroup>
          <col className="w-10" />
          <col />
          <col className="w-[104px]" />
          <col className="hidden w-[92px] min-[1240px]:table-column" />
          <col className="w-[76px]" />
          <col className="w-[152px]" />
          <col className="w-[184px]" />
          <col className="w-[140px]" />
        </colgroup>
        <thead>
          <tr>
            <PlainHead className="px-0 text-center">
              <TriCheckbox checked={pickedAll} indeterminate={!pickedAll && pickedSome} onChange={(on) => onToggleRows(allIds, on)} label="Chọn tất cả phiên đang hiện" />
            </PlainHead>
            <SortHead label="Phiên thi" sortKey="name" view={view} onSort={onSort} />
            <SortHead label="Ngày thi" sortKey="date" view={view} onSort={onSort} />
            <PlainHead className="hidden min-[1240px]:table-cell">Loại</PlainHead>
            <SortHead label="Bài nộp" sortKey="submitted" view={view} onSort={onSort} />
            <SortHead label="Trạng thái" sortKey="priority" view={view} onSort={onSort} />
            <PlainHead>Tiến độ chấm</PlainHead>
            <PlainHead><span className="sr-only">Thao tác</span></PlainHead>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => {
            const open = g.key === null || !collapsed.has(g.key);
            const ids = g.rows.map((r) => r.session.id);
            const inGroup = ids.filter((id) => selected.has(id)).length;
            const attention = g.rows.filter((r) => r.status === 'attention').length;
            const ready = g.rows.filter((r) => r.status === 'ready').length;
            return [
              g.key !== null && (
                <tr key={`group-${g.key}`} className="bg-surface-2">
                  <td className="border-b border-border px-0 text-center">
                    <TriCheckbox checked={inGroup === ids.length && ids.length > 0} indeterminate={inGroup > 0 && inGroup < ids.length} onChange={(on) => onToggleRows(ids, on)} label={`Chọn cả nhóm ${g.label}`} />
                  </td>
                  <td colSpan={7} className="border-b border-border p-0">
                    <button type="button" aria-expanded={open} onClick={() => onToggleGroup(g.key!)} className="flex h-10 w-full items-center gap-3 px-3 text-left text-small">
                      <ChevronRight className={cn('h-4 w-4 transition-transform', open && 'rotate-90')} aria-hidden="true" />
                      <span className="font-semibold">{g.label}</span>
                      <span className="text-caption text-muted-foreground">{ids.length} phiên</span>
                      {attention > 0 && <span className="rounded-full bg-warning-subtle px-2 py-0.5 text-caption font-semibold text-warning-strong">{attention} cần xem</span>}
                      {ready > 0 && <span className="rounded-full bg-success-subtle px-2 py-0.5 text-caption font-semibold text-success-strong">{ready} sẵn sàng chốt</span>}
                    </button>
                  </td>
                </tr>
              ),
              ...(open
                ? g.rows.map((r) => (
                    <Row key={r.session.id} row={r} selected={selected.has(r.session.id)} onToggle={(on) => onToggleRows([r.session.id], on)} onStart={onStart} now={now} />
                  ))
                : []),
            ];
          })}
        </tbody>
      </table>
    </div>
  );
}
