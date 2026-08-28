'use client';

import Link from 'next/link';
import { CalendarClock, Inbox, Plus } from 'lucide-react';
import { useExamSessions } from '@/hooks/useExamSession';
import { PageHeader } from '@/components/layout/page-header';
import { StatCard } from '@/components/layout/stat-card';
import { Button } from '@/components/ui/button';

// "Bài chờ chấm" needs the submission/grading modules, which are entirely
// out of this rebuild's scope — stays a placeholder (see the design spec's
// out-of-scope section).
export default function TeacherDashboardPage() {
  // pageSize: 1 — only `total` is read here; the list itself is what
  // /teacher/exam-sessions renders.
  const { data, isLoading, isError } = useExamSessions({ page: 1, pageSize: 1 });

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Dashboard"
        description="Tổng quan các phiên thi bạn phụ trách và bài nộp cần xử lý."
        actions={
          <Button asChild>
            <Link href="/teacher/exam-sessions/new">
              <Plus className="h-4 w-4" aria-hidden="true" />
              Tạo phiên thi
            </Link>
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard
          icon={CalendarClock}
          label="Phiên thi đã tạo"
          value={isLoading ? null : (data?.total ?? '—')}
          variant="accent"
          hint="Tổng số phiên thi bạn đã tạo"
          isError={isError}
        />
        <StatCard
          icon={Inbox}
          label="Bài chờ chấm"
          value="—"
          variant="warning"
          hint="Có khi module thu bài và chấm điểm hoàn thiện"
        />
      </div>
    </div>
  );
}
