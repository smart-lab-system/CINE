'use client';

import { Download, FileSpreadsheet, History } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useExportDownload, useGradeExports } from '@/hooks/useGradeExport';
import { roundingText } from '@/lib/grade-export-view';

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('vi-VN') : '—');

/** Các lượt xuất trước của phiên (§13.1 luật 2): mỗi lượt là một hồ sơ chỉ-thêm — ai, cột nào, làm tròn ra sao, bao nhiêu điểm. */
export function PreviousExports({ sessionId }: { sessionId: string }) {
  const list = useGradeExports(sessionId);
  const download = useExportDownload();
  const items = list.data ?? [];

  return (
    <section aria-label="Các lượt xuất trước" className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <History className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <h2 className="text-h3">Các lượt xuất trước</h2>
        {items.length > 0 && <Badge>{items.length}</Badge>}
      </div>
      {list.isLoading ? (
        <Skeleton className="h-16 w-full" />
      ) : list.error ? (
        <Alert variant="destructive">
          <AlertDescription>{list.error.message}</AlertDescription>
        </Alert>
      ) : items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-small text-muted-foreground">
          Chưa có lượt xuất nào cho phiên này.
        </p>
      ) : (
        <ul aria-label="Các lượt xuất trước" className="flex flex-col divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface shadow-sm">
          {items.map((e) => (
            <li key={e.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex min-w-0 gap-3">
                <span className="icon-chip h-10 w-10 bg-success-subtle text-success-strong">
                  <FileSpreadsheet className="h-5 w-5" aria-hidden="true" />
                </span>
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="truncate text-small font-semibold">{e.templateFileName ?? e.outputFileName ?? 'Sổ điểm'}</span>
                  <span className="text-caption text-muted-foreground">
                    {when(e.exportedAt)} · {e.exportedByName} · Trang tính {e.sheetName ?? '—'}
                    {e.deliverableName ? ` · Yêu cầu nộp ${e.deliverableName}` : ''}
                  </span>
                  <span className="text-caption text-muted-foreground">
                    MSSV cột {e.mssvColumn} · điểm cột {e.scoreColumn}
                    {e.reasonColumn ? ` · lý do cột ${e.reasonColumn}` : ''} · {roundingText(e.roundingStepHundredths)}
                  </span>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    <Badge variant="success">{e.written} điểm đã ghi</Badge>
                    <Badge>{e.blank} ô để trống</Badge>
                    <Badge variant={e.unmatched > 0 ? 'warning' : 'default'}>{e.unmatched} không khớp</Badge>
                    {e.overwritten > 0 && <Badge variant="warning">{e.overwritten} ô ghi đè</Badge>}
                  </div>
                  {e.decreased > 0 && (
                    <span className="pt-0.5 text-caption font-semibold text-warning-strong">
                      ↓ {e.decreased} bài giảm điểm — {e.decreaseConfirmedBy ?? 'người dùng'} đã xác nhận
                    </span>
                  )}
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0 self-start"
                disabled={download.isPending}
                onClick={() => download.mutate(e.id, { onSuccess: (d) => window.open(d.downloadUrl, '_blank', 'noopener') })}
              >
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
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
