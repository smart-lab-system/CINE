'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Inbox } from 'lucide-react';
import { useTeacherSubmissions } from '@/hooks/useTeacherSubmissions';
import { useExamSessions } from '@/hooks/useExamSession';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { EmptyState } from '@/components/layout/empty-state';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
import type { TeacherSubmission } from '@/lib/api/submissions';

const PAGE_SIZE = 20;
// The sessions dropdown just needs id+name — a teacher's own session count
// is small (CLAUDE.md's real scale, ~10+ concurrent, not thousands of
// sessions), so one generously-sized page covers it without a second,
// dedicated "options" endpoint.
const SESSION_OPTIONS_PAGE_SIZE = 100;

const STATUS_LABELS: Record<TeacherSubmission['status'], string> = {
  received: 'Đã nhận',
  validated: 'Đã kiểm tra',
  collected: 'Đã thu',
  invalid: 'Không hợp lệ',
};
const STATUS_BADGE_VARIANT: Record<TeacherSubmission['status'], 'default' | 'info' | 'success' | 'destructive'> = {
  received: 'default',
  validated: 'info',
  collected: 'success',
  invalid: 'destructive',
};
const STATUS_OPTIONS = Object.keys(STATUS_LABELS) as TeacherSubmission['status'][];

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatFileSize(value: string | null): string | null {
  if (!value) return null;
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes < 0) return value;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * "Quản lý bài thu" — QA-reported gap: there was no way to see a
 * submission without first knowing which exam session it belonged to.
 * Cross-session, filterable — the per-session status matrix
 * (SubmissionStatusTable, on the lobby page) stays exactly as it is for
 * watching ONE exam live; this is for finding one submission afterward
 * without remembering which session it was.
 */
