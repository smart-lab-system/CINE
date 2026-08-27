import { cn } from '@/lib/utils';

// Pure CSS `animate-pulse` (Tailwind built-in, no JS) — replaces bare
// "Đang tải…" text with a shape that previews the content's layout.
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('animate-pulse rounded-md bg-muted', className)} {...props} />;
}

export { Skeleton };
