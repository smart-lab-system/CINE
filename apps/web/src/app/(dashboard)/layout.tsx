'use client';

import { useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LogoutButton } from '@/components/layout/logout-button';

export default function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  // One QueryClient per browser session, built lazily in state — never at
  // module scope. This file is a Client Component but Next still renders it
  // on the server, where a module-scope instance would be a single cache
  // shared by every concurrent request.
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <div className="flex min-h-screen flex-col">
        <header className="flex items-center justify-between border-b px-8 py-4">
          <span className="font-semibold">Quản lý phòng máy</span>
          <LogoutButton />
        </header>
        {children}
      </div>
    </QueryClientProvider>
  );
}
