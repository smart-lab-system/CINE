'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { NeedsBackend } from '@/components/needs-backend';
import { StatusPill } from './StatusPill';

export function DossierHeader({
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
  /** Bấm "Chấm tay bài này" — hộp thoại thật do `InvestigatorDossier` giữ, để cả trang chỉ có MỘT hộp. */
  onOpenManualScore: () => void;
}) {
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
          {/* Bài đi đường điều tra là code_project, mà backend mới có bộ đọc cho 'document': mở ra chỉ thấy
              "chưa đọc được nội dung" và không có link tải (review I4). Nhãn thật thay cho một nút trông chạy được. */}
          <Button variant="outline" disabled>
            Mở bài nộp
            <NeedsBackend className="ml-2" />
          </Button>
          <Button variant="outline" onClick={onOpenManualScore}>
            Chấm tay bài này
          </Button>
        </div>
      </div>
    </div>
  );
}
