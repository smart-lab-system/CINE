'use client';

import { Suspense, use } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useCourseHubRubric } from '@/hooks/useMasterData';
import { formatVnPoints } from '@/lib/format';
import { formatCreatedAt } from '@/lib/format-created-at';
import { approachOrdinalLabel } from '@/lib/qs-rubric-form';

export default function AdminRubricDetailPage({
  params,
}: {
  params: Promise<{ id: string; rubricId: string }>;
}) {
  const { id, rubricId } = use(params);
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <RubricDetail courseId={id} rubricId={rubricId} />
    </Suspense>
  );
}

function RubricDetail({
  courseId,
  rubricId,
}: {
  courseId: string;
  rubricId: string;
}) {
  const detail = useCourseHubRubric(courseId, rubricId);
  const backHref = `/admin/master-data/courses/${courseId}?tab=rubrics`;

  if (detail.isLoading) {
    return <Skeleton className="h-64 w-full" />;
  }

  if (detail.isError || !detail.data) {
    return (
      <div className="flex flex-col gap-4">
        <Button asChild variant="ghost" size="sm" className="w-fit">
          <Link href={backHref}>
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Ngân hàng rubric
          </Link>
        </Button>
        <Alert variant="destructive">
          <AlertDescription>
            {detail.error instanceof Error
              ? detail.error.message
              : 'Không tải được rubric.'}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const rubric = detail.data;
  const isQs = rubric.kind === 'qs';

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-2">
          <Link href={backHref}>
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Ngân hàng rubric
          </Link>
        </Button>
        <PageHeader
          title={rubric.name}
          description={
            !rubric.isActive
              ? `Bản v${rubric.version} (không còn active)`
              : `Bản v${rubric.version}`
          }
        />
      </div>

      <dl className="grid gap-3 text-small sm:grid-cols-2">
        <div>
          <dt className="text-caption text-muted-foreground">Người tạo</dt>
          <dd>{rubric.teacherName ?? '-'}</dd>
        </div>
        <div>
          <dt className="text-caption text-muted-foreground">Thời điểm tạo</dt>
          <dd>{rubric.resolvedSemesterName ?? formatCreatedAt(rubric.createdAt)}</dd>
        </div>
        <div>
          <dt className="text-caption text-muted-foreground">Loại</dt>
          <dd>{isQs ? 'QS - theo câu' : 'QA - tiêu chí phẳng'}</dd>
        </div>
        <div>
          <dt className="text-caption text-muted-foreground">Tổng điểm</dt>
          <dd>{formatVnPoints(rubric.totalPoints)}</dd>
        </div>
      </dl>

      {isQs ? (
        <section className="flex flex-col gap-4">
          <h2 className="text-small font-semibold">
            Cách giải ({rubric.approaches.length})
          </h2>
          {rubric.approaches.map((ap, ai) => {
            const ordinal = approachOrdinalLabel(ai);
            const extra =
              ap.name.trim() && ap.name.trim() !== ordinal ? ` - ${ap.name.trim()}` : '';
            return (
              <article key={ap.key} className="rounded-md border border-border p-4">
                <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="font-medium">
                    {ordinal}
                    {extra}
                  </h3>
                  <span className="text-caption text-muted-foreground">
                    {ap.steps.length} bước · {formatVnPoints(ap.maxPoints)} điểm
                  </span>
                </div>
                <ol className="flex list-none flex-col gap-2">
                  {ap.steps.map((st, si) => (
                    <li key={st.key} className="flex gap-3 text-body">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-caption font-semibold">
                        {si + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-caption text-muted-foreground">Bước {si + 1}</p>
                        <p>{st.description}</p>
                      </div>
                      <span className="shrink-0 text-caption text-muted-foreground">
                        {formatVnPoints(st.maxPoints)} điểm
                      </span>
                    </li>
                  ))}
                </ol>
              </article>
            );
          })}
        </section>
      ) : (
        <section className="flex flex-col gap-3">
          <h2 className="text-small font-semibold">
            Tiêu chí ({rubric.criteria.length})
          </h2>
          {rubric.criteria.map((c, i) => (
            <article key={c.id} className="rounded-md border border-border p-4">
              <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-medium">Tiêu chí {i + 1}</h3>
                <span className="text-caption text-muted-foreground">
                  {formatVnPoints(c.maxPoints)} điểm
                </span>
              </div>
              <p className="text-body">{c.description}</p>
              <p className="mt-1 font-mono text-caption text-muted-foreground">
                {c.key}
              </p>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
