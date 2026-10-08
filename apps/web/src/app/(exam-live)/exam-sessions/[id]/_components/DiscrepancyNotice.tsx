'use client';

import { TriangleAlert } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import type { Attendance } from '@/lib/api/attendance';
import { formatAttendanceTime } from './student-marks';

export function DiscrepancyNotice({
  discrepancy,
}: {
  discrepancy: NonNullable<Attendance['discrepancy']>;
}) {
  const gap = discrepancy.submittedCount - discrepancy.confirmedCount;

  if (discrepancy.unaccounted.length === 0) {
    return (
      <Alert variant="success">
        <AlertDescription>
          Đã xác nhận {discrepancy.confirmedCount} sinh viên, nhận bài của{' '}
          {discrepancy.submittedCount} — mọi bài nộp đều từ người có mặt lúc xác nhận sĩ số.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Alert variant="warning">
      <TriangleAlert />
      <AlertDescription className="flex flex-col gap-2">
        <span>
          Đã xác nhận <strong>{discrepancy.confirmedCount}</strong> sinh viên nhưng nhận bài của{' '}
          <strong>{discrepancy.submittedCount}</strong>
          {gap > 0 ? ` — lệch ${gap}.` : '.'}{' '}
          {discrepancy.unaccounted.length} bài đến từ người không có mặt lúc xác nhận sĩ số:
        </span>
        <ul className="flex flex-col gap-1">
          {discrepancy.unaccounted.map((student) => (
            <li key={student.mssv}>
              <span className="font-mono">{student.mssv}</span> — {student.name}
              {student.homeClassName ? ` (lớp ${student.homeClassName})` : ''}
              {student.firstSeenAt
                ? `, kết nối lúc ${formatAttendanceTime(student.firstSeenAt)}`
                : ', chưa từng kết nối'}
            </li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
}
