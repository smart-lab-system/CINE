'use client';

import { Suspense, use } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useCourseHubExam } from '@/hooks/useMasterData';
import { formatVnPoints } from '@/lib/format';
import { formatCreatedAt } from '@/lib/format-created-at';

export default function AdminExamDetailPage({
  params,
}: {
  params: Promise<{ id: string; examId: string }>;
}) {
  const { id, examId } = use(params);
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <ExamDetail courseId={id} examId={examId} />
    </Suspense>
  );
}

function ExamDetail({ courseId, examId }: { courseId: string; examId: string }) {
  const detail = useCourseHubExam(courseId, examId);
  const backHref = `/admin/master-data/courses/${courseId}?tab=exams`;

  if (detail.isLoading) {
    return <Skeleton className="h-64 w-full" />;
  }

  if (detail.isError || !detail.data) {
    return (
      <div className="flex flex-col gap-4">
        <Button asChild variant="ghost" size="sm" className="w-fit">
          <Link href={backHref}>
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Ngân hàng đề thi
          </Link>
        </Button>
        <Alert variant="destructive">
          <AlertDescription>
            {detail.error instanceof Error
              ? detail.error.message
              : 'Không tải được đề thi.'}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const exam = detail.data;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-2">
          <Link href={backHref}>
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Ngân hàng đề thi
          </Link>
        </Button>
        <PageHeader title={exam.title} />
      </div>

      <dl className="grid gap-3 text-small sm:grid-cols-2">
        <div>
          <dt className="text-caption text-muted-foreground">Môn</dt>
          <dd>
            {exam.courseCode} — {exam.courseName}
          </dd>
        </div>
        <div>
          <dt className="text-caption text-muted-foreground">Người tạo</dt>
          <dd>{exam.createdByName ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-caption text-muted-foreground">Thời điểm tạo</dt>
          <dd>{exam.resolvedSemesterName ?? formatCreatedAt(exam.createdAt)}</dd>
        </div>
        <div>
          <dt className="text-caption text-muted-foreground">Tổng điểm</dt>
          <dd>{formatVnPoints(exam.totalPoints)}</dd>
        </div>
        <div>
          <dt className="text-caption text-muted-foreground">Ngôn ngữ</dt>
          <dd>{exam.language}</dd>
        </div>
        <div>
          <dt className="text-caption text-muted-foreground">Loại đề</dt>
          <dd>{exam.examType}</dd>
        </div>
      </dl>

      {exam.description ? (
        <section className="rounded-md border border-border p-4">
          <h2 className="mb-2 text-small font-semibold">Mô tả</h2>
          <p className="whitespace-pre-wrap text-body text-muted-foreground">
            {exam.description}
          </p>
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <h2 className="text-small font-semibold">
          Câu hỏi ({exam.questions.length})
        </h2>
        {exam.questions.map((q) => (
          <article key={q.id} className="rounded-md border border-border p-4">
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="font-medium">
                Câu {q.ordinal}
                {q.title ? ` — ${q.title}` : ''}
              </h3>
              <span className="text-caption text-muted-foreground">
                {formatVnPoints(q.points)} điểm
                {q.rubricName ? ` · Rubric: ${q.rubricName}` : ''}
              </span>
            </div>
            <p className="whitespace-pre-wrap text-body">{q.statement}</p>
          </article>
        ))}
      </section>
    </div>
  );
}
