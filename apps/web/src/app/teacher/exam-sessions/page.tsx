'use client';

import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { CalendarClock, Copy, DoorOpen, Plus } from 'lucide-react';
import { useExamSessions } from '@/hooks/useExamSession';
import { EmptyState } from '@/components/layout/empty-state';
import { PageHeader } from '@/components/layout/page-header';
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
import { EXAM_TYPE_LABELS, getDisplaySessionStatus } from '@/lib/exam-session-display';

async function copySessionCode(code: string) {
  try {
    await navigator.clipboard.writeText(code);
    toast.success(`Đã sao chép mã "${code}"`);
  } catch {
    // Clipboard access can be denied (permissions, non-HTTPS context) —
    // the code is still right there in the table for the teacher to read
    // out loud, so this is a degraded-but-usable failure, not a dead end.
    toast.error('Không sao chép được — hãy đọc mã trực tiếp cho sinh viên.');
  }
}

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
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Quản lý kỳ thi"
        description="Các phiên thi bạn đã tạo, mã để sinh viên tham gia và trạng thái theo thời gian thực."
        actions={
          <Button asChild>
            <Link href="/teacher/exam-sessions/new">
              <Plus className="h-4 w-4" aria-hidden="true" />
              Tạo phiên thi
            </Link>
          </Button>
        }
      />

      <div data-animate className="flex flex-col gap-4">
        {isLoading ? (
          <Card>
            <CardContent className="flex flex-col gap-3 p-6">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </CardContent>
          </Card>
        ) : error ? (
          <Alert variant="destructive">
            <AlertDescription className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
              <span>Không tải được danh sách phiên thi. Hãy thử lại.</span>
              <Button type="button" variant="outline" size="sm" onClick={() => refetch()}>
                Thử lại
              </Button>
            </AlertDescription>
          </Alert>
        ) : data && data.items.length === 0 ? (
          <Card>
            <EmptyState
              icon={CalendarClock}
              title="Chưa có phiên thi nào"
              description="Tạo phiên thi đầu tiên để lấy mã cho sinh viên và bắt đầu thu bài."
              action={
                <Button asChild>
                  <Link href="/teacher/exam-sessions/new">
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    Tạo phiên thi
                  </Link>
                </Button>
              }
            />
          </Card>
        ) : (
          <>
            <Card className="overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Tên phiên thi</TableHead>
                    <TableHead>Mã phiên thi</TableHead>
                    <TableHead>Môn thi</TableHead>
                    <TableHead>Lớp</TableHead>
                    <TableHead>Phòng</TableHead>
                    <TableHead>Loại</TableHead>
                    <TableHead>Bắt đầu</TableHead>
                    <TableHead>Trạng thái</TableHead>
                    <TableHead className="text-right">Thao tác</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data?.items.map((session) => {
                    const displayStatus = getDisplaySessionStatus(
                      session.status,
                      session.startTime,
                      session.endTime,
                    );
                    return (
                      <TableRow key={session.id}>
                        <TableCell className="font-medium text-foreground">{session.name}</TableCell>
                        <TableCell>
                          {/* The code is the one value a teacher reads out
                              loud; make it monospaced, wide-tracked and
                              one click from the clipboard. */}
                          <button
                            type="button"
                            onClick={() => copySessionCode(session.code)}
                            className="group inline-flex items-center gap-2 rounded-md border border-border bg-surface-2 px-2.5 py-1 font-mono text-body font-semibold tracking-[0.12em] text-primary transition-colors duration-150 hover:border-accent hover:bg-accent-subtle"
                            aria-label={`Sao chép mã phiên thi ${session.code}`}
                            title="Sao chép mã phiên thi để gửi cho sinh viên"
                          >
                            {session.code}
                            <Copy
                              className="h-3.5 w-3.5 text-muted-foreground transition-colors group-hover:text-accent-strong"
                              aria-hidden="true"
                            />
                          </button>
                        </TableCell>
                        <TableCell>{session.courseName}</TableCell>
                        <TableCell className="whitespace-nowrap text-muted-foreground">{session.className ?? String.fromCharCode(8212)}</TableCell>
                        <TableCell className="whitespace-nowrap">{session.roomName}</TableCell>
                        <TableCell className="whitespace-nowrap">
                          {EXAM_TYPE_LABELS[session.examType] ?? session.examType}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-muted-foreground">
                          {formatDateTime(session.startTime)}
                        </TableCell>
                        <TableCell>
                          <Badge variant={displayStatus.variant}>{displayStatus.label}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button asChild variant="outline" size="sm">
                            <Link href={`/exam-sessions/${session.id}`}>
                              <DoorOpen className="h-4 w-4" aria-hidden="true" />
                              Phòng chờ
                            </Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Card>

            <div className="flex items-center justify-between gap-4 text-small text-muted-foreground">
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
    </div>
  );
}
