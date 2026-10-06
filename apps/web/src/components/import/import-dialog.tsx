'use client';

import { useState } from 'react';
import { Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ImportWizard } from '@/components/import/import-wizard';
import { useImportRunner } from '@/hooks/useMasterDataImport';
import type { ImportKind } from '@/lib/import/columns';
import type { ImportResult } from '@/lib/import/import-types';

interface ImportDialogProps {
  kind: ImportKind;
  /**
   * Tuỳ chọn. Danh sách đã tự làm mới (qua `useImportRunner`) nên trang KHÔNG cần gọi `refetch`; callback này chỉ cho việc
   * khác, vd đóng một bảng phụ hay hiện thông báo.
   */
  onImported?: (result: ImportResult) => void;
  triggerLabel?: string;
}

/**
 * Nút + hộp thoại "Nhập từ file" cho một loại dữ liệu nền — chỗ DUY NHẤT trang admin chạm vào bộ import (plan G1):
 * `<ImportDialog kind={ROOM_KIND} />`. Keo dán: lấy bộ chạy theo loại từ hook và bọc `ImportWizard`.
 *
 * Radix gỡ nội dung khi đóng, nên đóng hộp thoại là bỏ file, cột đã chọn và bản xem trước — không có trạng thái nào sống
 * sót để lần mở sau hiện nhầm bản xem trước của lần trước.
 */
export function ImportDialog({ kind, onImported, triggerLabel = 'Nhập từ file' }: ImportDialogProps) {
  const [open, setOpen] = useState(false);
  const run = useImportRunner(kind.id);

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Upload className="h-4 w-4" aria-hidden="true" />
        {triggerLabel}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{`Nhập ${kind.title.toLowerCase()} từ file`}</DialogTitle>
            <DialogDescription>
              Chỉ thêm và sửa — không bao giờ xoá. Muốn xoá thì làm thủ công.
            </DialogDescription>
          </DialogHeader>
          <ImportWizard kind={kind} run={run} onImported={onImported} />
        </DialogContent>
      </Dialog>
    </>
  );
}
