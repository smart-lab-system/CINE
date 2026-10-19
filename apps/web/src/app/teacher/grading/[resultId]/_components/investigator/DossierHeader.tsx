'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StatusPill } from '@/components/status-pill';
import { useOpenSubmission } from '@/hooks/useAudit';

export function DossierHeader({
  resultId,
  sessionId,
  sessionName,
  roomName,
  mssv,
  studentName,
  status,
  ungradableReason,
  onOpenManualScore,
}: {
  sessionId: string;
  sessionName: string;
  roomName: string | null;
  mssv: string;
  studentName: string;
  status: string;
  ungradableReason: string | null;
  /** Bài nộp gốc được mở qua route tải của chính bài này. */
  resultId: string;
  /** Bấm "Chấm tay bài này" — hộp thoại thật do `InvestigatorDossier` giữ, để cả trang chỉ có MỘT hộp. */
  onOpenManualScore: () => void;
}) {
  const openSubmission = useOpenSubmission(resultId);
  return (
    <div className="flex flex-col gap-3">
      <nav aria-label="Vị trí" className="flex items-center gap-1.5 text-caption text-muted-foreground">
        <Link href={`/teacher/grading?sessionId=${sessionId}`} className="flex items-center gap-1 hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          Chấm điểm
        </Link>
        <span aria-hidden="true">›</span>
        <span>{sessionName}</span>
        <span aria-hidden="true">›</span>
        <span className="text-foreground">{mssv}</span>
      </nav>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <h1 className="text-h1">
              {mssv} · {studentName}
            </h1>
            <StatusPill status={status} ungradableReason={ungradableReason} />
          </div>
          <p className="text-caption text-muted-foreground">
            {sessionName}
            {roomName && ` · Phòng ${roomName}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-col items-end gap-1">
            <Button variant="outline" loading={openSubmission.isPending} onClick={() => openSubmission.mutate()}>
              Mở bài nộp
            </Button>
            {openSubmission.isError && (
              <p role="alert" className="text-caption text-danger-strong">
                {openSubmission.error.message}
              </p>
            )}
          </div>
          <Button variant="outline" onClick={onOpenManualScore}>
            Chấm tay bài này
          </Button>
        </div>
      </div>
    </div>
  );
}
