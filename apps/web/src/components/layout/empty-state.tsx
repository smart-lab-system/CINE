import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  /** A way out. An empty screen with nothing to press is a dead end —
   *  omit this only when there genuinely is no next step. */
  action?: ReactNode;
  tone?: 'accent' | 'primary' | 'muted';
  className?: string;
}

const TONE_CLASSES: Record<NonNullable<EmptyStateProps['tone']>, string> = {
  accent: 'bg-accent-subtle text-accent-strong',
  primary: 'bg-primary-subtle text-primary',
  muted: 'bg-surface-2 text-muted-foreground',
};

/**
 * The one empty state in the app: icon chip, a title that says what isn't
 * there, a line explaining why, and the action that fixes it.
 *
 * Shared so "no accounts yet", "no search results", and "not built yet"
 * are visibly the same kind of moment — they differ in their words, which
 * is where the difference actually is.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  tone = 'accent',
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn('flex flex-col items-center gap-5 px-6 py-16 text-center', className)}
    >
      <span className={cn('icon-chip h-14 w-14 rounded-2xl', TONE_CLASSES[tone])}>
        <Icon className="h-7 w-7" aria-hidden="true" />
      </span>
      <div className="flex flex-col gap-2">
        <p className="text-h3 text-foreground">{title}</p>
        <p className="mx-auto max-w-md text-body text-muted-foreground">{description}</p>
      </div>
      {action}
    </div>
  );
}
