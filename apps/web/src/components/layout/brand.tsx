import Link from 'next/link';
import { ClipboardCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BrandProps {
  href: string;
  /** Drops the tagline — for the mobile sheet header, where the row is
   *  tight and the tagline would wrap. */
  compact?: boolean;
  /** Drops the wordmark too, leaving only the mark — for the collapsed
   *  desktop sidebar, which is narrower than the word "ExamCollect". The
   *  link keeps its accessible name from the sr-only text below. */
  iconOnly?: boolean;
  className?: string;
}

/**
 * The product signature: a clipboard-check mark in the one place the two
 * brand colours meet (indigo -> teal), the wordmark, and the Vietnamese
 * tagline that says what the system actually does.
 *
 * The gradient lives here and nowhere else. Indigo carries navigation and
 * teal carries actions everywhere else in the app; letting them blend
 * anywhere but the logo would blur that distinction.
 */
export function Brand({ href, compact = false, iconOnly = false, className }: BrandProps) {
  return (
    <Link
      href={href}
      className={cn(
        'group flex items-center gap-3 rounded-lg py-2 transition-colors duration-200 ease-smooth hover:bg-surface-2',
        iconOnly ? 'justify-center px-2' : 'px-3',
        className,
      )}
    >
      <span className="icon-chip h-9 w-9 bg-gradient-to-br from-primary to-accent text-white shadow-sm transition-transform duration-200 ease-smooth group-hover:scale-105">
        <ClipboardCheck className="h-[18px] w-[18px]" aria-hidden="true" />
      </span>
      <span className={cn('flex min-w-0 flex-col leading-tight', iconOnly && 'sr-only')}>
        <span className="truncate text-h3 font-bold text-foreground">ExamCollect</span>
        {!compact && (
          <span className="truncate text-caption font-medium text-muted-foreground">
            Thu bài &amp; Chấm điểm thông minh
          </span>
        )}
      </span>
    </Link>
  );
}
