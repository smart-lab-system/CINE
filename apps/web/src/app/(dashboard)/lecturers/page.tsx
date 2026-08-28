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

interface LecturerRow {
  id: string;
  employeeCode: string;
  fullName: string;
  department: string | null;
  academicTitle: string | null;
  email: string | null;
  phone: string | null;
}

const columnHelper = createColumnHelper<LecturerRow>();

export default function LecturersPage() {
  const [search, setSearch] = useState('');
  const queryClient = useQueryClient();

  const { data, error, isLoading } = useQuery({
    queryKey: ['lecturers', search],
    queryFn: async () => {
      const { data, error, response } = await apiClient.GET('/lecturers', {
        params: { query: { search, page: 1, pageSize: 50 } },
      });
      if (error || !response.ok) {
        throw error ?? new Error(`Yêu cầu thất bại (HTTP ${response.status})`);
      }
      return data as unknown as { items: LecturerRow[]; total: number };
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await apiClient.DELETE('/lecturers/{id}', {
        params: { path: { id } },
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['lecturers'] }),
  });

  const columns = [
    columnHelper.accessor('employeeCode', { header: 'Mã GV' }),
    columnHelper.accessor('fullName', { header: 'Họ tên' }),
    columnHelper.accessor('email', { header: 'Email' }),
    columnHelper.accessor('department', { header: 'Khoa/BM' }),
    columnHelper.accessor('academicTitle', { header: 'Học hàm' }),
    columnHelper.display({
      id: 'actions',
      header: 'Thao tác',
      cell: ({ row }) => (
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" asChild>
            <Link href={`/lecturers/${row.original.id}/edit`}>Sửa</Link>
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={() => {
              if (window.confirm(`Xóa GV "${row.original.employeeCode}"?`)) {
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
        title="Giảng viên"
        description="Danh sách giảng viên."
        actions={
          <Button asChild>
            <Link href="/lecturers/new">Thêm mới</Link>
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
            Không tải được danh sách giảng viên.
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
