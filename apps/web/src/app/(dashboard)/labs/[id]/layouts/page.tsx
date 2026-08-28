'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  useReactTable,
  getCoreRowModel,
  createColumnHelper,
  flexRender,
} from '@tanstack/react-table';
import { LabSubnav } from '@/components/labs/lab-subnav';
import { PageHeader } from '@/components/layout/page-header';
import { PageShell } from '@/components/layout/page-shell';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { apiClient } from '@/lib/api-client';

interface LayoutRow {
  id: string;
  name: string;
  versionNo: number;
  canvasWidth: number;
  canvasHeight: number;
  isActive: boolean;
}

const layoutHelper = createColumnHelper<LayoutRow>();

export default function LabLayoutsPage() {
  const params = useParams<{ id: string }>();
  const labId = params.id;
  const queryClient = useQueryClient();

  const labQuery = useQuery({
    queryKey: ['labs', labId],
    queryFn: async () => {
      const { data, error, response } = await apiClient.GET('/labs/{id}', {
        params: { path: { id: labId } },
      });
      if (error || !response.ok) {
        throw error ?? new Error(`Yêu cầu thất bại (HTTP ${response.status})`);
      }
      return data as unknown as { code: string; name: string };
    },
  });

  const layoutsQuery = useQuery({
    queryKey: ['labs', labId, 'layouts'],
    queryFn: async () => {
      const { data, error, response } = await apiClient.GET(
        '/labs/{labId}/layouts',
        { params: { path: { labId }, query: { page: 1, pageSize: 100 } } },
      );
      if (error || !response.ok) {
        throw error ?? new Error(`Yêu cầu thất bại (HTTP ${response.status})`);
      }
      return data as unknown as { items: LayoutRow[]; total: number };
    },
  });

  const activateLayoutMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await apiClient.POST(
        '/labs/{labId}/layouts/{id}/activate',
        { params: { path: { labId, id } } },
      );
      if (error) throw error;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['labs', labId, 'layouts'] }),
  });

  const deleteLayoutMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await apiClient.DELETE('/labs/{labId}/layouts/{id}', {
        params: { path: { labId, id } },
      });
      if (error) throw error;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['labs', labId, 'layouts'] }),
  });

  const columns = [
    layoutHelper.accessor('name', { header: 'Tên' }),
    layoutHelper.accessor('versionNo', { header: 'Phiên bản' }),
    layoutHelper.accessor('isActive', {
      header: 'Đang dùng',
      cell: ({ getValue }) => (getValue() ? 'Có' : 'Không'),
    }),
    layoutHelper.display({
      id: 'actions',
      header: 'Thao tác',
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" asChild>
            <Link href={`/labs/${labId}/layouts/${row.original.id}`}>
              Sơ đồ chỗ ngồi
            </Link>
          </Button>
          {!row.original.isActive && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => activateLayoutMutation.mutate(row.original.id)}
            >
              Kích hoạt
            </Button>
          )}
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={() => {
              if (window.confirm(`Xóa layout "${row.original.name}"?`)) {
                deleteLayoutMutation.mutate(row.original.id);
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
    data: layoutsQuery.data?.items ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <PageShell>
      <PageHeader
        title={
          labQuery.data
            ? `Sơ đồ chỗ ngồi — ${labQuery.data.code}`
            : 'Sơ đồ chỗ ngồi'
        }
        description="Các layout bố trí chỗ ngồi trong phòng."
        actions={
          <Button asChild>
            <Link href={`/labs/${labId}/layouts/new`}>Thêm layout</Link>
          </Button>
        }
      />
      <LabSubnav labId={labId} />

      {layoutsQuery.isLoading ? (
        <Card>
          <p className="p-4 text-sm text-muted-foreground">Đang tải…</p>
        </Card>
      ) : layoutsQuery.error ? (
        <Card>
          <p role="alert" className="p-4 text-sm text-destructive">
            Không tải được danh sách layout.
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
