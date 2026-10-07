import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { RegradeButton } from './RegradeButton';
import type { SessionOverviewItem } from '@/lib/api/submissions';

/**
 * "32/40 bài nộp" — bài đã thu trên số sinh viên dự kiến. Chưa biết danh sách lớp thì KHÔNG bịa mẫu số.
 */
export function submittedLabel(session: SessionOverviewItem): string {
  const submitted = session.fullySubmittedCount + session.partialCount;
  return session.rosterKnown && session.expectedCount > 0
    ? `${submitted}/${session.expectedCount} bài nộp`
    : `${submitted} bài nộp`;
}

/**
 * Đầu trang của một phiên (spec §3.3): tên phiên + *Đổi phiên* · lớp, phòng, số bài nộp · *Chốt điểm phiên* (trang
 * riêng, mục 3.10) · *Chấm lại N bài lỗi hệ thống* (chỉ đếm bài lớp system, có hộp xác nhận, §2.3). Không có nút *Xuất điểm* ở
 * đây: ghi điểm ra ngoài chỉ mở sau khi chốt.
 */
export function SessionHeader({
  session,
  sessionId,
  resultCount,
  systemFailed,
}: {
  session: SessionOverviewItem;
  sessionId: string;
  resultCount: number;
  /** Số bài "không chấm được" do lỗi hệ thống (lớp `system`) — đúng số bài mà nút chấm lại sẽ xử lý. */
  systemFailed: number;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-h1 text-foreground">{session.name}</h1>
        <p className="text-small text-muted-foreground">
          {[session.className, session.roomName ? `Phòng ${session.roomName}` : null].filter(Boolean).join(' · ')}
        </p>
        <p className="text-small font-medium tabular-nums">{submittedLabel(session)}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild variant="outline">
          <Link href="/teacher/grading">Đổi phiên</Link>
        </Button>
        {resultCount > 0 ? (
          <Button asChild>
            <Link href={`/teacher/grading/finalize?sessionId=${sessionId}`}>Chốt điểm phiên</Link>
          </Button>
        ) : (
          <Button type="button" disabled title="Chưa chấm bài nào — chưa có gì để chốt.">
            Chốt điểm phiên
          </Button>
        )}
        {systemFailed > 0 && (
          <RegradeButton
            scope={{ kind: 'session', sessionId, reason: null, count: systemFailed }}
            label={`Chấm lại ${systemFailed} bài lỗi hệ thống`}
          />
        )}
      </div>
    </div>
  );
}
