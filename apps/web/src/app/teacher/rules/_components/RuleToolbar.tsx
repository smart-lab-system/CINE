'use client';

import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import type { RuleFilter } from '@/lib/rules-filter';

const CHIPS: { id: RuleFilter; label: string }[] = [
  { id: 'all', label: 'Tất cả' },
  { id: 'unpriced', label: 'Chưa có giá' },
  { id: 'machine', label: 'Máy kiểm được' },
  { id: 'words', label: 'Mô tả bằng lời' },
];

export function RuleToolbar({
  filter,
  onFilter,
  counts,
  query,
  onQuery,
}: {
  filter: RuleFilter;
  onFilter: (filter: RuleFilter) => void;
  counts: Record<RuleFilter, number>;
  query: string;
  onQuery: (query: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div role="group" aria-label="Lọc luật" className="flex flex-wrap gap-1.5">
        {CHIPS.map((chip) => {
          const on = filter === chip.id;
          return (
            <button
              key={chip.id}
              type="button"
              aria-pressed={on}
              onClick={() => onFilter(chip.id)}
              className={`h-8 rounded-full border px-3 text-small transition-colors ${
                on
                  ? 'border-primary bg-primary font-semibold text-primary-foreground'
                  : 'border-border bg-surface font-medium text-foreground hover:bg-surface-2'
              }`}
            >
              {chip.label} · {counts[chip.id]}
            </button>
          );
        })}
      </div>
      <label className="relative flex w-56 items-center">
        <span className="sr-only">Tìm luật</span>
        <Search className="pointer-events-none absolute left-2.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <Input
          type="search"
          value={query}
          placeholder="Tìm luật"
          onChange={(event) => onQuery(event.target.value)}
          className="h-8 pl-8"
        />
      </label>
    </div>
  );
}
