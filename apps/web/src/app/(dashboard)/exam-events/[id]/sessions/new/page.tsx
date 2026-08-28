'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { fromDatetimeLocalValue } from '@/components/exams/datetime-local';
import { mutationErrorMessage, throwOnApiError } from '@/components/exams/exam-api';
import type { LabOption, LayoutOption } from '@/components/exams/exam-types';
import { PageHeader } from '@/components/layout/page-header';
import { PageShell } from '@/components/layout/page-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { apiClient } from '@/lib/api-client';

export default function NewLabSessionPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const eventId = params.id;
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
      } = { code, title, labId, layoutId };
      if (startAt) body.scheduledStartAt = fromDatetimeLocalValue(startAt);
      if (endAt) body.scheduledEndAt = fromDatetimeLocalValue(endAt);
      return throwOnApiError(
        await apiClient.POST('/exam-events/{id}/sessions', {
          params: { path: { id: eventId } },
          body,
        }),
      );
    },
    onSuccess: (created) =>
      router.push(`/exam-events/${eventId}/sessions/${created.id}`),
  });

  return (
    <PageShell>
      <PageHeader
        title="Thêm ca thi"
        description="Chọn phòng và sơ đồ. Để trống giờ để dùng khung của đề thi."
        actions={
          <Button variant="outline" asChild>
            <Link href={`/exam-events/${eventId}`}>Quay lại đề thi</Link>
          </Button>
        }
      />
      <Card>
        <CardContent className="flex flex-col gap-4 pt-6">
          {createMutation.error ? (
            <p role="alert" className="text-sm text-destructive">
              {mutationErrorMessage(
                createMutation.error,
                'Không tạo được ca thi.',
              )}
            </p>
          ) : null}
          <form
            className="grid gap-3 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              createMutation.mutate();
            }}
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-sitting-code">Mã ca</Label>
              <Input
                id="new-sitting-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-sitting-title">Tên ca</Label>
              <Input
                id="new-sitting-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-sitting-lab">Phòng máy</Label>
              <Select
                id="new-sitting-lab"
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
              <Label htmlFor="new-sitting-layout">Sơ đồ chỗ ngồi</Label>
              <Select
                id="new-sitting-layout"
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
              <Label htmlFor="new-sitting-start">Bắt đầu (tuỳ chọn)</Label>
              <Input
                id="new-sitting-start"
                type="datetime-local"
                value={startAt}
                onChange={(e) => setStartAt(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-sitting-end">Kết thúc (tuỳ chọn)</Label>
              <Input
                id="new-sitting-end"
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
                Lưu ca
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </PageShell>
  );
}
