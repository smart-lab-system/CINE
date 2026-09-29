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
  // Trần điểm của RUBRIC GHIM CHO PHIÊN, tìm theo id — `version` chỉ duy nhất trong một bộ (giảng viên, tên), mà
  // rubric nào cũng bắt đầu ở v1 (review I6). Chưa biết thì để null: server kiểm trần, client không bịa.
  const rubric = session?.rubricId ? rubrics.data?.find((r) => r.id === session.rubricId) : undefined;
  const maxTotal = rubric?.totalPoints ?? null;

  const result = results.data?.find((r) => r.id === resultId);

  if (results.isLoading || detail.isLoading) return <Skeleton className="h-64 w-full" />;

  if (results.isError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>Không tải được kết quả chấm — {results.error.message}. Thử tải lại trang.</AlertDescription>
      </Alert>
    );
  }

  // Lỗi tải chi tiết KHÔNG được rơi xuống nhánh "AI đang chấm": nhánh đó bảo giảng viên chờ một thứ sẽ không
  // bao giờ tới (review I5).
  if (detail.isError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>Không tải được hồ sơ bài này — {detail.error?.message}. Thử tải lại trang.</AlertDescription>
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
  const dialog = (currentScore: number | null, status: string) => (
    <ManualScoreDialog
      resultId={resultId}
      sessionId={sessionId}
      currentScore={currentScore}
      maxTotal={maxTotal}
      status={status}
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
        {dialog(null, result.status)}
      </div>
    );
  }

  // Không chấm được VÀ chưa ai chấm tay → màn "không chấm được". Đã chấm tay thì bài CÓ điểm: setManualScore
  // không xoá ungradable_class, nên nếu chỉ nhìn cột đó, trang sẽ vẫn nói "chưa có điểm nào" ngay dưới nhãn
  // "Đã duyệt" (review I2). Bài đó đi tiếp xuống bố cục thường, kèm một dòng nhắc vì sao hệ thống không tự chấm.
  const handGraded = d.ungradableClass !== null && d.currentScoreSource === 'manual';
  if (d.ungradableClass && !handGraded) {
    return (
      <div className="flex flex-col gap-4">
        {header(d.status, d.ungradableReason)}
        <UngradableView
          ungradableClass={d.ungradableClass as 'system' | 'submission'}
          ungradableReason={d.ungradableReason ?? ''}
          investigation={d.investigation}
          onOpenManualScore={() => setOpenManual(true)}
        />
        {dialog(null, d.status)}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {header(d.status, d.ungradableReason)}
      {handGraded && (
        <Alert variant="info">
          <AlertDescription>
            Hệ thống không tự chấm được bài này ({d.ungradableReason}). Điểm bên dưới do bạn chấm tay.
          </AlertDescription>
        </Alert>
      )}
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
      {dialog(d.currentScore, d.status)}
    </div>
  );
}
