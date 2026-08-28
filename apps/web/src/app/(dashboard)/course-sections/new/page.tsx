'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  CourseSectionForm,
  CourseSectionFormValues,
} from '@/components/master-data/course-section-form';
import { PageHeader } from '@/components/layout/page-header';
import { PageShell } from '@/components/layout/page-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { apiClient } from '@/lib/api-client';

export default function NewCourseSectionPage() {
  const router = useRouter();

  const subjectsQuery = useQuery({
    queryKey: ['subjects', 'for-section-form'],
    queryFn: async () => {
      const { data, error, response } = await apiClient.GET('/subjects', {
        params: { query: { page: 1, pageSize: 100 } },
      });
      if (error || !response.ok) throw error ?? new Error('subjects failed');
      return data as unknown as {
        items: { id: string; code: string; name: string }[];
      };
    },
  });

  const termsQuery = useQuery({
    queryKey: ['academic-terms', 'for-section-form'],
    queryFn: async () => {
      const { data, error, response } = await apiClient.GET('/academic-terms', {
        params: { query: { page: 1, pageSize: 100 } },
      });
      if (error || !response.ok) throw error ?? new Error('terms failed');
      return data as unknown as {
        items: { id: string; code: string; name: string }[];
      };
    },
  });

  const lecturersQuery = useQuery({
    queryKey: ['lecturers', 'for-section-form'],
    queryFn: async () => {
      const { data, error, response } = await apiClient.GET('/lecturers', {
        params: { query: { page: 1, pageSize: 100 } },
      });
      if (error || !response.ok) throw error ?? new Error('lecturers failed');
      return data as unknown as {
        items: { id: string; employeeCode: string; fullName: string }[];
      };
    },
  });

  const createMutation = useMutation({
    mutationFn: async (values: CourseSectionFormValues) => {
      const { error } = await apiClient.POST('/course-sections', {
        body: values,
      });
      if (error) throw error;
    },
    onSuccess: () => router.push('/course-sections'),
  });

  return (
    <PageShell>
      <PageHeader
        title="Thêm lớp học phần"
        actions={
          <Button variant="outline" asChild>
            <Link href="/course-sections">Quay lại</Link>
          </Button>
        }
      />
      <Card>
        <CardContent className="pt-6">
          <CourseSectionForm
            subjects={subjectsQuery.data?.items ?? []}
            terms={termsQuery.data?.items ?? []}
            lecturers={lecturersQuery.data?.items ?? []}
            onSubmit={(values) => createMutation.mutate(values)}
          />
        </CardContent>
      </Card>
    </PageShell>
  );
}
