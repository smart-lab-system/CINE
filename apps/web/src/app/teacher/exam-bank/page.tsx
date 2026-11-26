'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { BookMarked, Plus } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/layout/empty-state';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useCourseExams, useExamBankCourses } from '@/hooks/useExamBank';
import { ExamBankDownloadDocxButton } from './_components/ExamBankDocxActions';

export default function ExamBankPage() {
  const courses = useExamBankCourses();
  const courseList = courses.data ?? [];
  const [courseId, setCourseId] = useState<string | null>(null);

  const effectiveCourseId = useMemo(() => {
    if (courseId && courseList.some((c) => c.id === courseId)) return courseId;
    return courseList[0]?.id ?? null;
  }, [courseId, courseList]);

  const exams = useCourseExams(effectiveCourseId);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Kho đề"
        description="Đề thi thuộc môn học - dùng chung giữa các giảng viên được phân công dạy môn đó. Đề chưa gắn phiên thi có thể xóa."
        actions={
          effectiveCourseId ? (
            <Button asChild>
              <Link href={`/teacher/exam-bank/new?courseId=${effectiveCourseId}`}>
                <Plus className="mr-2 h-4 w-4" />
                Tạo đề nháp
              </Link>
            </Button>
          ) : null
        }
      />

      {courses.isError && (
        <Alert variant="destructive">
          <AlertDescription>Không tải được danh sách môn.</AlertDescription>
        </Alert>
      )}

      {courses.isLoading ? (
        <Skeleton className="h-10 w-72" />
      ) : courseList.length === 0 ? (
        <EmptyState
          icon={BookMarked}
          title="Chưa có môn để mở kho đề"
          description="Kho đề theo môn học. Bạn cần được quản trị viên phân công một lớp thuộc môn học này để tạo đề."
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-muted-foreground">Môn học</span>
            <Select
              value={effectiveCourseId ?? undefined}
              onValueChange={(v) => setCourseId(v)}
            >
              <SelectTrigger className="w-72">
                <SelectValue placeholder="Chọn môn" />
              </SelectTrigger>
              <SelectContent>
                {courseList.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.code} - {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {exams.isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : exams.isError ? (
            <Alert variant="destructive">
              <AlertDescription>Không tải được danh sách đề.</AlertDescription>
            </Alert>
          ) : (exams.data ?? []).length === 0 ? (
            <EmptyState
              icon={BookMarked}
              title="Chưa có đề trong môn này"
              description="Tạo đề nháp với một hoặc nhiều câu. Có thể đánh dấu sẵn sàng khi nội dung ổn định."
              action={
                effectiveCourseId ? (
                  <Button asChild>
                    <Link href={`/teacher/exam-bank/new?courseId=${effectiveCourseId}`}>
                      Tạo đề nháp
                    </Link>
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tiêu đề</TableHead>
                      <TableHead>Loại</TableHead>
                      <TableHead>Trạng thái</TableHead>
                      <TableHead className="text-right">Số câu</TableHead>
                      <TableHead className="text-right">Điểm đề</TableHead>
                      <TableHead className="text-right">Đã phân bổ</TableHead>
                      <TableHead className="text-right">Cập nhật</TableHead>
                      <TableHead className="text-right">Tải</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(exams.data ?? []).map((exam) => (
                      <TableRow key={exam.id}>
                        <TableCell>
                          <Link
                            href={`/teacher/exam-bank/${exam.id}`}
                            className="font-medium text-primary hover:underline"
                          >
                            {exam.title}
                          </Link>
                          <span className="ml-2 text-xs text-muted-foreground">
                            {exam.language}
                          </span>
                        </TableCell>
                        <TableCell className="text-sm">
                          {exam.examType === 'TK'
                            ? 'Thường kỳ'
                            : exam.examType === 'GK'
                              ? 'Giữa kỳ'
                              : 'Cuối kỳ'}
                        </TableCell>
                        <TableCell>
                          <Badge variant={exam.status === 'ready' ? 'success' : 'default'}>
                            {exam.status === 'ready' ? 'Sẵn sàng' : 'Nháp'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">{exam.questionCount}</TableCell>
                        <TableCell className="text-right">{exam.totalPoints}</TableCell>
                        <TableCell className="text-right">{exam.allocatedPoints}</TableCell>
                        <TableCell className="text-right text-muted-foreground text-sm">
                          {new Date(exam.updatedAt).toLocaleString('vi-VN')}
                        </TableCell>
                        <TableCell className="text-right">
                          <ExamBankDownloadDocxButton examId={exam.id} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
