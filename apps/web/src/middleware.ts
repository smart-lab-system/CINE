import { NextRequest, NextResponse } from 'next/server';
import { decodeAccessTokenRole } from '@/lib/jwt';
import {
  ALL_AREAS,
  UNASSIGNED_ROLE_PATH,
  areaForRole,
  homeForRole,
} from '@/lib/role-areas';

const PUBLIC_PATHS = ['/login'];

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

// Must match login/route.ts and api/auth/refresh/route.ts exactly — a token
// minted here has to expire on the same schedule as one minted at login, and
// be exactly as reachable (secure, sameSite, path), or a session revived here
// would quietly behave differently from one that started at login.
const COOKIE_BASE = {
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/',
} as const;
const ACCESS_TOKEN_MAX_AGE = 60 * 15;
const REFRESH_TOKEN_MAX_AGE = 60 * 60 * 24 * 7;

interface RefreshedSession {
  accessToken: string;
  refreshToken: string;
  account?: { name: string; email: string; role: string };
}

export function isProtectedPath(pathname: string): boolean {
  return !PUBLIC_PATHS.some(
    (publicPath) => pathname === publicPath || pathname.startsWith(`${publicPath}/`),
  );
}

// Exact-or-segment match only — `/admin`/`/admin/...` matches, a
// hypothetical future `/administrator` route would not (plain
// `startsWith('/admin')` would wrongly treat it as the same area).
function isUnderSegment(pathname: string, segment: string): boolean {
  return pathname === segment || pathname.startsWith(`${segment}/`);
}

/**
 * Trades a still-valid refresh token for a fresh pair, or `null` if the
 * server will not have it.
 *
 * Server-to-server, so — unlike a browser request — this fetch carries none
 * of the incoming request's cookies on its own, and the refresh token has to
 * be forwarded explicitly. Nest reads it off `req.cookies?.refresh_token`,
 * the same place JwtStrategy reads `access_token`.
 *
 * Never throws. A dead API has to send the visitor to /login; letting the
 * rejection escape would 500 every page in the app instead.
 */
async function refreshSession(refreshToken: string): Promise<RefreshedSession | null> {
  try {
    const apiResponse = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { Cookie: `refresh_token=${encodeURIComponent(refreshToken)}` },
    });
    if (!apiResponse.ok) {
      return null;
    }
    const body: unknown = await apiResponse.json();
    // Shape-checked rather than trusted: everything downstream reads
    // `accessToken` as a JWT, and writing a non-string into that cookie would
    // fail later, further away, as something that looks unrelated.
    if (
      typeof body !== 'object' ||
      body === null ||
      typeof (body as RefreshedSession).accessToken !== 'string' ||
      typeof (body as RefreshedSession).refreshToken !== 'string'
    ) {
      return null;
    }
    return body as RefreshedSession;
  } catch {
    return null;
  }
}

function applySession(response: NextResponse, session: RefreshedSession): NextResponse {
  response.cookies.set('access_token', session.accessToken, {
    ...COOKIE_BASE,
    httpOnly: true,
    maxAge: ACCESS_TOKEN_MAX_AGE,
  });
  // Rotated on every refresh (AuthService.refresh: "a leaked one stops being
  // usable as soon as the legitimate holder refreshes") — write back the NEW
  // value, never the one this request arrived with.
  response.cookies.set('refresh_token', session.refreshToken, {
    ...COOKIE_BASE,
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
      // Readable by client JS on purpose — display data (the name in the
      // header), never an authorisation input.
      { ...COOKIE_BASE, httpOnly: false, maxAge: ACCESS_TOKEN_MAX_AGE },
    );
  }
  return response;
}

/**
 * Expired, revoked, or the account is gone — nothing short of a real login
 * recovers from this. The stale cookies go rather than being left to fail the
 * same way on the next navigation, which is what would otherwise turn one
 * dead refresh token into a pointless API round-trip on every request.
 */
function clearSession(response: NextResponse): NextResponse {
  response.cookies.delete('access_token');
  response.cookies.delete('refresh_token');
  response.cookies.delete('account');
  return response;
}

/**
 * Where this visitor is allowed to be, given the role in their token.
 *
 * Role-based redirection here is a UX convenience only — it decides which
 * dashboard to send someone to, never whether they are allowed to see data.
 * The backend's JwtAuthGuard/RolesGuard is the real enforcement on every
 * actual API call. If the role cannot be decoded (a malformed token) we
 * deliberately do not block: that token will simply 401 against the API, and
 * the page-level error states already handle it.
 */
function routeByRole(request: NextRequest, accessToken: string): NextResponse {
  const { pathname } = request.nextUrl;

  const role = decodeAccessTokenRole(accessToken);
  if (!role) {
    return NextResponse.next();
  }

  const ownArea = areaForRole(role);
  const homeHref = homeForRole(role);

  // There's no page at "/" — send a logged-in visitor straight to their
  // dashboard instead of a 404.
  if (pathname === '/') {
    return NextResponse.redirect(new URL(homeHref, request.url));
  }

  // A role with no area gets the page that explains that, and is kept out of
  // every real area. Previously such a role was lumped in with admins and
  // landed somewhere that 403'd on every request without saying why.
  if (!ownArea) {
    if (pathname === UNASSIGNED_ROLE_PATH) {
      return NextResponse.next();
    }
    return NextResponse.redirect(new URL(UNASSIGNED_ROLE_PATH, request.url));
  }

  // Someone with a real area has no reason to sit on the unassigned page.
  if (pathname === UNASSIGNED_ROLE_PATH) {
    return NextResponse.redirect(new URL(homeHref, request.url));
  }

  // One rule for every area instead of a branch per area: adding a fourth
  // area means adding it to ROLE_AREAS, not editing this.
  for (const area of ALL_AREAS) {
    if (isUnderSegment(pathname, area) && area !== ownArea) {
      return NextResponse.redirect(new URL(homeHref, request.url));
    }
  }

  return NextResponse.next();
}

/**
 * `access_token` is set with maxAge 15m, so after 15 minutes the BROWSER has
 * already deleted it — and every navigation from then on used to arrive here
 * with no token and get redirected to /login, while the `refresh_token`
 * cookie sat right there, valid for another 7 days. That is the "user thoát
 * web giữa chừng" report.
 *
 * lib/api-client.ts's 401-retry covers the XHR half of the same problem. Only
 * middleware ever sees a document request, so only middleware can cover this
 * half — the two are not redundant.
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!isProtectedPath(pathname)) {
    return NextResponse.next();
  }

  const accessToken = request.cookies.get('access_token')?.value;
  if (accessToken) {
    return routeByRole(request, accessToken);
  }

  const refreshToken = request.cookies.get('refresh_token')?.value;
  const session = refreshToken ? await refreshSession(refreshToken) : null;
  if (!session) {
    return clearSession(NextResponse.redirect(new URL('/login', request.url)));
  }

  // Routed on the REFRESHED token, not treated as "no role known": the claim
  // that decides which area this visitor belongs in lives inside it.
  return applySession(routeByRole(request, session.accessToken), session);
}

export const config = {
  matcher: ['/((?!_next|api|favicon.ico).*)'],
};
