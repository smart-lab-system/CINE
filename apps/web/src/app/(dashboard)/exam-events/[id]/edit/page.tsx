'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ExamEventForm,
  type ExamEventFormValues,
} from '@/components/exams/exam-event-form';
import type { SubjectOption } from '@/components/exams/exam-types';
import { PageHeader } from '@/components/layout/page-header';
import { PageShell } from '@/components/layout/page-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { fetchExamEvent, throwOnApiError } from '@/components/exams/exam-api';
import { apiClient } from '@/lib/api-client';

export default function EditExamEventPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const eventId = params.id;

  const eventQuery = useQuery({
    queryKey: ['exam-events', eventId],
    queryFn: () => fetchExamEvent(eventId),
  });

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

  const updateMutation = useMutation({
    mutationFn: async (values: ExamEventFormValues) => {
      const event = eventQuery.data;
      if (!event) throw new Error('Missing event');
      return throwOnApiError(
        await apiClient.PATCH('/exam-events/{id}', {
          params: { path: { id: eventId } },
          body: {
            rowVersion: event.rowVersion,
            code: values.code,
            title: values.title,
            sessionType: values.sessionType,
            scheduledStartAt: values.scheduledStartAt,
            scheduledEndAt: values.scheduledEndAt,
            durationMinutes: values.durationMinutes,
          },
        }),
      );
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['exam-events'] });
      router.push(`/exam-events/${eventId}`);
    },
  });

  const event = eventQuery.data;

  return (
    <PageShell>
      <PageHeader
        title={event ? `Sửa đề — ${event.code}` : 'Sửa đề thi'}
        actions={
          <Button variant="outline" asChild>
            <Link href={`/exam-events/${eventId}`}>Quay lại</Link>
          </Button>
        }
      />
      {eventQuery.isLoading ? (
        <Card>
          <p className="p-4 text-sm text-muted-foreground">Đang tải…</p>
        </Card>
      ) : eventQuery.error || !event ? (
        <Card>
          <p role="alert" className="p-4 text-sm text-destructive">
            Không tải được đề thi.
          </p>
        </Card>
      ) : event.status !== 'draft' ? (
        <Card>
          <p className="p-4 text-sm text-muted-foreground">
            Chỉ sửa được đề khi còn ở trạng thái nháp.
          </p>
        </Card>
      ) : (
        <Card>
          <CardContent className="pt-6">
            {updateMutation.error ? (
              <p role="alert" className="mb-4 text-sm text-destructive">
                {updateMutation.error instanceof Error
                  ? updateMutation.error.message
                  : 'Không cập nhật được đề thi.'}
              </p>
            ) : null}
            <ExamEventForm
              lockSubject
              submitLabel="Cập nhật"
              subjects={subjectsQuery.data?.items ?? []}
              defaultValues={{
                subjectId: event.subjectId,
                code: event.code,
                title: event.title,
                sessionType: event.sessionType,
                scheduledStartAt: event.scheduledStartAt,
                scheduledEndAt: event.scheduledEndAt,
                durationMinutes: event.durationMinutes,
              }}
              onSubmit={(values) => updateMutation.mutate(values)}
            />
          </CardContent>
        </Card>
      )}
    </PageShell>
  );
}
