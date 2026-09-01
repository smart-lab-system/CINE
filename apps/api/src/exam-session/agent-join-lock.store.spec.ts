import { AgentJoinLockStore } from './agent-join-lock.store';

/**
 * Spec §5.2. Time-based behavior (lockout duration, escalating doubling,
 * "does not extend on a locked retry", the §6.3 notify throttle) is tested
 * here with a controlled clock rather than in an e2e suite — waiting out a
 * real 5-minute lockout in a test run is not an option.
 */
describe('AgentJoinLockStore', () => {
  let store: AgentJoinLockStore;
  let now: number;

  beforeEach(() => {
    store = new AgentJoinLockStore();
    now = Date.parse('2026-09-01T09:00:00.000Z');
    jest.spyOn(Date, 'now').mockImplementation(() => now);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function advance(ms: number): void {
    now += ms;
  }

  describe('checkLock', () => {
    it('reports not locked for an MSSV that has never failed', () => {
      expect(store.checkLock('SV20120001')).toEqual({ locked: false });
    });

    it('is case-insensitive, matching how the DB compares MSSVs (citext)', () => {
      for (let i = 0; i < 5; i++) {
        store.recordFailure('sv20120001');
      }
      expect(store.checkLock('SV20120001')).toEqual({
        locked: true,
        retryAfterMs: expect.any(Number),
      });
    });
  });

  describe('recordFailure', () => {
    it('does not lock out before the 5th cumulative failure', () => {
      for (let i = 0; i < 4; i++) {
        expect(store.recordFailure('SV20120001')).toEqual({ locked: false });
      }
      expect(store.checkLock('SV20120001')).toEqual({ locked: false });
    });

    it('locks out for 5 minutes on the 5th cumulative failure', () => {
      for (let i = 0; i < 4; i++) {
        store.recordFailure('SV20120001');
      }
      const result = store.recordFailure('SV20120001');
      expect(result).toEqual({ locked: true, retryAfterMs: 5 * 60_000 });
    });

    it('does not extend the lockout when hit again while already locked', () => {
      for (let i = 0; i < 5; i++) {
        store.recordFailure('SV20120001');
      }
      const first = store.checkLock('SV20120001');
      expect(first).toMatchObject({ locked: true });
      advance(60_000); // 1 minute closer to expiry
      const second = store.checkLock('SV20120001');
      expect(second).toMatchObject({ locked: true });
      if (!first.locked || !second.locked) {
        throw new Error('expected both checks to report locked');
      }
      // The remaining time only ever counts down — a retry never resets or
      // pushes it back out, or the lock could be kept alive forever by
      // whoever it is locking out.
      expect(second.retryAfterMs).toBeLessThan(first.retryAfterMs);
      expect(second.retryAfterMs).toBeCloseTo(first.retryAfterMs - 60_000, -2);
    });

    it('unlocks once the lockout duration has elapsed', () => {
      for (let i = 0; i < 5; i++) {
        store.recordFailure('SV20120001');
      }
      advance(5 * 60_000 + 1);
      expect(store.checkLock('SV20120001')).toEqual({ locked: false });
    });

    it('escalates each subsequent lockout by doubling, capped at 60 minutes', () => {
      const lockoutDurations: number[] = [];
      for (let round = 0; round < 6; round++) {
        for (let i = 0; i < 5; i++) {
          const result = store.recordFailure('SV20120001');
          if (result.locked) {
            lockoutDurations.push(result.retryAfterMs);
          }
        }
        // Jump past whatever this round's lockout was so the next round's
        // failures start counting from zero again.
        advance(60 * 60_000 + 1);
      }
      expect(lockoutDurations).toEqual([
        5 * 60_000,
        10 * 60_000,
        20 * 60_000,
        40 * 60_000,
        60 * 60_000,
        60 * 60_000, // capped — stays at 60, never grows past it
      ]);
    });
  });

  describe('clear', () => {
    it('lets a successful join reset the failure count below the lockout threshold', () => {
      for (let i = 0; i < 4; i++) {
        store.recordFailure('SV20120001');
      }
      store.clear('SV20120001');
      for (let i = 0; i < 4; i++) {
        expect(store.recordFailure('SV20120001')).toEqual({ locked: false });
      }
    });

    it('resets escalation too — the next lockout after a successful join starts back at the 5-minute base', () => {
      for (let i = 0; i < 5; i++) {
        store.recordFailure('SV20120001'); // 1st lockout: 5 min
      }
      advance(5 * 60_000 + 1);
      store.clear('SV20120001');
      let result: ReturnType<AgentJoinLockStore['recordFailure']> = { locked: false };
      for (let i = 0; i < 5; i++) {
        result = store.recordFailure('SV20120001');
      }
      expect(result).toEqual({ locked: true, retryAfterMs: 5 * 60_000 });
    });
  });

  describe('shouldNotify (§6.3 teacher-broadcast throttle)', () => {
    it('allows the first notification for a fresh MSSV', () => {
      expect(store.shouldNotify('SV20120001')).toBe(true);
    });

    it('throttles a second notification within 30 seconds', () => {
      store.shouldNotify('SV20120001');
      expect(store.shouldNotify('SV20120001')).toBe(false);
    });

    it('allows another notification once 30 seconds have passed', () => {
      store.shouldNotify('SV20120001');
      advance(30_000 + 1);
      expect(store.shouldNotify('SV20120001')).toBe(true);
    });

    it('is independent of the failure/lock bookkeeping — a SESSION_NOT_ACTIVE retry never counts as a failure', () => {
      store.shouldNotify('SV20120001');
      store.shouldNotify('SV20120001');
      store.shouldNotify('SV20120001');
      expect(store.checkLock('SV20120001')).toEqual({ locked: false });
    });
  });
});
