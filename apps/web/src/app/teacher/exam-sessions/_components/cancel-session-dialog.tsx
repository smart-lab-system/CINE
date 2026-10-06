'use client';

import { useEffect, useState } from 'react';
import { CircleAlert } from 'lucide-react';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { useCancelExamSession } from '@/hooks/useExamSession';
import type { ExamSessionListItem } from '@/lib/api/exam-session';
import { describeCancelError } from '../new/schema';

/** Cùng giới hạn với `CancelExamSessionDto` ở server (plan F). */
const MAX_REASON_LENGTH = 200;

function formatStart(iso: string): string {
  return new Date(iso).toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Xác nhận huỷ một phiên (spec §4.1): nêu HẬU QUẢ trước khi bấm — phiên không khôi phục được, sinh viên không vào được nữa, phòng/lớp/giãn cách được
 * nhả. Lý do là tuỳ chọn và đi vào nhật ký hệ thống.
 *
 * Khi server từ chối (đã có sinh viên vào phòng, 409) câu của server hiện NGAY TRONG hộp thoại và hộp thoại giữ mở: đó là câu hướng dẫn
 * ("hãy Chốt bài ngay rồi Xác nhận kết thúc"), và đóng hộp thoại sẽ nuốt nó. Đang gửi thì không đóng được (Esc, bấm nền) để không bỏ rơi một
 * yêu cầu đang bay.
 */
export function CancelSessionDialog({ session, onClose }: { session: ExamSessionListItem | null; onClose: () => void }) {
  const { mutate, reset, isPending, isError, error } = useCancelExamSession();
  const [reason, setReason] = useState('');
  const sessionId = session?.id ?? null;

  // Mở cho một phiên khác thì không mang lý do hay lỗi của lần trước sang.
  useEffect(() => {
    setReason('');
    reset();
  }, [sessionId, reset]);

  function confirm() {
    if (!session) return;
    mutate(
      { id: session.id, reason: reason.trim() || undefined },
      {
        onSuccess: () => {
          toast.success(`Đã huỷ phiên “${session.name}”.`);
          onClose();
        },
      },
    );
  }

  return (
    <Dialog
      open={session !== null}
      onOpenChange={(open) => {
        if (!open && !isPending) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Huỷ phiên thi?</DialogTitle>
          <DialogDescription>
            {session && (
              <>
                Phiên “{session.name}” ({session.classLabel}, bắt đầu {formatStart(session.startTime)}) sẽ bị huỷ. Phiên không khôi
                phục được và sinh viên không vào được nữa. Phòng, lớp và quãng giãn cách 30 phút của bạn được nhả để tạo phiên khác;
                muốn thi thì tạo phiên mới.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <FormField
          id="cancel-session-reason"
          label="Lý do (không bắt buộc)"
          hint="Ghi vào nhật ký hệ thống, tối đa 200 ký tự."
        >
          <Input
            id="cancel-session-reason"
            value={reason}
            maxLength={MAX_REASON_LENGTH}
            onChange={(event) => setReason(event.target.value)}
            placeholder="vd: Nhầm phòng"
          />
        </FormField>

        {isError && (
          <Alert variant="destructive">
            <CircleAlert />
            <AlertDescription>{describeCancelError(error)}</AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
            Giữ phiên
          </Button>
          <Button type="button" variant="destructive" loading={isPending} onClick={confirm}>
            Huỷ phiên
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
