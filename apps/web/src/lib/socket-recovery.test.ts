import { describe, expect, it, vi } from 'vitest';
import { createSubscriptionRecovery } from './socket-recovery';

/**
 * H2. `teacher:subscribe` authenticates off `client.handshake.headers.cookie`
 * (apps/api/src/exam-session/exam-session.gateway.ts) — the cookie captured
 * when the socket shook hands, not one read per event. `access_token` has
 * maxAge 15m, so a socket that drops and auto-reconnects after that window
 * hands the gateway a handshake with no token and gets
 * `teacher:subscribe:error` / UNAUTHORIZED. The lobby then sat there telling
 * the teacher to log in again while their refresh_token was still valid.
 *
 * Refreshing the cookie alone fixes nothing: the live connection's handshake
 * is already frozen. The socket has to be torn down and reconnected so the
 * NEW cookie goes out with a new handshake.
 */
describe('createSubscriptionRecovery', () => {
  it('refreshes, then reconnects so the new cookie reaches the handshake', async () => {
    const refresh = vi.fn(async () => true);
    const reconnect = vi.fn();
    const recovery = createSubscriptionRecovery({ refresh, reconnect });

    const recovered = await recovery.recover();

    expect(recovered).toBe(true);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(reconnect).toHaveBeenCalledTimes(1);
  });

  it('reconnects only AFTER the refresh has landed', async () => {
    const order: string[] = [];
    const recovery = createSubscriptionRecovery({
      refresh: async () => {
        order.push('refresh');
        return true;
      },
      reconnect: () => {
        order.push('reconnect');
      },
    });

    await recovery.recover();

    // Reconnecting first would shake hands with the STALE cookie and fail
    // for exactly the same reason, having spent a round-trip to do it.
    expect(order).toEqual(['refresh', 'reconnect']);
  });

  it('does not reconnect when the refresh token is dead too', async () => {
    const reconnect = vi.fn();
    const recovery = createSubscriptionRecovery({
      refresh: async () => false,
      reconnect,
    });

    const recovered = await recovery.recover();

    expect(recovered).toBe(false);
    expect(reconnect).not.toHaveBeenCalled();
  });

  // The loop this guards against is real: refresh succeeds, the socket
  // reconnects, subscribe STILL says UNAUTHORIZED (clock skew, a revoked
  // account, a gateway secret mismatch). Unthrottled that is an infinite
  // refresh/reconnect spin against the API — and every one of those
  // refreshes ROTATES the refresh token, so the spin is not merely wasteful.
  it('refuses a second attempt while the first is still inside the cooldown', async () => {
    const refresh = vi.fn(async () => true);
    const reconnect = vi.fn();
    const recovery = createSubscriptionRecovery({ refresh, reconnect });

    expect(await recovery.recover()).toBe(true);
    expect(await recovery.recover()).toBe(false);
    expect(await recovery.recover()).toBe(false);

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(reconnect).toHaveBeenCalledTimes(1);
  });

  // A three-hour exam on school Wi-Fi blips more than once, and each blip is
  // a genuinely separate expiry — the access_token minted by the previous
  // recovery has itself aged out by then. A permanent one-shot cap would
  // send the teacher to a login message they do not need, mid-exam, for a
  // condition that recovers perfectly well.
  it('allows another attempt once the cooldown has passed', async () => {
    let clock = 0;
    const refresh = vi.fn(async () => true);
    const reconnect = vi.fn();
    const recovery = createSubscriptionRecovery({
      refresh,
      reconnect,
      now: () => clock,
      cooldownMs: 60_000,
    });

    expect(await recovery.recover()).toBe(true);

    clock = 59_999;
    expect(await recovery.recover()).toBe(false);

    clock = 60_000;
    expect(await recovery.recover()).toBe(true);

    expect(refresh).toHaveBeenCalledTimes(2);
    expect(reconnect).toHaveBeenCalledTimes(2);
  });

  // A failed refresh must start the cooldown too. Otherwise a dead API turns
  // every reconnect attempt socket.io makes into another refresh call.
  it('makes a FAILED attempt hold the cooldown as well', async () => {
    let clock = 0;
    const refresh = vi.fn(async () => false);
    const recovery = createSubscriptionRecovery({
      refresh,
      reconnect: () => {},
      now: () => clock,
      cooldownMs: 60_000,
    });

    expect(await recovery.recover()).toBe(false);
    clock = 30_000;
    expect(await recovery.recover()).toBe(false);

    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('shares one refresh between concurrent recoveries', async () => {
    const refresh = vi.fn(async () => true);
    const reconnect = vi.fn();
    const recovery = createSubscriptionRecovery({ refresh, reconnect });

    const [a, b] = await Promise.all([recovery.recover(), recovery.recover()]);

    // One of them did the work; neither fired a second refresh.
    expect([a, b].filter(Boolean)).toHaveLength(1);
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
