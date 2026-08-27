'use client';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

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
      <p className="text-sm text-muted-foreground">Chưa có sinh viên nào tham gia.</p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead scope="col">Họ tên</TableHead>
          <TableHead scope="col">MSSV</TableHead>
          <TableHead scope="col">Giờ tham gia</TableHead>
          <TableHead scope="col">Trạng thái</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {students.map((student) => (
          <TableRow key={student.studentId}>
            <TableCell>{student.fullName}</TableCell>
            <TableCell>{student.studentId}</TableCell>
            <TableCell>{formatJoinedAt(student.joinedAt)}</TableCell>
            <TableCell>
              <span
                className={
                  student.status === 'connected'
                    ? 'font-medium text-green-600'
                    : 'font-medium text-destructive'
                }
              >
                {student.status === 'connected' ? 'Đang kết nối' : 'Mất kết nối'}
              </span>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
