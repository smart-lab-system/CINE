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
import { useRegradeStuck } from '@/hooks/useGrading';
import { useRegradeAiScored, useRegradeResult, useRegradeUngradable } from '@/hooks/useRegrade';
import type { RegradeOutcome } from '@/lib/api/regrade';

/** Số bài bị bỏ qua, gộp theo câu lý do của server. */
function groupSkipped(outcome: RegradeOutcome | null): Map<string, number> {
  const byReason = new Map<string, number>();
  for (const skip of outcome?.skipped ?? []) byReason.set(skip.reason, (byReason.get(skip.reason) ?? 0) + 1);
  return byReason;
}

export type RegradeScope =
  | { kind: 'result'; sessionId: string; resultId: string }
  | {
      kind: 'session';
      sessionId: string;
      reason: string | null;
      /** Bài không chấm được do lỗi hệ thống (có thể 0 khi chỉ có bài bị kẹt). */
      count: number;
      /** Bài còn "đang chấm" nhưng không tiến trình nào xử lý: chấm lại cùng một lần bấm. */
      stuck?: number;
    }
  /** Ép chấm lại bằng AI bài đã có điểm (xoá kết quả AI cũ). */
  | { kind: 'force-ai'; sessionId: string; resultId: string };

/**
 * Nút chấm lại dùng chung cho đầu phiên và hồ sơ bài, để hộp xác nhận nói
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
  const forceAi = useRegradeAiScored(scope.sessionId);
  const stuckMutation = useRegradeStuck(scope.sessionId);
  const [open, setOpen] = useState(false);
  const [outcome, setOutcome] = useState<RegradeOutcome | null>(null);

  const mutation =
    scope.kind === 'force-ai' ? forceAi : scope.kind === 'result' ? one : many;
  const stuck = scope.kind === 'session' ? (scope.stuck ?? 0) : 0;
  const systemCount = scope.kind === 'session' ? scope.count : 0;
  const count = scope.kind === 'session' ? scope.count + stuck : 1;
  const pending = mutation.isPending || (stuck > 0 && stuckMutation.isPending);
  const failure = mutation.error ?? (stuck > 0 ? stuckMutation.error : null);

  const done = (data: RegradeOutcome) => {
    setOutcome(data);
    setOpen(false);
    // Thông báo ngay trong trang chết cùng cái nút: danh sách tải lại không còn đếm các bài vừa xếp lại (UPDATE đã
    // xoá lớp lý do của chúng), nên nút ở đầu phiên / băng / khối đang chấm biến mất vài trăm mili-giây sau khi xác
    // nhận - kéo theo dòng "bỏ qua" mà giảng viên cần đọc. Toast thì sống qua việc đó (phát hiện ở browser pass).
    const lines = [...groupSkipped(data)].map(([reason, n]) => `${n} bài bỏ qua - ${reason}`);
    toast.success(`Đã xếp lại ${data.requeued} bài`, { description: lines.length > 0 ? lines.join('; ') : undefined });
  };
  // Lời từ chối của server cũng ra toast: 409 "đang được chấm" nghĩa là bài đã đi tiếp, nên lần tải lại ngay sau đó
  // đổi màn hình và gỡ cả nút lẫn hộp thoại đang giữ Alert đỏ - câu nguyên văn sẽ không bao giờ kịp được đọc.
  const failed = (error: Error) => {
    toast.error(error.message);
  };
  const confirm = () => {
    if (scope.kind === 'force-ai') forceAi.mutate(scope.resultId, { onSuccess: done, onError: failed });
    else if (scope.kind === 'result') one.mutate(scope.resultId, { onSuccess: done, onError: failed });
    else {
      // Bài bị kẹt chấm lại bằng đường riêng (xếp lại việc đang treo): chạy sau lượt bài lỗi hệ thống, gộp kết quả.
      const runStuck = (prior: RegradeOutcome | null) =>
        stuckMutation.mutate(undefined, {
          onSuccess: (s) => done({ requeued: (prior?.requeued ?? 0) + s.requeued, skipped: prior?.skipped ?? [] }),
          onError: (error) => {
            if (prior) done(prior);
            failed(error);
          },
        });
      if (systemCount > 0) {
        many.mutate(scope.reason, {
          onSuccess: (outcome) => (stuck > 0 ? runStuck(outcome) : done(outcome)),
          onError: failed,
        });
      } else if (stuck > 0) {
        runStuck(null);
      }
    }
  };

  const skippedByReason = groupSkipped(outcome);
  const title =
    scope.kind === 'force-ai'
      ? 'Chấm lại bằng AI?'
      : scope.kind === 'result'
        ? 'Chấm lại bài này?'
        : `Chấm lại ${count} bài?`;
  const description =
    scope.kind === 'force-ai'
      ? 'Điểm và giải trình AI hiện tại sẽ bị xoá. Bài được chấm lại từ đầu bằng mô hình (có tính phí). Đóng trang không dừng việc chấm - kết quả hiện lại khi xong.'
      : scope.kind === 'result'
        ? 'Bài này sẽ được chấm lại từ đầu. Mỗi bài là một lượt gọi mô hình có tính phí. Đóng trang không dừng việc chấm - kết quả hiện ở danh sách khi xong.'
        : `Bạn sắp chấm lại ${
            stuck > 0
              ? systemCount > 0
                ? `${systemCount} bài không chấm được do lỗi phía hệ thống và ${stuck} bài đang bị kẹt (không còn tiến trình chấm nào xử lý)`
                : `${stuck} bài đang bị kẹt (không còn tiến trình chấm nào xử lý)`
              : `${count} bài không chấm được do lỗi phía hệ thống${scope.reason ? ` - cùng lý do: “${scope.reason}”` : ''}`
          }. Mỗi bài là một lượt gọi mô hình có tính phí. Đóng trang không dừng việc chấm - kết quả hiện ở danh sách khi xong.`;

  return (
    <>
      <div className="flex flex-col items-start gap-2">
        <Button
          type="button"
          variant={variant}
          size={size}
          onClick={() => {
            mutation.reset(); // một lỗi cũ không được hiện lại khi mở hộp lần sau
            stuckMutation.reset();
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
                  {n} bài bỏ qua - {reason}
                </span>
              ))}
            </AlertDescription>
          </Alert>
        )}
      </div>

      <Dialog open={open} onOpenChange={(next) => !next && setOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          {failure && (
            <Alert variant="destructive">
              <AlertDescription>{failure.message}</AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Huỷ
            </Button>
            <Button type="button" loading={pending} onClick={confirm}>
              {scope.kind === 'force-ai' ? 'Xác nhận chấm lại bằng AI' : 'Xác nhận chấm lại'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
