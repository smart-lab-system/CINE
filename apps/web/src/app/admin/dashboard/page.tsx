'use client';

import Link from 'next/link';
import { Users, Bot, Wallet } from 'lucide-react';
import { useAccounts } from '@/hooks/useAccounts';
import { PageHeader } from '@/components/layout/page-header';
import { StatCard } from '@/components/layout/stat-card';
import { Button } from '@/components/ui/button';

// Active-session count needs GET /exam-sessions, which doesn't exist until
// Phase 2 — stays "—" until then. AI cost has no backing module in this
// task's scope at all (see design spec's phasing/out-of-scope sections).
// The `hint` under each placeholder says which of the two it is, so an
// empty tile reads as "not built yet", not "nothing happened today".
export default function AdminDashboardPage() {
  // pageSize: 1 — the list body is never read, only `total`; asking the
  // server for a single row is cheap where a real count endpoint doesn't
  // exist yet.
  const { data, isLoading, isError } = useAccounts({ page: 1, pageSize: 1 });

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Dashboard"
        description="Tổng quan hệ thống ExamCollect — tài khoản, phiên thi và chi phí AI."
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
          value={isLoading ? null : (data?.total ?? '—')}
          variant="primary"
          hint="Gồm cả quản trị viên và giảng viên"
          isError={isError}
        />
        <StatCard
          icon={Bot}
          label="Phiên thi đang diễn ra"
          value="—"
          variant="info"
          hint="Cần API thống kê phiên thi toàn hệ thống"
        />
        <StatCard
          icon={Wallet}
          label="Chi phí AI tháng này"
          value="—"
          variant="warning"
          hint="Có khi module theo dõi chi phí hoàn thiện"
        />
      </div>
    </div>
  );
}
