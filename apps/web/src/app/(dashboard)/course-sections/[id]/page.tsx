'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  useReactTable,
  getCoreRowModel,
  createColumnHelper,
  flexRender,
} from '@tanstack/react-table';
import { PageHeader } from '@/components/layout/page-header';
import { PageShell } from '@/components/layout/page-shell';
import { RosterImportPanel } from '@/components/master-data/roster-import-panel';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { apiClient } from '@/lib/api-client';

interface SectionDetail {
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

interface EnrollmentRow {
  id: string;
  studentId: string;
  studentCode: string;
  fullName: string;
  status: 'active' | 'dropped' | 'withdrawn';
  enrolledAt: string;
}

const ENROLL_STATUS: Record<EnrollmentRow['status'], string> = {
  active: 'Đang học',
  dropped: 'Đã hủy',
  withdrawn: 'Rút',
};

const columnHelper = createColumnHelper<EnrollmentRow>();

export default function CourseSectionDetailPage() {
  const params = useParams<{ id: string }>();
  const sectionId = params.id;
  const [studentId, setStudentId] = useState('');
  const queryClient = useQueryClient();

  const sectionQuery = useQuery({
    queryKey: ['course-sections', sectionId],
    queryFn: async () => {
      const { data, error, response } = await apiClient.GET(
        '/course-sections/{id}',
        { params: { path: { id: sectionId } } },
      );
      if (error || !response.ok) {
        throw error ?? new Error(`Yêu cầu thất bại (HTTP ${response.status})`);
      }
      return data as unknown as SectionDetail;
    },
  });

  const enrollmentsQuery = useQuery({
    queryKey: ['course-sections', sectionId, 'enrollments'],
    queryFn: async () => {
      const { data, error, response } = await apiClient.GET(
        '/course-sections/{id}/enrollments',
        { params: { path: { id: sectionId } } },
      );
      if (error || !response.ok) {
        throw error ?? new Error(`Yêu cầu thất bại (HTTP ${response.status})`);
      }
      return data as unknown as { items: EnrollmentRow[]; total: number };
    },
  });

  const studentsQuery = useQuery({
    queryKey: ['students', 'for-enroll'],
    queryFn: async () => {
      const { data, error, response } = await apiClient.GET('/students', {
        params: { query: { page: 1, pageSize: 100, status: 'active' } },
      });
      if (error || !response.ok) throw error ?? new Error('students failed');
      return data as unknown as {
        items: { id: string; studentCode: string; fullName: string }[];
      };
    },
  });

  const enrollMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await apiClient.POST(
        '/course-sections/{id}/enrollments',
        {
          params: { path: { id: sectionId } },
          body: { studentId: id },
        },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['course-sections', sectionId, 'enrollments'],
      });
      setStudentId('');
    },
  });

  const unenrollMutation = useMutation({
    mutationFn: async (enrollmentId: string) => {
      const { error } = await apiClient.DELETE(
        '/course-sections/{id}/enrollments/{enrollmentId}',
        {
          params: { path: { id: sectionId, enrollmentId } },
        },
      );
      if (error) throw error;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ['course-sections', sectionId, 'enrollments'],
      }),
  });

  const columns = [
    columnHelper.accessor('studentCode', { header: 'MSSV' }),
    columnHelper.accessor('fullName', { header: 'Họ tên' }),
    columnHelper.accessor('status', {
      header: 'Trạng thái',
      cell: ({ getValue }) => ENROLL_STATUS[getValue()],
    }),
    columnHelper.accessor('enrolledAt', {
      header: 'Ngày ghi danh',
      cell: (info) => info.getValue().slice(0, 10),
    }),
    columnHelper.display({
      id: 'actions',
      header: 'Thao tác',
      cell: ({ row }) => (
        <Button
          type="button"
          variant="destructive"
          size="sm"
          onClick={() => {
            if (window.confirm(`Hủy ghi danh "${row.original.studentCode}"?`)) {
              unenrollMutation.mutate(row.original.id);
            }
          }}
        >
          Hủy
        </Button>
      ),
    }),
  ];

  const table = useReactTable({
    data: enrollmentsQuery.data?.items ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  const section = sectionQuery.data;
  const enrolledIds = new Set(
    (enrollmentsQuery.data?.items ?? []).map((e) => e.studentId),
  );
  const availableStudents = (studentsQuery.data?.items ?? []).filter(
    (s) => !enrolledIds.has(s.id),
  );

  return (
    <PageShell>
      <PageHeader
        title={
          section ? `Lớp ${section.sectionCode}` : 'Chi tiết lớp học phần'
        }
        description={
          section
            ? `${section.subjectCode} — ${section.subjectName} · ${section.termCode}`
            : undefined
        }
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href="/course-sections">Quay lại</Link>
            </Button>
            {section ? (
              <Button asChild>
                <Link href={`/course-sections/${sectionId}/edit`}>Sửa</Link>
              </Button>
            ) : null}
          </>
        }
      />

      {sectionQuery.isLoading ? (
        <Card>
          <p className="p-4 text-sm text-muted-foreground">Đang tải…</p>
        </Card>
      ) : sectionQuery.error || !section ? (
        <Card>
          <p role="alert" className="p-4 text-sm text-destructive">
            Không tải được lớp học phần.
          </p>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Thông tin lớp</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <p className="text-muted-foreground">Môn học</p>
                <p className="font-medium">
                  {section.subjectCode} — {section.subjectName}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Học kỳ</p>
                <p className="font-medium">
                  {section.termCode} — {section.termName}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Giảng viên</p>
                <p className="font-medium">
                  {section.lecturerCode
                    ? `${section.lecturerCode} — ${section.lecturerName ?? ''}`
                    : '—'}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Sĩ số tối đa</p>
                <p className="font-medium">{section.maxEnrollment ?? '—'}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Lớp hành chính</p>
                <p className="font-medium">{section.nominalClassCode ?? '—'}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Tên lớp</p>
                <p className="font-medium">{section.name ?? '—'}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>
                Sinh viên ghi danh ({enrollmentsQuery.data?.total ?? 0})
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {enrollmentsQuery.isLoading ? (
                <p className="text-sm text-muted-foreground">Đang tải…</p>
              ) : enrollmentsQuery.error ? (
                <p role="alert" className="text-sm text-destructive">
                  Không tải được danh sách ghi danh.
                </p>
              ) : (
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
              )}

              <form
                className="flex flex-wrap items-end gap-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (studentId) enrollMutation.mutate(studentId);
                }}
              >
                <div className="flex min-w-[240px] flex-1 flex-col gap-1.5">
                  <Label htmlFor="enroll-student">Thêm sinh viên</Label>
                  <Select
                    id="enroll-student"
                    value={studentId}
                    onChange={(e) => setStudentId(e.target.value)}
                  >
                    <option value="">— Chọn sinh viên —</option>
                    {availableStudents.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.studentCode} — {s.fullName}
                      </option>
                    ))}
                  </Select>
                </div>
                <Button type="submit" disabled={!studentId}>
                  Ghi danh
                </Button>
              </form>
            </CardContent>
          </Card>

          <RosterImportPanel
            sectionId={sectionId}
            sectionCode={section.sectionCode}
          />
        </>
      )}
    </PageShell>
  );
}
