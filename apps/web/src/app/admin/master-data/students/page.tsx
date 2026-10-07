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
import { SearchableSelect } from '@/components/ui/searchable-select';
import { TableCell, TableRow } from '@/components/ui/table';
import {
  MasterDataHttpError,
  type Student,
  type StudentStatus,
} from '@/lib/api/master-data';
import {
  useNominalClasses,
  useStudentMutations,
  useStudents,
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
import { STUDENT_STATUSES, studentStatusLabel } from '@/lib/master-data-defaults';

const EMPTY = {
  mssv: '',
  fullName: '',
  nominalClassId: '',
  status: 'active' as StudentStatus,
};

export default function StudentsMasterDataPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <StudentsMasterDataContent />
    </Suspense>
  );
}

function StudentsMasterDataContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [search, setSearch] = useState(searchParams.get('q') ?? '');
  const [status, setStatus] = useState(searchParams.get('status') ?? 'all');
  const [classFilter, setClassFilter] = useState(
    searchParams.get('classId') ?? '',
  );
  const [page, setPage] = useState(() => parsePage(searchParams.get('page')));
  const [pageSize, setPageSize] = useState<PageSize>(() =>
    parsePageSize(searchParams.get('pageSize')),
  );
  const debouncedSearch = useDebouncedValue(search, 300);
  const lastUrl = useRef('');

  useEffect(() => {
    const qs = buildCatalogQuery(new URLSearchParams(), {
      q: debouncedSearch.trim() || null,
      status: status === 'all' ? null : status,
      classId: classFilter || null,
      ...paginationQueryPatch(page, pageSize),
    });
    if (qs === lastUrl.current) return;
    lastUrl.current = qs;
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [debouncedSearch, status, classFilter, page, pageSize, pathname, router]);

  const classes = useNominalClasses({ page: 1, pageSize: 100 });
  const { data, isLoading } = useStudents({
    page,
    pageSize,
    search: debouncedSearch.trim() || undefined,
    status: status === 'all' ? undefined : status,
    nominalClassId: classFilter || undefined,
  });
  const mut = useStudentMutations();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY);

  useEffect(() => {
    if (!data) return;
    const pages = totalPages(data.total, pageSize);
    if (page > pages) setPage(pages);
  }, [data, page, pageSize]);

  const classOptions = useMemo(
    () =>
      (classes.data?.items ?? []).map((c) => ({
        value: c.id,
        label: c.code,
        keywords: c.name ?? '',
      })),
    [classes.data?.items],
  );

  const classLabel = (id: string) =>
    classes.data?.items.find((c) => c.id === id)?.code ?? '—';
  const selectedClassCode = classFilter ? classLabel(classFilter) : undefined;
  const filtered =
    Boolean(debouncedSearch.trim()) || status !== 'all' || Boolean(classFilter);

  function handleSearchChange(value: string) {
    setSearch(value);
    setPage(1);
  }

  function handleStatusChange(value: string) {
    setStatus(value);
    setPage(1);
  }

  function handleClassFilterChange(value: string) {
    setClassFilter(value);
    setPage(1);
  }

  function handlePageSizeChange(next: PageSize) {
    setPageSize(next);
    setPage(1);
  }

  function onErr(e: unknown) {
    toast.error(e instanceof MasterDataHttpError ? e.message : 'Thao tác thất bại');
  }

  function openCreate() {
    setEditingId(null);
    setForm({
      ...EMPTY,
      nominalClassId: classFilter || '',
    });
    setOpen(true);
  }

  function openEdit(s: Student) {
    setEditingId(s.id);
    setForm({
      mssv: s.mssv,
      fullName: s.fullName,
      nominalClassId: s.nominalClassId,
      status: s.status,
    });
    setOpen(true);
  }

  function submit() {
    if (editingId) {
      mut.update.mutate(
        {
          id: editingId,
          body: {
            fullName: form.fullName,
            nominalClassId: form.nominalClassId,
            status: form.status,
          },
        },
        {
          onSuccess: () => {
            toast.success('Đã cập nhật SV');
            setOpen(false);
          },
          onError: onErr,
        },
      );
      return;
    }
    mut.create.mutate(form, {
      onSuccess: () => {
        toast.success('Đã tạo SV');
        setOpen(false);
      },
      onError: onErr,
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Sinh viên" description="Catalog SV — chưa thay enrollment." />

      <CatalogSection
        title="Danh sách sinh viên"
        loading={isLoading}
        onCreate={openCreate}
        headers={['MSSV', 'Họ tên', 'Lớp', 'Trạng thái', '']}
        empty={filtered ? 'Không khớp bộ lọc.' : 'Chưa có dữ liệu.'}
        toolbar={
          <CatalogFilterBar
            search={search}
            onSearchChange={handleSearchChange}
            searchPlaceholder="MSSV hoặc họ tên…"
            searchAriaLabel="Tìm sinh viên"
            filters={
              <>
                <SearchableSelect
                  className="sm:w-52"
                  value={classFilter}
                  onValueChange={handleClassFilterChange}
                  options={classOptions}
                  placeholder="Chọn lớp…"
                  searchPlaceholder="Gõ mã hoặc tên lớp…"
                  allowClear
                  clearLabel="Tất cả lớp"
                  ariaLabel="Lọc theo lớp"
                />
                <Select value={status} onValueChange={handleStatusChange}>
                  <SelectTrigger className="sm:w-44" aria-label="Lọc trạng thái SV">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tất cả trạng thái</SelectItem>
                    {STUDENT_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {studentStatusLabel(s)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </>
            }
            activeSummary={
              selectedClassCode && selectedClassCode !== '—'
                ? `Đang xem: ${selectedClassCode}`
                : filtered
                  ? 'Đang lọc sinh viên'
                  : null
            }
            onClear={() => {
              setSearch('');
              setStatus('all');
              setClassFilter('');
              setPage(1);
            }}
          />
        }
        rows={
          data?.items.length
            ? data.items.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-mono">{s.mssv}</TableCell>
                  <TableCell>{s.fullName}</TableCell>
                  <TableCell className="font-mono">{classLabel(s.nominalClassId)}</TableCell>
                  <TableCell>{studentStatusLabel(s.status)}</TableCell>
                  <TableCell className="text-right">
                    <RowActions>
                      <EditIconButton onClick={() => openEdit(s)} />
                      <DeleteIconButton
                        onClick={() =>
                          mut.remove.mutate(s.id, {
                            onSuccess: () => toast.success('Đã xóa SV'),
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
            total={data?.total ?? 0}
            entityLabel="sinh viên"
            disabled={isLoading}
            onPageChange={setPage}
            onPageSizeChange={handlePageSizeChange}
          />
        }
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? 'Sửa sinh viên' : 'Thêm sinh viên'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label>MSSV</Label>
              <Input
                value={form.mssv}
                readOnly={!!editingId}
                className={editingId ? 'bg-muted' : undefined}
                onChange={(e) => setForm({ ...form, mssv: e.target.value })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Họ tên</Label>
              <Input
                value={form.fullName}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Lớp danh nghĩa</Label>
              <SearchableSelect
                value={form.nominalClassId}
                onValueChange={(v) => setForm({ ...form, nominalClassId: v })}
                options={classOptions}
                placeholder="Chọn lớp…"
                searchPlaceholder="Gõ mã hoặc tên lớp…"
                ariaLabel="Chọn lớp danh nghĩa"
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Trạng thái</Label>
              <Select
                value={form.status}
                onValueChange={(v) => setForm({ ...form, status: v as StudentStatus })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STUDENT_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {studentStatusLabel(s)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={submit}>Lưu</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
