'use client';

import { useState } from 'react';
import { Loader2, Lock } from 'lucide-react';
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

interface FinalizeSessionButtonProps {
  /** Hidden entirely once the session is no longer active. */
  disabled: boolean;
  submitting: boolean;
  error: Error | null;
  /**
   * Must resolve only once the finalize request has settled — the dialog
   * stays open until then so a failure is visible. Rejection is expected
   * and handled here; the reason is rendered from `error`.
   */
  onConfirm: () => Promise<unknown>;
}

/**
 * "Chốt bài ngay" behind a confirmation.
 *
 * Finalizing cannot be undone — `active -> completed` is one-way, and every
 * agent in the room starts uploading the moment it lands. Doing that by
 * accident, mid-exam, with a stray click is the failure this dialog exists
 * to prevent, so the confirm button carries the consequence rather than a
 * bare "OK".
 */
export function FinalizeSessionButton({
  disabled,
  submitting,
  error,
  onConfirm,
}: FinalizeSessionButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant="destructive"
        disabled={disabled || submitting}
        onClick={() => setOpen(true)}
      >
        {submitting ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <Lock className="h-4 w-4" aria-hidden="true" />
        )}
        Chốt bài ngay
      </Button>

      <Dialog
        open={open}
        // Kept open while the request is in flight: closing it would hide
        // the error state the teacher needs if it fails.
        onOpenChange={(next) => !submitting && setOpen(next)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Chốt bài ngay?</DialogTitle>
            <DialogDescription>
              Phiên thi sẽ chuyển sang trạng thái đã kết thúc và toàn bộ agent đang kết nối
              sẽ lập tức nộp bài. Thao tác này không thể hoàn tác.
            </DialogDescription>
          </DialogHeader>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>
                Không thể chốt bài: {error.message}
              </AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={submitting}>
              Huỷ
            </Button>
            <Button
              variant="destructive"
              disabled={submitting}
              // Closes on success only. Closing on click instead would fire
              // the request and immediately hide the dialog the error is
              // rendered inside, so a failed finalize would look exactly
              // like a successful one — the failure mode this button can
              // least afford.
              onClick={() => {
                void onConfirm()
                  .then(() => setOpen(false))
                  .catch(() => {
                    // Swallowed on purpose: the reason is already in
                    // `error` and shown above. Rethrowing here would only
                    // become an unhandled rejection.
                  });
              }}
            >
              {submitting && (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              )}
              Chốt bài
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
