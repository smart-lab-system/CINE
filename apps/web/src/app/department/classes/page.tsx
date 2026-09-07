'use client';

import { useState } from 'react';
import Link from 'next/link';
import { GraduationCap, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  useCreateClass,
  useDeleteClass,
  useMyClasses,
  useMyCourses,
  useTeacherOptions,
  useUpdateClass,
} from '@/hooks/useDepartment';
import type { Klass } from '@/lib/api/department';
import { SemesterFilter } from '@/components/layout/semester-filter';
import { useSemesterFilter } from '@/hooks/useSemesterFilter';
import { ResourceShell } from '@/components/resource/resource-shell';
import { ResourceFormDialog } from '@/components/resource/resource-form-dialog';
import { ConfirmDeleteDialog } from '@/components/resource/confirm-delete-dialog';

const EMPTY = { courseId: '', name: '', teacherId: '' };

export default function ClassesPage() {
  const filter = useSemesterFilter('department-classes');
  const classes = useMyClasses(filter.semesterId);
  // Pick-list của form tạo lớp KHÔNG lọc theo kỳ đang xem: lọc danh sách là
  // thu hẹp tầm nhìn, còn thu hẹp một form là chặn người ta tạo lớp cho kỳ
  // khác. Lọc không bao giờ được lấy đi một lựa chọn khỏi form.
  const courses = useMyCourses();
  const teachers = useTeacherOptions();
  const create = useCreateClass();
  const update = useUpdateClass();
  const remove = useDeleteClass();

  const [form, setForm] = useState(EMPTY);
  const [editing, setEditing] = useState<Klass | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [deleting, setDeleting] = useState<Klass | null>(null);

  const courseCode = (id: string) => courses.data?.find((c) => c.id === id)?.code ?? '—';
  const teacherName = (id: string) => teachers.data?.find((t) => t.id === id)?.name ?? '—';

  const noCourses = !courses.isLoading && (courses.data?.length ?? 0) === 0;

  function openCreate() {
    setEditing(null);
    setForm({ ...EMPTY, courseId: courses.data?.[0]?.id ?? '' });
    setFormOpen(true);
  }

  function openEdit(klass: Klass) {
    setEditing(klass);
    setForm({ courseId: klass.courseId, name: klass.name, teacherId: klass.teacherId });
    setFormOpen(true);
  }

  return (
    <ResourceShell<Klass>
      filter={
        <SemesterFilter
          value={filter.semesterId}
          onChange={filter.setSemesterId}
          semesters={filter.semesters}
          current={filter.current}
          isStale={filter.isStale}
          staleDays={filter.staleDays}
        />
      }
      title="Lớp học"
      description="Mỗi lớp thuộc một môn của khoa bạn và có đúng một giảng viên phụ trách. Giảng viên chỉ thấy và tạo phiên thi cho lớp mình được giao."
      icon={GraduationCap}
      addLabel="Thêm lớp"
      onAdd={openCreate}
      onEdit={openEdit}
      onDelete={setDeleting}
      rowActions={(k) => (
        <Button asChild variant="ghost" size="sm">
          <Link href={`/department/classes/${k.id}/roster`}>
            <Users className="h-4 w-4" aria-hidden="true" />
            Danh sách SV
          </Link>
        </Button>
      )}
      rows={classes.data}
      rowKey={(k) => k.id}
      isLoading={classes.isLoading}
      error={classes.error}
      emptyTitle="Chưa có lớp nào"
      emptyDescription="Giảng viên chưa được giao lớp sẽ không tạo được phiên thi, nên đây là bước bắt buộc trước kỳ thi."
      columns={[
        {
          label: 'Môn',
          tight: true,
          render: (k) => <span className="font-mono">{courseCode(k.courseId)}</span>,
        },
        { label: 'Lớp', render: (k) => <span className="font-medium">{k.name}</span> },
        {
          label: 'Giảng viên',
          render: (k) => (
            <span className="text-muted-foreground">{teacherName(k.teacherId)}</span>
          ),
        },
      ]}
    >
      {noCourses && (
        <Alert variant="info">
          <AlertDescription>
            Khoa bạn chưa có môn học nào. Hãy tạo môn học trước — mỗi lớp phải thuộc về một môn.
          </AlertDescription>
        </Alert>
      )}

      <ResourceFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        title={editing ? 'Sửa lớp học' : 'Thêm lớp học'}
        submitLabel={editing ? 'Lưu' : 'Tạo'}
        submitting={create.isPending || update.isPending}
        error={create.error ?? update.error}
        onSubmit={() =>
          editing
            ? // courseId is not editable: moving a class between courses would
              // move its enrollments and exam sessions with it, across a
              // department boundary.
              update.mutateAsync({
                id: editing.id,
                body: { name: form.name, teacherId: form.teacherId },
              })
            : create.mutateAsync(form)
        }
      >
        <div className="flex flex-col gap-2">
          <Label htmlFor="class-course">Môn học</Label>
          <Select
            value={form.courseId}
            onValueChange={(value) => setForm({ ...form, courseId: value })}
            disabled={editing !== null}
          >
            <SelectTrigger id="class-course">
              <SelectValue placeholder="Chọn môn học" />
            </SelectTrigger>
            <SelectContent>
              {courses.data?.map((course) => (
                <SelectItem key={course.id} value={course.id}>
                  {course.code} — {course.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {editing && (
            <p className="text-caption text-muted-foreground">
              Không đổi được môn của lớp đã tạo — đổi môn sẽ kéo theo cả danh sách sinh viên
              và các phiên thi của lớp.
            </p>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="class-name">Tên lớp</Label>
          <Input
            id="class-name"
            required
            value={form.name}
            placeholder="vd: Nhóm 01"
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="class-teacher">Giảng viên phụ trách</Label>
          <Select
            value={form.teacherId}
            onValueChange={(value) => setForm({ ...form, teacherId: value })}
          >
            <SelectTrigger id="class-teacher">
              <SelectValue placeholder="Chọn giảng viên" />
            </SelectTrigger>
            <SelectContent>
              {teachers.data?.map((teacher) => (
                <SelectItem key={teacher.id} value={teacher.id}>
                  {teacher.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </ResourceFormDialog>

      <ConfirmDeleteDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        target={`lớp "${deleting?.name ?? ''}"`}
        submitting={remove.isPending}
        error={remove.error}
        onConfirm={() => remove.mutateAsync(deleting!.id)}
      />
    </ResourceShell>
  );
}
