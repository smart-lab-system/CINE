'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import {
  LecturerForm,
  LecturerFormValues,
} from '@/components/master-data/lecturer-form';
import { PageHeader } from '@/components/layout/page-header';
import { PageShell } from '@/components/layout/page-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { apiClient } from '@/lib/api-client';

export default function NewLecturerPage() {
  const router = useRouter();

  const createMutation = useMutation({
    mutationFn: async (values: LecturerFormValues) => {
      const { error } = await apiClient.POST('/lecturers', { body: values });
      if (error) throw error;
    },
    onSuccess: () => router.push('/lecturers'),
  });

  return (
    <PageShell>
      <PageHeader
        title="Thêm giảng viên"
        actions={
          <Button variant="outline" asChild>
            <Link href="/lecturers">Quay lại</Link>
          </Button>
        }
      />
      <Card>
        <CardContent className="pt-6">
          <LecturerForm onSubmit={(values) => createMutation.mutate(values)} />
        </CardContent>
      </Card>
    </PageShell>
  );
}
