import { Users, Bot, Wallet } from 'lucide-react';
import { StatCard } from '@/components/layout/stat-card';

// Phase 0 stub: real layout, real route (so login's role redirect has
// somewhere to land and middleware's role gate is smoke-testable), but the
// stat values are static placeholders — wiring them to real counts
// (accounts, active sessions) is Phase 1's job, per the design spec's
// phasing section. AI cost stays "—" beyond that until the cost module
// exists.
export default function AdminDashboardPage() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <h1 className="font-display text-2xl font-bold">Dashboard</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard icon={Users} label="Tổng số tài khoản" value="—" />
        <StatCard icon={Bot} label="Phiên thi đang diễn ra" value="—" variant="info" />
        <StatCard icon={Wallet} label="Chi phí AI tháng này" value="—" variant="warning" />
      </div>
    </div>
  );
}
