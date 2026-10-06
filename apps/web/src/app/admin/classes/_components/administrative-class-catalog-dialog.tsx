'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { ConfirmDeleteDialog } from '@/components/resource/confirm-delete-dialog';
import { NearDuplicateNotice } from '@/components/resource/near-duplicate-notice';
import { ResourceFormDialog } from '@/components/resource/resource-form-dialog';
import { ImportDialog } from '@/components/import/import-dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  useAdministrativeClasses,
  useCreateAdministrativeClass,
  useDeleteAdministrativeClass,
  useUpdateAdministrativeClass,
} from '@/hooks/useAdministrativeClasses';
import type { AdministrativeClass } from '@/lib/api/administrative-classes';
import { NearDuplicateError } from '@/lib/api/http-error';
import { ADMINISTRATIVE_CLASS_KIND } from '@/lib/import/columns';

interface AdministrativeClassCatalogDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Danh mục lớp danh nghĩa (spec §2.2, §5.1) — hộp thoại trong trang Lớp, KHÔNG có trang riêng: giảng viên và các màn hình khác chỉ thấy
 * nhãn gộp `DHKTPM18A – Nhóm 1`, nên không bao giờ thấy "hai thứ".
 *
 * Mã CHỈ được tạo ở đây (một ô gõ duy nhất còn lại, hoặc nhập từ file); form tạo lớp chỉ CHỌN. Lỗi gõ vì thế xảy ra MỘT lần cho cả danh
 * mục thay vì mỗi lần tạo lớp. Cảnh báo "gần giống" là lời nhắc có thể xác nhận bỏ qua; xoá một mã còn lớp dùng bị server chặn kèm số lớp.
 */
