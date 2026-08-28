'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import {
  AcademicTermForm,
  AcademicTermFormValues,
} from '@/components/master-data/academic-term-form';
import { PageHeader } from '@/components/layout/page-header';
import { PageShell } from '@/components/layout/page-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { apiClient } from '@/lib/api-client';

export default function NewAcademicTermPage() {
  const router = useRouter();

  const createMutation = useMutation({
    mutationFn: async (values: AcademicTermFormValues) => {
      const { error } = await apiClient.POST('/academic-terms', {
        body: values,
      });
      if (error) throw error;
    },
    onSuccess: () => router.push('/academic-terms'),
  });

  return (
    <PageShell>
      <PageHeader
        title="Thêm học kỳ"
        actions={
          <Button variant="outline" asChild>
            <Link href="/academic-terms">Quay lại</Link>
          </Button>
        }
      />
      <Card>
        <CardContent className="pt-6">
          <AcademicTermForm
            onSubmit={(values) => createMutation.mutate(values)}
          />
        </CardContent>
      </Card>
    </PageShell>
  );
}
