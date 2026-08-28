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

interface SectionRow {
  id: string;
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  academicTermId: string;
  termCode: string;
  termName: string;
  sectionCode: string;
  nominalClassCode: string | null;
  name: string | null;
  lecturerId: string | null;
  lecturerCode: string | null;
  lecturerName: string | null;
  maxEnrollment: number | null;
}

const columnHelper = createColumnHelper<SectionRow>();

export default function CourseSectionsPage() {
  const [search, setSearch] = useState('');
  const queryClient = useQueryClient();

  const { data, error, isLoading } = useQuery({
    queryKey: ['course-sections', search],
    queryFn: async () => {
      const { data, error, response } = await apiClient.GET('/course-sections', {
        params: { query: { search, page: 1, pageSize: 50 } },
      });
      if (error || !response.ok) {
        throw error ?? new Error(`Yêu cầu thất bại (HTTP ${response.status})`);
      }
      return data as unknown as { items: SectionRow[]; total: number };
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await apiClient.DELETE('/course-sections/{id}', {
        params: { path: { id } },
      });
      if (error) throw error;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['course-sections'] }),
  });

  const columns = [
    columnHelper.accessor('sectionCode', { header: 'Mã lớp' }),
    columnHelper.accessor(
      (row) => `${row.subjectCode} — ${row.subjectName}`,
      { header: 'Môn' },
    ),
    columnHelper.accessor((row) => `${row.termCode}`, { header: 'Học kỳ' }),
    columnHelper.accessor(
      (row) =>
        row.lecturerCode
          ? `${row.lecturerCode} — ${row.lecturerName ?? ''}`
          : '—',
      { header: 'GV' },
    ),
    columnHelper.accessor('maxEnrollment', { header: 'Sĩ số max' }),
    columnHelper.accessor('nominalClassCode', { header: 'Lớp HC' }),
    columnHelper.display({
      id: 'actions',
      header: 'Thao tác',
      cell: ({ row }) => (
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" asChild>
            <Link href={`/course-sections/${row.original.id}`}>Chi tiết</Link>
          </Button>
          <Button type="button" variant="outline" size="sm" asChild>
            <Link href={`/course-sections/${row.original.id}/edit`}>Sửa</Link>
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={() => {
              if (window.confirm(`Xóa lớp "${row.original.sectionCode}"?`)) {
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
        title="Lớp học phần"
        description="Quản lý lớp học phần và đăng ký sinh viên."
        actions={
          <Button asChild>
            <Link href="/course-sections/new">Thêm mới</Link>
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
            Không tải được danh sách lớp học phần.
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