export default function SubmissionsPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<TeacherSubmission['status'] | 'all'>('all');
  const [examSessionId, setExamSessionId] = useState<string | 'all'>('all');
  const debouncedSearch = useDebouncedValue(search, 300);

  const sessionOptions = useExamSessions({ page: 1, pageSize: SESSION_OPTIONS_PAGE_SIZE });
  const { data, error, isLoading, refetch } = useTeacherSubmissions({
    page,
    pageSize: PAGE_SIZE,
    search: debouncedSearch.trim() || undefined,
    status: status === 'all' ? undefined : status,
    examSessionId: examSessionId === 'all' ? undefined : examSessionId,
  });

  const selectedSession = useMemo(
    () => (sessionOptions.data?.items ?? []).find((s) => s.id === examSessionId),
    [sessionOptions.data, examSessionId],
  );

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasActiveFilters = search.trim() !== '' || status !== 'all' || examSessionId !== 'all';

  function handleSearchChange(value: string) {
    setSearch(value);
    setPage(1);
  }
  function handleStatusChange(value: string) {
    setStatus(value as typeof status);
    setPage(1);
  }
  function handleExamSessionChange(value: string) {
    setExamSessionId(value);
    setPage(1);
  }
  function clearFilters() {
    setSearch('');
    setStatus('all');
    setExamSessionId('all');
    setPage(1);
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Quản lý bài thu"
        description="Mọi bài đã thu, trên tất cả phiên thi bạn tạo — tìm một bài nộp mà không cần nhớ nó thuộc phiên thi nào."
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Input
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder="Tìm theo tên hoặc MSSV..."
          className="sm:max-w-xs"
          aria-label="Tìm kiếm bài nộp"
        />
        <Select value={status} onValueChange={handleStatusChange}>
          <SelectTrigger className="sm:w-48" aria-label="Lọc theo trạng thái">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả trạng thái</SelectItem>
            {STATUS_OPTIONS.map((value) => (
              <SelectItem key={value} value={value}>
                {STATUS_LABELS[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={examSessionId} onValueChange={handleExamSessionChange}>
          <SelectTrigger className="sm:w-64" aria-label="Lọc theo phiên thi">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả phiên thi</SelectItem>
            {(sessionOptions.data?.items ?? []).map((session) => (
              <SelectItem key={session.id} value={session.id}>
                {session.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {examSessionId !== 'all' && (
        // The submissions page's own data (Submission + ExamSession) can only
        // ever say "who submitted" — it has no roster to compare against, so
        // it cannot answer "who is still missing". The per-session detail
        // page already can (AttendanceService, built on Enrollment) and
        // stays viewable after the exam ends — this links there instead of
        // duplicating that answer from a weaker source (see
        // docs/superpowers/specs/2026-09-02-submission-session-detail-page-
        // design.md; supersedes the lobby-page link this row originally had).
        <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface-2/60 px-4 py-3 text-small text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span>
            Đang xem bài nộp của{' '}
            <strong className="text-foreground">
              {selectedSession?.name ?? 'phiên thi này'}
            </strong>{' '}
            — xem đầy đủ trạng thái nộp bài và chấm điểm tại đây.
          </span>
          <Button asChild variant="outline" size="sm" className="shrink-0">
            <Link href={`/teacher/submissions/${examSessionId}`}>
              <Inbox className="h-4 w-4" aria-hidden="true" />
              Xem chi tiết phiên
            </Link>
          </Button>
        </div>
      )}

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
              <span>Không tải được danh sách bài nộp. Hãy thử lại.</span>
              <Button type="button" variant="outline" size="sm" onClick={() => refetch()}>
                Thử lại
              </Button>
            </AlertDescription>
          </Alert>
        ) : data && data.items.length === 0 ? (
          <Card>
            <EmptyState
              icon={Inbox}
              title={hasActiveFilters ? 'Không tìm thấy bài nộp phù hợp' : 'Chưa có bài nộp nào'}
              description={
                hasActiveFilters
                  ? 'Thử đổi từ khoá tìm kiếm hoặc bộ lọc trạng thái/phiên thi.'
                  : 'Bài nộp sẽ xuất hiện ở đây ngay khi sinh viên bắt đầu thi và nộp bài.'
              }
              action={
                hasActiveFilters ? (
                  <Button type="button" variant="outline" onClick={clearFilters}>
                    Xoá bộ lọc
                  </Button>
                ) : undefined
              }
            />
          </Card>
        ) : (
          <>
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Sinh viên</TableHead>
                      <TableHead>Phiên thi</TableHead>
                      <TableHead>File</TableHead>
                      <TableHead>Trạng thái</TableHead>
                      <TableHead>Nộp lúc</TableHead>
                      <TableHead>Kích thước</TableHead>
                      <TableHead className="text-right">Thao tác</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data?.items.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>
                          <span className="font-medium text-foreground">{item.studentNameInput}</span>
                          <span className="ml-2 font-mono text-caption text-muted-foreground">
                            {item.studentMssv}
                          </span>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">{item.examSessionName}</TableCell>
                        <TableCell className="whitespace-nowrap font-mono text-small">
                          {item.requiredFilename}
                        </TableCell>
                        <TableCell>
                          <Badge variant={STATUS_BADGE_VARIANT[item.status]}>
                            {STATUS_LABELS[item.status]}
                          </Badge>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-muted-foreground">
                          {formatDateTime(item.submittedAt)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-muted-foreground">
                          {formatFileSize(item.fileSize) ?? String.fromCharCode(8212)}
                        </TableCell>
                        <TableCell className="text-right">
                          {item.downloadUrl ? (
                            <Button asChild variant="outline" size="sm">
                              <a
                                href={item.downloadUrl}
                                target="_blank"
                                rel="noreferrer"
                                download={item.requiredFilename}
                              >
                                Mở file
                              </a>
                            </Button>
                          ) : (
                            <span className="text-caption text-muted-foreground">
                              Chưa có file
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Card>

            <div className="flex items-center justify-between gap-4 text-small text-muted-foreground">
              <span>
                Trang {page}/{totalPages} • {total} bài nộp
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
