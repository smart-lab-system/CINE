'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
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
import { Badge } from '@/components/ui/badge';
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
import { BatchRenameDialog } from '@/components/labs/batch-rename-dialog';
import type { BatchRenameItem } from '@/components/labs/batch-rename-utils';
import { apiClient } from '@/lib/api-client';

interface WorkstationRow {
  id: string;
  assetCode: string;
  hostname: string;
  macAddress: string | null;
  staticIpAddress: string | null;
  serialNumber: string | null;
  operatingSystem: string | null;
  isEnabled: boolean;
  type: 'master' | 'client';
  status: 'available' | 'maintenance' | 'broken' | 'retired';
  notes: string | null;
}

const TYPE_LABELS: Record<WorkstationRow['type'], string> = {
  master: 'Máy giảng viên',
  client: 'Máy sinh viên',
};

const STATUS_LABELS: Record<WorkstationRow['status'], string> = {
  available: 'Sẵn sàng',
  maintenance: 'Bảo trì',
  broken: 'Hỏng',
  retired: 'Ngừng dùng',
};

const wsHelper = createColumnHelper<WorkstationRow>();

export default function LabWorkstationsPage() {
  const params = useParams<{ id: string }>();
  const labId = params.id;
  const queryClient = useQueryClient();
  const [renameOpen, setRenameOpen] = useState(false);

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

  const wsQuery = useQuery({
    queryKey: ['labs', labId, 'workstations'],
    queryFn: async () => {
      const pageSize = 100;
      const first = await fetchWorkstationPage(labId, 1, pageSize);
      const items = [...first.items];
      const totalPages = Math.max(1, Math.ceil(first.total / pageSize));
      for (let page = 2; page <= totalPages; page += 1) {
        const next = await fetchWorkstationPage(labId, page, pageSize);
        items.push(...next.items);
      }
      return { items, total: first.total };
    },
  });

  const batchRenameMutation = useMutation({
    mutationFn: async (items: BatchRenameItem[]) => {
      const { error, response } = await apiClient.PATCH(
        '/labs/{labId}/workstations/batch-rename',
        {
          params: { path: { labId } },
          body: { items },
        },
      );
      if (response?.status === 409) {
        throw new Error(
          'Mã TS hoặc hostname bị trùng. Không có thay đổi nào được lưu.',
        );
      }
      if (error || !response?.ok) {
        throw new Error(apiErrorMessage(error, response?.status ?? 0));
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['labs', labId, 'workstations'],
      });
      setRenameOpen(false);
    },
  });

  const deleteWsMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await apiClient.DELETE(
        '/labs/{labId}/workstations/{id}',
        { params: { path: { labId, id } } },
      );
      if (error) throw error;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ['labs', labId, 'workstations'],
      }),
  });

  const columns = [
    wsHelper.accessor('assetCode', { header: 'Mã TS' }),
    wsHelper.accessor('hostname', { header: 'Hostname' }),
    wsHelper.accessor('type', {
      header: 'Loại máy',
      cell: ({ getValue }) => {
        const type = getValue();
        return (
          <Badge variant={type === 'master' ? 'master' : 'client'}>
            {TYPE_LABELS[type] ?? (type === 'master' ? 'Máy giảng viên' : 'Máy sinh viên')}
          </Badge>
        );
      },
    }),
    wsHelper.accessor('macAddress', { header: 'MAC' }),
    wsHelper.accessor('status', {
      header: 'Trạng thái',
      cell: ({ getValue }) => STATUS_LABELS[getValue()],
    }),
    wsHelper.accessor('isEnabled', {
      header: 'Bật',
      cell: ({ getValue }) => (getValue() ? 'Có' : 'Không'),
    }),
    wsHelper.display({
      id: 'actions',
      header: 'Thao tác',
      cell: ({ row }) => (
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" asChild>
            <Link
              href={`/labs/${labId}/workstations/${row.original.id}/edit`}
            >
              Sửa
            </Link>
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={() => {
              if (window.confirm(`Xóa máy ${row.original.assetCode}?`)) {
                deleteWsMutation.mutate(row.original.id);
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
    data: wsQuery.data?.items ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <PageShell>
      <PageHeader
        title={
          labQuery.data
            ? `Máy trạm — ${labQuery.data.code}`
            : 'Máy trạm'
        }
        description="Danh sách máy trong phòng."
        actions={
          <Button asChild>
            <Link href={`/labs/${labId}/workstations/new`}>Thêm máy</Link>
          </Button>
        }
      />
      <LabSubnav labId={labId} />

      {wsQuery.isLoading ? (
        <Card>
          <p className="p-4 text-sm text-muted-foreground">Đang tải…</p>
        </Card>
      ) : wsQuery.error ? (
        <Card>
          <p role="alert" className="p-4 text-sm text-destructive">
            Không tải được danh sách máy trạm.
          </p>
        </Card>
      ) : (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b p-3">
            <Button
              type="button"
              variant="outline"
              disabled={(wsQuery.data?.items.length ?? 0) === 0}
              onClick={() => {
                batchRenameMutation.reset();
                setRenameOpen(true);
              }}
            >
              Batch Rename / Quick Auto-fill
            </Button>
          </div>
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

      <BatchRenameDialog
        open={renameOpen}
        workstations={wsQuery.data?.items ?? []}
        defaultPrefix={
          labQuery.data?.code ? `${labQuery.data.code}.` : ''
        }
        isSubmitting={batchRenameMutation.isPending}
        errorMessage={
          batchRenameMutation.error instanceof Error
            ? batchRenameMutation.error.message
            : batchRenameMutation.error
              ? 'Không đặt mã hàng loạt được.'
              : null
        }
        onClose={() => {
          if (batchRenameMutation.isPending) return;
          setRenameOpen(false);
          batchRenameMutation.reset();
        }}
        onApply={(items) => batchRenameMutation.mutate(items)}
      />
    </PageShell>
  );
}

function apiErrorMessage(error: unknown, status: number): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message;
    if (Array.isArray(message) && message.length > 0) {
      return message.map(String).join(', ');
    }
  }
  return `Yêu cầu thất bại (HTTP ${status})`;
}

async function fetchWorkstationPage(
  labId: string,
  page: number,
  pageSize: number,
): Promise<{ items: WorkstationRow[]; total: number }> {
  const { data, error, response } = await apiClient.GET(
    '/labs/{labId}/workstations',
    { params: { path: { labId }, query: { page, pageSize } } },
  );
  if (error || !response.ok) {
    throw error ?? new Error(`Yêu cầu thất bại (HTTP ${response.status})`);
  }
  return data as unknown as { items: WorkstationRow[]; total: number };
}
