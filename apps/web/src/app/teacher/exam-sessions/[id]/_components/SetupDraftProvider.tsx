'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  clearSetupDraft,
  draftIsDirty,
  isStepDirty,
  readSetupDraft,
  stripClean,
  writeSetupDraft,
  type SetupDraft,
  type SetupServerBaseline,
  type SetupStepId,
} from './setup-draft';

type Snapshot = () => Partial<SetupDraft>;

type SetupDraftContextValue = {
  ready: boolean;
  draft: SetupDraft | null;
  dirty: boolean;
  errorStep: SetupStepId | null;
  blockReason: string | null;
  apiError: { step: SetupStepId; message: string } | null;
  epoch: number;
  patchDraft: (partial: Partial<SetupDraft>) => void;
  registerSnapshot: (fn: Snapshot) => () => void;
  capture: () => SetupDraft | null;
  discard: () => void;
  markError: (step: SetupStepId, reason: string) => void;
  markApiError: (step: SetupStepId, message: string) => void;
  clearError: () => void;
  dropBranches: (branches: Array<'info' | 'folder' | 'rubricChoice'>) => void;
  adoptServer: (next: SetupServerBaseline) => void;
  isStepDirty: (step: SetupStepId) => boolean;
};

const SetupDraftContext = createContext<SetupDraftContextValue | null>(null);

export function useSetupDraft(): SetupDraftContextValue {
  const value = useContext(SetupDraftContext);
  if (!value) throw new Error('useSetupDraft cần ExamSetupDraftProvider');
  return value;
}

export function useSetupDraftOptional(): SetupDraftContextValue | null {
  return useContext(SetupDraftContext);
}

function mergePartial(base: SetupDraft | null, partial: Partial<SetupDraft>, sessionId: string): SetupDraft {
  const next: SetupDraft = {
    sessionId,
    updatedAt: new Date().toISOString(),
    ...base,
    ...partial,
  };
  (Object.keys(partial) as (keyof SetupDraft)[]).forEach((key) => {
    if (partial[key] === undefined) {
      delete next[key];
    }
  });
  next.sessionId = sessionId;
  next.updatedAt = new Date().toISOString();
  return next;
}

