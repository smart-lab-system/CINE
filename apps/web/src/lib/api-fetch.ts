'use client';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

/** Untyped fetch for endpoints not yet in the generated OpenAPI client. */
export async function apiFetchJson<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body != null && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers,
  });
  if (!response.ok) {
    throw new Error(await apiErrorMessage(response));
  }
  if (response.status === 204) {
    return undefined as T;
  }
  const text = await response.text();
  if (!text) {
    return undefined as T;
  }
  return JSON.parse(text) as T;
}

async function apiErrorMessage(response: Response): Promise<string> {
  const fallback = `Yêu cầu thất bại (HTTP ${response.status})`;
  try {
    const text = await response.text();
    if (!text) return fallback;
    const body = JSON.parse(text) as { message?: string | string[] };
    if (typeof body.message === 'string' && body.message.trim()) {
      return body.message;
    }
    if (Array.isArray(body.message) && body.message.length) {
      return body.message.join(', ');
    }
  } catch {
    return fallback;
  }
  return fallback;
}
