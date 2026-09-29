'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { useGradingResults, useResultInvestigation, useRubrics } from '@/hooks/useGrading';
import { useSessionOverview } from '@/hooks/useSubmissionOverview';
import { DossierHeader } from './DossierHeader';
import { CaseFlagsBanner } from './CaseFlagsBanner';
import { ScoreCard } from './ScoreCard';
import { ErrorList } from './ErrorList';
import { ChallengeNotes } from './ChallengeNotes';
import { CriteriaTable } from './CriteriaTable';
import { CoverageSection } from './CoverageSection';
import { InvestigationTrail } from './InvestigationTrail';
import { UngradableView } from './UngradableView';
import { ManualScoreDialog } from './ManualScoreDialog';

/**
 * Đúng MỘT `ManualScoreDialog` cho cả trang — cả `DossierHeader`, cả
 * `UngradableView`, cả `CaseFlagsBanner` chỉ gọi `setOpenManual(true)`,
 * không component con nào tự giữ hộp thoại của riêng nó.
 */
export function InvestigatorDossier({ resultId, sessionId }: { resultId: string; sessionId: string }) {
  const [openManual, setOpenManual] = useState(false);
  const results = useGradingResults(sessionId || undefined);
  const detail = useResultInvestigation(resultId);
  const overview = useSessionOverview();
  const session = (overview.data ?? []).find((item) => item.id === sessionId);
  const rubrics = useRubrics();
  const rubric = rubrics.data?.find((r) => r.version === session?.rubricVersion);
  const maxTotal = rubric?.totalPoints ?? 10;

  const result = results.data?.find((r) => r.id === resultId);

  if (results.isLoading || detail.isLoading) return <Skeleton className="h-64 w-full" />;

  if (results.isError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>Không tải được kết quả chấm — {results.error.message}. Thử tải lại trang.</AlertDescription>
      </Alert>
    );
  }

  if (!result) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          Không tìm thấy bài này. Quay lại{' '}
          <Link href={`/teacher/grading?sessionId=${sessionId}`} className="font-semibold underline underline-offset-2">
            màn Điều phối
          </Link>{' '}
          và chọn lại.
        </AlertDescription>
      </Alert>
    );
  }

  const header = (status: string, ungradableReason: string | null) => (
    <DossierHeader
      resultId={resultId}
      sessionId={sessionId}
      sessionName={session?.name ?? '—'}
      roomName={session?.roomName ?? null}
      mssv={result.studentMssv}
      studentName={result.studentName}
      status={status}
      ungradableReason={ungradableReason}
      onOpenManualScore={() => setOpenManual(true)}
    />
  );
  const dialog = (currentScore: number | null) => (
    <ManualScoreDialog
      resultId={resultId}
      sessionId={sessionId}
      currentScore={currentScore}
      maxTotal={maxTotal}
      open={openManual}
      onOpenChange={setOpenManual}
    />
  );

  const d = detail.data;
  if (!d || (d.breakdown === null && d.ungradableClass === null && d.investigation === null)) {
    // Điều tra chưa xong (ai_grading/ai_graded), hoặc chưa có bản ghi nào — Review Focus #4:
    // KHÔNG đọc breakdown.errors trên null, chỉ nói đang chấm.
    return (
      <div className="flex flex-col gap-4">
        {header(result.status, result.ungradableReason)}
        <Alert variant="info">
          <AlertDescription>AI đang chấm bài này — chưa có dữ liệu để hiện. Tải lại sau ít phút.</AlertDescription>
        </Alert>
        {dialog(null)}
      </div>
    );
  }

  if (d.ungradableClass) {
    return (
      <div className="flex flex-col gap-4">
        {header(d.status, d.ungradableReason)}
        <UngradableView
          ungradableClass={d.ungradableClass as 'system' | 'submission'}
          ungradableReason={d.ungradableReason ?? ''}
          investigation={d.investigation}
          onOpenManualScore={() => setOpenManual(true)}
        />
        {dialog(null)}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {header(d.status, d.ungradableReason)}
      {d.breakdown && (
        <CaseFlagsBanner
          caseFlags={d.breakdown.caseFlags}
          errorFlags={d.breakdown.errorFlags}
          onManualScore={() => setOpenManual(true)}
        />
      )}
      <div className="grid gap-4 lg:grid-cols-[1fr_404px]">
        <div className="flex flex-col gap-4">
          <ScoreCard currentScore={d.currentScore} currentScoreSource={d.currentScoreSource} breakdown={d.breakdown} />
          {d.breakdown && (
            <ErrorList
              resultId={resultId}
              sessionId={sessionId}
              status={d.status}
              errors={d.breakdown.errors}
              errorFlags={d.breakdown.errorFlags}
              verdicts={d.challengeVerdicts}
              investigationNotes={d.investigation?.verdict?.errors ?? []}
            />
          )}
          <ChallengeNotes notes={d.challengeNotes} />
          {d.investigation && <InvestigationTrail investigation={d.investigation} />}
        </div>
        <div className="flex flex-col gap-4">
          {d.breakdown && <CriteriaTable perCriterion={d.breakdown.perCriterion} />}
          {d.investigation && <CoverageSection investigation={d.investigation} />}
        </div>
      </div>
      {dialog(d.currentScore)}
    </div>
  );
}
