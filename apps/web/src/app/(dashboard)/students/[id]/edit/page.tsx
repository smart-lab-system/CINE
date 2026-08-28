'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  StudentForm,
  StudentFormValues,
} from '@/components/master-data/student-form';
import { PageHeader } from '@/components/layout/page-header';
import { PageShell } from '@/components/layout/page-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { apiClient } from '@/lib/api-client';
import { apiFetchJson } from '@/lib/api-fetch';

interface StudentDetail {
  id: string;
  studentCode: string;
  fullName: string;
  status: 'active' | 'graduated';
}

export default function EditStudentPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;

  const studentQuery = useQuery({
    queryKey: ['students', id],
    queryFn: () => apiFetchJson<StudentDetail>(`/students/${id}`),
  });

  const updateMutation = useMutation({
    mutationFn: async (values: StudentFormValues) => {
      const { error } = await apiClient.PATCH('/students/{id}', {
        params: { path: { id } },
        body: {
          fullName: values.fullName,
          status: values.status,
        },
      });
      if (error) throw error;
    },
    onSuccess: () => router.push('/students'),
  });

  return (
    <PageShell>
      <PageHeader
        title={
          studentQuery.data
            ? `Sửa SV — ${studentQuery.data.studentCode}`
            : 'Sửa sinh viên'
        }
        actions={
          <Button variant="outline" asChild>
            <Link href="/students">Quay lại</Link>
          </Button>
        }
      />
      {studentQuery.isLoading ? (
        <Card>
          <p className="p-4 text-sm text-muted-foreground">Đang tải…</p>
        </Card>
      ) : studentQuery.error || !studentQuery.data ? (
        <Card>
          <p role="alert" className="p-4 text-sm text-destructive">
            Không tải được sinh viên.
          </p>
        </Card>
      ) : (
        <Card>
          <CardContent className="pt-6">
            <StudentForm
              defaultValues={{
                studentCode: studentQuery.data.studentCode,
                fullName: studentQuery.data.fullName,
                status: studentQuery.data.status,
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
