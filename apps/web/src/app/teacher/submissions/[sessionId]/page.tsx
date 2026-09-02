'use client';

import { useMemo } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ClipboardCheck, Inbox } from 'lucide-react';
import { useAttendance, useExamSessionDetail, useSubmissions } from '@/hooks/useExamSession';
import { buildSubmissionRows, countFullySubmitted } from '@/lib/submission-rows';
import { getDisplaySessionStatus } from '@/lib/exam-session-display';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { SubmissionStatusTable } from '@/app/(exam-live)/exam-sessions/[id]/_components/SubmissionStatusTable';

/**
 * The post-hoc counterpart to the lobby page: same facts (attendance ∪
 * submissions, via the same shared helper — see lib/submission-rows.ts),
 * no live socket, no access-request/finalize concerns. Reached from
 * "Quản lý bài thu" once its exam-session filter narrows to one session;
 * bridges onward to "Chấm điểm" with that session pre-selected — see
 * docs/superpowers/specs/2026-09-02-submission-session-detail-page-design.md.
 */
export default function SubmissionSessionDetailPage() {
  const params = useParams<{ sessionId: string }>();
  const sessionId = params.sessionId;

  const sessionDetail = useExamSessionDetail(sessionId);
  const attendance = useAttendance(sessionId);
  const submissions = useSubmissions(sessionId);

  const deliverables = useMemo(
    () =>
      (sessionDetail.data?.requiredDeliverables ?? []).map((d) => ({
        id: d.id,
        requiredFilename: d.requiredFilename,
      })),
    [sessionDetail.data],
  );
  const rows = useMemo(
    () => buildSubmissionRows(attendance.data, submissions.data?.items),
    [attendance.data, submissions.data],
  );
  const fullySubmitted = useMemo(() => countFullySubmitted(rows, deliverables), [rows, deliverables]);

  const displayStatus = sessionDetail.data
    ? getDisplaySessionStatus(
        sessionDetail.data.status,
        sessionDetail.data.startTime,
        sessionDetail.data.endTime,
      )
    : null;

  if (sessionDetail.isLoading) {
    return (
      <div className="flex flex-col gap-8">
        <Card>
          <CardContent className="flex flex-col gap-3 p-6">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (sessionDetail.isError || !sessionDetail.data) {
    return (
      <div className="flex flex-col gap-8">
        <Alert variant="destructive">
          <AlertDescription className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>Không tải được thông tin phiên thi. Hãy thử lại.</span>
            <Button type="button" variant="outline" size="sm" onClick={() => sessionDetail.refetch()}>
              Thử lại
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="icon-chip mt-0.5 h-10 w-10 bg-gradient-to-br from-primary to-accent text-white shadow-sm">
            <Inbox className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="flex flex-col gap-1">
            <h1 className="text-h1 text-foreground">{sessionDetail.data.name}</h1>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3 self-start">
          {displayStatus && <Badge variant={displayStatus.variant}>{displayStatus.label}</Badge>}
          <Button asChild size="sm">
            <Link href={`/teacher/grading?sessionId=${sessionId}`}>
              <ClipboardCheck className="h-4 w-4" aria-hidden="true" />
              Chấm điểm
            </Link>
          </Button>
        </div>
      </div>

      <Card className="overflow-hidden">
        <CardHeader className="border-b border-border bg-surface-2/60">
          <CardTitle className="text-h3">Trạng thái nộp bài</CardTitle>
        </CardHeader>

        <p className="border-b border-border px-6 py-3 text-body text-muted-foreground">
          <strong className="text-h3 text-foreground">
            {fullySubmitted}/{rows.length}
          </strong>{' '}
          sinh viên đã nộp đủ {deliverables.length} file bắt buộc
        </p>

        <CardContent className="p-0">
          <SubmissionStatusTable
            deliverables={deliverables}
            students={rows}
            emptyStudentsDescription="Chưa có sinh viên nào nộp bài trong phiên này."
          />
        </CardContent>
      </Card>
    </div>
  );
}
