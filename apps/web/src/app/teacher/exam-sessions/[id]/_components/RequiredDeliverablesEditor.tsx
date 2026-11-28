'use client';

import { useEffect, useRef } from 'react';
import { FormProvider, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { RequiredFilenamesInput } from '@/app/teacher/exam-sessions/new/_components/RequiredFilenamesInput';
import {
  DEFAULT_ARCHIVE_DELIVERABLE,
  replaceRequiredDeliverablesSchema,
  type ReplaceRequiredDeliverablesFormValues,
} from '@/app/teacher/exam-sessions/new/schema';
import type { RequiredDeliverableResponse } from '@/lib/api/exam-session';
import { ExamFolderPreview } from './ExamFolderPreview';
import { foldersMatch } from './setup-draft';
import { useSetupDraftOptional } from './SetupDraftProvider';

/**
 * Giá trị form editor. DB trống → điền mặc định `{SOMAY}_{MSSV}_{HOTEN}.zip`
 * để GV thấy sẵn; baseline server dùng `toServerFolderBaseline` (trống) để
 * checklist vẫn đòi lưu thật.
 */
export function toDeliverableFormValues(
  deliverables: RequiredDeliverableResponse[],
): ReplaceRequiredDeliverablesFormValues {
  if (deliverables.length === 0) {
    return {
      requiredFilenames: [{ value: DEFAULT_ARCHIVE_DELIVERABLE, deliverableType: 'document' }],
    };
  }
  // Hub chỉ còn 1 gói; nếu DB còn nhiều dòng (phiên cũ) lấy dòng đầu để GV sửa.
  const d = deliverables[0]!;
  return {
    requiredFilenames: [
      {
        value: d.requiredFilename,
        deliverableType: d.deliverableType,
        ...(d.language === 'python' || d.language === 'cpp' || d.language === 'java'
          ? { language: d.language }
          : {}),
        ...(d.entries.length > 0
          ? { entries: d.entries.map((value) => ({ value })) }
          : {}),
      },
    ],
  };
}

/** Tên file sẽ bị xoá khi lưu gói đơn (phiên cũ nhiều dòng). */
export function legacyExtraDeliverableNames(
  deliverables: RequiredDeliverableResponse[],
): string[] {
  if (deliverables.length <= 1) return [];
  return deliverables.slice(1).map((d) => d.requiredFilename);
}

/** Baseline so sánh bẩn / checklist: DB trống = chưa có gói đã lưu. */
export function toServerFolderBaseline(
  deliverables: RequiredDeliverableResponse[],
): ReplaceRequiredDeliverablesFormValues {
  if (deliverables.length === 0) {
    return {
      requiredFilenames: [{ value: '', deliverableType: 'document' }],
    };
  }
  // Nhiều dòng cũ: baseline khác form 1 gói → bước folder dirty + hiện cảnh báo
  // cho đến khi GV lưu (PUT sẽ giữ đúng 1 gói).
  if (deliverables.length > 1) {
    return {
      requiredFilenames: [{ value: '', deliverableType: 'document' }],
    };
  }
  return toDeliverableFormValues(deliverables);
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
  legacyExtraFilenames = [],
}: {
  initialValues: ReplaceRequiredDeliverablesFormValues;
  materialFilenames: string[];
  /** File thêm trên phiên cũ - sẽ bị xoá khi lưu 1 gói. */
  legacyExtraFilenames?: string[];
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

  // Phiên cũ nhiều dòng: so với baseline trống để draft dirty + checklist đếm đúng 1 gói.
  const baselineRef = useRef(
    legacyExtraFilenames.length > 0
      ? ({
          requiredFilenames: [{ value: '', deliverableType: 'document' }],
        } satisfies ReplaceRequiredDeliverablesFormValues)
      : initialValues,
  );
  useEffect(() => {
    if (legacyExtraFilenames.length > 0) {
      setupRef.current?.patchDraft({ folder: form.getValues() });
    }
  }, [form, legacyExtraFilenames.length]);
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
        {legacyExtraFilenames.length > 0 ? (
          <Alert>
            <AlertDescription>
              Phiên cũ còn {legacyExtraFilenames.length + 1} file bắt buộc. Hub chỉ giữ 1
              gói - khi lưu sẽ xoá:{' '}
              {legacyExtraFilenames.join(', ')}. Kiểm tra gói còn lại rồi bấm Lưu.
            </AlertDescription>
          </Alert>
        ) : null}
        <RequiredFilenamesInput />
        <LiveFolderPreview materialFilenames={materialFilenames} />
      </div>
    </FormProvider>
  );
}
