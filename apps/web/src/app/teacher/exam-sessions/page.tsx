'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { CalendarClock, Copy, DoorOpen, Plus } from 'lucide-react';
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
import { EXAM_TYPE_LABELS, getDisplaySessionStatus } from '@/lib/exam-session-display';
import { semesterOptions, useSemesterFilter } from '@/hooks/useSemesterFilter';
import { SemesterFilter } from '@/components/layout/semester-filter';
import type { ExamSessionStatusFilter, ExamType } from '@/lib/api/exam-session';

const STATUS_FILTER_LABELS: Record<ExamSessionStatusFilter, string> = {
  draft: 'Nháp',
  scheduled: 'Đã lên lịch',
  active: 'Đang diễn ra',
  collecting: 'Đang thu bài',
  completed: 'Đã kết thúc',
  cancelled: 'Đã hủy',
};
const STATUS_FILTER_OPTIONS = Object.keys(STATUS_FILTER_LABELS) as ExamSessionStatusFilter[];
const EXAM_TYPE_OPTIONS: ExamType[] = ['TK', 'GK', 'CK'];

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

/**
 * Lọc theo học kỳ, mặc định là kỳ hợp lý nhất hôm nay (tính từ ngày, xem
 * `useSemesterFilter` — cùng định nghĩa mà badge trên topbar, "Lớp của
 * tôi" và trang Bài thu đang đọc). Thêm 2026-09-15: yêu cầu QA "Tạo filter
 * cho cả trang quản lý kỳ thi và bài thu" lần đầu chỉ làm ba bộ lọc
 * tên/trạng thái/loại, nên một giảng viên dạy qua nhiều kỳ phải lật từng
 * trang 20 dòng mới tìm lại được phiên của kỳ cũ.
 *
 * "Tất cả học kỳ" luôn nằm trong dropdown: phiên của kỳ cũ vẫn phải mở
 * lại được để tra bài thi bù (CLAUDE.md §1.2 — học kỳ không bao giờ chặn
 * một thao tác).
 */
export default function ExamSessionsListPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<ExamSessionStatusFilter | 'all'>('all');
  const [examType, setExamType] = useState<ExamType | 'all'>('all');
  const debouncedSearch = useDebouncedValue(search, 300);
  const semesterFilter = useSemesterFilter('teacher-exam-sessions');

  const { data, error, isLoading, refetch } = useExamSessions({
    page,
    pageSize: PAGE_SIZE,
    search: debouncedSearch.trim() || undefined,
    status: status === 'all' ? undefined : status,
    examType: examType === 'all' ? undefined : examType,
    // `?? undefined`: null nghĩa là "tất cả kỳ", và cách nói điều đó với
    // API là KHÔNG gửi tham số — xem doc của SearchExamSessionsParams.
    semesterName: semesterFilter.semesterName ?? undefined,
  });

  // Lựa chọn lấy từ chính các phiên đã tải. Giữ lại giá trị đang lọc: khi
  // bộ lọc thu hẹp kết quả xuống một kỳ, danh sách nguồn cũng chỉ còn kỳ
  // đó — không giữ thì dropdown tự xoá mọi lựa chọn khác ngay sau cú chọn
  // đầu tiên, và người dùng không còn đường quay lại.
  const [seenSemesters, setSeenSemesters] = useState<string[]>([]);
  useEffect(() => {
    const fromPage = (data?.items ?? []).map((item) => item.semesterName);
    setSeenSemesters((previous) => semesterOptions([...previous, ...fromPage]));
  }, [data]);
  const semesterChoices = semesterOptions([
    ...seenSemesters,
    semesterFilter.semesterName,
  ]);

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasActiveFilters = search.trim() !== '' || status !== 'all' || examType !== 'all';

  function handleSearchChange(value: string) {
    setSearch(value);
    setPage(1);
  }

  function handleStatusChange(value: string) {
    setStatus(value as typeof status);
    setPage(1);
  }

  function handleExamTypeChange(value: string) {
    setExamType(value as typeof examType);
    setPage(1);
  }

  function handleSemesterChange(value: string | null) {
    semesterFilter.setSemesterName(value);
    // Đang ở trang 3 của kỳ này mà đổi kỳ thì trang 3 của kỳ kia có thể
    // không tồn tại, và bảng hiện ra rỗng như thể kỳ đó không có phiên nào.
    setPage(1);
  }

  function clearFilters() {
    setSearch('');
    setStatus('all');
    setExamType('all');
    setPage(1);
  }

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

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <SemesterFilter
          value={semesterFilter.semesterName}
          onChange={handleSemesterChange}
          semesters={semesterChoices}
        />
        <Input
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder="Tìm theo tên hoặc mã phiên thi..."
          className="sm:max-w-xs"
          aria-label="Tìm kiếm phiên thi"
        />
        <Select value={status} onValueChange={handleStatusChange}>
          <SelectTrigger className="sm:w-48" aria-label="Lọc theo trạng thái">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả trạng thái</SelectItem>
            {STATUS_FILTER_OPTIONS.map((value) => (
              <SelectItem key={value} value={value}>
                {STATUS_FILTER_LABELS[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={examType} onValueChange={handleExamTypeChange}>
          <SelectTrigger className="sm:w-40" aria-label="Lọc theo loại kỳ thi">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả loại</SelectItem>
            {EXAM_TYPE_OPTIONS.map((value) => (
              <SelectItem key={value} value={value}>
                {EXAM_TYPE_LABELS[value] ?? value}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

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
            {/* Ba câu chuyện khác nhau, không được nói chung một câu.
                "Bộ lọc không khớp" thì xoá bộ lọc; "kỳ này bạn không có
                phiên nào" thì đổi kỳ — và chỉ khi KHÔNG lọc gì cả thì mới
                thật sự là "bạn chưa tạo phiên nào bao giờ" và mới nên mời
                họ tạo. Cùng khuôn với "Lớp của tôi". */}
            {hasActiveFilters ? (
              <EmptyState
                icon={CalendarClock}
                title="Không tìm thấy phiên thi phù hợp"
                description="Thử đổi từ khoá tìm kiếm hoặc bộ lọc trạng thái/loại kỳ thi."
                action={
                  <Button type="button" variant="outline" onClick={clearFilters}>
                    Xoá bộ lọc
                  </Button>
                }
              />
            ) : semesterFilter.semesterName !== null ? (
              <EmptyState
                icon={CalendarClock}
                title="Không có phiên thi nào trong học kỳ này"
                description="Bạn có thể chọn học kỳ khác, hoặc xem toàn bộ phiên thi đã từng tạo."
                tone="muted"
                action={
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => handleSemesterChange(null)}
                  >
                    Xem tất cả học kỳ
                  </Button>
                }
              />
            ) : (
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
            )}
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
