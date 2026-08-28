'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import {
  WorkstationForm,
  WorkstationFormValues,
} from '@/components/labs/workstation-form';
import { PageHeader } from '@/components/layout/page-header';
import { PageShell } from '@/components/layout/page-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { apiClient } from '@/lib/api-client';

export default function NewWorkstationPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const labId = params.id;

  const createMutation = useMutation({
    mutationFn: async (values: WorkstationFormValues) => {
      const { error } = await apiClient.POST('/labs/{labId}/workstations', {
        params: { path: { labId } },
        body: values,
      });
      if (error) throw error;
    },
    onSuccess: () => router.push(`/labs/${labId}/workstations`),
  });

  return (
    <PageShell>
      <PageHeader
        title="Thêm máy trạm"
        actions={
          <Button variant="outline" asChild>
            <Link href={`/labs/${labId}/workstations`}>Quay lại</Link>
          </Button>
        }
      />
      <Card>
        <CardContent className="pt-6">
          <WorkstationForm
            onSubmit={(values) => createMutation.mutate(values)}
          />
        </CardContent>
      </Card>
    </PageShell>
  );
}
