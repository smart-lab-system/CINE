'use client';

import { ClipboardList, TriangleAlert, UserCheck, UserMinus, Users } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { Attendance, AttendanceStudent } from '@/lib/api/attendance';

interface AttendancePanelProps {
  attendance: Attendance | undefined;
  isLoading: boolean;
  error: Error | null;
  canConfirm: boolean;
  confirming: boolean;
  confirmError: Error | null;
  onConfirm: () => void;
  /** The session's own start_time — needed only to say how late a late
   *  joiner actually was (see StudentMarks). Not part of Attendance
   *  itself: attendance is derived from agent_connection_event, which
   *  knows nothing about the session it belongs to. */
  startTime: string;
}

/**
 * Minutes between the session starting and a student's first join —
 * QA-reported gap: "vào muộn nhưng ko nói vào lúc mấy giờ, trễ mấy giờ".
 * Both timestamps were already flowing to this page (firstSeenAt via
 * Attendance, startTime via the session detail already fetched for the
 * countdown/materials-release copy elsewhere on this same page) — this is
 * the one place nobody had subtracted them yet.
 */
function lateMinutes(firstSeenAt: string | null, startTime: string): number | null {
  if (!firstSeenAt) return null;
  const seen = new Date(firstSeenAt).getTime();
  const start = new Date(startTime).getTime();
  if (Number.isNaN(seen) || Number.isNaN(start)) return null;
  return Math.max(0, Math.round((seen - start) / 60_000));
}

function formatTime(iso: string | null): string {
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
 * The room, in three groups instead of one list.
 *
 * One flat list of whoever happened to connect answers "who is here" and
 * nothing else. An invigilator standing in the room needs three different
 * answers, each with a different action: nobody, call this name, check this
 * person's make-up authorisation. Splitting them is the feature.
 *
 * Every number here comes from the server's attendance log, so a refresh
 * mid-exam no longer empties the screen.
 */
export function AttendancePanel({
  attendance,
  isLoading,
  error,
  canConfirm,
  confirming,
  confirmError,
  onConfirm,
  startTime,
}: AttendancePanelProps) {
  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex flex-col gap-3 p-6">
          <Skeleton className="h-5 w-1/3" />
          <Skeleton className="h-5 w-1/2" />
        </CardContent>
      </Card>
    );
  }

  if (error || !attendance) {
    return (
      <Card>
        <CardContent className="p-6">
          <Alert variant="destructive">
            <AlertDescription>
              {error?.message ?? 'Không tải được danh sách điểm danh.'}
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  const noClass = attendance.classId === null;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-4 border-b border-border bg-surface-2/60">
        <CardTitle className="text-h3">
          Điểm danh
          {attendance.className && (
            <span className="ml-2 font-normal text-muted-foreground">
              — {attendance.className}
            </span>
          )}
        </CardTitle>

        <div className="flex items-center gap-3">
          {attendance.confirmedAt ? (
            <span className="text-small text-muted-foreground">
              Đã chốt{' '}
              <strong className="tabular-nums text-foreground">
                {attendance.confirmedCount}
              </strong>{' '}
              lúc {formatTime(attendance.confirmedAt)}
            </span>
          ) : null}
          <Button
            type="button"
            variant={attendance.confirmedAt ? 'outline' : 'default'}
            size="sm"
            disabled={!canConfirm || confirming || noClass}
            onClick={onConfirm}
          >
            <ClipboardList className="h-4 w-4" aria-hidden="true" />
            {attendance.confirmedAt ? 'Chốt lại sĩ số' : 'Chốt sĩ số'}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-6 p-6">
        {confirmError && (
          <Alert variant="destructive">
            <AlertDescription>{confirmError.message}</AlertDescription>
          </Alert>
        )}

        {noClass && (
          <Alert variant="info">
            <AlertDescription>
              Phiên thi này được tạo trước khi phiên thi gắn với một lớp, nên không có danh
              sách để đối chiếu. Vẫn xem được ai đang kết nối, nhưng không chốt được sĩ số.
            </AlertDescription>
          </Alert>
        )}

        {attendance.discrepancy && <DiscrepancyNotice discrepancy={attendance.discrepancy} />}

        <p aria-live="polite" className="flex flex-wrap gap-2">
          <Badge variant="success">
            <UserCheck className="h-3.5 w-3.5" aria-hidden="true" />
            Có mặt {attendance.present.length}/{attendance.rosterSize}
          </Badge>
          {attendance.absent.length > 0 && (
            <Badge variant="warning">
              <UserMinus className="h-3.5 w-3.5" aria-hidden="true" />
              Chưa vào {attendance.absent.length}
            </Badge>
          )}
          {attendance.makeup.length > 0 && (
            <Badge variant="info">
              <Users className="h-3.5 w-3.5" aria-hidden="true" />
              Thi bù {attendance.makeup.length}
            </Badge>
          )}
        </p>

        <Group
          title="Có mặt"
          description="Sinh viên của lớp này đang kết nối."
          students={attendance.present}
          empty="Chưa có sinh viên nào của lớp này vào phòng."
          startTime={startTime}
        />

        <Group
          title="Chưa vào phòng"
          description="Có trong danh sách lớp nhưng chưa kết nối — gọi tên và tìm sinh viên."
          students={attendance.absent}
          empty="Cả lớp đã vào đủ."
          startTime={startTime}
        />

        {attendance.makeup.length > 0 && (
          <Group
            title="Thi bù (lớp khác)"
            description="Đang thi ở đây nhưng thuộc lớp khác của cùng môn — kiểm tra giấy phép thi bù."
            students={attendance.makeup}
            empty=""
            showHomeClass
            startTime={startTime}
          />
        )}
      </CardContent>
    </Card>
  );
}

