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
  if (role) {
    const isAdminRole = ADMIN_ROLES.has(role);
    if (pathname.startsWith('/admin') && !isAdminRole) {
      return NextResponse.redirect(new URL('/teacher/dashboard', request.url));
    }
    if (pathname.startsWith('/teacher') && isAdminRole) {
      return NextResponse.redirect(new URL('/admin/dashboard', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next|api|favicon.ico).*)'],
};
