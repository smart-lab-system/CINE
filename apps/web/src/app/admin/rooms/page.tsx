'use client';

import { useMemo, useState } from 'react';
import { DoorOpen, Power, PowerOff } from 'lucide-react';
import { ConfirmDeleteDialog } from '@/components/resource/confirm-delete-dialog';
import { NearDuplicateNotice } from '@/components/resource/near-duplicate-notice';
import { ResourceFormDialog } from '@/components/resource/resource-form-dialog';
import { ResourceShell } from '@/components/resource/resource-shell';
import { ImportDialog } from '@/components/import/import-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCreateRoom, useDeleteRoom, useRooms, useUpdateRoom } from '@/hooks/useRooms';
import { NearDuplicateError } from '@/lib/api/http-error';
import type { Room } from '@/lib/api/rooms';
import { ROOM_KIND, normalizeHeader } from '@/lib/import/columns';
import {
  EMPTY_ROOM_FORM,
  roomCreatePayload,
  roomFormOf,
  roomUpdatePayload,
} from '@/lib/master-data-forms';

/**
 * Phòng thi (spec §2.4, §5.1): admin khai báo; giảng viên CHỌN khi tạo phiên. Không gõ tay trong phiên thi nữa, nên "P.A101" và
 * "P A101" không còn là hai phòng — và nhập tay hay nhập từ file đều cảnh báo khi một tên mới GẦN GIỐNG một tên đã có.
 *
 * Tắt hoạt động thay vì xoá: một phòng đã có phiên thi không xoá được (khoá ngoại RESTRICT), và lịch sử giữ nguyên. Phòng đã tắt không
 * chọn được cho phiên MỚI nhưng phiên cũ vẫn tham chiếu được; đảo lại được ngay nên bật/tắt không cần hộp thoại xác nhận.
 *
 * Ô tìm lọc trong trình duyệt: danh sách phòng nhỏ và đã tải đủ. So sánh bỏ dấu và hoa-thường (cùng `normalizeHeader` của bộ nhập file).
 */
