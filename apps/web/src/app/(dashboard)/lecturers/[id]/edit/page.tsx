'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  LecturerForm,
  LecturerFormValues,
} from '@/components/master-data/lecturer-form';
import { PageHeader } from '@/components/layout/page-header';
import { PageShell } from '@/components/layout/page-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { apiClient } from '@/lib/api-client';
import { apiFetchJson } from '@/lib/api-fetch';

interface LecturerDetail {
  id: string;
  employeeCode: string;
  fullName: string;
  department: string | null;
  academicTitle: string | null;
  email: string | null;
  phone: string | null;
}

export default function EditLecturerPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;

  const lecturerQuery = useQuery({
    queryKey: ['lecturers', id],
    queryFn: () => apiFetchJson<LecturerDetail>(`/lecturers/${id}`),
  });

  const updateMutation = useMutation({
    mutationFn: async (values: LecturerFormValues) => {
      const { error } = await apiClient.PATCH('/lecturers/{id}', {
        params: { path: { id } },
        body: {
          fullName: values.fullName,
          department: values.department ?? null,
          academicTitle: values.academicTitle ?? null,
          email: values.email ?? null,
          phone: values.phone ?? null,
        },
      });
      if (error) throw error;
    },
    onSuccess: () => router.push('/lecturers'),
  });

  return (
    <PageShell>
      <PageHeader
        title={
          lecturerQuery.data
            ? `Sửa GV — ${lecturerQuery.data.employeeCode}`
            : 'Sửa giảng viên'
        }
        actions={
          <Button variant="outline" asChild>
            <Link href="/lecturers">Quay lại</Link>
          </Button>
        }
      />
      {lecturerQuery.isLoading ? (
        <Card>
          <p className="p-4 text-sm text-muted-foreground">Đang tải…</p>
        </Card>
      ) : lecturerQuery.error || !lecturerQuery.data ? (
        <Card>
          <p role="alert" className="p-4 text-sm text-destructive">
            Không tải được giảng viên.
          </p>
        </Card>
      ) : (
        <Card>
          <CardContent className="pt-6">
            <LecturerForm
              defaultValues={{
                employeeCode: lecturerQuery.data.employeeCode,
                fullName: lecturerQuery.data.fullName,
                department: lecturerQuery.data.department ?? undefined,
                academicTitle: lecturerQuery.data.academicTitle ?? undefined,
                email: lecturerQuery.data.email ?? undefined,
                phone: lecturerQuery.data.phone ?? undefined,
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
