'use client';

import { useMemo, useRef, useState } from 'react';
import { ClipboardList, FileCheck, Trash2 } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/layout/empty-state';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { Attendance } from '@/lib/api/attendance';
import {
  filterLobbyRows,
  matchesLobbySearch,
  ROOM_STATUS_LABEL,
  type LobbyRosterFilter,
  type LobbyRosterRow,
  type RoomStatus,
} from '@/lib/lobby-roster';
import type { DeliverableColumn, DeliverableState } from '@/lib/submission-rows';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { DiscrepancyNotice } from './DiscrepancyNotice';
import { formatAttendanceTime, StudentMarks } from './student-marks';

const STATE_PRESENTATION: Record<
  DeliverableState,
  { label: string; text: string; dot: string; symbol: string }
> = {
  collected: {
    label: 'Đã nộp',
    text: 'text-success-strong',
    dot: 'bg-success',
    symbol: '✓',
  },
  invalid: {
    label: 'Không hợp lệ',
    text: 'text-danger-strong',
    dot: 'bg-danger',
    symbol: '✕',
  },
  absent: {
    label: 'Vắng thi',
    text: 'text-warning-strong',
    dot: 'bg-warning',
    symbol: '○',
  },
  pending: {
    label: 'Chưa nộp',
    text: 'text-muted-foreground',
    dot: 'bg-border',
    symbol: '—',
  },
};

const ROOM_BADGE_VARIANT: Record<
  RoomStatus,
  'success' | 'warning' | 'info' | 'destructive' | 'default'
> = {
  not_joined: 'warning',
  present: 'success',
  disconnected: 'destructive',
  absent: 'destructive',
  makeup: 'info',
  unknown: 'default',
};

const STICKY_HEAD_RULE = 'shadow-[inset_0_-1px_0_hsl(var(--border))]';

const SCROLL_CONTAINER = {
  role: 'region',
  'aria-label': 'Danh sách sinh viên vận hành phiên thi',
  tabIndex: 0,
  className: 'max-h-[min(32rem,70dvh)] overflow-auto',
} as const;

const FILTERS: { id: LobbyRosterFilter; label: string }[] = [
  { id: 'all', label: 'Tất cả' },
  { id: 'not_joined', label: 'Chưa kết nối' },
  { id: 'present', label: 'Có mặt' },
  { id: 'absent', label: 'Vắng mặt' },
  { id: 'makeup', label: 'Thi bổ sung' },
  { id: 'not_submitted', label: 'Chưa nộp' },
];

function viewButtonDomId(mssv: string): string {
  return `lobby-view-${encodeURIComponent(mssv)}`;
}

function formatTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleTimeString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatFileExtension(requiredFilename: string): string | null {
  const dot = requiredFilename.lastIndexOf('.');
  if (dot === -1 || dot === requiredFilename.length - 1) return null;
  return requiredFilename.slice(dot + 1).toUpperCase();
}

function describeArchiveCheck(cell: {
  archiveCheckStatus?: 'not_applicable' | 'pending' | 'passed' | 'failed' | 'unreadable';
  archiveMissingEntries?: string[] | null;
  archiveCheckError?: string | null;
}): { text: string; tone: string } | null {
  switch (cell.archiveCheckStatus) {
    case 'pending':
      return { text: 'Đang kiểm', tone: 'text-muted-foreground' };
    case 'passed':
      return { text: 'Đủ nội dung', tone: 'text-success-strong' };
    case 'failed':
      return {
        text: `Thiếu: ${(cell.archiveMissingEntries ?? []).join(', ')}`,
        tone: 'text-danger-strong',
      };
    case 'unreadable':
      return { text: `Không mở được: ${cell.archiveCheckError ?? ''}`, tone: 'text-danger-strong' };
    case 'not_applicable':
    case undefined:
      return null;
  }
}

function formatFileSize(value: string | null | undefined): string | null {
  if (!value) return null;
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes < 0) return value;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export interface LobbyRosterTableProps {
  rows: LobbyRosterRow[];
  deliverables: DeliverableColumn[];
  startTime: string;
  filter: LobbyRosterFilter;
  onFilterChange: (f: LobbyRosterFilter) => void;
  canConfirm: boolean;
  confirming: boolean;
  confirmError: Error | null;
  onConfirm: () => void;
  confirmedAt: string | null;
  confirmedCount: number | null;
  noClass: boolean;
  discrepancy: Attendance['discrepancy'];
  /** Cảnh báo REST submissions fail — bảng chỉ hiện bài từ lúc mở trang */
  submissionsError?: boolean;
  isLoading?: boolean;
  attendanceError?: Error | null;
  /** Cho phép gỡ SV `source=manual` (phiên chưa kết thúc). */
  canRemoveManual?: boolean;
  removingMssv?: string | null;
  onRemoveManual?: (mssv: string) => void;
}

