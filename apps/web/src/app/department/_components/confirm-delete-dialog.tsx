'use client';

import { Loader2 } from 'lucide-react';
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

interface ConfirmDeleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** What is being deleted, shown verbatim so there is no doubt which row. */
  target: string;
  submitting: boolean;
  error: Error | null;
  onConfirm: () => Promise<unknown>;
}

/**
 * Deleting academic data is mostly refused by the database — every FK into
 * course, class, semester and room is ON DELETE RESTRICT, so a row still in
 * use comes back as a 409 rather than taking its dependents with it. This
 * dialog exists for the case that is *not* refused: a genuinely unused row,
 * where the click is the only thing standing between the user and losing it.
 *
 * Closes on success only. Closing on click would hide the 409 explaining why
 * the delete did not happen, and the row silently staying put would read as a
 * bug.
 */
export function ConfirmDeleteDialog({
  open,
  onOpenChange,
  target,
  submitting,
  error,
  onConfirm,
}: ConfirmDeleteDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(next) => !submitting && onOpenChange(next)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Xoá {target}?</DialogTitle>
          <DialogDescription>
            Thao tác này không thể hoàn tác. Nếu mục này đang được sử dụng (có lớp, phiên
            thi hoặc sinh viên phụ thuộc), hệ thống sẽ từ chối xoá.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error.message}</AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Huỷ
          </Button>
          <Button
            variant="destructive"
            disabled={submitting}
            onClick={() => {
              void onConfirm()
                .then(() => onOpenChange(false))
                .catch(() => {
                  // Reason is already rendered above; rethrowing would only
                  // become an unhandled rejection.
                });
            }}
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            Xoá
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
