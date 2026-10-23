'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeft, XCircle } from 'lucide-react';
import {
  useCancelExamSession,
  useExamMaterials,
  useExamSessionDetail,
  useOpenSession,
  useReplaceRequiredDeliverables,
  useUpdateExamSessionSchedule,
} from '@/hooks/useExamSession';
import { useSetSessionRubric } from '@/hooks/useGrading';
import { useRooms } from '@/hooks/useMasterData';
import { useTeachingClasses } from '@/hooks/useTeaching';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { RubricRow } from '@/app/teacher/grading/_components/RubricRow';
import { ExamSetupDraftProvider, useSetupDraft } from './_components/SetupDraftProvider';
import { SetupFooter } from './_components/SetupFooter';
import { SetupStepper } from './_components/SetupStepper';
import { SessionInfoStep } from './_components/SessionInfoStep';
import { SessionMaterialsStep } from './_components/SessionMaterialsStep';
import { SessionReviewStep } from './_components/SessionReviewStep';
import { SessionExamRosterCard } from './_components/SessionExamRosterCard';
import { toDeliverableFormValues } from './_components/RequiredDeliverablesEditor';
import { reviewChecklist, saveDraftPlan, type SaveDraftPlan } from './_components/setup-commit';
import { finishPlan } from './_components/setup-commit';
import { parseStep, stepIndex, SETUP_STEPS } from './_components/setup-steps';
import { toLocalInputValue, type SetupServerBaseline, type SetupStepId } from './_components/setup-draft';
import { formatSectionAndNominalClass } from './_components/section-class-label';

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Hub Thiết lập phiên — stepper năm bước (spec 2026-10-22).
 * Không thay màn vận hành live tại `/exam-sessions/[id]`.
 */
export default function ExamSessionSetupPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const detail = useExamSessionDetail(id);
  const session = detail.data;

  if (detail.isLoading) {
    return (
      <div className="flex w-full flex-col gap-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (detail.isError || !session) {
    return (
      <div className="flex w-full flex-col gap-4">
        <Alert variant="destructive">
          <AlertDescription>
            {detail.error instanceof Error ? detail.error.message : 'Không tải được phiên thi.'}
          </AlertDescription>
        </Alert>
        <Button asChild variant="outline">
          <Link href="/teacher/exam-sessions">Quay lại danh sách</Link>
        </Button>
      </div>
    );
  }

  return <SetupHub sessionId={session.id} />;
}

