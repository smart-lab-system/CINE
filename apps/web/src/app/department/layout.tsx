import type { ReactNode } from 'react';
import { AppShell } from '@/components/layout/app-shell';

export default function DepartmentLayout({ children }: { children: ReactNode }) {
  return <AppShell role="department">{children}</AppShell>;
}
