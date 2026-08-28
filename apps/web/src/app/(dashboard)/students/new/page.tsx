'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import {
  StudentForm,
  StudentFormValues,
} from '@/components/master-data/student-form';
import { PageHeader } from '@/components/layout/page-header';
import { PageShell } from '@/components/layout/page-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { apiClient } from '@/lib/api-client';

export default function NewStudentPage() {
  const router = useRouter();

  const createMutation = useMutation({
    mutationFn: async (values: StudentFormValues) => {
      const { error } = await apiClient.POST('/students', { body: values });
      if (error) throw error;
    },
    onSuccess: () => router.push('/students'),
  });

  return (
    <PageShell>
      <PageHeader
        title="Thêm sinh viên"
        actions={
          <Button variant="outline" asChild>
            <Link href="/students">Quay lại</Link>
          </Button>
        }
      />
      <Card>
        <CardContent className="pt-6">
          <StudentForm onSubmit={(values) => createMutation.mutate(values)} />
        </CardContent>
      </Card>
    </PageShell>
  );
}
