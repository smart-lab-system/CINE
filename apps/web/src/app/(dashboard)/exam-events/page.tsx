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
import { ExamStatusBadge } from '@/components/exams/exam-status-badge';
import { SESSION_TYPE_LABELS } from '@/components/exams/exam-status';
import { formatDateTime } from '@/components/exams/datetime-local';
import type {
  ExamEventListItem,
  ExamEventStatus,
  SubjectOption,
} from '@/components/exams/exam-types';
import { PageHeader } from '@/components/layout/page-header';
import { PageShell } from '@/components/layout/page-shell';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { throwOnApiError } from '@/components/exams/exam-api';
import { apiClient } from '@/lib/api-client';

const columnHelper = createColumnHelper<ExamEventListItem>();

const STATUS_FILTER: { value: '' | ExamEventStatus; label: string }[] = [
  { value: '', label: 'Tất cả trạng thái' },
  { value: 'draft', label: 'Nháp' },
  { value: 'scheduled', label: 'Đã công bố' },
  { value: 'active', label: 'Đang diễn ra' },
  { value: 'completed', label: 'Hoàn thành' },
  { value: 'cancelled', label: 'Đã hủy' },
  { value: 'aborted', label: 'Dừng' },
];

export default function ExamEventsPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'' | ExamEventStatus>('');
  const queryClient = useQueryClient();

  const subjectsQuery = useQuery({
    queryKey: ['subjects', 'for-exam-list'],
    queryFn: async () => {
      const { data, error, response } = await apiClient.GET('/subjects', {
        params: { query: { page: 1, pageSize: 100 } },
      });
      if (error || !response.ok) {
        throw error ?? new Error(`Yêu cầu thất bại (HTTP ${response.status})`);
      }
      return data as unknown as { items: SubjectOption[]; total: number };
    },
  });

  const { data, error, isLoading } = useQuery({
    queryKey: ['exam-events', search, status],
    queryFn: async () => {
      const result = await apiClient.GET('/exam-events', {
        params: {
          query: {
            search: search || undefined,
            status: status || undefined,
            page: 1,
            pageSize: 50,
          },
        },
      });
      return throwOnApiError(result) as {
        items: ExamEventListItem[];
        total: number;
      };
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      throwOnApiError(
        await apiClient.DELETE('/exam-events/{id}', {
          params: { path: { id } },
        }),
      );
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['exam-events'] }),
  });

  const subjectLabel = (subjectId: string) => {
    const subject = subjectsQuery.data?.items.find((s) => s.id === subjectId);
    return subject ? `${subject.code}` : '—';
  };

  const columns = [
    columnHelper.accessor('code', { header: 'Mã' }),
    columnHelper.accessor('title', { header: 'Tiêu đề' }),
    columnHelper.display({
      id: 'subject',
      header: 'Môn',
      cell: ({ row }) => subjectLabel(row.original.subjectId),
    }),
    columnHelper.accessor('sessionType', {
      header: 'Loại',
      cell: ({ getValue }) => SESSION_TYPE_LABELS[getValue()],
    }),
    columnHelper.accessor('scheduledStartAt', {
      header: 'Bắt đầu',
      cell: ({ getValue }) => formatDateTime(getValue()),
    }),
    columnHelper.accessor('status', {
      header: 'Trạng thái',
      cell: ({ getValue }) => <ExamStatusBadge status={getValue()} />,
    }),
    columnHelper.display({
      id: 'actions',
      header: 'Thao tác',
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" asChild>
            <Link href={`/exam-events/${row.original.id}`}>Chi tiết</Link>
          </Button>
          {row.original.status === 'draft' ? (
            <>
              <Button type="button" variant="outline" size="sm" asChild>
                <Link href={`/exam-events/${row.original.id}/edit`}>Sửa</Link>
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={() => {
                  if (window.confirm(`Xóa đề "${row.original.code}"?`)) {
                    deleteMutation.mutate(row.original.id);
                  }
                }}
              >
                Xóa
              </Button>
            </>
          ) : null}
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
        title="Kỳ thi"
        description="Lên lịch đề thi môn, ca phòng máy và công bố lịch."
        actions={
          <Button asChild>
            <Link href="/exam-events/new">Thêm mới</Link>
          </Button>
        }
      />
      <div className="flex flex-wrap gap-3">
        <Input
          placeholder="Tìm mã hoặc tiêu đề…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <Select
          aria-label="Lọc trạng thái"
          value={status}
          onChange={(e) =>
            setStatus(e.target.value as '' | ExamEventStatus)
          }
          className="max-w-[12rem]"
        >
          {STATUS_FILTER.map((option) => (
            <option key={option.value || 'all'} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </div>
      {isLoading ? (
        <Card>
          <p className="p-4 text-sm text-muted-foreground">Đang tải…</p>
        </Card>
      ) : error ? (
        <Card>
          <p role="alert" className="p-4 text-sm text-destructive">
            Không tải được danh sách kỳ thi.
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
                  <TableCell
                    colSpan={columns.length}
                    className="text-sm text-muted-foreground"
                  >
                    Chưa có kỳ thi.
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
