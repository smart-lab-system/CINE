'use client';

import { Suspense, use, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, BookOpen, ClipboardList, Layers } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { TableCell, TableRow } from '@/components/ui/table';
import { CatalogSection } from '../../_components/catalog-table';
import {
  useAcademicYears,
  useCourse,
  useCourseHubExams,
  useCourseHubRubrics,
  useSemesters,
} from '@/hooks/useMasterData';
import { useCourseSections } from '@/hooks/useAdminCourseSections';
import {
  AccountNameButton,
  AccountPreviewDialog,
} from './_components/account-preview-dialog';
import { SectionRowActions } from './_components/section-row-actions';
import {
  ExamRowActions,
  RubricRowActions,
} from './_components/bank-row-actions';

type HubTab = 'classes' | 'exams' | 'rubrics';

const TABS: { id: HubTab; label: string; icon: typeof Layers }[] = [
  { id: 'classes', label: 'Lớp học phần', icon: Layers },
  { id: 'exams', label: 'Ngân hàng đề thi', icon: BookOpen },
  { id: 'rubrics', label: 'Ngân hàng rubric', icon: ClipboardList },
];

function parseTab(raw: string | null): HubTab {
  if (raw === 'exams' || raw === 'rubrics' || raw === 'classes') return raw;
  return 'classes';
}

export default function CourseHubPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <CourseHub courseId={id} />
    </Suspense>
  );
}

function CourseHub({ courseId }: { courseId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tab = parseTab(searchParams.get('tab'));
  const yearId = searchParams.get('yearId') ?? '';
  const semesterId = searchParams.get('semesterId') ?? '';

  const course = useCourse(courseId);
  const years = useAcademicYears({ page: 1, pageSize: 50 });
  const semesters = useSemesters({
    page: 1,
    pageSize: 50,
    academicYearId: yearId || undefined,
  });

  const setQuery = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (!v) next.delete(k);
      else next.set(k, v);
    }
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const yearOptions = years.data?.items ?? [];
  const semesterOptions = useMemo(() => semesters.data?.items ?? [], [semesters.data?.items]);

  const hubFilter = {
    academicYearId: yearId || undefined,
    semesterId: semesterId || undefined,
  };

  const [previewAccountId, setPreviewAccountId] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-2">
          <Link href="/admin/master-data/courses">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Môn học
          </Link>
        </Button>
        <PageHeader
          title={
            course.isLoading
              ? 'Đang tải…'
              : course.data
                ? `${course.data.code} - ${course.data.name}`
                : 'Môn học'
          }
        />
      </div>

      <AccountPreviewDialog
        accountId={previewAccountId}
        open={Boolean(previewAccountId)}
        onOpenChange={(open) => {
          if (!open) setPreviewAccountId(null);
        }}
      />

      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1.5">
          <span className="text-caption text-muted-foreground">Năm học</span>
          <Select
            value={yearId || 'all'}
            onValueChange={(v) =>
              setQuery({ yearId: v === 'all' ? null : v, semesterId: null })
            }
          >
            <SelectTrigger className="w-[220px]" aria-label="Lọc theo năm học">
              <SelectValue placeholder="Tất cả năm" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả năm</SelectItem>
              {yearOptions.map((y) => (
                <SelectItem key={y.id} value={y.id}>
                  {y.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <span className="text-caption text-muted-foreground">Học kỳ</span>
          <Select
            value={semesterId || 'all'}
            onValueChange={(v) => setQuery({ semesterId: v === 'all' ? null : v })}
          >
            <SelectTrigger className="w-[220px]" aria-label="Lọc theo học kỳ">
              <SelectValue placeholder="Tất cả học kỳ" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả học kỳ</SelectItem>
              {semesterOptions.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div role="tablist" aria-label="Phần của môn" className="flex flex-wrap gap-2">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <Button
              key={t.id}
              role="tab"
              aria-selected={active}
              variant={active ? 'primary' : 'outline'}
              onClick={() => setQuery({ tab: t.id })}
            >
              <Icon className="mr-2 h-4 w-4" />
              {t.label}
            </Button>
          );
        })}
      </div>

      {tab === 'classes' ? (
        <ClassesTab
          courseId={courseId}
          semesterId={semesterId || undefined}
          yearId={yearId || undefined}
          onOpenAccount={setPreviewAccountId}
        />
      ) : null}
      {tab === 'exams' ? (
        <ExamsTab
          courseId={courseId}
          filter={hubFilter}
          onOpenAccount={setPreviewAccountId}
        />
      ) : null}
      {tab === 'rubrics' ? (
        <RubricsTab
          courseId={courseId}
          filter={hubFilter}
          onOpenAccount={setPreviewAccountId}
        />
      ) : null}
    </div>
  );
}

