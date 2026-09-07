'use client';

import type { ReactNode } from 'react';
import { Pencil, Plus, Trash2, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/layout/empty-state';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export interface ResourceColumn<T> {
  label: string;
  render: (row: T) => ReactNode;
  /** Narrow, non-wrapping columns like codes and counts. */
  tight?: boolean;
}

interface ResourceShellProps<T> {
  title: string;
  description: string;
  icon: LucideIcon;
  addLabel: string;
  onAdd: () => void;
  onEdit: (row: T) => void;
  onDelete: (row: T) => void;
  columns: ResourceColumn<T>[];
  rows: T[] | undefined;
  rowKey: (row: T) => string;
  isLoading: boolean;
  error: Error | null;
  emptyTitle: string;
  emptyDescription: string;
  /**
   * Control lọc, đặt giữa tiêu đề và nút thêm. Là một slot chứ không phải một
   * prop `semesterId` cụ thể: shell này không nên biết học kỳ là gì, và trang
   * thứ tư (Phòng thi) lọc theo thứ khác hoặc không lọc gì.
   */
  filter?: ReactNode;
  /** Rendered under the header — dialogs, extra notices. */
  children?: ReactNode;
  /**
   * Extra per-row controls, placed before edit and delete. Used where a row
   * leads somewhere rather than just being edited in place — a class opens
   * onto its roster.
   */
  rowActions?: (row: T) => ReactNode;
}

/**
 * The four academic-resource screens are the same screen with different
 * columns: a list, an add button, and per-row edit and delete. Sharing the
 * frame keeps their loading, empty and error states identical, which is the
 * part that otherwise drifts — one page ends up with a spinner, another with
 * a blank table, and a third with nothing at all when the request fails.
 *
 * Forms stay in the pages. They are the part that genuinely differs, and a
 * generic form builder would cost more than the four it replaced.
 */
export function ResourceShell<T>({
  title,
  description,
  icon: Icon,
  addLabel,
  onAdd,
  onEdit,
  onDelete,
  columns,
  rows,
  rowKey,
  isLoading,
  error,
  emptyTitle,
  emptyDescription,
  filter,
  children,
  rowActions,
}: ResourceShellProps<T>) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-h1 text-foreground">{title}</h1>
          <p className="text-body text-muted-foreground">{description}</p>
        </div>
        <div className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-start">
          {filter}
          <Button onClick={onAdd} className="self-start">
            <Plus className="h-4 w-4" aria-hidden="true" />
            {addLabel}
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      )}

      <Card className="overflow-hidden">
        <CardHeader className="border-b border-border bg-surface-2/60">
          <CardTitle className="text-h3">{title}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex flex-col gap-3 p-6">
              <Skeleton className="h-5 w-1/3" />
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-5 w-1/2" />
            </div>
          ) : !rows || rows.length === 0 ? (
            <EmptyState
              icon={Icon}
              title={emptyTitle}
              description={emptyDescription}
              tone="muted"
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    {columns.map((column) => (
                      <TableHead key={column.label} scope="col">
                        {column.label}
                      </TableHead>
                    ))}
                    {/* Actions column: labelled for screen readers, blank on
                        screen so it does not read as data. */}
                    <TableHead scope="col" className="text-right">
                      <span className="sr-only">Hành động</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={rowKey(row)}>
                      {columns.map((column) => (
                        <TableCell
                          key={column.label}
                          className={column.tight ? 'whitespace-nowrap' : undefined}
                        >
                          {column.render(row)}
                        </TableCell>
                      ))}
                      <TableCell className="whitespace-nowrap text-right">
                        {rowActions?.(row)}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onEdit(row)}
                          aria-label="Sửa"
                        >
                          <Pencil className="h-4 w-4" aria-hidden="true" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onDelete(row)}
                          aria-label="Xoá"
                        >
                          <Trash2 className="h-4 w-4 text-danger-strong" aria-hidden="true" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {children}
    </div>
  );
}
