'use client';

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
}

export interface SubscriptionRecovery {
  /**
   * Call on `teacher:subscribe:error` with code UNAUTHORIZED. Resolves
   * `true` when a reconnect has been dialled and the caller should wait
   * rather than show an error; `false` when nothing further can be done and
   * the "please log in again" message is the honest answer.
   */
  recover: () => Promise<boolean>;
}

/**
 * One rescue attempt for a lobby subscription that expired underneath the
 * teacher.
 *
 * Scoped to a single page mount, and capped at ONE attempt for its whole
 * life. The cap is not caution, it is the loop guard: if the refresh
 * succeeds but `teacher:subscribe` still answers UNAUTHORIZED — clock skew,
 * a revoked account, a gateway/API secret mismatch — then retrying produces
 * exactly the same answer, forever, at one refresh plus one reconnect per
 * turn. After the first failure the login message is the truthful outcome.
 *
 * The counter is bumped BEFORE the first await, so two UNAUTHORIZED errors
 * arriving in the same tick cannot both get through.
 */
export function createSubscriptionRecovery(
  deps: SubscriptionRecoveryDeps,
): SubscriptionRecovery {
  let attempted = false;

  return {
    async recover(): Promise<boolean> {
      if (attempted) {
        return false;
      }
      attempted = true;

      if (!(await deps.refresh())) {
        return false;
      }

      deps.reconnect();
      return true;
    },
  };
}
