import Link from 'next/link';
import { ClipboardCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BrandProps {
  href: string;
  /** Drops the tagline — for the mobile sheet header, where the row is
   *  tight and the tagline would wrap. */
  compact?: boolean;
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
export function Brand({ href, compact = false, className }: BrandProps) {
  return (
    <Link
      href={href}
      className={cn(
        'group flex items-center gap-3 rounded-lg px-3 py-2 transition-colors duration-200 ease-smooth hover:bg-surface-2',
        className,
      )}
    >
      <span className="icon-chip h-9 w-9 bg-gradient-to-br from-primary to-accent text-white shadow-sm transition-transform duration-200 ease-smooth group-hover:scale-105">
        <ClipboardCheck className="h-[18px] w-[18px]" aria-hidden="true" />
      </span>
      <span className="flex min-w-0 flex-col leading-tight">
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
