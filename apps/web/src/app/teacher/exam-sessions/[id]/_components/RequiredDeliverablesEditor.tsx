'use client';

import { useEffect, useRef } from 'react';
import { FormProvider, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { RequiredFilenamesInput } from '@/app/teacher/exam-sessions/new/_components/RequiredFilenamesInput';
import {
  replaceRequiredDeliverablesSchema,
  type ReplaceRequiredDeliverablesFormValues,
} from '@/app/teacher/exam-sessions/new/schema';
import type { RequiredDeliverableResponse } from '@/lib/api/exam-session';
import { ExamFolderPreview } from './ExamFolderPreview';
import { foldersMatch } from './setup-draft';
import { useSetupDraftOptional } from './SetupDraftProvider';

export function toDeliverableFormValues(
  deliverables: RequiredDeliverableResponse[],
): ReplaceRequiredDeliverablesFormValues {
  if (deliverables.length === 0) {
    return { requiredFilenames: [{ value: '', deliverableType: 'document' }] };
  }
  return {
    requiredFilenames: deliverables.map((d) => ({
      value: d.requiredFilename,
      deliverableType: d.deliverableType,
      ...(d.language === 'python' || d.language === 'cpp' || d.language === 'java'
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
  initialValues,
  materialFilenames,
}: {
  initialValues: ReplaceRequiredDeliverablesFormValues;
  materialFilenames: string[];
}) {
  const setupDraft = useSetupDraftOptional();
  const setupRef = useRef(setupDraft);
  setupRef.current = setupDraft;
  const form = useForm<ReplaceRequiredDeliverablesFormValues>({
    resolver: zodResolver(replaceRequiredDeliverablesSchema),
    defaultValues: initialValues,
  });

  useEffect(() => {
    return setupRef.current?.registerSnapshot(() => ({
      folder: form.getValues(),
    }));
  }, [form]);

  const baselineRef = useRef(initialValues);
  useEffect(() => {
    const subscription = form.watch((values) => {
      const next = values as ReplaceRequiredDeliverablesFormValues;
      const same = foldersMatch(next, baselineRef.current);
      setupRef.current?.patchDraft({ folder: same ? undefined : next });
    });
    return () => subscription.unsubscribe();
  }, [form]);

  return (
    <FormProvider {...form}>
      <div className="flex flex-col gap-4">
        <RequiredFilenamesInput />
        <LiveFolderPreview materialFilenames={materialFilenames} />
      </div>
    </FormProvider>
  );
}
