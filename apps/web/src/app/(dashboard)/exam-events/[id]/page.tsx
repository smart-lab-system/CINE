'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatDateTime } from '@/components/exams/datetime-local';
import {
  fetchExamEvent,
  fetchExamHistory,
  fetchExamSessionDetails,
  mutationErrorMessage,
  throwOnApiError,
} from '@/components/exams/exam-api';
import { ExamFilesPanel } from '@/components/exams/exam-files-panel';
import { ExamHistoryPanel } from '@/components/exams/exam-history-panel';
import { ExamPublishPanel } from '@/components/exams/exam-publish-panel';
import { ExamRosterImportPanel } from '@/components/exams/exam-roster-import-panel';
import { ExamSectionsPanel } from '@/components/exams/exam-sections-panel';
import { ExamSessionsPanel } from '@/components/exams/exam-sessions-panel';
import { ExamStatusBadge } from '@/components/exams/exam-status-badge';
import { SESSION_TYPE_LABELS } from '@/components/exams/exam-status';
import type { SubjectOption } from '@/components/exams/exam-types';
import { examPublishChecklist } from '@/components/exams/publish-checklist';
import { SessionProctorsPanel } from '@/components/exams/session-proctors-panel';
import { SessionRosterPanel } from '@/components/exams/session-roster-panel';
import { PageHeader } from '@/components/layout/page-header';
import { PageShell } from '@/components/layout/page-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { apiClient } from '@/lib/api-client';

