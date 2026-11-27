'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  acceptCreateRoom,
  getRoomProposal,
  LabRoomProposalHttpError,
  listRoomProposals,
  rejectRoomProposal,
  type LabRoomProposal,
  type LabRoomProposalDetail,
} from '@/lib/api/lab-room-proposals';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

function statusLabel(status: string) {
  switch (status) {
    case 'pending':
      return 'Chờ duyệt';
    case 'accepted':
      return 'Đã tạo phòng';
    case 'rejected':
      return 'Từ chối';
    case 'withdrawn':
      return 'Đã rút';
    default:
      return status;
  }
}

function formatWhen(value: string | null | undefined) {
  if (!value) return '-';
  try {
    return new Date(value).toLocaleString('vi-VN');
  } catch {
    return value;
  }
}

function machineStatusLabel(status: string) {
  switch (status) {
    case 'active':
      return 'Hoạt động';
    case 'maintenance':
      return 'Bảo trì';
    case 'inactive':
      return 'Ngưng';
    default:
      return status;
  }
}

export function RoomProposalsPanel() {
  const router = useRouter();
  const [items, setItems] = useState<LabRoomProposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'pending' | 'all'>('pending');
  const [detail, setDetail] = useState<LabRoomProposalDetail | null>(null);
  const [acceptOpen, setAcceptOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    code: '',
    name: '',
    capacity: '1',
    building: '',
    floor: '',
  });

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await listRoomProposals(filter === 'pending' ? 'pending' : undefined);
      setItems(rows);
    } catch (e) {
      toast.error(e instanceof LabRoomProposalHttpError ? e.message : 'Không tải được đề xuất.');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const openDetail = async (id: string) => {
    try {
      const d = await getRoomProposal(id);
      setDetail(d);
    } catch (e) {
      toast.error(e instanceof LabRoomProposalHttpError ? e.message : 'Không tải chi tiết.');
    }
  };

  const openAccept = () => {
    if (!detail) return;
    setForm({
      code: detail.code,
      name: detail.name,
      capacity: String(detail.capacity),
      building: detail.building ?? '',
      floor: detail.floor ?? '',
    });
    setAcceptOpen(true);
  };

  const onReject = async () => {
    if (!detail) return;
    setBusy(true);
    try {
      await rejectRoomProposal(detail.id);
      toast.success('Đã từ chối đề xuất.');
      setDetail(null);
      await reload();
    } catch (e) {
      toast.error(e instanceof LabRoomProposalHttpError ? e.message : 'Từ chối thất bại.');
    } finally {
      setBusy(false);
    }
  };

  const onAccept = async () => {
    if (!detail) return;
    setBusy(true);
    try {
      const res = await acceptCreateRoom(detail.id, {
        code: form.code.trim(),
        name: form.name.trim(),
        capacity: Number(form.capacity),
        building: form.building.trim() || null,
        floor: form.floor.trim() || null,
      });
      toast.success('Đã tạo phòng từ đề xuất.');
      setAcceptOpen(false);
      setDetail(null);
      await reload();
      router.push(
        `/admin/master-data/computers?roomId=${encodeURIComponent(res.roomId)}`,
      );
    } catch (e) {
      toast.error(e instanceof LabRoomProposalHttpError ? e.message : 'Tạo phòng thất bại.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">Đề xuất từ lab</h2>
          <p className="text-sm text-muted-foreground">
            Giảng viên gửi đề xuất từ tài khoản của họ, kèm máy của giảng viên và máy của sinh viên.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant={filter === 'pending' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter('pending')}
          >
            Chờ duyệt
          </Button>
          <Button
            type="button"
            variant={filter === 'all' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter('all')}
          >
            Tất cả
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => void reload()}>
            Làm mới
          </Button>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Đang tải…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Chưa có đề xuất nào.</p>
      ) : (
        <Table className="w-full text-sm">
          <TableHeader>
            <TableRow className="text-left text-muted-foreground">
              <TableHead className="py-2 pr-2 font-medium">Mã</TableHead>
              <TableHead className="py-2 pr-2 font-medium">Tên</TableHead>
              <TableHead className="py-2 pr-2 font-medium">Sức chứa</TableHead>
              <TableHead className="py-2 pr-2 font-medium">Tòa / Tầng</TableHead>
              <TableHead className="py-2 pr-2 font-medium">Số máy</TableHead>
              <TableHead className="py-2 pr-2 font-medium">Người gửi</TableHead>
              <TableHead className="py-2 pr-2 font-medium">Thời gian</TableHead>
              <TableHead className="py-2 font-medium">Trạng thái</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((p) => (
              <TableRow
                key={p.id}
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => void openDetail(p.id)}
              >
                <TableCell className="py-2 pr-2 font-mono">{p.code}</TableCell>
                <TableCell className="py-2 pr-2">{p.name}</TableCell>
                <TableCell className="py-2 pr-2">{p.capacity}</TableCell>
                <TableCell className="py-2 pr-2">
                  {p.building ?? '-'} / {p.floor ?? '-'}
                </TableCell>
                <TableCell className="py-2 pr-2">{p.machineCount}</TableCell>
                <TableCell className="py-2 pr-2">
                  {p.proposedByDisplayName ?? p.proposedByEmail}
                  <span className="block text-xs text-muted-foreground">{p.proposedByEmail}</span>
                </TableCell>
                <TableCell className="py-2 pr-2">{formatWhen(p.createdAt)}</TableCell>
                <TableCell className="py-2">{statusLabel(p.status)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={!!detail} onOpenChange={(open) => !open && setDetail(null)}>
        <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle>
                  Đề xuất {detail.code} - {detail.name}
                </DialogTitle>
              </DialogHeader>
              <div className="grid gap-2 text-sm sm:grid-cols-2">
                <p>
                  <span className="text-muted-foreground">Sức chứa:</span> {detail.capacity}
                </p>
                <p>
                  <span className="text-muted-foreground">Tòa / Tầng:</span>{' '}
                  {detail.building ?? '-'} / {detail.floor ?? '-'}
                </p>
                <p className="sm:col-span-2">
                  <span className="text-muted-foreground">Người gửi:</span>{' '}
                  {detail.proposedByDisplayName ?? '-'} ({detail.proposedByEmail})
                </p>
                <p className="sm:col-span-2">
                  <span className="text-muted-foreground">Trạng thái:</span>{' '}
                  {statusLabel(detail.status)} · {formatWhen(detail.createdAt)}
                </p>
              </div>

              <Table container={{ className: 'rounded-md border' }} className="w-full min-w-[980px] text-sm">
                <TableHeader>
                  <TableRow className="text-left text-muted-foreground">
                    <TableHead className="px-2 py-1.5 font-medium">Role</TableHead>
                    <TableHead className="px-2 py-1.5 font-medium">Hostname</TableHead>
                    <TableHead className="px-2 py-1.5 font-medium">CPU</TableHead>
                    <TableHead className="px-2 py-1.5 font-medium">RAM</TableHead>
                    <TableHead className="px-2 py-1.5 font-medium">Ổ cứng</TableHead>
                    <TableHead className="px-2 py-1.5 font-medium">GPU</TableHead>
                    <TableHead className="px-2 py-1.5 font-medium">HĐH</TableHead>
                    <TableHead className="px-2 py-1.5 font-medium">IP</TableHead>
                    <TableHead className="px-2 py-1.5 font-medium">MAC</TableHead>
                    <TableHead className="px-2 py-1.5 font-medium">Trạng thái</TableHead>
                    <TableHead className="px-2 py-1.5 font-medium">SV</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detail.machines.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="px-2 py-1.5 whitespace-nowrap">
                        {m.role === 'teacher_hub' ? 'Máy GV' : 'Máy SV'}
                      </TableCell>
                      <TableCell className="px-2 py-1.5 font-mono text-xs">{m.hostname}</TableCell>
                      <TableCell className="px-2 py-1.5">{m.cpu}</TableCell>
                      <TableCell className="px-2 py-1.5">{m.ramGb} GB</TableCell>
                      <TableCell className="px-2 py-1.5">{m.storage}</TableCell>
                      <TableCell className="px-2 py-1.5">{m.gpu ?? '-'}</TableCell>
                      <TableCell className="px-2 py-1.5">{m.os}</TableCell>
                      <TableCell className="px-2 py-1.5 font-mono text-xs">{m.localIp}</TableCell>
                      <TableCell className="px-2 py-1.5 font-mono text-xs">{m.macAddress}</TableCell>
                      <TableCell className="px-2 py-1.5">{machineStatusLabel(m.status)}</TableCell>
                      <TableCell className="px-2 py-1.5">
                        {m.studentMssv
                          ? `${m.studentFullName ?? ''} ${m.studentMssv}`.trim()
                          : '-'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {detail.status === 'pending' && (
                <DialogFooter className="gap-2 sm:justify-between">
                  <Button type="button" variant="outline" disabled={busy} onClick={() => void onReject()}>
                    Từ chối
                  </Button>
                  <Button type="button" disabled={busy} onClick={openAccept}>
                    Tạo phòng từ đề xuất
                  </Button>
                </DialogFooter>
              )}
              {detail.status === 'accepted' && detail.createdRoomId && (
                <DialogFooter>
                  <Button
                    type="button"
                    onClick={() =>
                      router.push(
                        `/admin/master-data/computers?roomId=${encodeURIComponent(detail.createdRoomId!)}`,
                      )
                    }
                  >
                    Xem máy trong phòng
                  </Button>
                </DialogFooter>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={acceptOpen} onOpenChange={setAcceptOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tạo phòng từ đề xuất</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label>Mã</Label>
              <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label>Tên</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label>Sức chứa</Label>
              <Input
                type="number"
                value={form.capacity}
                onChange={(e) => setForm({ ...form, capacity: e.target.value })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Tòa</Label>
              <Input
                value={form.building}
                onChange={(e) => setForm({ ...form, building: e.target.value })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Tầng</Label>
              <Input value={form.floor} onChange={(e) => setForm({ ...form, floor: e.target.value })} />
            </div>
            <p className="text-xs text-muted-foreground">
              Sẽ tạo {detail?.machineCount ?? 0} máy map 1-1 từ snapshot (Hostname, CPU, RAM, Ổ
              cứng, GPU, HĐH, IP, MAC, Trạng thái) - không cần nhập lại phần cứng.
            </p>
          </div>
          <DialogFooter>
            <Button type="button" disabled={busy} onClick={() => void onAccept()}>
              {busy ? 'Đang tạo…' : 'Xác nhận tạo phòng'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
