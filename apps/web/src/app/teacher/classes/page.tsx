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
import { useTeachingClasses } from '@/hooks/useTeaching';

/**
 * The lecturer's classes, and the way in to each one's roster.
 *
 * Read-only about the class itself — a lecturer does not create classes or
 * reassign themselves; a Trưởng khoa does that. What is theirs is the list
 * of who is in it.
 */
export default function TeacherClassesPage() {
  const classes = useTeachingClasses();

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Lớp của tôi"
        description="Các lớp bạn được phân công. Mỗi lớp có một danh sách sinh viên — đó là thứ quyết định ai vào được phiên thi."
      />

      <Card className="overflow-hidden">
        <CardContent className="p-0">
          {classes.isLoading ? (
            <div className="flex flex-col gap-3 p-6">
              <Skeleton className="h-5 w-1/3" />
              <Skeleton className="h-5 w-1/2" />
            </div>
          ) : classes.isError ? (
            <div className="p-6">
              <Alert variant="destructive">
                <AlertDescription>{classes.error.message}</AlertDescription>
              </Alert>
            </div>
          ) : (classes.data?.length ?? 0) === 0 ? (
            <EmptyState
              icon={GraduationCap}
              title="Bạn chưa được giao lớp nào"
              description="Trưởng khoa là người tạo lớp và phân công giảng viên. Chưa có lớp thì chưa tạo được phiên thi."
              tone="muted"
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead scope="col">Môn</TableHead>
                    <TableHead scope="col">Lớp</TableHead>
                    <TableHead scope="col">Sĩ số</TableHead>
                    <TableHead scope="col" className="text-right">
                      <span className="sr-only">Hành động</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {classes.data!.map((klass) => (
                    <TableRow key={klass.id}>
                      <TableCell className="whitespace-nowrap">
                        <span className="font-mono font-medium">{klass.courseCode}</span>{' '}
                        <span className="text-muted-foreground">{klass.courseName}</span>
                      </TableCell>
                      <TableCell className="font-medium">{klass.name}</TableCell>
                      <TableCell className="whitespace-nowrap tabular-nums">
                        {klass.studentCount === 0 ? (
                          // Not an empty cell: a class with no roster admits
                          // nobody, and the lecturer should see that here
                          // rather than at the start of the exam.
                          <span className="text-warning-strong">chưa có danh sách</span>
                        ) : (
                          `${klass.studentCount} sinh viên`
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right">
                        <Button asChild variant="ghost" size="sm">
                          <Link href={`/teacher/classes/${klass.id}/roster`}>
                            <Users className="h-4 w-4" aria-hidden="true" />
                            Danh sách SV
                          </Link>
                        </Button>
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
