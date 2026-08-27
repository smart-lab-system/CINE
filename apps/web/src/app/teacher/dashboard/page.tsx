'use client';

import { CalendarClock, Inbox } from 'lucide-react';
import { useExamSessions } from '@/hooks/useExamSession';
import { StatCard } from '@/components/layout/stat-card';

// "Bài chờ chấm" needs the submission/grading modules, which are entirely
// out of this rebuild's scope — stays a placeholder (see the design spec's
// out-of-scope section).
export default function TeacherDashboardPage() {
  // pageSize: 1 — only `total` is read here; the list itself is what
  // /teacher/exam-sessions renders.
  const { data, isLoading } = useExamSessions({ page: 1, pageSize: 1 });

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <h1 className="font-display text-2xl font-bold">Dashboard</h1>
      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard
          icon={CalendarClock}
          label="Phiên thi đã tạo"
          value={isLoading ? null : (data?.total ?? '—')}
          variant="info"
        />
        <StatCard icon={Inbox} label="Bài chờ chấm" value="—" variant="warning" />
      </div>
    </div>
  );
}
