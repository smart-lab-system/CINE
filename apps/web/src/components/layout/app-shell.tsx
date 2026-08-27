'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { Menu } from 'lucide-react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Toaster } from '@/components/ui/sonner';
import { LogoutButton } from '@/components/layout/logout-button';
import { SidebarNav } from '@/components/layout/sidebar-nav';
import { useCurrentAccount } from '@/hooks/useCurrentAccount';
import { ADMIN_NAV, TEACHER_NAV } from '@/lib/nav-config';

const ROLE_LABEL: Record<string, string> = {
  admin: 'Admin',
  super_admin: 'Super Admin',
  department_admin: 'Admin khoa',
  teacher: 'Giáo viên',
};

interface AppShellProps {
  role: 'admin' | 'teacher';
  children: ReactNode;
}

/**
 * Shared chrome for every page under /admin/* and /teacher/* — sidebar +
 * topbar + the per-session providers pages underneath need (QueryClient,
 * toast host). admin/layout.tsx and teacher/layout.tsx are each a one-line
 * `<AppShell role="...">`.
 *
 * Nav config (ADMIN_NAV/TEACHER_NAV, which carries Lucide icon *component*
 * values) is resolved HERE, inside the Client Component, from a plain
 * `role` string prop — not passed in as a `nav` prop from the Server
 * Component layouts. React Server Components can only pass serializable
 * values across the server→client boundary; a component reference (a
 * function) in props throws at build/render time ("Functions cannot be
 * passed directly to Client Components").
 */
export function AppShell({ role, children }: AppShellProps) {
  const nav = role === 'admin' ? ADMIN_NAV : TEACHER_NAV;
  const homeHref = role === 'admin' ? '/admin/dashboard' : '/teacher/dashboard';
  // Lazily-constructed, one per browser session — never at module scope.
  // This file is a Client Component but Next still renders it on the
  // server, where a module-scope instance would be a single cache shared
  // by every concurrent request (same reasoning the old per-route-group
  // layouts already documented).
  const [queryClient] = useState(() => new QueryClient());
  const account = useCurrentAccount();

  return (
    <QueryClientProvider client={queryClient}>
      <div className="flex min-h-screen">
        <aside className="sticky top-0 hidden h-screen w-64 shrink-0 border-r bg-background md:flex md:flex-col">
          <Link href={homeHref} className="flex items-center gap-2 px-4 py-4">
            <span className="font-display text-lg font-bold text-primary">ExamCollect</span>
          </Link>
          <div className="flex-1 overflow-y-auto">
            <SidebarNav items={nav} />
          </div>
        </aside>

        <div className="flex min-h-screen flex-1 flex-col">
          <header className="sticky top-0 z-40 flex items-center justify-between gap-4 border-b bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/75 md:px-8">
            <div className="flex items-center gap-2 md:hidden">
              <Sheet>
                <SheetTrigger asChild>
                  <Button type="button" variant="outline" size="sm" aria-label="Mở menu điều hướng">
                    <Menu className="h-4 w-4" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-64 p-0">
                  <SheetHeader className="px-4 py-4">
                    <SheetTitle>ExamCollect</SheetTitle>
                  </SheetHeader>
                  <SidebarNav items={nav} />
                </SheetContent>
              </Sheet>
            </div>

            <div className="flex-1" />

            <div className="flex items-center gap-3">
              {account && (
                <div className="hidden flex-col items-end leading-tight sm:flex">
                  <span className="text-sm font-medium">{account.name || account.email}</span>
                  <Badge variant="accent" className="mt-0.5">
                    {ROLE_LABEL[account.role] ?? account.role}
                  </Badge>
                </div>
              )}
              <LogoutButton />
            </div>
          </header>

          <main className="flex-1 p-4 md:p-8">{children}</main>
        </div>
      </div>
      <Toaster />
    </QueryClientProvider>
  );
}
