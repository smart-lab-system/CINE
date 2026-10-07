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
import { MasterDataHttpError, type StudentStatus } from '@/lib/api/master-data';
import {
  useNominalClasses,
  useStudentMutations,
  useStudents,
} from '@/hooks/useMasterData';
import { CatalogSection, DeleteIconButton } from '../_components/catalog-table';

const STATUSES: StudentStatus[] = ['active', 'inactive', 'graduated', 'withdrawn'];

export default function StudentsMasterDataPage() {
  const classes = useNominalClasses({ page: 1, pageSize: 100 });
  const [classFilter, setClassFilter] = useState<string>('all');
  const { data, isLoading } = useStudents({
    page: 1,
    pageSize: 50,
    nominalClassId: classFilter === 'all' ? undefined : classFilter,
  });
  const mut = useStudentMutations();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    mssv: '',
    fullName: '',
    nominalClassId: '',
    status: 'active' as StudentStatus,
  });

  function onErr(e: unknown) {
    toast.error(e instanceof MasterDataHttpError ? e.message : 'Thao tác thất bại');
  }

  const classLabel = (id: string) =>
    classes.data?.items.find((c) => c.id === id)?.code ?? '—';

  return (
    <div className="space-y-6">
      <PageHeader title="Sinh viên" description="Catalog SV — chưa thay enrollment." />

      <div className="max-w-xs">
        <Label>Lọc theo lớp</Label>
        <Select value={classFilter} onValueChange={setClassFilter}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả</SelectItem>
            {(classes.data?.items ?? []).map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.code}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <CatalogSection
        title="Danh sách sinh viên"
        loading={isLoading}
        onCreate={() => setOpen(true)}
        headers={['MSSV', 'Họ tên', 'Lớp', 'Trạng thái', '']}
        rows={
          data?.items.length
            ? data.items.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-mono">{s.mssv}</TableCell>
                  <TableCell>{s.fullName}</TableCell>
                  <TableCell className="font-mono">{classLabel(s.nominalClassId)}</TableCell>
                  <TableCell>{s.status}</TableCell>
                  <TableCell className="text-right">
                    <DeleteIconButton
                      onClick={() =>
                        mut.remove.mutate(s.id, {
                          onSuccess: () => toast.success('Đã xóa SV'),
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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Thêm sinh viên</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label>MSSV</Label>
              <Input
                value={form.mssv}
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
              <Select
                value={form.nominalClassId}
                onValueChange={(v) => setForm({ ...form, nominalClassId: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Chọn lớp" />
                </SelectTrigger>
                <SelectContent>
                  {(classes.data?.items ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() =>
                mut.create.mutate(form, {
                  onSuccess: () => {
                    toast.success('Đã tạo SV');
                    setOpen(false);
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
