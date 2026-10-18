import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface PageHeaderProps {
  title: string;
  /** One line saying what this screen is for. Optional, but a title alone
   *  on an empty screen tells a first-time user nothing. */
  description?: string;
  /** Primary action for the page — sits opposite the title. */
  actions?: ReactNode;
  className?: string;
}

/**
 * Every page opens the same way: title, a muted line of context, and the
 * page's single primary action pinned to the right. Consistency here is
 * what stops each screen from inventing its own header — and it gives
 * PageTransition a stable first thing to animate in (`data-animate`).
 */
export function PageHeader({ title, description, actions, className }: PageHeaderProps) {
  return (
    <div
      data-animate
      className={cn(
        'flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between',
        className,
      )}
    >
      <div className="min-w-0 flex-1 flex flex-col gap-1.5">
        <h1 className="text-h1 text-foreground break-words">{title}</h1>
        {description && (
          <p className="max-w-2xl break-words text-body text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">{actions}</div>
      )}
    </div>
  );
}
