'use client';

import { useState } from 'react';
import { BookOpen } from 'lucide-react';
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
  useCreateCourse,
  useDeleteCourse,
  useMyCourses,
  useSemesters,
  useUpdateCourse,
} from '@/hooks/useDepartment';
import type { Course } from '@/lib/api/department';
import { SemesterFilter } from '@/components/layout/semester-filter';
import { useSemesterFilter } from '@/hooks/useSemesterFilter';
import { ResourceShell } from '@/components/resource/resource-shell';
import { ResourceFormDialog } from '@/components/resource/resource-form-dialog';
import { ConfirmDeleteDialog } from '@/components/resource/confirm-delete-dialog';

const EMPTY = { code: '', name: '', semesterId: '' };

export default function CoursesPage() {
  const filter = useSemesterFilter('department-courses');
  const courses = useMyCourses(filter.semesterId);
  const semesters = useSemesters();
  const create = useCreateCourse();
  const update = useUpdateCourse();
  const remove = useDeleteCourse();

  const [form, setForm] = useState(EMPTY);
  const [editing, setEditing] = useState<Course | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [deleting, setDeleting] = useState<Course | null>(null);

  const semesterName = (id: string) =>
    semesters.data?.find((s) => s.id === id)?.name ?? '—';

  // A course must sit in a term, so there is nothing useful to do here until
  // one exists. Saying so beats an empty dropdown.
  const noSemesters = !semesters.isLoading && (semesters.data?.length ?? 0) === 0;

  function openCreate() {
    setEditing(null);
    setForm({ ...EMPTY, semesterId: semesters.data?.[0]?.id ?? '' });
    setFormOpen(true);
  }

  function openEdit(course: Course) {
    setEditing(course);
    setForm({ code: course.code, name: course.name, semesterId: course.semesterId });
    setFormOpen(true);
  }

  return (
    <ResourceShell<Course>
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
      title="Môn học"
      description="Chỉ hiện những môn thuộc khoa bạn. Mọi lớp học, phiên thi và danh sách sinh viên đều gắn vào môn, nên đây là gốc của phạm vi quản lý."
      icon={BookOpen}
      addLabel="Thêm môn học"
      onAdd={openCreate}
      onEdit={openEdit}
      onDelete={setDeleting}
      rows={courses.data}
      rowKey={(c) => c.id}
      isLoading={courses.isLoading}
      error={courses.error}
      emptyTitle="Khoa bạn chưa có môn học nào"
      emptyDescription="Tạo môn học trước, rồi mới mở lớp và giao giảng viên phụ trách."
      columns={[
        {
          label: 'Mã môn',
          tight: true,
          render: (c) => <span className="font-mono font-medium">{c.code}</span>,
        },
        { label: 'Tên môn', render: (c) => c.name },
        {
          label: 'Học kỳ',
          tight: true,
          render: (c) => (
            <span className="text-muted-foreground">{semesterName(c.semesterId)}</span>
          ),
        },
      ]}
    >
      {noSemesters && (
        <Alert variant="info">
          <AlertDescription>
            Chưa có học kỳ nào. Hãy tạo học kỳ trước — mỗi môn học phải thuộc về một học kỳ.
          </AlertDescription>
        </Alert>
      )}

      <ResourceFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        title={editing ? 'Sửa môn học' : 'Thêm môn học'}
        submitLabel={editing ? 'Lưu' : 'Tạo'}
        submitting={create.isPending || update.isPending}
        error={create.error ?? update.error}
        onSubmit={() =>
          editing
            ? update.mutateAsync({ id: editing.id, body: form })
            : create.mutateAsync(form)
        }
      >
        <div className="flex flex-col gap-2">
          <Label htmlFor="course-code">Mã môn</Label>
          <Input
            id="course-code"
            required
            value={form.code}
            placeholder="vd: CS101"
            onChange={(e) => setForm({ ...form, code: e.target.value })}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="course-name">Tên môn</Label>
          <Input
            id="course-name"
            required
            value={form.name}
            placeholder="vd: Nhập môn lập trình"
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="course-semester">Học kỳ</Label>
          <Select
            value={form.semesterId}
            onValueChange={(value) => setForm({ ...form, semesterId: value })}
          >
            <SelectTrigger id="course-semester">
              <SelectValue placeholder="Chọn học kỳ" />
            </SelectTrigger>
            <SelectContent>
              {semesters.data?.map((semester) => (
                <SelectItem key={semester.id} value={semester.id}>
                  {semester.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </ResourceFormDialog>

      <ConfirmDeleteDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        target={`môn "${deleting?.code ?? ''}"`}
        submitting={remove.isPending}
        error={remove.error}
        onConfirm={() => remove.mutateAsync(deleting!.id)}
      />
    </ResourceShell>
  );
}