function DiscrepancyNotice({
  discrepancy,
}: {
  discrepancy: NonNullable<Attendance['discrepancy']>;
}) {
  const gap = discrepancy.submittedCount - discrepancy.confirmedCount;

  if (discrepancy.unaccounted.length === 0) {
    return (
      <Alert variant="success">
        <AlertDescription>
          Đã chốt {discrepancy.confirmedCount} sinh viên, nhận bài của{' '}
          {discrepancy.submittedCount} — mọi bài nộp đều từ người có mặt lúc chốt sĩ số.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Alert variant="warning">
      <TriangleAlert />
      <AlertDescription className="flex flex-col gap-2">
        <span>
          Đã chốt <strong>{discrepancy.confirmedCount}</strong> sinh viên nhưng nhận bài của{' '}
          <strong>{discrepancy.submittedCount}</strong>
          {gap > 0 ? ` — lệch ${gap}.` : '.'}{' '}
          {discrepancy.unaccounted.length} bài đến từ người không có mặt lúc chốt sĩ số:
        </span>
        {/* Named, not just counted — this is the question the enrollment
            list and the submission list cannot answer on their own. */}
        <ul className="flex flex-col gap-1">
          {discrepancy.unaccounted.map((student) => (
            <li key={student.mssv}>
              <span className="font-mono">{student.mssv}</span> — {student.name}
              {student.homeClassName ? ` (lớp ${student.homeClassName})` : ''}
              {student.firstSeenAt ? `, kết nối lúc ${formatTime(student.firstSeenAt)}` : ', chưa từng kết nối'}
            </li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
}

function Group({
  title,
  description,
  students,
  empty,
  showHomeClass = false,
  startTime,
}: {
  title: string;
  description: string;
  students: AttendanceStudent[];
  empty: string;
  showHomeClass?: boolean;
  startTime: string;
}) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-col gap-0.5">
        <h3 className="text-body font-semibold text-foreground">
          {title}{' '}
          <span className="tabular-nums text-muted-foreground">({students.length})</span>
        </h3>
        <p className="text-caption text-muted-foreground">{description}</p>
      </div>

      {students.length === 0 ? (
        <p className="rounded-md border border-dashed border-border px-4 py-3 text-small text-muted-foreground">
          {empty}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead scope="col">Họ tên</TableHead>
                <TableHead scope="col">MSSV</TableHead>
                {showHomeClass && <TableHead scope="col">Lớp gốc</TableHead>}
                <TableHead scope="col">Ghi chú</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {students.map((student) => (
                <TableRow key={student.mssv}>
                  <TableCell className="font-medium text-foreground">{student.name}</TableCell>
                  <TableCell className="font-mono text-muted-foreground">
                    {student.mssv}
                  </TableCell>
                  {showHomeClass && (
                    <TableCell className="whitespace-nowrap">
                      {student.homeClassName ?? '—'}
                    </TableCell>
                  )}
                  <TableCell className="whitespace-nowrap">
                    <StudentMarks student={student} startTime={startTime} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}

function StudentMarks({
  student,
  startTime,
}: {
  student: AttendanceStudent;
  startTime: string;
}) {
  const marks: React.ReactNode[] = [];

  if (student.joinedLate) {
    // QA-reported gap: the badge used to just say "Vào muộn" — no clock
    // time, no idea how late. Both are derivable from data this page
    // already has (firstSeenAt, and the session's own startTime), just
    // never subtracted before now.
    const minutes = lateMinutes(student.firstSeenAt, startTime);
    marks.push(
      <Badge key="late" variant="warning">
        Vào muộn{student.firstSeenAt ? ` lúc ${formatTime(student.firstSeenAt)}` : ''}
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
        Kết nối lại sau khi chốt
      </Badge>,
    );
  } else if (student.afterHeadcount === 'new') {
    marks.push(
      <Badge key="after" variant="destructive">
        Mới vào sau khi chốt
      </Badge>,
    );
  }

  if (!student.connected && student.firstSeenAt) {
    marks.push(
      <Badge key="dropped" variant="destructive">
        Mất kết nối lúc {formatTime(student.lastEventAt)}
      </Badge>,
    );
  }

  if (marks.length === 0) {
    return <span className="text-muted-foreground">—</span>;
  }

  return <span className="flex flex-wrap gap-1.5">{marks}</span>;
}
