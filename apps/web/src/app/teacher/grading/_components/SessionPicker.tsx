import Link from 'next/link';
import { PageHeader } from '@/components/layout/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import type { SessionOverviewItem } from '@/lib/api/submissions';
import { submittedLabel } from './SessionHeader';

/**
 * Chọn phiên để chấm. Mỗi phiên là một link giữ `sessionId` trên URL (trang một-route-ba-trạng-thái chọn màn theo
 * dữ liệu, nên giảng viên không phải nhớ mình đang ở bước nào).
 *
 * Chỉ phiên CÓ bài đã thu — nhưng KHÔNG lọc theo rubric: phiên thiếu rubric phải hiện ra kèm dấu, vì bài thi thật của
 * sinh viên nằm trong đó và giảng viên gắn rubric ngay ở màn chuẩn bị. Cũng KHÔNG lọc theo lưu trữ: lưu trữ là khái
 * niệm của luồng thu bài.
 */
export function SessionPicker({
  sessions,
  loading,
  error,
}: {
  sessions: SessionOverviewItem[];
  loading: boolean;
  error: Error | null;
}) {
  const gradable = sessions.filter((s) => s.fullySubmittedCount + s.partialCount > 0);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Chấm điểm"
        description="Chọn một phiên thi để chuẩn bị, chấm và chốt điểm. Hệ thống chỉ làm việc với bài đã thu."
      />

      {error && (
        <Alert variant="destructive">
          <AlertDescription>Không tải được danh sách phiên thi — {error.message}.</AlertDescription>
        </Alert>
      )}

      {loading && <Skeleton className="h-24 w-full" />}

      {!loading && !error && gradable.length === 0 && (
        <p className="rounded-lg border border-dashed border-border px-4 py-6 text-small text-muted-foreground">
          Chưa có phiên thi nào thu được bài. Chấm điểm chỉ làm việc với bài đã thu.
        </p>
      )}

      <ul className="grid gap-3 md:grid-cols-2">
        {gradable.map((s) => (
          <li key={s.id}>
            <Link
              href={`/teacher/grading?sessionId=${s.id}`}
              className="flex flex-col gap-1.5 rounded-lg border border-border bg-surface p-4 transition-colors hover:bg-surface-2"
            >
              <span className="text-body font-semibold">{s.name}</span>
              <span className="text-caption text-muted-foreground">
                {[s.className, s.roomName ? `Phòng ${s.roomName}` : null].filter(Boolean).join(' · ')}
              </span>
              <span className="flex flex-wrap items-center gap-2">
                <span className="text-small font-medium tabular-nums">{submittedLabel(s)}</span>
                {!s.rubricId && <Badge variant="warning">Chưa gắn rubric</Badge>}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
