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
