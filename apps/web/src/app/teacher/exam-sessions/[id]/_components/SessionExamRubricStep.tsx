'use client';

import { useEffect, useRef } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ExamMaterialsCard } from '@/app/(exam-live)/exam-sessions/[id]/_components/ExamMaterialsCard';
import { RubricRow } from '@/app/teacher/grading/_components/RubricRow';
import { useGradingReadiness, useSetSessionRubric } from '@/hooks/useGrading';
import { ModelAnswerPackageField } from './ModelAnswerPackageField';
import { SetupExamPicker } from './SetupExamPicker';
import { SetupRubricPicker } from './SetupRubricPicker';
import { useSetupDraft } from './SetupDraftProvider';

export function SessionExamRubricStep({
  sessionId,
  courseId,
  releaseAt,
  materialsEditable,
  rubricId,
  rubricReadOnly,
  rubricPersist,
}: {
  sessionId: string;
  courseId: string | null;
  releaseAt: string;
  materialsEditable: boolean;
  rubricId: string | null;
  rubricReadOnly: boolean;
  rubricPersist: 'draft' | 'immediate';
}) {
  const setup = useSetupDraft();
  const readiness = useGradingReadiness(sessionId);
  const pinRubric = useSetSessionRubric(sessionId);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const apiMessage = setup.apiError?.step === 'exam' ? setup.apiError.message : null;
  const displayedRubricId =
    rubricPersist === 'draft'
      ? setup.draft?.rubricChoice || rubricId
      : rubricId;

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <div className="flex flex-col gap-8">
      <h2 ref={headingRef} tabIndex={-1} className="text-h1 outline-none">
        Đề thi & Rubric
      </h2>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-h3">Đề thi</h3>
          {materialsEditable ? (
            <SetupExamPicker
              sessionId={sessionId}
              courseId={courseId}
              disabled={!materialsEditable}
            />
          ) : null}
        </div>
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
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-h3">Rubric</h3>
          {!rubricReadOnly ? (
            <SetupRubricPicker
              courseId={courseId}
              disabled={rubricReadOnly}
              persist={rubricPersist}
              currentRubricId={displayedRubricId}
              onConfirmDraft={(id) => setup.patchDraft({ rubricChoice: id })}
              onConfirmImmediate={(id) => pinRubric.mutateAsync(id)}
            />
          ) : null}
        </div>
        <RubricRow
          sessionId={sessionId}
          rubricId={rubricId}
          readOnly={rubricReadOnly}
          persist={rubricPersist}
          heading={false}
          hidePicker
          choice={setup.draft?.rubricChoice ?? ''}
          onChoiceChange={(choice) => setup.patchDraft({ rubricChoice: choice || undefined })}
        />
        {apiMessage ? (
          <Alert variant="destructive">
            <AlertDescription>{apiMessage}</AlertDescription>
          </Alert>
        ) : null}
      </section>

      <section className="flex flex-col gap-3">
        <ModelAnswerPackageField
          sessionId={sessionId}
          readiness={readiness.data}
          readOnly={!materialsEditable}
          onPendingChange={(pending) =>
            setup.patchDraft({ modelAnswerPending: pending || undefined })
          }
        />
      </section>
    </div>
  );
}
