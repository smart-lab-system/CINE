'use client';

import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
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
import { useSemesterMutations, useSemesters } from '@/hooks/useMasterData';
import {
  CatalogSection,
  DeleteIconButton,
  EditIconButton,
  RowActions,
} from '../../_components/catalog-table';
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

export function YearSemestersPanel({
  yearId,
  yearCode,
}: {
  yearId: string;
  yearCode: string;
}) {
  const semesters = useSemesters({
    page: 1,
    pageSize: 50,
    academicYearId: yearId,
  });
  const semMut = useSemesterMutations();

  const [semOpen, setSemOpen] = useState(false);
  const [editingSemId, setEditingSemId] = useState<string | null>(null);
  const [semForm, setSemForm] = useState(EMPTY_SEM);

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

  if (semesters.isLoading) {
    return (
      <div className="p-4">
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  return (
    <div className="border-t border-border/60 bg-surface-2/40 p-4">
      <CatalogSection
        embedded
        title="Học kỳ"
        loading={false}
        onCreate={openCreateSem}
        headers={['Mã', 'Tên', 'Bắt đầu', 'Kết thúc', 'Trạng thái', '']}
        empty="Chưa có học kỳ trong năm này."
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
              <Input value={yearCode} readOnly className="bg-muted" />
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
