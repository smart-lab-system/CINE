import { NextRequest, NextResponse } from 'next/server';
import { decodeAccessTokenRole } from '@/lib/jwt';

const PUBLIC_PATHS = ['/login'];

// Every role that may enter /admin/*. Mirrors AccountEntity.AccountRole's
// admin-family values (see apps/api/src/identity/entities/account.entity.ts)
// — super_admin/department_admin have no tiering logic yet, but they are
// still admin-area accounts, not teachers.
const ADMIN_ROLES = new Set(['admin', 'super_admin', 'department_admin']);

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
  // data. The backend's JwtAuthGuard/RolesGuard (unchanged) is the real
  // enforcement on every actual API call. If the role can't be decoded
  // (e.g. a malformed/expired token) we deliberately don't block here —
  // that token will simply 401 against the API, same as before this
  // middleware existed, and the page-level error states already handle it.
  const role = decodeAccessTokenRole(accessToken.value);
  const isAdminRole = role !== null && ADMIN_ROLES.has(role);
  const homeHref = isAdminRole ? '/admin/dashboard' : '/teacher/dashboard';

  // There's no page at "/" — send a logged-in visitor straight to their
  // dashboard instead of a 404. Only applies with a decodable role; an
  // undecodable token falls through to isProtectedPath's normal handling
  // below (untouched, not a 404 risk since "/" isn't a real route either
  // way).
  if (pathname === '/' && role) {
    return NextResponse.redirect(new URL(homeHref, request.url));
  }

  if (role) {
    if (isUnderSegment(pathname, '/admin') && !isAdminRole) {
      return NextResponse.redirect(new URL(homeHref, request.url));
    }
    if (isUnderSegment(pathname, '/teacher') && isAdminRole) {
      return NextResponse.redirect(new URL(homeHref, request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next|api|favicon.ico).*)'],
};