function SetupHub({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const detail = useExamSessionDetail(sessionId);
  const materials = useExamMaterials(sessionId);
  const classes = useTeachingClasses();
  const catalogRooms = useRooms({ page: 1, pageSize: 100, status: 'active' });
  const updateSchedule = useUpdateExamSessionSchedule();
  const replaceDeliverables = useReplaceRequiredDeliverables(sessionId);
  const setRubric = useSetSessionRubric(sessionId);
  const openSession = useOpenSession(sessionId);
  const cancelSession = useCancelExamSession();

  const session = detail.data;
  const mutable = session?.status === 'scheduled' || session?.status === 'not_ready';
  const step = parseStep(searchParams.get('step'));

  const server = useMemo<SetupServerBaseline | null>(() => {
    if (!session) return null;
    return {
      info: {
        examType: session.examType,
        roomId: session.roomId ?? '',
        startLocal: toLocalInputValue(session.startTime),
        endLocal: toLocalInputValue(session.endTime),
      },
      folder: toDeliverableFormValues(session.requiredDeliverables),
      rubricId: session.rubricId,
    };
  }, [session]);

  useEffect(() => {
    const raw = searchParams.get('step');
    if (raw && raw !== step) {
      const params = new URLSearchParams(searchParams.toString());
      params.set('step', step);
      router.replace(`/teacher/exam-sessions/${sessionId}?${params.toString()}`);
    }
  }, [router, searchParams, sessionId, step]);

  if (!session || !server) return null;

  const teachingClass = classes.data?.find((item) => item.id === session.classId);

  return (
    <ExamSetupDraftProvider sessionId={session.id} mutable={mutable} server={server}>
      <SetupBody
        sessionId={sessionId}
        step={step}
        materialsCount={materials.data?.length ?? null}
        materialFilenames={(materials.data ?? []).map((item) => item.fileName)}
        className={formatSectionAndNominalClass(
          teachingClass?.name,
          teachingClass?.nominalClassName,
        )}
        studentCount={teachingClass?.studentCount ?? null}
        roomsLoading={catalogRooms.isLoading}
        roomOptions={(catalogRooms.data?.items ?? []).map((room) => ({
          value: room.id,
          label: room.code ? `${room.name} (${room.code})` : room.name,
          keywords: [room.code, room.building, room.floor].filter(Boolean).join(' '),
        }))}
        pending={
          updateSchedule.isPending ||
          replaceDeliverables.isPending ||
          setRubric.isPending ||
          openSession.isPending
        }
        onSaveInfo={(body) => updateSchedule.mutateAsync({ id: session.id, body })}
        onSaveFolder={(body) => replaceDeliverables.mutateAsync(body)}
        onSaveRubric={(rubricId) => setRubric.mutateAsync(rubricId)}
        onOpen={() =>
          openSession.mutate(undefined, {
            onSuccess: () => toast.success('Đã mở phiên thi'),
            onError: (error) =>
              toast.error(error instanceof Error ? error.message : 'Mở phiên thất bại'),
          })
        }
        openPending={openSession.isPending}
        onCancel={() => {
          if (!confirm(`Huỷ phiên "${session.name}"?`)) return;
          cancelSession.mutate(session.id, {
            onSuccess: () => toast.success('Đã huỷ phiên'),
            onError: (error) =>
              toast.error(error instanceof Error ? error.message : 'Huỷ thất bại'),
          });
        }}
        cancelPending={cancelSession.isPending}
        onCopyCode={() => {
          void navigator.clipboard.writeText(session.code).then(
            () => toast.success(`Đã sao chép mã "${session.code}"`),
            () => toast.error('Không sao chép được — hãy đọc mã trực tiếp.'),
          );
        }}
      />
    </ExamSetupDraftProvider>
  );
}

function SetupBody({
  sessionId,
  step,
  materialsCount,
  materialFilenames,
  className,
  studentCount,
  roomsLoading,
  roomOptions,
  pending,
  onSaveInfo,
  onSaveFolder,
  onSaveRubric,
  onOpen,
  openPending,
  onCancel,
  cancelPending,
  onCopyCode,
}: {
  sessionId: string;
  step: SetupStepId;
  materialsCount: number | null;
  materialFilenames: string[];
  className: string | null;
  studentCount: number | null;
  roomsLoading: boolean;
  roomOptions: { value: string; label: string; keywords?: string }[];
  pending: boolean;
  onSaveInfo: (body: {
    examType: 'TK' | 'GK' | 'CK';
    roomId: string;
    startTime: string;
    endTime: string;
  }) => Promise<unknown>;
  onSaveFolder: (body: {
    requiredFilenames: {
      filename: string;
      deliverableType?: 'document' | 'code_project' | 'image';
      language?: 'python' | 'cpp' | 'java' | 'node';
      entries?: string[];
    }[];
  }) => Promise<unknown>;
  onSaveRubric: (rubricId: string) => Promise<unknown>;
  onOpen: () => void;
  openPending: boolean;
  onCancel: () => void;
  cancelPending: boolean;
  onCopyCode: () => void;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const detail = useExamSessionDetail(sessionId);
  const setup = useSetupDraft();
  const session = detail.data!;
  const mutable = session.status === 'scheduled' || session.status === 'not_ready';
  const canCancel = mutable || session.status === 'missed';
  const [pendingLeave, setPendingLeave] = useState<SetupStepId | null>(null);

  const server = useMemo<SetupServerBaseline>(
    () => ({
      info: {
        examType: session.examType,
        roomId: session.roomId ?? '',
        startLocal: toLocalInputValue(session.startTime),
        endLocal: toLocalInputValue(session.endTime),
      },
      folder: toDeliverableFormValues(session.requiredDeliverables),
      rubricId: session.rubricId,
    }),
    [session],
  );

  const counts = {
    status: session.status,
    studentCount,
    materialCount: materialsCount,
  };

  function goTo(next: SetupStepId) {
    setup.capture();
    const params = new URLSearchParams(searchParams.toString());
    params.set('step', next);
    router.replace(`/teacher/exam-sessions/${sessionId}?${params.toString()}`);
  }

  function requestLeave(next: SetupStepId) {
    if (next === step) return;
    if (mutable && setup.isStepDirty(step)) {
      setPendingLeave(next);
      return;
    }
    goTo(next);
  }

  async function runPlan(plan: SaveDraftPlan, mode: 'draft' | 'finish'): Promise<boolean> {
    const saved: Array<'info' | 'folder' | 'rubricChoice'> = [];
    let failure: { step: SetupStepId; message: string } | null = null;
    for (const action of plan.actions) {
      try {
        if (action.kind === 'info') {
          await onSaveInfo(action.body);
          saved.push('info');
        } else if (action.kind === 'folder') {
          await onSaveFolder(action.body);
          saved.push('folder');
        } else {
          await onSaveRubric(action.rubricId);
          saved.push('rubricChoice');
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Không lưu được';
        const failedStep: SetupStepId =
          action.kind === 'info' ? 'info' : action.kind === 'folder' ? 'materials' : 'rubric';
        failure = { step: failedStep, message };
        if (mode === 'finish') break;
      }
    }
    if (saved.length > 0) setup.dropBranches(saved);
    if (plan.kept?.info) toast('Thông tin chung vẫn nằm trong bản nháp trên máy này.');
    if (plan.kept?.folder) toast('Thư mục bài thi vẫn nằm trong bản nháp trên máy này.');
    if (failure) {
      setup.markApiError(failure.step, failure.message);
      toast.error(failure.message);
      if (mode === 'finish') goTo(failure.step);
      return false;
    }
    if (mode === 'finish') {
      if (!plan.kept) {
        setup.discard();
        toast.success('Đã lưu thiết lập.');
      }
      return true;
    }
    if (saved.length > 0) toast.success('Đã lưu thiết lập.');
    return true;
  }

  async function confirmLeave() {
    const next = pendingLeave;
    if (!next) return;
    const captured = setup.capture();
    const plan = saveDraftPlan(captured, server);
    const ok = await runPlan(plan, 'draft');
    if (!ok) {
      setPendingLeave(null);
      return;
    }
    const adopted: SetupServerBaseline = {
      ...server,
      info: { ...server.info },
    };
    for (const action of plan.actions) {
      if (action.kind === 'info' && captured?.info) adopted.info = captured.info;
      if (action.kind === 'folder' && captured?.folder) adopted.folder = captured.folder;
      if (action.kind === 'rubric') adopted.rubricId = action.rubricId;
    }
    setup.adoptServer(adopted);
    setPendingLeave(null);
    goTo(next);
  }

  function keepDraftAndLeave() {
    const next = pendingLeave;
    setPendingLeave(null);
    if (next) goTo(next);
  }

  function onFinish() {
    const captured = setup.capture();
    const result = finishPlan(captured, server, counts);
    if (!result.ok) {
      setup.markError(result.step, result.blockReason);
      goTo(result.step);
      return;
    }
    void runPlan(result.plan, 'finish');
  }

  const checklist = mutable ? reviewChecklist(setup.draft, server, counts) : null;
  const index = stepIndex(step);

  return (
    <div className="flex w-full flex-col gap-6">
      <PageHeader
        title="Thiết lập phiên thi"
        actions={
          <Button asChild variant="ghost" size="sm">
            <Link href="/teacher/exam-sessions">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Danh sách
            </Link>
          </Button>
        }
      />
      <div className="flex w-full flex-col gap-6 [&_.text-caption]:text-body [&_.text-h3]:text-h2 [&_.text-small]:text-base [&_button.min-h-10]:min-h-12 [&_input]:h-12 [&_select]:h-12">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="min-w-0 text-display text-foreground">{session.name}</p>
        {canCancel ? (
          <Button type="button" variant="outline" disabled={cancelPending} onClick={onCancel}>
            <XCircle className="h-4 w-4 text-danger-strong" aria-hidden="true" />
            Huỷ phiên
          </Button>
        ) : null}
      </div>
      <SetupStepper
        step={step}
        onStepChange={requestLeave}
        isDirty={setup.isStepDirty}
        errorStep={setup.errorStep}
      />
      <p className="text-body text-muted-foreground">
        Bước {index + 1} / {SETUP_STEPS.length}
      </p>
      {step === 'info' && (
        <SessionInfoStep
          session={session}
          className={className}
          roomOptions={roomOptions}
          roomsLoading={roomsLoading}
          mutable={mutable}
          serverInfo={server.info}
          onCopyCode={onCopyCode}
        />
      )}
      {step === 'roster' && (
        <div className="flex flex-col gap-4">
          <h2 tabIndex={-1} autoFocus className="text-h1 outline-none">
            Danh sách thi
          </h2>
          <SessionExamRosterCard sessionId={session.id} canEdit={mutable} embedded />
        </div>
      )}
      {step === 'materials' && (
        <SessionMaterialsStep
          sessionId={session.id}
          releaseAt={formatDateTime(session.startTime)}
          materialsEditable={mutable || session.status === 'active'}
          folderEditable={mutable}
          materialFilenames={materialFilenames}
          initialFolder={setup.draft?.folder ?? server.folder}
          previewFiles={session.requiredDeliverables.map((item) => ({
            pattern: item.requiredFilename,
            deliverableType: item.deliverableType,
            language: item.language,
            entries: item.entries,
          }))}
        />
      )}
      {step === 'rubric' && (
        <div className="flex flex-col gap-4">
          <h2 tabIndex={-1} autoFocus className="text-h1 outline-none">
            Rubric
          </h2>
          <RubricRow
            sessionId={session.id}
            rubricId={session.rubricId}
            readOnly={
              session.status !== 'scheduled' &&
              session.status !== 'not_ready' &&
              session.status !== 'active'
            }
            persist={mutable ? 'draft' : 'immediate'}
            heading={false}
            choice={setup.draft?.rubricChoice ?? ''}
            onChoiceChange={(choice) => setup.patchDraft({ rubricChoice: choice || undefined })}
          />
          {setup.apiError?.step === 'rubric' ? (
            <Alert variant="destructive">
              <AlertDescription>{setup.apiError.message}</AlertDescription>
            </Alert>
          ) : null}
        </div>
      )}
      {step === 'review' && (
        <SessionReviewStep
          sessionId={session.id}
          session={session}
          className={className}
          roomLabel={
            roomOptions.find((room) => room.value === (setup.draft?.info ?? server.info).roomId)
              ?.label ||
            session.roomName ||
            '—'
          }
          info={setup.draft?.info ?? server.info}
          materialFilenames={materialFilenames}
          folder={setup.draft?.folder ?? server.folder}
          rubricId={setup.draft?.rubricChoice || session.rubricId}
          mutable={mutable}
          checklist={checklist}
          openPending={openPending}
          onOpen={onOpen}
        />
      )}
      <SetupFooter
        step={step}
        mutable={mutable}
        pending={pending}
        onBack={() => requestLeave(SETUP_STEPS[index - 1]!.id)}
        onNext={() => requestLeave(SETUP_STEPS[index + 1]!.id)}
        onFinish={onFinish}
      />
      </div>
      <Dialog open={pendingLeave !== null} onOpenChange={(open) => { if (!open) setPendingLeave(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Xác nhận thiết lập?</DialogTitle>
            <DialogDescription>
              Bước này đang có thay đổi. Thiết lập sẽ ghi những phần đã đủ lên phiên. Chưa thiết lập thì bản nháp vẫn giữ trên máy này.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={pending} onClick={keepDraftAndLeave}>
              Chưa thiết lập
            </Button>
            <Button type="button" disabled={pending} onClick={() => void confirmLeave()}>
              Thiết lập
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
