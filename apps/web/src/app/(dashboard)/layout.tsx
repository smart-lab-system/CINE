'use client';

import { useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DashboardShell } from '@/components/layout/dashboard-shell';

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
      <DashboardShell>{children}</DashboardShell>
    </QueryClientProvider>
  );
}
