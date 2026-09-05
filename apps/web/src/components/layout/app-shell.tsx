'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { Menu, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
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
import { ADMIN_NAV, DEPARTMENT_NAV, TEACHER_NAV } from '@/lib/nav-config';
import { cn } from '@/lib/utils';

/** Remembers the rail state across navigations and sessions — a teacher who
 *  collapsed it to read a wide submissions table does not want it back at
 *  full width on the next page. */
const NAV_COLLAPSED_KEY = 'examcollect.nav-collapsed';

interface AppShellProps {
  role: 'admin' | 'department' | 'teacher';
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
  // One lookup per area rather than nested ternaries — a fourth area is a
  // row here, not another branch to get wrong.
  const AREA = {
    admin: { nav: ADMIN_NAV, home: '/admin/dashboard', label: 'Quản trị' },
    department: { nav: DEPARTMENT_NAV, home: '/department/dashboard', label: 'Khoa' },
    teacher: { nav: TEACHER_NAV, home: '/teacher/dashboard', label: 'Giảng dạy' },
  } as const;
  const { nav, home: homeHref, label: navLabel } = AREA[role];
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

  // Always starts expanded, then corrects itself after mount. Reading
  // localStorage during render would make the server HTML and the first
  // client render disagree for anyone who had collapsed it — a hydration
  // mismatch, which React resolves by throwing the server markup away.
  const [navCollapsed, setNavCollapsed] = useState(false);

  useEffect(() => {
    try {
      setNavCollapsed(window.localStorage.getItem(NAV_COLLAPSED_KEY) === '1');
    } catch {
      // Storage can throw outright (Safari private mode, blocked cookies).
      // The rail is a convenience, so a failure here just means "expanded".
    }
  }, []);

  function toggleNav() {
    const next = !navCollapsed;
    setNavCollapsed(next);
    try {
      window.localStorage.setItem(NAV_COLLAPSED_KEY, next ? '1' : '0');
    } catch {
      // Not persisting is survivable; the toggle still works this session.
    }
  }

  return (
    <QueryClientProvider client={queryClient}>
      {/* app-wash puts two very soft brand-coloured blooms behind the
          content area. The sidebar and topbar sit on opaque --surface, so
          the wash only ever shows up under the page body, where nothing
          competes with it. */}
      <div className="app-wash flex min-h-screen bg-background">
        {/* Desktop only. The mobile nav is already a Sheet that closes
            itself, so there is nothing there to collapse. */}
        <aside
          className={cn(
            'sticky top-0 hidden h-screen shrink-0 flex-col border-r border-border bg-surface md:flex',
            'transition-[width] duration-200 ease-smooth',
            navCollapsed ? 'w-[4.5rem]' : 'w-64',
          )}
        >
          <div
            className={cn(
              'flex py-4',
              navCollapsed ? 'flex-col items-center gap-2 px-2' : 'items-center gap-1 px-3',
            )}
          >
            <Brand
              href={homeHref}
              compact={navCollapsed}
              iconOnly={navCollapsed}
              className={navCollapsed ? undefined : 'min-w-0 flex-1'}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={toggleNav}
              aria-expanded={!navCollapsed}
              aria-controls="app-sidebar-nav"
              aria-label={navCollapsed ? 'Mở rộng thanh điều hướng' : 'Thu gọn thanh điều hướng'}
              title={navCollapsed ? 'Mở rộng thanh điều hướng' : 'Thu gọn thanh điều hướng'}
              className="shrink-0"
            >
              {navCollapsed ? (
                <PanelLeftOpen className="h-4 w-4" aria-hidden="true" />
              ) : (
                <PanelLeftClose className="h-4 w-4" aria-hidden="true" />
              )}
            </Button>
          </div>
          <div className={cn('border-t border-border', navCollapsed ? 'mx-2' : 'mx-3')} />
          <div id="app-sidebar-nav" className="flex-1 overflow-y-auto py-2">
            <SidebarNav items={nav} label={navLabel} collapsed={navCollapsed} />
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
            <PageTransition className="w-full">{children}</PageTransition>
          </main>
        </div>
      </div>
      <Toaster />
    </QueryClientProvider>
  );
}