function ClassesTab({
  courseId,
  semesterId,
  yearId,
  onOpenAccount,
}: {
  courseId: string;
  semesterId?: string;
  yearId?: string;
  onOpenAccount: (accountId: string) => void;
}) {
  const router = useRouter();
  const list = useCourseSections({
    page: 1,
    pageSize: 50,
    courseId,
    semesterId,
    academicYearId: yearId,
  });
  const items = list.data?.items ?? [];

  return (
    <CatalogSection
      title="Lớp học phần"
      headers={['Mã lớp', 'Môn', 'Học kỳ', 'Lớp danh nghĩa', 'Phụ trách', 'Thao tác']}
      headerClassNames={[undefined, undefined, undefined, undefined, undefined, 'text-center']}
      loading={list.isLoading}
      empty="Chưa có lớp học phần cho bộ lọc này."
      rows={
        items.length
          ? items.map((row) => (
              <TableRow
                key={row.id}
                className="cursor-pointer"
                onClick={() => router.push(`/admin/course-sections/${row.id}`)}
              >
                <TableCell className="font-mono">
                  {row.name}
                  {row.isActive === false ? (
                    <span className="ml-2 text-caption text-muted-foreground">
                      (vô hiệu)
                    </span>
                  ) : null}
                </TableCell>
                <TableCell>{row.courseName}</TableCell>
                <TableCell>{row.semesterName ?? '-'}</TableCell>
                <TableCell className="font-mono">
                  {row.nominalClassName?.split(' - ')[0] ?? '-'}
                </TableCell>
                <TableCell>
                  <AccountNameButton
                    accountId={row.teacherId}
                    label={row.teacherName ?? 'Chưa gán'}
                    onOpen={onOpenAccount}
                  />
                </TableCell>
                <TableCell
                  className="text-center"
                  onClick={(e) => e.stopPropagation()}
                >
                  <SectionRowActions section={row} />
                </TableCell>
              </TableRow>
            ))
          : null
      }
    />
  );
}

function ExamsTab({
  courseId,
  filter,
  onOpenAccount,
}: {
  courseId: string;
  filter: { academicYearId?: string; semesterId?: string };
  onOpenAccount: (accountId: string) => void;
}) {
  const router = useRouter();
  const exams = useCourseHubExams(courseId, filter);
  const items = exams.data ?? [];
  return (
    <CatalogSection
      title="Ngân hàng đề thi"
      headers={['Đề', 'Người tạo', 'Thời điểm tạo', 'Thao tác']}
      headerClassNames={[undefined, undefined, undefined, 'text-center']}
      loading={exams.isLoading}
      empty="Chưa có đề trong bộ lọc này."
      rows={
        items.length
          ? items.map((e) => (
              <TableRow
                key={e.id}
                className="cursor-pointer"
                onClick={() =>
                  router.push(`/admin/master-data/courses/${courseId}/exams/${e.id}`)
                }
              >
                <TableCell>
                  {e.title}
                  {e.isActive === false ? (
                    <span className="ml-2 text-caption text-muted-foreground">
                      (vô hiệu)
                    </span>
                  ) : null}
                </TableCell>
                <TableCell>
                  <AccountNameButton
                    accountId={e.createdBy}
                    label={e.createdByName ?? '-'}
                    onOpen={onOpenAccount}
                  />
                </TableCell>
                <TableCell>{e.resolvedSemesterName ?? '-'}</TableCell>
                <TableCell
                  className="text-center"
                  onClick={(ev) => ev.stopPropagation()}
                >
                  <ExamRowActions courseId={courseId} exam={e} />
                </TableCell>
              </TableRow>
            ))
          : null
      }
    />
  );
}

function RubricsTab({
  courseId,
  filter,
  onOpenAccount,
}: {
  courseId: string;
  filter: { academicYearId?: string; semesterId?: string };
  onOpenAccount: (accountId: string) => void;
}) {
  const router = useRouter();
  const rubrics = useCourseHubRubrics(courseId, filter);
  const items = rubrics.data ?? [];
  return (
    <CatalogSection
      title="Ngân hàng rubric"
      headers={['Tên', 'Người tạo', 'Thời điểm tạo', 'Thao tác']}
      headerClassNames={[undefined, undefined, undefined, 'text-center']}
      loading={rubrics.isLoading}
      empty="Chưa có rubric gắn môn này trong bộ lọc."
      rows={
        items.length
          ? items.map((r) => (
              <TableRow
                key={r.id}
                className="cursor-pointer"
                onClick={() =>
                  router.push(`/admin/master-data/courses/${courseId}/rubrics/${r.id}`)
                }
              >
                <TableCell>
                  {r.name}
                  {!r.isActive ? (
                    <span className="ml-2 text-caption text-muted-foreground">(cũ)</span>
                  ) : null}
                  {r.isArchived ? (
                    <span className="ml-2 text-caption text-muted-foreground">
                      (vô hiệu)
                    </span>
                  ) : null}
                </TableCell>
                <TableCell>
                  <AccountNameButton
                    accountId={r.teacherId}
                    label={r.teacherName ?? '-'}
                    onOpen={onOpenAccount}
                  />
                </TableCell>
                <TableCell>{r.resolvedSemesterName ?? '-'}</TableCell>
                <TableCell
                  className="text-center"
                  onClick={(ev) => ev.stopPropagation()}
                >
                  <RubricRowActions courseId={courseId} rubric={r} />
                </TableCell>
              </TableRow>
            ))
          : null
      }
    />
  );
}