export default function RoomsPage() {
  const rooms = useRooms();
  const create = useCreateRoom();
  const update = useUpdateRoom();
  const remove = useDeleteRoom();

  const [form, setForm] = useState(EMPTY_ROOM_FORM);
  const [editing, setEditing] = useState<Room | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [deleting, setDeleting] = useState<Room | null>(null);
  const [search, setSearch] = useState('');
  const [toggleError, setToggleError] = useState<Error | null>(null);

  const searching = search.trim() !== '';
  const rows = useMemo(() => {
    const all = rooms.data ?? [];
    const query = normalizeHeader(search);
    return query === '' ? all : all.filter((room) => normalizeHeader(room.name).includes(query));
  }, [rooms.data, search]);

  function openCreate() {
    create.reset();
    update.reset();
    setEditing(null);
    setForm(EMPTY_ROOM_FORM);
    setFormOpen(true);
  }

  function openEdit(room: Room) {
    create.reset();
    update.reset();
    setEditing(room);
    setForm(roomFormOf(room));
    setFormOpen(true);
  }

  function openDelete(room: Room) {
    remove.reset();
    setDeleting(room);
  }

  /** `confirmSimilar` chỉ được gửi khi admin đã bấm "Vẫn thêm/lưu phòng này" sau khi thấy lời nhắc. */
  function save(confirmSimilar: boolean): Promise<unknown> {
    const similar = confirmSimilar ? { confirmSimilar: true } : {};
    return editing
      ? update.mutateAsync({ id: editing.id, body: { ...roomUpdatePayload(form), ...similar } })
      : create.mutateAsync({ ...roomCreatePayload(form), ...similar });
  }

  function toggleActive(room: Room) {
    setToggleError(null);
    update.mutateAsync({ id: room.id, body: { isActive: !room.isActive } }).catch((error: Error) => {
      setToggleError(error);
    });
  }

  const formError = create.error ?? update.error;
  const nearDuplicate = formError instanceof NearDuplicateError ? formError : null;

  return (
    <ResourceShell<Room>
      title="Phòng thi"
      description="Phòng thi dùng chung toàn trường — chỉ quản trị viên khai báo. Giảng viên chọn phòng khi tạo phiên thi, nên một tên phòng chỉ nên có một cách viết."
      icon={DoorOpen}
      addLabel="Thêm phòng"
      onAdd={openCreate}
      onEdit={openEdit}
      onDelete={openDelete}
      headerActions={<ImportDialog kind={ROOM_KIND} />}
      rows={rows}
      rowKey={(r) => r.id}
      isLoading={rooms.isLoading}
      error={rooms.error ?? toggleError}
      emptyTitle={searching ? 'Không có phòng nào khớp ô tìm' : 'Chưa có phòng thi nào'}
      emptyDescription={
        searching
          ? 'Thử từ khoá khác, hoặc xoá ô tìm để xem tất cả phòng.'
          : 'Mỗi phiên thi phải chọn một phòng, nên hãy khai báo các phòng trước.'
      }
      rowClassName={(r) => (r.isActive ? undefined : 'opacity-60')}
      filters={
        <div className="flex items-center gap-2">
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm theo tên phòng..."
            className="sm:max-w-xs"
            aria-label="Tìm phòng thi"
          />
          {searching && (
            <Button type="button" variant="ghost" size="sm" onClick={() => setSearch('')}>
              Xoá ô tìm
            </Button>
          )}
        </div>
      }
      rowActions={(r) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => toggleActive(r)}
          aria-label={r.isActive ? 'Tắt hoạt động' : 'Bật hoạt động'}
          title={r.isActive ? 'Tắt hoạt động: không chọn được cho phiên mới' : 'Bật hoạt động'}
        >
          {r.isActive ? (
            <PowerOff className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Power className="h-4 w-4" aria-hidden="true" />
          )}
        </Button>
      )}
      columns={[
        { label: 'Tên phòng', render: (r) => <span className="font-medium">{r.name}</span> },
        {
          label: 'Sức chứa',
          tight: true,
          render: (r) =>
            r.capacity === null ? (
              <span className="text-muted-foreground">chưa rõ</span>
            ) : (
              <span className="tabular-nums">{r.capacity}</span>
            ),
        },
        {
          label: 'Trạng thái',
          tight: true,
          render: (r) =>
            r.isActive ? <Badge variant="success">Đang hoạt động</Badge> : <Badge>Ngừng hoạt động</Badge>,
        },
        {
          label: 'Số phiên thi',
          tight: true,
          render: (r) => <span className="tabular-nums">{r.sessionCount ?? 0}</span>,
        },
      ]}
    >
      <ResourceFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        title={editing ? 'Sửa phòng thi' : 'Thêm phòng thi'}
        submitLabel={editing ? 'Lưu' : 'Tạo'}
        submitting={create.isPending || update.isPending}
        error={formError}
        canSubmit={form.name.trim() !== ''}
        onSubmit={() => save(false)}
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
          <Label htmlFor="room-capacity">Sức chứa (không bắt buộc)</Label>
          <Input
            id="room-capacity"
            type="number"
            min={1}
            max={1000}
            value={form.capacity}
            placeholder="vd: 40"
            onChange={(e) => setForm({ ...form, capacity: e.target.value })}
          />
          {editing && (
            <p className="text-caption text-muted-foreground">
              Để trống nghĩa là bỏ sức chứa. Đổi tên phòng không đổi các phiên thi đã tạo: phiên thi đã tạo giữ tên cũ (tên phòng
              được chụp lúc tạo phiên).
            </p>
          )}
        </div>
        {nearDuplicate && (
          <NearDuplicateNotice
            error={nearDuplicate}
            noun="phòng"
            action={editing ? 'lưu' : 'thêm'}
            confirming={create.isPending || update.isPending}
            onConfirm={() => {
              void save(true)
                .then(() => setFormOpen(false))
                .catch(() => {
                  // Lý do đã hiện trong biểu mẫu qua `error`.
                });
            }}
          />
        )}
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
