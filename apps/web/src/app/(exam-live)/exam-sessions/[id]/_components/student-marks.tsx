'use client';

import { Badge } from '@/components/ui/badge';
import type { AttendanceStudent } from '@/lib/api/attendance';

/**
 * Minutes between the session starting and a student's first join —
 * QA-reported gap: "vào muộn nhưng ko nói vào lúc mấy giờ, trễ mấy giờ".
 */
export function lateMinutes(firstSeenAt: string | null, startTime: string): number | null {
  if (!firstSeenAt) return null;
  const seen = new Date(firstSeenAt).getTime();
  const start = new Date(startTime).getTime();
  if (Number.isNaN(seen) || Number.isNaN(start)) return null;
  return Math.max(0, Math.round((seen - start) / 60_000));
}

export function formatAttendanceTime(iso: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleTimeString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/**
 * Ghi chú tự sinh trên bảng SV gộp / điểm danh (spec 2026-10-08 §6.1).
 * Không phải ô ghi tay.
 */
export function StudentMarks({
  student,
  startTime,
}: {
  student: AttendanceStudent;
  startTime: string;
}) {
  const marks: React.ReactNode[] = [];

  if (student.joinedLate) {
    const minutes = lateMinutes(student.firstSeenAt, startTime);
    marks.push(
      <Badge key="late" variant="warning">
        Vào muộn{student.firstSeenAt ? ` lúc ${formatAttendanceTime(student.firstSeenAt)}` : ''}
        {minutes !== null ? ` (trễ ${minutes} phút)` : ''}
      </Badge>,
    );
  }

  // Two labels, never one. A machine that crashed and came back is routine;
  // someone who appeared after the count is the thing the count exists to
  // catch, and a shared label would bury the second under the first.
  if (student.afterHeadcount === 'returned') {
    marks.push(
      <Badge key="after" variant="info">
        Kết nối lại sau khi xác nhận sĩ số
      </Badge>,
    );
  } else if (student.afterHeadcount === 'new') {
    marks.push(
      <Badge key="after" variant="destructive">
        Mới vào sau khi xác nhận sĩ số
      </Badge>,
    );
  }

  if (!student.connected && student.firstSeenAt) {
    marks.push(
      <Badge key="dropped" variant="destructive">
        Mất kết nối lúc {formatAttendanceTime(student.lastEventAt)}
      </Badge>,
    );
  }

  if (marks.length === 0) {
    return <span className="text-muted-foreground">—</span>;
  }

  return <span className="flex flex-wrap gap-1.5">{marks}</span>;
}
