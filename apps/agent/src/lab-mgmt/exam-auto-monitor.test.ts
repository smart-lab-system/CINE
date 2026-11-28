import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  EXAM_AUTO_PERIODIC_MS,
  EXAM_AUTO_POLL_MS,
  ExamAutoMonitor,
  type ExamSessionStatusLike,
} from './exam-auto-monitor';

describe('ExamAutoMonitor', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function createMonitor(opts: {
    status: () => ExamSessionStatusLike;
    hasNodes?: boolean;
    pipelineDelayMs?: number;
  }) {
    const runPipeline = vi.fn(async () => {
      if (opts.pipelineDelayMs) {
        await new Promise((r) => setTimeout(r, opts.pipelineDelayMs));
      }
      return { summary: 'pipeline ok' };
    });
    const downloadVsix = vi.fn(async () => ({ summary: 'vsix ok' }));
    const states: string[] = [];
    const monitor = new ExamAutoMonitor();
    monitor.start('exam-1', {
      fetchStatus: async () => opts.status(),
      hasNodes: () => opts.hasNodes !== false,
      runPipeline,
      downloadVsix,
      setIntervalFn: setInterval,
      clearIntervalFn: clearInterval,
      now: () => new Date('2026-11-28T00:00:00.000Z'),
      onState: (s) => states.push(s.phase),
    });
    return { monitor, runPipeline, downloadVsix, states };
  }

  it('waits when session not yet active', async () => {
    let status: ExamSessionStatusLike = 'scheduled';
    const { monitor, runPipeline } = createMonitor({ status: () => status });
    await vi.advanceTimersByTimeAsync(0);
    expect(monitor.getState().phase).toBe('waiting_active');
    expect(runPipeline).not.toHaveBeenCalled();

    status = 'active';
    await vi.advanceTimersByTimeAsync(EXAM_AUTO_POLL_MS);
    expect(runPipeline).toHaveBeenCalledTimes(1);
    expect(monitor.getState().lastRunKind).toBe('baseline');
    expect(monitor.getState().phase).toBe('periodic');
  });

  it('runs baseline once then periodic every 10 minutes', async () => {
    const { monitor, runPipeline, downloadVsix } = createMonitor({
      status: () => 'active',
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(runPipeline).toHaveBeenCalledTimes(1);
    expect(monitor.getState().lastRunKind).toBe('baseline');

    await vi.advanceTimersByTimeAsync(EXAM_AUTO_PERIODIC_MS);
    expect(runPipeline).toHaveBeenCalledTimes(2);
    expect(monitor.getState().lastRunKind).toBe('periodic');
    expect(downloadVsix).not.toHaveBeenCalled();
  });

  it('finalizes once on collecting and downloads vsix', async () => {
    let status: ExamSessionStatusLike = 'active';
    const { monitor, runPipeline, downloadVsix } = createMonitor({ status: () => status });
    await vi.advanceTimersByTimeAsync(0);
    expect(runPipeline).toHaveBeenCalledTimes(1);

    status = 'collecting';
    await vi.advanceTimersByTimeAsync(EXAM_AUTO_POLL_MS);
    expect(runPipeline).toHaveBeenCalledTimes(2);
    expect(downloadVsix).toHaveBeenCalledTimes(1);
    expect(monitor.getState().phase).toBe('finalized');
    expect(monitor.getState().enabled).toBe(false);
    expect(monitor.getState().lastRunKind).toBe('finalize');

    await vi.advanceTimersByTimeAsync(EXAM_AUTO_PERIODIC_MS + EXAM_AUTO_POLL_MS);
    expect(runPipeline).toHaveBeenCalledTimes(2);
  });

  it('starts on completed with finalize only', async () => {
    const { monitor, runPipeline, downloadVsix } = createMonitor({
      status: () => 'completed',
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(runPipeline).toHaveBeenCalledTimes(1);
    expect(downloadVsix).toHaveBeenCalledTimes(1);
    expect(monitor.getState().phase).toBe('finalized');
    expect(monitor.getState().lastRunKind).toBe('finalize');
  });

  it('waits for nodes before baseline', async () => {
    let hasNodes = false;
    const runPipeline = vi.fn(async () => ({ summary: 'ok' }));
    const monitor = new ExamAutoMonitor();
    monitor.start('exam-1', {
      fetchStatus: async () => 'active',
      hasNodes: () => hasNodes,
      runPipeline,
      downloadVsix: async () => ({ summary: 'vsix' }),
      setIntervalFn: setInterval,
      clearIntervalFn: clearInterval,
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(runPipeline).not.toHaveBeenCalled();
    expect(monitor.getState().lastResultSummary).toMatch(/Chờ máy SV/);

    hasNodes = true;
    await vi.advanceTimersByTimeAsync(EXAM_AUTO_POLL_MS);
    expect(runPipeline).toHaveBeenCalledTimes(1);
  });

  it('skips overlapping pipeline runs', async () => {
    const { monitor, runPipeline } = createMonitor({
      status: () => 'active',
      pipelineDelayMs: EXAM_AUTO_PERIODIC_MS + 1000,
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(runPipeline).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(EXAM_AUTO_PERIODIC_MS);
    expect(monitor.getState().skippedOverlap).toBeGreaterThanOrEqual(1);
  });

  it('defers finalize until in-flight pipeline finishes', async () => {
    let status: ExamSessionStatusLike = 'active';
    const { monitor, runPipeline, downloadVsix } = createMonitor({
      status: () => status,
      pipelineDelayMs: EXAM_AUTO_POLL_MS + 5_000,
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(runPipeline).toHaveBeenCalledTimes(1);
    expect(monitor.getState().phase).toBe('running');

    status = 'collecting';
    await vi.advanceTimersByTimeAsync(EXAM_AUTO_POLL_MS);
    // Finalize bị hoãn vì baseline còn chạy - chưa đánh dấu finalized.
    expect(monitor.getState().phase).not.toBe('finalized');
    expect(monitor.getState().enabled).toBe(true);
    expect(downloadVsix).not.toHaveBeenCalled();
    expect(monitor.getState().skippedOverlap).toBeGreaterThanOrEqual(1);

    // Hoàn tất baseline; finalize được xếp hàng và bắt đầu pipeline riêng.
    await vi.advanceTimersByTimeAsync(5_000);
    expect(runPipeline).toHaveBeenCalledTimes(2);
    expect(downloadVsix).not.toHaveBeenCalled();
    expect(monitor.getState().phase).toBe('running');

    // Hoàn tất pipeline finalize (+ VSIX).
    await vi.advanceTimersByTimeAsync(EXAM_AUTO_POLL_MS + 5_000);
    expect(downloadVsix).toHaveBeenCalledTimes(1);
    expect(monitor.getState().phase).toBe('finalized');
    expect(monitor.getState().enabled).toBe(false);
    expect(monitor.getState().lastRunKind).toBe('finalize');
  });

  it('fetches fresh status on periodic tick instead of stale cache', async () => {
    let status: ExamSessionStatusLike = 'active';
    const fetchStatus = vi.fn(async () => status);
    const runPipeline = vi.fn(async () => ({ summary: 'pipeline ok' }));
    const downloadVsix = vi.fn(async () => ({ summary: 'vsix ok' }));
    const monitor = new ExamAutoMonitor();
    monitor.start('exam-1', {
      fetchStatus,
      hasNodes: () => true,
      runPipeline,
      downloadVsix,
      setIntervalFn: setInterval,
      clearIntervalFn: clearInterval,
      now: () => new Date('2026-11-28T00:00:00.000Z'),
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(runPipeline).toHaveBeenCalledTimes(1);
    const callsAfterBaseline = fetchStatus.mock.calls.length;

    status = 'collecting';
    await vi.advanceTimersByTimeAsync(EXAM_AUTO_PERIODIC_MS);
    expect(fetchStatus.mock.calls.length).toBeGreaterThan(callsAfterBaseline);
    expect(downloadVsix).toHaveBeenCalledTimes(1);
    expect(monitor.getState().lastRunKind).toBe('finalize');
  });
});
