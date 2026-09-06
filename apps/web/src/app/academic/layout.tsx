import type { ReactNode } from 'react';
import { AppShell } from '@/components/layout/app-shell';

export default function AcademicLayout({ children }: { children: ReactNode }) {
  return <AppShell role="academic">{children}</AppShell>;
}
