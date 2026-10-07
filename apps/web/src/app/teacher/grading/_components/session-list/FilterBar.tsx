'use client';

import type { RefObject } from 'react';
import { ChevronDown, Search, TriangleAlert, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { EMPTY_LIST_FILTERS, hasActiveFilters, type FacetKey, type FacetOption, type ListFilters } from '@/lib/session-list';
import { cn } from '@/lib/utils';

const FACET_LABEL: Record<FacetKey, string> = { semesters: 'Học kỳ', classIds: 'Lớp', examTypes: 'Loại kỳ thi', rooms: 'Phòng' };
const TIME_LABEL: Record<ListFilters['time'], string> = { all: 'Tất cả', '7': '7 ngày qua', '30': '30 ngày qua' };

export interface FilterBarProps {
  filters: ListFilters;
  options: Record<FacetKey, FacetOption[]>;
  /** Số phiên thiếu rubric theo các bộ lọc khác. */
  noRubricCount: number;
  onChange: (next: ListFilters) => void;
  searchRef: RefObject<HTMLInputElement | null>;
}

function chipClass(active: boolean) {
  return cn('gap-1.5', active && 'border-primary/40 bg-primary-subtle text-primary hover:bg-primary-subtle');
}

function FacetFilter({ facet, options, selected, onChange }: { facet: FacetKey; options: FacetOption[]; selected: string[]; onChange: (next: string[]) => void }) {
  const chosen = options.filter((o) => selected.includes(o.value));
  const summary = chosen.length === 0 ? '' : chosen.length === 1 ? chosen[0].label : `${chosen.length} đã chọn`;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="sm" className={chipClass(selected.length > 0)}>
          <span>{FACET_LABEL[facet]}{summary && ':'}</span>
          {summary && <span className="max-w-36 truncate font-semibold">{summary}</span>}
          <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-80 min-w-56 overflow-auto">
        {options.map((o) => (
          <DropdownMenuCheckboxItem
            key={o.value}
            checked={selected.includes(o.value)}
            // Giữ menu mở sau mỗi lần chọn: lọc thường là chọn nhiều giá trị liên tiếp.
            onSelect={(e) => e.preventDefault()}
            onCheckedChange={() => onChange(selected.includes(o.value) ? selected.filter((v) => v !== o.value) : [...selected, o.value])}
          >
            <span className="flex-1 truncate">{o.label}</span>
            <span className="ml-4 text-caption tabular-nums text-muted-foreground">{o.count}</span>
          </DropdownMenuCheckboxItem>
        ))}
        {selected.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onChange([])}>Bỏ chọn</DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Ô tìm + bộ lọc. Không có bộ lọc theo môn: `courseName` là hằng số ở mọi phiên (spec D5). Không có công
 * tắc lưu trữ (spec D4). Bộ lọc nhiều lựa chọn trong nhóm là OR, giữa các nhóm là AND.
 */
export function FilterBar({ filters, options, noRubricCount, onChange, searchRef }: FilterBarProps) {
  const set = (patch: Partial<ListFilters>) => onChange({ ...filters, ...patch });
  return (
    <div className="flex flex-col gap-3">
      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <input
          ref={searchRef}
          type="search"
          value={filters.q}
          onChange={(e) => set({ q: e.target.value })}
          placeholder="Tìm theo tên phiên, lớp, phòng…"
          aria-label="Tìm phiên"
          autoComplete="off"
          className="h-9 w-full rounded-md border border-input bg-surface pl-9 pr-10 text-small placeholder:text-muted-foreground"
        />
        <kbd aria-hidden="true" className="absolute right-2 top-2 grid h-5 min-w-5 place-items-center rounded border border-border bg-surface-2 px-1 text-caption font-semibold text-muted-foreground">
          /
        </kbd>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(['semesters', 'classIds', 'examTypes', 'rooms'] as FacetKey[]).map((facet) => (
          <FacetFilter key={facet} facet={facet} options={options[facet]} selected={filters[facet]} onChange={(next) => onChange({ ...filters, [facet]: next } as ListFilters)} />
        ))}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="outline" size="sm" className={chipClass(filters.time !== 'all')}>
              <span>Thời gian{filters.time !== 'all' && ':'}</span>
              {filters.time !== 'all' && <span className="font-semibold">{TIME_LABEL[filters.time]}</span>}
              <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-44">
            <DropdownMenuRadioGroup value={filters.time} onValueChange={(v) => set({ time: v as ListFilters['time'] })}>
              {(Object.keys(TIME_LABEL) as ListFilters['time'][]).map((t) => (
                <DropdownMenuRadioItem key={t} value={t}>{TIME_LABEL[t]}</DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-pressed={filters.noRubric}
          onClick={() => set({ noRubric: !filters.noRubric })}
          className={cn('gap-1.5', filters.noRubric && 'border-warning-strong/50 bg-warning-subtle text-warning-strong hover:bg-warning-subtle')}
        >
          <TriangleAlert className="h-3.5 w-3.5" aria-hidden="true" />
          Thiếu rubric
          <span className="text-caption tabular-nums">{noRubricCount}</span>
        </Button>

        {hasActiveFilters(filters) && (
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange(EMPTY_LIST_FILTERS)}>
            <X className="h-3.5 w-3.5" aria-hidden="true" />
            Xoá bộ lọc
          </Button>
        )}
      </div>
    </div>
  );
}
