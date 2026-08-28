'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatDateTime } from '@/components/exams/datetime-local';
import {
  fetchExamEvent,
  fetchExamSession,
  fetchSessionHistory,
  mutationErrorMessage,
  throwOnApiError,
} from '@/components/exams/exam-api';
import { ExamHistoryPanel } from '@/components/exams/exam-history-panel';
import { ExamStatusBadge } from '@/components/exams/exam-status-badge';
import { SessionProctorsPanel } from '@/components/exams/session-proctors-panel';
import { SessionRosterPanel } from '@/components/exams/session-roster-panel';
import { PageHeader } from '@/components/layout/page-header';
import { PageShell } from '@/components/layout/page-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { apiClient } from '@/lib/api-client';

export default function LabSessionDetailPage() {
  const params = useParams<{ id: string; sessionId: string }>();
  const eventId = params.id;
  const sessionId = params.sessionId;
  const queryClient = useQueryClient();

  const eventQuery = useQuery({
    queryKey: ['exam-events', eventId],
    queryFn: () => fetchExamEvent(eventId),
  });

  const sessionQuery = useQuery({
    queryKey: ['exam-events', eventId, 'sessions', sessionId],
    queryFn: () => fetchExamSession(eventId, sessionId),
  });

  const historyQuery = useQuery({
    queryKey: ['exam-events', eventId, 'sessions', sessionId, 'history'],
    queryFn: () => fetchSessionHistory(eventId, sessionId),
  });

  const statusMutation = useMutation({
    mutationFn: async (
      toStatus: 'active' | 'completed' | 'aborted' | 'cancelled',
    ) => {
      const session = sessionQuery.data;
      if (!session) throw new Error('Missing session');
      const reasons = {
        active: 'Bắt đầu ca thi',
        completed: 'Kết thúc ca thi',
        aborted: 'Dừng ca thi',
        cancelled: 'Hủy ca thi đã công bố',
      };
      return throwOnApiError(
        await apiClient.POST(
          '/exam-events/{id}/sessions/{sessionId}/status',
          {
            params: { path: { id: eventId, sessionId } },
            body: {
              toStatus,
              reason: reasons[toStatus],
              rowVersion: session.rowVersion,
            },
          },
        ),
      );
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['exam-events', eventId] }),
  });

  const event = eventQuery.data;
  const session = sessionQuery.data;
  const isDraft = session?.status === 'draft';

  return (
    <PageShell>
      <PageHeader
        title={session ? `Ca ${session.code}` : 'Chi tiết ca thi'}
        description={session ? session.title : undefined}
        actions={
          <Button variant="outline" asChild>
            <Link href={`/exam-events/${eventId}`}>Quay lại đề thi</Link>
          </Button>
        }
      />

      {sessionQuery.isLoading ? (
        <Card>
          <p className="p-4 text-sm text-muted-foreground">Đang tải…</p>
        </Card>
      ) : sessionQuery.error || !session ? (
        <Card>
          <p role="alert" className="p-4 text-sm text-destructive">
            Không tải được ca thi.
          </p>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-3">
              <CardTitle>Thông tin ca</CardTitle>
              <ExamStatusBadge status={session.status} />
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <p className="text-muted-foreground">Giờ ca</p>
                  <p className="font-medium">
                    {formatDateTime(session.scheduledStartAt)} →{' '}
                    {formatDateTime(session.scheduledEndAt)}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Sĩ số</p>
                  <p className="font-medium">{session.participantCount}</p>
                </div>
              </div>
              {session.status === 'scheduled' ? (
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    onClick={() => statusMutation.mutate('active')}
                    disabled={statusMutation.isPending}
                  >
                    Bắt đầu ca
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={statusMutation.isPending}
                    onClick={() => {
                      if (
                        window.confirm(
                          `Hủy ca "${session.code}" đã công bố? Ca sẽ không thể bắt đầu.`,
                        )
                      ) {
                        statusMutation.mutate('cancelled');
                      }
                    }}
                  >
                    Hủy ca
                  </Button>
                </div>
              ) : null}
              {session.status === 'active' ? (
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    onClick={() => statusMutation.mutate('completed')}
                    disabled={statusMutation.isPending}
                  >
                    Kết thúc ca
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={() => statusMutation.mutate('aborted')}
                    disabled={statusMutation.isPending}
                  >
                    Dừng ca
                  </Button>
                </div>
              ) : null}
              {statusMutation.error ? (
                <p role="alert" className="text-sm text-destructive">
                  {mutationErrorMessage(
                    statusMutation.error,
                    'Không đổi được trạng thái ca.',
                  )}
                </p>
              ) : null}
            </CardContent>
          </Card>

          <SessionProctorsPanel
            eventId={eventId}
            sessionId={sessionId}
            proctors={session.proctors}
            isDraft={isDraft}
          />
          <SessionRosterPanel
            eventId={eventId}
            sessionId={sessionId}
            attachedSections={event?.sections ?? []}
            isDraft={isDraft}
          />
          {historyQuery.data ? (
            <ExamHistoryPanel
              title="Lịch sử ca"
              items={historyQuery.data.items}
            />
          ) : null}
        </>
      )}
    </PageShell>
  );
}
