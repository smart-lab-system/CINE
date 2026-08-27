import type { ReactNode } from 'react';
import { AppShell } from '@/components/layout/app-shell';

export default function TeacherLayout({ children }: { children: ReactNode }) {
  return <AppShell role="teacher">{children}</AppShell>;
}
