'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Layers, Plus, Search } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/layout/empty-state';
import { ListPaginationBar } from '@/components/list-pagination-bar';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { SearchableSelect } from '@/components/ui/searchable-select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import {
  useCourseSections,
  useCreateCourseSection,
  useTeacherOptions,
} from '@/hooks/useAdminCourseSections';
import {
  useAcademicYears,
  useCourses,
  useSemesters,
} from '@/hooks/useMasterData';
import {
  parsePage,
  parsePageSize,
  paginationQueryPatch,
  type PageSize,
} from '@/lib/list-pagination';

function CourseSectionsInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const page = parsePage(searchParams.get('page'));
  const pageSize = parsePageSize(searchParams.get('pageSize'));
  const qFromUrl = searchParams.get('q') ?? '';
  const academicYearId = searchParams.get('academicYearId') ?? '';
  const semesterIdFilter = searchParams.get('semesterId') ?? '';
  const courseIdFilter = searchParams.get('courseId') ?? '';
  const unassigned = searchParams.get('unassigned') === '1';

  const [q, setQ] = useState(qFromUrl);
  const debouncedQ = useDebouncedValue(q, 300);

  useEffect(() => {
    setQ(qFromUrl);
  }, [qFromUrl]);

  useEffect(() => {
    if (debouncedQ === qFromUrl) return;
    const next = new URLSearchParams(searchParams.toString());
    if (debouncedQ) next.set('q', debouncedQ);
    else next.delete('q');
    next.delete('page');
    router.replace(`?${next.toString()}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync debounce → URL
  }, [debouncedQ]);

  const list = useCourseSections({
    page,
    pageSize,
    q: debouncedQ || undefined,
    academicYearId: academicYearId || undefined,
    semesterId: semesterIdFilter || undefined,
    courseId: courseIdFilter || undefined,
    unassigned: unassigned || undefined,
  });
  const create = useCreateCourseSection();
  const teachers = useTeacherOptions();
  const years = useAcademicYears({ page: 1, pageSize: 100, status: 'active' });
  const courses = useCourses({ page: 1, pageSize: 100, status: 'active' });
  const filterSemesters = useSemesters({
    page: 1,
    pageSize: 100,
    status: 'active',
    academicYearId: academicYearId || undefined,
  });
  const createSemesters = useSemesters({
    page: 1,
    pageSize: 100,
    status: 'active',
  });

  const yearOptions = useMemo(
    () =>
      (years.data?.items ?? []).map((y) => ({
        value: y.id,
        label: y.name,
        keywords: y.code,
      })),
    [years.data?.items],
  );
  const filterSemesterOptions = useMemo(
    () =>
      (filterSemesters.data?.items ?? []).map((s) => ({
        value: s.id,
        label: s.name,
        keywords: s.code,
      })),
    [filterSemesters.data?.items],
  );
  const courseOptions = useMemo(
    () =>
      (courses.data?.items ?? []).map((c) => ({
        value: c.id,
        label: `${c.code} — ${c.name}`,
        keywords: `${c.code} ${c.name}`,
      })),
    [courses.data?.items],
  );
  const createSemesterOptions = useMemo(
    () =>
      (createSemesters.data?.items ?? []).map((s) => ({
        value: s.id,
        label: s.name,
        keywords: s.code,
      })),
    [createSemesters.data?.items],
  );
  const teacherOptions = useMemo(
    () =>
      (teachers.data ?? []).map((t) => ({
        value: t.id,
        label: t.name,
      })),
    [teachers.data],
  );

  const [open, setOpen] = useState(false);
  const [courseId, setCourseId] = useState('');
  const [semesterId, setSemesterId] = useState('');
  const [teacherId, setTeacherId] = useState('');

  function patchQuery(patch: Record<string, string | null>) {
    const sp = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === '') sp.delete(k);
      else sp.set(k, v);
    }
    sp.delete('page');
    router.replace(`?${sp.toString()}`);
  }

  function setPage(next: number) {
    const p = paginationQueryPatch(next, pageSize);
    const sp = new URLSearchParams(searchParams.toString());
    if (p.page) sp.set('page', p.page);
    else sp.delete('page');
    router.replace(`?${sp.toString()}`);
  }

  function handlePageSizeChange(next: PageSize) {
    const p = paginationQueryPatch(1, next);
    const sp = new URLSearchParams(searchParams.toString());
    if (p.page) sp.set('page', p.page);
    else sp.delete('page');
    if (p.pageSize) sp.set('pageSize', p.pageSize);
    else sp.delete('pageSize');
    router.replace(`?${sp.toString()}`);
  }

  function toggleUnassigned() {
    patchQuery({ unassigned: unassigned ? null : '1' });
  }

  async function onCreate() {
    if (!courseId || !semesterId) {
      toast.error('Chọn môn và học kỳ.');
      return;
    }
    try {
      const row = await create.mutateAsync({
        courseId,
        semesterId,
        teacherId: teacherId || undefined,
      });
      toast.success(`Đã tạo lớp ${row.name}`);
      setOpen(false);
      setTeacherId('');
      router.push(`/admin/course-sections/${row.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Tạo lớp thất bại');
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Lớp học phần"
        description="Tạo lớp theo môn và học kỳ — mã lớp tự sinh (mã môn + 001…). Gắn sinh viên rồi phân công giảng viên."
        actions={
          <Button type="button" onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Tạo lớp
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Tìm theo giảng viên hoặc mã lớp…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <SearchableSelect
          className="w-[180px]"
          value={academicYearId}
          onValueChange={(v) =>
            patchQuery({
              academicYearId: v || null,
              semesterId: null,
            })
          }
          options={yearOptions}
          placeholder="Năm học"
          searchPlaceholder="Gõ năm học…"
          allowClear
          clearLabel="Mọi năm học"
          ariaLabel="Lọc năm học"
        />
        <SearchableSelect
          className="w-[180px]"
          value={semesterIdFilter}
          onValueChange={(v) => patchQuery({ semesterId: v || null })}
          options={filterSemesterOptions}
          placeholder="Học kỳ"
          searchPlaceholder="Gõ học kỳ…"
          allowClear
          clearLabel="Mọi học kỳ"
          ariaLabel="Lọc học kỳ"
        />
        <SearchableSelect
          className="w-[240px]"
          value={courseIdFilter}
          onValueChange={(v) => patchQuery({ courseId: v || null })}
          options={courseOptions}
          placeholder="Môn học"
          searchPlaceholder="Gõ mã hoặc tên môn…"
          allowClear
          clearLabel="Mọi môn"
          ariaLabel="Lọc môn học"
        />
        <Button
          type="button"
          variant={unassigned ? 'default' : 'outline'}
          onClick={toggleUnassigned}
        >
          Chưa phân công
        </Button>
      </div>

      <Card className="overflow-hidden">
        <CardContent className="p-0">
          {list.isLoading ? (
            <div className="flex flex-col gap-3 p-6">
              <Skeleton className="h-5 w-1/3" />
              <Skeleton className="h-5 w-1/2" />
            </div>
          ) : list.isError ? (
            <div className="p-6">
              <Alert variant="destructive">
                <AlertDescription>{list.error.message}</AlertDescription>
              </Alert>
            </div>
          ) : (list.data?.items.length ?? 0) === 0 ? (
            <EmptyState
              icon={Layers}
              title="Chưa có lớp học phần"
              description="Tạo lớp gắn môn và học kỳ từ dữ liệu nền."
              tone="muted"
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Mã lớp</TableHead>
                    <TableHead>Môn</TableHead>
                    <TableHead>Học kỳ</TableHead>
                    <TableHead>Giảng viên</TableHead>
                    <TableHead>Sĩ số</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {list.data!.items.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium tabular-nums">
                        <Link
                          href={`/admin/course-sections/${row.id}`}
                          className="underline-offset-4 hover:underline"
                        >
                          {row.name}
                        </Link>
                      </TableCell>
                      <TableCell>{row.courseName}</TableCell>
                      <TableCell>{row.semesterName ?? '—'}</TableCell>
                      <TableCell>
                        {row.teacherName ?? (
                          <span className="text-warning-strong">Chưa phân công</span>
                        )}
                      </TableCell>
                      <TableCell className="tabular-nums">{row.studentCount}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <ListPaginationBar
        page={page}
        pageSize={pageSize}
        total={list.data?.total ?? 0}
        entityLabel="lớp"
        disabled={list.isLoading}
        onPageChange={setPage}
        onPageSizeChange={handlePageSizeChange}
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tạo lớp học phần</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            <p className="text-sm text-muted-foreground">
              Mã lớp sẽ tự sinh: mã môn + số thứ tự trong học kỳ (001, 002…).
            </p>
            <div className="flex flex-col gap-2">
              <Label>Môn học</Label>
              <SearchableSelect
                value={courseId}
                onValueChange={setCourseId}
                options={courseOptions}
                placeholder="Chọn môn"
                searchPlaceholder="Gõ mã hoặc tên môn…"
                ariaLabel="Chọn môn học"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Học kỳ</Label>
              <SearchableSelect
                value={semesterId}
                onValueChange={setSemesterId}
                options={createSemesterOptions}
                placeholder="Chọn học kỳ"
                searchPlaceholder="Gõ học kỳ…"
                ariaLabel="Chọn học kỳ"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Giảng viên (tuỳ chọn)</Label>
              <SearchableSelect
                value={teacherId}
                onValueChange={setTeacherId}
                options={teacherOptions}
                placeholder="Phân công sau"
                searchPlaceholder="Gõ tên giảng viên…"
                allowClear
                clearLabel="Phân công sau"
                ariaLabel="Chọn giảng viên"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Huỷ
            </Button>
            <Button type="button" onClick={() => void onCreate()} disabled={create.isPending}>
              Tạo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function AdminCourseSectionsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-40 w-full" />}>
      <CourseSectionsInner />
    </Suspense>
  );
}
