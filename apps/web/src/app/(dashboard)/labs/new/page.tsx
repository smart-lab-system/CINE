'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { LabForm, LabFormValues } from '@/components/labs/lab-form';
import { PageHeader } from '@/components/layout/page-header';
import { PageShell } from '@/components/layout/page-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { apiClient } from '@/lib/api-client';

export default function NewLabPage() {
  const router = useRouter();

  const createMutation = useMutation({
    mutationFn: async (values: LabFormValues) => {
      const { error } = await apiClient.POST('/labs', { body: values });
      if (error) throw error;
    },
    onSuccess: () => router.push('/labs'),
  });

  return (
    <PageShell>
      <PageHeader
        title="Thêm phòng máy"
        actions={
          <Button variant="outline" asChild>
            <Link href="/labs">Quay lại</Link>
          </Button>
        }
      />
      <Card>
        <CardContent className="pt-6">
          <LabForm onSubmit={(values) => createMutation.mutate(values)} />
        </CardContent>
      </Card>
    </PageShell>
  );
}
