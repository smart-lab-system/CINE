const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export type RosterStudentPreview = {
  studentCode: string;
  fullName: string;
};

export type RosterImportPreview = {
  storedObjectId: string;
  originalFilename: string;
  sectionCodeFromFile: string | null;
  sectionCodeMismatch: boolean;
  students: RosterStudentPreview[];
};

export type ApplyRosterImportResult = {
  fileId: string;
  createdStudents: number;
  updatedStudents: number;
  enrolled: number;
  unenrolled: number;
};

export type CourseSectionFile = {
  id: string;
  storedObjectId: string;
  originalFilename: string;
  sizeBytes: number;
  contentType: string | null;
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

export async function previewRosterImport(
  sectionId: string,
  file: File,
): Promise<RosterImportPreview> {
  const body = new FormData();
  body.append('file', file);
  const response = await fetch(
    `${API_BASE}/course-sections/${sectionId}/roster-imports`,
    { method: 'POST', credentials: 'include', body },
  );
  if (!response.ok) {
    throw new Error(
      await readApiError(response, 'Không tải được file danh sách'),
    );
  }
  return response.json() as Promise<RosterImportPreview>;
}

export async function applyRosterImport(
  sectionId: string,
  storedObjectId: string,
  confirmSectionMismatch: boolean,
): Promise<ApplyRosterImportResult> {
  const response = await fetch(
    `${API_BASE}/course-sections/${sectionId}/roster-imports/${storedObjectId}/apply`,
    {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmSectionMismatch }),
    },
  );
  if (!response.ok) {
    throw new Error(
      await readApiError(response, 'Không áp dụng được danh sách'),
    );
  }
  return response.json() as Promise<ApplyRosterImportResult>;
}

export async function listCourseSectionFiles(
  sectionId: string,
): Promise<{ items: CourseSectionFile[]; total: number }> {
  const response = await fetch(
    `${API_BASE}/course-sections/${sectionId}/files`,
    { credentials: 'include' },
  );
  if (!response.ok) {
    throw new Error(
      await readApiError(response, 'Không tải được file đính kèm'),
    );
  }
  return response.json() as Promise<{ items: CourseSectionFile[]; total: number }>;
}

export async function downloadCourseSectionFile(
  sectionId: string,
  file: CourseSectionFile,
): Promise<void> {
  const response = await fetch(
    `${API_BASE}/course-sections/${sectionId}/files/${file.id}/content`,
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
