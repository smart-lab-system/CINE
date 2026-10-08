'use client';

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Check, ChevronDown, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { RubricOverview } from '@/lib/api/rubric-errors';
import {
  RECENT_SHOWN,
  filterCounts,
  inSemester,
  pickRubrics,
  pointsText,
  semesterChoices,
  semesterLabel,
  type PickFilter,
  type PickSort,
} from '@/lib/rubric-board';
import { RubricStatus } from './RubricStatus';

const FILTERS: { id: PickFilter; label: string }[] = [
  { id: 'all', label: 'Tất cả' },
  { id: 'todo', label: 'Cần làm' },
  { id: 'ready', label: 'Sẵn sàng' },
  { id: 'new', label: 'Mới' },
];

/**
 * Từ MANY+1 rubric: "Rubric đang mở" + nút Đổi rubric (spec D7, mục 5.6). Bảng chọn có tìm kiếm không phân biệt
 * dấu, lọc tình trạng, lọc học kỳ, sắp xếp, ↑↓ Enter Esc, và 3 rubric mở gần đây để chuyển nhanh.
 *
 * Lọc học kỳ thuộc về TRANG (`sem`, `onSem`): nó phải giữ nguyên sau khi chọn rubric và được đặt lại khi tạo
 * rubric mới. Còn từ khoá / tình trạng / sắp xếp là việc nội bộ của bảng nên ở đây.
 */
