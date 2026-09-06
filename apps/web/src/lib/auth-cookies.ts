import type { NextResponse } from 'next/server';

/**
 * The one definition of the session cookies.
 *
 * Three separate places mint a session — `app/api/auth/login/route.ts`,
 * `app/api/auth/refresh/route.ts`, and `middleware.ts` — and a token minted
 * by any of them has to expire on the same schedule and be exactly as
 * reachable (secure, sameSite, path) as one minted by the others. When these
 * were three inline copies, nothing made them agree: a session started at
 * login could quietly outlive, or die before, one revived by the middleware,
 * and no test would have noticed.
 */

export const ACCESS_TOKEN_MAX_AGE = 60 * 15;
export const REFRESH_TOKEN_MAX_AGE = 60 * 60 * 24 * 7;

export interface SessionAccount {
  name: string;
  email: string;
  role: string;
}

export interface Session {
  accessToken: string;
  refreshToken: string;
  /** Absent when the caller has no account payload to mirror into the cookie. */
  account?: SessionAccount;
}

/**
 * Read per call, not once at module load. Edge middleware and Route Handlers
 * are separate bundles evaluated at different moments, and a module-level
 * constant would freeze whatever `NODE_ENV` happened to hold the first time
 * that particular bundle was pulled in — which is how one of these three
 * ended up deciding `secure` at a different moment from the other two.
 */
function cookieBase() {
  return {
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  } as const;
}

export function setSessionCookies<R extends NextResponse<unknown>>(
  response: R,
  session: Session,
): R {
  const base = cookieBase();

  response.cookies.set('access_token', session.accessToken, {
    ...base,
    httpOnly: true,
    maxAge: ACCESS_TOKEN_MAX_AGE,
  });

  // Rotated on every refresh (AuthService.refresh: "a leaked one stops being
  // usable as soon as the legitimate holder refreshes") — always the NEW
  // value, never the one the request arrived with.
  response.cookies.set('refresh_token', session.refreshToken, {
    ...base,
    httpOnly: true,
    maxAge: REFRESH_TOKEN_MAX_AGE,
  });

  if (session.account) {
    response.cookies.set(
      'account',
      JSON.stringify({
        name: session.account.name,
        email: session.account.email,
        role: session.account.role,
      }),
      // Readable by client JS on purpose: display data (the name in the
      // header), never an authorisation input.
      { ...base, httpOnly: false, maxAge: ACCESS_TOKEN_MAX_AGE },
    );
  }

  return response;
}

/**
 * Expired, revoked, or the account is gone — nothing short of a real login
 * recovers. The stale cookies go rather than being left to fail the same way
 * on the next navigation, which is what would otherwise turn one dead refresh
 * token into a pointless API round-trip on every single request.
 */
export function clearSessionCookies<R extends NextResponse<unknown>>(response: R): R {
  response.cookies.delete('access_token');
  response.cookies.delete('refresh_token');
  response.cookies.delete('account');
  return response;
}
