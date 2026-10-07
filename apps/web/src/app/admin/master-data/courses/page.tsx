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
  type Course,
  type CourseStatus,
} from '@/lib/api/master-data';
import { useCourseMutations, useCourses } from '@/hooks/useMasterData';
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
import {
  CATALOG_ACTIVE_STATUSES,
  catalogActiveStatusLabel,
} from '@/lib/master-data-defaults';

const EMPTY = { code: '', name: '', status: 'active' as CourseStatus };

export default function CoursesMasterDataPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <CoursesMasterDataContent />
    </Suspense>
  );
}

function CoursesMasterDataContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [search, setSearch] = useState(searchParams.get('q') ?? '');
  const [status, setStatus] = useState(searchParams.get('status') ?? 'all');
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
      ...paginationQueryPatch(page, pageSize),
    });
    if (qs === lastUrl.current) return;
    lastUrl.current = qs;
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [debouncedSearch, status, page, pageSize, pathname, router]);

  const { data, isLoading } = useCourses({
    page,
    pageSize,
    search: debouncedSearch.trim() || undefined,
    status: status === 'all' ? undefined : status,
  });
  const mut = useCourseMutations();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY);

  useEffect(() => {
    if (!data) return;
    const pages = totalPages(data.total, pageSize);
    if (page > pages) setPage(pages);
  }, [data, page, pageSize]);

  const filtered = Boolean(debouncedSearch.trim()) || status !== 'all';

  function handleSearchChange(value: string) {
    setSearch(value);
    setPage(1);
  }

  function handleStatusChange(value: string) {
    setStatus(value);
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
    setForm(EMPTY);
    setOpen(true);
  }

  function openEdit(c: Course) {
    setEditingId(c.id);
    setForm({ code: c.code, name: c.name, status: c.status });
    setOpen(true);
  }

  function submit() {
    if (editingId) {
      mut.update.mutate(
        { id: editingId, body: { name: form.name, status: form.status } },
        {
          onSuccess: () => {
            toast.success('Đã cập nhật môn');
            setOpen(false);
          },
          onError: onErr,
        },
      );
      return;
    }
    mut.create.mutate(form, {
      onSuccess: () => {
        toast.success('Đã tạo môn');
        setOpen(false);
      },
      onError: onErr,
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Môn học" description="Catalog môn — chưa gắn lớp môn / phiên thi." />
      <CatalogSection
        title="Danh sách môn"
        loading={isLoading}
        onCreate={openCreate}
        headers={['Mã', 'Tên', 'Trạng thái', '']}
        empty={filtered ? 'Không khớp bộ lọc.' : 'Chưa có dữ liệu.'}
        toolbar={
          <CatalogFilterBar
            search={search}
            onSearchChange={handleSearchChange}
            searchPlaceholder="Mã hoặc tên môn…"
            searchAriaLabel="Tìm môn học"
            filters={
              <Select value={status} onValueChange={handleStatusChange}>
                <SelectTrigger className="sm:w-44" aria-label="Lọc trạng thái môn">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tất cả trạng thái</SelectItem>
                  {CATALOG_ACTIVE_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {catalogActiveStatusLabel(s)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            }
            activeSummary={filtered ? 'Đang lọc môn học' : null}
            onClear={() => {
              setSearch('');
              setStatus('all');
              setPage(1);
            }}
          />
        }
        rows={
          data?.items.length
            ? data.items.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-mono">{c.code}</TableCell>
                  <TableCell>{c.name}</TableCell>
                  <TableCell>{catalogActiveStatusLabel(c.status)}</TableCell>
                  <TableCell className="text-right">
                    <RowActions>
                      <EditIconButton onClick={() => openEdit(c)} />
                      <DeleteIconButton
                        onClick={() =>
                          mut.remove.mutate(c.id, {
                            onSuccess: () => toast.success('Đã xóa môn'),
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
            entityLabel="môn học"
            disabled={isLoading}
            onPageChange={setPage}
            onPageSizeChange={handlePageSizeChange}
          />
        }
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? 'Sửa môn học' : 'Thêm môn học'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label>Mã</Label>
              <Input
                value={form.code}
                readOnly={!!editingId}
                className={editingId ? 'bg-muted' : undefined}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Tên</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Trạng thái</Label>
              <Select
                value={form.status}
                onValueChange={(v) => setForm({ ...form, status: v as CourseStatus })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATALOG_ACTIVE_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {catalogActiveStatusLabel(s)}
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
