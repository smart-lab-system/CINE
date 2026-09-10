'use client';

import { useState } from 'react';
import { DoorOpen } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  useCreateRoom,
  useDeleteRoom,
  useRooms,
  useUpdateRoom,
} from '@/hooks/useDepartment';
import type { Room } from '@/lib/api/department';
import { ResourceShell } from '@/components/resource/resource-shell';
import { ResourceFormDialog } from '@/components/resource/resource-form-dialog';
import { ConfirmDeleteDialog } from '@/components/resource/confirm-delete-dialog';

const EMPTY = { name: '', capacity: '' };

export default function RoomsPage() {
  const rooms = useRooms();
  const create = useCreateRoom();
  const update = useUpdateRoom();
  const remove = useDeleteRoom();

  const [form, setForm] = useState(EMPTY);
  const [editing, setEditing] = useState<Room | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [deleting, setDeleting] = useState<Room | null>(null);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY);
    setFormOpen(true);
  }

  function openEdit(room: Room) {
    setEditing(room);
    setForm({ name: room.name, capacity: room.capacity?.toString() ?? '' });
    setFormOpen(true);
  }

  // Capacity is optional: a lab's machine count is not always known when the
  // room is first recorded, and not knowing it must not block recording it.
  function payload() {
    const trimmed = form.capacity.trim();
    return {
      name: form.name,
      ...(trimmed === '' ? {} : { capacity: Number(trimmed) }),
    };
  }

  return (
    <ResourceShell<Room>
      title="Phòng thi"
      description="Phòng máy dùng chung toàn trường — nhiều khoa xếp lịch thi vào cùng một phòng ở các ca khác nhau, nên phòng không thuộc về khoa nào và chỉ quản trị viên khai báo. Tên phòng không được trùng."
      icon={DoorOpen}
      addLabel="Thêm phòng"
      onAdd={openCreate}
      onEdit={openEdit}
      onDelete={setDeleting}
      rows={rooms.data}
      rowKey={(r) => r.id}
      isLoading={rooms.isLoading}
      error={rooms.error}
      emptyTitle="Chưa có phòng thi nào"
      emptyDescription="Mỗi phiên thi phải chọn một phòng, nên hãy khai báo các phòng máy trước."
      columns={[
        { label: 'Tên phòng', render: (r) => <span className="font-medium">{r.name}</span> },
        {
          label: 'Số máy',
          tight: true,
          render: (r) =>
            r.capacity === null ? (
              <span className="text-muted-foreground">chưa rõ</span>
            ) : (
              <span className="tabular-nums">{r.capacity}</span>
            ),
        },
      ]}
    >
      <ResourceFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        title={editing ? 'Sửa phòng thi' : 'Thêm phòng thi'}
        submitLabel={editing ? 'Lưu' : 'Tạo'}
        submitting={create.isPending || update.isPending}
        error={create.error ?? update.error}
        onSubmit={() =>
          editing
            ? update.mutateAsync({ id: editing.id, body: payload() })
            : create.mutateAsync(payload())
        }
      >
        <div className="flex flex-col gap-2">
          <Label htmlFor="room-name">Tên phòng</Label>
          <Input
            id="room-name"
            required
            value={form.name}
            placeholder="vd: Phòng máy A1"
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="room-capacity">Số máy (không bắt buộc)</Label>
          <Input
            id="room-capacity"
            type="number"
            min={1}
            max={1000}
            value={form.capacity}
            placeholder="vd: 40"
            onChange={(e) => setForm({ ...form, capacity: e.target.value })}
          />
          <p className="text-caption text-muted-foreground">
            Dùng để cảnh báo mềm khi sĩ số lớp vượt số máy — không chặn tạo phiên thi.
          </p>
        </div>
      </ResourceFormDialog>

      <ConfirmDeleteDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        target={`phòng "${deleting?.name ?? ''}"`}
        submitting={remove.isPending}
        error={remove.error}
        onConfirm={() => remove.mutateAsync(deleting!.id)}
      />
    </ResourceShell>
  );
}
