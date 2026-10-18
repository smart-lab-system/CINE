'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeft, Pencil, Trash2, UserMinus } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { RosterScreen } from '@/components/roster/roster-screen';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { SearchableSelect } from '@/components/ui/searchable-select';
import {
  useAddSectionStudent,
  useAssignCourseSection,
  useCourseSection,
  useDeleteCourseSection,
  useImportSectionRoster,
  useRemoveSectionStudent,
  useSectionRoster,
  useTeacherOptions,
  useUnassignCourseSection,
  useUpdateCourseSection,
  useUpdateSectionStudentName,
} from '@/hooks/useAdminCourseSections';
import {
  useCourses,
  useNominalClasses,
  useSemesters,
} from '@/hooks/useMasterData';

export default function CourseSectionDetailPage() {
  const params = useParams();
  const id = String(params.id);
  const router = useRouter();

  const section = useCourseSection(id);
  const teachers = useTeacherOptions();
  const assign = useAssignCourseSection();
  const unassign = useUnassignCourseSection();
  const updateSection = useUpdateCourseSection();
  const removeSection = useDeleteCourseSection();

  const rosterAdapters = {
    roster: useSectionRoster(id),
    importRoster: useImportSectionRoster(id),
    addStudent: useAddSectionStudent(id),
    removeStudent: useRemoveSectionStudent(id),
    updateStudentName: useUpdateSectionStudentName(id),
  };

  const [assignOpen, setAssignOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [teacherId, setTeacherId] = useState('');
  const [editCourseId, setEditCourseId] = useState('');
  const [editSemesterId, setEditSemesterId] = useState('');
  const [editNominalClassId, setEditNominalClassId] = useState('');

  const courses = useCourses({ page: 1, pageSize: 100, status: 'active' });
  const semesters = useSemesters({ page: 1, pageSize: 100, status: 'active' });
  const nominalClasses = useNominalClasses({
    page: 1,
    pageSize: 100,
    status: 'active',
  });

  // Ghép giá trị hiện tại vào options — tránh SearchableSelect hiện
  // placeholder khi môn/kỳ/lớp danh nghĩa không còn trong list `active`
  // (hoặc đang tải), khiến dialog trông như trống.
  const courseOptions = useMemo(() => {
    const items = (courses.data?.items ?? []).map((c) => ({
      value: c.id,
      label: `${c.code} — ${c.name}`,
      keywords: `${c.code} ${c.name}`,
    }));
    const current = section.data;
    if (
      current?.courseId &&
      !items.some((o) => o.value === current.courseId)
    ) {
      items.unshift({
        value: current.courseId,
        label: current.courseName,
        keywords: current.courseName,
      });
    }
    return items;
  }, [courses.data?.items, section.data]);
  const semesterOptions = useMemo(() => {
    const items = (semesters.data?.items ?? []).map((s) => ({
      value: s.id,
      label: s.name,
      keywords: s.name,
    }));
    const current = section.data;
    if (
      current?.semesterId &&
      current.semesterName &&
      !items.some((o) => o.value === current.semesterId)
    ) {
      items.unshift({
        value: current.semesterId,
        label: current.semesterName,
        keywords: current.semesterName,
      });
    }
    return items;
  }, [semesters.data?.items, section.data]);
  const nominalOptions = useMemo(() => {
    const items = (nominalClasses.data?.items ?? []).map((n) => ({
      value: n.id,
      label: n.name ? `${n.code} — ${n.name}` : n.code,
      keywords: `${n.code} ${n.name ?? ''}`,
    }));
    const current = section.data;
    if (
      current?.nominalClassId &&
      current.nominalClassName &&
      !items.some((o) => o.value === current.nominalClassId)
    ) {
      items.unshift({
        value: current.nominalClassId,
        label: current.nominalClassName,
        keywords: current.nominalClassName,
      });
    }
    return [
      { value: '', label: 'Không gắn', keywords: 'none' },
      ...items,
    ];
  }, [nominalClasses.data?.items, section.data]);

  async function onAssign() {
    if (!teacherId) {
      toast.error('Chọn giảng viên');
      return;
    }
    try {
      await assign.mutateAsync({ id, teacherId });
      toast.success('Đã phân công giảng viên');
      setAssignOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Phân công thất bại');
    }
  }

  async function onUnassign() {
    if (!confirm('Gỡ phân công giảng viên khỏi lớp này?')) return;
    try {
      await unassign.mutateAsync(id);
      toast.success('Đã gỡ phân công');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gỡ phân công thất bại');
    }
  }

  function openEdit() {
    const row = section.data;
    if (!row) return;
    setEditCourseId(row.courseId ?? '');
    setEditSemesterId(row.semesterId ?? '');
    setEditNominalClassId(row.nominalClassId ?? '');
    setEditOpen(true);
  }

  async function onSaveEdit() {
    const row = section.data;
    if (!row) return;

    const metaMutable =
      row.studentCount === 0 && (row.examSessionCount ?? 0) === 0;
    if (!metaMutable) {
      setEditOpen(false);
      return;
    }

    const body: {
      courseId?: string;
      semesterId?: string;
      nominalClassId?: string | null;
    } = {};

    if (editCourseId && editCourseId !== row.courseId) {
      body.courseId = editCourseId;
    }
    if (editSemesterId && editSemesterId !== row.semesterId) {
      body.semesterId = editSemesterId;
    }
    const nextNominal = editNominalClassId || null;
    if (nextNominal !== row.nominalClassId) {
      body.nominalClassId = nextNominal;
    }

    if (Object.keys(body).length === 0) {
      setEditOpen(false);
      return;
    }

    try {
      await updateSection.mutateAsync({ id, body });
      toast.success('Đã cập nhật lớp học phần');
      setEditOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Cập nhật thất bại');
    }
  }

  async function onDelete() {
    if (!confirm('Xoá lớp học phần này? Cần roster trống.')) return;
    try {
      await removeSection.mutateAsync(id);
      toast.success('Đã xoá lớp');
      router.push('/admin/course-sections');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Xoá thất bại');
    }
  }

  if (section.isLoading) {
    return <Skeleton className="h-40 w-full" />;
  }
  if (section.isError || !section.data) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{section.error?.message ?? 'Không tải được lớp'}</AlertDescription>
      </Alert>
    );
  }

  const row = section.data;
  const teacherOptions = (teachers.data ?? []).map((t) => ({
    value: t.id,
    label: t.name,
  }));
  const metaMutable =
    row.studentCount === 0 && (row.examSessionCount ?? 0) === 0;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-2">
          <Link href="/admin/course-sections">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Lớp học phần
          </Link>
        </Button>
        <PageHeader
          title={row.name}
          description={`${row.courseName} · ${row.semesterName ?? '—'} · ${row.nominalClassName ?? 'Chưa gắn lớp danh nghĩa'}`}
          actions={
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={openEdit}>
                <Pencil className="h-4 w-4" aria-hidden="true" />
                Sửa
              </Button>
              <Button type="button" onClick={() => setAssignOpen(true)}>
                {row.teacherId ? 'Đổi giảng viên' : 'Phân công giảng viên'}
              </Button>
              {row.teacherId ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void onUnassign()}
                  disabled={unassign.isPending}
                >
                  <UserMinus className="h-4 w-4" aria-hidden="true" />
                  Gỡ phân công
                </Button>
              ) : null}
              <Button type="button" variant="destructive" onClick={() => void onDelete()}>
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                Xoá lớp
              </Button>
            </div>
          }
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Thông tin</CardTitle>
        </CardHeader>
        <CardContent className="grid min-w-0 gap-2 text-small sm:grid-cols-2">
          <div className="min-w-0 break-words">
            <span className="text-muted-foreground">Giảng viên: </span>
            {row.teacherName ?? (
              <span className="text-warning-strong">Chưa phân công</span>
            )}
          </div>
          <div className="min-w-0 break-words">
            <span className="text-muted-foreground">Lớp danh nghĩa: </span>
            {row.nominalClassName ?? '—'}
          </div>
          <div className="min-w-0">
            <span className="text-muted-foreground">Sĩ số: </span>
            <span className="tabular-nums">{row.studentCount}</span>
          </div>
          <div className="min-w-0">
            <span className="text-muted-foreground">Phiên thi: </span>
            <span className="tabular-nums">{row.examSessionCount ?? 0}</span>
          </div>
        </CardContent>
      </Card>

      <RosterScreen canEdit catalogAssist adapters={rosterAdapters} />

      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent className="overflow-x-hidden sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Phân công giảng viên</DialogTitle>
          </DialogHeader>
          <div className="flex min-w-0 flex-col gap-3 py-2">
            <SearchableSelect
              value={teacherId}
              onValueChange={setTeacherId}
              options={teacherOptions}
              placeholder="Chọn giảng viên"
              searchPlaceholder="Gõ tên giảng viên…"
              ariaLabel="Chọn giảng viên"
            />
            <p className="text-small text-muted-foreground">
              Đổi GV chỉ cập nhật lớp và enrollment — phiên thi / rubric cũ không chuyển chủ.
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAssignOpen(false)}>
              Huỷ
            </Button>
            <Button type="button" onClick={() => void onAssign()} disabled={assign.isPending}>
              Lưu
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-h-[min(90dvh,40rem)] overflow-y-auto overflow-x-hidden sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Sửa lớp học phần</DialogTitle>
            <DialogDescription>
              {metaMutable
                ? 'Đổi môn, học kỳ hoặc lớp danh nghĩa khi lớp còn trống sinh viên và chưa có phiên thi.'
                : 'Lớp đã có sinh viên hoặc phiên thi — chỉ xem thông tin, không sửa được meta.'}
            </DialogDescription>
          </DialogHeader>
          <div className="flex min-w-0 flex-col gap-4 py-2">
            {!metaMutable ? (
              <Alert>
                <AlertDescription>
                  Đang có{' '}
                  <span className="tabular-nums font-medium">{row.studentCount}</span> sinh
                  viên
                  {(row.examSessionCount ?? 0) > 0
                    ? ` và ${row.examSessionCount} phiên thi`
                    : ''}
                  . Xoá roster / phiên trước nếu cần đổi môn, kỳ hoặc lớp danh nghĩa.
                </AlertDescription>
              </Alert>
            ) : null}
            <div className="flex min-w-0 flex-col gap-2">
              <Label>Môn học</Label>
              <SearchableSelect
                value={editCourseId}
                onValueChange={setEditCourseId}
                options={courseOptions}
                placeholder="Chọn môn"
                searchPlaceholder="Gõ mã hoặc tên môn…"
                ariaLabel="Chọn môn học"
                disabled={!metaMutable}
              />
            </div>
            <div className="flex min-w-0 flex-col gap-2">
              <Label>Học kỳ</Label>
              <SearchableSelect
                value={editSemesterId}
                onValueChange={setEditSemesterId}
                options={semesterOptions}
                placeholder="Chọn học kỳ"
                searchPlaceholder="Gõ tên học kỳ…"
                ariaLabel="Chọn học kỳ"
                disabled={!metaMutable}
              />
            </div>
            <div className="flex min-w-0 flex-col gap-2">
              <Label>Lớp danh nghĩa</Label>
              <SearchableSelect
                value={editNominalClassId}
                onValueChange={setEditNominalClassId}
                options={nominalOptions}
                placeholder="Tuỳ chọn"
                searchPlaceholder="Gõ mã lớp danh nghĩa…"
                ariaLabel="Chọn lớp danh nghĩa"
                disabled={!metaMutable}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>
              {metaMutable ? 'Huỷ' : 'Đóng'}
            </Button>
            {metaMutable ? (
              <Button
                type="button"
                onClick={() => void onSaveEdit()}
                disabled={updateSection.isPending}
                loading={updateSection.isPending}
              >
                Lưu
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
