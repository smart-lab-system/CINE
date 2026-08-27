'use client';

import { useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Route groups/segments don't share layouts with each other in Next.js App
// Router — admin/layout.tsx and teacher/layout.tsx's AppShell (which
// supplies its own QueryClientProvider) only wraps pages under /admin and
// /teacher, so every TanStack Query hook under (exam-live) needs its own
// provider here, or every query/mutation hook in this section throws at
// runtime for having no QueryClientProvider ancestor.
//
// One QueryClient per browser session, built lazily in state — never at
// module scope. This file is a Client Component but Next still renders it
// on the server, where a module-scope instance would be a single cache
// shared by every concurrent request (same reasoning as AppShell).
//
// No header/logout UI here on purpose — (exam-live) is a distinct section
// of the app (the projector-facing real-time lobby, /exam-sessions/[id]),
// not part of the admin/teacher dashboard chrome. It stays chrome-less by
// design — see the frontend rebuild design spec.
export default function ExamLiveLayout({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
