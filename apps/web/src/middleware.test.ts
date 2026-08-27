import { describe, expect, it } from 'vitest';
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

function makeRequest(pathname: string, accessToken?: string) {
  const url = `http://localhost:3000${pathname}`;
  const cookies = new Map<string, { value: string }>();
  if (accessToken) cookies.set('access_token', { value: accessToken });

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
  it('redirects to /login when there is no access_token', () => {
    const response = middleware(makeRequest('/admin/dashboard'));
    expect(response.status).toBe(307);
    expect(new URL(response.headers.get('location')!).pathname).toBe('/login');
  });

  it('redirects a teacher away from /admin/*', () => {
    const response = middleware(
      makeRequest('/admin/accounts', fakeToken({ role: 'teacher' })),
    );
    expect(new URL(response.headers.get('location')!).pathname).toBe('/teacher/dashboard');
  });

  it('redirects an admin away from /teacher/*', () => {
    const response = middleware(
      makeRequest('/teacher/exam-sessions', fakeToken({ role: 'admin' })),
    );
    expect(new URL(response.headers.get('location')!).pathname).toBe('/admin/dashboard');
  });

  it('lets a teacher through to /teacher/*', () => {
    const response = middleware(
      makeRequest('/teacher/dashboard', fakeToken({ role: 'teacher' })),
    );
    expect(response.status).not.toBe(307);
  });

  it('lets an admin through to /admin/*', () => {
    const response = middleware(
      makeRequest('/admin/dashboard', fakeToken({ role: 'admin' })),
    );
    expect(response.status).not.toBe(307);
  });

  it('does not block on an undecodable token (falls through to the API, which will 401)', () => {
    const response = middleware(makeRequest('/admin/dashboard', 'not-a-jwt'));
    expect(response.status).not.toBe(307);
  });
});
