'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

export function LabSubnav({ labId }: { labId: string }) {
  const pathname = usePathname();
  const items: { href: string; label: string; exact?: boolean }[] = [
    { href: `/labs/${labId}`, label: 'Tổng quan', exact: true },
    { href: `/labs/${labId}/workstations`, label: 'Máy trạm' },
    { href: `/labs/${labId}/layouts`, label: 'Sơ đồ chỗ ngồi' },
  ];

  return (
    <nav className="flex flex-wrap gap-1 border-b pb-3">
      {items.map((item) => {
        const active = item.exact
          ? pathname === item.href
          : pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'rounded-md px-3 py-1.5 text-sm transition-colors',
              active
                ? 'bg-secondary font-medium text-secondary-foreground'
                : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground',
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
