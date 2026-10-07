'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
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
import {
  MasterDataHttpError,
  type Computer,
  type ComputerStatus,
  type Room,
  type RoomStatus,
} from '@/lib/api/master-data';
import {
  useComputerMutations,
  useComputers,
  useRoomMutations,
  useRooms,
} from '@/hooks/useMasterData';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { cn } from '@/lib/utils';
import {
  CatalogSection,
  DeleteIconButton,
  EditIconButton,
  RowActions,
} from '../_components/catalog-table';
import { CatalogFilterBar } from '../_components/catalog-filter-bar';
import { buildCatalogQuery } from '../_components/catalog-url';
import {
  FACILITY_STATUSES,
  facilityStatusLabel,
  type FacilityStatus,
} from '@/lib/master-data-defaults';

const EMPTY_ROOM = {
  code: '',
  name: '',
  capacity: '40',
  building: '',
  floor: '',
  status: 'active' as RoomStatus,
};

const EMPTY_PC = {
  roomId: '',
  hostname: '',
  location: '',
  cpu: '',
  ramGb: '16',
  storage: '',
  gpu: '',
  os: 'Windows 11',
  ipAddress: '',
  macAddress: '',
  status: 'active' as ComputerStatus,
};

export default function RoomsMasterDataPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <RoomsMasterDataContent />
    </Suspense>
  );
}

function RoomsMasterDataContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [roomSearch, setRoomSearch] = useState(searchParams.get('qRoom') ?? '');
  const [roomStatus, setRoomStatus] = useState(searchParams.get('statusRoom') ?? 'all');
  const [pcSearch, setPcSearch] = useState(searchParams.get('q') ?? '');
  const [pcStatus, setPcStatus] = useState(searchParams.get('statusPc') ?? 'all');
  const [roomId, setRoomId] = useState(searchParams.get('roomId') ?? '');

  const debouncedRoomSearch = useDebouncedValue(roomSearch, 300);
  const debouncedPcSearch = useDebouncedValue(pcSearch, 300);
  const lastUrl = useRef('');

  useEffect(() => {
    const qs = buildCatalogQuery(new URLSearchParams(), {
      qRoom: debouncedRoomSearch.trim() || null,
      statusRoom: roomStatus === 'all' ? null : roomStatus,
      q: debouncedPcSearch.trim() || null,
      statusPc: pcStatus === 'all' ? null : pcStatus,
      roomId: roomId || null,
    });
    if (qs === lastUrl.current) return;
    lastUrl.current = qs;
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [
    debouncedRoomSearch,
    roomStatus,
    debouncedPcSearch,
    pcStatus,
    roomId,
    pathname,
    router,
  ]);

  const rooms = useRooms({
    page: 1,
    pageSize: 50,
    search: debouncedRoomSearch.trim() || undefined,
    status: roomStatus === 'all' ? undefined : roomStatus,
  });
  const computers = useComputers({
    page: 1,
    pageSize: 50,
    roomId: roomId || undefined,
    search: debouncedPcSearch.trim() || undefined,
    status: pcStatus === 'all' ? undefined : pcStatus,
  });
  const roomMut = useRoomMutations();
  const pcMut = useComputerMutations();

  const [roomOpen, setRoomOpen] = useState(false);
  const [pcOpen, setPcOpen] = useState(false);
  const [editingRoomId, setEditingRoomId] = useState<string | null>(null);
  const [editingPcId, setEditingPcId] = useState<string | null>(null);
  const [roomForm, setRoomForm] = useState(EMPTY_ROOM);
  const [pcForm, setPcForm] = useState(EMPTY_PC);

  function onErr(e: unknown) {
    toast.error(e instanceof MasterDataHttpError ? e.message : 'Thao tác thất bại');
  }

  const roomCode = (id: string) => rooms.data?.items.find((r) => r.id === id)?.code ?? '—';
  const selectedRoomCode = roomId ? roomCode(roomId) : undefined;
  const roomFiltered =
    Boolean(debouncedRoomSearch.trim()) || roomStatus !== 'all';
  const pcFiltered =
    Boolean(debouncedPcSearch.trim()) || pcStatus !== 'all' || Boolean(roomId);

  function openCreateRoom() {
    setEditingRoomId(null);
    setRoomForm(EMPTY_ROOM);
    setRoomOpen(true);
  }

  function openEditRoom(r: Room) {
    setEditingRoomId(r.id);
    setRoomForm({
      code: r.code,
      name: r.name,
      capacity: String(r.capacity),
      building: r.building ?? '',
      floor: r.floor ?? '',
      status: r.status,
    });
    setRoomOpen(true);
  }

  function openCreatePc() {
    setEditingPcId(null);
    setPcForm({ ...EMPTY_PC, roomId: roomId || '' });
    setPcOpen(true);
  }

  function openEditPc(c: Computer) {
    setEditingPcId(c.id);
    setPcForm({
      roomId: c.roomId,
      hostname: c.hostname,
      location: c.location,
      cpu: c.cpu,
      ramGb: String(c.ramGb),
      storage: c.storage,
      gpu: c.gpu ?? '',
      os: c.os,
      ipAddress: c.ipAddress ?? '',
      macAddress: c.macAddress ?? '',
      status: c.status,
    });
    setPcOpen(true);
  }

  function submitRoom() {
    const body = {
      name: roomForm.name,
      capacity: Number(roomForm.capacity),
      building: roomForm.building || null,
      floor: roomForm.floor || null,
      status: roomForm.status,
    };
    if (editingRoomId) {
      roomMut.update.mutate(
        { id: editingRoomId, body },
        {
          onSuccess: () => {
            toast.success('Đã cập nhật phòng');
            setRoomOpen(false);
          },
          onError: onErr,
        },
      );
      return;
    }
    roomMut.create.mutate(
      { ...body, code: roomForm.code },
      {
        onSuccess: () => {
          toast.success('Đã tạo phòng');
          setRoomOpen(false);
        },
        onError: onErr,
      },
    );
  }

  function submitPc() {
    const body = {
      roomId: pcForm.roomId,
      location: pcForm.location,
      cpu: pcForm.cpu,
      ramGb: Number(pcForm.ramGb),
      storage: pcForm.storage,
      gpu: pcForm.gpu || null,
      os: pcForm.os,
      ipAddress: pcForm.ipAddress || null,
      macAddress: pcForm.macAddress || null,
      status: pcForm.status,
    };
    if (editingPcId) {
      pcMut.update.mutate(
        { id: editingPcId, body },
        {
          onSuccess: () => {
            toast.success('Đã cập nhật máy');
            setPcOpen(false);
          },
          onError: onErr,
        },
      );
      return;
    }
    pcMut.create.mutate(
      { ...body, hostname: pcForm.hostname },
      {
        onSuccess: () => {
          toast.success('Đã tạo máy');
          setPcOpen(false);
        },
        onError: onErr,
      },
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Phòng & máy" description="Catalog phòng máy — chưa gắn phiên thi." />

      <CatalogSection
        title="Phòng"
        loading={rooms.isLoading}
        onCreate={openCreateRoom}
        headers={['Mã', 'Tên', 'Sức chứa', 'Tòa', 'Tầng', 'Trạng thái', '']}
        empty={roomFiltered ? 'Không khớp bộ lọc.' : 'Chưa có dữ liệu.'}
        toolbar={
          <CatalogFilterBar
            search={roomSearch}
            onSearchChange={setRoomSearch}
            searchPlaceholder="Mã hoặc tên phòng…"
            searchAriaLabel="Tìm phòng"
            filters={
              <Select value={roomStatus} onValueChange={setRoomStatus}>
                <SelectTrigger className="sm:w-44" aria-label="Lọc trạng thái phòng">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tất cả trạng thái</SelectItem>
                  {FACILITY_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {facilityStatusLabel(s)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            }
            activeSummary={roomFiltered ? 'Đang lọc phòng' : null}
            onClear={() => {
              setRoomSearch('');
              setRoomStatus('all');
            }}
          />
        }
        rows={
          rooms.data?.items.length
            ? rooms.data.items.map((r) => (
                <TableRow
                  key={r.id}
                  className={cn('cursor-pointer', roomId === r.id && 'bg-muted/60')}
                  onClick={() => setRoomId((prev) => (prev === r.id ? '' : r.id))}
                  title="Bấm để lọc máy theo phòng này"
                >
                  <TableCell className="font-mono">{r.code}</TableCell>
                  <TableCell>{r.name}</TableCell>
                  <TableCell>{r.capacity}</TableCell>
                  <TableCell>{r.building ?? '—'}</TableCell>
                  <TableCell>{r.floor ?? '—'}</TableCell>
                  <TableCell>{facilityStatusLabel(r.status)}</TableCell>
                  <TableCell className="text-right">
                    <RowActions>
                      <EditIconButton onClick={() => openEditRoom(r)} />
                      <DeleteIconButton
                        onClick={() =>
                          roomMut.remove.mutate(r.id, {
                            onSuccess: () => {
                              toast.success('Đã xóa phòng');
                              if (roomId === r.id) setRoomId('');
                            },
                            onError: onErr,
                          })
                        }
                      />
                    </RowActions>
                  </TableCell>
                </TableRow>
              ))
            : null
        }
      />

      <CatalogSection
        title="Máy tính"
        loading={computers.isLoading}
        onCreate={openCreatePc}
        headers={[
          'Phòng',
          'Hostname',
          'Vị trí',
          'CPU',
          'RAM',
          'Ổ cứng',
          'OS',
          'Trạng thái',
          '',
        ]}
        empty={pcFiltered ? 'Không khớp bộ lọc.' : 'Chưa có dữ liệu.'}
        toolbar={
          <CatalogFilterBar
            search={pcSearch}
            onSearchChange={setPcSearch}
            searchPlaceholder="Hostname, IP hoặc vị trí…"
            searchAriaLabel="Tìm máy tính"
            filters={
              <>
                <Select
                  value={roomId || 'all'}
                  onValueChange={(v) => setRoomId(v === 'all' ? '' : v)}
                >
                  <SelectTrigger className="sm:w-44" aria-label="Lọc theo phòng">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tất cả phòng</SelectItem>
                    {(rooms.data?.items ?? []).map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.code}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={pcStatus} onValueChange={setPcStatus}>
                  <SelectTrigger className="sm:w-44" aria-label="Lọc trạng thái máy">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tất cả trạng thái</SelectItem>
                    {FACILITY_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {facilityStatusLabel(s as FacilityStatus)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </>
            }
            activeSummary={
              selectedRoomCode && selectedRoomCode !== '—'
                ? `Đang xem: ${selectedRoomCode}`
                : pcFiltered
                  ? 'Đang lọc máy'
                  : null
            }
            onClear={() => {
              setPcSearch('');
              setPcStatus('all');
              setRoomId('');
            }}
          />
        }
        rows={
          computers.data?.items.length
            ? computers.data.items.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-mono">{roomCode(c.roomId)}</TableCell>
                  <TableCell className="font-mono">{c.hostname}</TableCell>
                  <TableCell>{c.location || '—'}</TableCell>
                  <TableCell>{c.cpu}</TableCell>
                  <TableCell>{c.ramGb} GB</TableCell>
                  <TableCell>{c.storage}</TableCell>
                  <TableCell>{c.os}</TableCell>
                  <TableCell>{facilityStatusLabel(c.status)}</TableCell>
                  <TableCell className="text-right">
                    <RowActions>
                      <EditIconButton onClick={() => openEditPc(c)} />
                      <DeleteIconButton
                        onClick={() =>
                          pcMut.remove.mutate(c.id, {
                            onSuccess: () => toast.success('Đã xóa máy'),
                            onError: onErr,
                          })
                        }
                      />
                    </RowActions>
                  </TableCell>
                </TableRow>
              ))
            : null
        }
      />

      <Dialog open={roomOpen} onOpenChange={setRoomOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingRoomId ? 'Sửa phòng' : 'Thêm phòng'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label>Mã</Label>
              <Input
                value={roomForm.code}
                readOnly={!!editingRoomId}
                className={editingRoomId ? 'bg-muted' : undefined}
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
              <Label>Tầng</Label>
              <Input
                value={roomForm.floor}
                onChange={(e) => setRoomForm({ ...roomForm, floor: e.target.value })}
                placeholder="1, G, B1…"
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
                  {FACILITY_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {facilityStatusLabel(s)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={submitRoom}>Lưu</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={pcOpen} onOpenChange={setPcOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingPcId ? 'Sửa máy tính' : 'Thêm máy tính'}</DialogTitle>
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
            <div className="grid gap-1.5">
              <Label>Hostname</Label>
              <Input
                value={pcForm.hostname}
                readOnly={!!editingPcId}
                className={editingPcId ? 'bg-muted' : undefined}
                onChange={(e) => setPcForm({ ...pcForm, hostname: e.target.value })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Vị trí</Label>
              <Input
                value={pcForm.location}
                onChange={(e) => setPcForm({ ...pcForm, location: e.target.value })}
                placeholder="P01, A-1…"
              />
            </div>
            {(
              [
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
                  {FACILITY_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {facilityStatusLabel(s)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={submitPc}>Lưu</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
