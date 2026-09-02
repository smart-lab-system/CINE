import type { Attendance } from './api/attendance';
import type { SubmissionStatusItem } from './api/exam-session';

/**
 * Shared between the lobby page (live, one exam session) and the
 * per-session submissions detail page (post-hoc review, no socket) — both
 * render the same matrix from the same two sources, so the shape lives
 * here rather than inside either page's own component.
 */

export type DeliverableState = 'collected' | 'invalid' | 'pending';

export interface SubmissionRowStudent {
  studentMssv: string;
  /** Whatever the student typed into the agent; falls back to the MSSV. */
  fullName: string;
  /** Keyed by requiredDeliverableId. A missing key means "chưa nộp". */
  byDeliverable: Record<
    string,
    {
      state: DeliverableState;
      submittedAt?: string;
      downloadUrl?: string | null;
      fileSize?: string | null;
    }
  >;
}

export interface DeliverableColumn {
  id: string;
  requiredFilename: string;
}

/**
 * One row per student, from the union of who attended and who submitted
 * something — a student who joined but submitted nothing still needs a row
 * (all "Chưa nộp"), and a submission from someone with no attendance record
 * still needs one too.
 */
export function buildSubmissionRows(
  attendance: Attendance | undefined,
  submissions: SubmissionStatusItem[] | undefined,
): SubmissionRowStudent[] {
  const byMssv = new Map<string, SubmissionRowStudent>();

  const ensure = (mssv: string, fullName: string) => {
    const existing = byMssv.get(mssv);
    if (existing) {
      // A real name always beats the MSSV placeholder, whichever source
      // happened to be seen first.
      if (existing.fullName === mssv && fullName !== mssv) {
        existing.fullName = fullName;
      }
      return existing;
    }
    const created: SubmissionRowStudent = { studentMssv: mssv, fullName, byDeliverable: {} };
    byMssv.set(mssv, created);
    return created;
  };

  for (const student of [
    ...(attendance?.present ?? []),
    ...(attendance?.absent ?? []),
    ...(attendance?.makeup ?? []),
  ]) {
    ensure(student.mssv, student.name);
  }

  for (const item of submissions ?? []) {
    const row = ensure(item.studentMssv, item.studentNameInput || item.studentMssv);
    // Only the two terminal states are shown; `received`/`validated` exist
    // for milliseconds inside one server-side transaction and are not
    // something a teacher can act on.
    if (item.status === 'collected' || item.status === 'invalid') {
      row.byDeliverable[item.requiredDeliverableId] = {
        state: item.status,
        submittedAt: item.submittedAt,
        downloadUrl: item.downloadUrl,
        fileSize: item.fileSize,
      };
    }
  }

  return [...byMssv.values()].sort((a, b) => a.studentMssv.localeCompare(b.studentMssv));
}

/** How many students have every required deliverable marked "collected". */
export function countFullySubmitted(
  rows: SubmissionRowStudent[],
  deliverables: { id: string }[],
): number {
  if (deliverables.length === 0) {
    return 0;
  }
  return rows.filter((row) =>
    deliverables.every((d) => row.byDeliverable[d.id]?.state === 'collected'),
  ).length;
}
