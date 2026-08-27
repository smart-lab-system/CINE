'use client';

import { useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Route groups don't share layouts with each other in Next.js App Router —
// (dashboard)/layout.tsx's QueryClientProvider only wraps pages under
// (dashboard), so every TanStack Query hook under (exam-live) needs its own
// provider here, or every query/mutation hook in this section throws at
// runtime for having no QueryClientProvider ancestor.
//
// One QueryClient per browser session, built lazily in state — never at
// module scope. This file is a Client Component but Next still renders it
// on the server, where a module-scope instance would be a single cache
// shared by every concurrent request (same reasoning as
// (dashboard)/layout.tsx).
//
// No header/logout UI here on purpose — (exam-live) is a distinct section
// of the app (the projector-facing "create session" / lobby flow), not part
// of the admin dashboard chrome.
export default function ExamLiveLayout({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
