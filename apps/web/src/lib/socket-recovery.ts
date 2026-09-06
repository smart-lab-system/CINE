'use client';

/**
 * How long one recovery attempt holds the door shut behind it.
 *
 * Long enough that a broken subscription cannot spin (socket.io redials on
 * its own schedule, and every redial that fails would otherwise mint — and
 * ROTATE — another refresh token), short enough that two genuinely separate
 * network blips in a three-hour exam are both recoverable.
 */
export const RECOVERY_COOLDOWN_MS = 60_000;

export interface SubscriptionRecoveryDeps {
  /** Mints a fresh cookie pair. `false` when the refresh token is dead too. */
  refresh: () => Promise<boolean>;
  /**
   * Tears the socket down and dials again. Refreshing the cookie alone is
   * not enough: `teacher:subscribe` reads
   * `client.handshake.headers.cookie`, captured once when the socket shook
   * hands, so a live connection keeps presenting the stale token no matter
   * what the browser's cookie jar now holds.
   */
  reconnect: () => void;
  /** Injectable clock, so the cooldown is testable without real timers. */
  now?: () => number;
  cooldownMs?: number;
}

export interface SubscriptionRecovery {
  /**
   * Call on `teacher:subscribe:error` with code UNAUTHORIZED. Resolves
   * `true` when a reconnect has been dialled and the caller should wait
   * rather than show an error; `false` when nothing further can be done
   * right now and the "please log in again" message is the honest answer.
   */
  recover: () => Promise<boolean>;
}

/**
 * Rescues a lobby subscription that expired underneath the teacher.
 *
 * Throttled rather than one-shot. A hard one-attempt-per-mount cap would be
 * a simpler loop guard, but it fails the case this exists for: over three
 * hours of invigilation the Wi-Fi drops more than once, and by the second
 * drop the access_token minted by the FIRST recovery has itself aged out —
 * an ordinary, perfectly recoverable expiry that a permanent cap would turn
 * into a login screen mid-exam.
 *
 * The alternative considered was resetting the cap once the subscription was
 * known good again, but this page has no such signal: `teacher:subscribe`
 * acknowledges nothing on success (only `teacher:subscribe:error` on
 * failure), and a quiet exam room emits no other event to stand in for one.
 * Inventing a server-side ack for it is a contract change, not a bug fix.
 *
 * The cooldown is taken BEFORE the first await and on failure as well as
 * success, so neither two errors in the same tick nor a dead API can slip a
 * second attempt through.
 */
export function createSubscriptionRecovery(
  deps: SubscriptionRecoveryDeps,
): SubscriptionRecovery {
  const now = deps.now ?? (() => Date.now());
  const cooldownMs = deps.cooldownMs ?? RECOVERY_COOLDOWN_MS;

  let lastAttemptAt: number | null = null;

  return {
    async recover(): Promise<boolean> {
      const startedAt = now();
      if (lastAttemptAt !== null && startedAt - lastAttemptAt < cooldownMs) {
        return false;
      }
      lastAttemptAt = startedAt;

      if (!(await deps.refresh())) {
        return false;
      }

      deps.reconnect();
      return true;
    },
  };
}
