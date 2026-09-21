'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useDeleteClass } from '@/hooks/useTeaching';
import type { TeachingClass } from '@/lib/api/teaching';

/**
 * Xác nhận xoá lớp.
 *
 * Không tự chặn ở client khi lớp còn sinh viên, dù `studentCount` nằm ngay
 * đây: `enrollment.home_class_id` là ON DELETE RESTRICT, nên SERVER mới là
 * nơi quyết định, và nó biết cả những dòng mà con số đã tải về từ lúc nào
 * đó chưa kịp thấy. Việc của hộp thoại là nói trước điều sắp xảy ra rồi
 * hiện đúng lý do server trả về.
 */
export function DeleteClassDialog({
  target,
  onOpenChange,
}: {
  /** `null` = đóng. */
  target: TeachingClass | null;
  onOpenChange: (next: boolean) => void;
}) {
  const remove = useDeleteClass();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (target) setError(null);
  }, [target]);

  return (
    <Dialog open={target !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Xoá lớp {target?.name}?</DialogTitle>
          <DialogDescription>
            {target && target.studentCount > 0
              ? `Lớp này đang có ${target.studentCount} sinh viên. Hãy xoá danh sách trước — hệ thống sẽ từ chối nếu vẫn còn người trong đó.`
              : 'Thao tác này không hoàn tác được.'}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={remove.isPending}
          >
            Huỷ
          </Button>
          <Button
            type="button"
            variant="destructive"
            loading={remove.isPending}
            onClick={() => {
              if (!target) return;
              remove.mutate(target.id, {
                onSuccess: () => {
                  toast.success(`Đã xoá lớp ${target.name}.`);
                  onOpenChange(false);
                },
                onError: (e: Error) => setError(e.message),
              });
            }}
          >
            Xoá lớp
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
