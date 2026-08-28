'use client';

import { Users } from 'lucide-react';
import { EmptyState } from '@/components/layout/empty-state';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

// Mirrors the WebSocket Event Contract's `lobby:student_joined` payload
// (studentId/fullName/joinedAt) plus a client-only `status` derived from
// whether `agent:disconnected` has fired for this studentId since. A
// disconnected student is never removed from this list — a teacher needs
// to see who *was* connected and dropped, not just who currently is.
export interface LobbyStudent {
  studentId: string;
  fullName: string;
  joinedAt: string;
  status: 'connected' | 'disconnected';
}

interface LobbyListProps {
  students: LobbyStudent[];
}

function formatJoinedAt(joinedAt: string): string {
  const date = new Date(joinedAt);
  // `joinedAt` always comes from the server as a real ISO string per the
  // contract, but a malformed value should degrade to showing the raw
  // string instead of rendering "Invalid Date" on screen.
  if (Number.isNaN(date.getTime())) {
    return joinedAt;
  }
  return date.toLocaleTimeString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

// A real <table> (not a styled <div> list): the data is genuinely tabular
// (4 aligned columns per student) and a table lets a screen reader announce
// "column 3 of 4, Trạng thái" per cell — a `role="list"` substitute would
// lose that column context entirely.
export function LobbyList({ students }: LobbyListProps) {
  if (students.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title="Chưa có sinh viên nào tham gia"
        description="Danh sách sẽ tự cập nhật ngay khi sinh viên nhập mã phiên thi trên máy của mình."
        tone="muted"
      />
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead scope="col">Họ tên</TableHead>
          <TableHead scope="col">MSSV</TableHead>
          <TableHead scope="col">Giờ tham gia</TableHead>
          <TableHead scope="col">Trạng thái</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {students.map((student) => {
          const connected = student.status === 'connected';
          return (
            <TableRow key={student.studentId}>
              <TableCell className="font-medium text-foreground">{student.fullName}</TableCell>
              <TableCell className="font-mono text-muted-foreground">{student.studentId}</TableCell>
              <TableCell className="tabular-nums text-muted-foreground">
                {formatJoinedAt(student.joinedAt)}
              </TableCell>
              <TableCell>
                {/* Dot + word, not colour alone — this table is watched
                    from across a room on a projector, where a red/green
                    difference is the first thing to get lost. */}
                <span
                  className={cn(
                    'inline-flex items-center gap-2 font-medium',
                    connected ? 'text-success-strong' : 'text-danger-strong',
                  )}
                >
                  <span
                    className={cn(
                      'h-2 w-2 shrink-0 rounded-full',
                      connected ? 'bg-success' : 'bg-danger',
                    )}
                    aria-hidden="true"
                  />
                  {connected ? 'Đang kết nối' : 'Mất kết nối'}
                </span>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
