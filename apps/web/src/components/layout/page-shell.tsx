import type { ReactNode } from 'react';

/** Consistent content width/padding inside the dashboard main area. */
export function PageShell({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">{children}</div>
  );
}
