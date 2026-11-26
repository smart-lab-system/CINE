'use client';

import Link from 'next/link';
import { BookOpen, Building2, Puzzle, ScrollText, Users, type LucideIcon } from 'lucide-react';
import { useAccounts } from '@/hooks/useAccounts';
import { PageHeader } from '@/components/layout/page-header';
import { StatCard } from '@/components/layout/stat-card';
import { Button } from '@/components/ui/button';

interface QuickLink {
  href: string;
  label: string;
  hint: string;
  icon: LucideIcon;
}

// Lối tắt tới các khu quản trị. Thẻ số liệu chỉ hiện khi có dữ liệu thật: các
// thẻ "phiên đang diễn ra" và "chi phí AI" đã bỏ vì chưa có API để tính.
const QUICK_LINKS: QuickLink[] = [
  { href: '/admin/accounts', label: 'Tài khoản', hint: 'Cấp và khoá tài khoản giảng viên', icon: Users },
  { href: '/admin/course-sections', label: 'Lớp học phần', hint: 'Phân công giảng viên cho lớp', icon: BookOpen },
  { href: '/admin/master-data/rooms', label: 'Phòng máy', hint: 'Phòng và máy tính trong phòng', icon: Building2 },
  { href: '/admin/ide-utilities', label: 'Tiện ích IDE', hint: 'Duyệt tiện ích cho máy thi', icon: Puzzle },
  { href: '/admin/audit-log', label: 'Nhật ký', hint: 'Lịch sử thay đổi của hệ thống', icon: ScrollText },
];

export default function AdminDashboardPage() {
  // pageSize: 1 - the list body is never read, only `total`; asking the
  // server for a single row is cheap where a real count endpoint doesn't
  // exist yet.
  const { data, isLoading, isError } = useAccounts({ page: 1, pageSize: 1 });

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Dashboard"
        description="Tổng quan hệ thống ExamCollect: tài khoản và các khu quản trị."
        actions={
          <Button asChild>
            <Link href="/admin/accounts">
              <Users className="h-4 w-4" aria-hidden="true" />
              Quản lý tài khoản
            </Link>
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          icon={Users}
          label="Tổng số tài khoản"
          value={isLoading ? null : (data?.total ?? '-')}
          variant="primary"
          hint="Gồm cả quản trị viên và giảng viên"
          isError={isError}
        />
      </div>

      <section aria-labelledby="admin-quick-links-title" className="flex flex-col gap-3">
        <h2 id="admin-quick-links-title" className="section-label">
          Khu quản trị
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {QUICK_LINKS.map(({ href, label, hint, icon: Icon }) => (
            <li key={href}>
              <Link
                href={href}
                className="card-elevated group flex h-full items-start gap-3 p-4 hover:border-primary/30 focus-visible:outline-none"
              >
                <span className="icon-chip h-10 w-10 bg-primary-subtle text-primary">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-small font-semibold text-foreground group-hover:text-primary">{label}</span>
                  <span className="text-caption text-muted-foreground">{hint}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
