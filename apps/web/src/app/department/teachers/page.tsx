'use client';

import Link from 'next/link';
import { GraduationCap, Users } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/layout/empty-state';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useDepartmentTeachers } from '@/hooks/useDepartment';

/**
 * QA-reported gap (point 7): "ở trưởng khoa, ko có quản lý giảng viên hiện
 * tại có trong khoa" — a head could assign a lecturer to a class (the
 * global picker in the class form), but had nowhere to see who is
 * currently teaching for them.
 *
 * Deliberately read-only, unlike the four ResourceShell-based CRUD screens
 * this section otherwise has: the teacher ACCOUNT stays admin's to
 * create/edit/delete (/admin/accounts) — this is a head's view of who is
 * teaching in their department, not a second place to manage accounts. A
 * teacher only appears here once actually assigned to a class (see
 * /department/classes) — this page has nothing of its own to add.
 *
 * Vì thế nó rỗng đúng lúc cần nhất: một khoa vừa lập chưa gán ai, và
 * câu hỏi thật lúc đó là "phân công ở đâu". Empty state phải trả lời
 * bằng một nút, không phải bằng một câu mô tả — đúng như `EmptyState`
 * đã nói về prop `action` của chính nó.
 */
export default function DepartmentTeachersPage() {
  const teachers = useDepartmentTeachers();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Giảng viên trong khoa"
        description="Các giảng viên hiện đang phụ trách ít nhất một lớp thuộc môn học của bạn."
      />

      {teachers.error && (
        <Alert variant="destructive">
          <AlertDescription>{teachers.error.message}</AlertDescription>
        </Alert>
      )}

      <Card className="overflow-hidden">
        <CardContent className="p-0">
          {teachers.isLoading ? (
            <div className="flex flex-col gap-3 p-6">
              <Skeleton className="h-5 w-1/3" />
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-5 w-1/2" />
            </div>
          ) : !teachers.data || teachers.data.length === 0 ? (
            <EmptyState
              icon={Users}
              title="Chưa có giảng viên nào"
              description="Danh sách này suy ra từ việc phân công: một giảng viên xuất hiện ở đây ngay khi bạn gán họ vào một lớp thuộc môn của khoa. Việc gán làm ở mục Lớp học."
              tone="muted"
              action={
                <Button asChild>
                  <Link href="/department/classes">
                    <GraduationCap className="h-4 w-4" aria-hidden="true" />
                    Tới Lớp học
                  </Link>
                </Button>
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead scope="col">Giảng viên</TableHead>
                    <TableHead scope="col">Email</TableHead>
                    <TableHead scope="col" className="text-right">
                      Số lớp đang dạy
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {teachers.data.map((teacher) => (
                    <TableRow key={teacher.id}>
                      <TableCell className="font-medium text-foreground">
                        {teacher.name}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{teacher.email}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {teacher.classCount}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
