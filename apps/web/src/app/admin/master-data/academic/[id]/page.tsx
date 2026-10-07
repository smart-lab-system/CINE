'use client';

import { Suspense, use, useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
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
import { MasterDataHttpError, type Semester } from '@/lib/api/master-data';
import {
  useAcademicYear,
  useSemesterMutations,
  useSemesters,
} from '@/hooks/useMasterData';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import {
  CatalogSection,
  DeleteIconButton,
  EditIconButton,
  RowActions,
} from '../../_components/catalog-table';
import { CatalogFilterBar } from '../../_components/catalog-filter-bar';
import { buildCatalogQuery } from '../../_components/catalog-url';
import {
  ACADEMIC_STATUSES,
  SEMESTER_CODES,
  academicStatusLabel,
  semesterNameFromCodeAndYear,
  type AcademicStatus,
  type SemesterCode,
} from '@/lib/master-data-defaults';

const EMPTY_SEM = {
  code: 'HK1' as SemesterCode,
  name: 'Học kỳ 1',
  startDate: '',
  endDate: '',
  status: 'planned' as AcademicStatus,
};

function dateInputValue(raw: string): string {
  return raw.slice(0, 10);
}

export default function AcademicYearDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <AcademicYearDetail yearId={id} />
    </Suspense>
  );
}

