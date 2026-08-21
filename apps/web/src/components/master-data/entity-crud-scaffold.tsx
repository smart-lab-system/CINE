'use client';

import type { ReactNode } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { useReactTable, getCoreRowModel, flexRender } from '@tanstack/react-table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

/** Shared presentational half of the Master Data CRUD pages: search input,
 * the loading/error/table swap, and the create/edit form swap. Copied
 * line-for-line from AccountsPage's JSX (Foundation plan) and parameterized
 * — each entity page supplies only `columns` and its own form component. */
export function EntityCrudScaffold<TItem>({
  title,
  searchPlaceholder,
  search,
  onSearchChange,
  columns,
  items,
  isLoading,
  error,
  errorMessage,
  createTitle,
  editTitle,
  isEditing,
  createForm,
  editForm,
}: {
  title: string;
  searchPlaceholder: string;
  search: string;
  onSearchChange: (value: string) => void;
  columns: ColumnDef<TItem, any>[];
  items: TItem[];
  isLoading: boolean;
  error: unknown;
  errorMessage: string;
  createTitle: string;
  editTitle: string | null;
  isEditing: boolean;
  createForm: ReactNode;
  editForm: ReactNode;
}) {
  const table = useReactTable({ data: items, columns, getCoreRowModel: getCoreRowModel() });

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-8">
      <h1 className="text-2xl font-semibold">{title}</h1>

      <Input
        placeholder={searchPlaceholder}
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        className="max-w-xs"
      />

      {/* Without these two branches a failed request renders an empty table
          indistinguishable from "no rows yet" — same reasoning AccountsPage
          already documents. */}
      {isLoading ? (
        <Card>
          <p className="p-4 text-sm text-muted-foreground">Đang tải…</p>
        </Card>
      ) : error ? (
        <Card>
          <p role="alert" className="p-4 text-sm text-destructive">
            {errorMessage}
          </p>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead key={header.id}>
                      {flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{isEditing ? editTitle : createTitle}</CardTitle>
        </CardHeader>
        <CardContent>{isEditing ? editForm : createForm}</CardContent>
      </Card>
    </main>
  );
}
