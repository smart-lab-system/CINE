import { CircleAlert, type LucideIcon } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { CountUp } from '@/components/motion/count-up';
import { cn } from '@/lib/utils';

interface StatCardProps {
  icon: LucideIcon;
  label: string;
  value: string | number | null;
  variant?: 'accent' | 'primary' | 'success' | 'warning' | 'info';
  /**
   * One muted line under the number saying what it counts or why it's
   * empty. Deliberately not a fabricated trend ("+3 so với tuần trước") —
   * there is no historical data behind these numbers yet, and a made-up
   * delta on a dashboard is a number someone will eventually quote in a
   * meeting.
   */
  hint?: string;
  /** The query behind `value` failed — shown distinctly from "—" (no data
   * source wired up yet) so a real outage isn't silently indistinguishable
   * from an intentional placeholder. */
  isError?: boolean;
}

const VARIANT_CLASSES: Record<NonNullable<StatCardProps['variant']>, string> = {
  accent: 'bg-accent-subtle text-accent-strong',
  primary: 'bg-primary-subtle text-primary',
  success: 'bg-success-subtle text-success-strong',
  warning: 'bg-warning-subtle text-warning-strong',
  info: 'bg-info-subtle text-info-strong',
};

/**
 * Dashboard stat tile: small-caps label, an oversized figure, and a tinted
 * icon chip in the corner. The hierarchy is the point — before the
 * redesign every element on this card was the same size and colour, so the
 * number it exists to communicate had to be hunted for.
 *
 * `value === null` renders a loading skeleton (a fetch in flight);
 * `value === undefined` isn't a valid state — callers pass a literal
 * placeholder string (e.g. "—") for "no data source yet", so a genuinely
 * loading card is never mistaken for one with nothing to show.
 *
 * A numeric value counts up on arrival; a string is printed as-is (there's
 * nothing to count towards in "—").
 */
export function StatCard({
  icon: Icon,
  label,
  value,
  variant = 'accent',
  hint,
  isError,
}: StatCardProps) {
  return (
    <Card hoverable data-animate className="flex flex-col gap-4 p-6">
      <div className="flex items-start justify-between gap-4">
        <p className="section-label">{label}</p>
        <span
          className={cn(
            'icon-chip h-10 w-10',
            isError ? 'bg-danger-subtle text-danger-strong' : VARIANT_CLASSES[variant],
          )}
        >
          <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        {value === null ? (
          <Skeleton className="h-9 w-24" />
        ) : isError ? (
          <span className="flex items-center gap-2 text-body font-medium text-danger-strong" role="alert">
            <CircleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
            Không tải được
          </span>
        ) : typeof value === 'number' ? (
          <CountUp value={value} className="text-display text-foreground" />
        ) : (
          <span className="text-display text-muted-foreground">{value}</span>
        )}

        {hint && !isError && <p className="text-small text-muted-foreground">{hint}</p>}
      </div>
    </Card>
  );
}
