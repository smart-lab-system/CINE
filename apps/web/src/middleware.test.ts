import { afterEach, describe, expect, it, vi } from 'vitest';
import { isProtectedPath, middleware } from './middleware';

describe('isProtectedPath', () => {
  it('protects admin/teacher routes', () => {
    expect(isProtectedPath('/admin/accounts')).toBe(true);
    expect(isProtectedPath('/teacher/exam-sessions')).toBe(true);
  });

  it('does not protect the login route', () => {
    expect(isProtectedPath('/login')).toBe(false);
  });
});

function makeRequest(pathname: string, accessToken?: string, refreshToken?: string) {
  const url = `http://localhost:3000${pathname}`;
  const cookies = new Map<string, { value: string }>();
  if (accessToken) cookies.set('access_token', { value: accessToken });
  if (refreshToken) cookies.set('refresh_token', { value: refreshToken });

  return {
    nextUrl: new URL(url),
    url,
    cookies: { get: (name: string) => cookies.get(name) },
  } as unknown as Parameters<typeof middleware>[0];
}

// A JWT is header.payload.signature — only the payload needs to be real
// base64url JSON for decodeAccessTokenRole; header/signature can be
// anything since they're never read.
function fakeToken(payload: Record<string, unknown>): string {
  const base64url = (input: string) =>
    Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${base64url('{}')}.${base64url(JSON.stringify(payload))}.sig`;
}

describe('middleware', () => {
  it('redirects to /login when there is no access_token', async () => {
    const response = await middleware(makeRequest('/admin/dashboard'));
    expect(response.status).toBe(307);
    expect(new URL(response.headers.get('location')!).pathname).toBe('/login');
  });

  it('redirects a teacher away from /admin/*', async () => {
    const response = await middleware(
      makeRequest('/admin/accounts', fakeToken({ role: 'teacher' })),
    );
    expect(new URL(response.headers.get('location')!).pathname).toBe('/teacher/dashboard');
  });

  it('redirects an admin away from /teacher/*', async () => {
    const response = await middleware(
      makeRequest('/teacher/exam-sessions', fakeToken({ role: 'admin' })),
    );
    expect(new URL(response.headers.get('location')!).pathname).toBe('/admin/dashboard');
  });

  it('lets a teacher through to /teacher/*', async () => {
    const response = await middleware(
      makeRequest('/teacher/dashboard', fakeToken({ role: 'teacher' })),
    );
    expect(response.status).not.toBe(307);
  });

  it('lets an admin through to /admin/*', async () => {
    const response = await middleware(
      makeRequest('/admin/dashboard', fakeToken({ role: 'admin' })),
    );
    expect(response.status).not.toBe(307);
  });

  it('does not block on an undecodable token (falls through to the API, which will 401)', async () => {
    const response = await middleware(makeRequest('/admin/dashboard', 'not-a-jwt'));
    expect(response.status).not.toBe(307);
  });

  it('redirects "/" to the role-appropriate dashboard instead of 404ing', async () => {
    const response = await middleware(makeRequest('/', fakeToken({ role: 'teacher' })));
    expect(new URL(response.headers.get('location')!).pathname).toBe('/teacher/dashboard');
  });

  it('does not treat a same-prefix-but-different route as the admin area', async () => {
    // "/administrator" starts with "/admin" as a string, but is not under
    // the /admin/* segment — a plain startsWith('/admin') would wrongly
    // redirect a teacher away from it.
    const response = await middleware(
      makeRequest('/administrator', fakeToken({ role: 'teacher' })),
    );
    expect(response.status).not.toBe(307);
  });
  // HAI vai trò, hai khu vực. `department_admin` từng có khu vực riêng
  // (/department) và ba ca test ở đây ghim điều đó. Đợt thu hẹp master data
  // rút vai trò và xoá cả khu vực; ca duy nhất còn ý nghĩa là ca ngay dưới,
  // và nó BAO luôn trường hợp cũ: một token phát trước đợt này vẫn mang
  // `department_admin` cho tới khi hết hạn, và nó phải rơi về trang "chưa
  // được gán vai trò".
  it('sends a role with no area to the unassigned-role page', async () => {
    const response = await middleware(
      makeRequest('/admin/dashboard', fakeToken({ role: 'super_admin' })),
    );
    expect(response.status).toBe(307);
    expect(new URL(response.headers.get('location')!).pathname).toBe('/unassigned-role');
  });

  it('lets an unmapped role stay on the unassigned-role page', async () => {
    const response = await middleware(
      makeRequest('/unassigned-role', fakeToken({ role: 'super_admin' })),
    );
    expect(response.status).toBe(200);
  });

  it('keeps a mapped role off the unassigned-role page', async () => {
    const response = await middleware(
      makeRequest('/unassigned-role', fakeToken({ role: 'teacher' })),
    );
    expect(response.status).toBe(307);
    expect(new URL(response.headers.get('location')!).pathname).toBe('/teacher/dashboard');
  });
});


// H1 — the hole this suite exists for: `access_token` has maxAge 15m, so the
// BROWSER deletes it after 15 minutes. Every navigation after that arrived
// here with no access_token and was redirected to /login, even though the
// refresh_token cookie was still valid for another 7 days. Reported as
// "user thoát web giữa chừng". lib/api-client.ts's 401-retry middleware does
// not help: it only sees XHR, never a document request.
describe('middleware — silent refresh on an expired access_token', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const NEW_ACCESS = fakeToken({ role: 'teacher' });

  /** Stubs the Nest API's POST /auth/refresh with a rotated token pair. */
  function stubRefreshOk() {
    const spy = vi.fn(async () =>
      new Response(
        JSON.stringify({
          accessToken: NEW_ACCESS,
          refreshToken: 'rotated-refresh',
          account: { name: 'GV', email: 'gv@x.vn', role: 'teacher' },
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal('fetch', spy);
    return spy;
  }

  it('lets the request through instead of redirecting to /login', async () => {
    stubRefreshOk();
    const response = await middleware(
      makeRequest('/teacher/dashboard', undefined, 'still-valid'),
    );
    expect(response.status).not.toBe(307);
  });

  it('sets the freshly minted access_token on the response', async () => {
    stubRefreshOk();
    const response = await middleware(
      makeRequest('/teacher/dashboard', undefined, 'still-valid'),
    );
    expect(response.cookies.get('access_token')?.value).toBe(NEW_ACCESS);
  });

  // AuthService.refresh rotates on every use — writing back the token the
  // request came in with would hand the browser one the server has already
  // retired, and the NEXT refresh would fail.
  it('writes back the ROTATED refresh_token, not the incoming one', async () => {
    stubRefreshOk();
    const response = await middleware(
      makeRequest('/teacher/dashboard', undefined, 'still-valid'),
    );
    expect(response.cookies.get('refresh_token')?.value).toBe('rotated-refresh');
  });

  // The role routing below this point reads the token — after a refresh it
  // must read the NEW one, not fall through as though no role were known.
  it('routes by the role carried in the refreshed token', async () => {
    stubRefreshOk();
    const response = await middleware(
      makeRequest('/admin/accounts', undefined, 'still-valid'),
    );
    expect(response.status).toBe(307);
    expect(new URL(response.headers.get('location')!).pathname).toBe('/teacher/dashboard');
  });

  it('still carries the new cookies on a redirect response', async () => {
    stubRefreshOk();
    const response = await middleware(
      makeRequest('/admin/accounts', undefined, 'still-valid'),
    );
    expect(response.cookies.get('access_token')?.value).toBe(NEW_ACCESS);
  });

  it('redirects to /login when the refresh token is gone too', async () => {
    const spy = vi.fn();
    vi.stubGlobal('fetch', spy);
    const response = await middleware(makeRequest('/teacher/dashboard'));
    expect(response.status).toBe(307);
    expect(new URL(response.headers.get('location')!).pathname).toBe('/login');
    expect(spy).not.toHaveBeenCalled();
  });

  it('redirects to /login when the API rejects the refresh token', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 401 })));
    const response = await middleware(
      makeRequest('/teacher/dashboard', undefined, 'expired-or-revoked'),
    );
    expect(response.status).toBe(307);
    expect(new URL(response.headers.get('location')!).pathname).toBe('/login');
  });

  // Without this, dropping a `cookies.delete` from clearSessionCookies would
  // pass every other test in this file while leaving a dead refresh_token in
  // the browser — one wasted API round-trip per navigation, forever, for a
  // token that can never succeed again.
  it('clears the dead cookies rather than leaving them to fail again', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 401 })));
    const response = await middleware(
      makeRequest('/teacher/dashboard', undefined, 'expired-or-revoked'),
    );

    const setCookie = response.headers.getSetCookie().join('\n');
    for (const name of ['access_token', 'refresh_token', 'account']) {
      expect(setCookie).toContain(`${name}=;`);
    }
    // Next expires them at the epoch rather than with Max-Age=0; either way
    // the browser is told to drop the cookie immediately.
    expect(setCookie).toContain('Expires=Thu, 01 Jan 1970');
  });

  // A dead API must not strand the user in a redirect loop with cookies that
  // would have worked once it came back — but it must not hang either.
  it('redirects to /login when the refresh call throws', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNREFUSED'); }));
    const response = await middleware(
      makeRequest('/teacher/dashboard', undefined, 'still-valid'),
    );
    expect(response.status).toBe(307);
    expect(new URL(response.headers.get('location')!).pathname).toBe('/login');
  });

  it('never calls the API while the access_token is still there', async () => {
    const spy = vi.fn();
    vi.stubGlobal('fetch', spy);
    await middleware(makeRequest('/teacher/dashboard', fakeToken({ role: 'teacher' }), 'r'));
    expect(spy).not.toHaveBeenCalled();
  });
});
