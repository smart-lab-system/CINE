'use client';

import { useState } from 'react';
import { CalendarRange } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  useCreateSemester,
  useDeleteSemester,
  useSemesters,
  useSetCurrentSemester,
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
  const setCurrent = useSetCurrentSemester();

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
      description="Lịch học kỳ của toàn trường. Chỉ Phòng Đào tạo sửa được; mọi khoa và giảng viên đều đọc cùng danh sách này. Kỳ đang gạt cờ là mặc định cho mọi màn hình lọc theo học kỳ."
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
        {
          label: 'Hiện hành',
          tight: true,
          // Kỳ đang giữ cờ hiện badge, không hiện nút: không có thao tác "gỡ
          // cờ" — gỡ mà không gắn kỳ khác là làm mù mọi màn hình lọc theo học
          // kỳ, nên cách duy nhất để đổi là gạt sang một kỳ khác.
          render: (s) =>
            s.isCurrent ? (
              <Badge variant="success">Đang hiện hành</Badge>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={setCurrent.isPending}
                onClick={() => setCurrent.mutate(s.id)}
              >
                Đặt làm hiện hành
              </Button>
            ),
        },
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
