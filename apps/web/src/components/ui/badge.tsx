import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/**
 * Every variant is a tinted pill: light `-subtle` ground, saturated
 * `-strong` text. A table of solid pills reads as a table of alarms — the
 * colour should classify the row, not shout at it.
 *
 * `-strong` (not the base hue) as the text colour is what makes these
 * legible: teal #26A69A on a teal tint is 2.6:1, which is unreadable; the
 * darker same-hue `-strong` gets the same pill to 5.1:1. See globals.css.
 *
 * Colour is never the only signal — each badge carries its own label, so a
 * red/green distinction is still readable to someone who can't tell them
 * apart.
 */
const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-caption font-semibold transition-colors',
  {
    variants: {
      variant: {
        default: 'border-border bg-surface-2 text-muted-foreground',
        primary: 'border-transparent bg-primary-subtle text-primary',
        accent: 'border-transparent bg-accent-subtle text-accent-strong',
        success: 'border-transparent bg-success-subtle text-success-strong',
        warning: 'border-transparent bg-warning-subtle text-warning-strong',
        info: 'border-transparent bg-info-subtle text-info-strong',
        destructive: 'border-transparent bg-danger-subtle text-danger-strong',
        outline: 'border-border text-foreground',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
