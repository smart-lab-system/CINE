import { CalendarClock, Inbox } from 'lucide-react';
import { StatCard } from '@/components/layout/stat-card';

// Phase 0 stub — see admin/dashboard/page.tsx's comment; real counts land
// in Phase 2 once GET /exam-sessions exists.
export default function TeacherDashboardPage() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <h1 className="font-display text-2xl font-bold">Dashboard</h1>
      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard icon={CalendarClock} label="Phiên thi sắp tới/đang diễn ra" value="—" variant="info" />
        <StatCard icon={Inbox} label="Bài chờ chấm" value="—" variant="warning" />
      </div>
    </div>
  );
}
