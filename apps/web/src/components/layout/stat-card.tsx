import type { LucideIcon } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

interface StatCardProps {
  icon: LucideIcon;
  label: string;
  value: string | number | null;
  variant?: 'accent' | 'success' | 'warning' | 'info';
}

const VARIANT_CLASSES: Record<NonNullable<StatCardProps['variant']>, string> = {
  accent: 'bg-accent-subtle text-accent',
  success: 'bg-success-subtle text-success',
  warning: 'bg-warning-subtle text-warning',
  info: 'bg-info-subtle text-info',
};

/**
 * Dashboard stat tile. `value === null` renders a loading skeleton (a
 * fetch in flight); `value === undefined` isn't a valid state — callers
 * pass a literal placeholder string (e.g. "—") for "no data source yet",
 * so a genuinely-loading card is never mistaken for one with nothing to
 * show.
 */
export function StatCard({ icon: Icon, label, value, variant = 'accent' }: StatCardProps) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-6">
        <div
          className={cn(
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-full',
            VARIANT_CLASSES[variant],
          )}
        >
          <Icon className="h-5 w-5" aria-hidden="true" />
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-sm text-muted-foreground">{label}</span>
          {value === null ? (
            <Skeleton className="h-7 w-16" />
          ) : (
            <span className="font-display text-2xl font-bold">{value}</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
