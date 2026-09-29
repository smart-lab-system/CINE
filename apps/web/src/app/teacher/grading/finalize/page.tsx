'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { useGradingResults } from '@/hooks/useGrading';
import { useSessionOverview } from '@/hooks/useSubmissionOverview';
import { FinalizePanel } from '../_components/FinalizePanel';

/**
 * Chốt điểm phiên (spec §3.10) — trang RIÊNG, không gộp vào danh sách bài và không gộp vào việc ghi file.
 * `useSearchParams` đòi ranh giới Suspense khi build tĩnh.
 */
export default function FinalizePage() {
  return (
    <Suspense fallback={<Skeleton className="h-40 w-full" />}>
      <FinalizeContent />
    </Suspense>
  );
}

function FinalizeContent() {
  const sessionId = useSearchParams().get('sessionId') ?? '';
  const overview = useSessionOverview();
  const results = useGradingResults(sessionId || undefined);
  const session = overview.data?.find((s) => s.id === sessionId);

  if (!sessionId) {
    return (
      <p className="text-small text-muted-foreground">
        Chưa chọn phiên thi.{' '}
        <Link href="/teacher/grading" className="font-semibold underline underline-offset-2">
          Chọn phiên
        </Link>
      </p>
    );
  }
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

  return (
    <div className="flex flex-col gap-6">
      <nav aria-label="Vị trí" className="flex items-center gap-1.5 text-caption text-muted-foreground">
        <Link href={`/teacher/grading?sessionId=${sessionId}`} className="flex items-center gap-1 hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          Chấm điểm
        </Link>
        <span aria-hidden="true">›</span>
        <span>{session.name}</span>
      </nav>
      <h1 className="text-h1">Chốt điểm phiên</h1>

      {results.isError ? (
        <Alert variant="destructive">
          <AlertDescription>Không tải được kết quả chấm — {results.error?.message}. Thử tải lại trang.</AlertDescription>
        </Alert>
      ) : results.isLoading || !results.data ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <FinalizePanel sessionId={sessionId} session={{ name: session.name, code: session.code }} results={results.data} />
      )}
    </div>
  );
}
