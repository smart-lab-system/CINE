import { apiClient } from '@/lib/api-client';

/** Mirrors ExamMaterialView (apps/api/src/exam-session/exam-material.service.ts). */
export interface ExamMaterial {
  id: string;
  fileName: string;
  fileSize: number;
  uploadedAt: string;
  downloadUrl?: string;
}

function fail(error: unknown, response: Response): Error {
  const body = error as { message?: string | string[] } | undefined;
  const message = Array.isArray(body?.message) ? body!.message.join('; ') : body?.message;
  return new Error(message ?? `Yêu cầu thất bại (HTTP ${response.status})`);
}

export async function listExamMaterials(examSessionId: string): Promise<ExamMaterial[]> {
  const { data, error, response } = await apiClient.GET('/exam-sessions/{id}/materials', {
    params: { path: { id: examSessionId } },
  });
  if (error || !response.ok) throw fail(error, response);
  return data as unknown as ExamMaterial[];
}

/**
 * Mint a URL, PUT the bytes straight to storage, then tell the API it
 * landed. The file never passes through the NestJS server — CLAUDE.md
 * Security rule 5, the same path a submission takes.
 *
 * The confirm step is what creates the row, so a failed PUT leaves nothing
 * behind claiming a question paper exists.
 */
export async function uploadExamMaterial(
  examSessionId: string,
  file: File,
): Promise<ExamMaterial> {
  const minted = await apiClient.POST('/exam-sessions/{id}/materials/upload-url', {
    params: { path: { id: examSessionId } },
    body: { fileName: file.name, fileSize: file.size },
  });
  if (minted.error || !minted.response.ok) throw fail(minted.error, minted.response);
  const { examMaterialId, storageKey, uploadUrl } = minted.data as unknown as {
    examMaterialId: string;
    storageKey: string;
    uploadUrl: string;
  };

  const put = await fetch(uploadUrl, {
    method: 'PUT',
    body: file,
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
  });
  if (!put.ok) {
    throw new Error(`Không tải được file lên kho lưu trữ (HTTP ${put.status}).`);
  }

  const created = await apiClient.POST('/exam-sessions/{id}/materials', {
    params: { path: { id: examSessionId } },
    body: { examMaterialId, storageKey, fileName: file.name, fileSize: file.size },
  });
  if (created.error || !created.response.ok) throw fail(created.error, created.response);
  return created.data as unknown as ExamMaterial;
}

export async function deleteExamMaterial(
  examSessionId: string,
  materialId: string,
): Promise<void> {
  const { error, response } = await apiClient.DELETE(
    '/exam-sessions/{id}/materials/{materialId}',
    { params: { path: { id: examSessionId, materialId } } },
  );
  if (error || !response.ok) throw fail(error, response);
}
