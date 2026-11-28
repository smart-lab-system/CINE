'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { BookMarked, Plus, Search, X } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/layout/empty-state';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { SearchableSelect } from '@/components/ui/searchable-select';
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
import { TooltipProvider } from '@/components/ui/tooltip';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import {
  useCourseExamsForCourses,
  useExamBankCourses,
} from '@/hooks/useExamBank';
import { useAcademicYears, useSemesters } from '@/hooks/useMasterData';
import {
  COURSE_EXAM_TYPE_OPTIONS,
  type CourseExamType,
} from '@/lib/api/exam-bank';
import { ExamBankPreviewDialog } from './_components/ExamBankPreviewDialog';
import { ExamBankRowActions } from './_components/ExamBankRowActions';
import { buildExamBankRows, filterExamBankRows } from './filter-exam-bank';

const EXAM_TYPE_LABEL: Record<CourseExamType, string> = {
  TK: 'Thường kỳ',
  GK: 'Giữa kỳ',
  CK: 'Cuối kỳ',
};

export default function ExamBankPage() {
  const courses = useExamBankCourses();
  const courseList = courses.data ?? [];
  const years = useAcademicYears({ page: 1, pageSize: 100 });
  const allSemestersQuery = useSemesters({ page: 1, pageSize: 100 });

  const [search, setSearch] = useState('');
  const [courseId, setCourseId] = useState<string | null>(null);
  const [examType, setExamType] = useState<CourseExamType | null>(null);
  const [academicYearId, setAcademicYearId] = useState<string | null>(null);
  const [semesterId, setSemesterId] = useState<string | null>(null);
  const [previewExamId, setPreviewExamId] = useState<string | null>(null);
  const debouncedSearch = useDebouncedValue(search, 300);

  const yearItems = years.data?.items ?? [];
  const allSemesters = allSemestersQuery.data?.items ?? [];
  const semesterItems = useMemo(
    () =>
      academicYearId
        ? allSemesters.filter((s) => s.academicYearId === academicYearId)
        : allSemesters,
    [allSemesters, academicYearId],
  );

  const courseIds = useMemo(() => courseList.map((c) => c.id), [courseList]);
  const exams = useCourseExamsForCourses(courseIds);

  const courseOptions = useMemo(
    () =>
      courseList
        .map((c) => ({
          value: c.id,
          label: `${c.code} - ${c.name}`,
          keywords: `${c.code} ${c.name}`,
        }))
        .sort((a, b) => a.label.localeCompare(b.label, 'vi')),
    [courseList],
  );

  const rows = useMemo(
    () => buildExamBankRows(exams.data ?? [], allSemesters),
    [exams.data, allSemesters],
  );

  const visible = useMemo(
    () =>
      filterExamBankRows(rows, {
        search: debouncedSearch,
        courseId,
        examType,
        academicYearId,
        semesterId,
      }),
    [rows, debouncedSearch, courseId, examType, academicYearId, semesterId],
  );

  const createCourseId = courseId ?? courseList[0]?.id ?? null;

  const hasActiveFilters =
    search.trim() !== '' ||
    courseId !== null ||
    examType !== null ||
    academicYearId !== null ||
    semesterId !== null;

  function clearFilters() {
    setSearch('');
    setCourseId(null);
    setExamType(null);
    setAcademicYearId(null);
    setSemesterId(null);
  }

  function onYearChange(value: string) {
    const next = value === 'all' ? null : value;
    setAcademicYearId(next);
    setSemesterId(null);
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Kho đề"
        description="Đề thi thuộc môn học - dùng chung giữa các giảng viên được phân công dạy môn đó. Đề chưa gắn phiên thi có thể xóa."
        actions={
          createCourseId ? (
            <Button asChild>
              <Link href={`/teacher/exam-bank/new?courseId=${createCourseId}`}>
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
        <Skeleton className="h-10 w-full max-w-xl" />
      ) : courseList.length === 0 ? (
        <EmptyState
          icon={BookMarked}
          title="Chưa có môn để mở kho đề"
          description="Kho đề theo môn học. Bạn cần được quản trị viên phân công một lớp thuộc môn học này để tạo đề."
        />
      ) : (
        <>
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <div className="relative flex-1 sm:max-w-xs">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Tìm theo tiêu đề…"
                aria-label="Tìm theo tiêu đề"
                className="pl-9"
              />
            </div>
            <SearchableSelect
              className="sm:w-64"
              value={courseId ?? ''}
              onValueChange={(value) => setCourseId(value || null)}
              options={courseOptions}
              placeholder="Môn học"
              searchPlaceholder="Gõ mã hoặc tên môn…"
              allowClear
              clearLabel="Tất cả môn"
              ariaLabel="Lọc theo môn"
            />
            <Select
              value={examType ?? 'all'}
              onValueChange={(v) =>
                setExamType(v === 'all' ? null : (v as CourseExamType))
              }
            >
              <SelectTrigger className="sm:w-44" aria-label="Lọc theo loại đề">
                <SelectValue placeholder="Loại đề" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả loại</SelectItem>
                {COURSE_EXAM_TYPE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={academicYearId ?? 'all'} onValueChange={onYearChange}>
              <SelectTrigger className="sm:w-52" aria-label="Lọc theo năm học">
                <SelectValue placeholder="Năm học" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả năm học</SelectItem>
                {yearItems.map((y) => (
                  <SelectItem key={y.id} value={y.id}>
                    {y.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={semesterId ?? 'all'}
              onValueChange={(v) => setSemesterId(v === 'all' ? null : v)}
            >
              <SelectTrigger className="sm:w-56" aria-label="Lọc theo học kỳ">
                <SelectValue placeholder="Học kỳ" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả học kỳ</SelectItem>
                {semesterItems.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {hasActiveFilters ? (
              <Button type="button" variant="ghost" size="sm" onClick={clearFilters}>
                <X className="size-4" aria-hidden="true" />
                Xóa lọc
              </Button>
            ) : null}
          </div>

          {exams.isLoading || allSemestersQuery.isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : exams.isError ? (
            <Alert variant="destructive">
              <AlertDescription>Không tải được danh sách đề.</AlertDescription>
            </Alert>
          ) : rows.length === 0 ? (
            <EmptyState
              icon={BookMarked}
              title="Chưa có đề trong kho"
              description="Tạo đề nháp với một hoặc nhiều câu. Có thể đánh dấu sẵn sàng khi nội dung ổn định."
              action={
                createCourseId ? (
                  <Button asChild>
                    <Link href={`/teacher/exam-bank/new?courseId=${createCourseId}`}>
                      Tạo đề nháp
                    </Link>
                  </Button>
                ) : undefined
              }
            />
          ) : visible.length === 0 ? (
            <EmptyState
              icon={BookMarked}
              title="Không có đề khớp bộ lọc"
              description="Thử đổi tiêu đề, môn, loại, năm học hoặc học kỳ - hoặc xóa lọc để xem lại toàn bộ."
              action={
                <Button type="button" variant="outline" size="sm" onClick={clearFilters}>
                  Xóa lọc
                </Button>
              }
            />
          ) : (
            <Card>
              <CardContent className="p-0">
                <TooltipProvider delayDuration={200}>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Tiêu đề</TableHead>
                        <TableHead>Môn</TableHead>
                        <TableHead>Loại</TableHead>
                        <TableHead>Học kỳ</TableHead>
                        <TableHead>Trạng thái</TableHead>
                        <TableHead className="text-right">Cập nhật</TableHead>
                        <TableHead className="text-right">Thao tác</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visible.map((exam) => (
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
                            {exam.courseCode} - {exam.courseName}
                          </TableCell>
                          <TableCell className="text-sm">
                            {EXAM_TYPE_LABEL[exam.examType]}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                            {exam.termLabel}
                          </TableCell>
                          <TableCell>
                            <Badge variant={exam.status === 'ready' ? 'success' : 'default'}>
                              {exam.status === 'ready' ? 'Sẵn sàng' : 'Nháp'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right text-muted-foreground text-sm">
                            {new Date(exam.updatedAt).toLocaleString('vi-VN')}
                          </TableCell>
                          <TableCell className="text-right">
                            <ExamBankRowActions
                              examId={exam.id}
                              onPreview={() => setPreviewExamId(exam.id)}
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TooltipProvider>
              </CardContent>
            </Card>
          )}

          <ExamBankPreviewDialog
            examId={previewExamId}
            open={previewExamId !== null}
            onOpenChange={(open) => {
              if (!open) setPreviewExamId(null);
            }}
          />
        </>
      )}
    </div>
  );
}
