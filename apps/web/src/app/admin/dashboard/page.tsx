'use client';

import { Users, Bot, Wallet } from 'lucide-react';
import { useAccounts } from '@/hooks/useAccounts';
import { StatCard } from '@/components/layout/stat-card';

// Active-session count needs GET /exam-sessions, which doesn't exist until
// Phase 2 — stays "—" until then. AI cost has no backing module in this
// task's scope at all (see design spec's phasing/out-of-scope sections).
export default function AdminDashboardPage() {
  // pageSize: 1 — the list body is never read, only `total`; asking the
  // server for a single row is cheap where a real count endpoint doesn't
  // exist yet.
  const { data, isLoading } = useAccounts({ page: 1, pageSize: 1 });

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <h1 className="font-display text-2xl font-bold">Dashboard</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          icon={Users}
          label="Tổng số tài khoản"
          value={isLoading ? null : (data?.total ?? '—')}
        />
        <StatCard icon={Bot} label="Phiên thi đang diễn ra" value="—" variant="info" />
        <StatCard icon={Wallet} label="Chi phí AI tháng này" value="—" variant="warning" />
      </div>
    </div>
  );
}
