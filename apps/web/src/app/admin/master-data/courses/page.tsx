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
  type Course,
  type CourseStatus,
} from '@/lib/api/master-data';
import { useCourseMutations, useCourses } from '@/hooks/useMasterData';
import {
  CatalogSection,
  DeleteIconButton,
  EditIconButton,
  RowActions,
} from '../_components/catalog-table';
import {
  CATALOG_ACTIVE_STATUSES,
  catalogActiveStatusLabel,
} from '@/lib/master-data-defaults';

const EMPTY = { code: '', name: '', status: 'active' as CourseStatus };

export default function CoursesMasterDataPage() {
  const { data, isLoading } = useCourses({ page: 1, pageSize: 50 });
  const mut = useCourseMutations();
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
