import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/**
 * Tinted ground + matching left border + `-strong` text. The `-strong`
 * step (not the base hue) is what makes the text legible on its own tint:
 * see the contrast table in globals.css.
 */
const alertVariants = cva(
  'relative w-full rounded-lg border border-l-[3px] px-4 py-3 text-body [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-3.5 [&>svg]:h-[18px] [&>svg]:w-[18px] [&:has(svg)]:pl-12',
  {
    variants: {
      variant: {
        default: 'border-border bg-surface text-foreground',
        destructive:
          'border-danger/30 border-l-danger bg-danger-subtle text-danger-strong [&>svg]:text-danger',
        warning:
          'border-warning/40 border-l-warning bg-warning-subtle text-warning-strong [&>svg]:text-warning',
        success:
          'border-success/30 border-l-success bg-success-subtle text-success-strong [&>svg]:text-success',
        info: 'border-info/30 border-l-info bg-info-subtle text-info-strong [&>svg]:text-info',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

const Alert = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof alertVariants>
>(({ className, variant, ...props }, ref) => (
  <div ref={ref} role="alert" className={cn(alertVariants({ variant }), className)} {...props} />
));
Alert.displayName = 'Alert';

const AlertTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h5 ref={ref} className={cn('mb-1 text-h3 leading-none', className)} {...props} />
  ),
);
AlertTitle.displayName = 'AlertTitle';

const AlertDescription = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('text-body [&_p]:leading-relaxed', className)} {...props} />
));
AlertDescription.displayName = 'AlertDescription';

export { Alert, AlertTitle, AlertDescription };
