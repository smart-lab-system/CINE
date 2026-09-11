import { ExamSessionScheduler } from './exam-session.scheduler';
import { ExamSessionService } from './exam-session.service';
import { CollectionPhaseService } from './collection-phase.service';

/**
 * Drives the sweep directly at a chosen `now` — no timers, no @Interval,
 * no waiting 30 seconds inside a test.
 */
type SchedulerDeps = 'findFinalizableIds' | 'finalizeExamSession';

function createHarness(overrides: Partial<Record<SchedulerDeps, jest.Mock>> = {}) {
  const examSessions = {
    findFinalizableIds: jest.fn().mockResolvedValue([]),
    finalizeExamSession: jest.fn().mockResolvedValue(true),
    ...overrides,
  };
  // `completeExpired` chỉ dùng ở lượt quét thu bài; các test dưới đây lái
  // lượt finalize, nên một stub là đủ và không che giấu gì.
  const collectionPhase = { completeExpired: jest.fn().mockResolvedValue(true) };
  const scheduler = new ExamSessionScheduler(
    examSessions as unknown as ExamSessionService,
    collectionPhase as unknown as CollectionPhaseService,
  );
  return { scheduler, examSessions, collectionPhase };
}

const NOW = new Date('2026-08-29T10:00:00Z');

describe('ExamSessionScheduler', () => {
  it('finalizes every session whose end_time has passed, with reason "scheduled"', async () => {
    const { scheduler, examSessions } = createHarness({
      findFinalizableIds: jest.fn().mockResolvedValue(['session-a', 'session-b']),
    });

    const finalized = await scheduler.sweep(NOW);

    expect(finalized).toBe(2);
    expect(examSessions.findFinalizableIds).toHaveBeenCalledWith(NOW);
    expect(examSessions.finalizeExamSession).toHaveBeenNthCalledWith(1, 'session-a', 'scheduled');
    expect(examSessions.finalizeExamSession).toHaveBeenNthCalledWith(2, 'session-b', 'scheduled');
  });

  it('does no work when nothing is due', async () => {
    const { scheduler, examSessions } = createHarness();

    expect(await scheduler.sweep(NOW)).toBe(0);
    expect(examSessions.finalizeExamSession).not.toHaveBeenCalled();
  });

  it('counts only the sessions this tick actually transitioned', async () => {
    // finalizeExamSession returning false means someone else got there
    // first (the manual endpoint, or an overlapping tick) — the sweep must
    // not report that as its own work.
    const { scheduler } = createHarness({
      findFinalizableIds: jest.fn().mockResolvedValue(['session-a', 'session-b']),
      finalizeExamSession: jest.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false),
    });

    expect(await scheduler.sweep(NOW)).toBe(1);
  });

  it('keeps finalizing the rest when one session throws', async () => {
    const { scheduler, examSessions } = createHarness({
      findFinalizableIds: jest.fn().mockResolvedValue(['bad', 'good']),
      finalizeExamSession: jest
        .fn()
        .mockRejectedValueOnce(new Error('deadlock detected'))
        .mockResolvedValueOnce(true),
    });

    // One bad row must not abort the sweep — otherwise a single wedged
    // session would silently keep every later one open forever.
    expect(await scheduler.sweep(NOW)).toBe(1);
    expect(examSessions.finalizeExamSession).toHaveBeenCalledTimes(2);
  });

  it('never lets a rejection escape the scheduled handler', async () => {
    const { scheduler } = createHarness({
      findFinalizableIds: jest.fn().mockRejectedValue(new Error('db is down')),
    });

    // An unhandled rejection inside an @Interval callback takes the whole
    // API process down with it, and would stop every later tick.
    await expect(scheduler.handleSweep()).resolves.toBeUndefined();
  });

  it('skips a tick while the previous one is still running', async () => {
    let release: () => void = () => {};
    const gate = new Promise<string[]>((resolve) => {
      release = () => resolve([]);
    });
    const { scheduler, examSessions } = createHarness({
      findFinalizableIds: jest.fn().mockReturnValue(gate),
    });

    const first = scheduler.handleSweep();
    await scheduler.handleSweep();
    expect(examSessions.findFinalizableIds).toHaveBeenCalledTimes(1);

    release();
    await first;
  });
});
