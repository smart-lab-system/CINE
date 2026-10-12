'use client';

import { Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
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
import { MasterDataHttpError, type AcademicYear } from '@/lib/api/master-data';
import { useAcademicYearMutations, useAcademicYears } from '@/hooks/useMasterData';
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
import {
  ACADEMIC_STATUSES,
  academicStatusLabel,
  academicYearNameFromCode,
  type AcademicStatus,
} from '@/lib/master-data-defaults';

const EMPTY_YEAR = {
  code: '',
  name: '',
  startDate: '',
  endDate: '',
  status: 'planned' as AcademicStatus,
};

function dateInputValue(raw: string): string {
  return raw.slice(0, 10);
}

export default function AcademicMasterDataPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <AcademicYearsList />
    </Suspense>
  );
}

function AcademicYearsList() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [yearSearch, setYearSearch] = useState(searchParams.get('q') ?? '');
  const [yearStatus, setYearStatus] = useState(searchParams.get('status') ?? 'all');
  const [page, setPage] = useState(() => parsePage(searchParams.get('page')));
  const [pageSize, setPageSize] = useState<PageSize>(() =>
    parsePageSize(searchParams.get('pageSize')),
  );
  const debouncedYearSearch = useDebouncedValue(yearSearch, 300);
  const lastUrl = useRef('');

  useEffect(() => {
    const qs = buildCatalogQuery(new URLSearchParams(), {
      q: debouncedYearSearch.trim() || null,
      status: yearStatus === 'all' ? null : yearStatus,
      ...paginationQueryPatch(page, pageSize),
    });
    if (qs === lastUrl.current) return;
    lastUrl.current = qs;
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [debouncedYearSearch, yearStatus, page, pageSize, pathname, router]);

  const years = useAcademicYears({
    page,
    pageSize,
    search: debouncedYearSearch.trim() || undefined,
    status: yearStatus === 'all' ? undefined : yearStatus,
  });
  const yearMut = useAcademicYearMutations();

  const [yearOpen, setYearOpen] = useState(false);
  const [editingYearId, setEditingYearId] = useState<string | null>(null);
  const [yearForm, setYearForm] = useState(EMPTY_YEAR);

  useEffect(() => {
    if (!years.data) return;
    const pages = totalPages(years.data.total, pageSize);
    if (page > pages) setPage(pages);
  }, [years.data, page, pageSize]);

  const yearFiltered =
    Boolean(debouncedYearSearch.trim()) || yearStatus !== 'all';

  function handleSearchChange(value: string) {
    setYearSearch(value);
    setPage(1);
  }

  function handleStatusChange(value: string) {
    setYearStatus(value);
    setPage(1);
  }

  function handlePageSizeChange(next: PageSize) {
    setPageSize(next);
    setPage(1);
  }

  function onErr(e: unknown) {
    toast.error(e instanceof MasterDataHttpError ? e.message : 'Thao tác thất bại');
  }

  function openCreateYear() {
    setEditingYearId(null);
    setYearForm(EMPTY_YEAR);
    setYearOpen(true);
  }

  function openEditYear(y: AcademicYear) {
    setEditingYearId(y.id);
    setYearForm({
      code: y.code,
      name: y.name,
      startDate: dateInputValue(y.startDate),
      endDate: dateInputValue(y.endDate),
      status: y.status,
    });
    setYearOpen(true);
  }

  function submitYear() {
    if (editingYearId) {
      yearMut.update.mutate(
        {
          id: editingYearId,
          body: {
            name: yearForm.name,
            startDate: yearForm.startDate,
            endDate: yearForm.endDate,
            status: yearForm.status,
          },
        },
        {
          onSuccess: () => {
            toast.success('Đã cập nhật năm học');
            setYearOpen(false);
          },
          onError: onErr,
        },
      );
      return;
    }
    yearMut.create.mutate(yearForm, {
      onSuccess: () => {
        toast.success('Đã tạo năm học');
        setYearOpen(false);
      },
      onError: onErr,
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Năm học"
        description="Bấm một năm để xem và quản lý học kỳ tương ứng."
      />

      <CatalogSection
        title="Danh sách năm học"
        loading={years.isLoading}
        onCreate={openCreateYear}
        headers={['Mã', 'Tên', 'Bắt đầu', 'Kết thúc', 'Trạng thái', '']}
        empty={yearFiltered ? 'Không khớp bộ lọc.' : 'Chưa có dữ liệu.'}
        toolbar={
          <CatalogFilterBar
            search={yearSearch}
            onSearchChange={handleSearchChange}
            searchPlaceholder="Mã hoặc tên năm…"
            searchAriaLabel="Tìm năm học"
            filters={
              <Select value={yearStatus} onValueChange={handleStatusChange}>
                <SelectTrigger className="sm:w-44" aria-label="Lọc trạng thái năm học">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tất cả trạng thái</SelectItem>
                  {ACADEMIC_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {academicStatusLabel(s)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            }
            activeSummary={yearFiltered ? 'Đang lọc năm học' : null}
            onClear={() => {
              setYearSearch('');
              setYearStatus('all');
              setPage(1);
            }}
          />
        }
        rows={
          years.data?.items.length
            ? years.data.items.map((y) => (
                <TableRow
                  key={y.id}
                  className={cn('cursor-pointer')}
                  onClick={() => router.push(`/admin/master-data/academic/${y.id}`)}
                  title="Xem học kỳ của năm này"
                >
                  <TableCell className="font-mono">{y.code}</TableCell>
                  <TableCell>{y.name}</TableCell>
                  <TableCell>{dateInputValue(y.startDate)}</TableCell>
                  <TableCell>{dateInputValue(y.endDate)}</TableCell>
                  <TableCell>{academicStatusLabel(y.status)}</TableCell>
                  <TableCell className="text-right">
                    <RowActions>
                      <EditIconButton onClick={() => openEditYear(y)} />
                      <DeleteIconButton
                        onClick={() =>
                          yearMut.remove.mutate(y.id, {
                            onSuccess: () => toast.success('Đã xóa năm học'),
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
            total={years.data?.total ?? 0}
            entityLabel="năm học"
            disabled={years.isLoading}
            onPageChange={setPage}
            onPageSizeChange={handlePageSizeChange}
          />
        }
      />

      <Dialog open={yearOpen} onOpenChange={setYearOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingYearId ? 'Sửa năm học' : 'Thêm năm học'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <Field label="Mã">
              <Input
                value={yearForm.code}
                readOnly={!!editingYearId}
                className={editingYearId ? 'bg-muted' : undefined}
                onChange={(e) => {
                  const code = e.target.value;
                  setYearForm({
                    ...yearForm,
                    code,
                    name: academicYearNameFromCode(code),
                  });
                }}
                placeholder="2026-2027"
              />
            </Field>
            <Field label="Tên">
              <Input
                value={yearForm.name}
                onChange={(e) => setYearForm({ ...yearForm, name: e.target.value })}
              />
            </Field>
            <Field label="Bắt đầu">
              <Input
                type="date"
                value={yearForm.startDate}
                onChange={(e) => setYearForm({ ...yearForm, startDate: e.target.value })}
              />
            </Field>
            <Field label="Kết thúc">
              <Input
                type="date"
                value={yearForm.endDate}
                onChange={(e) => setYearForm({ ...yearForm, endDate: e.target.value })}
              />
            </Field>
            <Field label="Trạng thái">
              <Select
                value={yearForm.status}
                onValueChange={(v) =>
                  setYearForm({ ...yearForm, status: v as AcademicStatus })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACADEMIC_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {academicStatusLabel(s)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <DialogFooter>
            <Button onClick={submitYear}>Lưu</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
