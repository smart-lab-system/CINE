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
import {
  MasterDataHttpError,
  type AcademicYear,
  type Semester,
} from '@/lib/api/master-data';
import {
  useAcademicYearMutations,
  useAcademicYears,
  useSemesterMutations,
  useSemesters,
} from '@/hooks/useMasterData';
import {
  CatalogSection,
  DeleteIconButton,
  EditIconButton,
  RowActions,
} from '../_components/catalog-table';
import {
  ACADEMIC_STATUSES,
  SEMESTER_CODES,
  academicStatusLabel,
  academicYearNameFromCode,
  semesterNameFromCodeAndYear,
  type AcademicStatus,
  type SemesterCode,
} from '@/lib/master-data-defaults';

const EMPTY_YEAR = {
  code: '',
  name: '',
  startDate: '',
  endDate: '',
  status: 'planned' as AcademicStatus,
};

const EMPTY_SEM = {
  academicYearId: '',
  code: 'HK1' as SemesterCode,
  name: 'Học kỳ 1',
  startDate: '',
  endDate: '',
  status: 'planned' as AcademicStatus,
};

function dateInputValue(raw: string): string {
  return raw.slice(0, 10);
}

export default function AcademicMasterDataPage() {
  const years = useAcademicYears({ page: 1, pageSize: 50 });
  const semesters = useSemesters({ page: 1, pageSize: 50 });
  const yearMut = useAcademicYearMutations();
  const semMut = useSemesterMutations();

  const [yearOpen, setYearOpen] = useState(false);
  const [semOpen, setSemOpen] = useState(false);
  const [editingYearId, setEditingYearId] = useState<string | null>(null);
  const [editingSemId, setEditingSemId] = useState<string | null>(null);
  const [yearForm, setYearForm] = useState(EMPTY_YEAR);
  const [semForm, setSemForm] = useState(EMPTY_SEM);

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

  function openCreateSem() {
    setEditingSemId(null);
    setSemForm(EMPTY_SEM);
    setSemOpen(true);
  }

  function openEditSem(s: Semester) {
    setEditingSemId(s.id);
    const code = (SEMESTER_CODES as readonly string[]).includes(s.code)
      ? (s.code as SemesterCode)
      : 'HK1';
    setSemForm({
      academicYearId: s.academicYearId,
      code,
      name: s.name,
      startDate: dateInputValue(s.startDate),
      endDate: dateInputValue(s.endDate),
      status: s.status,
    });
    setSemOpen(true);
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

  function submitSem() {
    if (editingSemId) {
      semMut.update.mutate(
        {
          id: editingSemId,
          body: {
            academicYearId: semForm.academicYearId,
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
    semMut.create.mutate(semForm, {
      onSuccess: () => {
        toast.success('Đã tạo học kỳ');
        setSemOpen(false);
      },
      onError: onErr,
    });
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
        onCreate={openCreateYear}
        headers={['Mã', 'Tên', 'Bắt đầu', 'Kết thúc', 'Trạng thái', '']}
        rows={
          years.data?.items.length
            ? years.data.items.map((y) => (
                <TableRow key={y.id}>
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
      />

      <CatalogSection
        title="Học kỳ"
        loading={semesters.isLoading}
        onCreate={openCreateSem}
        headers={['Năm', 'Mã', 'Tên', 'Bắt đầu', 'Kết thúc', 'Trạng thái', '']}
        rows={
          semesters.data?.items.length
            ? semesters.data.items.map((s) => {
                const yearCode = yearCodeOf(s.academicYearId) ?? '—';
                return (
                  <TableRow key={s.id}>
                    <TableCell className="font-mono">{yearCode}</TableCell>
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
                );
              })
            : null
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

      <Dialog open={semOpen} onOpenChange={setSemOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingSemId ? 'Sửa học kỳ' : 'Thêm học kỳ'}</DialogTitle>
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
