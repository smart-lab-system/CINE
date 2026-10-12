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
import { MasterDataHttpError, type Room, type RoomStatus } from '@/lib/api/master-data';
import { useRoomMutations, useRooms } from '@/hooks/useMasterData';
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
import { ListPaginationBar } from '@/components/list-pagination-bar';
import {
  parsePage,
  parsePageSize,
  paginationQueryPatch,
  totalPages,
  type PageSize,
} from '@/lib/list-pagination';
import { FACILITY_STATUSES, facilityStatusLabel } from '@/lib/master-data-defaults';

const EMPTY_ROOM = {
  code: '',
  name: '',
  capacity: '40',
  building: '',
  floor: '',
  status: 'active' as RoomStatus,
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

  const [roomSearch, setRoomSearch] = useState(searchParams.get('q') ?? '');
  const [roomStatus, setRoomStatus] = useState(searchParams.get('status') ?? 'all');
  const [page, setPage] = useState(() => parsePage(searchParams.get('page')));
  const [pageSize, setPageSize] = useState<PageSize>(() =>
    parsePageSize(searchParams.get('pageSize')),
  );
  const debouncedRoomSearch = useDebouncedValue(roomSearch, 300);
  const lastUrl = useRef('');

  useEffect(() => {
    const qs = buildCatalogQuery(new URLSearchParams(), {
      q: debouncedRoomSearch.trim() || null,
      status: roomStatus === 'all' ? null : roomStatus,
      ...paginationQueryPatch(page, pageSize),
    });
    if (qs === lastUrl.current) return;
    lastUrl.current = qs;
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [debouncedRoomSearch, roomStatus, page, pageSize, pathname, router]);

  const rooms = useRooms({
    page,
    pageSize,
    search: debouncedRoomSearch.trim() || undefined,
    status: roomStatus === 'all' ? undefined : roomStatus,
  });
  const roomMut = useRoomMutations();

  const [roomOpen, setRoomOpen] = useState(false);
  const [editingRoomId, setEditingRoomId] = useState<string | null>(null);
  const [roomForm, setRoomForm] = useState(EMPTY_ROOM);

  useEffect(() => {
    if (!rooms.data) return;
    const pages = totalPages(rooms.data.total, pageSize);
    if (page > pages) setPage(pages);
  }, [rooms.data, page, pageSize]);

  const roomFiltered =
    Boolean(debouncedRoomSearch.trim()) || roomStatus !== 'all';

  function handleSearchChange(value: string) {
    setRoomSearch(value);
    setPage(1);
  }

  function handleStatusChange(value: string) {
    setRoomStatus(value);
    setPage(1);
  }

  function handlePageSizeChange(next: PageSize) {
    setPageSize(next);
    setPage(1);
  }

  function onErr(e: unknown) {
    toast.error(e instanceof MasterDataHttpError ? e.message : 'Thao tác thất bại');
  }

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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Phòng"
        description="Bấm một phòng để xem danh sách máy tính trong phòng đó."
      />

      <CatalogSection
        title="Danh sách phòng"
        loading={rooms.isLoading}
        onCreate={openCreateRoom}
        headers={['Mã', 'Tên', 'Sức chứa', 'Tòa', 'Tầng', 'Trạng thái', '']}
        empty={roomFiltered ? 'Không khớp bộ lọc.' : 'Chưa có dữ liệu.'}
        toolbar={
          <CatalogFilterBar
            search={roomSearch}
            onSearchChange={handleSearchChange}
            searchPlaceholder="Mã hoặc tên phòng…"
            searchAriaLabel="Tìm phòng"
            filters={
              <Select value={roomStatus} onValueChange={handleStatusChange}>
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
              setPage(1);
            }}
          />
        }
        rows={
          rooms.data?.items.length
            ? rooms.data.items.map((r) => (
                <TableRow
                  key={r.id}
                  className={cn('cursor-pointer')}
                  onClick={() =>
                    router.push(
                      `/admin/master-data/computers?roomId=${encodeURIComponent(r.id)}`,
                    )
                  }
                  title="Xem máy tính trong phòng này"
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
                            onSuccess: () => toast.success('Đã xóa phòng'),
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
        footer={
          <ListPaginationBar
            page={page}
            pageSize={pageSize}
            total={rooms.data?.total ?? 0}
            entityLabel="phòng"
            disabled={rooms.isLoading}
            onPageChange={setPage}
            onPageSizeChange={handlePageSizeChange}
          />
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
    </div>
  );
}
