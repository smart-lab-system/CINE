'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/layout/page-header';
import { PageShell } from '@/components/layout/page-shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiFetchJson } from '@/lib/api-fetch';
import type { EditorSeat } from '@/components/labs/seating-editor-utils';
import {
  editorSeatsToLayoutData,
  layoutDataToEditorSeats,
  type SeatingTemplateDetail,
} from '@/components/labs/seating-template-utils';

const SeatingEditor = dynamic(
  () =>
    import('@/components/labs/seating-editor').then((m) => m.SeatingEditor),
  {
    ssr: false,
    loading: () => (
      <p className="text-sm text-muted-foreground">Đang tải sơ đồ…</p>
    ),
  },
);

export default function SeatingTemplateEditorPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const hydratedId = useRef<string | null>(null);

  const templateQuery = useQuery({
    queryKey: ['seating-templates', id],
    queryFn: () =>
      apiFetchJson<SeatingTemplateDetail>(`/seating-templates/${id}`),
  });

  useEffect(() => {
    if (!templateQuery.data || hydratedId.current === templateQuery.data.id) {
      return;
    }
    hydratedId.current = templateQuery.data.id;
    setName(templateQuery.data.name);
    setDescription(templateQuery.data.description ?? '');
  }, [templateQuery.data]);

  const saveMutation = useMutation({
    mutationFn: async (seats: EditorSeat[]) => {
      const template = templateQuery.data;
      if (!template) throw new Error('Template not loaded');
      await apiFetchJson(`/seating-templates/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: (name || template.name).trim(),
          description: description.trim() || null,
          canvasWidth: template.canvasWidth,
          canvasHeight: template.canvasHeight,
          layoutData: editorSeatsToLayoutData(
            seats,
            template.canvasWidth,
            template.canvasHeight,
          ),
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['seating-templates', id] });
      queryClient.invalidateQueries({ queryKey: ['seating-templates'] });
    },
  });

  const initialSeats = useMemo(
    () =>
      templateQuery.data
        ? layoutDataToEditorSeats(
            templateQuery.data.layoutData,
            templateQuery.data.canvasWidth,
            templateQuery.data.canvasHeight,
            'tpl',
          )
        : [],
    [templateQuery.data],
  );

  if (templateQuery.isLoading) {
    return (
      <PageShell>
        <p className="text-sm text-muted-foreground">Đang tải…</p>
      </PageShell>
    );
  }

  if (templateQuery.error || !templateQuery.data) {
    return (
      <PageShell>
        <p role="alert" className="text-sm text-destructive">
          Không tải được sơ đồ mẫu.
        </p>
        <Button variant="outline" asChild className="mt-4 w-fit">
          <Link href="/seating-templates">Quay lại</Link>
        </Button>
      </PageShell>
    );
  }

  const template = templateQuery.data;

  return (
    <PageShell>
      <PageHeader
        title={name || template.name}
        description={`${template.canvasWidth} × ${template.canvasHeight} — bản vẽ không gắn máy trạm`}
        actions={
          <Button variant="outline" asChild>
            <Link href="/seating-templates">Quay lại danh sách</Link>
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="tpl-name">Tên mẫu</Label>
          <Input
            id="tpl-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="tpl-desc">Mô tả</Label>
          <Input
            id="tpl-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
      </div>

      {saveMutation.isError && (
        <p role="alert" className="text-sm text-destructive">
          Lưu mẫu thất bại. Kiểm tra tên trùng hoặc mã ghế không hợp lệ.
        </p>
      )}
      {saveMutation.isSuccess && (
        <p className="text-sm text-muted-foreground">Đã lưu sơ đồ mẫu.</p>
      )}

      <SeatingEditor
        canvasWidth={template.canvasWidth}
        canvasHeight={template.canvasHeight}
        initialSeats={initialSeats}
        workstations={[]}
        hideWorkstation
        saving={saveMutation.isPending}
        onSave={(seats) => saveMutation.mutate(seats)}
      />
    </PageShell>
  );
}
