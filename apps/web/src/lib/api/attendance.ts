import { apiClient } from '@/lib/api-client';

/**
 * Mirrors AttendanceView (apps/api/src/agent-connection/attendance.types.ts).
 *
 * Everything here is derived server-side from `agent_connection_event`, which
 * is why this page can be refreshed mid-exam without losing the room.
 */
export interface AttendanceStudent {
  mssv: string;
  name: string;
  connected: boolean;
  joinedLate: boolean;
  firstSeenAt: string | null;
  lastEventAt: string | null;
  /** Only on make-up students — the class they actually belong to. */
  homeClassName?: string;
  /**
   * `returned` — a machine that crashed and came back, routine.
   * `new` — someone who appeared after the count, which is the case the
   * count exists to catch. Two labels on purpose.
   */
  afterHeadcount: 'returned' | 'new' | null;
}

export interface AttendanceDiscrepancy {
  confirmedCount: number;
  submittedCount: number;
  unaccounted: AttendanceStudent[];
}

export interface Attendance {
  classId: string | null;
  className: string | null;
  rosterSize: number;
  confirmedAt: string | null;
  confirmedCount: number | null;
  present: AttendanceStudent[];
  absent: AttendanceStudent[];
  makeup: AttendanceStudent[];
  discrepancy: AttendanceDiscrepancy | null;
}

function fail(error: unknown, response: Response): Error {
  const body = error as { message?: string | string[] } | undefined;
  const message = Array.isArray(body?.message) ? body!.message.join('; ') : body?.message;
  return new Error(message ?? `Yêu cầu thất bại (HTTP ${response.status})`);
}

export async function getAttendance(examSessionId: string): Promise<Attendance> {
  const { data, error, response } = await apiClient.GET('/exam-sessions/{id}/attendance', {
    params: { path: { id: examSessionId } },
  });
  if (error || !response.ok) throw fail(error, response);
  return data as unknown as Attendance;
}

export async function confirmAttendance(
  examSessionId: string,
): Promise<{ confirmedAt: string; confirmedCount: number }> {
  const { data, error, response } = await apiClient.POST(
    '/exam-sessions/{id}/attendance/confirm',
    { params: { path: { id: examSessionId } } },
  );
  if (error || !response.ok) throw fail(error, response);
  return data as unknown as { confirmedAt: string; confirmedCount: number };
}
