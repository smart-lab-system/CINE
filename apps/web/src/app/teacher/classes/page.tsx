'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { GraduationCap, Search, Users, X } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/layout/empty-state';
import { SemesterFilter } from '@/components/layout/semester-filter';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { semesterOptions, useSemesterFilter } from '@/hooks/useSemesterFilter';
import { useTeachingClasses } from '@/hooks/useTeaching';
import { filterTeachingClasses } from './filter-teaching-classes';

/**
 * Lớp do phòng đào tạo / admin phân công — giảng viên không tạo/xoá lớp.
 * Vào roster để kiểm tra / bổ sung SV trước giờ thi.
 */
export default function TeacherClassesPage() {
  const classes = useTeachingClasses();
  const all = classes.data ?? [];

  const [search, setSearch] = useState('');
  const [courseName, setCourseName] = useState<string | null>(null);
  const semesterFilter = useSemesterFilter('teacher-classes');
  const debouncedSearch = useDebouncedValue(search, 300);

  const courseOptions = useMemo(
    () =>
      [...new Set(all.map((klass) => klass.courseName))]
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, 'vi'))
        .map((name) => ({ value: name, label: name, keywords: name })),
    [all],
  );

  const semesterChoices = useMemo(
    () => semesterOptions(all.map((klass) => klass.semesterName)),
    [all],
  );

  const visible = useMemo(
    () =>
      filterTeachingClasses(all, {
        search: debouncedSearch,
        courseName,
        semesterName: semesterFilter.semesterName,
      }),
    [all, debouncedSearch, courseName, semesterFilter.semesterName],
  );

  const hasActiveFilters =
    search.trim() !== '' || courseName !== null || semesterFilter.semesterName !== null;

  function clearFilters() {
    setSearch('');
    setCourseName(null);
    semesterFilter.setSemesterName(null);
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Lớp của tôi"
        description="Các lớp được phân công dạy. Mỗi lớp có danh sách sinh viên — quyết định ai vào được phiên thi."
      />

      {all.length > 0 && (
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <div className="relative flex-1 sm:max-w-xs">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm theo lớp hoặc môn…"
              aria-label="Tìm theo lớp hoặc môn"
              className="pl-9"
            />
          </div>
          {courseOptions.length > 1 && (
            <SearchableSelect
              className="sm:w-56"
              value={courseName ?? ''}
              onValueChange={(value) => setCourseName(value || null)}
              options={courseOptions}
              placeholder="Môn học"
              searchPlaceholder="Gõ tên môn…"
              allowClear
              clearLabel="Tất cả môn"
              ariaLabel="Lọc theo môn"
            />
          )}
          <SemesterFilter
            value={semesterFilter.semesterName}
            onChange={semesterFilter.setSemesterName}
            semesters={semesterChoices}
          />
          {hasActiveFilters && (
            <Button type="button" variant="ghost" size="sm" onClick={clearFilters}>
              <X className="size-4" aria-hidden="true" />
              Xóa lọc
            </Button>
          )}
        </div>
      )}

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
          ) : all.length === 0 ? (
            <EmptyState
              icon={GraduationCap}
              title="Chưa được phân công lớp nào"
              description="Liên hệ quản trị viên để được gắn lớp học phần. Có lớp mới tạo được phiên thi."
              tone="muted"
            />
          ) : visible.length === 0 ? (
            <EmptyState
              icon={GraduationCap}
              title="Không có lớp khớp bộ lọc"
              description="Thử đổi từ khóa tìm kiếm, môn hoặc học kỳ — hoặc xóa lọc để xem lại toàn bộ."
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
                    <TableHead scope="col">Lớp</TableHead>
                    <TableHead scope="col">Môn</TableHead>
                    <TableHead scope="col">Học kỳ</TableHead>
                    <TableHead scope="col">Lớp danh nghĩa</TableHead>
                    <TableHead scope="col">Sĩ số</TableHead>
                    <TableHead scope="col" className="text-right">
                      <span className="sr-only">Hành động</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.map((klass) => (
                    <TableRow key={klass.id}>
                      <TableCell className="font-medium">{klass.name}</TableCell>
                      <TableCell>{klass.courseName}</TableCell>
                      <TableCell>{klass.semesterName ?? '—'}</TableCell>
                      <TableCell
                        className="max-w-[14rem] truncate"
                        title={klass.nominalClassName ?? undefined}
                      >
                        {klass.nominalClassName ?? '—'}
                      </TableCell>
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
