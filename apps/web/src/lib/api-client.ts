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
apiClient.use({
  onRequest({ request }) {
    return new Request(request, { credentials: 'include' });
  },
});

// In-flight refresh, shared across every request that hits this at once —
// without it, a page that fires N requests the moment `access_token`
// expires (ACCESS_TOKEN_TTL=15m; a teacher watching a live lobby for
// longer than that is the exact case this was reported against) would
// fire N separate refresh calls instead of one. Module-scoped, not per
// request: that's what lets concurrent 401s share it.
let refreshInFlight: Promise<boolean> | null = null;

function refreshSession(): Promise<boolean> {
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

    try {
      return await fetch(request.clone());
    } catch {
      // `.clone()` throws for any request whose body has already been
      // read — true of every POST/PATCH/PUT and a body-carrying DELETE
      // by this point: openapi-fetch's own outgoing `fetch(request, ...)`
      // call already consumed it sending this attempt. A GET has no body
      // to consume, so it retries cleanly; a body-carrying request falls
      // back to the original 401 instead of crashing on it — the same
      // outcome those requests already had before this middleware
      // existed, not a regression, just not yet a case this can retry
      // (replaying the body would mean cloning it before the FIRST
      // attempt ever sends, which is a real follow-up, not this fix).
      return undefined;
    }
  },
});
