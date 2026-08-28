'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { mutationErrorMessage, throwOnApiError } from '@/components/exams/exam-api';
import type {
  CourseSectionOption,
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

export function ExamSectionsPanel({
  eventId,
  subjectId,
  attached,
  isDraft,
}: {
  eventId: string;
  subjectId: string;
  attached: ExamEventSection[];
  isDraft: boolean;
}) {
  const queryClient = useQueryClient();
  const [courseSectionId, setCourseSectionId] = useState('');

  const sectionsQuery = useQuery({
    queryKey: ['course-sections', 'for-exam', subjectId],
    queryFn: async () => {
      const { data, error, response } = await apiClient.GET(
        '/course-sections',
        {
          params: {
            query: { subjectId, page: 1, pageSize: 100 },
          },
        },
      );
      if (error || !response.ok) {
        throw error ?? new Error('course-sections failed');
      }
      return data as unknown as { items: CourseSectionOption[] };
    },
  });

  const attachMutation = useMutation({
    mutationFn: async (id: string) => {
      await throwOnApiError(
        await apiClient.POST('/exam-events/{id}/sections', {
          params: { path: { id: eventId } },
          body: { courseSectionId: id },
        }),
      );
    },
    onSuccess: () => {
      setCourseSectionId('');
      queryClient.invalidateQueries({ queryKey: ['exam-events', eventId] });
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (sectionLinkId: string) => {
      throwOnApiError(
        await apiClient.DELETE(
          '/exam-events/{id}/sections/{sectionLinkId}',
          { params: { path: { id: eventId, sectionLinkId } } },
        ),
      );
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['exam-events', eventId] }),
  });

  const attachedIds = new Set(attached.map((row) => row.courseSectionId));
  const available = (sectionsQuery.data?.items ?? []).filter(
    (section) => !attachedIds.has(section.id),
  );
  const labelFor = (courseSectionId: string) => {
    const section = sectionsQuery.data?.items.find(
      (item) => item.id === courseSectionId,
    );
    return section
      ? `${section.sectionCode}${section.name ? ` — ${section.name}` : ''} (${section.termCode})`
      : courseSectionId;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Lớp tham gia</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Lớp HP</TableHead>
              {isDraft ? <TableHead>Thao tác</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {attached.length === 0 ? (
              <TableRow>
                <TableCell className="text-sm text-muted-foreground">
                  Chưa gắn lớp học phần.
                </TableCell>
                {isDraft ? <TableCell /> : null}
              </TableRow>
            ) : (
              attached.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>{labelFor(row.courseSectionId)}</TableCell>
                  {isDraft ? (
                    <TableCell>
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        onClick={() => {
                          if (window.confirm('Gỡ lớp này khỏi đề thi?')) {
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

        {isDraft ? (
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (courseSectionId) attachMutation.mutate(courseSectionId);
            }}
          >
            <div className="flex min-w-[240px] flex-1 flex-col gap-1.5">
              <Label htmlFor="exam-attach-section">Thêm lớp</Label>
              <Select
                id="exam-attach-section"
                value={courseSectionId}
                onChange={(e) => setCourseSectionId(e.target.value)}
              >
                <option value="">— Chọn lớp cùng môn —</option>
                {available.map((section) => (
                  <option key={section.id} value={section.id}>
                    {section.sectionCode}
                    {section.name ? ` — ${section.name}` : ''} ({section.termCode})
                  </option>
                ))}
              </Select>
            </div>
            <Button type="submit" disabled={!courseSectionId}>
              Gắn lớp
            </Button>
          </form>
        ) : null}

        {attachMutation.error || removeMutation.error ? (
          <p role="alert" className="text-sm text-destructive">
            {mutationErrorMessage(
              attachMutation.error ?? removeMutation.error,
              'Không cập nhật được lớp tham gia.',
            )}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
