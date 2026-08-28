'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
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

interface SectionDetail {
  id: string;
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  academicTermId: string;
  termCode: string;
  termName: string;
  sectionCode: string;
  nominalClassCode: string | null;
  name: string | null;
  lecturerId: string | null;
  lecturerCode: string | null;
  lecturerName: string | null;
  maxEnrollment: number | null;
}

export default function EditCourseSectionPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const sectionId = params.id;

  const sectionQuery = useQuery({
    queryKey: ['course-sections', sectionId],
    queryFn: async () => {
      const { data, error, response } = await apiClient.GET(
        '/course-sections/{id}',
        { params: { path: { id: sectionId } } },
      );
      if (error || !response.ok) {
        throw error ?? new Error(`Yêu cầu thất bại (HTTP ${response.status})`);
      }
      return data as unknown as SectionDetail;
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

  const updateMutation = useMutation({
    mutationFn: async (values: CourseSectionFormValues) => {
      const { error } = await apiClient.PATCH('/course-sections/{id}', {
        params: { path: { id: sectionId } },
        body: {
          nominalClassCode: values.nominalClassCode ?? null,
          name: values.name ?? null,
          lecturerId: values.lecturerId ?? null,
          maxEnrollment: values.maxEnrollment ?? null,
        },
      });
      if (error) throw error;
    },
    onSuccess: () => router.push(`/course-sections/${sectionId}`),
  });

  const section = sectionQuery.data;

  return (
    <PageShell>
      <PageHeader
        title={
          section ? `Sửa lớp — ${section.sectionCode}` : 'Sửa lớp học phần'
        }
        actions={
          <Button variant="outline" asChild>
            <Link href={`/course-sections/${sectionId}`}>Quay lại</Link>
          </Button>
        }
      />
      {sectionQuery.isLoading ? (
        <Card>
          <p className="p-4 text-sm text-muted-foreground">Đang tải…</p>
        </Card>
      ) : sectionQuery.error || !section ? (
        <Card>
          <p role="alert" className="p-4 text-sm text-destructive">
            Không tải được lớp học phần.
          </p>
        </Card>
      ) : (
        <Card>
          <CardContent className="pt-6">
            <CourseSectionForm
              lockRelations
              subjects={[
                {
                  id: section.subjectId,
                  code: section.subjectCode,
                  name: section.subjectName,
                },
              ]}
              terms={[
                {
                  id: section.academicTermId,
                  code: section.termCode,
                  name: section.termName,
                },
              ]}
              lecturers={lecturersQuery.data?.items ?? []}
              defaultValues={{
                subjectId: section.subjectId,
                academicTermId: section.academicTermId,
                sectionCode: section.sectionCode,
                nominalClassCode: section.nominalClassCode ?? undefined,
                name: section.name ?? undefined,
                lecturerId: section.lecturerId ?? undefined,
                maxEnrollment: section.maxEnrollment ?? undefined,
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
