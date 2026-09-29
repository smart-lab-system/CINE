'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useGradingProgress,
  useGradingResults,
  useRegradeStuck,
  useResultDetails,
} from '@/hooks/useGrading';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { useSessionOverview } from '@/hooks/useSubmissionOverview';
import { STATE_ORDER, countStates, leverageOf, stateOf, type SessionState } from '@/lib/session-triage';
import type { SessionOverviewItem } from '@/lib/api/submissions';
import { BulkAcceptEssays } from './_components/BulkAcceptEssays';
import { LeverageLine } from './_components/LeverageLine';
import { OverviewBar } from './_components/OverviewBar';
import { PreparePanel } from './_components/PreparePanel';
import { ResultsTable, type ResultsFilter } from './_components/ResultsTable';
import { RunningPanel } from './_components/RunningPanel';
import { SessionHeader } from './_components/SessionHeader';
import { SessionPicker } from './_components/SessionPicker';

/**
 * Chấm điểm — MỘT route, ba trạng thái (spec §1): chuẩn bị chấm → đang chấm → danh sách bài. Trang tự chọn màn theo
 * dữ liệu, nên giảng viên không phải nhớ mình đang ở bước nào.
 *
 * Nó vẫn là màn RIÊNG, tới bằng việc chọn một phiên: thu bài và chấm điểm là hai đường nối với nhau bằng đúng một
 * thao tác tường minh của giảng viên (CLAUDE.md), nên không có nút "chấm ngay" nào ở nơi thu bài.
 */
export default function GradingPage() {
  // `useSearchParams` đòi ranh giới Suspense trong App Router — phần còn lại của trang không có lý do chờ gì.
  return (
    <Suspense>
      <GradingPageContent />
    </Suspense>
  );
}

function GradingPageContent() {
  const params = useSearchParams();
  const sessionId = params.get('sessionId') ?? '';
  const overview = useSessionOverview();

  if (!sessionId) {
    return <SessionPicker sessions={overview.data ?? []} loading={overview.isLoading} error={overview.isError ? overview.error : null} />;
  }

  const session = overview.data?.find((s) => s.id === sessionId);
  if (!session) {
    if (overview.isLoading) return <Skeleton className="h-40 w-full" />;
    return (
      <Alert variant="destructive">
        <AlertDescription>
          Không tìm thấy phiên thi này.{' '}
          <Link href="/teacher/grading" className="font-semibold underline underline-offset-2">
            Chọn phiên khác
          </Link>
        </AlertDescription>
      </Alert>
    );
  }
  return <SessionScreen sessionId={sessionId} session={session} initialState={params.get('state')} />;
}

function isFilter(value: string | null): value is SessionState {
  return value !== null && (STATE_ORDER as string[]).includes(value);
}

function SessionScreen({
  sessionId,
  session,
  initialState,
}: {
  sessionId: string;
  session: SessionOverviewItem;
  initialState: string | null;
}) {
  const results = useGradingResults(sessionId);
  const progress = useGradingProgress(sessionId);
  const regrade = useRegradeStuck(sessionId);
  const online = useOnlineStatus();
  const [filter, setFilter] = useState<ResultsFilter>(() => (isFilter(initialState) ? initialState : 'all'));

  const list = results.data ?? [];
  const counts = countStates(list);
  const needsYou = list.filter((r) => stateOf(r) === 'needsYou');
  // Chỉ bài đường điều tra có hồ sơ chứa lý do/số lỗi; bài tự luận tự nói lý do của nó.
  const details = useResultDetails(needsYou.filter((r) => r.pipeline !== 'one_shot').map((r) => r.id));

  const running = (progress.data?.pending ?? 0) > 0;
  const allUngradable = list.length > 0 && counts.ungradable === list.length;
  const loading = (results.isLoading && !results.data) || (progress.isLoading && !progress.data);

  // Danh sách chỉ được làm mới khi lượt chấm KẾT THÚC (useGradingProgress). Giữa chừng, mỗi lần đọc được tiến độ
  // thì đọc lại danh sách, để bài vừa xong hiện ra và mở được ngay (spec §3.8).
  const refetchResults = results.refetch;
  useEffect(() => {
    if (running) void refetchResults();
  }, [running, progress.dataUpdatedAt, refetchResults]);

  const table = (
    <ResultsTable
      sessionId={sessionId}
      sessionClassId={session.classId}
      results={list}
      details={details.byId}
      detailsSettled={details.loading === 0}
      filter={filter}
      onFilterChange={setFilter}
    />
  );

  return (
    <div className="flex flex-col gap-6">
      <SessionHeader session={session} sessionId={sessionId} resultCount={list.length} systemFailed={counts.ungradable} />

      {results.isError && (
        <Alert variant="destructive">
          <AlertDescription>
            Không tải được kết quả chấm mới nhất — {results.error?.message}. Bảng dưới đây (nếu có) là dữ liệu cũ, có
            thể không còn đúng. Thử tải lại trang.
          </AlertDescription>
        </Alert>
      )}

      {loading ? (
        <Skeleton className="h-64 w-full" />
      ) : running ? (
        <>
          <RunningPanel
            progress={progress.data}
            progressError={progress.isError ? progress.error : null}
            lastReadAt={progress.dataUpdatedAt || null}
            onRetry={() => void progress.refetch()}
            results={list}
            online={online}
            onRegradeStuck={() => regrade.mutate()}
            regrade={{
              isPending: regrade.isPending,
              isError: regrade.isError,
              error: regrade.error,
              data: regrade.data,
            }}
          />
          {list.length > 0 && table}
        </>
      ) : list.length === 0 || allUngradable ? (
        <>
          <PreparePanel sessionId={sessionId} session={session} allUngradable={allUngradable} />
          {allUngradable && table}
        </>
      ) : (
        <>
          <OverviewBar counts={counts} />
          <LeverageLine leverage={leverageOf(needsYou, details.byId)} />
          <BulkAcceptEssays sessionId={sessionId} results={list} />
          {table}
        </>
      )}
    </div>
  );
}
