import { NextRequest, NextResponse } from 'next/server';
import { setSessionCookies } from '@/lib/auth-cookies';

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

  // Options live in lib/auth-cookies.ts, shared with refresh/route.ts and
  // middleware.ts. The `account` cookie is deliberately NOT httpOnly and is
  // used for no auth decision whatsoever (middleware decodes the real
  // access_token JWT for that, see lib/jwt.ts) — it only lets client
  // components (AppShell's Topbar) show who is logged in without a fetch.
  return setSessionCookies(NextResponse.json({ account }), {
    accessToken,
    refreshToken,
    account,
  });
}
