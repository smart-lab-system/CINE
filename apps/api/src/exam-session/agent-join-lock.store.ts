import { Injectable } from '@nestjs/common';

interface LockEntry {
  /** Cumulative SESSION_NOT_FOUND/INVALID_INPUT failures since the last
   *  success or the last lockout firing (never time-windowed on its own —
   *  only a successful join or a lockout resets it). */
  failureCount: number;
  /** epoch ms this MSSV may attempt again, or null if not currently locked. */
  lockedUntil: number | null;
  /** How many times this MSSV has been locked out. Drives the doubling
   *  escalation — persists across a lock's own expiry (that's the whole
   *  point of "escalating"), but is wiped by `clear()` on a real success. */
  lockStrikes: number;
  /** epoch ms of the last `lobby:join_attempt_failed` broadcast for this
   *  MSSV (§6.3) — tracked independently of the failure count above, since
   *  a SESSION_NOT_ACTIVE retry must never count as a failure. */
  lastNotifiedAt: number;
}

export type LockStatus = { locked: true; retryAfterMs: number } | { locked: false };

/**
 * Per-MSSV `agent:join` abuse tracking, held in memory. Spec §5.2/§6.3.
 *
 * Same pattern and the same accepted limitation as AccessRequestStore: not
 * a table, does not survive a server restart. That is fine for "block the
 * next attempt" — the entire value of this data is "right now" — and wrong
 * for anything meant to be looked at later. This store must never become an
 * implicit source of truth for anything else (a report, an audit trail); if
 * a durable record of failed attempts is ever wanted, it is a separate,
 * explicitly durable addition, not a reuse of this Map.
 */
@Injectable()
export class AgentJoinLockStore {
  private static readonly MAX_FAILURES = 5;
  private static readonly BASE_LOCKOUT_MS = 5 * 60_000;
  private static readonly MAX_LOCKOUT_MS = 60 * 60_000;
  private static readonly NOTIFY_THROTTLE_MS = 30_000;

  private readonly entries = new Map<string, LockEntry>();

  /**
   * Read-only check: is this MSSV locked out right now? Never mutates the
   * lock itself — checking must not extend it, or anyone could keep a real
   * student's MSSV perpetually locked out just by continuing to hit it
   * during the lockout window. Does clear a lock that has naturally
   * expired since it was set, so the next `recordFailure` starts counting
   * fresh.
   */
  checkLock(mssv: string): LockStatus {
    const entry = this.entries.get(this.key(mssv));
    if (!entry?.lockedUntil) {
      return { locked: false };
    }
    const remaining = entry.lockedUntil - Date.now();
    if (remaining <= 0) {
      entry.lockedUntil = null;
      entry.failureCount = 0;
      return { locked: false };
    }
    return { locked: true, retryAfterMs: remaining };
  }

  /**
   * Records one SESSION_NOT_FOUND/INVALID_INPUT outcome for this MSSV.
   * Returns the newly-created lock if this failure is the one that tipped
   * the count to the threshold, so the caller can answer this same attempt
   * with RATE_LIMITED instead of the underlying error code.
   */
  recordFailure(mssv: string): LockStatus {
    const key = this.key(mssv);
    const entry = this.entries.get(key) ?? this.newEntry();
    entry.failureCount += 1;

    if (entry.failureCount < AgentJoinLockStore.MAX_FAILURES) {
      this.entries.set(key, entry);
      return { locked: false };
    }

    const durationMs = Math.min(
      AgentJoinLockStore.BASE_LOCKOUT_MS * 2 ** entry.lockStrikes,
      AgentJoinLockStore.MAX_LOCKOUT_MS,
    );
    entry.lockedUntil = Date.now() + durationMs;
    entry.lockStrikes += 1;
    entry.failureCount = 0;
    this.entries.set(key, entry);
    return { locked: true, retryAfterMs: durationMs };
  }

  /**
   * A successful join clears everything for this MSSV, including the
   * escalation count. A join that actually succeeds is strong evidence
   * this MSSV isn't being abused, so there is no reason to keep treating it
   * as suspicious afterwards — the next lockout (if any) starts back at the
   * 5-minute base, not wherever the escalation left off.
   */
  clear(mssv: string): void {
    this.entries.delete(this.key(mssv));
  }

  /**
   * §6.3: at most one `lobby:join_attempt_failed` broadcast per MSSV per
   * 30 seconds. Independent of the failure/lock bookkeeping above.
   */
  shouldNotify(mssv: string): boolean {
    const key = this.key(mssv);
    const entry = this.entries.get(key) ?? this.newEntry();
    const now = Date.now();
    if (now - entry.lastNotifiedAt < AgentJoinLockStore.NOTIFY_THROTTLE_MS) {
      this.entries.set(key, entry);
      return false;
    }
    entry.lastNotifiedAt = now;
    this.entries.set(key, entry);
    return true;
  }

  private newEntry(): LockEntry {
    return { failureCount: 0, lockedUntil: null, lockStrikes: 0, lastNotifiedAt: 0 };
  }

  /** Lowercased — matches how `citext` already compares an MSSV in the DB. */
  private key(mssv: string): string {
    return mssv.toLowerCase();
  }
}
