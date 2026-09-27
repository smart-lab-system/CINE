'use client';

import { useParams } from 'next/navigation';
import { useResultInvestigation } from '@/hooks/useGrading';
import { ScoreSummary } from './_components/ScoreSummary';
import { DiagnosedErrorList } from './_components/DiagnosedErrorList';
import { InvestigationTrail } from './_components/InvestigationTrail';

export default function ResultInvestigationPage() {
  const { resultId } = useParams<{ resultId: string }>();
  const { data, isLoading } = useResultInvestigation(resultId);

  if (isLoading || !data) return <p className="p-6 text-muted-foreground">Đang tải…</p>;

  return (
    <div className="flex flex-col gap-4 p-6">
      <h1 className="text-large font-semibold">Hồ sơ một bài</h1>
      <ScoreSummary detail={data} />
      {data.breakdown && <DiagnosedErrorList breakdown={data.breakdown} />}
      {data.investigation && <InvestigationTrail investigation={data.investigation} />}
    </div>
  );
}
