'use client';

import { FileCheck } from 'lucide-react';
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

export type DeliverableState = 'collected' | 'invalid' | 'pending';

export interface SubmissionRowStudent {
  studentMssv: string;
  /** Whatever the student typed into the agent; falls back to the MSSV. */
  fullName: string;
  /** Keyed by requiredDeliverableId. A missing key means "chưa nộp". */
  byDeliverable: Record<string, { state: DeliverableState; submittedAt?: string }>;
}

export interface DeliverableColumn {
  id: string;
  requiredFilename: string;
}

interface SubmissionStatusTableProps {
  deliverables: DeliverableColumn[];
  students: SubmissionRowStudent[];
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

/**
 * Students down, required deliverables across. A real <table> because the
 * data genuinely is a matrix — a screen reader can then announce which
 * filename a cell belongs to, which a div grid would lose entirely.
 */
export function SubmissionStatusTable({
  deliverables,
  students,
}: SubmissionStatusTableProps) {
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
        description="Bảng sẽ tự cập nhật ngay khi agent trên máy sinh viên nộp bài — không cần tải lại trang."
        tone="muted"
      />
    );
  }

  return (
    // The matrix grows one column per required file, so it scrolls inside
    // its own container rather than pushing the page sideways.
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
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
