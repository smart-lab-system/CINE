'use client';

import { useEffect, useRef } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import type { ReplaceRequiredDeliverablesFormValues } from '@/app/teacher/exam-sessions/new/schema';
import { ExamFolderPreview } from './ExamFolderPreview';
import { RequiredDeliverablesEditor } from './RequiredDeliverablesEditor';
import { useSetupDraft } from './SetupDraftProvider';

export function SessionFolderStep({
  materialsEditable: _materialsEditable,
  folderEditable,
  materialFilenames,
  initialFolder,
  previewFiles,
  legacyExtraFilenames = [],
}: {
  /** Giữ prop cũ từ page nếu còn truyền; bước này không upload đề. */
  materialsEditable?: boolean;
  folderEditable: boolean;
  materialFilenames: string[];
  initialFolder: ReplaceRequiredDeliverablesFormValues;
  previewFiles: {
    pattern: string;
    deliverableType: 'document' | 'code_project' | 'image';
    language: string | null;
    entries: string[];
  }[];
  legacyExtraFilenames?: string[];
}) {
  const setup = useSetupDraft();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const reason = setup.errorStep === 'folder' ? setup.blockReason : null;
  const apiMessage = setup.apiError?.step === 'folder' ? setup.apiError.message : null;

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <h2 ref={headingRef} tabIndex={-1} className="text-h1 outline-none">
        Thư mục bài làm
      </h2>
      <div className="flex flex-col gap-3">
        {folderEditable ? (
          <RequiredDeliverablesEditor
            key={setup.epoch}
            initialValues={initialFolder}
            materialFilenames={materialFilenames}
            legacyExtraFilenames={legacyExtraFilenames}
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
