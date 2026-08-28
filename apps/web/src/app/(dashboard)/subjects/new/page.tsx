'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import {
  SubjectForm,
  SubjectFormValues,
} from '@/components/master-data/subject-form';
import { PageHeader } from '@/components/layout/page-header';
import { PageShell } from '@/components/layout/page-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { apiClient } from '@/lib/api-client';

export default function NewSubjectPage() {
  const router = useRouter();

  const createMutation = useMutation({
    mutationFn: async (values: SubjectFormValues) => {
      const { error } = await apiClient.POST('/subjects', { body: values });
      if (error) throw error;
    },
    onSuccess: () => router.push('/subjects'),
  });

  return (
    <PageShell>
      <PageHeader
        title="Thêm môn học"
        actions={
          <Button variant="outline" asChild>
            <Link href="/subjects">Quay lại</Link>
          </Button>
        }
      />
      <Card>
        <CardContent className="pt-6">
          <SubjectForm onSubmit={(values) => createMutation.mutate(values)} />
        </CardContent>
      </Card>
    </PageShell>
  );
}