export function RubricPicker({
  overviews,
  current,
  recent,
  sem,
  onSem,
  onSelect,
  onNew,
}: {
  overviews: RubricOverview[];
  current: RubricOverview;
  recent: string[];
  sem: string | null;
  onSem: (value: string | null) => void;
  onSelect: (name: string) => void;
  onNew: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<PickFilter>('all');
  const [sort, setSort] = useState<PickSort>('recent');
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const base = useMemo(() => inSemester(overviews, sem), [overviews, sem]);
  const counts = useMemo(() => filterCounts(overviews, sem), [overviews, sem]);
  const choices = useMemo(() => semesterChoices(overviews), [overviews]);
  const list = useMemo(() => pickRubrics(overviews, { q, filter, sort, sem }, recent), [overviews, q, filter, sort, sem, recent]);
  const recentChips = recent.filter((n) => n !== current.rubricName && overviews.some((o) => o.rubricName === n)).slice(0, RECENT_SHOWN);

  useEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open]);

  // Bấm ra ngoài thì đóng.
  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };
  const pick = (name: string) => {
    setQ('');
    setFilter('all');
    setOpen(false);
    onSelect(name);
  };
  const clearAll = () => {
    setQ('');
    setFilter('all');
    onSem(null);
  };

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    if (event.key === 'Enter' && event.target === searchRef.current) {
      event.preventDefault();
      if (list[0]) pick(list[0].rubricName);
      return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const items = [...(wrapRef.current?.querySelectorAll<HTMLElement>('[role="option"]') ?? [])];
    if (items.length === 0) return;
    event.preventDefault();
    const i = items.indexOf(document.activeElement as HTMLElement);
    if (event.key === 'ArrowDown') items[i < 0 ? 0 : Math.min(items.length - 1, i + 1)].focus();
    else if (i <= 0) searchRef.current?.focus();
    else items[i - 1].focus();
  }

  const openTodo = () => {
    setFilter('todo');
    setQ('');
    setOpen(true);
  };

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5">
      <div ref={wrapRef} className="relative" onKeyDown={onKeyDown}>
        <div className="flex items-center gap-3 rounded-lg border border-primary bg-surface py-2 pl-4 pr-2 shadow-sm ring-2 ring-primary-subtle">
          <span className="text-caption font-semibold uppercase tracking-wide text-muted-foreground">Rubric đang mở</span>
          <b className="max-w-[330px] truncate text-h3 text-primary" title={current.rubricName}>
            {current.rubricName}
          </b>
          <RubricStatus overview={current} />
          <Button
            ref={triggerRef}
            type="button"
            variant="outline"
            aria-haspopup="dialog"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            Đổi rubric ({sem === null ? overviews.length : `${base.length}/${overviews.length}`})
            <ChevronDown className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>

        {open && (
          <div
            role="dialog"
            aria-label="Chọn rubric"
            className="absolute left-0 top-full z-30 mt-2 flex w-[620px] max-w-[calc(100vw-2rem)] flex-col rounded-lg border border-border bg-surface shadow-lg"
          >
            <div className="flex flex-col gap-2.5 border-b border-border p-3">
              <input
                ref={searchRef}
                type="search"
                aria-label="Tìm rubric theo tên"
                placeholder="Tìm rubric theo tên…"
                autoComplete="off"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="h-10 w-full rounded-md border border-input bg-surface px-3 text-body focus:border-primary focus:outline-none"
              />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="flex items-center gap-1.5 text-small text-muted-foreground">
                  Học kỳ
                  <select
                    aria-label="Lọc theo học kỳ"
                    value={sem ?? ''}
                    onChange={(e) => onSem(e.target.value === '' ? null : e.target.value)}
                    className="h-8 min-w-[190px] rounded-md border border-input bg-surface px-1.5 text-small"
                  >
                    {choices.map((c) => (
                      <option key={c.value ?? 'all'} value={c.value ?? ''}>
                        {c.label} ({c.count})
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex items-center gap-1.5 text-small text-muted-foreground">
                  Sắp xếp
                  <select
                    aria-label="Sắp xếp"
                    value={sort}
                    onChange={(e) => setSort(e.target.value as PickSort)}
                    className="h-8 rounded-md border border-input bg-surface px-1.5 text-small"
                  >
                    <option value="recent">Dùng gần đây</option>
                    <option value="name">Tên A–Z</option>
                    <option value="todo">Cần làm trước</option>
                  </select>
                </label>
              </div>
              <div role="group" aria-label="Lọc theo tình trạng" className="flex flex-wrap gap-1.5">
                {FILTERS.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    aria-pressed={filter === f.id}
                    onClick={() => setFilter(f.id)}
                    className={cn(
                      'h-7 rounded-full border px-3 text-small font-semibold',
                      filter === f.id ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-surface text-muted-foreground hover:bg-surface-2',
                    )}
                  >
                    {f.label}
                    <span className="ml-1.5 opacity-80">{counts[f.id]}</span>
                  </button>
                ))}
              </div>
            </div>

            <div role="listbox" aria-label="Danh sách rubric" className="max-h-[340px] overflow-auto p-1.5">
              {list.length === 0 ? (
                <div className="flex flex-col items-center gap-2.5 p-6 text-center text-muted-foreground">
                  <p>Không có rubric nào khớp{q.trim() ? ` “${q.trim()}”` : ''}.</p>
                  <Button type="button" size="sm" variant="outline" onClick={clearAll}>
                    Xoá tìm kiếm và bộ lọc
                  </Button>
                </div>
              ) : (
                list.map((o) => {
                  const selected = o.rubricName === current.rubricName;
                  const grading = o.sessions.filter((s) => s.state === 'grading').length;
                  return (
                    <button
                      key={o.rubricName}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      onClick={() => pick(o.rubricName)}
                      className={cn(
                        'flex w-full items-center justify-between gap-3 rounded-md px-2.5 py-2 text-left hover:bg-surface-2 focus-visible:bg-surface-2',
                        selected && 'bg-primary-subtle',
                      )}
                    >
                      <span className="flex min-w-0 flex-col">
                        <b className="truncate font-semibold">{o.rubricName}</b>
                        <span className="text-small text-muted-foreground">
                          {pointsText(o.totalPoints)} · {o.criteria.length} tiêu chí · {o.errorCount} lỗi
                          {grading > 0 ? ` · ${grading} phiên đang chấm` : ''}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        <RubricStatus overview={o} />
                        {selected && <Check className="h-4 w-4 text-primary" aria-hidden="true" />}
                      </span>
                    </button>
                  );
                })
              )}
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-border px-3 py-2">
              <Button type="button" size="sm" variant="ghost" className="text-primary hover:text-primary" onClick={onNew}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                Rubric mới
              </Button>
              <span aria-live="polite" className="text-small text-muted-foreground">
                {list.length} / {base.length} rubric
              </span>
              <span className="text-small text-muted-foreground">↑ ↓ chọn · Enter mở · Esc đóng</span>
            </div>
          </div>
        )}
      </div>

      {recentChips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-small text-muted-foreground">Gần đây:</span>
          {recentChips.map((name) => (
            <button
              key={name}
              type="button"
              title={name}
              onClick={() => onSelect(name)}
              className="h-[30px] max-w-[210px] truncate rounded-full border border-border bg-surface px-3 text-small hover:bg-surface-2"
            >
              {name}
            </button>
          ))}
        </div>
      )}

      <Button type="button" variant="ghost" className="text-primary hover:text-primary" onClick={onNew}>
        <Plus className="h-4 w-4" aria-hidden="true" />
        Rubric mới
      </Button>

      <p className="basis-full text-small text-muted-foreground">
        {sem === null ? `${overviews.length} rubric` : `${base.length} / ${overviews.length} rubric`}
        {' · '}
        <button type="button" className="font-semibold text-primary underline underline-offset-2" onClick={openTodo}>
          {counts.todo} cần làm
        </button>
        {` · ${counts.ready} sẵn sàng · ${counts.new} mới`}
        {sem !== null && (
          <span className="ml-2 inline-flex items-center gap-2 rounded-full bg-primary-subtle px-2.5 py-0.5 text-primary">
            Học kỳ: {semesterLabel(sem)}
            <button type="button" className="font-semibold underline underline-offset-2" onClick={() => onSem(null)}>
              Bỏ lọc
            </button>
          </span>
        )}
      </p>
    </div>
  );
}
