import type { ReplaceRequiredDeliverablesFormValues } from '@/app/teacher/exam-sessions/new/schema';

export type SetupStepId = 'info' | 'roster' | 'materials' | 'rubric' | 'review';

export type SetupInfoDraft = {
  examType: string;
  roomId: string;
  startLocal: string;
  endLocal: string;
};

export type SetupDraft = {
  sessionId: string;
  updatedAt: string;
  info?: SetupInfoDraft;
  folder?: ReplaceRequiredDeliverablesFormValues;
  rubricChoice?: string;
  rosterDialog?: { mode: 'add'; fields: Record<string, string> };
  rosterImportPending?: boolean;
  materialsFilePending?: boolean;
};

export type SetupServerBaseline = {
  info: SetupInfoDraft;
  folder: ReplaceRequiredDeliverablesFormValues;
  rubricId: string | null;
};

const storageKey = (sessionId: string) => `exam-setup-draft:${sessionId}`;

export function toLocalInputValue(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function readSetupDraft(sessionId: string): SetupDraft | null {
  try {
    const raw = sessionStorage.getItem(storageKey(sessionId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SetupDraft;
    if (!parsed || parsed.sessionId !== sessionId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeSetupDraft(draft: SetupDraft | null): void {
  if (!draft) return;
  try {
    const payload = stripEmpty(draft);
    if (!payload) sessionStorage.removeItem(storageKey(draft.sessionId));
    else sessionStorage.setItem(storageKey(draft.sessionId), JSON.stringify(payload));
  } catch {
    /* tab ẩn danh — nháp chỉ sống trong bộ nhớ trang */
  }
}

export function clearSetupDraft(sessionId: string): void {
  try {
    sessionStorage.removeItem(storageKey(sessionId));
  } catch {
    /* cùng lý do write */
  }
}

function infoEqual(a: SetupInfoDraft, b: SetupInfoDraft): boolean {
  return (
    a.examType === b.examType &&
    a.roomId === b.roomId &&
    a.startLocal === b.startLocal &&
    a.endLocal === b.endLocal
  );
}

function canonicalFolder(folder: ReplaceRequiredDeliverablesFormValues | undefined): string {
  const files = (folder?.requiredFilenames ?? []).map((file) => {
    const language = (file.language ?? '').trim();
    const entries = (file.entries ?? [])
      .map((entry) => (entry?.value ?? '').trim())
      .filter((value) => value.length > 0);
    return {
      value: (file.value ?? '').trim(),
      deliverableType: file.deliverableType || 'document',
      language: language.length > 0 ? language : null,
      entries,
    };
  });
  return JSON.stringify(files);
}

/** So nội dung file nộp. Bỏ `id` của react-hook-form và mảng entries rỗng. */
export function foldersMatch(
  a: ReplaceRequiredDeliverablesFormValues | undefined,
  b: ReplaceRequiredDeliverablesFormValues | undefined,
): boolean {
  return canonicalFolder(a) === canonicalFolder(b);
}

function folderEqual(
  a: ReplaceRequiredDeliverablesFormValues,
  b: ReplaceRequiredDeliverablesFormValues,
): boolean {
  return foldersMatch(a, b);
}

function dialogHasText(dialog: SetupDraft['rosterDialog']): boolean {
  if (!dialog) return false;
  return Object.values(dialog.fields).some((value) => value.trim() !== '');
}

/** Bỏ nhánh giống server hoặc rỗng. `null` khi không còn gì để nhớ. */
export function stripClean(
  draft: SetupDraft | null,
  server: SetupServerBaseline,
): SetupDraft | null {
  if (!draft) return null;
  const next: SetupDraft = {
    sessionId: draft.sessionId,
    updatedAt: draft.updatedAt,
  };
  if (draft.info && !infoEqual(draft.info, server.info)) next.info = draft.info;
  if (draft.folder && !folderEqual(draft.folder, server.folder)) next.folder = draft.folder;
  if (draft.rubricChoice && draft.rubricChoice !== server.rubricId) {
    next.rubricChoice = draft.rubricChoice;
  }
  if (dialogHasText(draft.rosterDialog) && draft.rosterDialog) {
    next.rosterDialog = draft.rosterDialog;
  }
  if (draft.rosterImportPending) next.rosterImportPending = true;
  if (draft.materialsFilePending) next.materialsFilePending = true;
  return stripEmpty(next);
}

function stripEmpty(draft: SetupDraft): SetupDraft | null {
  const has =
    draft.info !== undefined ||
    draft.folder !== undefined ||
    draft.rubricChoice !== undefined ||
    draft.rosterDialog !== undefined ||
    draft.rosterImportPending === true ||
    draft.materialsFilePending === true;
  return has ? draft : null;
}

export function isStepDirty(draft: SetupDraft | null, step: SetupStepId): boolean {
  if (!draft) return false;
  if (step === 'info') return draft.info !== undefined;
  if (step === 'roster') return draft.rosterDialog !== undefined || draft.rosterImportPending === true;
  if (step === 'materials') return draft.folder !== undefined || draft.materialsFilePending === true;
  if (step === 'rubric') return draft.rubricChoice !== undefined;
  return false;
}

export function draftIsDirty(draft: SetupDraft | null): boolean {
  return stripEmpty(draft ?? { sessionId: '', updatedAt: '' }) !== null && draft !== null;
}
