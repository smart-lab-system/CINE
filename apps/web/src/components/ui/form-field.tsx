import type { ReactNode } from 'react';
import { CircleAlert } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

interface FormFieldProps {
  /** Must match the control's `id` — this is what wires the label to it. */
  id: string;
  label: string;
  /** The validation message, when there is one. */
  error?: string;
  /** Standing guidance shown while the field is valid — format rules,
   *  what the value is used for. Hidden once an error takes its place, so
   *  the two never stack and push the form around. */
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}

/**
 * Label, control, and message in one consistent stack.
 *
 * Every form in the app was hand-assembling this with slightly different
 * spacing and a bare red `<p>` for errors. Centralising it means an error
 * looks and is announced the same way everywhere, and a field can't
 * accidentally ship without its label tied to its control.
 *
 * The message carries an icon as well as colour, so the error state
 * survives being read by someone who can't distinguish red from grey.
 */
export function FormField({ id, label, error, hint, children, className }: FormFieldProps) {
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? (
        <p
          role="alert"
          className="flex items-start gap-1.5 text-small font-medium text-danger-strong"
        >
          <CircleAlert className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : (
        hint && <p className="text-small text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}
