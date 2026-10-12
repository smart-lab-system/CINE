'use client';

import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useRevokeWaiver, useSetWaiver } from '@/hooks/useRules';
import type { OverviewCriterion } from '@/lib/api/rubric-errors';
import { shorten } from '@/lib/rubric-board';
import { describeRecompute } from '@/lib/rules-vocab';

export interface WaiverTarget {
  criterion: OverviewCriterion;
  /** Phiên bản MỚI NHẤT của rubric — đánh dấu gắn theo nó và được chép sang bản sau (spec 3.7). */
  rubricId: string;
}

/**
 * "Tiêu chí này không trừ điểm" (đánh dấu / bỏ đánh dấu). Cả hai đổi điểm các phiên chưa chốt nên LUÔN hỏi xác nhận
 * nói hậu quả trước, rồi đọc kết quả tính lại bằng lời sau.
 */
export function WaiverDialog({ target, onClose }: { target: WaiverTarget | null; onClose: () => void }) {
  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>{target && <WaiverBody key={target.criterion.key} target={target} onClose={onClose} />}</DialogContent>
    </Dialog>
  );
}

function WaiverBody({ target, onClose }: { target: WaiverTarget; onClose: () => void }) {
  const set = useSetWaiver(target.rubricId);
  const revoke = useRevokeWaiver();
  const { criterion } = target;
  const title = shorten(criterion.description, 60);
  const revoking = criterion.waiverId !== null;
  const mutation = revoking ? revoke : set;

  function confirm() {
    if (criterion.waiverId !== null) {
      revoke.mutate(criterion.waiverId, {
        onSuccess: (r) => {
          toast.success(describeRecompute(r.recompute));
          onClose();
        },
      });
      return;
    }
    set.mutate(criterion.key, {
      onSuccess: (r) => {
        toast.success(r.recompute === null ? 'Đánh dấu này đã có từ trước, không tính lại bài nào.' : describeRecompute(r.recompute));
        onClose();
      },
    });
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{revoking ? 'Bỏ đánh dấu "không trừ điểm"?' : 'Đánh dấu tiêu chí không trừ điểm?'}</DialogTitle>
        <DialogDescription>
          {revoking
            ? `Bỏ đánh dấu: “${title}” lại cần có lỗi. Bài nào chưa có lỗi cho tiêu chí này sẽ không tự quyết được ("Cần bạn xem"); các phiên chưa chốt được tính lại.`
            : `Từ giờ “${title}” luôn trọn điểm cho mọi bài chấm theo rubric này; các phiên chưa chốt được tính lại.`}
        </DialogDescription>
      </DialogHeader>
      {mutation.isError && (
        <Alert variant="destructive">
          <AlertDescription>{mutation.error?.message}</AlertDescription>
        </Alert>
      )}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Huỷ
        </Button>
        <Button type="button" variant="primary" loading={mutation.isPending} onClick={confirm}>
          {revoking ? 'Bỏ đánh dấu' : 'Đánh dấu không trừ điểm'}
        </Button>
      </DialogFooter>
    </>
  );
}