function AcademicYearDetail({ yearId }: { yearId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const year = useAcademicYear(yearId);

  const [semSearch, setSemSearch] = useState(searchParams.get('q') ?? '');
  const [semStatus, setSemStatus] = useState(searchParams.get('status') ?? 'all');
  const debouncedSemSearch = useDebouncedValue(semSearch, 300);
  const lastUrl = useRef('');

  useEffect(() => {
    const qs = buildCatalogQuery(new URLSearchParams(), {
      q: debouncedSemSearch.trim() || null,
      status: semStatus === 'all' ? null : semStatus,
    });
    if (qs === lastUrl.current) return;
    lastUrl.current = qs;
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [debouncedSemSearch, semStatus, pathname, router]);

  const semesters = useSemesters({
    page: 1,
    pageSize: 50,
    academicYearId: yearId,
    search: debouncedSemSearch.trim() || undefined,
    status: semStatus === 'all' ? undefined : semStatus,
  });
  const semMut = useSemesterMutations();

  const [semOpen, setSemOpen] = useState(false);
  const [editingSemId, setEditingSemId] = useState<string | null>(null);
  const [semForm, setSemForm] = useState(EMPTY_SEM);

  const semFiltered =
    Boolean(debouncedSemSearch.trim()) || semStatus !== 'all';
  const yearCode = year.data?.code;

  function onErr(e: unknown) {
    toast.error(e instanceof MasterDataHttpError ? e.message : 'Thao tác thất bại');
  }

  function setSemesterCode(code: SemesterCode) {
    setSemForm((prev) => ({
      ...prev,
      code,
      name: semesterNameFromCodeAndYear(code, yearCode),
    }));
  }

  function openCreateSem() {
    setEditingSemId(null);
    setSemForm({
      ...EMPTY_SEM,
      name: semesterNameFromCodeAndYear('HK1', yearCode),
    });
    setSemOpen(true);
  }

  function openEditSem(s: Semester) {
    setEditingSemId(s.id);
    const code = (SEMESTER_CODES as readonly string[]).includes(s.code)
      ? (s.code as SemesterCode)
      : 'HK1';
    setSemForm({
      code,
      name: s.name,
      startDate: dateInputValue(s.startDate),
      endDate: dateInputValue(s.endDate),
      status: s.status,
    });
    setSemOpen(true);
  }

  function submitSem() {
    if (editingSemId) {
      semMut.update.mutate(
        {
          id: editingSemId,
          body: {
            academicYearId: yearId,
            name: semForm.name,
            startDate: semForm.startDate,
            endDate: semForm.endDate,
            status: semForm.status,
          },
        },
        {
          onSuccess: () => {
            toast.success('Đã cập nhật học kỳ');
            setSemOpen(false);
          },
          onError: onErr,
        },
      );
      return;
    }
    semMut.create.mutate(
      {
        academicYearId: yearId,
        code: semForm.code,
        name: semForm.name,
        startDate: semForm.startDate,
        endDate: semForm.endDate,
        status: semForm.status,
      },
      {
        onSuccess: () => {
          toast.success('Đã tạo học kỳ');
          setSemOpen(false);
        },
        onError: onErr,
      },
    );
  }

  if (year.isLoading) {
    return <Skeleton className="h-64 w-full" />;
  }

  if (year.isError || !year.data) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/admin/master-data/academic">
            <ArrowLeft className="size-4" />
            Quay lại năm học
          </Link>
        </Button>
        <p className="text-muted-foreground">Không tìm thấy năm học.</p>
      </div>
    );
  }

  const y = year.data;

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Button variant="ghost" size="sm" className="-ml-2" asChild>
          <Link href="/admin/master-data/academic">
            <ArrowLeft className="size-4" />
            Quay lại năm học
          </Link>
        </Button>
        <PageHeader
          title={y.name}
          description={`${y.code} · ${dateInputValue(y.startDate)} → ${dateInputValue(y.endDate)} · ${academicStatusLabel(y.status)}`}
        />
      </div>

      <CatalogSection
        title="Học kỳ"
        loading={semesters.isLoading}
        onCreate={openCreateSem}
        headers={['Mã', 'Tên', 'Bắt đầu', 'Kết thúc', 'Trạng thái', '']}
        empty={semFiltered ? 'Không khớp bộ lọc.' : 'Chưa có học kỳ trong năm này.'}
        toolbar={
          <CatalogFilterBar
            search={semSearch}
            onSearchChange={setSemSearch}
            searchPlaceholder="Mã hoặc tên học kỳ…"
            searchAriaLabel="Tìm học kỳ"
            filters={
              <Select value={semStatus} onValueChange={setSemStatus}>
                <SelectTrigger className="sm:w-44" aria-label="Lọc trạng thái học kỳ">
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
            activeSummary={semFiltered ? 'Đang lọc học kỳ' : null}
            onClear={() => {
              setSemSearch('');
              setSemStatus('all');
            }}
          />
        }
        rows={
          semesters.data?.items.length
            ? semesters.data.items.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-mono">{s.code}</TableCell>
                  <TableCell>{s.name}</TableCell>
                  <TableCell>{dateInputValue(s.startDate)}</TableCell>
                  <TableCell>{dateInputValue(s.endDate)}</TableCell>
                  <TableCell>{academicStatusLabel(s.status)}</TableCell>
                  <TableCell className="text-right">
                    <RowActions>
                      <EditIconButton onClick={() => openEditSem(s)} />
                      <DeleteIconButton
                        onClick={() =>
                          semMut.remove.mutate(s.id, {
                            onSuccess: () => toast.success('Đã xóa học kỳ'),
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

      <Dialog open={semOpen} onOpenChange={setSemOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingSemId ? 'Sửa học kỳ' : 'Thêm học kỳ'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <Field label="Năm học">
              <Input value={y.code} readOnly className="bg-muted" />
            </Field>
            <Field label="Mã (loại học kỳ)">
              <Select
                value={semForm.code}
                disabled={!!editingSemId}
                onValueChange={(v) => setSemesterCode(v as SemesterCode)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SEMESTER_CODES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Tên">
              <Input
                value={semForm.name}
                onChange={(e) => setSemForm({ ...semForm, name: e.target.value })}
              />
            </Field>
            <Field label="Bắt đầu">
              <Input
                type="date"
                value={semForm.startDate}
                onChange={(e) => setSemForm({ ...semForm, startDate: e.target.value })}
              />
            </Field>
            <Field label="Kết thúc">
              <Input
                type="date"
                value={semForm.endDate}
                onChange={(e) => setSemForm({ ...semForm, endDate: e.target.value })}
              />
            </Field>
            <Field label="Trạng thái">
              <Select
                value={semForm.status}
                onValueChange={(v) =>
                  setSemForm({ ...semForm, status: v as AcademicStatus })
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
            <Button onClick={submitSem}>Lưu</Button>
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
