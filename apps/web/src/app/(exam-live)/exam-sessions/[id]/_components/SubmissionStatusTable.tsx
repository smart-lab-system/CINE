'use client';

import { useState } from 'react';
import { FileCheck } from 'lucide-react';
import { EmptyState } from '@/components/layout/empty-state';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import type {
  DeliverableColumn,
  DeliverableState,
  SubmissionRowStudent,
} from '@/lib/submission-rows';

const DEFAULT_EMPTY_STUDENTS_DESCRIPTION =
  'Bảng sẽ tự cập nhật ngay khi agent trên máy sinh viên nộp bài — không cần tải lại trang.';

interface SubmissionStatusTableProps {
  deliverables: DeliverableColumn[];
  students: SubmissionRowStudent[];
  /**
   * Overrides the "no students yet" copy. The default assumes a live,
   * still-updating table (true on the lobby page); the per-session
   * submissions detail page reuses this component post-hoc, with nothing
   * left to auto-update, so it supplies its own copy instead.
   */
  emptyStudentsDescription?: string;
}

/**
 * "Chưa nộp" is the absence of a row, not a status the server ever sends —
 * so it is derived here, from a deliverable having no entry for a student.
 * The three states are given a word AND a shape, never colour alone: this
 * table is watched from across a room on a projector, where a red/green
 * difference is the first thing to get lost.
 */
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
  pending: {
    label: 'Chưa nộp',
    text: 'text-muted-foreground',
    dot: 'bg-border',
    symbol: '—',
  },
};

function formatTime(iso: string | undefined): string | null {
  if (!iso) {
    return null;
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return date.toLocaleTimeString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

// QA-reported gap (point 2): the teacher had no way to see what format a
// submitted file actually is without opening it. There is no separately
// captured "real" format anywhere in the system (see submission.entity.ts —
// only storageKey/checksum/fileSize) — deriving it from the deliverable's
// OWN declared requiredFilename is not a guess, it's the same fact the rest
// of the system already treats as ground truth for what this deliverable
// IS (submission identity is an exact filename match, by design — see
// CLAUDE.md's collection rules), so no backend/agent change is needed.
function formatFileExtension(requiredFilename: string): string | null {
  const dot = requiredFilename.lastIndexOf('.');
  if (dot === -1 || dot === requiredFilename.length - 1) {
    return null;
  }
  return requiredFilename.slice(dot + 1).toUpperCase();
}

function formatFileSize(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes < 0) {
    return value;
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Students down, required deliverables across. A real <table> because the
 * data genuinely is a matrix — a screen reader can then announce which
 * filename a cell belongs to, which a div grid would lose entirely.
 */
export function SubmissionStatusTable({
  deliverables,
  students,
  emptyStudentsDescription = DEFAULT_EMPTY_STUDENTS_DESCRIPTION,
}: SubmissionStatusTableProps) {
  const [selectedStudentMssv, setSelectedStudentMssv] = useState<string | null>(null);
  const selectedStudent = selectedStudentMssv
    ? students.find((student) => student.studentMssv === selectedStudentMssv) ?? null
    : null;

  if (deliverables.length === 0) {
    return (
      <EmptyState
        icon={FileCheck}
        title="Phiên thi này chưa khai báo file bắt buộc"
        description="Không có gì để thu — hãy tạo lại phiên thi với danh sách file cần nộp."
        tone="muted"
      />
    );
  }

  if (students.length === 0) {
    return (
      <EmptyState
        icon={FileCheck}
        title="Chưa có bài nộp nào"
        description={emptyStudentsDescription}
        tone="muted"
      />
    );
  }

  return (
    // The matrix grows one column per required file, so it scrolls inside
    // its own container rather than pushing the page sideways.
    <>
      <div className="overflow-x-auto">
        <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead scope="col">Sinh viên</TableHead>
            {deliverables.map((deliverable) => (
              <TableHead key={deliverable.id} scope="col" className="whitespace-nowrap">
                {deliverable.requiredFilename}
              </TableHead>
            ))}
            <TableHead scope="col" className="whitespace-nowrap">
              Xem bài nộp
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {students.map((student) => (
            <TableRow key={student.studentMssv}>
              <TableCell>
                <span className="font-medium text-foreground">{student.fullName}</span>
                <span className="ml-2 font-mono text-caption text-muted-foreground">
                  {student.studentMssv}
                </span>
              </TableCell>
              {deliverables.map((deliverable) => {
                const cell = student.byDeliverable[deliverable.id];
                const state: DeliverableState = cell?.state ?? 'pending';
                const presentation = STATE_PRESENTATION[state];
                const time = formatTime(cell?.submittedAt);
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
                  </TableCell>
                );
              })}
              <TableCell className="whitespace-nowrap">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setSelectedStudentMssv(student.studentMssv)}
                  disabled={!deliverables.some((deliverable) => {
                    const cell = student.byDeliverable[deliverable.id];
                    return Boolean(cell?.downloadUrl);
                  })}
                >
                  Xem bài nộp
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
        </Table>
      </div>

      <Dialog open={selectedStudent !== null} onOpenChange={(open) => !open && setSelectedStudentMssv(null)}>
        <DialogContent className="sm:max-w-2xl">
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
                // Only shown once a file actually exists to describe — a
                // format label on a deliverable nobody submitted yet would
                // read as "there's a DOCX here" when there is nothing.
                const fileFormat = cell?.downloadUrl
                  ? formatFileExtension(deliverable.requiredFilename)
                  : null;

                return (
                  <div
                    key={deliverable.id}
                    className="flex flex-col gap-3 rounded-lg border border-border bg-surface-2/40 p-4 sm:flex-row sm:items-start sm:justify-between"
                  >
                    <div className="space-y-1">
                      <p className="font-medium text-foreground">{deliverable.requiredFilename}</p>
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
                    </div>

                    {cell?.downloadUrl ? (
                      <Button asChild variant="outline" size="sm">
                        {/* download's real fix is the API's
                            Content-Disposition header (cross-origin, so this
                            attribute alone is browser-ignored) — set anyway
                            as the honest hint for same-origin/future cases,
                            and so this line doesn't quietly claim the file
                            has no name of its own. */}
                        <a
                          href={cell.downloadUrl}
                          target="_blank"
                          rel="noreferrer"
                          download={deliverable.requiredFilename}
                        >
                          Mở file
                        </a>
                      </Button>
                    ) : (
                      <span className="text-caption text-muted-foreground">
                        Chưa có file để mở
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
