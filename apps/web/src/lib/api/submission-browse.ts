import { apiClient } from '@/lib/api-client';

export type ExtractTreeNode =
  | { name: string; type: 'file'; size: number }
  | { name: string; type: 'dir'; children: ExtractTreeNode[] };

export interface ExtractTreeDocument {
  root: ExtractTreeNode[];
}

export interface SubmissionBrowseView {
  status: 'none' | 'pending' | 'extracting' | 'ready' | 'failed';
  entryCount: number | null;
  error: string | null;
  fileName: string | null;
  tree: ExtractTreeDocument | null;
}

export interface SubmissionBrowseFileView {
  downloadUrl: string;
  expiresIn: number;
  path: string;
  size: number | null;
}

export interface SubmissionExtractStatusView {
  status: SubmissionBrowseView['status'];
  entryCount: number | null;
  error: string | null;
}

function fail(error: unknown, response: Response): Error {
  const body = error as { message?: string | string[] } | undefined;
  const message = Array.isArray(body?.message) ? body!.message.join('; ') : body?.message;
  return new Error(message ?? `Yêu cầu thất bại (HTTP ${response.status})`);
}

export async function getSubmissionBrowse(resultId: string): Promise<SubmissionBrowseView> {
  const { data, error, response } = await apiClient.GET('/grading-results/{id}/browse', {
    params: { path: { id: resultId } },
  });
  if (error || !response.ok) throw fail(error, response);
  return data as unknown as SubmissionBrowseView;
}

export async function getSubmissionBrowseFile(
  resultId: string,
  path: string,
): Promise<SubmissionBrowseFileView> {
  const { data, error, response } = await apiClient.GET('/grading-results/{id}/browse/file', {
    params: { path: { id: resultId }, query: { path } },
  });
  if (error || !response.ok) throw fail(error, response);
  return data as unknown as SubmissionBrowseFileView;
}

export async function requestSubmissionExtract(
  resultId: string,
): Promise<SubmissionExtractStatusView> {
  const { data, error, response } = await apiClient.POST('/grading-results/{id}/extract', {
    params: { path: { id: resultId } },
  });
  if (error || !response.ok) throw fail(error, response);
  return data as unknown as SubmissionExtractStatusView;
}
