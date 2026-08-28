'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  AcademicTermForm,
  AcademicTermFormValues,
} from '@/components/master-data/academic-term-form';
import { PageHeader } from '@/components/layout/page-header';
import { PageShell } from '@/components/layout/page-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { apiClient } from '@/lib/api-client';
import { apiFetchJson } from '@/lib/api-fetch';

interface TermDetail {
  id: string;
  code: string;
  name: string;
  startsOn: string;
  endsOn: string;
  isActive: boolean;
}

export default function EditAcademicTermPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;

  const termQuery = useQuery({
    queryKey: ['academic-terms', id],
    queryFn: () => apiFetchJson<TermDetail>(`/academic-terms/${id}`),
  });

  const updateMutation = useMutation({
    mutationFn: async (values: AcademicTermFormValues) => {
      const { error } = await apiClient.PATCH('/academic-terms/{id}', {
        params: { path: { id } },
        body: {
          name: values.name,
          startsOn: values.startsOn,
          endsOn: values.endsOn,
          isActive: values.isActive,
        },
      });
      if (error) throw error;
    },
    onSuccess: () => router.push('/academic-terms'),
  });

  return (
    <PageShell>
      <PageHeader
        title={
          termQuery.data
            ? `Sửa học kỳ — ${termQuery.data.code}`
            : 'Sửa học kỳ'
        }
        actions={
          <Button variant="outline" asChild>
            <Link href="/academic-terms">Quay lại</Link>
          </Button>
        }
      />
      {termQuery.isLoading ? (
        <Card>
          <p className="p-4 text-sm text-muted-foreground">Đang tải…</p>
        </Card>
      ) : termQuery.error || !termQuery.data ? (
        <Card>
          <p role="alert" className="p-4 text-sm text-destructive">
            Không tải được học kỳ.
          </p>
        </Card>
      ) : (
        <Card>
          <CardContent className="pt-6">
            <AcademicTermForm
              defaultValues={{
                ...termQuery.data,
                startsOn: termQuery.data.startsOn.slice(0, 10),
                endsOn: termQuery.data.endsOn.slice(0, 10),
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
