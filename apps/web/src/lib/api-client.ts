'use client';

import { createApiClient } from '@cine/shared';
import { getAccessToken, peekAccessToken, setAccessToken } from './auth-token';

/**
 * Trình duyệt gọi thẳng Nest API (không qua Route Handler của Next) để lấy
 * dữ liệu, và xác thực bằng header `Authorization: Bearer`.
 *
 * Trước đây chỗ này dựa vào cookie `access_token` tự được gửi kèm, với giả
 * định "cả hai app dùng chung top-level domain trong production". Giả định đó
 * sụp khi frontend lên Vercel còn API lên Railway: cookie thuộc về host đã ĐẶT
 * nó, nên cookie của origin frontend không bao giờ tới được API ở domain khác
 * — và không có giá trị `SameSite` nào đổi được điều đó.
 *
 * `JwtStrategy` phía Nest vốn đã chấp nhận Bearer làm nguồn thứ hai sau
 * cookie, nên backend không phải đổi gì cho REST.
 */
export const apiClient = createApiClient(
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000',
);

function withBearer(headers: Headers, token: string): Headers {
  const next = new Headers(headers);
  next.set('Authorization', `Bearer ${token}`);
  return next;
}

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
  async onRequest({ request }) {
    // `await`: sau khi F5 thì bộ nhớ trống và token phải được lấy lại từ
    // cookie httpOnly qua /api/auth/token. getAccessToken() gộp mọi lời gọi
    // đồng thời thành MỘT request, nên một trang bắn 5 lời gọi song song vẫn
    // chỉ bootstrap một lần.
    const token = await getAccessToken();

    // Không token vẫn gửi đi: chưa đăng nhập thì 401 từ API là câu trả lời
    // đúng, và đường 401-retry bên dưới sẽ thử cứu. Chặn tại đây sẽ biến một
    // phiên còn cứu được thành lỗi ngay lập tức.
    const outgoing = token
      ? new Request(request, { headers: withBearer(request.headers, token) })
      : request;

    replayable.set(outgoing, outgoing.clone());
    return outgoing;
  },
});

let refreshInFlight: Promise<boolean> | null = null;

/**
 * Đổi refresh token lấy cặp mới, trả `false` khi refresh token cũng đã chết.
 *
 * Gọi `/api/auth/refresh` — một Route Handler CÙNG ORIGIN với trang, nên
 * cookie httpOnly `refresh_token` tới được nó. Đây là lý do refresh token
 * không cần nằm trong JS: chỉ có access token mới phải vượt biên sang domain
 * của API.
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
    refreshInFlight = fetch('/api/auth/refresh', { method: 'POST', credentials: 'same-origin' })
      .then(async (res) => {
        if (!res.ok) {
          return false;
        }
        // Ghi token mới vào bộ nhớ NGAY tại đây, không để caller tự lo: mọi
        // đường refresh đều đi qua hàm này, nên đây là chỗ duy nhất bộ nhớ có
        // thể lệch khỏi cookie. Bỏ sót sẽ khiến lần thử lại gửi lại đúng cái
        // token vừa hết hạn và 401 lần nữa.
        const body: unknown = await res.json().catch(() => null);
        const next =
          typeof body === 'object' && body !== null
            ? (body as { accessToken?: unknown }).accessToken
            : null;
        if (typeof next === 'string' && next !== '') {
          setAccessToken(next);
        }
        return true;
      })
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

    // Bản clone mang header Authorization của token CŨ — chính cái vừa bị từ
    // chối. Gửi lại nguyên xi là 401 lần hai một cách chắc chắn. Dựng lại
    // header bằng token mà refreshSession() vừa ghi.
    //
    // `peek` chứ không `await get`: refreshSession() vừa chạy xong nên bộ nhớ
    // đã có giá trị mới, và một lần bootstrap nữa ở đây chỉ thêm một round
    // trip cho thứ đã nằm sẵn trong tay.
    const token = peekAccessToken();
    const retried = token
      ? new Request(replay, { headers: withBearer(replay.headers, token) })
      : replay;

    try {
      return await fetch(retried);
    } catch {
      // The network died between the refresh and the replay.
      return undefined;
    }
  },
});
