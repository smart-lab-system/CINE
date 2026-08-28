'use client';

import { useState, type ReactNode } from 'react';
import { Menu } from 'lucide-react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Toaster } from '@/components/ui/sonner';
import { Brand } from '@/components/layout/brand';
import { LogoutButton } from '@/components/layout/logout-button';
import { SidebarNav } from '@/components/layout/sidebar-nav';
import { UserChip } from '@/components/layout/user-chip';
import { PageTransition } from '@/components/motion/page-transition';
import { useCurrentAccount } from '@/hooks/useCurrentAccount';
import { ADMIN_NAV, TEACHER_NAV } from '@/lib/nav-config';

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
  const navLabel = role === 'admin' ? 'Quản trị' : 'Giảng dạy';
  // Lazily-constructed, one per browser session — never at module scope.
  // This file is a Client Component but Next still renders it on the
  // server, where a module-scope instance would be a single cache shared
  // by every concurrent request.
  const [queryClient] = useState(() => new QueryClient());
  const account = useCurrentAccount();
  // admin/layout.tsx and teacher/layout.tsx stay mounted across child-page
  // navigations (that's how App Router layouts work), so without this the
  // mobile Sheet would stay open after tapping a nav link — the user would
  // have to close it by hand every time.
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <QueryClientProvider client={queryClient}>
      {/* app-wash puts two very soft brand-coloured blooms behind the
          content area. The sidebar and topbar sit on opaque --surface, so
          the wash only ever shows up under the page body, where nothing
          competes with it. */}
      <div className="app-wash flex min-h-screen bg-background">
        <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-border bg-surface md:flex">
          <div className="px-3 py-4">
            <Brand href={homeHref} />
          </div>
          <div className="mx-3 border-t border-border" />
          <div className="flex-1 overflow-y-auto py-2">
            <SidebarNav items={nav} label={navLabel} />
          </div>
        </aside>

        <div className="flex min-h-screen min-w-0 flex-1 flex-col">
          {/* Fixed 64px height so the topbar never reflows when the user
              chip loads in (the account is read from a cookie in an
              effect, so it arrives one tick after first paint). */}
          <header className="sticky top-0 z-40 flex h-16 shrink-0 items-center justify-between gap-4 border-b border-border bg-surface/85 px-4 backdrop-blur-md md:px-8">
            <div className="flex items-center gap-2 md:hidden">
              <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
                <SheetTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label="Mở menu điều hướng"
                  >
                    <Menu className="h-4 w-4" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-72 p-0">
                  <SheetHeader className="px-3 py-4">
                    <SheetTitle className="sr-only">Điều hướng</SheetTitle>
                    <Brand href={homeHref} compact />
                  </SheetHeader>
                  <div className="border-t border-border" />
                  <SidebarNav
                    items={nav}
                    label={navLabel}
                    onNavigate={() => setMobileNavOpen(false)}
                  />
                </SheetContent>
              </Sheet>
            </div>

            <div className="flex-1" />

            <div className="flex items-center gap-2 md:gap-4">
              {account && <UserChip account={account} />}
              <div className="h-6 w-px bg-border" aria-hidden="true" />
              <LogoutButton />
            </div>
          </header>

          <main className="flex-1 px-4 py-6 md:px-8 md:py-8">
            <PageTransition className="mx-auto w-full max-w-6xl">{children}</PageTransition>
          </main>
        </div>
      </div>
      <Toaster />
    </QueryClientProvider>
  );
}
