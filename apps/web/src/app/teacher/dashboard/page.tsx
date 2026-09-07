'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { CalendarClock, Inbox, Plus } from 'lucide-react';
import { useExamSessions } from '@/hooks/useExamSession';
import { useSessionOverview } from '@/hooks/useSubmissionOverview';
import { useSemesterFilter } from '@/hooks/useSemesterFilter';
import { getAttentionReasons } from '@/lib/submission-attention';
import { PageHeader } from '@/components/layout/page-header';
import { StatCard } from '@/components/layout/stat-card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

// "Bài chờ chấm" needs the submission/grading modules, which are entirely
// out of this rebuild's scope — stays a placeholder (see the design spec's
// out-of-scope section).
export default function TeacherDashboardPage() {
  // pageSize: 1 — only `total` is read here; the list itself is what
  // /teacher/exam-sessions renders.
  const { data, isLoading, isError } = useExamSessions({ page: 1, pageSize: 1 });

  // Không tham số = mọi kỳ. Cần đúng thế: thứ đang tìm là việc của kỳ KHÁC.
  const overview = useSessionOverview();
  const { current } = useSemesterFilter('teacher-dashboard');
  const now = Date.now();

  /**
   * Kỳ ĐÃ QUA gần nhất còn phiên cần chú ý.
   *
   * Đây là cái giá của thiết kế "học kỳ là ống kính": đúng ngày Phòng Đào tạo
   * chuyển cờ, phiên chưa xử lý của kỳ cũ rời khỏi tầm nhìn mặc định của mọi
   * màn hình, và không có bước nào bắt người ta nhìn vào nó trước khi nó biến
   * mất. Một dòng ở đây là lưới an toàn rẻ nhất có thể — một con số đếm thêm,
   * không có máy trạng thái nào mới.
   *
   * Chỉ MỘT kỳ, chỉ MỘT dòng: đây là lời nhắc, không phải bảng thứ hai. Lấy kỳ
   * có phiên mới nhất — kỳ vừa xong là kỳ giảng viên còn nhớ và còn xử lý được.
   */
  const pending = useMemo(() => {
    const stale = (overview.data ?? []).filter(
      (session) =>
        session.semesterId !== current?.id &&
        getAttentionReasons(session, now).length > 0,
    );
    if (stale.length === 0) {
      return null;
    }

    const bySemester = new Map<
      string,
      { semesterId: string; semesterName: string; count: number; newest: number }
    >();
    for (const session of stale) {
      const startedAt = new Date(session.startTime).getTime();
      const found = bySemester.get(session.semesterId);
      if (found) {
        found.count += 1;
        found.newest = Math.max(found.newest, startedAt);
      } else {
        bySemester.set(session.semesterId, {
          semesterId: session.semesterId,
          semesterName: session.semesterName,
          count: 1,
          newest: startedAt,
        });
      }
    }
    return [...bySemester.values()].sort((a, b) => b.newest - a.newest)[0];
  }, [overview.data, current?.id, now]);

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

      {pending && (
        <Alert>
          <AlertDescription>
            <Link
              href={`/teacher/submissions?semesterId=${pending.semesterId}`}
              className="underline underline-offset-4"
            >
              {pending.semesterName} còn {pending.count} phiên cần chú ý
            </Link>
          </AlertDescription>
        </Alert>
      )}

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
