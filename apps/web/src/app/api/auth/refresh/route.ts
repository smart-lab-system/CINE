import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

/**
 * Exchanges the still-valid `refresh_token` cookie for a fresh access/
 * refresh pair, and sets both as new httpOnly cookies — the browser-side
 * half of `apiClient`'s 401-retry middleware (see lib/api-client.ts).
 *
 * A Route Handler, not a direct client call to the Nest API, for the same
 * reason `login/route.ts` is: `POST /auth/refresh` returns the new tokens
 * as a plain JSON body, and only server-side code can turn that into
 * httpOnly `Set-Cookie` headers — client JS is deliberately unable to
 * read or set an httpOnly cookie itself.
 */
export async function POST(request: NextRequest) {
  const refreshToken = request.cookies.get('refresh_token')?.value;
  if (!refreshToken) {
    return NextResponse.json({ message: 'No refresh token' }, { status: 401 });
  }

  const apiResponse = await fetch(`${API_URL}/auth/refresh`, {
    method: 'POST',
    // Server-to-server: unlike a browser request, this fetch does not
    // automatically forward the INCOMING request's cookies, so the
    // refresh_token has to be passed on explicitly. Nest's controller
    // reads it off `req.cookies?.refresh_token` (same place JwtStrategy
    // reads `access_token`). encodeURIComponent'd — this value is
    // whatever the browser sent, not yet validated by anything at the
    // point it's interpolated into a header, and cookie-parser (wired in
    // main.ts) decodes it transparently on the way back out.
    headers: { Cookie: `refresh_token=${encodeURIComponent(refreshToken)}` },
  });

  if (!apiResponse.ok) {
    // Expired, tampered with, or the account no longer exists — nothing
    // short of a real login recovers from this, so the stale cookies are
    // cleared rather than left around to fail the same way again on the
    // next silent refresh attempt.
    const response = NextResponse.json({ message: 'Invalid refresh token' }, { status: 401 });
    response.cookies.delete('access_token');
    response.cookies.delete('refresh_token');
    response.cookies.delete('account');
    return response;
  }

  const { accessToken, refreshToken: nextRefreshToken, account } = await apiResponse.json();

  const response = NextResponse.json({ account });
  // Mirrors login/route.ts's cookie options exactly — a token minted here
  // must expire on the same schedule as one minted at login, and be
  // exactly as reachable (secure, sameSite, path) or a session refreshed
  // here could silently behave differently from one that started at
  // login.
  response.cookies.set('access_token', accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 15,
  });
  // Rotated on every refresh (AuthService.refresh's own doc comment: "a
  // leaked one stops being usable as soon as the legitimate holder
  // refreshes") — the new value, not the one this request came in with.
  response.cookies.set('refresh_token', nextRefreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  });
  response.cookies.set(
    'account',
    JSON.stringify({ name: account.name, email: account.email, role: account.role }),
    {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 15,
    },
  );

  return response;
}
