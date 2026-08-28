'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { ApplyTemplateDialog } from '@/components/labs/apply-template-dialog';
import { apiFetchJson } from '@/lib/api-fetch';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../../../../../lib/api-client';
import {
  EditorSeat,
  seatsFromApi,
  seatsToApiPayload,
} from '../../../../../../components/labs/seating-editor-utils';
import { LabSubnav } from '@/components/labs/lab-subnav';
import { PageHeader } from '@/components/layout/page-header';
import { PageShell } from '@/components/layout/page-shell';
import { Button } from '@/components/ui/button';

const SeatingEditor = dynamic(
  () =>
    import('../../../../../../components/labs/seating-editor').then(
      (m) => m.SeatingEditor,
    ),
  {
    ssr: false,
    loading: () => (
      <p className="text-sm text-muted-foreground">Đang tải sơ đồ…</p>
    ),
  },
);

interface LayoutDetail {
  id: string;
  labId: string;
  name: string;
  versionNo: number;
  canvasWidth: number;
  canvasHeight: number;
  isActive: boolean;
  seats: {
    id: string;
    seatCode: string;
    workstationId: string | null;
    rowNo: number | null;
    columnNo: number | null;
    positionX: number;
    positionY: number;
    rotationDegrees: number;
    shape?: 'rect' | 'circle' | 'diamond';
  }[];
}

export default function LayoutEditorPage() {
  const params = useParams<{ id: string; layoutId: string }>();
  const labId = params.id;
  const layoutId = params.layoutId;
  const queryClient = useQueryClient();
  const [applyOpen, setApplyOpen] = useState(false);

  const layoutQuery = useQuery({
    queryKey: ['labs', labId, 'layouts', layoutId],
    queryFn: async () => {
      const { data, error, response } = await apiClient.GET(
        '/labs/{labId}/layouts/{id}',
        { params: { path: { labId, id: layoutId } } },
      );
      if (error || !response.ok) {
        throw error ?? new Error(`Yêu cầu thất bại (HTTP ${response.status})`);
      }
      return data as unknown as LayoutDetail;
    },
  });

  const wsQuery = useQuery({
    queryKey: ['labs', labId, 'workstations'],
    queryFn: async () => {
      const { data, error, response } = await apiClient.GET(
        '/labs/{labId}/workstations',
        { params: { path: { labId }, query: { page: 1, pageSize: 100 } } },
      );
      if (error || !response.ok) {
        throw error ?? new Error(`Yêu cầu thất bại (HTTP ${response.status})`);
      }
      return data as unknown as {
        items: {
          id: string;
          assetCode: string;
          hostname: string;
          type: 'master' | 'client';
        }[];
      };
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (seats: EditorSeat[]) => {
      const { error } = await apiClient.PUT(
        '/labs/{labId}/layouts/{id}/seats',
        {
          params: { path: { labId, id: layoutId } },
          body: { seats: seatsToApiPayload(seats) },
        },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['labs', labId, 'layouts', layoutId],
      });
    },
  });

  const applyMutation = useMutation({
    mutationFn: async (input: {
      templateId: string;
      mode: 'replace' | 'append';
      matchCanvas: boolean;
    }) => {
      await apiFetchJson(
        `/labs/${labId}/layouts/${layoutId}/apply-template`,
        {
          method: 'POST',
          body: JSON.stringify(input),
        },
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['labs', labId, 'layouts', layoutId],
      });
      setApplyOpen(false);
    },
  });

  const initialSeats = useMemo(
    () => (layoutQuery.data ? seatsFromApi(layoutQuery.data.seats) : []),
    [layoutQuery.data],
  );

  if (layoutQuery.isLoading) {
    return (
      <PageShell>
        <p className="text-sm text-muted-foreground">Đang tải…</p>
      </PageShell>
    );
  }

  if (layoutQuery.error || !layoutQuery.data) {
    return (
      <PageShell>
        <p role="alert" className="text-sm text-destructive">
          Không tải được sơ đồ chỗ ngồi.
        </p>
        <Button variant="outline" asChild className="mt-4 w-fit">
          <Link href={`/labs/${labId}/layouts`}>Quay lại</Link>
        </Button>
      </PageShell>
    );
  }

  const layout = layoutQuery.data;

  return (
    <PageShell>
      <PageHeader
        title={`${layout.name} (v${layout.versionNo})`}
        description={
          layout.isActive
            ? 'Sơ đồ đang được kích hoạt'
            : 'Sơ đồ chưa kích hoạt'
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => setApplyOpen(true)}>
              Áp dụng / Nhập từ mẫu
            </Button>
            <Button variant="outline" asChild>
              <Link href={`/labs/${labId}/layouts`}>Quay lại danh sách</Link>
            </Button>
          </div>
        }
      />
      <LabSubnav labId={labId} />

      {applyMutation.isError && (
        <p role="alert" className="text-sm text-destructive">
          Áp dụng mẫu thất bại.
        </p>
      )}
      {saveMutation.isError && (
        <p role="alert" className="text-sm text-destructive">
          Lưu thất bại. Kiểm tra mã ghế trùng hoặc máy trạm không hợp lệ.
        </p>
      )}
      {saveMutation.isSuccess && (
        <p className="text-sm text-muted-foreground">Đã lưu sơ đồ.</p>
      )}
      <SeatingEditor
        canvasWidth={layout.canvasWidth}
        canvasHeight={layout.canvasHeight}
        initialSeats={initialSeats}
        workstations={wsQuery.data?.items ?? []}
        saving={saveMutation.isPending}
        onSave={(seats) => saveMutation.mutate(seats)}
      />
      <ApplyTemplateDialog
        open={applyOpen}
        canvasWidth={layout.canvasWidth}
        canvasHeight={layout.canvasHeight}
        applying={applyMutation.isPending}
        onClose={() => setApplyOpen(false)}
        onApply={(input) => applyMutation.mutate(input)}
      />
    </PageShell>
  );
}
