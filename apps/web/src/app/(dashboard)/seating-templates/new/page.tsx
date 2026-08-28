'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import {
  TemplateForm,
  TemplateFormValues,
} from '@/components/labs/template-form';
import { PageHeader } from '@/components/layout/page-header';
import { PageShell } from '@/components/layout/page-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { apiFetchJson } from '@/lib/api-fetch';

export default function NewSeatingTemplatePage() {
  const router = useRouter();

  const createMutation = useMutation({
    mutationFn: async (values: TemplateFormValues) => {
      return apiFetchJson<{ id: string }>('/seating-templates', {
        method: 'POST',
        body: JSON.stringify({
          name: values.name,
          description: values.description ?? null,
          canvasWidth: values.canvasWidth,
          canvasHeight: values.canvasHeight,
          layoutData: [],
        }),
      });
    },
    onSuccess: (created) => {
      if (created?.id) {
        router.push(`/seating-templates/${created.id}`);
      } else {
        router.push('/seating-templates');
      }
    },
  });

  return (
    <PageShell>
      <PageHeader
        title="Thêm sơ đồ mẫu"
        description="Tạo bản vẽ chỗ ngồi workstation-agnostic, rồi bố trí ghế trên canvas."
        actions={
          <Button variant="outline" asChild>
            <Link href="/seating-templates">Quay lại</Link>
          </Button>
        }
      />
      {createMutation.isError ? (
        <p role="alert" className="text-sm text-destructive">
          Tạo mẫu thất bại. Tên mẫu có thể đã tồn tại.
        </p>
      ) : null}
      <Card>
        <CardContent className="pt-6">
          <TemplateForm onSubmit={(values) => createMutation.mutate(values)} />
        </CardContent>
      </Card>
    </PageShell>
  );
}