export function ExamSetupDraftProvider({
  sessionId,
  mutable,
  server,
  children,
}: {
  sessionId: string;
  mutable: boolean;
  server: SetupServerBaseline;
  children: ReactNode;
}) {
  const [draft, setDraft] = useState<SetupDraft | null>(null);
  const [ready, setReady] = useState(false);
  const [epoch, setEpoch] = useState(0);
  const [errorStep, setErrorStep] = useState<SetupStepId | null>(null);
  const [blockReason, setBlockReason] = useState<string | null>(null);
  const [apiError, setApiError] = useState<{ step: SetupStepId; message: string } | null>(null);
  const draftRef = useRef<SetupDraft | null>(null);
  const errorStepRef = useRef<SetupStepId | null>(null);
  const adoptedRef = useRef<SetupServerBaseline | null>(null);
  const serverRef = useRef(server);
  const snapshotRef = useRef<Snapshot | null>(null);
  if (adoptedRef.current && JSON.stringify(adoptedRef.current) === JSON.stringify(server)) {
    adoptedRef.current = null;
  }
  serverRef.current = adoptedRef.current ?? server;
  draftRef.current = draft;
  errorStepRef.current = errorStep;

  useEffect(() => {
    if (!mutable) {
      clearSetupDraft(sessionId);
      setDraft(null);
      draftRef.current = null;
    } else {
      const stored = stripClean(readSetupDraft(sessionId), serverRef.current);
      setDraft(stored);
      draftRef.current = stored;
    }
    setReady(true);
  }, [sessionId, mutable]);

  useEffect(() => {
    if (!ready || !mutable) return;
    const handle = window.setTimeout(() => {
      if (draftRef.current) writeSetupDraft(draftRef.current);
      else clearSetupDraft(sessionId);
    }, 400);
    return () => window.clearTimeout(handle);
  }, [draft, ready, mutable, sessionId]);

  useEffect(() => {
    const flush = () => writeSetupDraft(draftRef.current);
    window.addEventListener('beforeunload', flush);
    return () => window.removeEventListener('beforeunload', flush);
  }, []);

  const apply = useCallback(
    (partial: Partial<SetupDraft>) => {
      const merged = stripClean(
        mergePartial(draftRef.current, partial, sessionId),
        serverRef.current,
      );
      draftRef.current = merged;
      setDraft(merged);
      return merged;
    },
    [sessionId],
  );

  const capture = useCallback(() => {
    const snap = snapshotRef.current?.() ?? {};
    const merged = apply(snap);
    if (merged) writeSetupDraft(merged);
    else clearSetupDraft(sessionId);
    return merged;
  }, [apply]);

  const patchDraft = useCallback(
    (partial: Partial<SetupDraft>) => {
      apply(partial);
      if (errorStep && (partial.info || partial.folder || partial.rubricChoice)) {
        const touched =
          (errorStep === 'info' && partial.info) ||
          (errorStep === 'materials' && partial.folder) ||
          (errorStep === 'rubric' && partial.rubricChoice);
        if (touched) {
          setErrorStep(null);
          setBlockReason(null);
          setApiError(null);
        }
      }
    },
    [apply, errorStep],
  );

  const registerSnapshot = useCallback((fn: Snapshot) => {
    snapshotRef.current = fn;
    return () => {
      if (snapshotRef.current === fn) snapshotRef.current = null;
    };
  }, []);

  const discard = useCallback(() => {
    clearSetupDraft(sessionId);
    draftRef.current = null;
    setDraft(null);
    setErrorStep(null);
    setBlockReason(null);
    setApiError(null);
    setEpoch((value) => value + 1);
  }, [sessionId]);

  const dropBranches = useCallback(
    (branches: Array<'info' | 'folder' | 'rubricChoice'>) => {
      const partial: Partial<SetupDraft> = {};
      for (const branch of branches) partial[branch] = undefined;
      const merged = apply(partial);
      if (merged) writeSetupDraft(merged);
      else clearSetupDraft(sessionId);
      const current = errorStepRef.current;
      const clears =
        (current === 'info' && branches.includes('info')) ||
        (current === 'materials' && branches.includes('folder')) ||
        (current === 'rubric' && branches.includes('rubricChoice'));
      if (clears) {
        setErrorStep(null);
        setBlockReason(null);
        setApiError(null);
      }
      setEpoch((value) => value + 1);
    },
    [apply, sessionId],
  );

  const adoptServer = useCallback(
    (next: SetupServerBaseline) => {
      adoptedRef.current = next;
      serverRef.current = next;
      const cleaned = stripClean(draftRef.current, next);
      draftRef.current = cleaned;
      setDraft(cleaned);
      if (cleaned) writeSetupDraft(cleaned);
      else clearSetupDraft(sessionId);
    },
    [sessionId],
  );

  const value = useMemo<SetupDraftContextValue>(
    () => ({
      ready,
      draft,
      dirty: draftIsDirty(draft),
      errorStep,
      blockReason,
      apiError,
      epoch,
      patchDraft,
      registerSnapshot,
      capture,
      discard,
      markError: (step, reason) => {
        setErrorStep(step);
        setBlockReason(reason);
        setApiError(null);
      },
      markApiError: (step, message) => {
        setErrorStep(step);
        setApiError({ step, message });
      },
      clearError: () => {
        setErrorStep(null);
        setBlockReason(null);
        setApiError(null);
      },
      dropBranches,
      adoptServer,
      isStepDirty: (step) => isStepDirty(draft, step),
    }),
    [
      ready,
      draft,
      errorStep,
      blockReason,
      apiError,
      epoch,
      patchDraft,
      registerSnapshot,
      capture,
      discard,
      dropBranches,
      adoptServer,
    ],
  );

  return <SetupDraftContext.Provider value={value}>{children}</SetupDraftContext.Provider>;
}
