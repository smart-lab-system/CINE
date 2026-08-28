'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchSessionParticipants,
  mutationErrorMessage,
  throwOnApiError,
} from '@/components/exams/exam-api';
import type {
  CourseSectionOption,
  EnrollmentRow,
  ExamEventSection,
} from '@/components/exams/exam-types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { apiClient } from '@/lib/api-client';

export function SessionRosterPanel({
  eventId,
  sessionId,
  attachedSections,
  isDraft,
}: {
  eventId: string;
  sessionId: string;
  attachedSections: ExamEventSection[];
  isDraft: boolean;
}) {
  const queryClient = useQueryClient();
  const [sectionId, setSectionId] = useState(
    attachedSections[0]?.courseSectionId ?? '',
  );

  useEffect(() => {
    if (!sectionId && attachedSections[0]) {
      setSectionId(attachedSections[0].courseSectionId);
    }
  }, [attachedSections, sectionId]);

  const sectionsQuery = useQuery({
    queryKey: ['course-sections', 'for-exam-roster'],
    queryFn: async () => {
      const { data, error, response } = await apiClient.GET(
        '/course-sections',
        { params: { query: { page: 1, pageSize: 100 } } },
      );
      if (error || !response.ok) {
        throw error ?? new Error('course-sections failed');
      }
      return data as unknown as { items: CourseSectionOption[] };
    },
  });

  const participantsQuery = useQuery({
    queryKey: ['exam-events', eventId, 'sessions', sessionId, 'participants'],
    queryFn: () => fetchSessionParticipants(eventId, sessionId),
  });

  const enrollmentQueries = useQueries({
    queries: attachedSections.map((row) => ({
      queryKey: ['course-sections', row.courseSectionId, 'enrollments'],
      queryFn: async () => {
        const { data, error, response } = await apiClient.GET(
          '/course-sections/{id}/enrollments',
          { params: { path: { id: row.courseSectionId } } },
        );
        if (error || !response.ok) {
          throw error ?? new Error('enrollments failed');
        }
        return data as unknown as { items: EnrollmentRow[]; total: number };
      },
    })),
  });

  const enrollmentsQuery = enrollmentQueries.find(
    (_, index) =>
      attachedSections[index]?.courseSectionId === sectionId,
  );

  const bulkMutation = useMutation({
    mutationFn: async () => {
      const studentIds = (enrollmentsQuery?.data?.items ?? [])
        .filter((row) => row.status === 'active')
        .map((row) => row.studentId);
      if (studentIds.length === 0) {
        throw new Error('Lớp này chưa có sinh viên đang học.');
      }
      await throwOnApiError(
        await apiClient.POST(
          '/exam-events/{id}/sessions/{sessionId}/participants/bulk',
          {
            params: { path: { id: eventId, sessionId } },
            body: { studentIds, courseSectionId: sectionId },
          },
        ),
      );
    },
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ['exam-events', eventId],
      }),
  });

  const removeMutation = useMutation({
    mutationFn: async (participantId: string) => {
      throwOnApiError(
        await apiClient.DELETE(
          '/exam-events/{id}/sessions/{sessionId}/participants/{participantId}',
          {
            params: {
              path: { id: eventId, sessionId, participantId },
            },
          },
        ),
      );
    },
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ['exam-events', eventId],
      }),
  });

  const sectionLabel = (id: string) => {
    const section = sectionsQuery.data?.items.find((item) => item.id === id);
    return section
      ? `${section.sectionCode}${section.name ? ` — ${section.name}` : ''}`
      : id;
  };
  const studentLabel = (studentId: string) => {
    for (const query of enrollmentQueries) {
      const enrollment = query.data?.items.find(
        (row) => row.studentId === studentId,
      );
      if (enrollment) {
        return `${enrollment.studentCode} — ${enrollment.fullName}`;
      }
    }
    return studentId;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Danh sách thí sinh ({participantsQuery.data?.total ?? 0})
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {participantsQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Đang tải…</p>
        ) : participantsQuery.error ? (
          <p role="alert" className="text-sm text-destructive">
            Không tải được danh sách thí sinh.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Sinh viên</TableHead>
                <TableHead>Lớp HP</TableHead>
                {isDraft ? <TableHead>Thao tác</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {(participantsQuery.data?.items ?? []).length === 0 ? (
                <TableRow>
                  <TableCell className="text-sm text-muted-foreground">
                    Chưa có thí sinh trên ca này.
                  </TableCell>
                  <TableCell />
                  {isDraft ? <TableCell /> : null}
                </TableRow>
              ) : (
                (participantsQuery.data?.items ?? []).map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{studentLabel(row.studentId)}</TableCell>
                    <TableCell>{sectionLabel(row.courseSectionId)}</TableCell>
                    {isDraft ? (
                      <TableCell>
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          onClick={() => {
                            if (window.confirm('Gỡ thí sinh này khỏi ca?')) {
                              removeMutation.mutate(row.id);
                            }
                          }}
                        >
                          Gỡ
                        </Button>
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        )}

        {isDraft ? (
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (sectionId) bulkMutation.mutate();
            }}
          >
            <div className="flex min-w-[220px] flex-1 flex-col gap-1.5">
              <Label htmlFor="exam-roster-section">Ghi danh cả lớp</Label>
              <Select
                id="exam-roster-section"
                value={sectionId}
                onChange={(e) => setSectionId(e.target.value)}
              >
                <option value="">— Chọn lớp đã gắn —</option>
                {attachedSections.map((row) => (
                  <option key={row.id} value={row.courseSectionId}>
                    {sectionLabel(row.courseSectionId)}
                  </option>
                ))}
              </Select>
            </div>
            <Button type="submit" disabled={!sectionId || bulkMutation.isPending}>
              Thêm sĩ số lớp
            </Button>
          </form>
        ) : null}

        {bulkMutation.error || removeMutation.error ? (
          <p role="alert" className="text-sm text-destructive">
            {mutationErrorMessage(
              bulkMutation.error ?? removeMutation.error,
              'Không cập nhật được sĩ số.',
            )}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
