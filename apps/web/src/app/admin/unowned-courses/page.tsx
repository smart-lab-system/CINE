'use client';

import { useState } from 'react';
import { BookOpen, Loader2 } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/layout/empty-state';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useAccounts } from '@/hooks/useAccounts';
import { useAssignCourseOwner, useUnownedCourses } from '@/hooks/useDepartment';

/**
 * Courses with no `department_head_id`.
 *
 * They are invisible to every Trưởng khoa by design — scope is exactly that
 * column — which means they are also unassignable by them. Without this
 * screen the courses created by the initial migration would be a bootstrap
 * deadlock, and any future orphan would simply go quiet. Assigning an owner
 * is an administrative act on ownership, not authoring academic content, so
 * it belongs to admin without contradicting "admin does not touch academic
 * data".
 *
 * An empty list here is the healthy state, and it says so.
 */
export default function UnownedCoursesPage() {
  const unowned = useUnownedCourses();
  // Heads are the only valid owners; the account list is admin-only anyway,
  // which is exactly who is on this page.
  const heads = useAccounts({ page: 1, pageSize: 100, role: 'department_admin' });
  const assign = useAssignCourseOwner();

  const [chosen, setChosen] = useState<Record<string, string>>({});

  const headOptions = heads.data?.items ?? [];
  const noHeads = !heads.isLoading && headOptions.length === 0;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Môn chưa có chủ"
        description="Môn học không thuộc trưởng khoa nào sẽ không hiện trong màn hình của bất kỳ ai. Gán chủ để đưa nó về đúng khoa."
      />

      {assign.error && (
        <Alert variant="destructive">
          <AlertDescription>{assign.error.message}</AlertDescription>
        </Alert>
      )}

      {noHeads && (
        <Alert variant="info">
          <AlertDescription>
            Chưa có tài khoản Trưởng khoa nào. Hãy tạo một tài khoản với vai trò Trưởng khoa
            ở mục Quản lý tài khoản trước.
          </AlertDescription>
        </Alert>
      )}

      <Card className="overflow-hidden">
        <CardContent className="p-0">
          {unowned.isLoading ? (
            <div className="flex flex-col gap-3 p-6">
              <Skeleton className="h-5 w-1/3" />
              <Skeleton className="h-5 w-1/2" />
            </div>
          ) : unowned.isError ? (
            <div className="p-6">
              <Alert variant="destructive">
                <AlertDescription>{unowned.error.message}</AlertDescription>
              </Alert>
            </div>
          ) : (unowned.data?.length ?? 0) === 0 ? (
            <EmptyState
              icon={BookOpen}
              title="Mọi môn học đều đã có chủ"
              description="Không có gì cần xử lý. Môn học tạo mới luôn thuộc về người tạo, nên danh sách này chỉ có dữ liệu cũ."
              tone="muted"
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead scope="col">Mã môn</TableHead>
                    <TableHead scope="col">Tên môn</TableHead>
                    <TableHead scope="col">Giao cho</TableHead>
                    <TableHead scope="col" className="text-right">
                      <span className="sr-only">Hành động</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {unowned.data!.map((course) => (
                    <TableRow key={course.id}>
                      <TableCell className="whitespace-nowrap font-mono font-medium">
                        {course.code}
                      </TableCell>
                      <TableCell>{course.name}</TableCell>
                      <TableCell className="min-w-[14rem]">
                        <Select
                          value={chosen[course.id] ?? ''}
                          onValueChange={(value) =>
                            setChosen((prev) => ({ ...prev, [course.id]: value }))
                          }
                        >
                          <SelectTrigger aria-label={`Chọn trưởng khoa cho ${course.code}`}>
                            <SelectValue placeholder="Chọn trưởng khoa" />
                          </SelectTrigger>
                          <SelectContent>
                            {headOptions.map((head) => (
                              <SelectItem key={head.id} value={head.id}>
                                {head.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right">
                        <Button
                          size="sm"
                          disabled={!chosen[course.id] || assign.isPending}
                          onClick={() =>
                            assign.mutate({
                              id: course.id,
                              departmentHeadId: chosen[course.id],
                            })
                          }
                        >
                          {assign.isPending && (
                            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                          )}
                          Gán
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
