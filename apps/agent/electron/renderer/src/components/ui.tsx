/**
 * The small set of building blocks every screen in this app reuses.
 * Deliberately not a design-system package (class-variance-authority,
 * Radix, an icon library) the way apps/web's components/ui is — this app
 * has a small, fixed set of screens, not an extensible surface, so plain
 * Tailwind classes on plain elements is the right amount of machinery.
 */

import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';

export function Spinner() {
  return (
    <div
      className="mx-auto h-8 w-8 animate-spin rounded-full border-[3px] border-accent-subtle border-t-accent-strong"
      role="status"
      aria-label="Đang xử lý"
    />
  );
}

type StatusTone = 'info' | 'success' | 'warning' | 'danger';

const STATUS_TONE_CLASSES: Record<StatusTone, string> = {
  info: 'bg-info-subtle text-info-strong',
  success: 'bg-success-subtle text-success-strong',
  warning: 'bg-warning-subtle text-warning-strong',
  danger: 'bg-danger-subtle text-danger-strong',
};

const STATUS_TONE_ICONS: Record<StatusTone, string> = {
  info: 'ℹ',
  success: '✓',
  warning: '⚠',
  danger: '✕',
};

export function StatusLine({ tone, children }: { tone: StatusTone; children: ReactNode }) {
  return (
    <div className={`flex items-start gap-2.5 rounded-lg px-3 py-2.5 text-small leading-relaxed ${STATUS_TONE_CLASSES[tone]}`}>
      <span className="shrink-0 text-body leading-[1.4]" aria-hidden="true">
        {STATUS_TONE_ICONS[tone]}
      </span>
      <span>{children}</span>
    </div>
  );
}

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  invalid?: boolean;
}

export function Field({ label, hint, invalid, className, ...inputProps }: FieldProps) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-caption font-semibold text-foreground">{label}</span>
      <input
        className={`rounded-md border bg-surface px-2.5 py-2 font-sans text-small text-foreground placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:bg-surface-2 disabled:opacity-60 ${
          invalid ? 'border-danger' : 'border-border'
        } ${className ?? ''}`}
        {...inputProps}
      />
      {hint && <span className="text-caption text-muted-foreground">{hint}</span>}
    </label>
  );
}

interface AppButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'ghost';
}

export function AppButton({ variant = 'primary', className, ...props }: AppButtonProps) {
  const variantClass =
    variant === 'primary'
      ? 'bg-accent-strong text-accent-foreground hover:bg-accent-stronger disabled:bg-surface-2 disabled:text-muted-foreground'
      : 'border border-border bg-transparent text-muted-foreground hover:bg-surface-2 disabled:opacity-60';
  return (
    <button
      className={`w-full rounded-md px-4 py-2.5 text-small font-semibold transition-colors disabled:cursor-not-allowed ${variantClass} ${className ?? ''}`}
      {...props}
    />
  );
}

export function BrandMark() {
  return (
    <div className="mb-0.5 flex items-center gap-2.5">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-accent-strong text-body font-extrabold text-white">
        E
      </div>
      <div className="flex flex-col leading-tight">
        <span className="text-small font-bold">ExamCollect</span>
        <span className="text-caption text-muted-foreground">Agent sinh viên</span>
      </div>
    </div>
  );
}
