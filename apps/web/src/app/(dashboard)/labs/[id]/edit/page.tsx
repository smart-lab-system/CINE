'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LabForm, LabFormValues } from '@/components/labs/lab-form';
import { PageHeader } from '@/components/layout/page-header';
import { PageShell } from '@/components/layout/page-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { apiClient } from '@/lib/api-client';

interface LabDetail {
  id: string;
  code: string;
  name: string;
  building: string | null;
  floor: string | null;
  capacity: number;
  description: string | null;
  isActive: boolean;
}

export default function EditLabPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const labId = params.id;

  const labQuery = useQuery({
    queryKey: ['labs', labId],
    queryFn: async () => {
      const { data, error, response } = await apiClient.GET('/labs/{id}', {
        params: { path: { id: labId } },
      });
      if (error || !response.ok) {
        throw error ?? new Error(`Yêu cầu thất bại (HTTP ${response.status})`);
      }
      return data as unknown as LabDetail;
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (values: LabFormValues) => {
      const { error } = await apiClient.PATCH('/labs/{id}', {
        params: { path: { id: labId } },
        body: {
          name: values.name,
          building: values.building ?? null,
          floor: values.floor ?? null,
          capacity: values.capacity,
          description: values.description ?? null,
          isActive: values.isActive,
        },
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['labs', labId] });
      router.push(`/labs/${labId}`);
    },
  });

  return (
    <PageShell>
      <PageHeader
        title={
          labQuery.data
            ? `Sửa phòng — ${labQuery.data.code}`
            : 'Sửa phòng máy'
        }
        actions={
          <Button variant="outline" asChild>
            <Link href={`/labs/${labId}`}>Quay lại</Link>
          </Button>
        }
      />
      {labQuery.isLoading ? (
        <Card>
          <p className="p-4 text-sm text-muted-foreground">Đang tải…</p>
        </Card>
      ) : labQuery.error || !labQuery.data ? (
        <Card>
          <p role="alert" className="p-4 text-sm text-destructive">
            Không tải được phòng máy.
          </p>
        </Card>
      ) : (
        <Card>
          <CardContent className="pt-6">
            <LabForm
              codeDisabled
              submitLabel="Cập nhật"
              defaultValues={{
                code: labQuery.data.code,
                name: labQuery.data.name,
                building: labQuery.data.building ?? undefined,
                floor: labQuery.data.floor ?? undefined,
                capacity: labQuery.data.capacity,
                description: labQuery.data.description ?? undefined,
                isActive: labQuery.data.isActive,
              }}
              onSubmit={(values) => updateMutation.mutate(values)}
            />
          </CardContent>
        </Card>
      )}
    </PageShell>
  );
}
