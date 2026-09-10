import * as React from 'react';
import { cn } from '@/lib/utils';

export interface TableProps extends React.HTMLAttributes<HTMLTableElement> {
  /**
   * Props for the wrapper div — the one element that can cap this table's
   * height, because it is the only one that is actually a scrollport.
   *
   * `overflow-x: auto` here already makes `overflow-y` compute to `auto`
   * too (per CSS Overflow, `visible` becomes `auto` when the other axis
   * is not `visible`), so this div is the nearest scrollport for anything
   * inside it — including a `sticky` `<thead>`. With `height: auto` it can
   * never scroll, which is why a cap placed on some div *outside* this one
   * makes a sticky header silently scroll away instead of sticking: the
   * header resolves against this div, not the one that scrolls.
   *
   * Pass the cap, and the role/aria-label/tabIndex a scrollable box needs
   * to be reachable without a mouse, through here. Callers that don't need
   * a vertical cap pass nothing and get the plain horizontal scroller.
   *
   * `children` and `dangerouslySetInnerHTML` are excluded because this
   * div's child is the table — React throws outright if both are set.
   */
  container?: Omit<
    React.HTMLAttributes<HTMLDivElement>,
    'children' | 'dangerouslySetInnerHTML'
  >;
}

/**
 * The wrapper scrolls horizontally on its own so a wide table (the exam
 * session list has eight columns) never forces the whole page sideways on
 * a laptop screen. It scrolls vertically too when a caller caps it — see
 * `container` above.
 */
const Table = React.forwardRef<HTMLTableElement, TableProps>(
  ({ className, container, ...props }, ref) => (
    <div {...container} className={cn('w-full overflow-x-auto', container?.className)}>
      <table
        ref={ref}
        className={cn('w-full caption-bottom border-collapse text-body', className)}
        {...props}
      />
    </div>
  ),
);
Table.displayName = 'Table';

// Tinted header band + small-caps labels: the eye can find where the data
// starts without a heavy rule under every row.
const TableHeader = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <thead ref={ref} className={cn('bg-surface-2 [&_tr]:border-b [&_tr]:border-border', className)} {...props} />
));
TableHeader.displayName = 'TableHeader';

const TableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tbody ref={ref} className={cn('[&_tr:last-child]:border-0', className)} {...props} />
));
TableBody.displayName = 'TableBody';

const TableRow = React.forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(
  ({ className, ...props }, ref) => (
    <tr
      ref={ref}
      className={cn(
        'border-b border-border/70 transition-colors duration-150 hover:bg-surface-2/70',
        className,
      )}
      {...props}
    />
  ),
);
TableRow.displayName = 'TableRow';

const TableHead = React.forwardRef<
  HTMLTableCellElement,
  React.ThHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <th
    ref={ref}
    className={cn(
      'h-11 whitespace-nowrap px-4 text-left align-middle text-caption font-semibold uppercase tracking-[0.06em] text-muted-foreground',
      className,
    )}
    {...props}
  />
));
TableHead.displayName = 'TableHead';

const TableCell = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <td ref={ref} className={cn('px-4 py-3 align-middle', className)} {...props} />
));
TableCell.displayName = 'TableCell';

export { Table, TableHeader, TableBody, TableRow, TableHead, TableCell };
