'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { AppSidebar } from '@/components/layout/app-sidebar';
import { LogoutButton } from '@/components/layout/logout-button';
import { Button } from '@/components/ui/button';

export const SIDEBAR_HIDDEN_KEY = 'cine.sidebar-hidden';

function isMobileViewport() {
  return Boolean(window.matchMedia?.('(max-width: 767px)')?.matches);
}

export function DashboardShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [hidden, setHidden] = useState(false);
  const pathRef = useRef(pathname);

  useEffect(() => {
    try {
      setHidden(localStorage.getItem(SIDEBAR_HIDDEN_KEY) === '1');
    } catch {
      // Private mode / blocked storage: keep the default open sidebar.
    }
  }, []);

  function persistHidden(next: boolean) {
    setHidden(next);
    try {
      localStorage.setItem(SIDEBAR_HIDDEN_KEY, next ? '1' : '0');
    } catch {
      // Ignore quota / privacy errors; the in-memory toggle still works.
    }
  }

  useEffect(() => {
    if (pathRef.current === pathname) return;
    pathRef.current = pathname;
    if (!hidden && isMobileViewport()) persistHidden(true);
  }, [pathname, hidden]);

  useEffect(() => {
    if (hidden) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') persistHidden(true);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [hidden]);

  return (
    <div className="flex min-h-screen">
      {hidden ? null : (
        <>
          <button
            type="button"
            className="fixed inset-0 z-30 bg-black/40 md:hidden"
            aria-label="Đóng thanh điều hướng"
            onClick={() => persistHidden(true)}
          />
          <AppSidebar onHide={() => persistHidden(true)} />
        </>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        {hidden ? (
          <header className="flex items-center justify-between gap-3 border-b px-4 py-2">
            <div className="flex min-w-0 items-center gap-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0"
                onClick={() => persistHidden(false)}
                aria-expanded={false}
                aria-controls="app-sidebar"
              >
                <SidebarExpandIcon />
                Hiện menu
              </Button>
              <span className="hidden truncate text-sm font-semibold sm:inline">
                Quản lý kiểm tra trên phòng máy
              </span>
            </div>
            <LogoutButton />
          </header>
        ) : null}
        <main className="flex-1 overflow-auto p-6 md:p-8">{children}</main>
      </div>
    </div>
  );
}

function SidebarExpandIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="mr-1.5"
    >
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <path d="M9 3v18" />
      <path d="m14 9 3 3-3 3" />
    </svg>
  );
}
