import * as React from 'react';
import { cn } from '@/lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /**
   * Turns the border red and marks the field for assistive tech. The error
   * *message* stays with the caller (it belongs next to the label, in the
   * caller's own copy) — this only handles the field's own appearance and
   * `aria-invalid`, so the two can never disagree.
   */
  invalid?: boolean;
}

/**
 * Focus is a teal border plus the app-wide teal ring, which globals.css
 * declares once for every focusable element and tightens to zero offset
 * for text fields so the two cues read as one halo rather than two.
 *
 * An invalid field switches both to red — colour alone never carries the
 * message (FormField prints an iconed error underneath), but the field
 * itself should still look wrong while you're standing in it.
 */
const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, invalid, ...props }, ref) => (
    <input
      type={type}
      aria-invalid={invalid || undefined}
      className={cn(
        'flex h-10 w-full rounded-md border border-input bg-surface px-3 py-2 text-body text-foreground shadow-sm',
        'transition-[border-color,box-shadow] duration-200 ease-smooth',
        'placeholder:text-muted-foreground',
        'focus:border-accent focus:outline-none',
        'disabled:cursor-not-allowed disabled:bg-surface-2 disabled:opacity-60',
        // Date/time inputs render a native picker glyph that is near-black
        // by default; tint it to the muted text colour so it stops
        // out-weighing the value beside it.
        '[&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-55',
        invalid && 'border-danger focus:border-danger focus-visible:ring-danger/40',
        className,
      )}
      ref={ref}
      {...props}
    />
  ),
);
Input.displayName = 'Input';

export { Input };
