'use client';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useExportDownload, useGradeExports } from '@/hooks/useGradeExport';
import { roundingText } from '@/lib/grade-export-view';

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('vi-VN') : '—');

/** Các lượt xuất trước của phiên (§13.1 luật 2): mỗi lượt là một hồ sơ chỉ-thêm — ai, cột nào, làm tròn ra sao, bao nhiêu điểm. */
export function PreviousExports({ sessionId }: { sessionId: string }) {
  const list = useGradeExports(sessionId);
  const download = useExportDownload();

  return (
    <section aria-label="Các lượt xuất trước" className="flex flex-col gap-3">
      <h2 className="text-small font-semibold">Các lượt xuất trước</h2>
      {list.isLoading ? (
        <Skeleton className="h-16 w-full" />
      ) : list.error ? (
        <Alert variant="destructive">
          <AlertDescription>{list.error.message}</AlertDescription>
        </Alert>
      ) : (list.data ?? []).length === 0 ? (
        <p className="text-small text-muted-foreground">Chưa có lượt xuất nào cho phiên này.</p>
      ) : (
        <ul aria-label="Các lượt xuất trước" className="flex flex-col divide-y divide-border rounded-lg border border-border bg-surface">
          {list.data!.map((e) => (
            <li key={e.id} className="flex flex-wrap items-start justify-between gap-3 p-3 text-small">
              <div className="flex flex-col gap-0.5">
                <span className="font-medium">{e.templateFileName ?? e.outputFileName ?? 'Sổ điểm'}</span>
                <span className="text-caption text-muted-foreground">
                  {when(e.exportedAt)} · {e.exportedByName} · Trang tính {e.sheetName ?? '—'}
                  {e.deliverableName ? ` · Yêu cầu nộp ${e.deliverableName}` : ''}
                </span>
                <span className="text-caption text-muted-foreground">
                  MSSV cột {e.mssvColumn} · điểm cột {e.scoreColumn}
                  {e.reasonColumn ? ` · lý do cột ${e.reasonColumn}` : ''} · {roundingText(e.roundingStepHundredths)}
                </span>
                <span className="text-caption text-muted-foreground">
                  {e.written} điểm đã ghi · {e.blank} ô để trống · {e.unmatched} không khớp
                  {e.overwritten > 0 ? ` · ${e.overwritten} ô ghi đè` : ''}
                </span>
                {e.decreased > 0 && (
                  <span className="text-caption font-semibold">
                    ↓ {e.decreased} bài giảm điểm — {e.decreaseConfirmedBy ?? 'người dùng'} đã xác nhận
                  </span>
                )}
              </div>
              <Button type="button" variant="outline" size="sm" disabled={download.isPending} onClick={() => download.mutate(e.id, { onSuccess: (d) => window.open(d.downloadUrl, '_blank', 'noopener') })}>
                Tải file
              </Button>
            </li>
          ))}
        </ul>
      )}
      {download.error && (
        <Alert variant="destructive">
          <AlertDescription>{download.error.message}</AlertDescription>
        </Alert>
      )}
    </section>
  );
}
