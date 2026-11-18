'use client';

import type { ReactNode } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';

export function CatalogSection({
  title,
  description,
  onCreate,
  createLabel = 'Thêm',
  loading,
  headers,
  rows,
  empty,
  toolbar,
  footer,
  embedded = false,
}: {
  title: string;
  description?: string;
  onCreate?: () => void;
  createLabel?: string;
  loading?: boolean;
  headers: string[];
  rows: ReactNode;
  empty?: string;
  toolbar?: ReactNode;
  footer?: ReactNode;
  /** Skip Card chrome when nested (e.g. accordion panel). */
  embedded?: boolean;
}) {
  const body = (
    <div className={embedded ? 'space-y-4' : 'pt-6 space-y-4'}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className={embedded ? 'text-base font-semibold' : 'text-lg font-semibold'}>
            {title}
          </h2>
          {description ? (
            <p className="text-sm text-muted-foreground mt-1">{description}</p>
          ) : null}
        </div>
        {onCreate ? (
          <Button type="button" size="sm" onClick={onCreate}>
            <Plus className="size-4" />
            {createLabel}
          </Button>
        ) : null}
      </div>
      {toolbar}
      {loading ? (
        <Skeleton className="h-24 w-full" />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              {headers.map((h, i) => (
                <TableHead key={`${h || 'col'}-${i}`}>{h}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows ?? (
              <TableRow>
                <TableCell colSpan={headers.length} className="text-muted-foreground">
                  {empty ?? 'Chưa có dữ liệu.'}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      )}
      {footer}
    </div>
  );

  if (embedded) return body;

  return (
    <Card>
      <CardContent>{body}</CardContent>
    </Card>
  );
}

export function EditIconButton({
  onClick,
  disabled,
}: {
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      title="Sửa"
    >
      <Pencil className="size-4" />
    </Button>
  );
}

export function DeleteIconButton({
  onClick,
  disabled,
}: {
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      title="Xóa"
    >
      <Trash2 className="size-4" />
    </Button>
  );
}

export function RowActions({ children }: { children: ReactNode }) {
  return <div className="flex justify-end gap-0.5">{children}</div>;
}
