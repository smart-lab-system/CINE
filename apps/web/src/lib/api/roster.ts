import { apiClient } from '@/lib/api-client';

/** One student on a class list — the shape both directions speak. */
export interface RosterEntry {
  mssv: string;
  name: string;
}

/** The server's own account of what an import did. */
export interface RosterImportResult {
  added: number;
  updated: number;
  unchanged: number;
  removed: number;
  missing: RosterEntry[];
}

async function throwIfFailed(error: unknown, response: Response) {
  if (error || !response.ok) {
    // openapi-fetch only fills `error` from the body, and some failures
    // leave it empty — key off the status too. The message matters more here
    // than elsewhere: a 409 names the students who are in another class, and
    // that text is the only way the user learns which ones.
    const body = error as { message?: string | string[] } | undefined;
    const message = Array.isArray(body?.message)
      ? body!.message.join('; ')
      : body?.message;
    throw new Error(message ?? `Yêu cầu thất bại (HTTP ${response.status})`);
  }
}

export async function listRoster(classId: string): Promise<RosterEntry[]> {
  const { data, error, response } = await apiClient.GET('/classes/{id}/roster', {
    params: { path: { id: classId } },
  });
  await throwIfFailed(error, response);
  return data as unknown as RosterEntry[];
}

/**
 * Posts the parsed rows as JSON. The .xlsx itself never leaves the browser
 * (Security rule 5), and the server recomputes the diff rather than trusting
 * whatever the preview said a few minutes ago.
 */
export async function importRoster(
  classId: string,
  body: { students: RosterEntry[]; removeMissing: boolean },
): Promise<RosterImportResult> {
  const { data, error, response } = await apiClient.POST('/classes/{id}/roster', {
    params: { path: { id: classId } },
    body,
  });
  await throwIfFailed(error, response);
  return data as unknown as RosterImportResult;
}
