'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { LayoutForm, LayoutFormValues } from '@/components/labs/layout-form';
import { PageHeader } from '@/components/layout/page-header';
import { PageShell } from '@/components/layout/page-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { apiClient } from '@/lib/api-client';

export default function NewLabLayoutPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const labId = params.id;

  const createMutation = useMutation({
    mutationFn: async (values: LayoutFormValues) => {
      const { data, error, response } = await apiClient.POST(
        '/labs/{labId}/layouts',
        {
          params: { path: { labId } },
          body: values,
        },
      );
      if (error || !response.ok) throw error ?? new Error('Tạo layout thất bại');
      return data as unknown as { id: string };
    },
    onSuccess: (created) => {
      if (created?.id) {
        router.push(`/labs/${labId}/layouts/${created.id}`);
      } else {
        router.push(`/labs/${labId}/layouts`);
      }
    },
  });

  return (
    <PageShell>
      <PageHeader
        title="Thêm layout"
        actions={
          <Button variant="outline" asChild>
            <Link href={`/labs/${labId}/layouts`}>Quay lại</Link>
          </Button>
        }
      />
      <Card>
        <CardContent className="pt-6">
          <LayoutForm onSubmit={(values) => createMutation.mutate(values)} />
        </CardContent>
      </Card>
    </PageShell>
  );
}
