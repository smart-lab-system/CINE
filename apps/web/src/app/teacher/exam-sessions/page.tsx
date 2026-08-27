'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CalendarClock, Plus } from 'lucide-react';
import { useExamSessions } from '@/hooks/useExamSession';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  EXAM_SESSION_STATUS_BADGE_VARIANT,
  EXAM_SESSION_STATUS_LABELS,
  EXAM_TYPE_LABELS,
} from '@/lib/exam-session-display';

const PAGE_SIZE = 20;

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function ExamSessionsListPage() {
  const [page, setPage] = useState(1);
  const { data, error, isLoading, refetch } = useExamSessions({ page, pageSize: PAGE_SIZE });

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="font-display text-2xl font-bold">Quản lý kỳ thi</h1>
        <Button asChild>
          <Link href="/teacher/exam-sessions/new">
            <Plus className="mr-1.5 h-4 w-4" />
            Tạo phiên thi
          </Link>
        </Button>
      </div>

      {isLoading ? (
        <Card>
          <CardContent className="flex flex-col gap-3 p-6">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </CardContent>
        </Card>
      ) : error ? (
        <Alert variant="destructive">
          <AlertDescription className="flex items-center justify-between gap-4">
            <span>Không tải được danh sách phiên thi. Hãy thử lại.</span>
            <Button type="button" variant="outline" size="sm" onClick={() => refetch()}>
              Thử lại
            </Button>
          </AlertDescription>
        </Alert>
      ) : data && data.items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-subtle text-accent">
              <CalendarClock className="h-6 w-6" aria-hidden="true" />
            </div>
            <p className="font-medium">Chưa có phiên thi nào</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Tạo phiên thi đầu tiên để bắt đầu thu bài.
            </p>
            <Button asChild>
              <Link href="/teacher/exam-sessions/new">
                <Plus className="mr-1.5 h-4 w-4" />
                Tạo phiên thi
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tên phiên thi</TableHead>
                  <TableHead>Môn thi</TableHead>
                  <TableHead>Phòng</TableHead>
                  <TableHead>Loại</TableHead>
                  <TableHead>Thời gian</TableHead>
                  <TableHead>Trạng thái</TableHead>
                  <TableHead>Thao tác</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.items.map((session) => (
                  <TableRow key={session.id}>
                    <TableCell className="font-medium">{session.name}</TableCell>
                    <TableCell>{session.courseName}</TableCell>
                    <TableCell>{session.roomName}</TableCell>
                    <TableCell>{EXAM_TYPE_LABELS[session.examType] ?? session.examType}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDateTime(session.startTime)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={EXAM_SESSION_STATUS_BADGE_VARIANT[session.status] ?? 'default'}>
                        {EXAM_SESSION_STATUS_LABELS[session.status] ?? session.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button asChild type="button" variant="outline" size="sm">
                        <Link href={`/exam-sessions/${session.id}`}>Vào phòng chờ</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              Trang {page}/{totalPages} • {total} phiên thi
            </span>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Trước
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Sau
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
