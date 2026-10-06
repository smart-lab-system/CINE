'use client';

import Link from 'next/link';
import { GraduationCap, Users } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/layout/empty-state';
import { SemesterYearFilter } from '@/components/layout/semester-year-filter';
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
import { useSemesterYearFilter } from '@/hooks/useSemesterYearFilter';
import { useTeachingClasses } from '@/hooks/useTeaching';
import { semesterTextOf } from '@/lib/master-data-forms';
import { isFiltering } from '@/lib/semester-filter';

/**
 * Các lớp bạn được giao, và đường vào danh sách sinh viên của từng lớp.
 *
 * CHỈ ĐỌC. Lớp do quản trị viên tạo và giao (spec §2.3, §5.2) — đảo lại thay đổi 21/09, khi giảng viên tự tạo lớp của mình. Route ghi lớp
 * là `@Roles('admin')` nên một nút "Tạo lớp" còn sót ở đây là một nút bấm ra 403. Thứ giảng viên vẫn tự làm là DANH SÁCH SINH VIÊN của
 * lớp (tải file hoặc thêm tay), vì họ là người biết ai thật sự học.
 *
 * Bộ lọc Năm học → Học kỳ mặc định "Tất cả": một giảng viên dạy qua nhiều kỳ không được mất lớp của kỳ cũ chỉ vì bộ lọc chọn sẵn một kỳ
 * khác. Bộ lọc chỉ hẹp tầm nhìn, không bao giờ chặn thao tác (CLAUDE.md §1.2).
 */
export default function TeacherClassesPage() {
  const filter = useSemesterYearFilter('teacher-classes');
  const classes = useTeachingClasses(filter.params);
  const filtering = isFiltering(filter.selection);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Lớp của tôi"
        description="Các lớp bạn được giao. Mỗi lớp có một danh sách sinh viên — đó là thứ quyết định ai vào được phiên thi."
      />

      <SemesterYearFilter
        semesters={filter.semesters}
        selection={filter.selection}
        onYearChange={filter.setYear}
        onSemesterChange={filter.setSemester}
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
            // Hai câu chuyện khác nhau, không được nói chung một câu: "bạn chưa được giao lớp nào" (không có việc gì để làm — chờ admin)
            // và "bộ lọc này không có lớp nào" (nới bộ lọc). Chữ cũ mời giảng viên TẠO lớp — giờ là một lời mời sai.
            filtering ? (
              <EmptyState
                icon={GraduationCap}
                title="Không có lớp nào trong bộ lọc này"
                description="Thử chọn học kỳ khác, hoặc xem tất cả lớp bạn được giao."
                tone="muted"
                action={
                  <Button type="button" variant="outline" onClick={filter.clear}>
                    Xem tất cả học kỳ
                  </Button>
                }
              />
            ) : (
              <EmptyState
                icon={GraduationCap}
                title="Chưa có lớp nào được giao cho bạn"
                description="Lớp do quản trị viên tạo và giao cho bạn. Khi có lớp mới, nó sẽ hiện ở đây."
                tone="muted"
              />
            )
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead scope="col">Lớp</TableHead>
                    <TableHead scope="col">Học kỳ</TableHead>
                    <TableHead scope="col">Sĩ số</TableHead>
                    <TableHead scope="col" className="text-right">
                      <span className="sr-only">Hành động</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {classes.data!.map((klass) => (
                    <TableRow key={klass.id}>
                      <TableCell className="font-medium">{klass.label}</TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {semesterTextOf(klass)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap tabular-nums">
                        {klass.studentCount === 0 ? (
                          // Không phải ô trống: một lớp chưa có danh sách thì không sinh viên nào vào được phiên thi, và giảng viên
                          // nên thấy điều đó ở đây chứ không phải vào hôm thi.
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
