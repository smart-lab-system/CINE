'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  useReactTable,
  getCoreRowModel,
  createColumnHelper,
  flexRender,
} from '@tanstack/react-table';
import { PageHeader } from '@/components/layout/page-header';
import { PageShell } from '@/components/layout/page-shell';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { apiFetchJson } from '@/lib/api-fetch';
import type { SeatingTemplateListItem } from '@/components/labs/seating-template-utils';

const columnHelper = createColumnHelper<SeatingTemplateListItem>();

export default function SeatingTemplatesPage() {
  const [search, setSearch] = useState('');
  const queryClient = useQueryClient();

  const { data, error, isLoading } = useQuery({
    queryKey: ['seating-templates', search],
    queryFn: () =>
      apiFetchJson<{ items: SeatingTemplateListItem[]; total: number }>(
        `/seating-templates?search=${encodeURIComponent(search)}&page=1&pageSize=50`,
      ),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiFetchJson(`/seating-templates/${id}`, { method: 'DELETE' });
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['seating-templates'] }),
  });

  const columns = [
    columnHelper.accessor('name', { header: 'Tên' }),
    columnHelper.accessor('description', {
      header: 'Mô tả',
      cell: ({ getValue }) => getValue() || '—',
    }),
    columnHelper.display({
      id: 'size',
      header: 'Kích thước',
      cell: ({ row }) =>
        `${row.original.canvasWidth} × ${row.original.canvasHeight}`,
    }),
    columnHelper.accessor('seatCount', { header: 'Số ghế' }),
    columnHelper.display({
      id: 'actions',
      header: 'Thao tác',
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" asChild>
            <Link href={`/seating-templates/${row.original.id}`}>
              Xem / Sửa
            </Link>
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={() => {
              if (window.confirm(`Xóa mẫu "${row.original.name}"?`)) {
                deleteMutation.mutate(row.original.id);
              }
            }}
          >
            Xóa
          </Button>
        </div>
      ),
    }),
  ];

  const table = useReactTable({
    data: data?.items ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <PageShell>
      <PageHeader
        title="Sơ đồ mẫu"
        description="Bản vẽ chỗ ngồi dùng lại được, không gắn máy trạm hay phần cứng."
        actions={
          <Button asChild>
            <Link href="/seating-templates/new">Thêm mẫu</Link>
          </Button>
        }
      />
      <Input
        placeholder="Tìm theo tên hoặc mô tả…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-sm"
      />
      {isLoading ? (
        <Card>
          <p className="p-4 text-sm text-muted-foreground">Đang tải…</p>
        </Card>
      ) : error ? (
        <Card>
          <p role="alert" className="p-4 text-sm text-destructive">
            Không tải được danh sách sơ đồ mẫu.
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
                      {flexRender(
                        header.column.columnDef.header,
                        header.getContext(),
                      )}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={columns.length} className="text-sm text-muted-foreground">
                    Chưa có sơ đồ mẫu.
                  </TableCell>
                </TableRow>
              ) : (
                table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>
      )}
    </PageShell>
  );
}
