'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  ExamEventForm,
  type ExamEventFormValues,
} from '@/components/exams/exam-event-form';
import type { SubjectOption } from '@/components/exams/exam-types';
import { PageHeader } from '@/components/layout/page-header';
import { PageShell } from '@/components/layout/page-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { throwOnApiError } from '@/components/exams/exam-api';
import { apiClient } from '@/lib/api-client';

export default function NewExamEventPage() {
  const router = useRouter();

  const subjectsQuery = useQuery({
    queryKey: ['subjects', 'for-exam-form'],
    queryFn: async () => {
      const { data, error, response } = await apiClient.GET('/subjects', {
        params: { query: { page: 1, pageSize: 100 } },
      });
      if (error || !response.ok) throw error ?? new Error('subjects failed');
      return data as unknown as { items: SubjectOption[] };
    },
  });

  const createMutation = useMutation({
    mutationFn: async (values: ExamEventFormValues) => {
      return throwOnApiError(
        await apiClient.POST('/exam-events', { body: values }),
      );
    },
    onSuccess: (created) => router.push(`/exam-events/${created.id}`),
  });

  return (
    <PageShell>
      <PageHeader
        title="Thêm đề thi"
        description="Tạo bản nháp cho một môn. Gắn lớp, ca phòng và đề trước khi công bố."
        actions={
          <Button variant="outline" asChild>
            <Link href="/exam-events">Quay lại</Link>
          </Button>
        }
      />
      <Card>
        <CardContent className="pt-6">
          {createMutation.error ? (
            <p role="alert" className="mb-4 text-sm text-destructive">
              {createMutation.error instanceof Error
                ? createMutation.error.message
                : 'Không tạo được đề thi.'}
            </p>
          ) : null}
          <ExamEventForm
            subjects={subjectsQuery.data?.items ?? []}
            onSubmit={(values) => createMutation.mutate(values)}
          />
        </CardContent>
      </Card>
    </PageShell>
  );
}
