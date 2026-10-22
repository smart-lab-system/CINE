'use client';

import { useEffect, useRef } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ExamMaterialsCard } from '@/app/(exam-live)/exam-sessions/[id]/_components/ExamMaterialsCard';
import type { ReplaceRequiredDeliverablesFormValues } from '@/app/teacher/exam-sessions/new/schema';
import { ExamFolderPreview } from './ExamFolderPreview';
import { RequiredDeliverablesEditor } from './RequiredDeliverablesEditor';
import { useSetupDraft } from './SetupDraftProvider';

export function SessionMaterialsStep({
  sessionId,
  releaseAt,
  materialsEditable,
  folderEditable,
  materialFilenames,
  initialFolder,
  previewFiles,
}: {
  sessionId: string;
  releaseAt: string;
  materialsEditable: boolean;
  folderEditable: boolean;
  materialFilenames: string[];
  initialFolder: ReplaceRequiredDeliverablesFormValues;
  previewFiles: {
    pattern: string;
    deliverableType: 'document' | 'code_project' | 'image';
    language: string | null;
    entries: string[];
  }[];
}) {
  const setup = useSetupDraft();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const reason = setup.errorStep === 'materials' ? setup.blockReason : null;
  const apiMessage = setup.apiError?.step === 'materials' ? setup.apiError.message : null;

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <h2 ref={headingRef} tabIndex={-1} className="text-h1 outline-none">
        Đề & thư mục
      </h2>
      <ExamMaterialsCard
        examSessionId={sessionId}
        releaseAt={releaseAt}
        canEdit={materialsEditable}
        onFileSelected={(selected) =>
          setup.patchDraft({ materialsFilePending: selected || undefined })
        }
      />
      {setup.draft?.materialsFilePending ? (
        <p className="text-small text-warning-strong">File vừa chọn chưa được tải lên.</p>
      ) : null}
      <div className="flex flex-col gap-3">
        <h3 className="text-h3">Thư mục bài thi</h3>
        {folderEditable ? (
          <RequiredDeliverablesEditor
            key={setup.epoch}
            initialValues={initialFolder}
            materialFilenames={materialFilenames}
          />
        ) : (
          <ExamFolderPreview materialFilenames={materialFilenames} requiredFiles={previewFiles} />
        )}
        {reason ? (
          <Alert variant="destructive">
            <AlertDescription>{reason}</AlertDescription>
          </Alert>
        ) : null}
        {apiMessage ? (
          <Alert variant="destructive">
            <AlertDescription>{apiMessage}</AlertDescription>
          </Alert>
        ) : null}
      </div>
    </div>
  );
}
