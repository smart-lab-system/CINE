'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeft, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { RosterScreen } from '@/components/roster/roster-screen';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  useAddSectionStudent,
  useAssignCourseSection,
  useCourseSection,
  useDeleteCourseSection,
  useImportSectionRoster,
  useRemoveSectionStudent,
  useSectionRoster,
  useTeacherOptions,
} from '@/hooks/useAdminCourseSections';

export default function CourseSectionDetailPage() {
  const params = useParams();
  const id = String(params.id);
  const router = useRouter();

  const section = useCourseSection(id);
  const teachers = useTeacherOptions();
  const assign = useAssignCourseSection();
  const removeSection = useDeleteCourseSection();

  const rosterAdapters = {
    roster: useSectionRoster(id),
    importRoster: useImportSectionRoster(id),
    addStudent: useAddSectionStudent(id),
    removeStudent: useRemoveSectionStudent(id),
  };

  const [assignOpen, setAssignOpen] = useState(false);
  const [teacherId, setTeacherId] = useState('');

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
          description={`${row.courseName} · ${row.semesterName ?? '—'}`}
          actions={
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={() => setAssignOpen(true)}>
                {row.teacherId ? 'Đổi giảng viên' : 'Phân công giảng viên'}
              </Button>
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
        <CardContent className="grid gap-2 text-small sm:grid-cols-2">
          <div>
            <span className="text-muted-foreground">Giảng viên: </span>
            {row.teacherName ?? (
              <span className="text-warning-strong">Chưa phân công</span>
            )}
          </div>
          <div>
            <span className="text-muted-foreground">Sĩ số: </span>
            <span className="tabular-nums">{row.studentCount}</span>
          </div>
        </CardContent>
      </Card>

      <RosterScreen canEdit catalogAssist adapters={rosterAdapters} />

      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Phân công giảng viên</DialogTitle>
          </DialogHeader>
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
    </div>
  );
}
