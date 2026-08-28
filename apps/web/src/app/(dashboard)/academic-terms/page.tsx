'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  useReactTable,
  getCoreRowModel,
  createColumnHelper,
  flexRender,
} from '@tanstack/react-table';
import { apiClient } from '../../../lib/api-client';
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

interface TermRow {
  id: string;
  code: string;
  name: string;
  startsOn: string;
  endsOn: string;
  isActive: boolean;
}

const columnHelper = createColumnHelper<TermRow>();

export default function AcademicTermsPage() {
  const [search, setSearch] = useState('');
  const queryClient = useQueryClient();

  const { data, error, isLoading } = useQuery({
    queryKey: ['academic-terms', search],
    queryFn: async () => {
      const { data, error, response } = await apiClient.GET('/academic-terms', {
        params: { query: { search, page: 1, pageSize: 50 } },
      });
      if (error || !response.ok) {
        throw error ?? new Error(`Yêu cầu thất bại (HTTP ${response.status})`);
      }
      return data as unknown as { items: TermRow[]; total: number };
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await apiClient.DELETE('/academic-terms/{id}', {
        params: { path: { id } },
      });
      if (error) throw error;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['academic-terms'] }),
  });

  const columns = [
    columnHelper.accessor('code', { header: 'Mã' }),
    columnHelper.accessor('name', { header: 'Tên' }),
    columnHelper.accessor('startsOn', { header: 'Bắt đầu' }),
    columnHelper.accessor('endsOn', { header: 'Kết thúc' }),
    columnHelper.accessor((row) => (row.isActive ? 'Có' : 'Không'), {
      header: 'Đang dùng',
    }),
    columnHelper.display({
      id: 'actions',
      header: 'Thao tác',
      cell: ({ row }) => (
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" asChild>
            <Link href={`/academic-terms/${row.original.id}/edit`}>Sửa</Link>
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={() => {
              if (window.confirm(`Xóa học kỳ "${row.original.code}"?`)) {
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
        title="Học kỳ"
        description="Quản lý học kỳ / năm học."
        actions={
          <Button asChild>
            <Link href="/academic-terms/new">Thêm mới</Link>
          </Button>
        }
      />
      <Input
        placeholder="Tìm kiếm..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-xs"
      />
      {isLoading ? (
        <Card>
          <p className="p-4 text-sm text-muted-foreground">Đang tải…</p>
        </Card>
      ) : error ? (
        <Card>
          <p role="alert" className="p-4 text-sm text-destructive">
            Không tải được danh sách học kỳ.
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
              {table.getRowModel().rows.map((row) => (
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
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </PageShell>
  );
}
