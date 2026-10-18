'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, ChevronsUpDown, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export type SearchableSelectOption = {
  value: string;
  label: string;
  /** Chuỗi phụ để tìm (vd. tên đầy đủ). */
  keywords?: string;
};

/**
 * Select gõ để lọc — dùng khi danh sách dài (lớp, phòng…). Không phụ thuộc cmdk.
 */
export function SearchableSelect({
  value,
  onValueChange,
  options,
  placeholder = 'Chọn…',
  searchPlaceholder = 'Tìm…',
  emptyText = 'Không có kết quả.',
  allowClear = false,
  clearLabel = 'Tất cả',
  disabled,
  className,
  ariaLabel,
}: {
  value: string;
  onValueChange: (value: string) => void;
  options: SearchableSelectOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  /** Khi true, mục đầu là clear (value ""). */
  allowClear?: boolean;
  clearLabel?: string;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
}) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const selected = options.find((o) => o.value === value);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => {
      const hay = `${o.label} ${o.keywords ?? ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [options, query]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function pick(next: string) {
    onValueChange(next);
    setOpen(false);
    setQuery('');
  }

  return (
    // min-w-0: flex/grid cha không bị label dài kéo rộng vượt khung (dialog, filter bar).
    <div ref={rootRef} className={cn('relative min-w-0 max-w-full', className)}>
      <Button
        type="button"
        variant="outline"
        disabled={disabled}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={ariaLabel}
        className="h-auto min-h-10 w-full min-w-0 max-w-full justify-between gap-2 overflow-hidden font-normal"
        onClick={() => setOpen((v) => !v)}
      >
        <span
          className={cn(
            'min-w-0 flex-1 overflow-hidden text-left text-ellipsis whitespace-nowrap',
            !selected && !value && 'text-muted-foreground',
          )}
          title={selected?.label}
        >
          {selected?.label ?? (value === '' && allowClear ? clearLabel : placeholder)}
        </span>
        <ChevronsUpDown className="size-4 shrink-0 opacity-50" aria-hidden />
      </Button>
      {open ? (
        <div
          id={listId}
          role="listbox"
          className="absolute z-50 mt-1 w-full min-w-0 overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
        >
          <div className="relative mb-1 min-w-0">
            <Search
              className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              className="h-8 min-w-0 pl-7"
              autoFocus
            />
          </div>
          <ul className="max-h-56 overflow-y-auto overflow-x-hidden">
            {allowClear ? (
              <li className="min-w-0">
                <button
                  type="button"
                  role="option"
                  aria-selected={value === ''}
                  className={cn(
                    'flex w-full min-w-0 items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent-subtle',
                    value === '' && 'bg-accent-subtle',
                  )}
                  onClick={() => pick('')}
                >
                  <Check
                    className={cn('size-3.5 shrink-0', value === '' ? 'opacity-100' : 'opacity-0')}
                  />
                  <span className="min-w-0 flex-1 truncate">{clearLabel}</span>
                </button>
              </li>
            ) : null}
            {filtered.length === 0 ? (
              <li className="px-2 py-1.5 text-sm text-muted-foreground">{emptyText}</li>
            ) : (
              filtered.map((o) => (
                <li key={o.value} className="min-w-0">
                  <button
                    type="button"
                    role="option"
                    aria-selected={value === o.value}
                    className={cn(
                      'flex w-full min-w-0 items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent-subtle',
                      value === o.value && 'bg-accent-subtle',
                    )}
                    onClick={() => pick(o.value)}
                  >
                    <Check
                      className={cn(
                        'size-3.5 shrink-0',
                        value === o.value ? 'opacity-100' : 'opacity-0',
                      )}
                    />
                    <span className="min-w-0 flex-1 truncate" title={o.label}>
                      {o.label}
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
