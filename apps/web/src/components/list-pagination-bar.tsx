'use client';

import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  PAGE_SIZE_OPTIONS,
  totalPages,
  type PageSize,
} from '@/lib/list-pagination';

export type ListPaginationBarProps = {
  page: number;
  pageSize: PageSize;
  total: number;
  entityLabel: string;
  disabled?: boolean;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: PageSize) => void;
};

export function ListPaginationBar({
  page,
  pageSize,
  total,
  entityLabel,
  disabled,
  onPageChange,
  onPageSizeChange,
}: ListPaginationBarProps) {
  const pages = totalPages(total, pageSize);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-small text-muted-foreground">
      <span>
        Trang {page}/{pages} • {total} {entityLabel}
      </span>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2">
          <span className="whitespace-nowrap">Số dòng</span>
          <Select
            value={String(pageSize)}
            disabled={disabled}
            onValueChange={(v) => onPageSizeChange(Number(v) as PageSize)}
          >
            <SelectTrigger className="h-8 w-[4.5rem]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZE_OPTIONS.map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          Trước
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || page >= pages}
          onClick={() => onPageChange(page + 1)}
        >
          Sau
        </Button>
      </div>
    </div>
  );
}
