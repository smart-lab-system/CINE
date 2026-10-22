import {
  replaceRequiredDeliverablesSchema,
  type ReplaceRequiredDeliverablesFormValues,
} from '@/app/teacher/exam-sessions/new/schema';
import type { ExamType, ReplaceRequiredDeliverablesInput } from '@/lib/api/exam-session';
import { evaluateSetupChecklist } from './SetupChecklist';
import {
  type SetupDraft,
  type SetupInfoDraft,
  type SetupServerBaseline,
  type SetupStepId,
} from './setup-draft';

const EXAM_TYPES: readonly ExamType[] = ['TK', 'GK', 'CK'];

export type SaveAction =
  | {
      kind: 'info';
      body: { examType: ExamType; roomId: string; startTime: string; endTime: string };
    }
  | { kind: 'folder'; body: ReplaceRequiredDeliverablesInput }
  | { kind: 'rubric'; rubricId: string };

export type SaveDraftPlan = {
  actions: SaveAction[];
  kept: SetupDraft | null;
};

export type FinishPlan =
  | { ok: false; step: Extract<SetupStepId, 'info' | 'materials'>; blockReason: string }
  | { ok: true; plan: SaveDraftPlan };

export function infoReady(info: SetupInfoDraft | undefined): info is SetupInfoDraft {
  if (!info) return false;
  if (!EXAM_TYPES.includes(info.examType as ExamType)) return false;
  if (!info.roomId || !info.startLocal || !info.endLocal) return false;
  const start = new Date(info.startLocal).getTime();
  const end = new Date(info.endLocal).getTime();
  return Number.isFinite(start) && Number.isFinite(end) && end > start;
}

function countNamedFiles(folder: ReplaceRequiredDeliverablesFormValues | undefined): number {
  if (!folder) return 0;
  return folder.requiredFilenames.filter((file) => file.value.trim() !== '').length;
}

export function folderToReplaceBody(
  values: ReplaceRequiredDeliverablesFormValues,
): ReplaceRequiredDeliverablesInput {
  return {
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
  };
}

function keptDraft(sessionId: string, parts: Partial<SetupDraft>): SetupDraft | null {
  const draft: SetupDraft = { sessionId, updatedAt: new Date().toISOString(), ...parts };
  const has =
    draft.info !== undefined ||
    draft.folder !== undefined ||
    draft.rubricChoice !== undefined;
  return has ? draft : null;
}

/** Không chặn việc rời bước. Phần chưa đủ điều kiện API nằm trong `kept`. */
export function saveDraftPlan(
  draft: SetupDraft | null,
  server: SetupServerBaseline,
): SaveDraftPlan {
  if (!draft) return { actions: [], kept: null };
  const actions: SaveAction[] = [];
  const keep: Partial<SetupDraft> = {};

  if (draft.info) {
    if (infoReady(draft.info)) {
      actions.push({
        kind: 'info',
        body: {
          examType: draft.info.examType as ExamType,
          roomId: draft.info.roomId,
          startTime: new Date(draft.info.startLocal).toISOString(),
          endTime: new Date(draft.info.endLocal).toISOString(),
        },
      });
    } else {
      keep.info = draft.info;
    }
  }

  if (draft.folder) {
    const parsed = replaceRequiredDeliverablesSchema.safeParse(draft.folder);
    if (parsed.success) {
      actions.push({ kind: 'folder', body: folderToReplaceBody(parsed.data) });
    } else {
      keep.folder = draft.folder;
    }
  }

  if (draft.rubricChoice && draft.rubricChoice !== server.rubricId) {
    actions.push({ kind: 'rubric', rubricId: draft.rubricChoice });
  }

  return { actions, kept: keptDraft(draft.sessionId, keep) };
}

function mergedChecklist(
  draft: SetupDraft | null,
  server: SetupServerBaseline,
  counts: { status: string; studentCount: number | null; materialCount: number | null },
) {
  const info = draft?.info ?? server.info;
  const folder = draft?.folder ?? server.folder;
  const start = new Date(info.startLocal);
  const end = new Date(info.endLocal);
  return evaluateSetupChecklist({
    status: counts.status,
    startTime: Number.isNaN(start.getTime()) ? '' : start.toISOString(),
    endTime: Number.isNaN(end.getTime()) ? '' : end.toISOString(),
    studentCount: counts.studentCount,
    materialCount: counts.materialCount,
    hasRubric: Boolean(draft?.rubricChoice || server.rubricId),
    deliverableCount: countNamedFiles(folder),
  });
}

export function finishPlan(
  draft: SetupDraft | null,
  server: SetupServerBaseline,
  counts: { status: string; studentCount: number | null; materialCount: number | null },
): FinishPlan {
  const checklist = mergedChecklist(draft, server, counts);

  if (checklist.blockReason) {
    const step = checklist.blockReason.includes('thư mục') ? 'materials' : 'info';
    return { ok: false, step, blockReason: checklist.blockReason };
  }

  return { ok: true, plan: saveDraftPlan(draft, server) };
}

export function reviewChecklist(
  draft: SetupDraft | null,
  server: SetupServerBaseline,
  counts: { status: string; studentCount: number | null; materialCount: number | null },
) {
  return mergedChecklist(draft, server, counts);
}
