/**
 * Opt-in auto monitor trên Teacher Hub: baseline / periodic / finalize.
 * Spec 2026-11-28-hub-exam-extension-auto-monitor.
 */

export const EXAM_AUTO_POLL_MS = 60_000;
export const EXAM_AUTO_PERIODIC_MS = 10 * 60_000;

export type ExamAutoMonitorPhase =
  | 'idle'
  | 'waiting_active'
  | 'running'
  | 'baseline_done'
  | 'periodic'
  | 'finalized';

export type ExamSessionStatusLike =
  | 'scheduled'
  | 'not_ready'
  | 'active'
  | 'collecting'
  | 'completed'
  | 'cancelled'
  | 'missed'
  | string;

export interface ExamAutoMonitorState {
  enabled: boolean;
  phase: ExamAutoMonitorPhase;
  examSessionId: string | null;
  lastSessionStatus: string | null;
  lastRunAt: string | null;
  lastRunKind: 'baseline' | 'periodic' | 'finalize' | null;
  lastError: string | null;
  lastResultSummary: string | null;
  skippedOverlap: number;
}

export interface ExamAutoMonitorDeps {
  fetchStatus: () => Promise<ExamSessionStatusLike>;
  /** true nếu phòng có ≥1 máy SV. */
  hasNodes: () => boolean;
  runPipeline: () => Promise<{ summary: string }>;
  downloadVsix: () => Promise<{ summary: string }>;
  setIntervalFn?: typeof setInterval;
  clearIntervalFn?: typeof clearInterval;
  now?: () => Date;
  onState?: (state: ExamAutoMonitorState) => void;
}

function isOver(status: ExamSessionStatusLike): boolean {
  return status === 'collecting' || status === 'completed';
}

function initialState(): ExamAutoMonitorState {
  return {
    enabled: false,
    phase: 'idle',
    examSessionId: null,
    lastSessionStatus: null,
    lastRunAt: null,
    lastRunKind: null,
    lastError: null,
    lastResultSummary: null,
    skippedOverlap: 0,
  };
}

export class ExamAutoMonitor {
  private state: ExamAutoMonitorState = initialState();
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private periodicTimer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private baselineDone = false;
  private finalized = false;
  private deps: ExamAutoMonitorDeps | null = null;
  private examSessionId: string | null = null;
  private setInterval: typeof setInterval = setInterval;
  private clearInterval: typeof clearInterval = clearInterval;
  private now: () => Date = () => new Date();

  getState(): ExamAutoMonitorState {
    return { ...this.state };
  }

  private emit(): void {
    this.deps?.onState?.(this.getState());
  }

  private patch(partial: Partial<ExamAutoMonitorState>): void {
    this.state = { ...this.state, ...partial };
    this.emit();
  }

  start(examSessionId: string, deps: ExamAutoMonitorDeps): void {
    this.stopTimersOnly();
    this.deps = deps;
    this.examSessionId = examSessionId;
    this.setInterval = deps.setIntervalFn ?? setInterval;
    this.clearInterval = deps.clearIntervalFn ?? clearInterval;
    this.now = deps.now ?? (() => new Date());
    this.baselineDone = false;
    this.finalized = false;
    this.running = false;
    this.patch({
      enabled: true,
      phase: 'waiting_active',
      examSessionId,
      lastError: null,
      lastResultSummary: null,
      lastRunKind: null,
      lastRunAt: null,
      lastSessionStatus: null,
      skippedOverlap: 0,
    });
    void this.tickStatus();
    this.pollTimer = this.setInterval(() => {
      void this.tickStatus();
    }, EXAM_AUTO_POLL_MS);
  }

  stop(): void {
    this.stopTimersOnly();
    this.deps = null;
    this.examSessionId = null;
    this.baselineDone = false;
    this.finalized = false;
    this.running = false;
    this.state = initialState();
  }

  private stopTimersOnly(): void {
    if (this.pollTimer !== null) {
      this.clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.periodicTimer !== null) {
      this.clearInterval(this.periodicTimer);
      this.periodicTimer = null;
    }
  }

  /** Public cho test - một vòng poll status. */
  async tickStatus(): Promise<void> {
    if (!this.deps || !this.state.enabled || !this.examSessionId || this.finalized) return;
    let status: ExamSessionStatusLike;
    try {
      status = await this.deps.fetchStatus();
    } catch (err) {
      this.patch({
        lastError: `Không đọc được trạng thái phiên: ${err instanceof Error ? err.message : String(err)}`,
      });
      return;
    }
    this.patch({ lastSessionStatus: String(status), lastError: null });

    if (isOver(status)) {
      await this.runFinalize();
      return;
    }

    if (status !== 'active') {
      this.patch({ phase: 'waiting_active' });
      return;
    }

    if (!this.baselineDone) {
      if (!this.deps.hasNodes()) {
        this.patch({ phase: 'waiting_active', lastResultSummary: 'Chờ máy SV nối Hub…' });
        return;
      }
      await this.runKind('baseline');
      if (this.finalized) return;
      this.baselineDone = true;
      this.ensurePeriodicTimer();
      this.patch({ phase: 'periodic' });
      return;
    }

    this.ensurePeriodicTimer();
    if (this.state.phase !== 'running') {
      this.patch({ phase: 'periodic' });
    }
  }

  private ensurePeriodicTimer(): void {
    if (this.periodicTimer !== null) return;
    this.periodicTimer = this.setInterval(() => {
      void this.onPeriodicTick();
    }, EXAM_AUTO_PERIODIC_MS);
  }

  private async onPeriodicTick(): Promise<void> {
    if (!this.state.enabled || this.finalized) return;
    if (this.state.lastSessionStatus && isOver(this.state.lastSessionStatus)) {
      await this.runFinalize();
      return;
    }
    if (this.state.lastSessionStatus !== 'active') return;
    await this.runKind('periodic');
  }

  private async runFinalize(): Promise<void> {
    if (this.finalized) return;
    await this.runKind('finalize');
    this.finalized = true;
    this.stopTimersOnly();
    this.patch({
      enabled: false,
      phase: 'finalized',
    });
  }

  private async runKind(kind: 'baseline' | 'periodic' | 'finalize'): Promise<void> {
    if (!this.deps) return;
    if (this.running) {
      this.patch({ skippedOverlap: this.state.skippedOverlap + 1 });
      return;
    }
    this.running = true;
    this.patch({ phase: 'running', lastError: null });
    try {
      const pipe = await this.deps.runPipeline();
      let summary = pipe.summary;
      if (kind === 'finalize') {
        const vsix = await this.deps.downloadVsix();
        summary = `${pipe.summary} · ${vsix.summary}`;
      }
      const nextPhase: ExamAutoMonitorPhase =
        kind === 'finalize' ? 'finalized' : kind === 'baseline' ? 'baseline_done' : 'periodic';
      this.patch({
        lastRunAt: this.now().toISOString(),
        lastRunKind: kind,
        lastResultSummary: summary,
        lastError: null,
        phase: nextPhase,
      });
    } catch (err) {
      this.patch({
        lastError: err instanceof Error ? err.message : String(err),
        lastRunAt: this.now().toISOString(),
        lastRunKind: kind,
        phase: kind === 'finalize' ? 'finalized' : kind === 'baseline' ? 'waiting_active' : 'periodic',
      });
    } finally {
      this.running = false;
    }
  }
}
