'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
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
import { SearchableSelect } from '@/components/ui/searchable-select';
import {
  MasterDataHttpError,
  type Computer,
  type ComputerStatus,
} from '@/lib/api/master-data';
import {
  useComputerMutations,
  useComputers,
  useRooms,
} from '@/hooks/useMasterData';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
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

export default function ComputersMasterDataPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <ComputersMasterDataContent />
    </Suspense>
  );
}

function ComputersMasterDataContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [pcSearch, setPcSearch] = useState(searchParams.get('q') ?? '');
  const [pcStatus, setPcStatus] = useState(searchParams.get('status') ?? 'all');
  const [roomId, setRoomId] = useState(searchParams.get('roomId') ?? '');
  const [page, setPage] = useState(() => parsePage(searchParams.get('page')));
  const [pageSize, setPageSize] = useState<PageSize>(() =>
    parsePageSize(searchParams.get('pageSize')),
  );
  const debouncedPcSearch = useDebouncedValue(pcSearch, 300);
  const lastUrl = useRef('');

  useEffect(() => {
    const qs = buildCatalogQuery(new URLSearchParams(), {
      q: debouncedPcSearch.trim() || null,
      status: pcStatus === 'all' ? null : pcStatus,
      roomId: roomId || null,
      ...paginationQueryPatch(page, pageSize),
    });
    if (qs === lastUrl.current) return;
    lastUrl.current = qs;
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [debouncedPcSearch, pcStatus, roomId, page, pageSize, pathname, router]);

  const rooms = useRooms({ page: 1, pageSize: 100 });
  const computers = useComputers({
    page,
    pageSize,
    roomId: roomId || undefined,
    search: debouncedPcSearch.trim() || undefined,
    status: pcStatus === 'all' ? undefined : pcStatus,
  });
  const pcMut = useComputerMutations();

  const [pcOpen, setPcOpen] = useState(false);
  const [editingPcId, setEditingPcId] = useState<string | null>(null);
  const [pcForm, setPcForm] = useState(EMPTY_PC);

  useEffect(() => {
    if (!computers.data) return;
    const pages = totalPages(computers.data.total, pageSize);
    if (page > pages) setPage(pages);
  }, [computers.data, page, pageSize]);

  const roomOptions = useMemo(
    () =>
      (rooms.data?.items ?? []).map((r) => ({
        value: r.id,
        label: r.code,
        keywords: r.name,
      })),
    [rooms.data?.items],
  );

  const roomCode = (id: string) =>
    rooms.data?.items.find((r) => r.id === id)?.code ?? '—';
  const selectedRoomCode = roomId ? roomCode(roomId) : undefined;
  const pcFiltered =
    Boolean(debouncedPcSearch.trim()) || pcStatus !== 'all' || Boolean(roomId);

  function handleSearchChange(value: string) {
    setPcSearch(value);
    setPage(1);
  }

  function handleStatusChange(value: string) {
    setPcStatus(value);
    setPage(1);
  }

  function handleRoomIdChange(value: string) {
    setRoomId(value);
    setPage(1);
  }

  function handlePageSizeChange(next: PageSize) {
    setPageSize(next);
    setPage(1);
  }

  function onErr(e: unknown) {
    toast.error(e instanceof MasterDataHttpError ? e.message : 'Thao tác thất bại');
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
      <PageHeader title="Máy tính" description="Catalog máy tính theo phòng." />

      <CatalogSection
        title="Danh sách máy tính"
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
            onSearchChange={handleSearchChange}
            searchPlaceholder="Hostname, IP hoặc vị trí…"
            searchAriaLabel="Tìm máy tính"
            filters={
              <>
                <SearchableSelect
                  className="sm:w-48"
                  value={roomId}
                  onValueChange={handleRoomIdChange}
                  options={roomOptions}
                  placeholder="Chọn phòng…"
                  searchPlaceholder="Tìm mã/tên phòng…"
                  allowClear
                  clearLabel="Tất cả phòng"
                  ariaLabel="Lọc theo phòng"
                />
                <Select value={pcStatus} onValueChange={handleStatusChange}>
                  <SelectTrigger className="sm:w-44" aria-label="Lọc trạng thái máy">
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
              setPage(1);
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
        footer={
          <ListPaginationBar
            page={page}
            pageSize={pageSize}
            total={computers.data?.total ?? 0}
            entityLabel="máy tính"
            disabled={computers.isLoading}
            onPageChange={setPage}
            onPageSizeChange={handlePageSizeChange}
          />
        }
      />

      <Dialog open={pcOpen} onOpenChange={setPcOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingPcId ? 'Sửa máy tính' : 'Thêm máy tính'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label>Phòng</Label>
              <SearchableSelect
                value={pcForm.roomId}
                onValueChange={(v) => setPcForm({ ...pcForm, roomId: v })}
                options={roomOptions}
                placeholder="Chọn phòng…"
                searchPlaceholder="Tìm mã/tên phòng…"
                ariaLabel="Chọn phòng cho máy"
              />
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
                onValueChange={(v) =>
                  setPcForm({ ...pcForm, status: v as ComputerStatus })
                }
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
