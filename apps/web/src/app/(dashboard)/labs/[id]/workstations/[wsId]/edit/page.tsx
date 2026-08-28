'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  WorkstationForm,
  WorkstationFormValues,
} from '@/components/labs/workstation-form';
import { PageHeader } from '@/components/layout/page-header';
import { PageShell } from '@/components/layout/page-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { apiClient } from '@/lib/api-client';

interface WorkstationDetail {
  id: string;
  assetCode: string;
  hostname: string;
  macAddress: string | null;
  staticIpAddress: string | null;
  serialNumber: string | null;
  operatingSystem: string | null;
  isEnabled: boolean;
  type: 'master' | 'client';
  status: 'available' | 'maintenance' | 'broken' | 'retired';
  notes: string | null;
}

export default function EditWorkstationPage() {
  const params = useParams<{ id: string; wsId: string }>();
  const router = useRouter();
  const labId = params.id;
  const wsId = params.wsId;

  const wsQuery = useQuery({
    queryKey: ['labs', labId, 'workstations', wsId],
    queryFn: async () => {
      const { data, error, response } = await apiClient.GET(
        '/labs/{labId}/workstations/{id}',
        { params: { path: { labId, id: wsId } } },
      );
      if (error || !response.ok) {
        throw error ?? new Error(`Yêu cầu thất bại (HTTP ${response.status})`);
      }
      return data as unknown as WorkstationDetail;
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (values: WorkstationFormValues) => {
      const { error } = await apiClient.PATCH(
        '/labs/{labId}/workstations/{id}',
        {
          params: { path: { labId, id: wsId } },
          body: {
            assetCode: values.assetCode,
            hostname: values.hostname,
            macAddress: values.macAddress ?? null,
            staticIpAddress: values.staticIpAddress ?? null,
            serialNumber: values.serialNumber ?? null,
            operatingSystem: values.operatingSystem ?? null,
            isEnabled: values.isEnabled,
            type: values.type,
            status: values.status,
            notes: values.notes ?? null,
          },
        },
      );
      if (error) throw error;
    },
    onSuccess: () => router.push(`/labs/${labId}/workstations`),
  });

  return (
    <PageShell>
      <PageHeader
        title={
          wsQuery.data
            ? `Sửa máy — ${wsQuery.data.assetCode}`
            : 'Sửa máy trạm'
        }
        actions={
          <Button variant="outline" asChild>
            <Link href={`/labs/${labId}/workstations`}>Quay lại</Link>
          </Button>
        }
      />
      {wsQuery.isLoading ? (
        <Card>
          <p className="p-4 text-sm text-muted-foreground">Đang tải…</p>
        </Card>
      ) : wsQuery.error || !wsQuery.data ? (
        <Card>
          <p role="alert" className="p-4 text-sm text-destructive">
            Không tải được máy trạm.
          </p>
        </Card>
      ) : (
        <Card>
          <CardContent className="pt-6">
            <WorkstationForm
              submitLabel="Cập nhật"
              defaultValues={{
                assetCode: wsQuery.data.assetCode,
                hostname: wsQuery.data.hostname,
                macAddress: wsQuery.data.macAddress ?? undefined,
                staticIpAddress: wsQuery.data.staticIpAddress ?? undefined,
                serialNumber: wsQuery.data.serialNumber ?? undefined,
                operatingSystem: wsQuery.data.operatingSystem ?? undefined,
                isEnabled: wsQuery.data.isEnabled,
                type: wsQuery.data.type,
                status: wsQuery.data.status,
                notes: wsQuery.data.notes ?? undefined,
              }}
              onSubmit={(values) => updateMutation.mutate(values)}
            />
          </CardContent>
        </Card>
      )}
    </PageShell>
  );
}