export default function ExamEventWorkspacePage() {
  const params = useParams<{ id: string }>();
  const eventId = params.id;
  const queryClient = useQueryClient();
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(
    null,
  );

  const eventQuery = useQuery({
    queryKey: ['exam-events', eventId],
    queryFn: () => fetchExamEvent(eventId),
  });

  const sessionsQuery = useQuery({
    queryKey: ['exam-events', eventId, 'sessions'],
    queryFn: () => fetchExamSessionDetails(eventId),
  });

  const historyQuery = useQuery({
    queryKey: ['exam-events', eventId, 'history'],
    queryFn: () => fetchExamHistory(eventId),
  });

  const subjectsQuery = useQuery({
    queryKey: ['subjects', 'for-exam-workspace'],
    queryFn: async () => {
      const { data, error, response } = await apiClient.GET('/subjects', {
        params: { query: { page: 1, pageSize: 100 } },
      });
      if (error || !response.ok) throw error ?? new Error('subjects failed');
      return data as unknown as { items: SubjectOption[] };
    },
  });

  const event = eventQuery.data;
  const sessions = sessionsQuery.data ?? [];

  useEffect(() => {
    if (selectedSessionId && sessions.some((s) => s.id === selectedSessionId)) {
      return;
    }
    if (sessions[0]) setSelectedSessionId(sessions[0].id);
  }, [sessions, selectedSessionId]);

  const selectedSession =
    sessions.find((session) => session.id === selectedSessionId) ?? null;
  const isDraft = event?.status === 'draft';
  const isScheduled = event?.status === 'scheduled';

  const checklist = useMemo(
    () =>
      examPublishChecklist({
        sections: event?.sections ?? [],
        sessions: sessions.map((session) => ({
          id: session.id,
          status: session.status,
          hasLead: session.proctors.some((proctor) => proctor.role === 'lead'),
        })),
        files: event?.files ?? [],
      }),
    [event, sessions],
  );

  const publishMutation = useMutation({
    mutationFn: async () => {
      if (!event) throw new Error('Missing event');
      return throwOnApiError(
        await apiClient.POST('/exam-events/{id}/status', {
          params: { path: { id: eventId } },
          body: {
            toStatus: 'scheduled',
            reason: 'Công bố lịch thi',
            rowVersion: event.rowVersion,
          },
        }),
      );
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['exam-events'] }),
  });

  const cancelMutation = useMutation({
    mutationFn: async () => {
      if (!event) throw new Error('Missing event');
      return throwOnApiError(
        await apiClient.POST('/exam-events/{id}/status', {
          params: { path: { id: eventId } },
          body: {
            toStatus: 'cancelled',
            reason: 'Hủy đề thi đã công bố',
            rowVersion: event.rowVersion,
          },
        }),
      );
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['exam-events'] }),
  });

  const subject = subjectsQuery.data?.items.find(
    (item) => item.id === event?.subjectId,
  );

  return (
    <PageShell>
      <PageHeader
        title={event ? event.title : 'Chi tiết kỳ thi'}
        description={
          event
            ? `${event.code} · ${SESSION_TYPE_LABELS[event.sessionType]}${
                subject ? ` · ${subject.code} — ${subject.name}` : ''
              }`
            : undefined
        }
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href="/exam-events">Quay lại</Link>
            </Button>
            {event && isDraft ? (
              <Button asChild>
                <Link href={`/exam-events/${eventId}/edit`}>Sửa</Link>
              </Button>
            ) : null}
          </>
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
      ) : (
        <>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-3">
              <CardTitle>Thông tin đề</CardTitle>
              <ExamStatusBadge status={event.status} />
            </CardHeader>
            <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <p className="text-muted-foreground">Khung giờ</p>
                <p className="font-medium">
                  {formatDateTime(event.scheduledStartAt)} →{' '}
                  {formatDateTime(event.scheduledEndAt)}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Thời lượng</p>
                <p className="font-medium">{event.durationMinutes} phút</p>
              </div>
              <div>
                <p className="text-muted-foreground">Mã băm đề</p>
                <p className="break-all font-medium">
                  {event.manifestSha256 ?? '—'}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Công bố lúc</p>
                <p className="font-medium">
                  {formatDateTime(event.manifestPublishedAt)}
                </p>
              </div>
            </CardContent>
          </Card>

          <ExamSectionsPanel
            eventId={eventId}
            subjectId={event.subjectId}
            attached={event.sections}
            isDraft={isDraft}
          />

          <ExamRosterImportPanel
            eventId={eventId}
            subjectId={event.subjectId}
            attached={event.sections}
            isDraft={isDraft}
          />

          {sessionsQuery.error ? (
            <Card>
              <p role="alert" className="p-4 text-sm text-destructive">
                Không tải được danh sách ca thi.
              </p>
            </Card>
          ) : (
            <ExamSessionsPanel
              eventId={eventId}
              sessions={sessions}
              isDraft={isDraft}
              selectedSessionId={selectedSessionId}
              onSelect={setSelectedSessionId}
            />
          )}

          {selectedSession ? (
            <>
              <SessionProctorsPanel
                eventId={eventId}
                sessionId={selectedSession.id}
                proctors={selectedSession.proctors}
                isDraft={isDraft}
              />
              <SessionRosterPanel
                eventId={eventId}
                sessionId={selectedSession.id}
                attachedSections={event.sections}
                isDraft={isDraft}
              />
            </>
          ) : null}

          <ExamFilesPanel
            eventId={eventId}
            files={event.files}
            isDraft={isDraft}
          />

          {isDraft ? (
            <ExamPublishPanel
              checklist={checklist}
              pending={publishMutation.isPending}
              error={
                publishMutation.error
                  ? mutationErrorMessage(
                      publishMutation.error,
                      'Không công bố được lịch.',
                    )
                  : undefined
              }
              onPublish={() => publishMutation.mutate()}
            />
          ) : null}

          {isScheduled ? (
            <Card>
              <CardHeader>
                <CardTitle>Hủy đề thi</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <p className="text-sm text-muted-foreground">
                  Hủy đề thi đã công bố trước khi bắt đầu. Tất cả ca thi chưa
                  bắt đầu sẽ được hủy theo.
                </p>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={cancelMutation.isPending}
                  onClick={() => {
                    if (
                      window.confirm(
                        `Hủy đề thi "${event.code}" đã công bố? Thao tác này không thể hoàn tác.`,
                      )
                    ) {
                      cancelMutation.mutate();
                    }
                  }}
                >
                  Hủy đề thi
                </Button>
                {cancelMutation.error ? (
                  <p role="alert" className="text-sm text-destructive">
                    {mutationErrorMessage(
                      cancelMutation.error,
                      'Không hủy được đề thi.',
                    )}
                  </p>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          {historyQuery.data ? (
            <ExamHistoryPanel items={historyQuery.data.items} />
          ) : null}
        </>
      )}
    </PageShell>
  );
}
