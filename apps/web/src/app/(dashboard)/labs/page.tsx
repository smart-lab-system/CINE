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
import { LabRoomProposalsDialog } from '@/components/labs/lab-room-proposals-dialog';

interface LabRow {
  id: string;
  code: string;
  name: string;
  building: string | null;
  floor: string | null;
  capacity: number;
  description: string | null;
  isActive: boolean;
}

const columnHelper = createColumnHelper<LabRow>();

export default function LabsPage() {
  const [search, setSearch] = useState('');
  const [proposalsOpen, setProposalsOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data, error, isLoading } = useQuery({
    queryKey: ['labs', search],
    queryFn: async () => {
      const { data, error, response } = await apiClient.GET('/labs', {
        params: { query: { search, page: 1, pageSize: 50 } },
      });
      if (error || !response.ok) {
        throw error ?? new Error(`Yêu cầu thất bại (HTTP ${response.status})`);
      }
      return data as unknown as { items: LabRow[]; total: number };
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await apiClient.DELETE('/labs/{id}', {
        params: { path: { id } },
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['labs'] }),
  });

  const columns = [
    columnHelper.accessor('code', { header: 'Mã' }),
    columnHelper.accessor('name', { header: 'Tên' }),
    columnHelper.accessor('building', { header: 'Tòa' }),
    columnHelper.accessor('capacity', { header: 'Sức chứa' }),
    columnHelper.accessor('isActive', {
      header: 'Trạng thái',
      cell: ({ getValue }) => (getValue() ? 'Đang dùng' : 'Tắt'),
    }),
    columnHelper.display({
      id: 'actions',
      header: 'Thao tác',
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" asChild>
            <Link href={`/labs/${row.original.id}`}>Chi tiết</Link>
          </Button>
          <Button type="button" variant="outline" size="sm" asChild>
            <Link href={`/labs/${row.original.id}/edit`}>Sửa</Link>
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={() => {
              if (window.confirm(`Xóa phòng "${row.original.code}"?`)) {
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
        title="Phòng máy"
        description="Quản lý phòng máy, máy trạm và sơ đồ chỗ ngồi."
        actions={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => setProposalsOpen(true)}
            >
              Đề xuất phòng lab
            </Button>
            <Button asChild>
              <Link href="/labs/new">Thêm mới</Link>
            </Button>
          </>
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
            Không tải được danh sách phòng máy.
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
      <LabRoomProposalsDialog
        open={proposalsOpen}
        onClose={() => setProposalsOpen(false)}
      />
    </PageShell>
  );
}
