'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  formatDateTime,
  fromDatetimeLocalValue,
} from '@/components/exams/datetime-local';
import { mutationErrorMessage, throwOnApiError } from '@/components/exams/exam-api';
import { ExamStatusBadge } from '@/components/exams/exam-status-badge';
import type {
  LabOption,
  LabSessionDetail,
  LayoutOption,
} from '@/components/exams/exam-types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
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

export function ExamSessionsPanel({
  eventId,
  sessions,
  isDraft,
  selectedSessionId,
  onSelect,
}: {
  eventId: string;
  sessions: LabSessionDetail[];
  isDraft: boolean;
  selectedSessionId: string | null;
  onSelect: (sessionId: string) => void;
}) {
  const queryClient = useQueryClient();
  const [code, setCode] = useState('');
  const [title, setTitle] = useState('');
  const [labId, setLabId] = useState('');
  const [layoutId, setLayoutId] = useState('');
  const [startAt, setStartAt] = useState('');
  const [endAt, setEndAt] = useState('');

  const labsQuery = useQuery({
    queryKey: ['labs', 'for-exam-sittings'],
    queryFn: async () => {
      const { data, error, response } = await apiClient.GET('/labs', {
        params: { query: { page: 1, pageSize: 100 } },
      });
      if (error || !response.ok) throw error ?? new Error('labs failed');
      return data as unknown as { items: LabOption[] };
    },
  });

  const layoutsQuery = useQuery({
    queryKey: ['labs', labId, 'layouts', 'for-exam'],
    enabled: Boolean(labId),
    queryFn: async () => {
      const { data, error, response } = await apiClient.GET(
        '/labs/{labId}/layouts',
        { params: { path: { labId }, query: { page: 1, pageSize: 100 } } },
      );
      if (error || !response.ok) throw error ?? new Error('layouts failed');
      return data as unknown as { items: LayoutOption[] };
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const body: {
        code: string;
        title: string;
        labId: string;
        layoutId: string;
        scheduledStartAt?: string;
        scheduledEndAt?: string;
      } = {
        code,
        title,
        labId,
        layoutId,
      };
      if (startAt) body.scheduledStartAt = fromDatetimeLocalValue(startAt);
      if (endAt) body.scheduledEndAt = fromDatetimeLocalValue(endAt);
      return throwOnApiError(
        await apiClient.POST('/exam-events/{id}/sessions', {
          params: { path: { id: eventId } },
          body,
        }),
      );
    },
    onSuccess: (created) => {
      setCode('');
      setTitle('');
      setStartAt('');
      setEndAt('');
      onSelect(created.id);
      queryClient.invalidateQueries({ queryKey: ['exam-events', eventId] });
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      throwOnApiError(
        await apiClient.DELETE('/exam-events/{id}/sessions/{sessionId}', {
          params: { path: { id: eventId, sessionId } },
        }),
      );
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['exam-events', eventId] }),
  });

  const cancelMutation = useMutation({
    mutationFn: async ({
      sessionId,
      rowVersion,
    }: {
      sessionId: string;
      rowVersion: number;
    }) => {
      return throwOnApiError(
        await apiClient.POST('/exam-events/{id}/sessions/{sessionId}/status', {
          params: { path: { id: eventId, sessionId } },
          body: {
            toStatus: 'cancelled',
            reason: 'Hủy ca thi đã công bố',
            rowVersion,
          },
        }),
      );
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['exam-events', eventId] }),
  });

  const labLabel = (id: string) => {
    const lab = labsQuery.data?.items.find((item) => item.id === id);
    return lab ? `${lab.code} — ${lab.name}` : id;
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle>Ca / phòng thi</CardTitle>
        {isDraft ? (
          <Button type="button" variant="outline" size="sm" asChild>
            <Link href={`/exam-events/${eventId}/sessions/new`}>
              Trang thêm ca
            </Link>
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Mã ca</TableHead>
              <TableHead>Phòng</TableHead>
              <TableHead>Giờ</TableHead>
              <TableHead>Trạng thái</TableHead>
              <TableHead>Thao tác</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sessions.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="text-sm text-muted-foreground"
                >
                  Chưa có ca. Để trống giờ để dùng khung của đề thi.
                </TableCell>
              </TableRow>
            ) : (
              sessions.map((session) => (
                <TableRow
                  key={session.id}
                  className={
                    session.id === selectedSessionId ? 'bg-secondary/50' : undefined
                  }
                >
                  <TableCell>{session.code}</TableCell>
                  <TableCell>{labLabel(session.labId)}</TableCell>
                  <TableCell>
                    {formatDateTime(session.scheduledStartAt)} →{' '}
                    {formatDateTime(session.scheduledEndAt)}
                  </TableCell>
                  <TableCell>
                    <ExamStatusBadge status={session.status} />
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => onSelect(session.id)}
                      >
                        Chọn
                      </Button>
                      <Button type="button" variant="outline" size="sm" asChild>
                        <Link
                          href={`/exam-events/${eventId}/sessions/${session.id}`}
                        >
                          Chi tiết
                        </Link>
                      </Button>
                      {isDraft ? (
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          onClick={() => {
                            if (window.confirm(`Xóa ca "${session.code}"?`)) {
                              removeMutation.mutate(session.id);
                            }
                          }}
                        >
                          Xóa
                        </Button>
                      ) : null}
                      {session.status === 'scheduled' ? (
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          disabled={cancelMutation.isPending}
                          onClick={() => {
                            if (
                              window.confirm(
                                `Hủy ca "${session.code}" đã công bố? Ca sẽ không thể bắt đầu.`,
                              )
                            ) {
                              cancelMutation.mutate({
                                sessionId: session.id,
                                rowVersion: session.rowVersion,
                              });
                            }
                          }}
                        >
                          Hủy
                        </Button>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        {isDraft ? (
          <form
            className="grid gap-3 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (code && title && labId && layoutId) createMutation.mutate();
            }}
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sitting-code">Mã ca</Label>
              <Input
                id="sitting-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sitting-title">Tên ca</Label>
              <Input
                id="sitting-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sitting-lab">Phòng máy</Label>
              <Select
                id="sitting-lab"
                value={labId}
                onChange={(e) => {
                  setLabId(e.target.value);
                  setLayoutId('');
                }}
              >
                <option value="">— Chọn phòng —</option>
                {(labsQuery.data?.items ?? []).map((lab) => (
                  <option key={lab.id} value={lab.id}>
                    {lab.code} — {lab.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sitting-layout">Sơ đồ chỗ ngồi</Label>
              <Select
                id="sitting-layout"
                value={layoutId}
                onChange={(e) => setLayoutId(e.target.value)}
                disabled={!labId}
              >
                <option value="">— Chọn sơ đồ —</option>
                {(layoutsQuery.data?.items ?? []).map((layout) => (
                  <option key={layout.id} value={layout.id}>
                    {layout.name}
                    {layout.isActive ? ' (đang dùng)' : ''}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sitting-start">Bắt đầu (tuỳ chọn)</Label>
              <Input
                id="sitting-start"
                type="datetime-local"
                value={startAt}
                onChange={(e) => setStartAt(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sitting-end">Kết thúc (tuỳ chọn)</Label>
              <Input
                id="sitting-end"
                type="datetime-local"
                value={endAt}
                onChange={(e) => setEndAt(e.target.value)}
              />
            </div>
            <div className="sm:col-span-2">
              <Button
                type="submit"
                disabled={!code || !title || !labId || !layoutId}
              >
                Thêm ca
              </Button>
            </div>
          </form>
        ) : null}

        {createMutation.error ||
        removeMutation.error ||
        cancelMutation.error ? (
          <p role="alert" className="text-sm text-destructive">
            {mutationErrorMessage(
              createMutation.error ??
                removeMutation.error ??
                cancelMutation.error,
              'Không cập nhật được ca thi.',
            )}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
