'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ListChecks, Search, X } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/layout/empty-state';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
import { useCurrentAccount } from '@/hooks/useCurrentAccount';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useRubrics } from '@/hooks/useGrading';
import { useAcademicYears, useSemesters } from '@/hooks/useMasterData';
import { useTeachingClasses } from '@/hooks/useTeaching';
import {
  buildQsRubricRows,
  courseIdsForTerm,
  filterQsRubricRows,
} from './filter-qs-rubrics';

export default function QsRubricsPage() {
  const router = useRouter();
  const rubrics = useRubrics();
  const teaching = useTeachingClasses();
  const account = useCurrentAccount();
  const years = useAcademicYears({ page: 1, pageSize: 100 });
  /** Toàn bộ kỳ - dùng suy thời điểm tạo + map năm; filter dropdown lọc client. */
  const allSemestersQuery = useSemesters({ page: 1, pageSize: 100 });
  const [academicYearId, setAcademicYearId] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [courseId, setCourseId] = useState<string | null>(null);
  const [semesterId, setSemesterId] = useState<string | null>(null);
  const debouncedSearch = useDebouncedValue(search, 300);

  const classes = teaching.data ?? [];
  const yearItems = years.data?.items ?? [];
  const allSemesters = allSemestersQuery.data?.items ?? [];
  const semesterItems = useMemo(
    () =>
      academicYearId
        ? allSemesters.filter((s) => s.academicYearId === academicYearId)
        : allSemesters,
    [allSemesters, academicYearId],
  );

  const courseLabelById = useMemo(() => {
    const map = new Map<string, string>();
    for (const klass of classes) {
      if (!klass.courseId) continue;
      if (!map.has(klass.courseId)) {
        map.set(klass.courseId, klass.courseName);
      }
    }
    return map;
  }, [classes]);

  const courseOptions = useMemo(() => {
    const fromTeaching = [...courseLabelById.entries()].map(([id, label]) => ({
      value: id,
      label,
      keywords: label,
    }));
    const fromRubrics = (rubrics.data ?? [])
      .filter((r) => (r.kind ?? 'qa') === 'qs' && r.courseId)
      .map((r) => r.courseId!)
      .filter((id) => !courseLabelById.has(id));
    for (const id of new Set(fromRubrics)) {
      fromTeaching.push({ value: id, label: id, keywords: id });
    }
    return fromTeaching.sort((a, b) => a.label.localeCompare(b.label, 'vi'));
  }, [courseLabelById, rubrics.data]);

  const semesterYearById = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of allSemesters) map.set(s.id, s.academicYearId);
    return map;
  }, [allSemesters]);

  const allowedCourseIds = useMemo(
    () =>
      courseIdsForTerm(classes, {
        academicYearId,
        semesterId,
        semesterYearById,
      }),
    [classes, academicYearId, semesterId, semesterYearById],
  );

  const rows = useMemo(
    () =>
      buildQsRubricRows(
        rubrics.data ?? [],
        courseLabelById,
        account?.name?.trim() || account?.email || '-',
        allSemesters,
      ),
    [rubrics.data, courseLabelById, account, allSemesters],
  );

  const visible = useMemo(
    () =>
      filterQsRubricRows(rows, {
        search: debouncedSearch,
        courseId,
        allowedCourseIds,
      }),
    [rows, debouncedSearch, courseId, allowedCourseIds],
  );

  const hasActiveFilters =
    search.trim() !== '' ||
    courseId !== null ||
    academicYearId !== null ||
    semesterId !== null;

  function clearFilters() {
    setSearch('');
    setCourseId(null);
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
        title="Rubric theo câu hỏi"
        description="Rubric QS theo câu - checklist nhiều cách giải. Lọc theo môn, năm học và học kỳ (theo lớp bạn đang dạy)."
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative flex-1 sm:max-w-xs">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm theo tên rubric…"
            aria-label="Tìm theo tên rubric"
            className="pl-9"
          />
        </div>
        <SearchableSelect
          className="sm:w-56"
          value={courseId ?? ''}
          onValueChange={(value) => setCourseId(value || null)}
          options={courseOptions}
          placeholder="Môn học"
          searchPlaceholder="Gõ tên môn…"
          allowClear
          clearLabel="Tất cả môn"
          ariaLabel="Lọc theo môn"
        />
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

      <Card className="overflow-hidden">
        <CardContent className="p-0">
          {rubrics.isLoading || teaching.isLoading ? (
            <div className="flex flex-col gap-3 p-6">
              <Skeleton className="h-5 w-1/3" />
              <Skeleton className="h-5 w-1/2" />
              <Skeleton className="h-5 w-2/5" />
            </div>
          ) : rubrics.isError ? (
            <div className="p-6">
              <Alert variant="destructive">
                <AlertDescription>
                  {rubrics.error instanceof Error
                    ? rubrics.error.message
                    : 'Không tải được danh sách rubric.'}
                </AlertDescription>
              </Alert>
            </div>
          ) : rows.length === 0 ? (
            <EmptyState
              icon={ListChecks}
              title="Chưa có rubric QS"
              description="Tạo rubric theo câu hỏi từ Kho đề hoặc khi soạn checklist theo câu."
              tone="muted"
            />
          ) : visible.length === 0 ? (
            <EmptyState
              icon={ListChecks}
              title="Không có rubric khớp bộ lọc"
              description="Thử đổi tên, môn, năm học hoặc học kỳ - hoặc xóa lọc để xem lại toàn bộ."
              tone="muted"
              action={
                <Button type="button" variant="outline" size="sm" onClick={clearFilters}>
                  Xóa lọc
                </Button>
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead scope="col">Tên rubric</TableHead>
                    <TableHead scope="col">Môn</TableHead>
                    <TableHead scope="col" className="text-center">
                      Cách giải
                    </TableHead>
                    <TableHead scope="col">Người tạo</TableHead>
                    <TableHead scope="col">Thời điểm tạo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.map((row) => (
                    <TableRow
                      key={row.id}
                      className="cursor-pointer"
                      tabIndex={0}
                      aria-label={`Mở chi tiết ${row.name}`}
                      onClick={() => router.push(`/teacher/rubrics/${row.id}`)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          router.push(`/teacher/rubrics/${row.id}`);
                        }
                      }}
                    >
                      <TableCell className="font-medium">
                        <Link
                          href={`/teacher/rubrics/${row.id}`}
                          className="hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {row.name}
                        </Link>
                      </TableCell>
                      <TableCell>{row.courseLabel}</TableCell>
                      <TableCell className="text-center tabular-nums">
                        {row.approachCount}
                      </TableCell>
                      <TableCell>{row.createdByName}</TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {row.createdTermLabel}
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
