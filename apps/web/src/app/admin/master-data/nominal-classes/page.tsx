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
  type NominalClass,
  type NominalClassStatus,
} from '@/lib/api/master-data';
import { useNominalClassMutations, useNominalClasses } from '@/hooks/useMasterData';
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
  CATALOG_ACTIVE_STATUSES,
  catalogActiveStatusLabel,
  cohortYearBounds,
  nominalClassNameFromCode,
} from '@/lib/master-data-defaults';

const { min: COHORT_MIN, max: COHORT_MAX } = cohortYearBounds();
const EMPTY = {
  code: '',
  name: '',
  cohortYear: '',
  status: 'active' as NominalClassStatus,
};

export default function NominalClassesPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <NominalClassesContent />
    </Suspense>
  );
}

function NominalClassesContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [search, setSearch] = useState(searchParams.get('q') ?? '');
  const [status, setStatus] = useState(searchParams.get('status') ?? 'all');
  const [cohortYear, setCohortYear] = useState(searchParams.get('cohortYear') ?? '');
  const debouncedSearch = useDebouncedValue(search, 300);
  const lastUrl = useRef('');

  useEffect(() => {
    const qs = buildCatalogQuery(new URLSearchParams(), {
      q: debouncedSearch.trim() || null,
      status: status === 'all' ? null : status,
      cohortYear: cohortYear || null,
    });
    if (qs === lastUrl.current) return;
    lastUrl.current = qs;
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [debouncedSearch, status, cohortYear, pathname, router]);

  const cohortNum = cohortYear ? Number(cohortYear) : undefined;
  const { data, isLoading } = useNominalClasses({
    page: 1,
    pageSize: 100,
    search: debouncedSearch.trim() || undefined,
    status: status === 'all' ? undefined : status,
    cohortYear:
      cohortNum != null && Number.isInteger(cohortNum) ? cohortNum : undefined,
  });
  const mut = useNominalClassMutations();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY);

  const filtered =
    Boolean(debouncedSearch.trim()) || status !== 'all' || Boolean(cohortYear);

  function onErr(e: unknown) {
    toast.error(e instanceof MasterDataHttpError ? e.message : 'Thao tác thất bại');
  }

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY);
    setOpen(true);
  }

  function openEdit(c: NominalClass) {
    setEditingId(c.id);
    setForm({
      code: c.code,
      name: c.name ?? '',
      cohortYear: c.cohortYear != null ? String(c.cohortYear) : '',
      status: c.status,
    });
    setOpen(true);
  }

  function goStudents(c: NominalClass) {
    router.push(`/admin/master-data/students?classId=${encodeURIComponent(c.id)}`);
  }

  function submit() {
    const year = form.cohortYear ? Number(form.cohortYear) : null;
    if (
      year !== null &&
      (!Number.isInteger(year) || year < COHORT_MIN || year > COHORT_MAX)
    ) {
      toast.error(`Năm khóa phải từ ${COHORT_MIN} đến ${COHORT_MAX}`);
      return;
    }
    if (editingId) {
      mut.update.mutate(
        {
          id: editingId,
          body: {
            name: form.name || null,
            cohortYear: year,
            status: form.status,
          },
        },
        {
          onSuccess: () => {
            toast.success('Đã cập nhật lớp');
            setOpen(false);
          },
          onError: onErr,
        },
      );
      return;
    }
    mut.create.mutate(
      {
        code: form.code,
        name: form.name || null,
        cohortYear: year,
        status: form.status,
      },
      {
        onSuccess: () => {
          toast.success('Đã tạo lớp');
          setOpen(false);
        },
        onError: onErr,
      },
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Lớp danh nghĩa"
        description="Lớp hành chính — khác lớp môn do giảng viên sở hữu. Bấm dòng để xem sinh viên."
      />
      <CatalogSection
        title="Danh sách lớp"
        loading={isLoading}
        onCreate={openCreate}
        headers={['Mã', 'Tên', 'Khóa', 'Trạng thái', '']}
        empty={filtered ? 'Không khớp bộ lọc.' : 'Chưa có dữ liệu.'}
        toolbar={
          <CatalogFilterBar
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Mã hoặc tên lớp…"
            searchAriaLabel="Tìm lớp danh nghĩa"
            filters={
              <>
                <Input
                  type="number"
                  min={COHORT_MIN}
                  max={COHORT_MAX}
                  step={1}
                  value={cohortYear}
                  onChange={(e) => setCohortYear(e.target.value)}
                  placeholder="Năm khóa"
                  aria-label="Lọc năm khóa"
                  className="sm:w-32"
                />
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger className="sm:w-44" aria-label="Lọc trạng thái lớp">
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
              </>
            }
            activeSummary={filtered ? 'Đang lọc lớp' : null}
            onClear={() => {
              setSearch('');
              setStatus('all');
              setCohortYear('');
            }}
          />
        }
        rows={
          data?.items.length
            ? data.items.map((c) => (
                <TableRow
                  key={c.id}
                  className={cn('cursor-pointer')}
                  onClick={() => goStudents(c)}
                  title="Xem sinh viên của lớp này"
                >
                  <TableCell className="font-mono">{c.code}</TableCell>
                  <TableCell>{c.name ?? '—'}</TableCell>
                  <TableCell>{c.cohortYear ?? '—'}</TableCell>
                  <TableCell>{catalogActiveStatusLabel(c.status)}</TableCell>
                  <TableCell className="text-right">
                    <RowActions>
                      <EditIconButton onClick={() => openEdit(c)} />
                      <DeleteIconButton
                        onClick={() =>
                          mut.remove.mutate(c.id, {
                            onSuccess: () => toast.success('Đã xóa lớp'),
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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingId ? 'Sửa lớp danh nghĩa' : 'Thêm lớp danh nghĩa'}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label>Mã</Label>
              <Input
                value={form.code}
                readOnly={!!editingId}
                className={editingId ? 'bg-muted' : undefined}
                onChange={(e) => {
                  const code = e.target.value;
                  setForm({
                    ...form,
                    code,
                    name: nominalClassNameFromCode(code),
                  });
                }}
                placeholder="D21CQCN01"
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
              <Label>Năm khóa</Label>
              <Input
                type="number"
                min={COHORT_MIN}
                max={COHORT_MAX}
                step={1}
                value={form.cohortYear}
                onChange={(e) => setForm({ ...form, cohortYear: e.target.value })}
                placeholder={`${COHORT_MIN}–${COHORT_MAX}`}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Trạng thái</Label>
              <Select
                value={form.status}
                onValueChange={(v) => setForm({ ...form, status: v as NominalClassStatus })}
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
