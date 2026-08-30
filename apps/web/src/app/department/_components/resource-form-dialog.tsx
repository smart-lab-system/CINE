'use client';

import type { FormEvent, ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface ResourceFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  submitLabel: string;
  submitting: boolean;
  error: Error | null;
  onSubmit: () => Promise<unknown>;
  children: ReactNode;
}

/**
 * Add/edit dialog for the academic resources.
 *
 * Plain controlled inputs rather than React Hook Form + Zod, which the rest
 * of this app uses. That pairing earns its place on the create-exam-session
 * form, where end time has to be validated against start time and a filename
 * list against a regex; these are two or three independent required fields,
 * where it would be ceremony. The server validates all of them regardless,
 * and its message is what gets shown.
 *
 * Closes on success only, for the same reason ConfirmDeleteDialog does:
 * closing on click would hide the error explaining why nothing happened.
 */
export function ResourceFormDialog({
  open,
  onOpenChange,
  title,
  submitLabel,
  submitting,
  error,
  onSubmit,
  children,
}: ResourceFormDialogProps) {
  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    void onSubmit()
      .then(() => onOpenChange(false))
      .catch(() => {
        // Rendered above.
      });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !submitting && onOpenChange(next)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error.message}</AlertDescription>
            </Alert>
          )}

          {children}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Huỷ
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
