'use client';

import { createApiClient } from '@cine/shared';

// The browser calls the Nest API directly for data (not through a Next
// Route Handler) — the access_token cookie is httpOnly, so it can't be
// read here; requests rely on the cookie being sent automatically because
// both apps share the same top-level domain in production, and in local
// dev the Nest API's CORS config allows credentials from localhost:3000.
export const apiClient = createApiClient(
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000',
);

// `fetch`'s default credentials mode is "same-origin", which never attaches
// cookies to this client's requests: localhost:3000 (this app) and
// localhost:4000 (the Nest API) are different origins even in local dev.
// CORS `credentials: true` on the server only permits a credentialed
// request to be *received* — the browser still won't send one unless the
// request itself opts in with `credentials: 'include'`. Requests are
// immutable once constructed, so a Request is rebuilt here with the mode
// forced, once, instead of repeating `credentials: 'include'` on every
// GET/POST call site.
// A Request's body can be read exactly ONCE, and openapi-fetch's own
// outgoing `fetch(request, requestInitExt)` consumes it while sending the
// first attempt. By the time a 401 comes back there is nothing left to
// replay — so the clone has to be taken HERE, before that first send ever
// goes out, not in onResponse where it is already too late.
//
// Keyed by the Request object openapi-fetch carries from onRequest through
// to onResponse: it is one `request` variable across both hooks (see
// openapi-fetch/dist/index.js), so the identity holds. A WeakMap, so a
// request that never 401s is collected without any bookkeeping of its own.
const replayable = new WeakMap<Request, Request>();

apiClient.use({
  onRequest({ request }) {
    const credentialed = new Request(request, { credentials: 'include' });
    replayable.set(credentialed, credentialed.clone());
    return credentialed;
  },
});

// Exported because the exam-live socket needs the same refresh (see
// lib/socket-recovery.ts): when a lobby tab's XHR and its socket both
// discover the expired token in the same instant, sharing this promise is
// what makes that ONE call to /api/auth/refresh instead of two racing ones
// that would rotate the refresh token out from under each other.
//
// In-flight refresh, shared across every request that hits this at once —
// without it, a page that fires N requests the moment `access_token`
// expires (ACCESS_TOKEN_TTL=15m; a teacher watching a live lobby for
// longer than that is the exact case this was reported against) would
// fire N separate refresh calls instead of one. Module-scoped, not per
// request: that's what lets concurrent 401s share it.
let refreshInFlight: Promise<boolean> | null = null;

/**
 * Mints a fresh cookie pair, resolving `false` when the refresh token is
 * dead too.
 *
 * CONCURRENT CALLS SHARE ONE REQUEST. lib/socket-recovery.ts depends on that:
 * when a lobby tab discovers the expired token through an XHR 401 and through
 * a socket UNAUTHORIZED in the same instant, two independent calls would each
 * rotate the refresh token, and the second rotation would invalidate the pair
 * the first just wrote into the cookie jar — logging the teacher out for real
 * while trying to keep them signed in.
 */
export function refreshSession(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' })
      .then((res) => res.ok)
      .catch(() => false)
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

// Silently refreshes and retries once on a 401, instead of leaving every
// caller to notice the token expired on its own — which nothing in this
// app actually did (confirmed: `throwIfFailed()`-style helpers just throw
// a generic Error on any non-2xx, with no redirect-to-login or retry
// anywhere), so a session simply broke after ACCESS_TOKEN_TTL with no
// recovery. Reported directly against the live app as "giảng viên bị out
// giữa chừng".
//
// Never loops: the retried request goes through a bare `fetch`, not back
// through `apiClient` — so even if the retry itself 401s again (refresh
// token also expired, account deleted mid-session), there is no second
// pass through this middleware to recurse into. That second 401 surfaces
// to the caller exactly as an unrecovered one always has.
apiClient.use({
  async onResponse({ request, response }) {
    if (response.status !== 401) {
      return undefined;
    }
    // Never true today (login/refresh are never called through this
    // client — see api/auth/*/route.ts), kept as a guard so this can't
    // start recursing if that ever changes.
    if (request.url.includes('/auth/login') || request.url.includes('/auth/refresh')) {
      return undefined;
    }

    const refreshed = await refreshSession();
    if (!refreshed) {
      // Nothing else can be done client-side — the refresh token itself
      // is gone too. The original 401 is the honest answer here.
      return undefined;
    }

    // The clone taken in onRequest, before the body was streamed out. No
    // `request.clone()` fallback: onRequest runs for every request on this
    // client, so a miss here means the middleware wiring is broken, and
    // cloning would throw for exactly the body-carrying requests the WeakMap
    // exists to serve. Surfacing the original 401 is the honest answer.
    const replay = replayable.get(request);
    if (!replay) {
      return undefined;
    }
    try {
      return await fetch(replay);
    } catch {
      // The network died between the refresh and the replay.
      return undefined;
    }
  },
});
