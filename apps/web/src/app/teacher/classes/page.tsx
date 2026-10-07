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
 * Lớp do phòng đào tạo / admin phân công — giảng viên không tạo/xoá lớp.
 * Vào roster để kiểm tra / bổ sung SV trước giờ thi.
 */
export default function TeacherClassesPage() {
  const classes = useTeachingClasses();

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Lớp của tôi"
        description="Các lớp được phân công dạy. Mỗi lớp có danh sách sinh viên — quyết định ai vào được phiên thi."
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
              title="Chưa được phân công lớp nào"
              description="Liên hệ quản trị viên để được gắn lớp học phần. Có lớp mới tạo được phiên thi."
              tone="muted"
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
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
                      <TableCell className="font-medium">{klass.name}</TableCell>
                      <TableCell className="whitespace-nowrap tabular-nums">
                        {klass.studentCount === 0 ? (
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
