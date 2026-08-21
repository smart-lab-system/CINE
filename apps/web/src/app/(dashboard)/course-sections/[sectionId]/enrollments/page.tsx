'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
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

interface EnrolledStudent {
  id: string;
  enrolledAt: string;
  student: { id: string; studentCode: string; fullName: string };
}

interface StudentSearchResult {
  id: string;
  studentCode: string;
  fullName: string;
}

export default function CourseSectionEnrollmentsPage() {
  // Client Components read dynamic route params via useParams() rather than
  // the `params` prop — in Next 15 that prop is a Promise, which useParams()
  // avoids entirely.
  const { sectionId } = useParams<{ sectionId: string }>();
  const queryClient = useQueryClient();
  const [studentSearch, setStudentSearch] = useState('');

  const enrollmentsQuery = useQuery({
    queryKey: ['course-section-enrollments', sectionId],
    queryFn: async () => {
      const { data, error, response } = await apiClient.GET(
        '/course-sections/{sectionId}/enrollments',
        { params: { path: { sectionId }, query: { page: 1, pageSize: 100 } } },
      );
      if (error || !response.ok) {
        throw error ?? new Error(`Yêu cầu thất bại (HTTP ${response.status})`);
      }
      return data as unknown as { items: EnrolledStudent[]; total: number };
    },
  });

  const studentSearchQuery = useQuery({
    queryKey: ['students', studentSearch],
    queryFn: async () => {
      const { data, error, response } = await apiClient.GET('/students', {
        params: { query: { search: studentSearch, page: 1, pageSize: 20 } },
      });
      if (error || !response.ok) {
        throw error ?? new Error(`Yêu cầu thất bại (HTTP ${response.status})`);
      }
      return (data as unknown as { items: StudentSearchResult[] }).items;
    },
    enabled: studentSearch.length > 0,
  });

  const invalidateEnrollments = () =>
    queryClient.invalidateQueries({ queryKey: ['course-section-enrollments', sectionId] });

  const enrollMutation = useMutation({
    mutationFn: async (studentId: string) => {
      const { error } = await apiClient.POST('/course-sections/{sectionId}/enrollments', {
        params: { path: { sectionId } },
        body: { studentId },
      });
      if (error) throw error;
    },
    onSuccess: invalidateEnrollments,
  });

  const unenrollMutation = useMutation({
    mutationFn: async (studentId: string) => {
      const { error } = await apiClient.DELETE(
        '/course-sections/{sectionId}/enrollments/{studentId}',
        { params: { path: { sectionId, studentId } } },
      );
      if (error) throw error;
    },
    onSuccess: invalidateEnrollments,
  });

  const enrolledStudentIds = new Set(
    (enrollmentsQuery.data?.items ?? []).map((item) => item.student.id),
  );

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-8">
      <h1 className="text-2xl font-semibold">Quản lý sinh viên trong lớp học phần</h1>

      <Card>
        <CardHeader>
          <CardTitle>Thêm sinh viên</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Input
            placeholder="Tìm theo mã số hoặc họ tên..."
            value={studentSearch}
            onChange={(e) => setStudentSearch(e.target.value)}
            className="max-w-xs"
          />
          {studentSearch && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mã số sinh viên</TableHead>
                  <TableHead>Họ tên</TableHead>
                  <TableHead>Thao tác</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(studentSearchQuery.data ?? []).map((student) => (
                  <TableRow key={student.id}>
                    <TableCell>{student.studentCode}</TableCell>
                    <TableCell>{student.fullName}</TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        size="sm"
                        disabled={enrolledStudentIds.has(student.id)}
                        onClick={() => enrollMutation.mutate(student.id)}
                      >
                        {enrolledStudentIds.has(student.id) ? 'Đã có trong lớp' : 'Thêm'}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Danh sách sinh viên đã đăng ký</CardTitle>
        </CardHeader>
        <CardContent>
          {enrollmentsQuery.isLoading ? (
            <p className="p-4 text-sm text-muted-foreground">Đang tải…</p>
          ) : enrollmentsQuery.error ? (
            <p role="alert" className="p-4 text-sm text-destructive">
              Không tải được danh sách sinh viên. Hãy tải lại trang.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mã số sinh viên</TableHead>
                  <TableHead>Họ tên</TableHead>
                  <TableHead>Thao tác</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(enrollmentsQuery.data?.items ?? []).map((enrollment) => (
                  <TableRow key={enrollment.id}>
                    <TableCell>{enrollment.student.studentCode}</TableCell>
                    <TableCell>{enrollment.student.fullName}</TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        onClick={() => {
                          if (
                            window.confirm(
                              `Xóa sinh viên "${enrollment.student.fullName}" khỏi lớp học phần?`,
                            )
                          ) {
                            unenrollMutation.mutate(enrollment.student.id);
                          }
                        }}
                      >
                        Xóa
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
