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
  // `accessToken` ĐI RA BODY, ngoài việc vẫn được set thành cookie httpOnly.
  //
  // Cookie vẫn cần: middleware.ts giải mã nó để định tuyến theo vai trò, và
  // /api/auth/token đọc nó để khôi phục phiên sau khi F5.
  //
  // Body cũng cần: trình duyệt gọi thẳng API ở domain khác, nơi cookie của
  // origin này không bao giờ tới được. Client giữ giá trị này trong bộ nhớ
  // (lib/auth-token.ts) và đính vào header Authorization.
  return setSessionCookies(NextResponse.json({ account, accessToken }), {
    accessToken,
    refreshToken,
    account,
  });
}
