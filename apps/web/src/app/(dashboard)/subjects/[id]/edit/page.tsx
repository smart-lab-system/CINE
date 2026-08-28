'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  SubjectForm,
  SubjectFormValues,
} from '@/components/master-data/subject-form';
import { PageHeader } from '@/components/layout/page-header';
import { PageShell } from '@/components/layout/page-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { apiClient } from '@/lib/api-client';
import { apiFetchJson } from '@/lib/api-fetch';

interface SubjectDetail {
  id: string;
  code: string;
  name: string;
  credits: number | null;
  description: string | null;
}

export default function EditSubjectPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;

  const subjectQuery = useQuery({
    queryKey: ['subjects', id],
    queryFn: () => apiFetchJson<SubjectDetail>(`/subjects/${id}`),
  });

  const updateMutation = useMutation({
    mutationFn: async (values: SubjectFormValues) => {
      const { error } = await apiClient.PATCH('/subjects/{id}', {
        params: { path: { id } },
        body: {
          name: values.name,
          credits: values.credits ?? null,
          description: values.description ?? null,
        },
      });
      if (error) throw error;
    },
    onSuccess: () => router.push('/subjects'),
  });

  return (
    <PageShell>
      <PageHeader
        title={
          subjectQuery.data
            ? `Sửa môn — ${subjectQuery.data.code}`
            : 'Sửa môn học'
        }
        actions={
          <Button variant="outline" asChild>
            <Link href="/subjects">Quay lại</Link>
          </Button>
        }
      />
      {subjectQuery.isLoading ? (
        <Card>
          <p className="p-4 text-sm text-muted-foreground">Đang tải…</p>
        </Card>
      ) : subjectQuery.error || !subjectQuery.data ? (
        <Card>
          <p role="alert" className="p-4 text-sm text-destructive">
            Không tải được môn học.
          </p>
        </Card>
      ) : (
        <Card>
          <CardContent className="pt-6">
            <SubjectForm
              defaultValues={{
                code: subjectQuery.data.code,
                name: subjectQuery.data.name,
                credits: subjectQuery.data.credits ?? undefined,
                description: subjectQuery.data.description ?? undefined,
              }}
              submitLabel="Cập nhật"
              onSubmit={(values) => updateMutation.mutate(values)}
            />
          </CardContent>
        </Card>
      )}
    </PageShell>
  );
}
