import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The silent-refresh-and-retry middleware in api-client.ts, against a
 * stubbed `fetch` — the real openapi-fetch pipeline runs, not a mock of
 * this module's own logic, so this proves the middleware is actually
 * wired into the client and not just correct in isolation.
 *
 * `apiClient` is a singleton created at module load, so every test
 * re-imports the module fresh (after stubbing `fetch` and resetting the
 * module registry) — otherwise a later test's stub would arrive after
 * openapi-fetch already captured a reference to the earlier one.
 */

function urlOf(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function freshApiClient() {
  vi.resetModules();
  const mod = await import('./api-client');
  return mod.apiClient;
}

describe('apiClient — silent refresh on 401', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('refreshes once and retries the original request on a 401, transparently to the caller', async () => {
    let healthCalls = 0;
    (fetch as ReturnType<typeof vi.fn>).mockImplementation((input: RequestInfo | URL) => {
      const url = urlOf(input);
      if (url.includes('/api/auth/refresh')) {
        return Promise.resolve(jsonResponse({ account: { role: 'teacher' } }));
      }
      if (url.includes('/health')) {
        healthCalls++;
        // First attempt (the expired access_token) fails; the retry,
        // made after the browser has a fresh one, succeeds.
        return healthCalls === 1
          ? Promise.resolve(jsonResponse({ message: 'Unauthorized' }, 401))
          : Promise.resolve(jsonResponse({ status: 'ok' }));
      }
      throw new Error(`unexpected fetch to ${url}`);
    });

    const apiClient = await freshApiClient();
    const result = await apiClient.GET('/health');

    expect(healthCalls).toBe(2);
    expect(result.response.status).toBe(200);
    expect(
      (fetch as ReturnType<typeof vi.fn>).mock.calls.some(([input]) =>
        urlOf(input).includes('/api/auth/refresh'),
      ),
    ).toBe(true);
  });

  it('surfaces the original 401 once the refresh token has also expired, without looping', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockImplementation((input: RequestInfo | URL) => {
      const url = urlOf(input);
      if (url.includes('/api/auth/refresh')) {
        return Promise.resolve(jsonResponse({ message: 'Invalid refresh token' }, 401));
      }
      if (url.includes('/health')) {
        return Promise.resolve(jsonResponse({ message: 'Unauthorized' }, 401));
      }
      throw new Error(`unexpected fetch to ${url}`);
    });

    const apiClient = await freshApiClient();
    const result = await apiClient.GET('/health');

    // The honest answer — nothing client-side can recover a dead refresh
    // token. Exactly one call to /health: the retry path is never taken
    // because the refresh itself failed, so there is no second /health
    // call to prove a loop didn't happen.
    expect(result.response.status).toBe(401);
    const healthCallCount = (fetch as ReturnType<typeof vi.fn>).mock.calls.filter(([input]) =>
      urlOf(input).includes('/health'),
    ).length;
    expect(healthCallCount).toBe(1);
  });

  it('shares one refresh call across requests that 401 at the same time', async () => {
    let refreshCalls = 0;
    let healthCalls = 0;
    (fetch as ReturnType<typeof vi.fn>).mockImplementation((input: RequestInfo | URL) => {
      const url = urlOf(input);
      if (url.includes('/api/auth/refresh')) {
        refreshCalls++;
        return Promise.resolve(jsonResponse({ account: { role: 'teacher' } }));
      }
      if (url.includes('/health')) {
        healthCalls++;
        // Every request's FIRST attempt 401s (simulating N requests fired
        // the instant the access_token expired); every retry succeeds.
        return healthCalls <= 2
          ? Promise.resolve(jsonResponse({ message: 'Unauthorized' }, 401))
          : Promise.resolve(jsonResponse({ status: 'ok' }));
      }
      throw new Error(`unexpected fetch to ${url}`);
    });

    const apiClient = await freshApiClient();
    const [a, b] = await Promise.all([apiClient.GET('/health'), apiClient.GET('/health')]);

    expect(a.response.status).toBe(200);
    expect(b.response.status).toBe(200);
    expect(refreshCalls).toBe(1);
  });

  // H3. A Request's body can be read exactly once, and openapi-fetch's own
  // outgoing `fetch(request, requestInitExt)` consumes it while sending the
  // first attempt — so by the time the 401 comes back there is nothing left
  // to replay, and every POST/PATCH/PUT (and body-carrying DELETE) used to
  // fall back to surfacing the 401. A teacher who hit "Lưu điểm" at minute 16
  // got an error for no reason a person could see.
  it('replays a body-carrying request after refreshing, body intact', async () => {
    let accountCalls = 0;
    const bodiesSeen: string[] = [];

    (fetch as ReturnType<typeof vi.fn>).mockImplementation(async (input: RequestInfo | URL) => {
      const url = urlOf(input);
      if (url.includes('/api/auth/refresh')) {
        return jsonResponse({ account: { role: 'teacher' } });
      }
      if (url.includes('/accounts')) {
        accountCalls++;
        // A canned-response mock never reads the Request, so `bodyUsed`
        // stays false and the bug cannot reproduce. A REAL fetch streams
        // the body to the network as part of sending — reading it here is
        // what matches that observable effect.
        if (input instanceof Request) {
          bodiesSeen.push(await input.text());
        }
        return accountCalls === 1
          ? jsonResponse({ message: 'Unauthorized' }, 401)
          : jsonResponse({ id: 'acc-1' }, 201);
      }
      throw new Error(`unexpected fetch to ${url}`);
    });

    const apiClient = await freshApiClient();
    const result = await apiClient.POST('/accounts', {
      body: { name: 'Cô A', email: 'a@example.com', password: 'x', role: 'teacher' },
    });

    expect(accountCalls).toBe(2);
    expect(result.response.status).toBe(201);
    // The replay has to carry the SAME body. A retry that quietly dropped it
    // would create an empty account instead of the one that was filled in —
    // worse than the 401 this replaces, because it looks like success.
    expect(bodiesSeen).toHaveLength(2);
    expect(bodiesSeen[1]).toBe(bodiesSeen[0]);
    expect(JSON.parse(bodiesSeen[1]).email).toBe('a@example.com');
  });
});
