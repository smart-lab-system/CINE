'use client';

import { useState, type ReactNode } from 'react';
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
import { MasterDataHttpError } from '@/lib/api/master-data';
import {
  useAcademicYearMutations,
  useAcademicYears,
  useSemesterMutations,
  useSemesters,
} from '@/hooks/useMasterData';
import { CatalogSection, DeleteIconButton } from '../_components/catalog-table';
import {
  SEMESTER_CODES,
  academicYearNameFromCode,
  semesterNameFromCodeAndYear,
  type SemesterCode,
} from '@/lib/master-data-defaults';

const YEAR_STATUSES = ['planned', 'active', 'closed'] as const;

export default function AcademicMasterDataPage() {
  const years = useAcademicYears({ page: 1, pageSize: 50 });
  const semesters = useSemesters({ page: 1, pageSize: 50 });
  const yearMut = useAcademicYearMutations();
  const semMut = useSemesterMutations();

  const [yearOpen, setYearOpen] = useState(false);
  const [semOpen, setSemOpen] = useState(false);
  const [yearForm, setYearForm] = useState({
    code: '',
    name: '',
    startDate: '',
    endDate: '',
    status: 'planned' as (typeof YEAR_STATUSES)[number],
  });
  const [semForm, setSemForm] = useState({
    academicYearId: '',
    code: 'HK1' as SemesterCode,
    name: 'Học kỳ 1',
    startDate: '',
    endDate: '',
    status: 'planned' as (typeof YEAR_STATUSES)[number],
  });

  function onErr(e: unknown) {
    toast.error(e instanceof MasterDataHttpError ? e.message : 'Thao tác thất bại');
  }

  function yearCodeOf(id: string) {
    return years.data?.items.find((y) => y.id === id)?.code;
  }

  function setSemesterYear(academicYearId: string) {
    setSemForm((prev) => ({
      ...prev,
      academicYearId,
      name: semesterNameFromCodeAndYear(prev.code, yearCodeOf(academicYearId)),
    }));
  }

  function setSemesterCode(code: SemesterCode) {
    setSemForm((prev) => ({
      ...prev,
      code,
      name: semesterNameFromCodeAndYear(code, yearCodeOf(prev.academicYearId)),
    }));
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Năm học & học kỳ"
        description="Catalog độc lập — chưa gắn phiên thi."
      />

      <CatalogSection
        title="Năm học"
        loading={years.isLoading}
        onCreate={() => setYearOpen(true)}
        headers={['Mã', 'Tên', 'Bắt đầu', 'Kết thúc', 'Trạng thái', '']}
        rows={
          years.data?.items.length
            ? years.data.items.map((y) => (
                <TableRow key={y.id}>
                  <TableCell className="font-mono">{y.code}</TableCell>
                  <TableCell>{y.name}</TableCell>
                  <TableCell>{y.startDate}</TableCell>
                  <TableCell>{y.endDate}</TableCell>
                  <TableCell>{y.status}</TableCell>
                  <TableCell className="text-right">
                    <DeleteIconButton
                      onClick={() =>
                        yearMut.remove.mutate(y.id, {
                          onSuccess: () => toast.success('Đã xóa năm học'),
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

      <CatalogSection
        title="Học kỳ"
        loading={semesters.isLoading}
        onCreate={() => setSemOpen(true)}
        headers={['Năm', 'Mã', 'Tên', 'Bắt đầu', 'Kết thúc', 'Trạng thái', '']}
        rows={
          semesters.data?.items.length
            ? semesters.data.items.map((s) => {
                const yearCode =
                  years.data?.items.find((y) => y.id === s.academicYearId)?.code ?? '—';
                return (
                  <TableRow key={s.id}>
                    <TableCell className="font-mono">{yearCode}</TableCell>
                    <TableCell className="font-mono">{s.code}</TableCell>
                    <TableCell>{s.name}</TableCell>
                    <TableCell>{s.startDate}</TableCell>
                    <TableCell>{s.endDate}</TableCell>
                    <TableCell>{s.status}</TableCell>
                    <TableCell className="text-right">
                      <DeleteIconButton
                        onClick={() =>
                          semMut.remove.mutate(s.id, {
                            onSuccess: () => toast.success('Đã xóa học kỳ'),
                            onError: onErr,
                          })
                        }
                      />
                    </TableCell>
                  </TableRow>
                );
              })
            : null
        }
      />

      <Dialog open={yearOpen} onOpenChange={setYearOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Thêm năm học</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <Field label="Mã">
              <Input
                value={yearForm.code}
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
                  setYearForm({ ...yearForm, status: v as (typeof YEAR_STATUSES)[number] })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {YEAR_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <DialogFooter>
            <Button
              onClick={() =>
                yearMut.create.mutate(yearForm, {
                  onSuccess: () => {
                    toast.success('Đã tạo năm học');
                    setYearOpen(false);
                  },
                  onError: onErr,
                })
              }
            >
              Lưu
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={semOpen} onOpenChange={setSemOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Thêm học kỳ</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <Field label="Năm học">
              <Select value={semForm.academicYearId} onValueChange={setSemesterYear}>
                <SelectTrigger>
                  <SelectValue placeholder="Chọn năm" />
                </SelectTrigger>
                <SelectContent>
                  {(years.data?.items ?? []).map((y) => (
                    <SelectItem key={y.id} value={y.id}>
                      {y.code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Mã (loại học kỳ)">
              <Select
                value={semForm.code}
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
                  setSemForm({ ...semForm, status: v as (typeof YEAR_STATUSES)[number] })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {YEAR_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <DialogFooter>
            <Button
              onClick={() =>
                semMut.create.mutate(semForm, {
                  onSuccess: () => {
                    toast.success('Đã tạo học kỳ');
                    setSemOpen(false);
                  },
                  onError: onErr,
                })
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

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
