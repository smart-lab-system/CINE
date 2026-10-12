'use client';

import type { ReactNode } from 'react';
import { Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

export function CatalogFilterBar({
  search,
  onSearchChange,
  searchPlaceholder = 'Tìm kiếm…',
  searchAriaLabel = 'Tìm kiếm',
  filters,
  activeSummary,
  onClear,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  searchAriaLabel?: string;
  filters?: ReactNode;
  /** Chip text khi đang lọc (vd. "Đang xem: 2026-2027"). */
  activeSummary?: string | null;
  onClear?: () => void;
}) {
  const showClear = Boolean(onClear && (search.trim() || activeSummary));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative flex-1 sm:max-w-xs">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchAriaLabel}
            className="pl-9"
          />
        </div>
        {filters}
        {showClear ? (
          <Button type="button" variant="ghost" size="sm" onClick={onClear}>
            <X className="size-4" />
            Xóa lọc
          </Button>
        ) : null}
      </div>
      {activeSummary ? (
        <Badge variant="outline" className="w-fit font-normal">
          {activeSummary}
        </Badge>
      ) : null}
    </div>
  );
}
