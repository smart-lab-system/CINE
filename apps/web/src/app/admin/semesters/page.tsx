'use client';

import { useState } from 'react';
import { CalendarRange } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  useCreateSemester,
  useDeleteSemester,
  useSemesters,
  useUpdateSemester,
} from '@/hooks/useDepartment';
import type { Semester } from '@/lib/api/department';
import { ResourceShell } from '@/components/resource/resource-shell';
import { ResourceFormDialog } from '@/components/resource/resource-form-dialog';
import { ConfirmDeleteDialog } from '@/components/resource/confirm-delete-dialog';

function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString('vi-VN');
}

const EMPTY = { name: '', startDate: '', endDate: '' };

export default function SemestersPage() {
  const semesters = useSemesters();
  const create = useCreateSemester();
  const update = useUpdateSemester();
  const remove = useDeleteSemester();

  const [form, setForm] = useState(EMPTY);
  const [editing, setEditing] = useState<Semester | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [deleting, setDeleting] = useState<Semester | null>(null);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY);
    setFormOpen(true);
  }

  function openEdit(semester: Semester) {
    setEditing(semester);
    setForm({
      name: semester.name,
      // <input type="date"> wants yyyy-mm-dd; the column is a date, so the
      // wire value already starts with it.
      startDate: semester.startDate.slice(0, 10),
      endDate: semester.endDate.slice(0, 10),
    });
    setFormOpen(true);
  }

  return (
    <ResourceShell<Semester>
      title="Học kỳ"
      description="Học kỳ dùng chung toàn trường — mọi role đều đọc được danh sách này, nhưng chỉ quản trị viên khai báo và sửa. Tên học kỳ không được trùng."
      icon={CalendarRange}
      addLabel="Thêm học kỳ"
      onAdd={openCreate}
      onEdit={openEdit}
      onDelete={setDeleting}
      rows={semesters.data}
      rowKey={(s) => s.id}
      isLoading={semesters.isLoading}
      error={semesters.error}
      emptyTitle="Chưa có học kỳ nào"
      emptyDescription="Tạo học kỳ trước, vì mỗi môn học phải thuộc về một học kỳ."
      columns={[
        { label: 'Tên học kỳ', render: (s) => <span className="font-medium">{s.name}</span> },
        { label: 'Bắt đầu', tight: true, render: (s) => formatDate(s.startDate) },
        { label: 'Kết thúc', tight: true, render: (s) => formatDate(s.endDate) },
      ]}
    >
      <ResourceFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        title={editing ? 'Sửa học kỳ' : 'Thêm học kỳ'}
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
          <Label htmlFor="semester-name">Tên học kỳ</Label>
          <Input
            id="semester-name"
            required
            value={form.name}
            placeholder="vd: Học kỳ 1 2026-2027"
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="semester-start">Ngày bắt đầu</Label>
            <Input
              id="semester-start"
              type="date"
              required
              value={form.startDate}
              onChange={(e) => setForm({ ...form, startDate: e.target.value })}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="semester-end">Ngày kết thúc</Label>
            <Input
              id="semester-end"
              type="date"
              required
              value={form.endDate}
              onChange={(e) => setForm({ ...form, endDate: e.target.value })}
            />
          </div>
        </div>
      </ResourceFormDialog>

      <ConfirmDeleteDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        target={`học kỳ "${deleting?.name ?? ''}"`}
        submitting={remove.isPending}
        error={remove.error}
        onConfirm={() => remove.mutateAsync(deleting!.id)}
      />
    </ResourceShell>
  );
}
