'use client';

import { Suspense, useMemo } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { ClipboardCheck, Inbox, Loader2, RefreshCw } from 'lucide-react';
import {
  useArchiveRecheck,
  useAttendance,
  useExamSessionDetail,
  useSubmissions,
} from '@/hooks/useExamSession';
import { useGradingResults } from '@/hooks/useGrading';
import { buildSubmissionRows, countFullySubmitted } from '@/lib/submission-rows';
import { getDisplaySessionStatus } from '@/lib/exam-session-display';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
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
  // useSearchParams requires a Suspense boundary in the App Router — the
  // rest of the page has no reason to wait on anything, so only this one
  // read is wrapped, not the whole tree.
  return (
    <Suspense>
      <SubmissionSessionDetailContent />
    </Suspense>
  );
}

function SubmissionSessionDetailContent() {
  const params = useParams<{ sessionId: string }>();
  const sessionId = params.sessionId;
  // Đến từ luồng search trên "Quản lý bài thu" — spec §5.2. Không có param
  // nghĩa là GV đến từ lối duyệt Môn/Lớp và muốn thấy CẢ LỚP.
  const focusStudentMssv = useSearchParams().get('student') ?? undefined;

  const sessionDetail = useExamSessionDetail(sessionId);
  const attendance = useAttendance(sessionId);
  const submissions = useSubmissions(sessionId);
  const gradingResults = useGradingResults(sessionId);
  const archiveRecheck = useArchiveRecheck(sessionId);

  /**
   * "Kiểm lại" — đọc-rồi-xếp-hàng, không đụng bài nộp (xem doc comment
   * trên `useArchiveRecheck`). Toast thay vì Alert cạnh bảng: trang này
   * không có socket để dòng thời gian trôi qua tự nhiên như trang lobby,
   * nên một thông báo tức thời rồi biến mất là đủ — cùng quy ước
   * admin/accounts/page.tsx đã dùng cho mọi mutation của nó.
   */
  function handleArchiveRecheck() {
    archiveRecheck.mutate(undefined, {
      onSuccess: (result) => {
        toast.success(
          result.requeued > 0
            ? `Đã xếp lại ${result.requeued} bài vào hàng đợi kiểm file nén.`
            : 'Không có bài nào cần kiểm lại.',
        );
      },
      onError: () => toast.error('Không kiểm lại được. Vui lòng thử lại.'),
    });
  }

  /**
   * Chỉ-đọc. Nguồn là GET /exam-sessions/:id/grading-results, đã có sẵn —
   * Tầng 1 không thêm endpoint chấm nào.
   */
  const gradingByMssv = useMemo(() => {
    const map: Record<string, { score: number | null; status: string }> = {};
    for (const result of gradingResults.data ?? []) {
      map[result.studentMssv] = {
        // Điểm giảng viên đã chốt thắng điểm AI đề xuất. Trước khi có
        // TeacherReview thì chỉ có `aiTotalScore`, nên trang này đọc thẳng
        // nó — giờ để nguyên sẽ khiến một bài đã duyệt 7.5 vẫn hiện 4.0 ở
        // đây trong khi trang Chấm điểm hiện 7.5. Hai màn hình nói hai con
        // số khác nhau về cùng một bài là lỗi tệ hơn hẳn việc thiếu số.
        //
        // `??` chứ không phải `||`: điểm 0 do giảng viên chấm là một quyết
        // định, không phải một giá trị trống.
        score: result.finalScore ?? result.aiTotalScore,
        status: result.status,
      };
    }
    return map;
  }, [gradingResults.data]);

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
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={archiveRecheck.isPending}
                  onClick={handleArchiveRecheck}
                >
                  {archiveRecheck.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <RefreshCw className="h-4 w-4" aria-hidden="true" />
                  )}
                  Kiểm lại
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                Chạy lại phép kiểm file nén cho các bài lỗi — không đụng bài nộp, không cần sinh
                viên nộp lại.
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
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
            focusStudentMssv={focusStudentMssv}
            gradingByMssv={gradingByMssv}
          />
        </CardContent>
      </Card>
    </div>
  );
}
