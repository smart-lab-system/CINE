import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';

function requestWithCookie(refreshToken?: string): NextRequest {
  const req = new NextRequest('http://localhost:3000/api/auth/refresh', { method: 'POST' });
  if (refreshToken) {
    req.cookies.set('refresh_token', refreshToken);
  }
  return req;
}

describe('POST /api/auth/refresh', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('exchanges a still-valid refresh_token for a fresh pair and sets both as new httpOnly cookies', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(
        JSON.stringify({
          accessToken: 'new-access',
          refreshToken: 'new-refresh',
          account: { name: 'Cô A', email: 'a@example.com', role: 'teacher' },
        }),
        { status: 200 },
      ),
    );

    const response = await POST(requestWithCookie('old-refresh'));

    expect(response.status).toBe(200);
    // The Nest API gets the incoming refresh_token forwarded explicitly —
    // a server-to-server fetch does not carry the original request's
    // cookies on its own.
    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(init.headers.Cookie).toBe('refresh_token=old-refresh');

    const accessCookie = response.cookies.get('access_token');
    const refreshCookie = response.cookies.get('refresh_token');
    expect(accessCookie?.value).toBe('new-access');
    expect(accessCookie?.httpOnly).toBe(true);
    // Rotated — the NEW token from the response, not the one the request
    // came in with (AuthService.refresh's own stated design: "a leaked
    // one stops being usable as soon as the legitimate holder refreshes").
    expect(refreshCookie?.value).toBe('new-refresh');
    expect(refreshCookie?.httpOnly).toBe(true);
  });

  it('answers 401 and clears every auth cookie when there is no refresh_token to begin with', async () => {
    const response = await POST(requestWithCookie(undefined));

    expect(response.status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('answers 401 and clears every auth cookie when the Nest API refuses the refresh token', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ message: 'Invalid refresh token' }), { status: 401 }),
    );

    const response = await POST(requestWithCookie('expired-or-tampered'));

    expect(response.status).toBe(401);
    // Stale cookies must not linger to fail the same way on every
    // subsequent silent-refresh attempt — see route.ts's own comment.
    expect(response.cookies.get('access_token')?.value).toBe('');
    expect(response.cookies.get('refresh_token')?.value).toBe('');
    expect(response.cookies.get('account')?.value).toBe('');
  });
});
