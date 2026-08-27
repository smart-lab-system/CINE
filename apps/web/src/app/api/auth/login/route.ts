import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

export async function POST(request: NextRequest) {
  const body = await request.json();

  const apiResponse = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!apiResponse.ok) {
    const error = await apiResponse.json().catch(() => ({}));
    return NextResponse.json(error, { status: apiResponse.status });
  }

  const { accessToken, refreshToken, account } = await apiResponse.json();

  const response = NextResponse.json({ account });
  response.cookies.set('access_token', accessToken, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 15,
  });
  response.cookies.set('refresh_token', refreshToken, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  });
  // Deliberately NOT httpOnly and NOT used for any auth/authorization
  // decision (middleware decodes the real access_token JWT for that, see
  // lib/jwt.ts) — this only lets client components (AppShell's Topbar)
  // display "who's logged in" without an extra fetch roundtrip. Same
  // 15-minute lifetime as access_token so it doesn't outlive the session it
  // describes.
  response.cookies.set(
    'account',
    JSON.stringify({ name: account.name, email: account.email, role: account.role }),
    { httpOnly: false, sameSite: 'lax', path: '/', maxAge: 60 * 15 },
  );

  return response;
}
