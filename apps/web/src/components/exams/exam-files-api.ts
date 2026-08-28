import type { ExamEventFile, ExamFileRole } from '@/components/exams/exam-types';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

async function readApiError(response: Response, fallback: string) {
  const body = (await response.json().catch(() => null)) as
    | { message?: unknown }
    | null;
  if (typeof body?.message === 'string' && body.message.trim()) {
    return body.message;
  }
  if (Array.isArray(body?.message) && body.message.length) {
    return body.message.filter((part) => typeof part === 'string').join(', ');
  }
  return `${fallback} (HTTP ${response.status})`;
}

export async function uploadExamFile(
  eventId: string,
  file: File,
  input: { fileRole: ExamFileRole; title?: string; sortOrder?: number },
): Promise<{ id: string }> {
  const body = new FormData();
  body.append('file', file);
  body.append('fileRole', input.fileRole);
  if (input.title?.trim()) {
    body.append('title', input.title.trim());
  }
  if (input.sortOrder !== undefined) {
    body.append('sortOrder', String(input.sortOrder));
  }

  const response = await fetch(
    `${API_BASE}/exam-events/${eventId}/files/upload`,
    {
      method: 'POST',
      credentials: 'include',
      body,
    },
  );
  if (!response.ok) {
    throw new Error(await readApiError(response, 'Không đính kèm được tài liệu'));
  }
  return response.json() as Promise<{ id: string }>;
}

export async function downloadExamFile(
  eventId: string,
  file: ExamEventFile,
): Promise<void> {
  const response = await fetch(
    `${API_BASE}/exam-events/${eventId}/files/${file.id}/content`,
    { credentials: 'include' },
  );
  if (!response.ok) {
    throw new Error(await readApiError(response, 'Không tải được file'));
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.originalFilename;
  link.click();
  URL.revokeObjectURL(url);
}
