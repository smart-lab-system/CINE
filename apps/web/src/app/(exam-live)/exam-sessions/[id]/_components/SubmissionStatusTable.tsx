'use client';

import { useEffect, useRef, useState } from 'react';
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
  /**
   * Đến từ luồng search (`?student=`): highlight dòng của SV này và mở sẵn
   * dialog bài nộp của họ, ĐÚNG MỘT LẦN. Vắng mặt ở trang lobby, nên trang
   * đó không đổi hành vi. Xem spec §5.2 và sáu cái bẫy ở §6.
   */
  focusStudentMssv?: string;
  /**
   * Điểm CHỈ-ĐỌC theo MSSV, chỉ trang chi tiết post-hoc truyền. Vắng mặt ở
   * trang lobby: giữa lúc thi thì điểm chưa tồn tại và không có nghĩa gì.
   * Tầng 2 (spec §7) mới làm chấm/chấm lại thật.
   */
  gradingByMssv?: Record<string, { score: number | null; status: string }>;
}

/** id DOM phải ổn định để effect focus tìm lại được đúng dòng. */
function rowDomId(mssv: string): string {
  return `submission-row-${encodeURIComponent(mssv)}`;
}
function viewButtonDomId(mssv: string): string {
  return `submission-view-${encodeURIComponent(mssv)}`;
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
  focusStudentMssv,
  gradingByMssv,
}: SubmissionStatusTableProps) {
  const [selectedStudentMssv, setSelectedStudentMssv] = useState<string | null>(null);
  const selectedStudent = selectedStudentMssv
    ? students.find((student) => student.studentMssv === selectedStudentMssv) ?? null
    : null;

  // Bẫy 2: React Query refetch tạo mảng `students` MỚI mỗi lần. Nếu effect
  // dưới phụ thuộc vào `students`, dialog sẽ tự bật lại ngay giữa lúc giảng
  // viên đang đọc. Ref chốt "đã áp dụng rồi", và chỉ reset khi
  // focusStudentMssv đổi — không phải khi students đổi.
  const appliedFocusRef = useRef<string | null>(null);

  useEffect(() => {
    // Bẫy 6: không có prop (trang lobby) thì không được tự mở dialog nào cả.
    if (!focusStudentMssv) return;
    if (appliedFocusRef.current === focusStudentMssv) return;

    // Bẫy 1: render đầu tiên students còn rỗng (query đang chạy). Điều kiện
    // kích hoạt là "đã tìm thấy dòng", không phải "vừa mount".
    const match = students.find(
      (student) => student.studentMssv.toLowerCase() === focusStudentMssv.toLowerCase(),
    );
    // Bẫy 3: URL cũ hoặc sửa tay -> không có dòng nào khớp. Im lặng bỏ qua.
    if (!match) return;

    appliedFocusRef.current = focusStudentMssv;
    setSelectedStudentMssv(match.studentMssv);

    const row = document.getElementById(rowDomId(match.studentMssv));
    if (row) {
      // Bẫy 5: tôn trọng prefers-reduced-motion.
      const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      row.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
    }
  }, [focusStudentMssv, students]);

  // Bẫy 4: Radix trả focus về trigger khi đóng dialog, nhưng dialog này mở
  // bằng code nên không có trigger — mặc định của Radix là để focus ở
  // phần tử đã focus TRƯỚC KHI dialog mở, tức là <body>, và giảng viên mất
  // vị trí. Trả nó về nút "Xem bài nộp" của chính dòng đó.
  const returnFocusToRow = (mssv: string) => {
    document.getElementById(viewButtonDomId(mssv))?.focus();
  };

  // `onOpenChange` chạy đồng bộ khi dialog đóng, nhưng gọi returnFocusToRow
  // ngay trong đó không có tác dụng: lúc này `DialogContent` — và
  // `FocusScope` bên trong nó — vẫn còn mounted, và guard "trapped" của
  // FocusScope lập tức revert bất kỳ `.focus()` nào nhắm ra ngoài container
  // dialog trở lại bên trong nó. Ref này nhớ SV nào đang đóng, để
  // `onCloseAutoFocus` bên dưới — đúng lúc `DialogContent` unmount và
  // FocusScope không còn giữ trap nữa — mới preventDefault() hành vi mặc
  // định của Radix (trả về <body>, vì không có trigger thật) và focus
  // đúng chỗ thay vào đó.
  const closingStudentMssvRef = useRef<string | null>(null);

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
          {students.map((student) => {
            // Tính một lần, dùng lại cho cả aria-current lẫn className — hai
            // nơi dùng cùng một điều kiện thì chỉ nên có một chỗ định nghĩa
            // nó là gì.
            const isFocused = Boolean(
              focusStudentMssv &&
                student.studentMssv.toLowerCase() === focusStudentMssv.toLowerCase(),
            );
            return (
              <TableRow
                key={student.studentMssv}
                id={rowDomId(student.studentMssv)}
                aria-current={isFocused ? 'true' : undefined}
                className={cn(isFocused && 'bg-info-subtle')}
              >
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
                    id={viewButtonDomId(student.studentMssv)}
                    type="button"
                    variant="outline"
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
            );
          })}
        </TableBody>
        </Table>
      </div>

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
            // Chặn Radix trả focus về mặc định của nó (<body>, vì không có
            // trigger thật) rồi tự trả focus về đúng dòng.
            event.preventDefault();
            returnFocusToRow(closing);
            // Reset sau khi dùng: ref này chỉ được gán trong onOpenChange,
            // nhưng onCloseAutoFocus lại chạy khi DialogContent unmount —
            // hai thời điểm đó có thể tách rời nhau. Nếu một cập nhật
            // socket trên trang lobby xoá SV đang mở dialog khỏi `students`
            // giữa chừng, dialog đóng lại mà KHÔNG qua onOpenChange, và nếu
            // không reset thì lần đóng kế tiếp sẽ đọc lại MSSV cũ này, focus
            // nhầm dòng.
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

              {(() => {
                const grade = gradingByMssv?.[selectedStudent.studentMssv];
                if (!grade) return null;
                return (
                  <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface-2/40 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="space-y-1">
                      <p className="font-medium text-foreground">
                        Điểm AI: {grade.score ?? '—'}
                      </p>
                      <p className="text-caption text-muted-foreground">
                        Có khi module chấm điểm hoàn thiện
                      </p>
                    </div>
                    {/* Disabled kèm lý do nhìn thấy được, theo quy ước sẵn có
                        của codebase (placeholder-page.tsx, StatCard.hint) —
                        một nút trông sống mà bấm không ra gì là cách nhanh
                        nhất dạy giảng viên rằng app hỏng. Spec §5.4. */}
                    <Button type="button" variant="outline" size="sm" disabled>
                      Chấm lại
                    </Button>
                  </div>
                );
              })()}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
