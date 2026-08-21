'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LogoutButton } from '@/components/layout/logout-button';

const NAV_LINKS = [
  { href: '/accounts', label: 'Tài khoản' },
  { href: '/subjects', label: 'Môn học' },
  { href: '/academic-terms', label: 'Học kỳ' },
  { href: '/lecturers', label: 'Giảng viên' },
  { href: '/students', label: 'Sinh viên' },
  { href: '/course-sections', label: 'Lớp học phần' },
] as const;

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
        <nav className="flex flex-wrap gap-4 border-b bg-muted/40 px-8 py-3 text-sm">
          {NAV_LINKS.map((link) => (
            <Link key={link.href} href={link.href} className="hover:underline">
              {link.label}
            </Link>
          ))}
        </nav>
        {children}
      </div>
    </QueryClientProvider>
  );
}
