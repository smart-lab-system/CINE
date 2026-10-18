'use client';

import { useEffect } from 'react';
import { FormProvider, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { RequiredFilenamesInput } from '@/app/teacher/exam-sessions/new/_components/RequiredFilenamesInput';
import {
  replaceRequiredDeliverablesSchema,
  type ReplaceRequiredDeliverablesFormValues,
} from '@/app/teacher/exam-sessions/new/schema';
import { useReplaceRequiredDeliverables } from '@/hooks/useExamSession';
import type { RequiredDeliverableResponse } from '@/lib/api/exam-session';
import { ExamFolderPreview } from './ExamFolderPreview';

function toFormValues(
  deliverables: RequiredDeliverableResponse[],
): ReplaceRequiredDeliverablesFormValues {
  if (deliverables.length === 0) {
    return { requiredFilenames: [{ value: '', deliverableType: 'document' }] };
  }
  return {
    requiredFilenames: deliverables.map((d) => ({
      value: d.requiredFilename,
      deliverableType: d.deliverableType,
      ...(d.language === 'python' || d.language === 'cpp'
        ? { language: d.language }
        : {}),
      ...(d.entries.length > 0
        ? { entries: d.entries.map((value) => ({ value })) }
        : {}),
    })),
  };
}

function LiveFolderPreview({ materialFilenames }: { materialFilenames: string[] }) {
  const watched = useWatch<ReplaceRequiredDeliverablesFormValues, 'requiredFilenames'>({
    name: 'requiredFilenames',
  });

  const requiredFiles = (watched ?? []).map((filename) => ({
    pattern: filename?.value ?? '',
    deliverableType: filename?.deliverableType ?? 'document',
    language: filename?.language ?? null,
    entries: (filename?.entries ?? []).map((entry) => entry.value),
  }));

  return (
    <ExamFolderPreview
      materialFilenames={materialFilenames}
      requiredFiles={requiredFiles}
    />
  );
}

export function RequiredDeliverablesEditor({
  sessionId,
  deliverables,
  materialFilenames,
}: {
  sessionId: string;
  deliverables: RequiredDeliverableResponse[];
  materialFilenames: string[];
}) {
  const replace = useReplaceRequiredDeliverables(sessionId);
  const form = useForm<ReplaceRequiredDeliverablesFormValues>({
    resolver: zodResolver(replaceRequiredDeliverablesSchema),
    defaultValues: toFormValues(deliverables),
  });

  useEffect(() => {
    form.reset(toFormValues(deliverables));
  }, [deliverables, form]);

  function onSubmit(values: ReplaceRequiredDeliverablesFormValues) {
    replace.mutate(
      {
        requiredFilenames: values.requiredFilenames.map((filename) => ({
          filename: filename.value,
          ...(filename.deliverableType !== 'document'
            ? { deliverableType: filename.deliverableType }
            : {}),
          ...(filename.language ? { language: filename.language } : {}),
          ...(filename.entries && filename.entries.length > 0
            ? { entries: filename.entries.map((entry) => entry.value) }
            : {}),
        })),
      },
      {
        onSuccess: () => toast.success('Đã lưu cấu hình thư mục bài thi'),
        onError: (e) =>
          toast.error(e instanceof Error ? e.message : 'Không lưu được cấu hình thư mục'),
      },
    );
  }

  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <RequiredFilenamesInput />
        <div className="flex justify-end">
          <Button type="submit" loading={replace.isPending}>
            Lưu cấu hình thư mục
          </Button>
        </div>
        <LiveFolderPreview materialFilenames={materialFilenames} />
      </form>
    </FormProvider>
  );
}
