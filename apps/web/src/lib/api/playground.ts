import { getAccessToken } from '@/lib/auth-token';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export type PlaygroundLanguage =
  | 'c'
  | 'cpp'
  | 'java'
  | 'python'
  | 'static'
  | 'spring-boot'
  | 'vite-react'
  | 'express';

export type PlaygroundRunStatus =
  | 'created'
  | 'needs_entry'
  | 'queued'
  | 'running'
  | 'finished'
  | 'failed';

export interface PlaygroundRun {
  id: string;
  language: PlaygroundLanguage;
  status: PlaygroundRunStatus;
  entryPath: string | null;
  entryDetection: string | null;
  candidates: string[] | null;
  filePaths: string[];
  console: {
    compileLog: string | null;
    stdout: string | null;
    stderr: string | null;
    exitCode: number | null;
  };
  previewUrl: string | null;
  expiresAt: string | null;
  error: string | null;
  createdAt: string;
  finishedAt: string | null;
}

export class PlaygroundHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'PlaygroundHttpError';
  }
}

async function playgroundFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getAccessToken();
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  if (!res.ok) {
    let message = `Yêu cầu thất bại (HTTP ${res.status})`;
    try {
      const body = (await res.json()) as { message?: string | string[] };
      if (typeof body.message === 'string') message = body.message;
      else if (Array.isArray(body.message)) message = body.message.join(', ');
    } catch {
      /* ignore */
    }
    throw new PlaygroundHttpError(message, res.status);
  }
  return (await res.json()) as T;
}

export function createPlaygroundRun(language: PlaygroundLanguage, source: string) {
  return playgroundFetch<PlaygroundRun>('/playground/runs', {
    method: 'POST',
    body: JSON.stringify({ language, source }),
  });
}

export async function uploadPlaygroundRun(language: PlaygroundLanguage, files: File[]) {
  const form = new FormData();
  form.set('language', language);
  for (const f of files) {
    const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
    // filename multipart thường bị browser cắt thành basename - gửi path riêng
    form.append('files', f, f.name);
    form.append('paths', rel.replace(/\\/g, '/'));
  }
  return playgroundFetch<PlaygroundRun>('/playground/runs/upload', {
    method: 'POST',
    body: form,
  });
}

export function createSampleStaticRun() {
  return playgroundFetch<PlaygroundRun>('/playground/runs/sample-static', { method: 'POST' });
}

export function createSampleSpringBootRun() {
  return playgroundFetch<PlaygroundRun>('/playground/runs/sample-spring-boot', { method: 'POST' });
}

export function createSampleViteReactRun() {
  return playgroundFetch<PlaygroundRun>('/playground/runs/sample-vite-react', { method: 'POST' });
}

export function createSampleExpressRun() {
  return playgroundFetch<PlaygroundRun>('/playground/runs/sample-express', { method: 'POST' });
}

export function getPlaygroundRun(id: string) {
  return playgroundFetch<PlaygroundRun>(`/playground/runs/${id}`);
}

export function executePlaygroundRun(id: string, entryPath?: string) {
  return playgroundFetch<PlaygroundRun>(`/playground/runs/${id}/execute`, {
    method: 'POST',
    body: JSON.stringify(entryPath ? { entryPath } : {}),
  });
}

export function stopPlaygroundRun(id: string) {
  return playgroundFetch<PlaygroundRun>(`/playground/runs/${id}/stop`, { method: 'POST' });
}