export function AdministrativeClassCatalogDialog({ open, onOpenChange }: AdministrativeClassCatalogDialogProps) {
  const catalog = useAdministrativeClasses();
  const create = useCreateAdministrativeClass();
  const update = useUpdateAdministrativeClass();
  const remove = useDeleteAdministrativeClass();

  const [newCode, setNewCode] = useState('');
  const [editing, setEditing] = useState<AdministrativeClass | null>(null);
  const [editCode, setEditCode] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [deleting, setDeleting] = useState<AdministrativeClass | null>(null);

  // Mở hộp thoại là trạng thái mới: lỗi và ô gõ của lần trước không hiện lại. Chỉ phụ thuộc `open` có chủ ý: `create` đổi tham chiếu
  // mỗi lần render, đưa nó vào mảng sẽ xoá lỗi vừa hiện ngay sau mỗi lần render.
  useEffect(() => {
    if (!open) return;
    create.reset();
    setNewCode('');
  }, [open]);

  async function add(confirmSimilar: boolean) {
    try {
      await create.mutateAsync({ code: newCode, ...(confirmSimilar ? { confirmSimilar: true } : {}) });
      setNewCode('');
    } catch {
      // Hiện bên dưới qua `create.error`.
    }
  }

  function onAddSubmit(event: FormEvent) {
    event.preventDefault();
    void add(false);
  }

  function openEdit(entry: AdministrativeClass) {
    update.reset();
    setEditing(entry);
    setEditCode(entry.code);
    setEditOpen(true);
  }

  function saveEdit(confirmSimilar: boolean): Promise<unknown> {
    return update.mutateAsync({
      id: editing!.id,
      body: { code: editCode, ...(confirmSimilar ? { confirmSimilar: true } : {}) },
    });
  }

  const addNearDuplicate = create.error instanceof NearDuplicateError ? create.error : null;
  const addHardError = create.error && !addNearDuplicate ? create.error : null;
  const editNearDuplicate = update.error instanceof NearDuplicateError ? update.error : null;
  const entries = catalog.data ?? [];

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Danh mục lớp danh nghĩa</DialogTitle>
            <DialogDescription>
              Các mã lớp danh nghĩa (vd DHKTPM18A) mà lớp được tạo từ đó. Mã chỉ được thêm ở đây; form tạo lớp chỉ chọn.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={onAddSubmit} className="flex flex-col gap-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex flex-1 flex-col gap-2">
                <Label htmlFor="catalog-new-code">Mã lớp danh nghĩa mới</Label>
                <Input
                  id="catalog-new-code"
                  value={newCode}
                  placeholder="vd: DHKTPM18A"
                  onChange={(e) => setNewCode(e.target.value)}
                />
              </div>
              <Button type="submit" disabled={create.isPending || newCode.trim() === ''}>
                Thêm mã
              </Button>
              <ImportDialog kind={ADMINISTRATIVE_CLASS_KIND} />
            </div>
            {addHardError && (
              <Alert variant="destructive">
                <AlertDescription>{addHardError.message}</AlertDescription>
              </Alert>
            )}
            {addNearDuplicate && (
              <NearDuplicateNotice
                error={addNearDuplicate}
                noun="mã lớp danh nghĩa"
                confirming={create.isPending}
                onConfirm={() => void add(true)}
              />
            )}
          </form>

          {catalog.error && (
            <Alert variant="destructive">
              <AlertDescription>{catalog.error.message}</AlertDescription>
            </Alert>
          )}

          {catalog.isLoading ? (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-5 w-1/2" />
              <Skeleton className="h-5 w-2/3" />
            </div>
          ) : entries.length === 0 && !catalog.error ? (
            <p className="rounded-md border border-border bg-surface-2 p-4 text-small text-muted-foreground">
              Chưa có mã lớp danh nghĩa nào. Hãy thêm mã ở ô phía trên, hoặc nhập từ file.
            </p>
          ) : (
            <div className="max-h-[22rem] overflow-y-auto rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead scope="col">Mã</TableHead>
                    <TableHead scope="col" className="text-right">
                      Số lớp đang dùng
                    </TableHead>
                    <TableHead scope="col" className="text-right">
                      <span className="sr-only">Hành động</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell className="font-mono font-medium">{entry.code}</TableCell>
                      <TableCell className="text-right tabular-nums">{entry.classCount}</TableCell>
                      <TableCell className="whitespace-nowrap text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`Sửa mã ${entry.code}`}
                          onClick={() => openEdit(entry)}
                        >
                          <Pencil className="h-4 w-4" aria-hidden="true" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`Xoá mã ${entry.code}`}
                          onClick={() => {
                            remove.reset();
                            setDeleting(entry);
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-danger-strong" aria-hidden="true" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ResourceFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        title="Sửa mã lớp danh nghĩa"
        submitLabel="Lưu"
        submitting={update.isPending}
        error={update.error}
        canSubmit={editCode.trim() !== '' && editCode.trim() !== editing?.code}
        onSubmit={() => saveEdit(false)}
      >
        <div className="flex flex-col gap-2">
          <Label htmlFor="catalog-edit-code">Mã lớp danh nghĩa</Label>
          <Input id="catalog-edit-code" value={editCode} onChange={(e) => setEditCode(e.target.value)} />
          <p className="text-caption text-muted-foreground">
            Đổi mã làm đổi nhãn của mọi lớp dùng mã này, kể cả lớp của kỳ cũ — đó là mục đích của việc sửa lỗi gõ.
          </p>
        </div>
        {editNearDuplicate && (
          <NearDuplicateNotice
            error={editNearDuplicate}
            noun="mã lớp danh nghĩa"
            action="lưu"
            confirming={update.isPending}
            onConfirm={() => {
              void saveEdit(true)
                .then(() => setEditOpen(false))
                .catch(() => {
                  // Lý do đã hiện trong biểu mẫu qua `error`.
                });
            }}
          />
        )}
      </ResourceFormDialog>

      <ConfirmDeleteDialog
        open={deleting !== null}
        onOpenChange={(next) => !next && setDeleting(null)}
        target={`mã lớp danh nghĩa "${deleting?.code ?? ''}"`}
        submitting={remove.isPending}
        error={remove.error}
        onConfirm={() => remove.mutateAsync(deleting!.id)}
      />
    </>
  );
}
