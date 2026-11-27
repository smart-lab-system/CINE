'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { QsStructurePanels } from '@/app/teacher/rules/_components/QsStructurePanels';
import { useCurrentAccount } from '@/hooks/useCurrentAccount';
import { useExamsLinkingRubric } from '@/hooks/useExamBank';
import { useRubric } from '@/hooks/useGrading';
import { useSemesters } from '@/hooks/useMasterData';
import { useTeachingClasses } from '@/hooks/useTeaching';
import { formatVnPoints } from '@/lib/format';
import { formatCreatedTermLabel } from '../filter-qs-rubrics';

export default function QsRubricDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const detail = useRubric(id);
  const teaching = useTeachingClasses();
  const account = useCurrentAccount();
  const allSemestersQuery = useSemesters({ page: 1, pageSize: 100 });

  const rubric = detail.data;
  const exams = useExamsLinkingRubric(rubric?.courseId ?? null, rubric?.id ?? null);

  const courseLabel = useMemo(() => {
    if (!rubric?.courseId) return '-';
    const hit = (teaching.data ?? []).find((k) => k.courseId === rubric.courseId);
    return hit?.courseName ?? '-';
  }, [rubric?.courseId, teaching.data]);

  const createdTermLabel = useMemo(() => {
    if (!rubric) return '-';
    return formatCreatedTermLabel(
      rubric.createdAt,
      rubric.updatedAt,
      allSemestersQuery.data?.items ?? [],
    );
  }, [rubric, allSemestersQuery.data?.items]);

  if (detail.isLoading) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (detail.isError || !rubric) {
    return (
      <div className="flex flex-col gap-4">
        <Button asChild variant="ghost" size="sm" className="w-fit">
          <Link href="/teacher/rubrics">
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Quay lại danh sách
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

  if ((rubric.kind ?? 'qa') !== 'qs') {
    return (
      <div className="flex flex-col gap-4">
        <Button asChild variant="ghost" size="sm" className="w-fit">
          <Link href="/teacher/rubrics">
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Quay lại danh sách
          </Link>
        </Button>
        <Alert>
          <AlertDescription>
            Rubric này không phải rubric theo câu hỏi. Xem cấu trúc chung ở Bảng lỗi.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const approaches = rubric.approaches ?? [];
  const approachCount = approaches.length;
  const stepCount = approaches.reduce((n, a) => n + a.steps.length, 0);
  const createdBy = account?.name?.trim() || account?.email || '-';

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <Button asChild variant="ghost" size="sm" className="w-fit -ml-2">
          <Link href="/teacher/rubrics">
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Quay lại danh sách
          </Link>
        </Button>
        <PageHeader
          title={rubric.name}
          description="Chi tiết rubric theo câu hỏi - thông tin và checklist cách giải."
        />
      </div>

      <section aria-label="Thông tin rubric">
        <h2 className="mb-3 text-small font-semibold text-foreground">Thông tin</h2>
        <dl className="grid gap-3 rounded-lg border border-border bg-surface/50 p-4 text-small sm:grid-cols-2">
          <InfoItem label="Tên" value={rubric.name} />
          <InfoItem label="Môn học" value={courseLabel} />
          <InfoItem label="Số cách giải" value={String(approachCount)} />
          <InfoItem label="Tổng số bước" value={String(stepCount)} />
          <InfoItem
            label="Điểm tối đa"
            value={`${formatVnPoints(rubric.totalPoints)} điểm`}
          />
          <InfoItem label="Người tạo" value={createdBy} />
          <InfoItem label="Thời điểm tạo" value={createdTermLabel} />
          <div className="sm:col-span-2">
            <dt className="text-caption text-muted-foreground">Đề thi</dt>
            <dd className="mt-1 text-foreground">
              {exams.isLoading ? (
                <Skeleton className="h-5 w-48" />
              ) : exams.isError ? (
                <span className="text-destructive">Không tải được đề thi.</span>
              ) : (exams.data ?? []).length === 0 ? (
                <span className="text-muted-foreground">Chưa gắn đề thi nào</span>
              ) : (
                <ul className="flex flex-col gap-1">
                  {(exams.data ?? []).map((exam) => (
                    <li key={exam.id}>
                      <Link
                        href={`/teacher/exam-bank/${exam.id}`}
                        className="font-medium text-primary underline-offset-2 hover:underline"
                      >
                        {exam.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </dd>
          </div>
        </dl>
      </section>

      <section aria-label="Cấu trúc QS" className="flex flex-col gap-3">
        <h2 className="text-small font-semibold text-foreground">
          Cấu trúc QS ({approachCount} cách giải)
        </h2>
        <Alert>
          <AlertDescription>
            Rubric QS chấm theo checklist <b>cách giải → bước</b> (AI chọn một cách giải).
          </AlertDescription>
        </Alert>
        <QsStructurePanels approaches={approaches} />
      </section>
    </div>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-caption text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-foreground">{value}</dd>
    </div>
  );
}
