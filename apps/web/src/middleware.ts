import { NextRequest, NextResponse } from 'next/server';
import { decodeAccessTokenRole } from '@/lib/jwt';
import {
  ALL_AREAS,
  UNASSIGNED_ROLE_PATH,
  areaForRole,
  homeForRole,
} from '@/lib/role-areas';

const PUBLIC_PATHS = ['/login'];

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

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!isProtectedPath(pathname)) {
    return NextResponse.next();
  }

  const accessToken = request.cookies.get('access_token');
  if (!accessToken) {
    const loginUrl = new URL('/login', request.url);
    return NextResponse.redirect(loginUrl);
  }

  // Role-based redirect below is a UX convenience only — it decides which
  // dashboard to send someone to, never whether they're allowed to see
  // data. The backend's JwtAuthGuard/RolesGuard is the real enforcement on
  // every actual API call. If the role can't be decoded (e.g. a
  // malformed/expired token) we deliberately don't block here — that token
  // will simply 401 against the API, and the page-level error states
  // already handle it.
  const role = decodeAccessTokenRole(accessToken.value);
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

export const config = {
  matcher: ['/((?!_next|api|favicon.ico).*)'],
};