/**
 * Bảng SV gộp: trạng thái + ghi chú tự sinh + ma trận nộp bài (exam-ops-lobby-ux).
 */
export function LobbyRosterTable({
  rows,
  deliverables,
  startTime,
  filter,
  onFilterChange,
  canConfirm,
  confirming,
  confirmError,
  onConfirm,
  confirmedAt,
  confirmedCount,
  noClass,
  discrepancy,
  submissionsError = false,
  isLoading = false,
  attendanceError = null,
  canRemoveManual = false,
  removingMssv = null,
  onRemoveManual,
}: LobbyRosterTableProps) {
  const [selectedStudentMssv, setSelectedStudentMssv] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const closingStudentMssvRef = useRef<string | null>(null);

  const hasMakeup = rows.some((row) => row.roomStatus === 'makeup');
  const showRemoveColumn =
    canRemoveManual && rows.some((row) => row.rosterSource === 'manual');
  const visibleRows = useMemo(
    () =>
      filterLobbyRows(rows, filter, deliverables).filter((row) =>
        matchesLobbySearch(row, searchQuery),
      ),
    [rows, filter, deliverables, searchQuery],
  );

  const selectedStudent = selectedStudentMssv
    ? rows.find((row) => row.studentMssv === selectedStudentMssv) ?? null
    : null;

  const returnFocusToRow = (mssv: string) => {
    document.getElementById(viewButtonDomId(mssv))?.focus();
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6 text-body text-muted-foreground">
          Đang tải danh sách sinh viên…
        </CardContent>
      </Card>
    );
  }

  if (attendanceError) {
    return (
      <Card>
        <CardContent className="p-6">
          <Alert variant="destructive">
            <AlertDescription>
              {attendanceError.message ?? 'Không tải được danh sách điểm danh.'}
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-4 border-b border-border bg-surface-2/60">
        <CardTitle className="text-h3">Danh sách sinh viên</CardTitle>
        <div className="flex flex-wrap items-center gap-3">
          {confirmedAt ? (
            <span className="text-small text-muted-foreground">
              Đã xác nhận{' '}
              <strong className="tabular-nums text-foreground">{confirmedCount}</strong> lúc{' '}
              {formatAttendanceTime(confirmedAt)}
            </span>
          ) : null}
          <Button
            type="button"
            variant={confirmedAt ? 'outline' : 'default'}
            size="sm"
            disabled={!canConfirm || confirming || noClass}
            onClick={onConfirm}
          >
            <ClipboardList className="h-4 w-4" aria-hidden="true" />
            {confirmedAt ? 'Xác nhận lại sĩ số' : 'Xác nhận sĩ số'}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-4 p-4 sm:p-6">
        {confirmError && (
          <Alert variant="destructive">
            <AlertDescription>{confirmError.message}</AlertDescription>
          </Alert>
        )}

        {noClass && (
          <Alert variant="info">
            <AlertDescription>
              Phiên thi này được tạo trước khi phiên thi gắn với một lớp, nên không có danh sách
              để đối chiếu. Vẫn xem được ai đang kết nối, nhưng không xác nhận được sĩ số.
            </AlertDescription>
          </Alert>
        )}

        {discrepancy && <DiscrepancyNotice discrepancy={discrepancy} />}

        {submissionsError && (
          <Alert variant="warning">
            <AlertDescription>
              Không tải được danh sách bài đã nộp trước đó. Bảng dưới chỉ hiển thị các bài nộp
              phát sinh từ lúc mở trang này.
            </AlertDescription>
          </Alert>
        )}

        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Lọc danh sách sinh viên">
            {FILTERS.map((item) => {
              if (item.id === 'makeup' && !hasMakeup) {
                return null;
              }
              const active = filter === item.id;
              return (
                <Button
                  key={item.id}
                  type="button"
                  size="sm"
                  variant={active ? 'default' : 'outline'}
                  aria-pressed={active}
                  onClick={() => onFilterChange(item.id)}
                >
                  {item.label}
                </Button>
              );
            })}
          </div>
          <Input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm họ tên hoặc MSSV"
            aria-label="Tìm họ tên hoặc MSSV"
            className="w-full sm:max-w-xs"
          />
        </div>
      </CardContent>

      {deliverables.length === 0 && (
        <div className="border-t border-border px-6 py-3">
          <Alert variant="info">
            <AlertDescription>
              Phiên thi này chưa khai báo file bắt buộc — vẫn xem được điểm danh; không có cột nộp
              bài để thu.
            </AlertDescription>
          </Alert>
        </div>
      )}

      {visibleRows.length === 0 ? (
        <div className="border-t border-border px-6 pb-6">
          <EmptyState
            icon={FileCheck}
            title={rows.length === 0 ? 'Chưa có sinh viên nào' : 'Không có sinh viên khớp bộ lọc'}
            description={
              rows.length === 0
                ? 'Bảng sẽ tự cập nhật khi có điểm danh hoặc bài nộp — không cần tải lại trang.'
                : 'Thử chọn bộ lọc khác.'
            }
            tone="muted"
          />
        </div>
      ) : (
        <Table container={SCROLL_CONTAINER}>
          <TableHeader className="sticky top-0 z-10 [&_tr]:border-b-0">
            <TableRow className="hover:bg-transparent">
              <TableHead scope="col" className={STICKY_HEAD_RULE}>
                Họ tên
              </TableHead>
              <TableHead scope="col" className={STICKY_HEAD_RULE}>
                MSSV
              </TableHead>
              <TableHead scope="col" className={cn('whitespace-nowrap', STICKY_HEAD_RULE)}>
                Trạng thái
              </TableHead>
              <TableHead scope="col" className={STICKY_HEAD_RULE}>
                Ghi chú
              </TableHead>
              {deliverables.map((deliverable) => (
                <TableHead
                  key={deliverable.id}
                  scope="col"
                  className={cn('whitespace-nowrap', STICKY_HEAD_RULE)}
                >
                  {deliverable.requiredFilename}
                </TableHead>
              ))}
              {deliverables.length > 0 && (
                <TableHead scope="col" className={cn('whitespace-nowrap', STICKY_HEAD_RULE)}>
                  Xem bài nộp
                </TableHead>
              )}
              {showRemoveColumn ? (
                <TableHead scope="col" className={cn('text-right', STICKY_HEAD_RULE)}>
                  <span className="sr-only">Gỡ khỏi danh sách dự thi</span>
                </TableHead>
              ) : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleRows.map((row) => (
              <TableRow key={row.studentMssv}>
                <TableCell className="font-medium text-foreground">{row.fullName}</TableCell>
                <TableCell className="font-mono text-muted-foreground">{row.studentMssv}</TableCell>
                <TableCell className="whitespace-nowrap">
                  <Badge variant={ROOM_BADGE_VARIANT[row.roomStatus]}>
                    {ROOM_STATUS_LABEL[row.roomStatus]}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex flex-col gap-1.5">
                    {row.attendanceStudent ? (
                      <StudentMarks student={row.attendanceStudent} startTime={startTime} />
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                    {row.makeupFromClass && (
                      <Badge variant="info" className="w-fit">
                        Lớp gốc: {row.makeupFromClass}
                      </Badge>
                    )}
                    {row.rosterSource === 'manual' ? (
                      <Badge variant="outline" className="w-fit">
                        Thêm tay
                      </Badge>
                    ) : null}
                  </div>
                </TableCell>
                {deliverables.map((deliverable) => {
                  const cell = row.byDeliverable[deliverable.id];
                  const state: DeliverableState = cell?.state ?? 'pending';
                  const presentation = STATE_PRESENTATION[state];
                  const time = formatTime(cell?.submittedAt);
                  const archiveCheck = cell ? describeArchiveCheck(cell) : null;
                  return (
                    <TableCell key={deliverable.id} className="whitespace-nowrap">
                      <span
                        className={cn(
                          'inline-flex items-center gap-2 font-medium',
                          presentation.text,
                        )}
                      >
                        <span
                          className={cn('h-2 w-2 shrink-0 rounded-full', presentation.dot)}
                          aria-hidden="true"
                        />
                        <span aria-hidden="true">{presentation.symbol}</span>
                        {presentation.label}
                      </span>
                      {time && (
                        <span className="ml-2 tabular-nums text-caption text-muted-foreground">
                          {time}
                        </span>
                      )}
                      {cell?.filename && cell.filename !== deliverable.requiredFilename && (
                        <p className="mt-1 font-mono text-caption text-muted-foreground">
                          {cell.filename}
                        </p>
                      )}
                      {archiveCheck && (
                        <p className={cn('mt-1 whitespace-normal text-caption', archiveCheck.tone)}>
                          {archiveCheck.text}
                        </p>
                      )}
                    </TableCell>
                  );
                })}
                {deliverables.length > 0 && (
                  <TableCell className="whitespace-nowrap">
                    <Button
                      id={viewButtonDomId(row.studentMssv)}
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedStudentMssv(row.studentMssv)}
                      disabled={
                        !deliverables.some((deliverable) =>
                          Boolean(row.byDeliverable[deliverable.id]?.downloadUrl),
                        )
                      }
                    >
                      Xem bài nộp
                    </Button>
                  </TableCell>
                )}
                {showRemoveColumn ? (
                  <TableCell className="whitespace-nowrap text-right">
                    {row.rosterSource === 'manual' && onRemoveManual ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-label={`Gỡ ${row.studentMssv} khỏi danh sách dự thi`}
                        loading={removingMssv === row.studentMssv}
                        onClick={() => {
                          if (
                            !confirm(
                              `Gỡ ${row.fullName} (${row.studentMssv}) khỏi danh sách dự thi? Chỉ gỡ được SV thêm tay chưa nộp bài.`,
                            )
                          ) {
                            return;
                          }
                          onRemoveManual(row.studentMssv);
                        }}
                      >
                        <Trash2 className="h-4 w-4 text-danger-strong" aria-hidden="true" />
                      </Button>
                    ) : null}
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog
        open={selectedStudent !== null}
        onOpenChange={(open) => {
          if (open) return;
          closingStudentMssvRef.current = selectedStudentMssv;
          setSelectedStudentMssv(null);
        }}
      >
        <DialogContent
          className="sm:max-w-2xl"
          onCloseAutoFocus={(event) => {
            const closing = closingStudentMssvRef.current;
            if (!closing) return;
            event.preventDefault();
            returnFocusToRow(closing);
            closingStudentMssvRef.current = null;
          }}
        >
          <DialogHeader>
            <DialogTitle>Xem bài nộp</DialogTitle>
            <DialogDescription>
              {selectedStudent ? (
                <>
                  {selectedStudent.fullName} · {selectedStudent.studentMssv}
                </>
              ) : null}
            </DialogDescription>
          </DialogHeader>

          {selectedStudent && (
            <div className="space-y-3">
              {deliverables.map((deliverable) => {
                const cell = selectedStudent.byDeliverable[deliverable.id];
                const state: DeliverableState = cell?.state ?? 'pending';
                const presentation = STATE_PRESENTATION[state];
                const time = formatTime(cell?.submittedAt);
                const fileSize = formatFileSize(cell?.fileSize);
                const fileName = cell?.filename || deliverable.requiredFilename;
                const fileFormat = cell?.downloadUrl ? formatFileExtension(fileName) : null;
                const archiveCheck = cell ? describeArchiveCheck(cell) : null;

                return (
                  <div
                    key={deliverable.id}
                    className="flex flex-col gap-3 rounded-lg border border-border bg-surface-2/40 p-4 sm:flex-row sm:items-start sm:justify-between"
                  >
                    <div className="space-y-1">
                      <p className="font-medium text-foreground">{fileName}</p>
                      <p className={cn('inline-flex items-center gap-2 text-sm', presentation.text)}>
                        <span
                          className={cn('h-2 w-2 shrink-0 rounded-full', presentation.dot)}
                          aria-hidden="true"
                        />
                        <span aria-hidden="true">{presentation.symbol}</span>
                        {presentation.label}
                      </p>
                      {time && <p className="text-caption text-muted-foreground">Nộp lúc {time}</p>}
                      {fileSize && (
                        <p className="text-caption text-muted-foreground">Kích thước: {fileSize}</p>
                      )}
                      {fileFormat && (
                        <p className="text-caption text-muted-foreground">Định dạng: {fileFormat}</p>
                      )}
                      {archiveCheck && (
                        <p className={cn('text-caption', archiveCheck.tone)}>{archiveCheck.text}</p>
                      )}
                    </div>

                    {cell?.downloadUrl ? (
                      <Button asChild variant="outline" size="sm">
                        <a
                          href={cell.downloadUrl}
                          target="_blank"
                          rel="noreferrer"
                          download={fileName}
                        >
                          Mở file
                        </a>
                      </Button>
                    ) : (
                      <span className="text-caption text-muted-foreground">Chưa có file để mở</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
