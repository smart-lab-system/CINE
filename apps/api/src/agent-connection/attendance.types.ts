/**
 * One student as the lobby needs to read them.
 *
 * Every field here is derived from `agent_connection_event` plus the roster
 * — nothing about presence is stored twice, so the answer can never
 * disagree with the log it came from.
 */
export interface AttendanceStudentView {
  mssv: string;
  name: string;
  /** From the latest event: connect-ish means here, `disconnected` means not. */
  connected: boolean;
  /** Set on the join itself, from `now > start_time`. Automatic, never approved. */
  joinedLate: boolean;
  /** Null for a roster student who has never connected at all. */
  firstSeenAt: string | null;
  lastEventAt: string | null;
  /** Only on make-up students — the class they actually belong to. */
  homeClassName?: string;
  /**
   * How they arrived relative to the headcount, or null if there is no
   * headcount yet / they were already here for it.
   *
   * `returned` — has an earlier connect event: a machine that crashed and
   * came back, expected, no action. `new` — no earlier event at all:
   * someone who appeared AFTER the count, which is the case the count
   * exists to catch. Collapsing these into one label would bury the second
   * underneath the first.
   */
  afterHeadcount: 'returned' | 'new' | null;
}

/** Submissions from students who were not in the room when it was counted. */
export interface AttendanceDiscrepancy {
  confirmedCount: number;
  submittedCount: number;
  unaccounted: AttendanceStudentView[];
}

export interface AttendanceView {
  classId: string | null;
  className: string | null;
  /** 0 when the session has no class, or its class has no roster yet. */
  rosterSize: number;
  confirmedAt: string | null;
  confirmedCount: number | null;
  /** On the roster and here. */
  present: AttendanceStudentView[];
  /** On the roster and not here — the names to call out. */
  absent: AttendanceStudentView[];
  /** Here, but belonging to another class of the same course. */
  makeup: AttendanceStudentView[];
  /** Only computed once the session is finalized and a headcount exists. */
  discrepancy: AttendanceDiscrepancy | null;
}
