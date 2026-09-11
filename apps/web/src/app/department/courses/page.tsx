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
import { useCurrentSemester } from '@/hooks/useSemesterFilter';
import type { Course } from '@/lib/api/department';
import { ResourceShell } from '@/components/resource/resource-shell';
import { ResourceFormDialog } from '@/components/resource/resource-form-dialog';
import { ConfirmDeleteDialog } from '@/components/resource/confirm-delete-dialog';

const EMPTY = { code: '', name: '', semesterId: '' };

function formatRange(startDate: string, endDate: string): string {
  const fmt = (iso: string) => {
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString('vi-VN');
  };
  return `${fmt(startDate)} – ${fmt(endDate)}`;
}

export default function CoursesPage() {
  const courses = useMyCourses();
  const semesters = useSemesters();
  // Cùng công thức với banner ở header và bộ lọc danh sách — ba chỗ
  // trả lời "kỳ nào là hiện tại" phải giống nhau, nếu không người dùng
  // sẽ thấy header nói một đằng còn form chọn sẵn một nẻo.
  const { current: defaultSemester } = useCurrentSemester();
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
    // KHÔNG phải `semesters.data[0]`: danh sách sắp theo `start_date
    // DESC`, nên phần tử đầu là kỳ có ngày bắt đầu XA NHẤT trong tương
    // lai. Quản trị viên tạo sẵn kỳ sau là chuyện thường, và khi đó form
    // sẽ mặc định vào một kỳ còn nhiều tháng nữa mới tới — đúng cái bẫy
    // `MAX(start_date)` mà CLAUDE.md §7.2.3 mô tả.
    setForm({ ...EMPTY, semesterId: defaultSemester?.id ?? '' });
    setFormOpen(true);
  }

  function openEdit(course: Course) {
    setEditing(course);
    setForm({ code: course.code, name: course.name, semesterId: course.semesterId });
    setFormOpen(true);
  }

  return (
    <ResourceShell<Course>
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
                  {/* Khoảng ngày ngay cạnh tên: tên kỳ do người nhập tự
                      đặt nên không bảo đảm nói lên điều gì, còn ngày thì
                      luôn cho biết lựa chọn này có hợp lý không. */}
                  <span className="ml-2 text-caption text-muted-foreground">
                    {formatRange(semester.startDate, semester.endDate)}
                    {defaultSemester?.id === semester.id ? " · mặc định" : ''}
                  </span>
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
