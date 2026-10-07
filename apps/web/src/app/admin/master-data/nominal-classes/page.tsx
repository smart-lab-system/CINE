'use client';

import { useState } from 'react';
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
  type NominalClass,
  type NominalClassStatus,
} from '@/lib/api/master-data';
import { useNominalClassMutations, useNominalClasses } from '@/hooks/useMasterData';
import {
  CatalogSection,
  DeleteIconButton,
  EditIconButton,
  RowActions,
} from '../_components/catalog-table';
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
  const { data, isLoading } = useNominalClasses({ page: 1, pageSize: 50 });
  const mut = useNominalClassMutations();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY);

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

  function submit() {
    const cohortYear = form.cohortYear ? Number(form.cohortYear) : null;
    if (
      cohortYear !== null &&
      (!Number.isInteger(cohortYear) ||
        cohortYear < COHORT_MIN ||
        cohortYear > COHORT_MAX)
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
            cohortYear,
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
        cohortYear,
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
        description="Lớp hành chính — khác lớp môn do giảng viên sở hữu."
      />
      <CatalogSection
        title="Danh sách lớp"
        loading={isLoading}
        onCreate={openCreate}
        headers={['Mã', 'Tên', 'Khóa', 'Trạng thái', '']}
        rows={
          data?.items.length
            ? data.items.map((c) => (
                <TableRow key={c.id}>
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
