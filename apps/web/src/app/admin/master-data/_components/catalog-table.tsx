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
}: {
  title: string;
  description?: string;
  onCreate?: () => void;
  createLabel?: string;
  loading?: boolean;
  headers: string[];
  rows: ReactNode;
  empty?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-6 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">{title}</h2>
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
        {loading ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                {headers.map((h) => (
                  <TableHead key={h}>{h}</TableHead>
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
      </CardContent>
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
      onClick={onClick}
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
      onClick={onClick}
      title="Xóa"
    >
      <Trash2 className="size-4" />
    </Button>
  );
}

export function RowActions({ children }: { children: ReactNode }) {
  return <div className="flex justify-end gap-0.5">{children}</div>;
}
