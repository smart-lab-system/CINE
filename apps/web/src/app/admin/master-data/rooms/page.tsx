'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/layout/page-header';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { TableCell, TableRow } from '@/components/ui/table';
import { MasterDataHttpError, type ComputerStatus, type RoomStatus } from '@/lib/api/master-data';
import {
  useComputerMutations,
  useComputers,
  useRoomMutations,
  useRooms,
} from '@/hooks/useMasterData';
import { CatalogSection, DeleteIconButton } from '../_components/catalog-table';

const ROOM_STATUSES: RoomStatus[] = ['available', 'maintenance', 'retired'];

export default function RoomsMasterDataPage() {
  const rooms = useRooms({ page: 1, pageSize: 50 });
  const [roomFilter, setRoomFilter] = useState<string>('all');
  const computers = useComputers({
    page: 1,
    pageSize: 50,
    roomId: roomFilter === 'all' ? undefined : roomFilter,
  });
  const roomMut = useRoomMutations();
  const pcMut = useComputerMutations();

  const [roomOpen, setRoomOpen] = useState(false);
  const [pcOpen, setPcOpen] = useState(false);
  const [roomForm, setRoomForm] = useState({
    code: '',
    name: '',
    capacity: '40',
    building: '',
    status: 'available' as RoomStatus,
  });
  const [pcForm, setPcForm] = useState({
    roomId: '',
    hostname: '',
    cpu: '',
    ramGb: '16',
    storage: '',
    gpu: '',
    os: 'Windows 11',
    ipAddress: '',
    macAddress: '',
    status: 'available' as ComputerStatus,
  });

  function onErr(e: unknown) {
    toast.error(e instanceof MasterDataHttpError ? e.message : 'Thao tác thất bại');
  }

  const roomCode = (id: string) => rooms.data?.items.find((r) => r.id === id)?.code ?? '—';

  return (
    <div className="space-y-6">
      <PageHeader title="Phòng & máy" description="Catalog phòng máy — chưa gắn phiên thi." />

      <CatalogSection
        title="Phòng"
        loading={rooms.isLoading}
        onCreate={() => setRoomOpen(true)}
        headers={['Mã', 'Tên', 'Sức chứa', 'Tòa', 'Trạng thái', '']}
        rows={
          rooms.data?.items.length
            ? rooms.data.items.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono">{r.code}</TableCell>
                  <TableCell>{r.name}</TableCell>
                  <TableCell>{r.capacity}</TableCell>
                  <TableCell>{r.building ?? '—'}</TableCell>
                  <TableCell>{r.status}</TableCell>
                  <TableCell className="text-right">
                    <DeleteIconButton
                      onClick={() =>
                        roomMut.remove.mutate(r.id, {
                          onSuccess: () => toast.success('Đã xóa phòng'),
                          onError: onErr,
                        })
                      }
                    />
                  </TableCell>
                </TableRow>
              ))
            : null
        }
      />

      <div className="max-w-xs">
        <Label>Lọc máy theo phòng</Label>
        <Select value={roomFilter} onValueChange={setRoomFilter}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả</SelectItem>
            {(rooms.data?.items ?? []).map((r) => (
              <SelectItem key={r.id} value={r.id}>
                {r.code}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <CatalogSection
        title="Máy tính"
        loading={computers.isLoading}
        onCreate={() => setPcOpen(true)}
        headers={['Phòng', 'Hostname', 'CPU', 'RAM', 'Ổ cứng', 'OS', 'Trạng thái', '']}
        rows={
          computers.data?.items.length
            ? computers.data.items.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-mono">{roomCode(c.roomId)}</TableCell>
                  <TableCell className="font-mono">{c.hostname}</TableCell>
                  <TableCell>{c.cpu}</TableCell>
                  <TableCell>{c.ramGb} GB</TableCell>
                  <TableCell>{c.storage}</TableCell>
                  <TableCell>{c.os}</TableCell>
                  <TableCell>{c.status}</TableCell>
                  <TableCell className="text-right">
                    <DeleteIconButton
                      onClick={() =>
                        pcMut.remove.mutate(c.id, {
                          onSuccess: () => toast.success('Đã xóa máy'),
                          onError: onErr,
                        })
                      }
                    />
                  </TableCell>
                </TableRow>
              ))
            : null
        }
      />

      <Dialog open={roomOpen} onOpenChange={setRoomOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Thêm phòng</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label>Mã</Label>
              <Input
                value={roomForm.code}
                onChange={(e) => setRoomForm({ ...roomForm, code: e.target.value })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Tên</Label>
              <Input
                value={roomForm.name}
                onChange={(e) => setRoomForm({ ...roomForm, name: e.target.value })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Sức chứa</Label>
              <Input
                type="number"
                value={roomForm.capacity}
                onChange={(e) => setRoomForm({ ...roomForm, capacity: e.target.value })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Tòa nhà</Label>
              <Input
                value={roomForm.building}
                onChange={(e) => setRoomForm({ ...roomForm, building: e.target.value })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Trạng thái</Label>
              <Select
                value={roomForm.status}
                onValueChange={(v) => setRoomForm({ ...roomForm, status: v as RoomStatus })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROOM_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() =>
                roomMut.create.mutate(
                  {
                    code: roomForm.code,
                    name: roomForm.name,
                    capacity: Number(roomForm.capacity),
                    building: roomForm.building || null,
                    status: roomForm.status,
                  },
                  {
                    onSuccess: () => {
                      toast.success('Đã tạo phòng');
                      setRoomOpen(false);
                    },
                    onError: onErr,
                  },
                )
              }
            >
              Lưu
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={pcOpen} onOpenChange={setPcOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Thêm máy tính</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label>Phòng</Label>
              <Select
                value={pcForm.roomId}
                onValueChange={(v) => setPcForm({ ...pcForm, roomId: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Chọn phòng" />
                </SelectTrigger>
                <SelectContent>
                  {(rooms.data?.items ?? []).map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {(
              [
                ['hostname', 'Hostname'],
                ['cpu', 'CPU'],
                ['storage', 'Ổ cứng'],
                ['gpu', 'GPU (tuỳ chọn)'],
                ['os', 'Hệ điều hành'],
                ['ipAddress', 'IP'],
                ['macAddress', 'MAC'],
              ] as const
            ).map(([key, label]) => (
              <div key={key} className="grid gap-1.5">
                <Label>{label}</Label>
                <Input
                  value={pcForm[key]}
                  onChange={(e) => setPcForm({ ...pcForm, [key]: e.target.value })}
                />
              </div>
            ))}
            <div className="grid gap-1.5">
              <Label>RAM (GB)</Label>
              <Input
                type="number"
                value={pcForm.ramGb}
                onChange={(e) => setPcForm({ ...pcForm, ramGb: e.target.value })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Trạng thái</Label>
              <Select
                value={pcForm.status}
                onValueChange={(v) => setPcForm({ ...pcForm, status: v as ComputerStatus })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROOM_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() =>
                pcMut.create.mutate(
                  {
                    roomId: pcForm.roomId,
                    hostname: pcForm.hostname,
                    cpu: pcForm.cpu,
                    ramGb: Number(pcForm.ramGb),
                    storage: pcForm.storage,
                    gpu: pcForm.gpu || null,
                    os: pcForm.os,
                    ipAddress: pcForm.ipAddress || null,
                    macAddress: pcForm.macAddress || null,
                    status: pcForm.status,
                  },
                  {
                    onSuccess: () => {
                      toast.success('Đã tạo máy');
                      setPcOpen(false);
                    },
                    onError: onErr,
                  },
                )
              }
            >
              Lưu
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
