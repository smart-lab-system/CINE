import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { LoaderCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Teal is the action colour, indigo is the brand colour — so `default`
 * (the primary action on any screen: Tạo phiên thi, Lưu, Đăng nhập) is
 * teal, and `primary` is the rarer indigo button for brand-weighted
 * actions. There is deliberately no black/slate fill: a neutral button
 * gives the eye nothing to follow, which is exactly what the pre-redesign
 * screens suffered from.
 *
 * The fill is `accent-strong`, not `accent`. Same hue and saturation, 9
 * points darker — that's what a 14px white label needs to clear WCAG AA
 * (4.79:1 vs 3.0:1). See the contrast table in globals.css.
 *
 * No focus-visible ring classes here: globals.css puts one teal ring on
 * every focusable element in the app, so components don't each re-declare
 * (and quietly diverge on) their own.
 */
const buttonVariants = cva(
  'relative inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-body font-medium transition-[background-color,box-shadow,transform,color] duration-200 ease-smooth disabled:pointer-events-none disabled:opacity-55 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default:
          'bg-accent-strong text-accent-foreground shadow-sm hover:bg-accent-stronger hover:shadow-md active:translate-y-px',
        primary:
          'bg-primary text-primary-foreground shadow-sm hover:bg-primary-strong hover:shadow-md active:translate-y-px',
        outline:
          'border border-border bg-surface text-foreground shadow-sm hover:border-border hover:bg-surface-2 active:translate-y-px',
        ghost: 'text-muted-foreground hover:bg-surface-2 hover:text-foreground',
        destructive:
          'bg-destructive text-destructive-foreground shadow-sm hover:bg-danger-strong hover:shadow-md active:translate-y-px',
        link: 'text-accent-strong underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-8 rounded-sm px-3 text-small',
        lg: 'h-11 px-6',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  /**
   * Shows an inline spinner and blocks further clicks. Kept as a prop
   * rather than left to each caller so every submit in the app fails/waits
   * the same way — a form that swaps its label to "Đang lưu…" and one that
   * shows a spinner are two different products to the person using them.
   */
  loading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading = false, children, disabled, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';

    // `asChild` renders into a Slot, which accepts exactly one child — so
    // the spinner is only injected for a real <button>. A caller using
    // asChild (e.g. a Link styled as a button) is navigating, not
    // submitting, and has nothing to wait for.
    if (asChild) {
      return (
        <Comp
          className={cn(buttonVariants({ variant, size, className }))}
          ref={ref}
          {...props}
        >
          {children}
        </Comp>
      );
    }

    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {loading && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />}
        {children}
      </button>
    );
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
