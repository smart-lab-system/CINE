'use client';

import Link from 'next/link';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useCourseExam } from '@/hooks/useExamBank';
import {
  COURSE_EXAM_LANGUAGE_OPTIONS,
  COURSE_EXAM_TYPE_OPTIONS,
} from '@/lib/api/exam-bank';

const TYPE_LABEL = Object.fromEntries(
  COURSE_EXAM_TYPE_OPTIONS.map((o) => [o.value, o.label]),
) as Record<string, string>;

const LANG_LABEL = Object.fromEntries(
  COURSE_EXAM_LANGUAGE_OPTIONS.map((o) => [o.value, o.label]),
) as Record<string, string>;

export function ExamBankPreviewDialog({
  examId,
  open,
  onOpenChange,
}: {
  examId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const detail = useCourseExam(open ? examId : null);
  const exam = detail.data;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[66.666vh] w-[66.666vw] max-w-[66.666vw] flex-col gap-4 overflow-hidden p-6 sm:rounded-lg">
        <DialogHeader className="shrink-0 pr-6">
          <DialogTitle>{exam?.title ?? 'Xem trước đề'}</DialogTitle>
          <DialogDescription>
            {exam
              ? `${exam.courseCode} - ${exam.courseName}`
              : 'Nội dung đề trong kho (chỉ xem).'}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          {detail.isLoading ? (
            <div className="flex flex-col gap-3 py-2">
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-5 w-1/2" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : detail.isError || !exam ? (
            <Alert variant="destructive">
              <AlertDescription>Không tải được đề để xem trước.</AlertDescription>
            </Alert>
          ) : (
            <div className="flex flex-col gap-5 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{TYPE_LABEL[exam.examType] ?? exam.examType}</Badge>
                <Badge variant={exam.status === 'ready' ? 'success' : 'default'}>
                  {exam.status === 'ready' ? 'Sẵn sàng' : 'Nháp'}
                </Badge>
                <span className="text-muted-foreground">
                  {LANG_LABEL[exam.language] ?? exam.language}
                </span>
                <span className="text-muted-foreground">
                  · {exam.totalPoints} điểm · {exam.questionCount} câu
                </span>
              </div>

              {exam.description?.trim() ? (
                <div className="rounded-md border border-border bg-muted/40 p-3 whitespace-pre-wrap">
                  {exam.description}
                </div>
              ) : null}

              <ol className="flex flex-col gap-4">
                {exam.questions.map((q, index) => (
                  <li key={q.id ?? index} className="rounded-md border border-border p-3">
                    <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-medium">
                        Câu {q.ordinal ?? index + 1}
                        {q.title?.trim() ? ` - ${q.title}` : ''}
                      </span>
                      <span className="text-muted-foreground tabular-nums">{q.points} điểm</span>
                    </div>
                    <p className="whitespace-pre-wrap text-foreground">{q.statement}</p>
                    {q.rubricName ? (
                      <p className="mt-2 text-caption text-muted-foreground">
                        Rubric: {q.rubricName}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>

        <DialogFooter className="shrink-0 gap-2 sm:gap-0">
          {examId ? (
            <Button asChild variant="outline">
              <Link href={`/teacher/exam-bank/${examId}`}>Mở để sửa</Link>
            </Button>
          ) : null}
          <Button type="button" onClick={() => onOpenChange(false)}>
            Đóng
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
