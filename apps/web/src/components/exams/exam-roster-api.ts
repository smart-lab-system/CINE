const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export type ExamRosterStudentPreview = {
  studentCode: string;
  fullName: string;
};

export type ExamRosterImportPreview = {
  storedObjectId: string;
  originalFilename: string;
  sectionCodeFromFile: string | null;
  attachedSectionCodes: string[];
  matchedCourseSectionId: string | null;
  sectionCodeMismatch: boolean;
  students: ExamRosterStudentPreview[];
};

export type ApplyExamRosterImportResult = {
  fileId: string;
  courseSectionId: string;
  createdStudents: number;
  updatedStudents: number;
  allowed: number;
  removed: number;
};

export type ExamRosterFile = {
  id: string;
  courseSectionId: string;
  sectionCode: string;
  storedObjectId: string;
  originalFilename: string;
  sizeBytes: number;
  contentType: string | null;
  allowedCount: number;
  createdAt: string;
};

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

export async function previewExamRosterImport(
  eventId: string,
  file: File,
): Promise<ExamRosterImportPreview> {
  const body = new FormData();
  body.append('file', file);
  const response = await fetch(`${API_BASE}/exam-events/${eventId}/roster-imports`, {
    method: 'POST',
    credentials: 'include',
    body,
  });
  if (!response.ok) {
    throw new Error(
      await readApiError(response, 'Không tải được file danh sách dự thi'),
    );
  }
  return response.json() as Promise<ExamRosterImportPreview>;
}

export async function applyExamRosterImport(
  eventId: string,
  storedObjectId: string,
  confirmSectionMismatch: boolean,
): Promise<ApplyExamRosterImportResult> {
  const response = await fetch(
    `${API_BASE}/exam-events/${eventId}/roster-imports/${storedObjectId}/apply`,
    {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmSectionMismatch }),
    },
  );
  if (!response.ok) {
    throw new Error(
      await readApiError(response, 'Không áp dụng được danh sách dự thi'),
    );
  }
  return response.json() as Promise<ApplyExamRosterImportResult>;
}

export async function listExamRosterFiles(
  eventId: string,
): Promise<{ items: ExamRosterFile[]; total: number }> {
  const response = await fetch(`${API_BASE}/exam-events/${eventId}/roster-files`, {
    credentials: 'include',
  });
  if (!response.ok) {
    throw new Error(
      await readApiError(response, 'Không tải được file đính kèm'),
    );
  }
  return response.json() as Promise<{ items: ExamRosterFile[]; total: number }>;
}

export async function downloadExamRosterFile(
  eventId: string,
  file: ExamRosterFile,
): Promise<void> {
  const response = await fetch(
    `${API_BASE}/exam-events/${eventId}/roster-files/${file.id}/content`,
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
