'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button, type ButtonProps } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useRegradeResult, useRegradeUngradable } from '@/hooks/useRegrade';
import type { RegradeOutcome } from '@/lib/api/regrade';

/** Số bài bị bỏ qua, gộp theo câu lý do của server. */
function groupSkipped(outcome: RegradeOutcome | null): Map<string, number> {
  const byReason = new Map<string, number>();
  for (const skip of outcome?.skipped ?? []) byReason.set(skip.reason, (byReason.get(skip.reason) ?? 0) + 1);
  return byReason;
}

export type RegradeScope =
  | { kind: 'result'; sessionId: string; resultId: string }
  | { kind: 'session'; sessionId: string; reason: string | null; count: number };

/**
 * MỘT nút chấm lại cho cả bốn chỗ (đầu phiên, khối "đã dừng", hồ sơ, băng dịch vụ AI lỗi), để hộp xác nhận nói
 * đúng ba điều ở mọi nơi: (1) bao nhiêu bài; (2) mỗi bài là một lượt gọi mô hình CÓ TÍNH PHÍ; (3) đóng trang
 * không dừng việc chấm. Bấm nút chỉ MỞ hộp; chỉ "Xác nhận chấm lại" mới gửi.
 */
export function RegradeButton({
  scope,
  label,
  variant = 'outline',
  size = 'sm',
}: {
  scope: RegradeScope;
  label: string;
  variant?: ButtonProps['variant'];
  size?: ButtonProps['size'];
}) {
  const one = useRegradeResult(scope.sessionId);
  const many = useRegradeUngradable(scope.sessionId);
  const [open, setOpen] = useState(false);
  const [outcome, setOutcome] = useState<RegradeOutcome | null>(null);

  const mutation = scope.kind === 'result' ? one : many;
  const count = scope.kind === 'session' ? scope.count : 1;

  const done = (data: RegradeOutcome) => {
    setOutcome(data);
    setOpen(false);
    // Thông báo ngay trong trang chết cùng cái nút: danh sách tải lại không còn đếm các bài vừa xếp lại (UPDATE đã
    // xoá lớp lý do của chúng), nên nút ở đầu phiên / băng / khối đang chấm biến mất vài trăm mili-giây sau khi xác
    // nhận — kéo theo dòng "bỏ qua" mà giảng viên cần đọc. Toast thì sống qua việc đó (phát hiện ở browser pass).
    const lines = [...groupSkipped(data)].map(([reason, n]) => `${n} bài bỏ qua — ${reason}`);
    toast.success(`Đã xếp lại ${data.requeued} bài`, { description: lines.length > 0 ? lines.join('; ') : undefined });
  };
  const confirm = () => {
    if (scope.kind === 'result') one.mutate(scope.resultId, { onSuccess: done });
    else many.mutate(scope.reason, { onSuccess: done });
  };

  const skippedByReason = groupSkipped(outcome);

  return (
    <>
      <div className="flex flex-col items-start gap-2">
        <Button
          type="button"
          variant={variant}
          size={size}
          onClick={() => {
            mutation.reset(); // một lỗi cũ không được hiện lại khi mở hộp lần sau
            setOutcome(null);
            setOpen(true);
          }}
        >
          {label}
        </Button>
        {outcome && (
          <Alert variant="success" role="status" className="w-full">
            <AlertDescription>
              <span className="block">
                Đã xếp lại <strong>{outcome.requeued} bài</strong>.
              </span>
              {[...skippedByReason.entries()].map(([reason, n]) => (
                <span key={reason} className="block">
                  {n} bài bỏ qua — {reason}
                </span>
              ))}
            </AlertDescription>
          </Alert>
        )}
      </div>

      <Dialog open={open} onOpenChange={(next) => !next && setOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{scope.kind === 'result' ? 'Chấm lại bài này?' : `Chấm lại ${count} bài?`}</DialogTitle>
            <DialogDescription>
              {scope.kind === 'result'
                ? 'Bài này sẽ được chấm lại từ đầu.'
                : `Bạn sắp chấm lại ${count} bài không chấm được do lỗi phía hệ thống${
                    scope.reason ? ` — cùng lý do: “${scope.reason}”` : ''
                  }.`}{' '}
              Mỗi bài là một lượt gọi mô hình có tính phí. Đóng trang không dừng việc chấm — kết quả hiện ở danh
              sách khi xong.
            </DialogDescription>
          </DialogHeader>
          {mutation.isError && mutation.error && (
            <Alert variant="destructive">
              <AlertDescription>{mutation.error.message}</AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Huỷ
            </Button>
            <Button type="button" loading={mutation.isPending} onClick={confirm}>
              Xác nhận chấm lại
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
