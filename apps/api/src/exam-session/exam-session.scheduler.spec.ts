import { BadRequestException, ConflictException } from '@nestjs/common';
import { ExamSessionScheduler } from './exam-session.scheduler';
import { ExamSessionService } from './exam-session.service';
import { CollectionPhaseService } from './collection-phase.service';
import { SessionRosterService } from './session-roster.service';
import { ExamSessionEntity } from './entities/exam-session.entity';

/**
 * Drives the sweep directly at a chosen `now` — no timers, no @Interval,
 * no waiting 30 seconds inside a test.
 */
type SchedulerDeps =
  | 'findFinalizableIds'
  | 'finalizeExamSession'
  | 'findAwaitingOpenIds'
  | 'findById'
  | 'transitionUnopened';

function createHarness(overrides: Partial<Record<SchedulerDeps, jest.Mock>> = {}) {
  const examSessions = {
    findFinalizableIds: jest.fn().mockResolvedValue([]),
    finalizeExamSession: jest.fn().mockResolvedValue(true),
    findAwaitingOpenIds: jest.fn().mockResolvedValue([]),
    findById: jest.fn().mockResolvedValue(null),
    transitionUnopened: jest.fn().mockResolvedValue(true),
    ...overrides,
  };
  // `completeExpired` chỉ dùng ở lượt quét thu bài; các test dưới đây lái
  // lượt finalize, nên một stub là đủ và không che giấu gì.
  const collectionPhase = { completeExpired: jest.fn().mockResolvedValue(true) };
  const sessionRoster = {
    freeze: jest.fn().mockResolvedValue({ students: 1, submissionsSeeded: 1 }),
  };
  const scheduler = new ExamSessionScheduler(
    examSessions as unknown as ExamSessionService,
    collectionPhase as unknown as CollectionPhaseService,
    sessionRoster as unknown as SessionRosterService,
  );
  return { scheduler, examSessions, collectionPhase, sessionRoster };
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

function awaiting(over: Partial<ExamSessionEntity> = {}): ExamSessionEntity {
  return {
    id: 'session-a',
    status: 'scheduled',
    startTime: new Date('2026-08-29T10:05:00Z'),
    endTime: new Date('2026-08-29T12:00:00Z'),
    ...over,
  } as ExamSessionEntity;
}

describe('ExamSessionScheduler auto-open', () => {
  it('opens a session that is ready inside the 10-minute window', async () => {
    const session = awaiting();
    const { scheduler, examSessions, sessionRoster } = createHarness({
      findAwaitingOpenIds: jest.fn().mockResolvedValue([session.id]),
      findById: jest.fn().mockResolvedValue(session),
    });

    expect(await scheduler.sweepAutoOpen(NOW)).toBe(1);
    expect(sessionRoster.freeze).toHaveBeenCalledWith(session);
    expect(examSessions.transitionUnopened).not.toHaveBeenCalled();
  });

  it('marks Chưa đủ điều kiện when open fails before the start time', async () => {
    const session = awaiting();
    const { scheduler, examSessions, sessionRoster } = createHarness({
      findAwaitingOpenIds: jest.fn().mockResolvedValue([session.id]),
      findById: jest.fn().mockResolvedValue(session),
    });
    sessionRoster.freeze.mockRejectedValue(new BadRequestException('thiếu file'));

    expect(await scheduler.sweepAutoOpen(NOW)).toBe(1);
    expect(examSessions.transitionUnopened).toHaveBeenCalledWith(session.id, 'not_ready');
  });

  it('does not rewrite a session that is already Chưa đủ điều kiện', async () => {
    const session = awaiting({ status: 'not_ready' });
    const { scheduler, examSessions, sessionRoster } = createHarness({
      findAwaitingOpenIds: jest.fn().mockResolvedValue([session.id]),
      findById: jest.fn().mockResolvedValue(session),
    });
    sessionRoster.freeze.mockRejectedValue(new BadRequestException('thiếu file'));

    expect(await scheduler.sweepAutoOpen(NOW)).toBe(0);
    expect(examSessions.transitionUnopened).not.toHaveBeenCalled();
  });

  it('marks Không diễn ra when open still fails at the start time', async () => {
    const session = awaiting({ startTime: NOW });
    const { scheduler, examSessions, sessionRoster } = createHarness({
      findAwaitingOpenIds: jest.fn().mockResolvedValue([session.id]),
      findById: jest.fn().mockResolvedValue(session),
    });
    sessionRoster.freeze.mockRejectedValue(new BadRequestException('chưa có sinh viên'));

    expect(await scheduler.sweepAutoOpen(NOW)).toBe(1);
    expect(examSessions.transitionUnopened).toHaveBeenCalledWith(session.id, 'missed');
  });

  it('marks Không diễn ra without opening once the window has ended', async () => {
    const session = awaiting({
      startTime: new Date('2026-08-29T08:00:00Z'),
      endTime: new Date('2026-08-29T09:00:00Z'),
    });
    const { scheduler, examSessions, sessionRoster } = createHarness({
      findAwaitingOpenIds: jest.fn().mockResolvedValue([session.id]),
      findById: jest.fn().mockResolvedValue(session),
    });

    expect(await scheduler.sweepAutoOpen(NOW)).toBe(1);
    expect(sessionRoster.freeze).not.toHaveBeenCalled();
    expect(examSessions.transitionUnopened).toHaveBeenCalledWith(session.id, 'missed');
  });

  it('leaves a session alone when open loses a race', async () => {
    const session = awaiting();
    const { scheduler, examSessions, sessionRoster } = createHarness({
      findAwaitingOpenIds: jest.fn().mockResolvedValue([session.id]),
      findById: jest.fn().mockResolvedValue(session),
    });
    sessionRoster.freeze.mockRejectedValue(new ConflictException('đã huỷ'));

    expect(await scheduler.sweepAutoOpen(NOW)).toBe(0);
    expect(examSessions.transitionUnopened).not.toHaveBeenCalled();
  });

  it('keeps going when one session throws', async () => {
    const bad = awaiting({ id: 'bad' });
    const good = awaiting({ id: 'good' });
    const { scheduler, sessionRoster } = createHarness({
      findAwaitingOpenIds: jest.fn().mockResolvedValue(['bad', 'good']),
      findById: jest.fn().mockImplementation(async (id: string) => (id === 'bad' ? bad : good)),
    });
    sessionRoster.freeze.mockImplementation(async (session: ExamSessionEntity) => {
      if (session.id === 'bad') {
        throw new Error('deadlock detected');
      }
      return { students: 1, submissionsSeeded: 1 };
    });

    expect(await scheduler.sweepAutoOpen(NOW)).toBe(1);
    expect(sessionRoster.freeze).toHaveBeenCalledTimes(2);
  });
});
