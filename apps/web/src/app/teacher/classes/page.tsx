'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { GraduationCap, Pencil, Plus, Trash2, Users } from 'lucide-react';
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
import type { TeachingClass } from '@/lib/api/teaching';
import { ClassFormDialog } from './_components/class-form-dialog';
import { DeleteClassDialog } from './_components/delete-class-dialog';

/**
 * The lecturer's classes, and the way in to each one's roster.
 *
 * Lớp là của chính giảng viên từ đợt thu hẹp master data: họ TẠO, SỬA và
 * XOÁ lớp của mình ngay tại đây. Trước đây Trưởng khoa tạo lớp rồi phân
 * công; vai trò đó không còn, và nếu trang này chỉ đọc thì không ai tạo
 * được lớp nữa — tức là không ai tạo được phiên thi.
 *
 * KHÔNG còn bộ lọc học kỳ. Một lớp không thuộc kỳ nào nữa — bảng `semester`
 * biến mất cùng đợt này, và chỉ PHIÊN THI mới chụp tên kỳ. Danh sách lớp
 * vẫn tích tụ theo năm, và khi nó dài tới mức khó đọc thì thứ cần thêm là
 * ô tìm kiếm, không phải một bộ lọc theo thứ dữ liệu không mang.
 *
 * KHÔNG còn nhập lớp hàng loạt từ tệp. `POST /classes/import` nhận email
 * giảng viên theo từng dòng và tạo môn dưới quyền sở hữu khoa — cả hai khái
 * niệm đã biến mất, nên route và hộp thoại của nó bị xoá cùng đợt. Thiết kế
 * lại khi có nhu cầu thật.
 */
export default function TeacherClassesPage() {
  const classes = useTeachingClasses();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<TeachingClass | null>(null);
  const [deleting, setDeleting] = useState<TeachingClass | null>(null);

  // Gợi ý tên môn lấy từ chính các lớp đã có. Đây là thứ bù lại phần lớn
  // những gì mất khi môn thành văn bản tự do: hai lớp chỉ còn nhận ra nhau
  // là "cùng môn" khi chuỗi khớp chính xác.
  const courseSuggestions = useMemo(
    () => [...new Set((classes.data ?? []).map((k) => k.courseName))].sort(),
    [classes.data],
  );

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(klass: TeachingClass) {
    setEditing(klass);
    setFormOpen(true);
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Lớp của tôi"
        description="Các lớp bạn dạy. Mỗi lớp có một danh sách sinh viên — đó là thứ quyết định ai vào được phiên thi."
        actions={
          <Button type="button" onClick={openCreate}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Tạo lớp
          </Button>
        }
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
              title="Bạn chưa có lớp nào"
              description="Tạo lớp và nhập danh sách sinh viên — chưa có lớp thì chưa tạo được phiên thi."
              tone="muted"
              action={
                <Button type="button" onClick={openCreate}>
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Tạo lớp
                </Button>
              }
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
                      <TableCell className="font-medium">{klass.courseName}</TableCell>
                      <TableCell>{klass.name}</TableCell>
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
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => openEdit(klass)}
                          aria-label={`Sửa lớp ${klass.name}`}
                        >
                          <Pencil className="h-4 w-4" aria-hidden="true" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeleting(klass)}
                          aria-label={`Xoá lớp ${klass.name}`}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
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

      <ClassFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        editing={editing}
        courseSuggestions={courseSuggestions}
      />
      <DeleteClassDialog
        target={deleting}
        onOpenChange={(next) => {
          if (!next) setDeleting(null);
        }}
      />
    </div>
  );
}
