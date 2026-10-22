'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/layout/page-header';
import { useGradingResults } from '@/hooks/useGrading';
import { useSessionOverview } from '@/hooks/useSubmissionOverview';
import { stateOf } from '@/lib/session-triage';
import { ExportWizard } from './_components/ExportWizard';

/**
 * Ghi điểm vào sổ điểm (spec §3.6) — trang RIÊNG, và chỉ mở khi phiên đã chốt hết (§3.10: ghi file trước khi chốt là
 * đưa ra ngoài một con số chưa công bố). API lỏng hơn (từng sinh viên chỉ được ghi khi bài của họ đã chốt); trang này
 * theo luật chặt của giao diện. `useSearchParams` đòi ranh giới Suspense khi build tĩnh.
 */
export default function ExportPage() {
  return (
    <Suspense fallback={<Skeleton className="h-40 w-full" />}>
      <ExportContent />
    </Suspense>
  );
}

function ExportContent() {
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

  const list = results.data ?? [];
  const allFinal = list.length > 0 && list.every((r) => stateOf(r) === 'finalised');

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4">
        <nav aria-label="Vị trí" className="flex min-w-0 items-center gap-1.5 text-caption text-muted-foreground">
          <Link
            href={`/teacher/grading?sessionId=${sessionId}`}
            className="flex shrink-0 items-center gap-1 rounded-sm transition-colors duration-200 ease-smooth hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Chấm điểm
          </Link>
          <span aria-hidden="true">›</span>
          <span className="truncate" title={session.name}>
            {session.name}
          </span>
        </nav>
        <PageHeader title="Ghi điểm vào sổ điểm" description="Điền điểm đã chốt của phiên này vào file sổ điểm mà trường phát." />
      </div>

      {results.isError ? (
        <Alert variant="destructive">
          <AlertDescription>Không tải được kết quả chấm — {results.error?.message}. Thử tải lại trang.</AlertDescription>
        </Alert>
      ) : results.isLoading || !results.data ? (
        <Skeleton className="h-40 w-full" />
      ) : list.length === 0 ? (
        <p className="text-small text-muted-foreground">
          Chưa chấm bài nào — chưa có điểm để ghi.{' '}
          <Link href={`/teacher/grading?sessionId=${sessionId}`} className="font-semibold underline underline-offset-2">
            Về danh sách bài
          </Link>
        </p>
      ) : !allFinal ? (
        <Alert variant="info">
          <AlertDescription>
            Phiên chưa chốt điểm — chốt điểm trước rồi mới ghi vào sổ điểm.{' '}
            <Link href={`/teacher/grading/finalize?sessionId=${sessionId}`} className="font-semibold underline underline-offset-2">
              Đi tới màn chốt điểm
            </Link>
          </AlertDescription>
        </Alert>
      ) : (
        <ExportWizard sessionId={sessionId} sessionName={session.name} sessionCode={session.code} />
      )}
    </div>
  );
}
