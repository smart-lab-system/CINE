'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import type { NavItem } from '@/lib/nav-config';

interface SidebarNavProps {
  items: NavItem[];
  onNavigate?: () => void;
}

/**
 * The nav item list itself, shared between the persistent desktop sidebar
 * and the mobile Sheet (see app-shell.tsx) — same markup, two containers.
 */
export function SidebarNav({ items, onNavigate }: SidebarNavProps) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1 p-3" aria-label="Điều hướng chính">
      {items.map((item) => {
        // Dashboard's own href would otherwise prefix-match every other
        // route under the same role root (e.g. "/teacher" prefixes
        // "/teacher/exam-sessions") — exact match only for it, prefix match
        // for the rest so a detail route (e.g. "/teacher/exam-sessions/new")
        // still highlights its parent nav item.
        const isActive =
          pathname === item.href ||
          (item.href.split('/').length > 2 && pathname.startsWith(`${item.href}/`));
        const Icon = item.icon;

        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
              isActive
                ? 'bg-accent-subtle text-accent'
                : 'text-muted-foreground hover:bg-secondary hover:text-secondary-foreground',
            )}
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
